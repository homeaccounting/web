# Web Localization Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the web client render in the user's chosen language (full `en` + `uk` catalogs) and format dates/numbers/currency for that language's locale, driven by the already-persisted server `language` signal.

**Architecture:** A global `i18next` + `react-i18next` runtime initialized once with statically-imported feature-namespaced catalogs and `en` fallback. A thin `<LanguageSync/>` component syncs i18next to the `useConfiguration().language` signal so the UI switches live with no reload. Formatting helpers become locale-parametrized; a `useFormat()` hook resolves the locale (`en`→`en-US`, `uk`→`uk-UA`) from the same signal. All app-authored strings are extracted namespace-by-namespace; each extraction task authors both `en` and `uk` so a catalog-completeness test stays green throughout.

**Tech Stack:** React 18, Vite, TypeScript, `react-query`, `react-hook-form`, `i18next` + `react-i18next` (new), `date-fns@4` (existing), Vitest + Testing Library + MSW, Playwright.

**Spec:** `docs/specs/2026-08-19-web-localization-runtime-design.md`

**Conventions (this repo):**
- Package manager: `pnpm`. Test: `pnpm test` (vitest, `run` mode). Type: `pnpm typecheck`. Lint: `pnpm lint`. Format: `pnpm format`. E2E: `pnpm e2e`.
- Run a single vitest file: `pnpm test -- src/path/to/file.test.ts` (or `pnpm exec vitest run src/path/to/file.test.ts`).
- Tests use MSW (`src/test/server.ts`), `renderWithProviders` / `makeQueryClient` (`src/test/utils.tsx`), and `saveSession` (`@/auth/storage`) for authed hooks. Timezone is pinned to UTC in `src/test/setup.ts`.
- Commit style: Conventional Commits, present-tense. Commit after every green step.

---

## File Structure

**New files:**
- `src/lib/i18n.ts` — i18next singleton init (resources, fallback, dev missing-key logging).
- `src/lib/locale.ts` — `localeForCountry(country)` map (country → BCP-47, or `undefined` for the international default).
- `src/lib/useFormat.ts` — hook returning locale-bound `formatMoney` / `formatDate` / `formatDateTime`.
- `src/features/i18n/LanguageSync.tsx` — syncs i18next to the config language signal.
- `src/locales/index.ts` — the `resources` registry + namespace list.
- `src/locales/en/*.json`, `src/locales/uk/*.json` — one file per namespace: `common`, `accounts`, `transactions`, `profile`, `banking`, `onboarding`, `reports`, `configuration`.
- `src/locales/completeness.test.ts` — asserts `uk` keyset ≡ `en` keyset per namespace.
- `src/test/i18n.tsx` — test helper: render children under a chosen language.
- `e2e/localization.spec.ts` — Playwright smoke: switch language, assert UI flips, no reload.

**Modified files:**
- `src/lib/format.ts` — functions gain an explicit `locale` parameter (raw, pure).
- `src/main.tsx` — import `./lib/i18n`; mount `<LanguageSync/>` inside `AuthProvider`.
- `src/features/accounts/labels.ts`, `src/features/transactions/labels.ts` — string maps become `t()`-lookups.
- `src/features/accounts/format.ts` — resolve locale via `useFormat` at the component boundary; extract the `'Account'` default literal.
- Every `.tsx` under `src/features/*`, `src/components/*`, `src/pages/*` with app-authored strings — replaced with `useTranslation(ns)` + `t()` / `<Trans>`.

---

## Extraction recipe (shared — referenced by Tasks 7–14)

Every per-namespace extraction task follows the same mechanical recipe. It is written once here; each task supplies its folder, namespace, and representative examples.

1. **Sweep** the feature folder for app-authored strings: JSX text nodes, `aria-label` / `placeholder` / `title` props, toast messages (`toast.success('…')`), zod/RHF validation messages, and default literals inside helpers.
   - Grep aid (advisory, not exhaustive): `rg -n "'[A-Z][a-z].*'|>[A-Z][a-z][^<>{]*<" src/features/<folder>`.
2. **Do NOT extract user-authored / open content**: dictionary names, categories, labels, contacts, transaction descriptions, account names/notes — anything the user typed — plus **open/unknown backend values** (raw MCC codes, arbitrary/forward-compat enum values not in the known set) and **brand/proper names** (Visa, PrivatBank, monobank). These render verbatim (usually as interpolation values or fallbacks).
   - **BUT closed-enum DISPLAY labels ARE chrome — translate them.** The human-readable label for a fixed, known enum (transaction kind/status/type, account subtype/role/card-network/asset-type, …) is app-authored UI text and MUST be localized (a uk user sees "Дохід", not "income"). Keep the raw/unknown value as the verbatim fallback (`defaultValue: rawValue`) so a new backend value still renders. Rule of thumb: translate the *label of a value from a closed set we ship*; leave verbatim the *value the user/an external system supplied*.
3. For each string, add a **semantic** key to `src/locales/en/<ns>.json` (e.g. `addIncome.title`, not the English text). Author the Ukrainian value in `src/locales/uk/<ns>.json` under the identical key. Use i18next interpolation (`"deleted": "Deleted {{name}}"`) and `<Trans>` where the string wraps JSX/markup.
4. In the component: `const { t } = useTranslation('<ns>');` then `t('key')`. For plurals use i18next plural keys (`key_one` / `key_few` / `key_many` / `key_other`) and `t('key', { count })`.
4a. **CRITICAL — resolve at CALL TIME, never at module load.** The app switches
   language LIVE at runtime (`LanguageSync` calls `i18n.changeLanguage` with no
   reload), and i18next initializes to `en` at startup. So **any `i18n.t(...)`
   evaluated at module-load — in a `const` initializer, a top-level object/array,
   or a schema built at import — captures `en` forever and shows English to `uk`
   users.** Rules:
   - Non-hook modules (label maps, group builders, enum→label helpers): expose a
     **function** that calls `i18n.t(...)` per invocation (e.g.
     `roleLabel(role) => i18n.t('ns:role.'+role, { defaultValue: role })`), NOT a
     pre-resolved `const MAP = { x: i18n.t(...) }`. The calling component
     re-renders on language change (it uses `useTranslation`), so call-time reads
     stay fresh.
   - **Zod/RHF validation messages:** store the i18n **KEY string** as the zod
     message (`.min(1, 'ns:validation.foo')`), and translate once at render in the
     shared `FormMessage` (`src/components/ui/form.tsx`), which does
     `const { t } = useTranslation(); const body = error ? t(String(error?.message ?? '')) : children;`.
     Do NOT bake `i18n.t(...)` into the schema at construction. (Unknown/plain
     messages fall back to themselves, so built-in zod messages pass through.)
   - After extraction, `rg -n "i18n\.t\(" src/features/<folder>` — every hit must
     be INSIDE a function body, never a module-level const initializer.
5. **Completion check for the task:**
   - `pnpm test -- src/locales/completeness.test.ts` passes (en/uk keysets match).
   - The feature's existing component tests still pass (they assert English text; `en` is the default/fallback so they keep passing — update any test that asserted a string now behind `<Trans>` markup only if the DOM text is unchanged, it should be).
   - Re-sweep: no app-authored literal strings remain in the folder's `.tsx`/helpers (spot-check with the grep aid).
6. `pnpm typecheck && pnpm lint` clean. Commit.

---

## Phase 1 — Runtime scaffolding (sequential; do in order)

### Task 1: Install deps + locale skeleton + i18n init

**Files:**
- Modify: `package.json` (deps)
- Create: `src/locales/en/common.json`, `src/locales/uk/common.json`
- Create: `src/locales/index.ts`
- Create: `src/lib/i18n.ts`
- Test: `src/lib/i18n.test.ts`

- [ ] **Step 1: Install libraries**

Run: `pnpm add i18next@^25 react-i18next@^15`
Expected: both added to `dependencies`; lockfile updated.

- [ ] **Step 2: Seed minimal `common` catalogs (en + uk)**

`src/locales/en/common.json`:
```json
{
  "save": "Save",
  "cancel": "Cancel",
  "ok": "OK",
  "delete": "Delete"
}
```
`src/locales/uk/common.json`:
```json
{
  "save": "Зберегти",
  "cancel": "Скасувати",
  "ok": "OK",
  "delete": "Видалити"
}
```

- [ ] **Step 3: Create the resources registry**

`src/locales/index.ts`:
```ts
import enCommon from './en/common.json';
import ukCommon from './uk/common.json';

export const DEFAULT_LANGUAGE = 'en';
export const SUPPORTED_LANGUAGES = ['en', 'uk'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

// One entry per namespace; extend as extraction tasks add namespaces.
export const resources = {
  en: { common: enCommon },
  uk: { common: ukCommon },
} as const;

export const NAMESPACES = ['common'] as const;
export const DEFAULT_NAMESPACE = 'common';
```

- [ ] **Step 4: Write the failing test**

`src/lib/i18n.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import i18n from './i18n';

describe('i18n runtime', () => {
  it('starts in English', () => {
    expect(i18n.language).toBe('en');
    expect(i18n.t('common:save')).toBe('Save');
  });

  it('falls back to English for a missing uk key', async () => {
    await i18n.changeLanguage('uk');
    // key that exists only in en (simulate by using a real uk key first)
    expect(i18n.t('common:save')).toBe('Зберегти');
    await i18n.changeLanguage('en');
  });

  it('falls back to English for an unknown language', async () => {
    await i18n.changeLanguage('zz');
    expect(i18n.t('common:save')).toBe('Save');
    await i18n.changeLanguage('en');
  });
});
```

- [ ] **Step 5: Run test — verify it fails**

Run: `pnpm test -- src/lib/i18n.test.ts`
Expected: FAIL — `./i18n` has no default export yet.

- [ ] **Step 6: Implement `src/lib/i18n.ts`**

```ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resources, DEFAULT_LANGUAGE, DEFAULT_NAMESPACE } from '@/locales';

// Global singleton. Both catalogs are statically imported (two languages — no
// lazy loading, so no loading flash). English is the fallback for any missing
// key or unbundled locale.
void i18n.use(initReactI18next).init({
  resources,
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  defaultNS: DEFAULT_NAMESPACE,
  ns: Object.keys(resources.en),
  returnEmptyString: false,
  interpolation: { escapeValue: false }, // React already escapes
  saveMissing: import.meta.env.DEV,
  missingKeyHandler: import.meta.env.DEV
    ? (_lng, ns, key) => console.warn(`[i18n] missing key: ${ns}:${key}`)
    : undefined,
});

export default i18n;
```

- [ ] **Step 7: Run test — verify it passes**

Run: `pnpm test -- src/lib/i18n.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 8: Typecheck, lint, commit**

Run: `pnpm typecheck && pnpm lint`
```bash
git add package.json pnpm-lock.yaml src/locales src/lib/i18n.ts src/lib/i18n.test.ts
git commit -m "feat(i18n): add react-i18next runtime + common catalog skeleton"
```

---

### Task 2: `localeForCountry` + locale-aware `format.ts` + `useFormat`

**Design (country-driven formatting):** `language` drives translation only;
**`country` drives regional formatting.** `localeForCountry(country)` returns a
BCP-47 string for the supported set, or **`undefined`** for null/unknown country.
`undefined` locale ⇒ the **international default** (ISO dates + neutral `1,234.50`
numbers = today's behavior), so users with no country see NO change and US
conventions appear only for `country === 'US'`.

**Files:**
- Create: `src/lib/locale.ts`
- Modify: `src/lib/format.ts`
- Create: `src/lib/useFormat.ts`
- Test: `src/lib/locale.test.ts`, `src/lib/format.test.ts` (modify), `src/lib/useFormat.test.tsx`

- [ ] **Step 1: Failing test for `localeForCountry`**

`src/lib/locale.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { localeForCountry } from './locale';

describe('localeForCountry', () => {
  it('maps US to en-US', () => expect(localeForCountry('US')).toBe('en-US'));
  it('maps UA to uk-UA', () => expect(localeForCountry('UA')).toBe('uk-UA'));
  it('maps DE to de-DE', () => expect(localeForCountry('DE')).toBe('de-DE'));
  it('returns undefined for an unmapped country', () =>
    expect(localeForCountry('ZZ')).toBeUndefined());
  it('returns undefined for null/undefined country', () => {
    expect(localeForCountry(null)).toBeUndefined();
    expect(localeForCountry(undefined)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — verify fail.** `pnpm test -- src/lib/locale.test.ts` → FAIL.

- [ ] **Step 3: Implement `src/lib/locale.ts`**

```ts
// Formatting locale is derived from the user's COUNTRY (language drives text
// only). A null/unknown country returns undefined → the international default
// (ISO dates + neutral number grouping), never a country's convention.
// Map covers the p13n foundation's supported country set (US, UA, euro-area);
// extend by one line as new countries are supported.
const LOCALE_BY_COUNTRY: Record<string, string> = {
  US: 'en-US',
  UA: 'uk-UA',
  AT: 'de-AT',
  BE: 'nl-BE',
  HR: 'hr-HR',
  CY: 'el-CY',
  EE: 'et-EE',
  FI: 'fi-FI',
  FR: 'fr-FR',
  DE: 'de-DE',
  GR: 'el-GR',
  IE: 'en-IE',
  IT: 'it-IT',
  LV: 'lv-LV',
  LT: 'lt-LT',
  LU: 'fr-LU',
  MT: 'mt-MT',
  NL: 'nl-NL',
  PT: 'pt-PT',
  SK: 'sk-SK',
  SI: 'sl-SI',
  ES: 'es-ES',
};

export function localeForCountry(country: string | null | undefined): string | undefined {
  if (!country) return undefined;
  return LOCALE_BY_COUNTRY[country];
}
```

- [ ] **Step 4: Run — verify pass.** `pnpm test -- src/lib/locale.test.ts` → PASS.

- [ ] **Step 5: Make `format.ts` locale-parametrized (update its test first)**

**Each format function gains an OPTIONAL `locale?` arg. `undefined` = the
international default (today's behavior); a locale string = `Intl` formatting.**
The existing 2-arg `formatMoney(12.5, 'USD')` calls keep working (locale
defaults to `undefined` → same output). Keep the existing default-behavior
assertions AND add locale-specific cases:
```ts
import { formatMoney, formatDate, formatDateTime } from './format';

it('international default (no locale) is unchanged behavior', () => {
  expect(formatDate('2026-04-27T00:00:00Z')).toBe('2026-04-27'); // ISO, as today
  expect(formatMoney(1234.5, 'USD')).toContain('1,234.50');       // neutral grouping
});

it('formats money for a given country locale', () => {
  expect(formatMoney(1234.5, 'USD', 'en-US')).toContain('1,234.50');
  // uk-UA groups with a (non-breaking) space and puts the symbol after
  expect(formatMoney(1234.5, 'USD', 'uk-UA')).toMatch(/1\s?234,50/);
});

it('formats dates for a given country locale', () => {
  expect(formatDate('2026-03-09T00:00:00Z', 'en-US')).toBe('3/9/2026');
  expect(formatDate('2026-03-09T00:00:00Z', 'uk-UA')).toBe('09.03.2026');
});

it('formats date-time in 24-hour form, locale-ordered', () => {
  // hourCycle h23 keeps the legacy 24-hour "sortable time" intent; only the
  // date ordering/separators follow the locale.
  expect(formatDateTime('2026-03-09T15:30:00Z', 'en-US')).toMatch(/03\/09\/2026.*15:30/);
  expect(formatDateTime('2026-03-09T15:30:00Z', 'uk-UA')).toMatch(/09\.03\.2026.*15:30/);
});
```
> Note: assert with `toMatch`/`toContain` on locale-formatted output rather than exact `===` where separators are non-breaking spaces (` `/` `). Adjust expected strings to whatever the ICU in the test env actually produces — capture actual output once, then pin it.

> **No change for existing / country-less users.** Because the default
> (`undefined` locale) reproduces today's ISO-date + neutral-number behavior
> exactly, users with no `country` see no difference. Regional formatting appears
> only once a country is set (`UA` → `27.04.2026`/`1 234,50`,
> `US` → `4/27/2026`/`1,234.50`, …). US conventions never appear as a default.
> `formatDateTime` keeps 24-hour time (`hourCycle: 'h23'`) under any locale.

- [ ] **Step 6: Run — verify fail.** `pnpm test -- src/lib/format.test.ts` → FAIL (locale-specific cases not yet supported; default-behavior cases already pass).

- [ ] **Step 7: Implement locale params in `src/lib/format.ts`**

```ts
// locale === undefined → international neutral default (unchanged behavior).
// Currency uses en-US as the neutral English grouping when no country locale.
export function formatMoney(amount: number, currency: string, locale?: string): string {
  return new Intl.NumberFormat(locale ?? 'en-US', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
  }).format(amount);
}

export function formatDate(isoTimestamp: string, locale?: string): string {
  // International default: ISO 8601 (unambiguous, sortable) — today's behavior.
  if (!locale) return isoTimestamp.slice(0, 10);
  return new Intl.DateTimeFormat(locale).format(new Date(isoTimestamp));
}

// Local 'date time' in the viewer's timezone (intentional — see history).
// hourCycle 'h23' keeps the legacy 24-hour "sortable/readable ordered time"
// intent across all locales.
export function formatDateTime(isoTimestamp: string, locale?: string): string {
  if (!locale) {
    // International default: today's `YYYY-MM-DD HH:MM` in the viewer's timezone.
    const d = new Date(isoTimestamp);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(isoTimestamp));
}
```
> `formatDateTime` stays in the viewer's timezone (no `timeZone` option = local). Tests pin `TZ=UTC` in setup, so expectations are deterministic.
> The `undefined`-locale branches are the *verbatim* current implementations — copy them from the existing `src/lib/format.ts` so behavior is byte-identical.

- [ ] **Step 8: Run — verify pass.** `pnpm test -- src/lib/format.test.ts` → PASS.

- [ ] **Step 9: Failing test for `useFormat`**

`src/lib/useFormat.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFormat } from './useFormat';

vi.mock('@/features/configuration/useConfiguration', () => ({
  useConfiguration: vi.fn(),
}));
import { useConfiguration } from '@/features/configuration/useConfiguration';

it('binds formatters to the config COUNTRY locale', () => {
  vi.mocked(useConfiguration).mockReturnValue({ data: { country: 'UA' } } as never);
  const { result } = renderHook(() => useFormat());
  expect(result.current.formatDate('2026-03-09T00:00:00Z')).toBe('09.03.2026');
});

it('uses US formatting only for country US', () => {
  vi.mocked(useConfiguration).mockReturnValue({ data: { country: 'US' } } as never);
  const { result } = renderHook(() => useFormat());
  expect(result.current.formatDate('2026-03-09T00:00:00Z')).toBe('3/9/2026');
});

it('uses the international default (ISO) when no country', () => {
  vi.mocked(useConfiguration).mockReturnValue({ data: { country: null } } as never);
  const { result } = renderHook(() => useFormat());
  expect(result.current.formatDate('2026-03-09T00:00:00Z')).toBe('2026-03-09');
});
```

- [ ] **Step 10: Run — verify fail.** → FAIL (no `useFormat`).

- [ ] **Step 11: Implement `src/lib/useFormat.ts`**

```ts
import { useMemo } from 'react';
import { useConfiguration } from '@/features/configuration/useConfiguration';
import { localeForCountry } from './locale';
import { formatMoney, formatDate, formatDateTime } from './format';

// Locale-bound formatters sourced from the user's COUNTRY signal. undefined
// locale (no/unknown country) → international default (unchanged behavior).
export function useFormat() {
  const { data } = useConfiguration();
  const locale = localeForCountry(data?.country);
  return useMemo(
    () => ({
      formatMoney: (amount: number, currency: string) =>
        formatMoney(amount, currency, locale),
      formatDate: (iso: string) => formatDate(iso, locale),
      formatDateTime: (iso: string) => formatDateTime(iso, locale),
    }),
    [locale],
  );
}
```

- [ ] **Step 12: Run — verify pass.** `pnpm test -- src/lib/useFormat.test.tsx` → PASS.

- [ ] **Step 13: Typecheck, lint, commit**

Run: `pnpm typecheck && pnpm lint`
> **No caller churn in this task.** Because `locale?` is optional and its
> `undefined` behavior is byte-identical to the old functions, **every existing
> 2-arg/1-arg call site still compiles and behaves exactly as before** (they get
> the international default). So `pnpm typecheck` and `pnpm test` stay green with
> no edits to existing callers. Wiring components/callers to `useFormat()` (so
> they pick up the country locale) happens in the per-namespace extraction tasks
> (Tasks 6/7 for `formatAccountBalance` and `transactions/schema.ts`), not here.
> Do NOT touch call sites in this task — keep it to the three `src/lib` files.
```bash
git add src/lib/locale.ts src/lib/locale.test.ts src/lib/format.ts src/lib/format.test.ts src/lib/useFormat.ts src/lib/useFormat.test.tsx
git commit -m "feat(i18n): country-driven locale-aware formatting via useFormat"
```

---

### Task 3: `<LanguageSync/>` + mount in `main.tsx`

**Files:**
- Create: `src/features/i18n/LanguageSync.tsx`
- Modify: `src/main.tsx`
- Test: `src/features/i18n/LanguageSync.test.tsx`

- [ ] **Step 1: Failing test**

`src/features/i18n/LanguageSync.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import i18n from '@/lib/i18n';
import { LanguageSync } from './LanguageSync';

vi.mock('@/features/configuration/useConfiguration', () => ({
  useConfiguration: vi.fn(),
}));
import { useConfiguration } from '@/features/configuration/useConfiguration';

it('switches i18next to the config language', async () => {
  vi.mocked(useConfiguration).mockReturnValue({ data: { language: 'uk' } } as never);
  render(<LanguageSync />);
  await waitFor(() => expect(i18n.language).toBe('uk'));
  await i18n.changeLanguage('en');
});

it('stays on en when no config (signed out)', async () => {
  await i18n.changeLanguage('en');
  vi.mocked(useConfiguration).mockReturnValue({ data: undefined } as never);
  render(<LanguageSync />);
  await waitFor(() => expect(i18n.language).toBe('en'));
});
```

- [ ] **Step 2: Run — verify fail.** → FAIL.

- [ ] **Step 3: Implement `src/features/i18n/LanguageSync.tsx`**

```tsx
import { useEffect } from 'react';
import i18n from '@/lib/i18n';
import { useConfiguration } from '@/features/configuration/useConfiguration';

// Renders nothing. Syncs the i18next language to the server-persisted signal so
// the UI switches live (the whole tree consumes useTranslation and re-renders).
export function LanguageSync() {
  const { data } = useConfiguration();
  const language = data?.language;
  useEffect(() => {
    if (language && i18n.language !== language) {
      void i18n.changeLanguage(language);
    }
  }, [language]);
  return null;
}
```

- [ ] **Step 4: Run — verify pass.** → PASS.

- [ ] **Step 5: Wire into `src/main.tsx`**

Add `import './lib/i18n';` (side-effect init, near the top with other side-effect imports) and mount `<LanguageSync />` inside `<AuthProvider>`, above `<App />`:
```tsx
import './lib/i18n';
// ...
<AuthProvider>
  <LanguageSync />
  <App />
  <Toaster />
</AuthProvider>
```
(Add `import { LanguageSync } from '@/features/i18n/LanguageSync';`.)

- [ ] **Step 6: Verify app boots.** Run: `pnpm typecheck && pnpm lint`. Expected: clean (if formatter callers were migrated in Task 2).

- [ ] **Step 7: Commit**
```bash
git add src/features/i18n/LanguageSync.tsx src/features/i18n/LanguageSync.test.tsx src/main.tsx
git commit -m "feat(i18n): live language sync from configuration signal"
```

---

### Task 4: i18n test helper + catalog-completeness guard

**Files:**
- Create: `src/test/i18n.tsx`
- Create: `src/locales/completeness.test.ts`

- [ ] **Step 1: Implement the test helper `src/test/i18n.tsx`**

```tsx
import { type ReactElement, type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/lib/i18n';
import { renderWithProviders } from './utils';

// Render under a specific UI language. Defaults to 'en'. Composes with the
// standard providers helper.
export function renderWithLanguage(
  ui: ReactElement,
  language: 'en' | 'uk' = 'en',
  options?: Parameters<typeof renderWithProviders>[1],
) {
  void i18n.changeLanguage(language);
  const wrapped: ReactNode = <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>;
  return renderWithProviders(wrapped as ReactElement, options);
}
```
> Reset to `en` in an `afterEach` where a test switches language, to avoid cross-test leakage (the repo's `setup.ts` already cleans up per test; add a local `afterEach(() => { void i18n.changeLanguage('en'); })` in language-specific specs).

- [ ] **Step 2: Write the completeness test `src/locales/completeness.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { resources } from './index';

// Flatten nested keys to dotted paths for a precise set comparison.
function keyPaths(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object'
      ? keyPaths(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );
}

describe('catalog completeness', () => {
  const namespaces = Object.keys(resources.en) as (keyof typeof resources.en)[];

  it.each(namespaces)('uk namespace "%s" has the same keys as en', (ns) => {
    const en = new Set(keyPaths(resources.en[ns] as Record<string, unknown>));
    const uk = new Set(keyPaths((resources.uk as Record<string, unknown>)[ns] as Record<string, unknown>));
    const missingInUk = [...en].filter((k) => !uk.has(k));
    const extraInUk = [...uk].filter((k) => !en.has(k));
    expect({ missingInUk, extraInUk }).toEqual({ missingInUk: [], extraInUk: [] });
  });

  it('uk defines every namespace en does', () => {
    expect(Object.keys(resources.uk).sort()).toEqual(Object.keys(resources.en).sort());
  });
});
```
> Ignores i18next plural-suffix asymmetry only if a key exists in one plural form in en and different forms in uk. If that surfaces, normalize by stripping `_one|_few|_many|_other|_two|_zero` suffixes before comparison. Add that normalization only if a real plural key trips it.

- [ ] **Step 3: Run — verify pass (green with just `common`).**

Run: `pnpm test -- src/locales/completeness.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add src/test/i18n.tsx src/locales/completeness.test.ts
git commit -m "test(i18n): catalog-completeness guard + language render helper"
```

---

## Phase 2 — String extraction (one task per namespace)

Each task below applies the **Extraction recipe** above to one feature area, adding its namespace to `src/locales/index.ts` (`resources.en`/`resources.uk` + it appears via `Object.keys(resources.en)`). Tasks are largely independent and may be parallelized across subagents, but each must (a) leave the completeness test green and (b) not touch `src/locales/index.ts` concurrently with another task — if parallelizing, serialize the `index.ts` edits or give each task its own import block and merge.

For every task: register the namespace, extract per the recipe, author `en` + `uk`, run `pnpm test`, `pnpm typecheck`, `pnpm lint`, commit `feat(i18n): localize <area>`.

### Task 5: `common` namespace + shared UI components

**Folders:** `src/components/**` (shared buttons, dialogs, empty states, error boundaries, toasts, `src/components/ui` wrappers that carry app text).
**Representative keys:** `common:save`, `common:cancel`, `common:ok`, `common:delete`, `common:confirm`, `common:loading`, `common:error.generic`, `common:retry`, nav labels used app-wide.
Also migrate any remaining direct `formatMoney`/date callers in shared components to `useFormat`.

### Task 6: `accounts` namespace

**Folders:** `src/features/accounts/**`.
**Special:** convert `src/features/accounts/labels.ts` maps (`ACCOUNT_SUBTYPE_LABELS`, `CARD_NETWORK_LABELS`, `ASSET_TYPE_LABELS`) into `t()`-lookups keyed by enum value — e.g. in `format.ts`, `t('accounts:subtype.' + type)` with the existing raw-value fallback preserved (`?? account.subtype.type`). Extract the `'Account'` default in `formatAccountSubtypeLabel` to `accounts:subtype.unknown`. Move `formatAccountBalance`'s locale to the component boundary via `useFormat` (callers use the hook; keep the raw function for any non-React caller).
**Keys:** `accounts:subtype.cash|bankAccount|eWallet|asset|loan`, `accounts:cardNetwork.visa|mastercard|amex`, `accounts:assetType.property|vehicle|stocks|retirementFund`, plus dialog/label strings.

### Task 7: `transactions` namespace

**Folders:** `src/features/transactions/**`.
**Special:** convert `src/features/transactions/labels.ts` `TRANSACTION_KIND_LABELS` into `t()`-lookups keyed by kind (`t('transactions:kind.' + kind + '.title')`, etc.). Preserve the exact set of sub-labels (`title`, `submit`, `aria`, `editTitle`, `editSubmit`, `copyTitle`, `convertTitle`).
**Watch for plurals:** counts like "N transactions selected" → use `transactions:selected_one/_few/_many/_other` with `{ count }` and author all `uk` plural forms.
**Note on `transactions/schema.ts` money:** this is a pure zod module — it CANNOT call `useFormat()`. Its interpolated money in validation messages intentionally stays on the international default (`formatMoney(x, currency)` with no locale) — behaviorally fine, no regression. This task only extracts the message *strings* into the catalog (per the recipe's "zod/RHF validation messages"); do not try to hook-ify the module.

### Task 8: `profile` namespace

**Folders:** `src/features/profile/**`, `src/pages/ProfilePage.tsx`. Includes the language/country selectors' own labels (but NOT the language/country display *names* — those already live in `configuration/localizationLabels.ts`; decide in this task whether those human-readable country/language names move into the `configuration` catalog or stay as-is. Recommendation: leave `localizationLabels.ts` as-is for now — they are option display names, not chrome, and are already centralized; note the decision in the commit).

### Task 9: `banking` namespace

**Folders:** `src/features/banking/**`. Import dialogs, provider connection UI, statement-format helper user-facing strings (`statementFormat.ts` — extract only app chrome, not parsed bank data).

### Task 10: `onboarding` namespace

**Folders:** `src/features/onboarding/**`, `src/pages/OnboardingPage.tsx`.

### Task 11: `configuration` namespace

**Folders:** `src/features/configuration/**` app chrome (dictionary editor labels, defaults form, connection management). Not the dictionary *entry* names (user content).

### Task 12: `reports` namespace

**Folders:** `src/features/reports/**`, `src/pages/ReportsPage.tsx`.

### Task 13: Pages + remaining strays

**Folders:** `src/pages/**` not covered above (`HomePage`, `LoginPage`, `RegisterPage`, `NotFoundPage`, `OAuthCallbackPage`), and any remaining strays surfaced by a full-repo sweep.
**Known deferred stray (from Task 5):** `PERIOD_PRESET_LABELS` in `src/lib/period.ts` ("This month", "Last year", …) — user-visible chrome rendered by `PeriodSelector` but defined in a non-component `src/lib` module. Extract these into the `common` (or `reports`) namespace here and make `PeriodSelector` resolve them via `t()`.
**Completion sweep:** `rg -n ">[A-Z][a-z][^<>{}]*<|aria-label=\"[A-Z]|placeholder=\"[A-Z]|toast\.[a-z]+\('[A-Z]" src/features src/components src/pages` returns only intentional non-strings (e.g. brand name, `OK`). Document any deliberate exceptions.

---

## Phase 3 — Verification & e2e

### Task 14: Playwright language-switch smoke

**Files:**
- Create: `e2e/localization.spec.ts`

- [ ] **Step 1: Write the smoke test**

Model it on an existing spec in `e2e/`. Flow: sign in (reuse existing e2e auth helper), open Settings/Profile, switch language to Ukrainian, assert a stable visible nav/label string renders in Ukrainian (e.g. the transactions nav item), switch back to English, assert it reverts — all **without a page reload** (assert the URL/route is unchanged and no full navigation occurred).

- [ ] **Step 2: Run.** `pnpm e2e -- localization` (or the repo's e2e invocation). Expected: PASS.
> If the e2e harness runs against a live backend (per repo convention), ensure a test user with switchable language exists; follow the existing e2e setup.

- [ ] **Step 3: Commit.** `git commit -m "test(e2e): language switch smoke"`

### Task 15: Full-suite verification + final sweep

- [ ] **Step 1:** `pnpm typecheck` → clean.
- [ ] **Step 2:** `pnpm lint` → clean.
- [ ] **Step 3:** `pnpm test` → all green (incl. completeness test across all namespaces).
- [ ] **Step 4:** `pnpm build` → succeeds (bundle includes both catalogs).
- [ ] **Step 5:** Manual: run `pnpm dev`, switch language in settings, confirm live switch (no reload), confirm `uk` dates render `дд.мм.рррр` and money grouping matches `uk-UA`, confirm user-authored content (a category/description) is unchanged by the switch.
- [ ] **Step 6:** Final commit if any fixes: `git commit -m "chore(i18n): final verification fixes"`.

---

## Notes for the implementer

- **English is the source of truth for keys.** Add `en` first, then the identical key in `uk`. The completeness test fails fast if you forget one.
- **Never route user-authored content through `t()`** (dictionary names, categories, labels, contacts, transaction descriptions, account names/notes). When unsure whether a string is chrome or content: if the user could have typed it, it's content — leave it.
- **Live switch, no reload** is a hard requirement (past bugs came from stale RHF `defaultValues`/server-computed fields). Prefer reactive reads (`useTranslation`, `useFormat`) over values captured once at mount.
- **Commit after every green step.** Keep the tree green — the completeness test and `en` fallback mean a half-extracted namespace never breaks the running app.
