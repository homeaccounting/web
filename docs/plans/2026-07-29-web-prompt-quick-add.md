# Web natural-language prompt ("Quick add") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an always-on natural-language "Quick add" composer at the bottom of the Transactions pane that posts free text to `POST /api/prompt` and records 1..N transactions against the open account.

**Architecture:** A per-resource API module (`prompt.ts`) + DTOs mirroring the backend, a TanStack Query mutation hook (`usePrompt`) that invalidates the transactions/accounts caches, and a presentational component (`QuickAddPrompt`) that owns the input + feedback state. Feedback reuses the house patterns: `toast.success` for a clean success, and a persistent `<Alert variant="destructive">` (same `ApiError`-message derivation as the create/edit dialogs) for partial/failure/error. Failed text is retained only when re-submitting is safe (total failure & errors), cleared on partial success to avoid the backend's no-dedup duplicate footgun.

**Tech Stack:** React 18 + TypeScript, TanStack Query, shadcn/ui (`Alert`, `Input`, `Button`), `sonner` toast (`@/lib/toast`), Vitest + Testing Library + MSW.

**Spec:** `docs/specs/2026-07-29-web-prompt-quick-add-design.md`

---

## File Structure

- **Create** `src/api/prompt.ts` — `promptApi(client).submit(body)` → `POST /api/prompt`.
- **Modify** `src/api/types.ts` — add `PromptRequest`, `PromptFailure`, `PromptResponse` DTOs.
- **Create** `src/api/prompt.test.ts` — API-module test (MSW).
- **Create** `src/features/transactions/usePrompt.ts` — mutation hook + cache invalidation.
- **Create** `src/features/transactions/usePrompt.test.tsx` — hook test (invalidation rules).
- **Create** `src/features/transactions/QuickAddPrompt.tsx` — the composer + feedback UI.
- **Create** `src/features/transactions/QuickAddPrompt.test.tsx` — state-machine tests.
- **Modify** `src/test/handlers.ts` — default MSW handler for `POST /api/prompt`.
- **Modify** `src/features/transactions/TransactionsPane.tsx` — render `<QuickAddPrompt>` (sticky bottom) when an account is open.
- **Modify** `src/features/transactions/TransactionsPane.test.tsx` — assert the composer renders for an open account.

Conventions to follow (verified against the repo):

- API modules: factory `export const xApi = (client) => ({ ... })` (see `src/api/transactions.ts`).
- Hooks: build `new ApiClient({ baseUrl, getToken: () => tokenRef.current, onUnauthorized: signOut })` inside `mutationFn` (see `src/features/transactions/useCreateExpense.ts`).
- Error copy: `error instanceof ApiError ? error.message : 'Something went wrong. Please try again.'` (see `src/features/transactions/CreateExpenseDialog.tsx:85-88`).
- Toast seam for tests: `vi.mock('@/lib/toast', ...)` (see `TransactionsPane.bulk.test.tsx:16-26`).
- Component tests: `renderWithProviders(<AuthProvider>…</AuthProvider>, { initialPath })` + `saveSession(...)` in `beforeEach` (see `CreateExpenseDialog.test.tsx`).

---

## Task 1: API DTOs + `prompt.ts` module + default MSW handler

**Files:**

- Modify: `src/api/types.ts` (append near the other transaction DTOs)
- Create: `src/api/prompt.ts`
- Create: `src/api/prompt.test.ts`
- Modify: `src/test/handlers.ts`

- [ ] **Step 1: Write the failing API-module test**

Create `src/api/prompt.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { ApiClient } from './client';
import { promptApi } from './prompt';

const apiBase = 'http://localhost:8080';
const client = new ApiClient({ baseUrl: apiBase, getToken: () => 't', onUnauthorized: () => {} });
const api = promptApi(client);

describe('promptApi', () => {
  it('POSTs text + account to /api/prompt and returns the kind-tagged envelope', async () => {
    let body: unknown;
    server.use(
      http.post(`${apiBase}/api/prompt`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ kind: 'transactions', succeeded: [], failed: [] });
      }),
    );
    const res = await api.submit({ text: 'coffee 4.50', account: 'a1' });
    expect(body).toEqual({ text: 'coffee 4.50', account: 'a1' });
    expect(res.kind).toBe('transactions');
    expect(res.succeeded).toEqual([]);
    expect(res.failed).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm exec vitest run src/api/prompt.test.ts`
Expected: FAIL — cannot resolve `./prompt`.

- [ ] **Step 3: Add the DTOs to `src/api/types.ts`**

Append (near the other transaction request/response types):

```ts
// Prompt (natural-language) DTOs — mirror server-infra/src/Web/API/PromptAPI.hs.
// PromptRequest { text :: Text, account :: Maybe AccountId }.
export interface PromptRequest {
  text: string;
  account?: UUID;
}

// One failed transaction in the response envelope: { index, reason }.
// `index` is the zero-based position in the parsed list.
export interface PromptFailure {
  index: number;
  reason: string;
}

// Kind-tagged success envelope from POST /api/prompt. Named `PromptResponse` to
// mirror the backend wire type (the backend's internal `PromptResult` domain
// type is a different thing). `succeeded` are full transactions; `failed` are
// commit-good/report-bad entries.
export interface PromptResponse {
  kind: 'transactions';
  succeeded: TransactionResponse[];
  failed: PromptFailure[];
}
```

- [ ] **Step 4: Create `src/api/prompt.ts`**

```ts
import type { ApiClient } from './client';
import type { PromptRequest, PromptResponse } from './types';

// POST /api/prompt — interpret a natural-language prompt and record 1..N
// transactions against the given account. See server-infra/src/Web/API/PromptAPI.hs.
export const promptApi = (client: ApiClient) => ({
  submit: (body: PromptRequest): Promise<PromptResponse> =>
    client.post<PromptResponse>('/api/prompt', body),
});
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `pnpm exec vitest run src/api/prompt.test.ts`
Expected: PASS.

- [ ] **Step 6: Add the default MSW handler**

In `src/test/handlers.ts`, add inside the `handlers` array (e.g. after the transactions handlers, before configuration). `transactionFixture` is already imported in that file:

```ts
  http.post(`${apiBase}/api/prompt`, () =>
    HttpResponse.json({ kind: 'transactions', succeeded: [transactionFixture], failed: [] }),
  ),
```

- [ ] **Step 7: Typecheck + lint, then run the full API test file**

Run: `pnpm exec tsc --noEmit && pnpm exec eslint src/api/prompt.ts src/api/prompt.test.ts src/api/types.ts src/test/handlers.ts`
Then: `pnpm exec vitest run src/api/prompt.test.ts`
Expected: no type/lint errors; test PASS.

- [ ] **Step 8: Commit**

```bash
git add src/api/prompt.ts src/api/prompt.test.ts src/api/types.ts src/test/handlers.ts
git commit -m "feat(transactions): add prompt API client + DTOs"
```

---

## Task 2: `usePrompt` mutation hook

**Files:**

- Create: `src/features/transactions/usePrompt.ts`
- Create: `src/features/transactions/usePrompt.test.tsx`

- [ ] **Step 1: Write the failing hook test**

Create `src/features/transactions/usePrompt.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { AuthContext } from '@/auth/AuthContext';
import { usePrompt } from './usePrompt';

const apiBase = 'http://localhost:8080';

function makeWrapper(client: QueryClient) {
  const ctx = {
    tokenRef: { current: 't' },
    session: { userId: 'u', email: 'a@b' } as never,
    signIn: vi.fn(),
    signOut: vi.fn(),
  } as never;
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <AuthContext.Provider value={ctx}>{children}</AuthContext.Provider>
      </QueryClientProvider>
    );
  };
}

describe('usePrompt', () => {
  it('invalidates transactions + accounts when something succeeded', async () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    server.use(
      http.post(`${apiBase}/api/prompt`, () =>
        HttpResponse.json({ kind: 'transactions', succeeded: [{ id: 'tx' }], failed: [] }),
      ),
    );
    const { result } = renderHook(() => usePrompt(), { wrapper: makeWrapper(client) });
    await result.current.mutateAsync({ text: 'coffee 4.50', account: 'a1' });
    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith({ queryKey: ['transactions', 'a1'] });
      expect(spy).toHaveBeenCalledWith({ queryKey: ['accounts'] });
    });
  });

  it('does not invalidate when nothing succeeded (total failure)', async () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    server.use(
      http.post(`${apiBase}/api/prompt`, () =>
        HttpResponse.json({
          kind: 'transactions',
          succeeded: [],
          failed: [{ index: 0, reason: 'nope' }],
        }),
      ),
    );
    const { result } = renderHook(() => usePrompt(), { wrapper: makeWrapper(client) });
    await result.current.mutateAsync({ text: 'nonsense', account: 'a1' });
    expect(spy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm exec vitest run src/features/transactions/usePrompt.test.tsx`
Expected: FAIL — cannot resolve `./usePrompt`.

- [ ] **Step 3: Implement the hook**

Create `src/features/transactions/usePrompt.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClient, baseUrl } from '@/api/client';
import { promptApi } from '@/api/prompt';
import type { PromptRequest, PromptResponse } from '@/api/types';
import { useAuth } from '@/auth/useAuth';

// Mirrors useCreateExpense's construction. Invalidates the open account's
// transaction window + the accounts list (balances change) whenever at least
// one transaction was recorded — partial successes return 200 too, so this
// covers them; a total failure invalidates nothing.
export function usePrompt() {
  const { tokenRef, signOut } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<PromptResponse, Error, PromptRequest>({
    mutationFn: (body) => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return promptApi(client).submit(body);
    },
    onSuccess: (data, body) => {
      if (data.succeeded.length > 0) {
        void queryClient.invalidateQueries({ queryKey: ['transactions', body.account] });
        void queryClient.invalidateQueries({ queryKey: ['accounts'] });
      }
    },
  });
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm exec vitest run src/features/transactions/usePrompt.test.tsx`
Expected: PASS (both cases).

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm exec tsc --noEmit && pnpm exec eslint src/features/transactions/usePrompt.ts src/features/transactions/usePrompt.test.tsx`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/features/transactions/usePrompt.ts src/features/transactions/usePrompt.test.tsx
git commit -m "feat(transactions): add usePrompt mutation hook"
```

---

## Task 3: `QuickAddPrompt` component

**Files:**

- Create: `src/features/transactions/QuickAddPrompt.tsx`
- Create: `src/features/transactions/QuickAddPrompt.test.tsx`

This task builds the component behind its full test suite. Write the component first (Step 1), then add the test file (Step 2) covering the whole state-machine, then iterate to green. (The component is small and cohesive; splitting its states across separate red/green commits would fragment one UI unit.)

- [ ] **Step 1: Implement the component**

Create `src/features/transactions/QuickAddPrompt.tsx`:

```tsx
import { useRef, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/api/client';
import { toast } from '@/lib/toast';
import type { PromptFailure, UUID } from '@/api/types';
import { usePrompt } from './usePrompt';

export interface QuickAddPromptProps {
  accountId: UUID;
  accountName?: string;
}

// Content of the destructive alert after a submit that produced something to
// fix. `null` means no alert. `failures` is empty for a plain API error
// (message only) and non-empty for per-transaction report-bad outcomes.
interface AlertState {
  title?: string;
  message?: string;
  failures: PromptFailure[];
}

// Map a thrown error to fixed copy by HTTP status, matching the backend's
// 503 (disabled) / 502 (upstream) mapping in Web/API/PromptAPI.hs. 400 shows the
// domain message; anything else (500, other statuses, network reject, unknown)
// falls through to the shared generic copy used by the create/edit dialogs.
// NOTE: 400 must be special-cased explicitly — do NOT `return error.message` for
// all remaining statuses, or a 500 would leak its raw message instead of the
// generic copy (and fail the "unexpected status" test).
function errorAlert(error: unknown): AlertState {
  if (error instanceof ApiError) {
    if (error.status === 503) return { message: 'Quick add is unavailable right now.', failures: [] };
    if (error.status === 502)
      return { message: 'Couldn’t process that — please try again or rephrase.', failures: [] };
    if (error.status === 400) return { message: error.message, failures: [] };
  }
  return { message: 'Something went wrong. Please try again.', failures: [] };
}

export function QuickAddPrompt({ accountId, accountName }: QuickAddPromptProps) {
  const [text, setText] = useState('');
  const [alert, setAlert] = useState<AlertState | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prompt = usePrompt();

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed || prompt.isPending) return;
    setAlert(null);
    try {
      const res = await prompt.mutateAsync({ text: trimmed, account: accountId });
      const okCount = res.succeeded.length;
      const failCount = res.failed.length;
      const okMsg = `Added ${okCount} transaction${okCount === 1 ? '' : 's'}.`;
      if (failCount === 0) {
        // Full success: toast, clear, refocus.
        toast.success(okMsg);
        setText('');
        inputRef.current?.focus();
      } else if (okCount > 0) {
        // Partial: toast the good part, clear the box (no-dedup safety), alert the rest.
        toast.success(okMsg);
        setText('');
        setAlert({
          title: `Couldn’t record ${failCount} of ${okCount + failCount}`,
          failures: res.failed,
        });
      } else {
        // Total failure: keep the text editable, alert the reasons.
        setAlert({ title: 'Couldn’t record that', failures: res.failed });
      }
    } catch (e) {
      // Errors keep the text so the user can adjust and retry.
      setAlert(errorAlert(e));
    }
  };

  return (
    <div className="sticky bottom-0 border-t bg-background">
      {alert && (
        {/* `Alert` already sets role="alert" internally, so we don't repeat it. */}
        <Alert
          variant="destructive"
          className="relative rounded-none border-x-0 border-b-0 pr-10"
        >
          <button
            type="button"
            aria-label="Dismiss"
            className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
            onClick={() => setAlert(null)}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
          {alert.title && <AlertTitle>{alert.title}</AlertTitle>}
          <AlertDescription>
            {alert.message}
            {alert.failures.length > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {alert.failures.map((f) => (
                  <li key={f.index}>
                    Item {f.index + 1} — {f.reason}
                  </li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      )}
      <form
        className="flex items-center gap-2 px-3 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <Input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={prompt.isPending}
          aria-label="Quick add transaction"
          placeholder={
            accountName
              ? `Add to ${accountName} — e.g. coffee 4.50, taxi 12`
              : 'Type what you spent or earned — e.g. coffee 4.50'
          }
        />
        <Button type="submit" disabled={prompt.isPending || text.trim() === ''}>
          {prompt.isPending ? 'Adding…' : 'Add'}
        </Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Write the test suite**

Create `src/features/transactions/QuickAddPrompt.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '@/test/server';
import { renderWithProviders } from '@/test/utils';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { QuickAddPrompt } from './QuickAddPrompt';

const apiBase = 'http://localhost:8080';
const accountId = '00000000-0000-0000-0000-000000000001';

// Spy on the toast wrapper (same seam the bulk-action tests use).
const toastSuccess = vi.fn();
vi.mock('@/lib/toast', () => ({
  toast: {
    success: (m: string) => toastSuccess(m),
    error: vi.fn(),
  },
}));

function ui() {
  return (
    <AuthProvider>
      <QuickAddPrompt accountId={accountId} accountName="Checking" />
    </AuthProvider>
  );
}

// Respond to POST /api/prompt with a fixed envelope for the test.
function respondPrompt(body: unknown, status = 200) {
  server.use(
    http.post(`${apiBase}/api/prompt`, () => HttpResponse.json(body as never, { status })),
  );
}

async function typeAndSubmit(user: ReturnType<typeof userEvent.setup>, value: string) {
  const input = screen.getByLabelText('Quick add transaction');
  await user.type(input, value);
  await user.click(screen.getByRole('button', { name: 'Add' }));
  return input as HTMLInputElement;
}

beforeEach(() => {
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
  toastSuccess.mockClear();
});

describe('QuickAddPrompt', () => {
  it('shows the account name in the placeholder', () => {
    renderWithProviders(ui());
    expect(screen.getByLabelText('Quick add transaction')).toHaveAttribute(
      'placeholder',
      expect.stringContaining('Checking'),
    );
  });

  it('disables Add when the input is empty', () => {
    renderWithProviders(ui());
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  });

  it('full success: toasts, clears the input, shows no alert', async () => {
    const user = userEvent.setup();
    respondPrompt({ kind: 'transactions', succeeded: [{ id: 'tx' }], failed: [] });
    renderWithProviders(ui());
    const input = await typeAndSubmit(user, 'coffee 4.50');
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Added 1 transaction.'));
    expect(input.value).toBe('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('total failure: keeps the text and lists reasons (1-based)', async () => {
    const user = userEvent.setup();
    respondPrompt({
      kind: 'transactions',
      succeeded: [],
      failed: [{ index: 0, reason: 'could not resolve account' }],
    });
    renderWithProviders(ui());
    const input = await typeAndSubmit(user, 'taxi');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Item 1 — could not resolve account',
    );
    expect(input.value).toBe('taxi');
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('partial: toasts the good part, clears the input, alerts the failures', async () => {
    const user = userEvent.setup();
    respondPrompt({
      kind: 'transactions',
      succeeded: [{ id: 'tx' }],
      failed: [{ index: 1, reason: 'could not resolve category' }],
    });
    renderWithProviders(ui());
    const input = await typeAndSubmit(user, 'groceries 500, taxi 12');
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Added 1 transaction.'));
    expect(input.value).toBe('');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Item 2 — could not resolve category',
    );
  });

  it('503: shows the unavailable message and keeps the text', async () => {
    const user = userEvent.setup();
    respondPrompt({ message: 'LLM feature disabled' }, 503);
    renderWithProviders(ui());
    const input = await typeAndSubmit(user, 'coffee 4.50');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Quick add is unavailable right now.',
    );
    expect(input.value).toBe('coffee 4.50');
  });

  it('502: shows the retry/rephrase message and keeps the text', async () => {
    const user = userEvent.setup();
    respondPrompt({ message: 'LLM upstream error' }, 502);
    renderWithProviders(ui());
    const input = await typeAndSubmit(user, 'coffee 4.50');
    expect(await screen.findByRole('alert')).toHaveTextContent('please try again or rephrase');
    expect(input.value).toBe('coffee 4.50');
  });

  it('400: shows the backend message and keeps the text', async () => {
    const user = userEvent.setup();
    respondPrompt({ message: 'Amount must be positive', code: 'ValidationErr' }, 400);
    renderWithProviders(ui());
    const input = await typeAndSubmit(user, 'coffee -1');
    expect(await screen.findByRole('alert')).toHaveTextContent('Amount must be positive');
    expect(input.value).toBe('coffee -1');
  });

  it('unexpected status: shows the generic message and keeps the text', async () => {
    const user = userEvent.setup();
    respondPrompt({ message: 'boom' }, 500);
    renderWithProviders(ui());
    const input = await typeAndSubmit(user, 'coffee 4.50');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
    expect(input.value).toBe('coffee 4.50');
  });

  it('dismiss (✕) clears the alert', async () => {
    const user = userEvent.setup();
    respondPrompt({ kind: 'transactions', succeeded: [], failed: [{ index: 0, reason: 'x' }] });
    renderWithProviders(ui());
    await typeAndSubmit(user, 'taxi');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the suite; iterate to green**

Run: `pnpm exec vitest run src/features/transactions/QuickAddPrompt.test.tsx`
Expected: all PASS. If a status-mapped assertion fails, confirm `ApiError.status` is being read (see `src/api/client.ts:14`).

Note on the 400 case: `ApiClient` normalises non-2xx JSON `{ message, code, fieldErrors }` into an `ApiError`. `PromptResponse` failures never carry `fieldErrors`, so all copy renders in the alert body (no form-field routing).

- [ ] **Step 4: Typecheck + lint**

Run: `pnpm exec tsc --noEmit && pnpm exec eslint src/features/transactions/QuickAddPrompt.tsx src/features/transactions/QuickAddPrompt.test.tsx`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/QuickAddPrompt.tsx src/features/transactions/QuickAddPrompt.test.tsx
git commit -m "feat(transactions): add QuickAddPrompt composer + feedback"
```

---

## Task 4: Wire `QuickAddPrompt` into the Transactions pane

**Files:**

- Modify: `src/features/transactions/TransactionsPane.tsx`
- Modify: `src/features/transactions/TransactionsPane.test.tsx`

- [ ] **Step 1: Add the wiring test (failing)**

In `src/features/transactions/TransactionsPane.test.tsx`, add a test inside the top-level `describe('TransactionsPane', …)`:

```tsx
it('renders the Quick add composer for an open account', async () => {
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
  renderWithProviders(ui(), { initialPath: '/accounts/a1' });
  expect(await screen.findByLabelText('Quick add transaction')).toBeInTheDocument();
});

it('does not render the Quick add composer with no account selected', () => {
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
  renderWithProviders(ui(), { initialPath: '/' });
  expect(screen.queryByLabelText('Quick add transaction')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run it to confirm the first assertion fails**

Run: `pnpm exec vitest run src/features/transactions/TransactionsPane.test.tsx -t "Quick add"`
Expected: the "renders … for an open account" test FAILS (composer not present yet); the "does not render …" test passes.

- [ ] **Step 3: Import and render the composer**

In `src/features/transactions/TransactionsPane.tsx`:

1. Add the import alongside the other feature imports (e.g. after the `ControlBar` import at line ~70):

```ts
import { QuickAddPrompt } from './QuickAddPrompt';
```

2. In the returned JSX, render the composer at the end of the fragment — after the `{showPagination && (…)}` block and before the dialog/`SelectionActionBar` markup — gated on `id`:

```tsx
      {showPagination && (
        <TransactionPagination
          /* …existing props… */
        />
      )}
      {id && <QuickAddPrompt accountId={id} accountName={account?.name} />}
      {editing && (
        /* …existing dialogs… */
```

The component is `sticky bottom-0` with a solid background, so it stays pinned to the bottom of the scrolling `<main>` region regardless of list length. `id` is already in scope (`const { id } = useParams(...)`); `account` is already loaded via `useAccountById(id)`.

- [ ] **Step 4: Run the wiring tests to confirm they pass**

Run: `pnpm exec vitest run src/features/transactions/TransactionsPane.test.tsx -t "Quick add"`
Expected: both PASS.

- [ ] **Step 5: Run the whole pane test file (regression guard)**

Run: `pnpm exec vitest run src/features/transactions/TransactionsPane.test.tsx`
Expected: all PASS (the always-on composer must not disturb existing pane tests; if a "no transactions" empty-state test now also finds the composer, that is expected and fine — the composer renders regardless of transaction count).

- [ ] **Step 6: Typecheck + lint**

Run: `pnpm exec tsc --noEmit && pnpm exec eslint src/features/transactions/TransactionsPane.tsx src/features/transactions/TransactionsPane.test.tsx`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/features/transactions/TransactionsPane.tsx src/features/transactions/TransactionsPane.test.tsx
git commit -m "feat(transactions): dock QuickAddPrompt in the transactions pane"
```

---

## Task 5: Full-suite verification + manual smoke

**Files:** none (verification only)

- [ ] **Step 1: Run the full check + test suite**

Run: `just check && just test`
(`just check` = typecheck + lint + format-check; `just test` = `vitest run`.)
Expected: all green. If format-check fails, run `just format` and amend the last commit.

- [ ] **Step 2: Manual smoke via the @run/verify skill (recommended)**

Use the `verify` skill (or `just run` + browser) to drive the real flow against a running backend with the prompt feature enabled:

1. Open an account, type `coffee 4.50` in the bottom composer, submit → a success toast appears and the new row shows after scrolling to the top of the list.
2. Type something the LLM can't resolve → a destructive alert appears with the reason and the text is retained.
3. (If reachable) Point at a backend with the feature disabled → submitting shows "Quick add is unavailable right now."

- [ ] **Step 3: (Optional) Playwright @local smoke**

If adding an E2E smoke, tag it `@local` (consistent with prior features that require a live backend/LLM) so it is excluded from the default headless run. Keep it to a single record-and-confirm assertion.

---

## Notes / assumptions carried from the spec

- **Account is always selected today.** The composer is rendered only when `/accounts/:id` is active, and always sends `account`. The future all-accounts transactions view is the single place that will revisit how `account` is chosen — out of scope here.
- **No dedup on the backend.** This is why partial success clears the box (resubmitting the whole text would double-record the committed items) while total failure keeps it.
- **DTO lockstep.** `PromptResponse`/`PromptRequest`/`PromptFailure` mirror `server-infra/src/Web/API/PromptAPI.hs`; cite that source in the `types.ts` comment (done in Task 1).
- **Pending affordance.** The spec mentions a "spinner" while the request is in flight; the plan intentionally uses the repo's dominant convention instead — a disabled button with a swapped "Adding…" label (see `IncomeExpenseForm.tsx:307-308`) rather than introducing a spinner icon (only `SyncNowButton` uses one). Deliberate simplification, not a miss.
