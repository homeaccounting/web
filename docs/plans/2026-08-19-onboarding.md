---
status: draft
date: 2026-08-19
---

# First-run Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a newly-registered user a soft, skippable first-run screen to confirm country, default currency, language, and base currency (driven by the country preset) before they land in the normal app view.

**Architecture:** A `useOnboardingStatus` hook composes `useConfiguration` + a new `useHasTransactions` probe + a per-user `sessionStorage` skip flag into `needsOnboarding = country == null && !hasAnyTransaction && !skipped`. An `OnboardingGate` wraps the `/` and `/transactions` landing routes and redirects to a new `/onboarding` page when the flag is set. The page reuses the tracker#47 selector hooks (`useSetCountry`, `useSetLanguage`, `useSetDefaultCurrency`, `useSetBaseCurrency`) and each control writes immediately on change. No backend change.

**Tech Stack:** React 18, TypeScript (strict), TanStack Query, react-router-dom v6, shadcn/ui, Vitest + Testing Library + MSW, Playwright.

**Spec:** `docs/specs/2026-08-19-onboarding-design.md`

**Conventions (read once):**

- Run `just check` (typecheck + lint + format-check) and `just test` before finishing.
- Tests live next to code. Render component/page tests via `renderWithProviders` from `@/test/utils`, wrapping in `<AuthProvider>` and signing in with `saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 })` (see `src/features/profile/useSetCountry.test.tsx` and `src/pages/RegisterPage.test.tsx` for the exact patterns).
- MSW server is `@/test/server`; default handlers in `src/test/handlers.ts`; fixtures in `src/test/fixtures.ts` (`configurationFixture` has `country: null`, `defaultCurrency: 'USD'`, `baseCurrency: 'USD'`, `baseCurrencyEditable: true`; `localizationOptionsFixture` has countries `['US','UA','DE']`, languages `['en','uk']`). The default `GET /api/transactions` handler returns **one** transaction — onboarding tests must override it to return an empty list.
- Import via the `@/` alias, never deep relative paths.

---

## File Structure

**New files**

- `src/features/transactions/useHasTransactions.ts` — cheap "any transaction?" probe (query `['transactions','any']`).
- `src/features/transactions/useHasTransactions.test.tsx`
- `src/features/onboarding/useOnboardingStatus.ts` — composes the gate signal + skip flag.
- `src/features/onboarding/useOnboardingStatus.test.tsx`
- `src/features/onboarding/OnboardingGate.tsx` — redirects landing routes when `needsOnboarding`.
- `src/features/onboarding/OnboardingGate.test.tsx`
- `src/features/onboarding/OnboardingForm.tsx` — the four selectors (country/default-currency/language/base-currency).
- `src/features/onboarding/OnboardingForm.test.tsx`
- `src/pages/OnboardingPage.tsx` — route shell (welcome + form + actions + "change later" note).
- `src/pages/OnboardingPage.test.tsx`
- `e2e/support/onboarding.ts` — `skipOnboarding(page)` Playwright helper.
- `e2e/onboarding.spec.ts` — new `@local` smoke spec.

**Modified files**

- `src/App.tsx` — register `/onboarding`; wrap `/` and `/transactions` in `<OnboardingGate>`.
- 25 existing `e2e/*.spec.ts` that register a fresh user — call `skipOnboarding(page)` after registration.
- `package.json` — version bump `0.12.0` → `0.13.0`.

---

## Task 1: `useHasTransactions` probe

**Files:**

- Create: `src/features/transactions/useHasTransactions.ts`
- Test: `src/features/transactions/useHasTransactions.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { makeQueryClient } from '@/test/utils';
import { transactionFixture } from '@/test/fixtures';
import { useHasTransactions } from './useHasTransactions';

function wrap() {
  saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
  const client = makeQueryClient();
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

describe('useHasTransactions', () => {
  it('is false when the account has no transactions', async () => {
    server.use(
      http.get('http://localhost:8080/api/transactions', () =>
        HttpResponse.json({ transactions: [], totalCount: 0, limit: 1, offset: 0 }),
      ),
    );
    const { result } = renderHook(() => useHasTransactions(), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(false);
  });

  it('is true when at least one transaction exists', async () => {
    server.use(
      http.get('http://localhost:8080/api/transactions', () =>
        HttpResponse.json({
          transactions: [transactionFixture],
          totalCount: 1,
          limit: 1,
          offset: 0,
        }),
      ),
    );
    const { result } = renderHook(() => useHasTransactions(), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/features/transactions/useHasTransactions.test.tsx`
Expected: FAIL — cannot resolve `./useHasTransactions`.

- [ ] **Step 3: Write minimal implementation**

```ts
import { useQuery } from '@tanstack/react-query';
import { ApiClient, baseUrl } from '@/api/client';
import { transactionsApi } from '@/api/transactions';
import { useAuth } from '@/auth/useAuth';

// Cheap "does this account have any transaction?" probe used by the onboarding
// gate (tracker#58). limit:1 keeps the payload minimal; omitting accountId lists
// across ALL the user's accounts (src/api/transactions.ts:47-64). The
// ['transactions','any'] key is deliberately distinct from the account-scoped
// transaction-list keys, so it is untouched by the useSetCountry refetch (which
// targets ['configuration'] + ['providers']) and by account-scoped invalidations.
export function useHasTransactions() {
  const { tokenRef, signOut, session } = useAuth();
  return useQuery({
    queryKey: ['transactions', 'any'],
    enabled: !!session,
    queryFn: async () => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      const res = await transactionsApi(client).list({ limit: 1 });
      return res.transactions.length > 0;
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/features/transactions/useHasTransactions.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/useHasTransactions.ts src/features/transactions/useHasTransactions.test.tsx
git commit -m "feat(onboarding): useHasTransactions probe for the first-run gate (tracker#58)"
```

---

## Task 2: `useOnboardingStatus` gate signal

**Files:**

- Create: `src/features/onboarding/useOnboardingStatus.ts`
- Test: `src/features/onboarding/useOnboardingStatus.test.tsx`

Signal: `needsOnboarding = !isPending && !skipped && config.country == null && hasAnyTransaction === false`. The skip flag lives in `sessionStorage` keyed by user id (survives sign-out/sign-in in the same tab because `signOut` only clears the localStorage session).

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { makeQueryClient } from '@/test/utils';
import { configurationFixture, transactionFixture } from '@/test/fixtures';
import { useOnboardingStatus } from './useOnboardingStatus';

const apiBase = 'http://localhost:8080';

function wrap() {
  saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
  const client = makeQueryClient();
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

function mockConfig(overrides: Record<string, unknown>) {
  server.use(
    http.get(`${apiBase}/api/users/me/configuration`, () =>
      HttpResponse.json({ ...configurationFixture, ...overrides }),
    ),
  );
}
function mockTransactions(rows: unknown[]) {
  server.use(
    http.get(`${apiBase}/api/transactions`, () =>
      HttpResponse.json({ transactions: rows, totalCount: rows.length, limit: 1, offset: 0 }),
    ),
  );
}

describe('useOnboardingStatus', () => {
  beforeEach(() => sessionStorage.clear());

  it('needs onboarding when country is null and there are no transactions', async () => {
    mockConfig({ country: null });
    mockTransactions([]);
    const { result } = renderHook(() => useOnboardingStatus(), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.needsOnboarding).toBe(true);
  });

  it('does NOT need onboarding when a country is already set', async () => {
    mockConfig({ country: 'US' });
    mockTransactions([]);
    const { result } = renderHook(() => useOnboardingStatus(), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.needsOnboarding).toBe(false);
  });

  it('does NOT need onboarding when transactions already exist (established user)', async () => {
    mockConfig({ country: null });
    mockTransactions([transactionFixture]);
    const { result } = renderHook(() => useOnboardingStatus(), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.needsOnboarding).toBe(false);
  });

  it('does NOT need onboarding while data is still loading', () => {
    mockConfig({ country: null });
    mockTransactions([]);
    const { result } = renderHook(() => useOnboardingStatus(), { wrapper: wrap() });
    // Synchronously, before queries resolve.
    expect(result.current.isPending).toBe(true);
    expect(result.current.needsOnboarding).toBe(false);
  });

  it('skip() suppresses the nudge for the session', async () => {
    mockConfig({ country: null });
    mockTransactions([]);
    const { result } = renderHook(() => useOnboardingStatus(), { wrapper: wrap() });
    await waitFor(() => expect(result.current.needsOnboarding).toBe(true));
    act(() => result.current.skip());
    await waitFor(() => expect(result.current.needsOnboarding).toBe(false));
    expect(sessionStorage.getItem('onboarding:skipped:u')).toBe('1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/features/onboarding/useOnboardingStatus.test.tsx`
Expected: FAIL — cannot resolve `./useOnboardingStatus`.

- [ ] **Step 3: Write minimal implementation**

```ts
import { useCallback, useState } from 'react';
import { useConfiguration } from '@/features/configuration/useConfiguration';
import { useHasTransactions } from '@/features/transactions/useHasTransactions';
import { useAuth } from '@/auth/useAuth';

const skipKey = (userId: string) => `onboarding:skipped:${userId}`;

// Composes the first-run gate signal (tracker#58). `needsOnboarding` is the
// semantic "brand-new AND unconfigured" test; the sessionStorage skip flag is a
// separate redirect-suppressor layered on top, so a skipped-but-still-empty
// account re-nudges only on a fresh browser session (a new tab / cleared
// sessionStorage), never a persistent localStorage flag or backend change.
export function useOnboardingStatus() {
  const { session } = useAuth();
  const config = useConfiguration();
  const hasTx = useHasTransactions();
  const userId = session?.userId ?? '';

  const [skipped, setSkipped] = useState(() =>
    userId ? sessionStorage.getItem(skipKey(userId)) === '1' : false,
  );
  const skip = useCallback(() => {
    if (userId) sessionStorage.setItem(skipKey(userId), '1');
    setSkipped(true);
  }, [userId]);

  const isPending = config.isPending || hasTx.isPending;
  const needsOnboarding =
    !isPending && !skipped && config.data?.country == null && hasTx.data === false;

  return { needsOnboarding, isPending, skip };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/features/onboarding/useOnboardingStatus.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/onboarding/useOnboardingStatus.ts src/features/onboarding/useOnboardingStatus.test.tsx
git commit -m "feat(onboarding): useOnboardingStatus gate signal + session skip flag (tracker#58)"
```

---

## Task 3: `OnboardingGate` redirect wrapper

**Files:**

- Create: `src/features/onboarding/OnboardingGate.tsx`
- Test: `src/features/onboarding/OnboardingGate.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { renderWithProviders } from '@/test/utils';
import { configurationFixture, transactionFixture } from '@/test/fixtures';
import { OnboardingGate } from './OnboardingGate';

const apiBase = 'http://localhost:8080';

function ui() {
  saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
  return (
    <AuthProvider>
      <Routes>
        <Route
          path="/"
          element={
            <OnboardingGate>
              <div>app home</div>
            </OnboardingGate>
          }
        />
        <Route path="/onboarding" element={<div>onboarding screen</div>} />
      </Routes>
    </AuthProvider>
  );
}

describe('OnboardingGate', () => {
  it('redirects a brand-new, unconfigured user to /onboarding', async () => {
    server.use(
      http.get(`${apiBase}/api/users/me/configuration`, () =>
        HttpResponse.json({ ...configurationFixture, country: null }),
      ),
      http.get(`${apiBase}/api/transactions`, () =>
        HttpResponse.json({ transactions: [], totalCount: 0, limit: 1, offset: 0 }),
      ),
    );
    renderWithProviders(ui(), { initialPath: '/' });
    expect(await screen.findByText('onboarding screen')).toBeInTheDocument();
  });

  it('renders the app for an established user', async () => {
    server.use(
      http.get(`${apiBase}/api/users/me/configuration`, () =>
        HttpResponse.json({ ...configurationFixture, country: null }),
      ),
      http.get(`${apiBase}/api/transactions`, () =>
        HttpResponse.json({
          transactions: [transactionFixture],
          totalCount: 1,
          limit: 1,
          offset: 0,
        }),
      ),
    );
    renderWithProviders(ui(), { initialPath: '/' });
    expect(await screen.findByText('app home')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('onboarding screen')).not.toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/features/onboarding/OnboardingGate.test.tsx`
Expected: FAIL — cannot resolve `./OnboardingGate`.

- [ ] **Step 3: Write minimal implementation**

```tsx
import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useOnboardingStatus } from './useOnboardingStatus';

// Wraps the app's landing-surface routes (/ and /transactions). While the gate
// signal is still loading, `needsOnboarding` is false, so children render their
// own loading affordance rather than flashing a redirect. Does NOT wrap
// /onboarding itself, so there is no redirect loop.
export function OnboardingGate({ children }: { children: ReactNode }) {
  const { needsOnboarding } = useOnboardingStatus();
  if (needsOnboarding) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/features/onboarding/OnboardingGate.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/onboarding/OnboardingGate.tsx src/features/onboarding/OnboardingGate.test.tsx
git commit -m "feat(onboarding): OnboardingGate landing-route redirect (tracker#58)"
```

---

## Task 4: `OnboardingForm` (the four selectors)

**Files:**

- Create: `src/features/onboarding/OnboardingForm.tsx`
- Test: `src/features/onboarding/OnboardingForm.test.tsx`

Reuses the tracker#47 hooks. Each control mutates immediately on change (like the country/language selects in `ProfileGeneralPane.LocalizationSection`). Base currency uses no confirmation dialog (empty account — nothing to re-base). `labels` come from `countryName`/`languageName` in `@/features/configuration/localizationLabels`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { makeQueryClient } from '@/test/utils';
import { configurationFixture } from '@/test/fixtures';
import { OnboardingForm } from './OnboardingForm';

vi.mock('@/lib/toast', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn() }) }));

const apiBase = 'http://localhost:8080';

function render() {
  saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
  const client = makeQueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
  return renderWithWrapper(<OnboardingForm />, wrapper);
}

// Local helper: renderWithProviders wires its own router+query; here we need our
// shared client, so render directly with the wrapper.
import { render as rtlRender } from '@testing-library/react';
function renderWithWrapper(
  ui: React.ReactElement,
  wrapper: React.ComponentType<{ children: React.ReactNode }>,
) {
  return rtlRender(ui, { wrapper });
}

describe('OnboardingForm', () => {
  it('persists the selected country (fires the preset cascade)', async () => {
    const user = userEvent.setup();
    let received: unknown = null;
    server.use(
      http.put(`${apiBase}/api/users/me/configuration/country`, async ({ request }) => {
        received = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    render();
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Country' })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('combobox', { name: 'Country' }));
    await user.click(await screen.findByRole('option', { name: 'United States' }));
    await waitFor(() => expect(received).toEqual({ country: 'US' }));
  });

  it('reflects a preset-shifted currency from the refetched config', async () => {
    render();
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Default currency' })).toHaveTextContent('USD'),
    );
    // Country change → backend applies preset → next config GET returns UAH.
    server.use(
      http.put(
        `${apiBase}/api/users/me/configuration/country`,
        () => new HttpResponse(null, { status: 204 }),
      ),
      http.get(`${apiBase}/api/users/me/configuration`, () =>
        HttpResponse.json({ ...configurationFixture, country: 'UA', defaultCurrency: 'UAH' }),
      ),
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Country' }));
    await user.click(await screen.findByRole('option', { name: 'Ukraine' }));
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Default currency' })).toHaveTextContent('UAH'),
    );
  });

  it('persists the base currency with no confirmation dialog', async () => {
    const user = userEvent.setup();
    let received: unknown = null;
    server.use(
      http.put(`${apiBase}/api/users/me/configuration/base-currency`, async ({ request }) => {
        received = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    render();
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Base currency' })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('combobox', { name: 'Base currency' }));
    await user.click(await screen.findByRole('option', { name: 'EUR' }));
    await waitFor(() => expect(received).toEqual({ currency: 'EUR' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
```

> Note: the default handlers already serve `GET /configuration` (`configurationFixture`) and `GET /localization-options` (`localizationOptionsFixture`), so unspecified requests resolve.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/features/onboarding/OnboardingForm.test.tsx`
Expected: FAIL — cannot resolve `./OnboardingForm`.

- [ ] **Step 3: Write minimal implementation**

```tsx
import { useConfiguration } from '@/features/configuration/useConfiguration';
import { useLocalizationOptions } from '@/features/configuration/useLocalizationOptions';
import { countryName, languageName } from '@/features/configuration/localizationLabels';
import { useSetCountry } from '@/features/profile/useSetCountry';
import { useSetLanguage } from '@/features/profile/useSetLanguage';
import { useSetDefaultCurrency } from '@/features/profile/useSetDefaultCurrency';
import { useSetBaseCurrency } from '@/features/profile/useSetBaseCurrency';
import { SUPPORTED_CURRENCIES, type SupportedCurrency } from '@/api/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/lib/toast';

// First-run setup controls (tracker#58). Country is the primary control: it
// fires the existing preset cascade (useSetCountry refetches config+providers
// and toasts what it adjusted), which shifts the currency/language selects below
// via the shared ['configuration'] cache. Each control writes immediately on
// change, so even a user who then hits "Skip" keeps the applied preset. Unlike
// the Settings surface, base currency has NO confirmation dialog — there is
// nothing to re-base on a brand-new, transaction-less account.
export function OnboardingForm() {
  const config = useConfiguration();
  const options = useLocalizationOptions();
  const setCountry = useSetCountry();
  const setLanguage = useSetLanguage();
  const setDefaultCurrency = useSetDefaultCurrency();
  const setBaseCurrency = useSetBaseCurrency();

  if (config.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }
  if (config.isError || !config.data) {
    return (
      <div className="space-y-2">
        <Alert variant="destructive" role="alert">
          <AlertDescription>Couldn&rsquo;t load configuration.</AlertDescription>
        </Alert>
        <Button variant="outline" size="sm" onClick={() => void config.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const c = config.data;
  const countries = options.data?.countries ?? [];
  const languages = options.data?.languages ?? [];

  return (
    <div className="space-y-5">
      <Field
        id="country"
        label="Country"
        help="Sets regional defaults such as currency and language."
      >
        <Select
          value={c.country ?? ''}
          onValueChange={(code) => setCountry.mutate({ country: code })}
        >
          <SelectTrigger id="country" aria-label="Country">
            <SelectValue placeholder="Select your country" />
          </SelectTrigger>
          <SelectContent>
            {countries.map((code) => (
              <SelectItem key={code} value={code}>
                {countryName(code)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field
        id="defaultCurrency"
        label="Default currency"
        help="Used when creating new accounts and transactions."
      >
        <Select
          value={c.defaultCurrency}
          onValueChange={(v) =>
            setDefaultCurrency.mutate(
              { currency: v as SupportedCurrency },
              {
                onSuccess: () => toast.success('Updated.'),
              },
            )
          }
        >
          <SelectTrigger id="defaultCurrency" aria-label="Default currency">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SUPPORTED_CURRENCIES.map((cur) => (
              <SelectItem key={cur} value={cur}>
                {cur}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field
        id="language"
        label="Language"
        help="The language used across the app and in notifications."
      >
        <Select value={c.language} onValueChange={(code) => setLanguage.mutate({ language: code })}>
          <SelectTrigger id="language" aria-label="Language">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {languages.map((code) => (
              <SelectItem key={code} value={code}>
                {languageName(code)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field
        id="baseCurrency"
        label="Base currency"
        help="Anchors your reporting across all accounts."
      >
        <Select
          disabled={!c.baseCurrencyEditable}
          value={c.baseCurrency}
          onValueChange={(v) =>
            setBaseCurrency.mutate(
              { currency: v as SupportedCurrency },
              {
                onSuccess: () => toast.success('Updated.'),
              },
            )
          }
        >
          <SelectTrigger id="baseCurrency" aria-label="Base currency">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SUPPORTED_CURRENCIES.map((cur) => (
              <SelectItem key={cur} value={cur}>
                {cur}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </div>
  );
}

function Field({
  id,
  label,
  help,
  children,
}: {
  id: string;
  label: string;
  help: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      <p className="text-sm text-muted-foreground">{help}</p>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/features/onboarding/OnboardingForm.test.tsx`
Expected: PASS (3 tests). If the "reflects preset-shifted currency" test flakes on cache timing, confirm `useSetCountry` refetches `['configuration']` (it does) and that the `Select` reads `c.defaultCurrency` directly (it re-renders when the query cache updates).

- [ ] **Step 5: Commit**

```bash
git add src/features/onboarding/OnboardingForm.tsx src/features/onboarding/OnboardingForm.test.tsx
git commit -m "feat(onboarding): OnboardingForm country/currency/language selectors (tracker#58)"
```

---

## Task 5: `OnboardingPage` route shell

**Files:**

- Create: `src/pages/OnboardingPage.tsx`
- Test: `src/pages/OnboardingPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { renderWithProviders } from '@/test/utils';
import { configurationFixture } from '@/test/fixtures';
import OnboardingPage from './OnboardingPage';

const apiBase = 'http://localhost:8080';

function ui() {
  saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
  return (
    <AuthProvider>
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/transactions" element={<div>transactions view</div>} />
      </Routes>
    </AuthProvider>
  );
}

describe('OnboardingPage', () => {
  beforeEach(() => {
    sessionStorage.clear();
    server.use(
      http.get(`${apiBase}/api/transactions`, () =>
        HttpResponse.json({ transactions: [], totalCount: 0, limit: 1, offset: 0 }),
      ),
      http.get(`${apiBase}/api/users/me/configuration`, () =>
        HttpResponse.json({ ...configurationFixture, country: null }),
      ),
    );
  });

  it('shows a welcome heading and the change-later reassurance', async () => {
    renderWithProviders(ui(), { initialPath: '/onboarding' });
    expect(await screen.findByRole('heading', { name: /set up the basics/i })).toBeInTheDocument();
    expect(screen.getByText(/change any of this later in settings/i)).toBeInTheDocument();
  });

  it('"Get started" navigates into the app', async () => {
    const user = userEvent.setup();
    renderWithProviders(ui(), { initialPath: '/onboarding' });
    await user.click(await screen.findByRole('button', { name: /get started/i }));
    await waitFor(() => expect(screen.getByText('transactions view')).toBeInTheDocument());
  });

  it('"Skip for now" sets the session flag and navigates into the app', async () => {
    const user = userEvent.setup();
    renderWithProviders(ui(), { initialPath: '/onboarding' });
    await user.click(await screen.findByRole('button', { name: /skip for now/i }));
    await waitFor(() => expect(screen.getByText('transactions view')).toBeInTheDocument());
    expect(sessionStorage.getItem('onboarding:skipped:u')).toBe('1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/pages/OnboardingPage.test.tsx`
Expected: FAIL — cannot resolve `./OnboardingPage`.

- [ ] **Step 3: Write minimal implementation**

```tsx
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BrandLogo } from '@/components/BrandLogo';
import { OnboardingForm } from '@/features/onboarding/OnboardingForm';
import { useOnboardingStatus } from '@/features/onboarding/useOnboardingStatus';

// First-run screen (tracker#58). Freely visitable — an already-configured user
// who lands here just sees their current values and can leave via Get started.
export default function OnboardingPage() {
  const navigate = useNavigate();
  const { skip } = useOnboardingStatus();

  const goToApp = () => navigate('/transactions', { replace: true });
  const onSkip = () => {
    skip();
    goToApp();
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="mb-6 flex flex-col items-center gap-2">
        <BrandLogo className="h-16" />
        <span className="text-xl font-semibold">Home Accounting</span>
      </div>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Let&rsquo;s set up the basics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Pick your country and we&rsquo;ll set sensible currency and language defaults. Adjust
            anything below.
          </p>
          <OnboardingForm />
          <p className="text-sm text-muted-foreground">
            You can change any of this later in Settings.
          </p>
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={onSkip}>
              Skip for now
            </Button>
            <Button onClick={goToApp}>Get started</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/pages/OnboardingPage.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pages/OnboardingPage.tsx src/pages/OnboardingPage.test.tsx
git commit -m "feat(onboarding): OnboardingPage first-run route shell (tracker#58)"
```

---

## Task 6: Wire routes into `App.tsx`

**Files:**

- Modify: `src/App.tsx`

- [ ] **Step 1: Add imports**

Add near the other page imports:

```tsx
import OnboardingPage from '@/pages/OnboardingPage';
import { OnboardingGate } from '@/features/onboarding/OnboardingGate';
```

- [ ] **Step 2: Wrap the landing routes and register `/onboarding`**

Replace the two landing routes:

```tsx
        <Route path="/" element={<HomePage />} />
        <Route path="/transactions" element={<HomePage />} />
```

with:

```tsx
        <Route
          path="/"
          element={
            <OnboardingGate>
              <HomePage />
            </OnboardingGate>
          }
        />
        <Route
          path="/transactions"
          element={
            <OnboardingGate>
              <HomePage />
            </OnboardingGate>
          }
        />
        <Route path="/onboarding" element={<OnboardingPage />} />
```

(`/onboarding` stays inside the `<ProtectedRoute>` element block, alongside the other protected routes, and is intentionally NOT wrapped in `OnboardingGate`.)

- [ ] **Step 3: Verify existing App routing test still passes**

Run: `pnpm exec vitest run src/App.test.tsx`
Expected: PASS. (The default `GET /api/transactions` handler returns one transaction, so `needsOnboarding` is false and the gate renders `HomePage` — the `/accounts → /transactions` redirect test is unaffected.)

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat(onboarding): gate landing routes + register /onboarding (tracker#58)"
```

---

## Task 7: E2E — skip helper, new onboarding spec, update fresh-user specs

The gate now redirects every freshly-registered user to `/onboarding`. Specs that register a fresh user and immediately expect the app must skip past it.

**Files:**

- Create: `e2e/support/onboarding.ts`
- Create: `e2e/onboarding.spec.ts`
- Modify: the 25 fresh-user specs listed below.

- [ ] **Step 1: Add the skip helper**

Create `e2e/support/onboarding.ts`:

```ts
import { type Page, expect } from '@playwright/test';

// After registering a fresh user, the app nudges them to /onboarding
// (tracker#58). Specs that aren't testing onboarding itself call this right
// after registration to reach the normal transactions view.
export async function skipOnboarding(page: Page) {
  const skip = page.getByRole('button', { name: /skip for now/i });
  await expect(skip).toBeVisible({ timeout: 20000 });
  await skip.click();
  await expect(page).toHaveURL(/\/transactions/);
}
```

- [ ] **Step 2: Write the new onboarding spec**

Create `e2e/onboarding.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

// First-run onboarding smoke (tracker#58). Runs against a real backend (@local).
test.describe('onboarding @local', () => {
  test('fresh user is nudged to onboarding; country preset then Get started enters the app', async ({
    page,
  }) => {
    test.setTimeout(120000);
    const email = `e2e-onb-${Date.now()}@example.com`;
    const password = 'longenough';

    await page.goto('register');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /^create account$/i }).click();

    // Redirected to the first-run screen.
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 20000 });
    await expect(page.getByRole('heading', { name: /set up the basics/i })).toBeVisible();

    // Pick a country → preset cascade fills currency/language.
    await page.getByRole('combobox', { name: 'Country' }).click();
    await page.getByRole('option', { name: 'United States' }).click();
    await expect(page.getByRole('combobox', { name: 'Country' })).toContainText('United States', {
      timeout: 20000,
    });

    // Enter the app.
    await page.getByRole('button', { name: /get started/i }).click();
    await expect(page).toHaveURL(/\/transactions/);

    // Country is now set → returning to the landing surface does not re-nudge.
    await page.goto('');
    await expect(page).toHaveURL(/\/transactions/);
    await expect(page.getByText(/no accounts yet/i)).toBeVisible();
  });

  test('Skip for now enters the app without setting a country', async ({ page }) => {
    test.setTimeout(120000);
    const email = `e2e-onb-skip-${Date.now()}@example.com`;
    const password = 'longenough';

    await page.goto('register');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /^create account$/i }).click();

    await expect(page).toHaveURL(/\/onboarding/, { timeout: 20000 });
    await page.getByRole('button', { name: /skip for now/i }).click();
    await expect(page).toHaveURL(/\/transactions/);
    await expect(page.getByText(/no accounts yet/i)).toBeVisible();

    // Same session: landing again does not re-nudge (session skip flag).
    await page.goto('');
    await expect(page).toHaveURL(/\/transactions/);
  });
});
```

- [ ] **Step 3: Run the new spec (optional, needs a local backend)**

Run: `pnpm exec playwright test e2e/onboarding.spec.ts --grep @local`
Expected: PASS (both tests). Skip if no local backend is available; note it in the commit.

- [ ] **Step 4: Update the 25 fresh-user specs**

For each spec below, add the import and insert `await skipOnboarding(page);` on the line **immediately after** the registration click (`getByRole('button', { name: /^create account$/i }).click()`), before the first assertion about the app view. In `smoke.spec.ts` insert it only after the _first_ registration (not after the re-login — the session skip flag persists, so no second nudge).

Import to add at the top of each file:

```ts
import { skipOnboarding } from './support/onboarding';
```

Insertion pattern (example, `smoke.spec.ts`):

```ts
await page.getByRole('button', { name: /^create account$/i }).click();
await skipOnboarding(page); // <-- inserted
await expect(page.getByText(/no accounts yet/i)).toBeVisible();
```

Specs to update:

```
adjust-balance.spec.ts
allocation-dedup-collapse.spec.ts
banking.spec.ts
bulk-contact.spec.ts
bulk-label-category.spec.ts
convert-transaction.spec.ts
country-language-provider.spec.ts
create-transaction.spec.ts
create-transaction-balance.spec.ts
create-transaction-multi-allocation.spec.ts
create-transaction-reimbursement.spec.ts
edit-transaction.spec.ts
filter-shared-category-name.spec.ts
live-data-change-signal.spec.ts
merge-transaction.spec.ts
profile.spec.ts
prompt-quick-add.spec.ts
provider-contact-map.spec.ts
refund-transaction.spec.ts
reports-grouping.spec.ts
smoke.spec.ts
sticky-transaction-date.spec.ts
transactions-account-scope.spec.ts
transactions-view-persistence.spec.ts
transfer-merge.spec.ts
```

> `country-language-provider.spec.ts` sets the country in Settings; adding `skipOnboarding` after registration is still correct (it reaches the app, then navigates to Profile as before).

- [ ] **Step 5: Sanity-check the edits compile**

Run: `pnpm exec tsc --noEmit`
Expected: no errors (Playwright specs are typechecked by the project `tsc` config if included; if they are not part of `tsc`, run `pnpm exec playwright test --list` instead to confirm the specs parse).

- [ ] **Step 6: Commit**

```bash
git add e2e/support/onboarding.ts e2e/onboarding.spec.ts e2e/*.spec.ts
git commit -m "test(onboarding): e2e skip helper + first-run spec + fresh-user spec updates (tracker#58)"
```

---

## Task 8: Version bump + full verification

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Bump the version**

Change `"version": "0.12.0"` to `"version": "0.13.0"` in `package.json`.

- [ ] **Step 2: Run the full check suite**

Run: `just check`
Expected: typecheck + lint + format-check all pass. If format-check fails, run `just format` and re-stage.

- [ ] **Step 3: Run the unit/component test suite**

Run: `just test`
Expected: all tests pass, including the new onboarding tests and the unchanged `src/App.test.tsx`.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore(onboarding): bump version to 0.13.0 (tracker#58)"
```

---

## Verification checklist (end of plan)

- [ ] `just check` clean.
- [ ] `just test` green.
- [ ] New unit/component tests cover: `useHasTransactions` (empty/non-empty), `useOnboardingStatus` (truth table + pending + skip), `OnboardingGate` (redirect vs render), `OnboardingForm` (country persists, preset-shifted currency reflected, base currency no dialog), `OnboardingPage` (heading + change-later note, Get started, Skip sets flag).
- [ ] `src/App.test.tsx` still passes unchanged (established-user path).
- [ ] E2E: `e2e/onboarding.spec.ts` added; all 25 fresh-user specs skip past onboarding.
- [ ] No backend contract change; DTOs untouched.
- [ ] Version bumped to 0.13.0.

## Manual verification (see the @verify skill)

Against a local backend + dev server (`just run`):

1. Register a brand-new user → you land on `/onboarding` (not the transactions view).
2. Pick a country → the default currency + language update to the preset (toast confirms).
3. "Get started" → transactions view; reload / navigate to `/` → no re-nudge.
4. Register another user → "Skip for now" → transactions view; reload → no re-nudge in the same session.
5. Existing user with data: sign in → straight to the app, never onboarding.
