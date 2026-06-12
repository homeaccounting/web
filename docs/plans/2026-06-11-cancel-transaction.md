# Cancel Transaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user cancel a transaction from the transactions list so it drops out of the default view and stops counting toward the account balance.

**Architecture:** The backend already exposes `DELETE /api/transactions/:id` (soft cancel → `204`), already excludes cancelled transactions from balance, and the frontend already hides/de-emphasises `Cancelled` rows. This plan adds only the frontend trigger: an API method, a TanStack Query mutation hook, a confirmation `AlertDialog`, and two entry points (row context-menu item + a dedicated per-row icon button with a tooltip) in `TransactionsPane`.

**Tech Stack:** React 18, TypeScript (strict), TanStack Query, shadcn/ui (`alert-dialog`, `tooltip`, `context-menu`, `button`, `alert`), Vitest + Testing Library + MSW.

Spec: `docs/specs/2026-06-11-delete-transaction-design.md`.

---

## File Structure

- **Modify** `src/api/transactions.ts` — add `cancel(id)` calling `client.delete`.
- **Create** `src/features/transactions/useCancelTransaction.ts` — mutation hook (mirrors `useEditTransaction.ts`).
- **Create** `src/features/transactions/CancelTransactionDialog.tsx` — confirmation dialog with inline error.
- **Modify** `src/features/transactions/TransactionsPane.tsx` — context-menu item + dedicated icon control + dialog wiring.
- **Create** tests: `useCancelTransaction.test.tsx`, `CancelTransactionDialog.test.tsx`; **extend** `TransactionsPane.test.tsx`, `transactions.test.ts`.
- **Modify** `src/test/handlers.ts` — add `DELETE /api/transactions/:id` handler.

Conventions to follow:

- Run commands with `pnpm exec vitest run <path>` (or `-t "<name>"`).
- Run `just check` (typecheck + lint + format-check) before each commit; `just format` to fix formatting.
- Import from `@/...`, never deep relative paths.
- Query-key invalidation uses the **partial prefix** `['transactions', acc]` (TanStack prefix-matches the full `['transactions', accountId, fromDate, toDate]` key). Do NOT expand it — this mirrors `useEditTransaction`.

---

## Task 1: API method `cancel`

**Files:**

- Modify: `src/api/transactions.ts`
- Test: `src/api/transactions.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Open `src/api/transactions.test.ts`, match the existing style (it builds an `ApiClient` against a stubbed `fetch`/MSW). Add:

```ts
it('cancel issues DELETE /api/transactions/:id', async () => {
  // Use the same client/fetch-spy setup the other tests in this file use.
  await transactionsApi(client).cancel('tx-1');
  // Assert a DELETE was made to `${baseUrl}/api/transactions/tx-1`.
});
```

Match assertions to the file's existing helper (spy on fetch or assert via MSW, whichever the surrounding tests use).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/api/transactions.test.ts -t "cancel"`
Expected: FAIL — `cancel` is not a function.

- [ ] **Step 3: Add the method**

In `src/api/transactions.ts`, add to the returned object (after `amend`):

```ts
  cancel: (id: UUID): Promise<void> => client.delete<void>(`/api/transactions/${id}`),
```

`UUID` is already imported. `ApiClient.delete` already exists.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/api/transactions.test.ts -t "cancel"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
just check
git add src/api/transactions.ts src/api/transactions.test.ts
git commit -m "feat(api): add transactions.cancel (DELETE) (#32)"
```

---

## Task 2: `useCancelTransaction` hook

**Files:**

- Create: `src/features/transactions/useCancelTransaction.ts`
- Test: `src/features/transactions/useCancelTransaction.test.tsx`

Model both files on `useEditTransaction.ts` / `useEditTransaction.test.tsx`.

- [ ] **Step 1: Write the failing test**

`src/features/transactions/useCancelTransaction.test.tsx` — render the hook with the repo's test QueryClient wrapper (see `useEditTransaction.test.tsx` for the exact wrapper). Two assertions:

1. Calling `mutateAsync({ id, accountIds })` triggers `DELETE /api/transactions/:id` (assert via MSW handler / spy).
2. After settle, `queryClient.invalidateQueries` is called for `['accounts']` and for `['transactions', acc]` per account (spy on `invalidateQueries`, as `useEditTransaction.test.tsx` does, or assert refetch behaviour the same way that test does).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/features/transactions/useCancelTransaction.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClient, baseUrl } from '@/api/client';
import { transactionsApi } from '@/api/transactions';
import type { UUID } from '@/api/types';
import { useAuth } from '@/auth/useAuth';

export interface CancelTransactionVars {
  id: UUID;
  accountIds: UUID[];
}

export function useCancelTransaction() {
  const { tokenRef, signOut } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<void, Error, CancelTransactionVars>({
    mutationFn: async ({ id }) => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      await transactionsApi(client).cancel(id);
    },
    onSettled: (_data, _err, { accountIds }) => {
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
      for (const acc of accountIds) {
        void queryClient.invalidateQueries({ queryKey: ['transactions', acc] });
      }
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/features/transactions/useCancelTransaction.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
just check
git add src/features/transactions/useCancelTransaction.ts src/features/transactions/useCancelTransaction.test.tsx
git commit -m "feat(transactions): useCancelTransaction mutation hook (#32)"
```

---

## Task 3: `CancelTransactionDialog`

**Files:**

- Create: `src/features/transactions/CancelTransactionDialog.tsx`
- Test: `src/features/transactions/CancelTransactionDialog.test.tsx`

Derive `accountIds` inside the dialog from the transaction:
`[...new Set([tx.sourceAccountId, tx.targetAccountId])]`.

- [ ] **Step 1: Write the failing test**

`CancelTransactionDialog.test.tsx`, using `src/test/utils.tsx` render helper + MSW:

1. Renders title "Cancel this transaction?" when `open`.
2. Clicking the destructive confirm calls `DELETE` and then calls `onOpenChange(false)` (success closes). Override the MSW handler to return `204` for this test.
3. When the DELETE handler returns `409` with an `ApiError` body, the dialog shows the error message inline and does NOT close (`onOpenChange(false)` not called). Use `server.use(...)` to override with a 409 + JSON `{ message, code }`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/features/transactions/CancelTransactionDialog.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the dialog**

```tsx
import { ApiError } from '@/api/client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import type { TransactionResponse } from '@/api/types';
import { useCancelTransaction } from './useCancelTransaction';

export interface CancelTransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: TransactionResponse;
}

export function CancelTransactionDialog({
  open,
  onOpenChange,
  transaction,
}: CancelTransactionDialogProps) {
  const cancel = useCancelTransaction();
  const accountIds = [...new Set([transaction.sourceAccountId, transaction.targetAccountId])];

  const showBanner = cancel.isError;
  const bannerMessage =
    cancel.error instanceof ApiError
      ? cancel.error.message
      : 'Something went wrong. Please try again.';

  const onConfirm = async () => {
    try {
      await cancel.mutateAsync({ id: transaction.id, accountIds });
      onOpenChange(false);
    } catch {
      // Error surfaces via the inline banner; keep the dialog open.
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (!cancel.isPending) {
          if (!o) cancel.reset();
          onOpenChange(o);
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this transaction?</AlertDialogTitle>
          <AlertDialogDescription>
            It will be excluded from the account balance and hidden from the default transactions
            list. This can&apos;t be undone here.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {showBanner && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{bannerMessage}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <Button variant="outline" disabled={cancel.isPending} onClick={() => onOpenChange(false)}>
            Keep
          </Button>
          <Button
            variant="destructive"
            disabled={cancel.isPending}
            onClick={() => void onConfirm()}
          >
            Cancel transaction
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

Note: plain `Button`s are used in the footer (not `AlertDialogAction`/`AlertDialogCancel`) so a failed confirm can keep the dialog open. If `just check` flags an a11y issue with the close affordance, keep the `onOpenChange`-driven close — Radix `AlertDialog` still closes on Escape/overlay via the controlled `open` prop.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/features/transactions/CancelTransactionDialog.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
just check
git add src/features/transactions/CancelTransactionDialog.tsx src/features/transactions/CancelTransactionDialog.test.tsx
git commit -m "feat(transactions): cancel-transaction confirmation dialog (#32)"
```

---

## Task 4: Wire entry points into `TransactionsPane`

**Files:**

- Modify: `src/features/transactions/TransactionsPane.tsx`
- Modify: `src/test/handlers.ts` (add DELETE handler)
- Test: `src/features/transactions/TransactionsPane.test.tsx` (extend)

- [ ] **Step 1: Add the MSW handler**

In `src/test/handlers.ts`, alongside the other `/api/transactions/:id/...` handlers, add:

```ts
http.delete(`${apiBase}/api/transactions/:id`, () => new HttpResponse(null, { status: 204 })),
```

(`HttpResponse` is already imported in this file; confirm and reuse the existing import.)

- [ ] **Step 2: Write the failing tests**

Extend `TransactionsPane.test.tsx`. Use a fixture list containing at least one non-cancelled row and one `Cancelled` row (cancelled rows only render when `showCancelledFailed` is toggled on — toggle it for the "hidden for cancelled" assertion). Assert:

1. A non-cancelled row exposes a "Cancel transaction" control (`getByLabelText('Cancel transaction')` / `getByRole('button', { name: 'Cancel transaction' })`).
2. Clicking that control opens the dialog (title "Cancel this transaction?" appears) and does NOT open the edit dialog.
3. The right-click context menu shows a "Cancel transaction" item for a non-cancelled row.
4. For a `Cancelled` row (with the filter on), no "Cancel transaction" control is rendered.

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm exec vitest run src/features/transactions/TransactionsPane.test.tsx -t "cancel"`
Expected: FAIL.

- [ ] **Step 4: Implement the wiring**

In `TransactionsPane.tsx`:

a. Add imports:

```ts
import { Ban, Pencil } from 'lucide-react'; // extend the existing Pencil import
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CancelTransactionDialog } from './CancelTransactionDialog';
```

b. Add state next to `editing`:

```ts
const [cancelTarget, setCancelTarget] = useState<TransactionResponse | null>(null);
const openCancel = (t: TransactionResponse) => setCancelTarget(t);
```

c. Add a trailing header cell and a trailing body cell. In `<thead>`, add `<th className="w-8 px-4 py-2" />` after the Amount column. In each row, after the amount `<td>`, add an action cell that only renders the control for non-cancelled rows:

```tsx
<td className="w-8 px-2 py-2 text-right">
  {t.status !== 'Cancelled' && (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Cancel transaction"
            className="h-7 w-7 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              openCancel(t);
            }}
          >
            <Ban className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Cancel transaction</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )}
</td>
```

Add `group` to the `<tr>` className so `group-hover` works (extend the existing `cn(...)` call on the row). If hover-reveal proves awkward to test, the control may stay always-visible — visibility is cosmetic; presence + behaviour are what the tests assert.

d. In `<ContextMenuContent>`, add after the Edit item, for non-cancelled rows:

```tsx
{
  t.status !== 'Cancelled' && (
    <ContextMenuItem className="text-destructive" onSelect={() => openCancel(t)}>
      <Ban className="mr-2 h-4 w-4" aria-hidden />
      Cancel transaction
    </ContextMenuItem>
  );
}
```

e. Render the dialog near the `EditTransactionDialog` block:

```tsx
{
  cancelTarget && (
    <CancelTransactionDialog
      open
      onOpenChange={(o) => {
        if (!o) setCancelTarget(null);
      }}
      transaction={cancelTarget}
    />
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm exec vitest run src/features/transactions/TransactionsPane.test.tsx`
Expected: PASS.

- [ ] **Step 6: Full check + commit**

```bash
just check
pnpm exec vitest run src/features/transactions src/api/transactions.test.ts
git add src/features/transactions/TransactionsPane.tsx src/features/transactions/TransactionsPane.test.tsx src/test/handlers.ts
git commit -m "feat(transactions): cancel transaction from list — control + context menu (#32)"
```

---

## Final verification

- [ ] `just check` passes (typecheck + lint + format-check).
- [ ] `just test` passes the full unit suite.
- [ ] Manual smoke (optional): `just run`, cancel a transaction, confirm the row leaves the default list and the account balance updates; confirm cancelling an already-cancelled transaction surfaces the backend error inline.
- [ ] Update the spec frontmatter `status: draft` → `completed` and commit.
