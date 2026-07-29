---
status: draft
---

# Web natural-language prompt ("Quick add") — design

## Context

The natural-language prompt feature already exists on the backend and is exercised
today only through the Telegram client. In Telegram, any idle free-text message is
treated as a prompt: the user types what they spent or earned ("coffee 4.50",
"groceries 500, taxi 120"), an LLM parses it into 1..N transactions against the
user's currently-selected account, records them, and replies with the outcome.

This spec brings the same capability to the web client. The backend is complete;
no backend changes are required.

### Backend contract (already implemented)

`POST /api/prompt` (JWT-protected), defined in `server-infra/src/Web/API/PromptAPI.hs`:

- **Request:** `{ "text": string, "account": UUID | null }`. `account` fills the
  transaction's primary account slot; an account named explicitly in `text` still
  wins; when omitted, resolution proceeds from the text alone.
- **Success (200):** a kind-tagged envelope
  `{ "kind": "transactions", "succeeded": TransactionResponse[], "failed": [{ "index": int, "reason": string }] }`.
  Per-transaction **commit-good / report-bad**: one transaction's failure never
  blocks the others, and there is **no dedup**. `index` is the zero-based position
  in the parsed list. Note the web response carries no per-item source text or
  `interpretation` for failures — only `index` + `reason`.
- **Errors:** `400` domain/validation (carries a message), `503` feature disabled,
  `502` LLM upstream/unparseable.

## Goals

- Let a web user record transactions by typing natural language, with the same
  low-friction "just type it" feel as Telegram.
- Report clearly what was recorded and what failed, keeping a failed item's text
  editable where it is safe to resubmit.

## Non-goals (YAGNI)

- All-accounts composer behavior (no all-accounts transactions view exists yet).
- New-row highlight / auto-scroll to surfaced rows.
- Multi-line composer, streaming responses, or a pre-commit preview/confirm step.

## Key decisions

1. **Always-on, no toggle.** The composer is permanently visible — no show/hide
   control. Closest to Telegram's gate-free "just type" model; a single slim row
   costs negligible vertical space and removes state to persist.
2. **Docked below the transaction list.** It sits at the bottom of the Transactions
   pane (after pagination), `sticky bottom-0`, so it stays reachable as the list
   scrolls.
3. **Account is the currently-open account.** The pane always has a concrete account
   (`/accounts/:id`) today, so `account` is always sent. When the future
   all-accounts view lands, this is the one place that revisits how `account` is
   chosen. Documented as an explicit assumption.
4. **Feedback reuses the client's house patterns**, not a bespoke widget:
   - **Full success** → `toast.success('Added N…')`, mirroring the existing bulk-action
     idiom (`toast.success('Updated N transactions.')`). Nothing to fix, so no
     persistent surface.
   - **Anything the user must see or act on** (partial failure, total failure, and all
     API errors) → a **persistent, dismissible `<Alert variant="destructive">`** rendered
     inline above the composer, right where the user typed — because freshly-recorded
     rows land at the top of the newest-first list, offscreen from the bottom-docked
     composer. This reuses the same `Alert` primitive and `ApiError`-message derivation
     used by every create/edit dialog. The only bespoke element is the per-item failure
     list _inside_ the alert, which is inherent to a multi-transaction prompt.
5. **Failed-text handling is safety-driven** because there is no dedup and the client
   cannot map a failed `index` back to a source substring:
   - **Total failure** (nothing committed): keep the full text in the box — resubmit
     is safe.
   - **Partial failure** (some committed): **clear** the box and list the failure
     reasons — resubmitting the whole text would duplicate the already-committed
     items.

## Components

### 1. API layer

**`src/api/types.ts`** — add DTOs mirroring `Web/API/PromptAPI.hs` (cite the source
in a comment, per the repo's DTO-lockstep rule):

```ts
export interface PromptRequest {
  text: string;
  account?: UUID;
}

export interface PromptFailure {
  index: number; // zero-based position in the parsed list
  reason: string;
}

// Named to mirror the backend wire type `PromptResponse` in Web/API/PromptAPI.hs
// (the backend's internal `PromptResult` domain type is a different thing).
export interface PromptResponse {
  kind: 'transactions';
  succeeded: TransactionResponse[];
  failed: PromptFailure[];
}
```

**`src/api/prompt.ts`** — new per-resource module following the existing pattern:

```ts
export const promptApi = (client: ApiClient) => ({
  submit: (body: PromptRequest): Promise<PromptResponse> =>
    client.post<PromptResponse>('/api/prompt', body),
});
```

Non-2xx responses (`400`/`502`/`503`) flow through `ApiClient`'s existing `ApiError`
normalization (status/code/message), so no bespoke error handling is needed at this
layer.

### 2. Hook — `src/features/transactions/usePrompt.ts`

`useMutation<PromptResponse, ApiError, PromptRequest>`, constructed exactly like
`useCreateExpense` (reads `tokenRef`/`signOut` from `useAuth`, builds an `ApiClient`
in `mutationFn`). `onSuccess`: when `data.succeeded.length > 0`, invalidate
`['transactions', body.account]` and `['accounts']` (balances change). Partial
successes still return 200, so this path covers them; a total failure (`succeeded`
empty) invalidates nothing.

### 3. Component — `src/features/transactions/QuickAddPrompt.tsx`

Props: `{ accountId: UUID; accountName?: string }`.

- A single-line text input with a ✨ affordance and an **Add** button. Placeholder
  references the account name (e.g. "Add to Checking — e.g. coffee 4.50").
- **Enter** submits; input and button are **disabled with a spinner** while the
  mutation is pending.
- Feedback follows the house patterns (see decision 4): a **success toast** for the
  clean case, and a **persistent `<Alert variant="destructive">`** rendered directly
  above the input for anything that failed or errored. Component-local state holds the
  current alert content (`null` when none), cleared on the next submit and dismissible
  via an ✕. Behavior after a submit:

| Outcome                                                           | Input box               | Feedback                                                                                                                                       |
| ----------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Full success** (`failed=[]`, `succeeded>0`)                     | cleared, refocused      | `toast.success('Added N transaction(s).')`; no alert                                                                                           |
| **Partial** (`succeeded>0 && failed>0`)                           | **cleared**             | `toast.success('Added M…')` + destructive `Alert`: heading "Couldn't record N of {total}" and one line per failure `Item {index+1} — {reason}` |
| **Total failure** (`succeeded=0 && failed>0`)                     | **text kept, editable** | destructive `Alert` listing each failure `Item {index+1} — {reason}`                                                                           |
| **ApiError 503**                                                  | text kept               | destructive `Alert`: "Quick add is unavailable right now."                                                                                     |
| **ApiError 502**                                                  | text kept               | destructive `Alert`: "Couldn't process that — please try again or rephrase."                                                                   |
| **ApiError 400** (domain/validation)                              | text kept               | destructive `Alert` with `ApiError.message`                                                                                                    |
| **Any other error** (500, network/`fetch` reject, unknown status) | text kept               | destructive `Alert`: "Something went wrong. Please try again."                                                                                 |

The API-error rows derive their message the same way the create/edit dialogs do —
`error instanceof ApiError ? error.message : 'Something went wrong. Please try again.'`
— with `503`/`502` special-cased to fixed copy by status. `PromptResponse` failures
carry no `fieldErrors` (they are `{index, reason}`), so there is no form-field routing;
everything renders in the alert body. Failure lines display `Item {index + 1}`
(1-based for humans).

### 4. Wiring — `src/features/transactions/TransactionsPane.tsx`

Render `<QuickAddPrompt accountId={id} accountName={account?.name} />` only when `id`
is present (an account is open). Place it after `TransactionPagination`, wrapped so it
is `sticky bottom-0` with a top border and a solid (non-transparent) background, so it
remains visible while the transaction list scrolls within the `overflow-y-auto` main
region. It renders regardless of transaction count (so the first transaction on an
empty account can be added via prompt).

## Data flow

```
User types text, presses Enter
  → usePrompt.mutate({ text, account: accountId })
    → POST /api/prompt
      → 200 { succeeded, failed }
          succeeded>0 → invalidate ['transactions', accountId] + ['accounts']
          component maps (succeeded, failed) → success toast and/or destructive Alert
                                               + input-retain rule
      → ApiError (400/502/503) / other
          component maps status → destructive Alert message, text kept
```

## Error handling

All non-2xx cases surface in a persistent `<Alert variant="destructive">` (never a
bare thrown error), using the same `ApiError`-message derivation as the create/edit
dialogs; the input text is retained so the user can adjust and retry. `503`/`502` use
fixed copy; `400` shows the backend-provided `ApiError.message`; any other status, a
network/`fetch` rejection, or an unknown error falls through to the shared generic
"Something went wrong. Please try again." message (also retaining the text). There is
no separate capability probe — a disabled feature is discovered on first submit and
reported inline.

## Testing

- **MSW handler** for `POST /api/prompt` in `src/test/handlers.ts`, with per-test
  `server.use(...)` overrides for: full success, partial, total failure, `503`, `502`,
  `400`.
- **Component tests** (`QuickAddPrompt.test.tsx`) for the state-machine table above,
  emphasizing:
  - full success fires a `toast.success` and renders **no** destructive `Alert`;
  - partial and every error path render a destructive `Alert` (assert via `role="alert"`);
  - text **cleared** on full success and on partial;
  - text **kept** on total failure, `503`, `502`, `400`, and the generic fallback;
  - Enter submits; input/button disabled while pending;
  - `Item {index+1}` 1-based rendering.
    (The `toast` module is mockable per the existing bulk-action tests in
    `TransactionsPane.bulk.test.tsx`.)
- **Hook test** (`usePrompt.test.tsx`): invalidation fires when `succeeded>0`, not when
  `succeeded=0`.
- **Optional** `@local` Playwright smoke exercising a real record.

## Files touched

- `src/api/types.ts` (add DTOs)
- `src/api/prompt.ts` (new)
- `src/features/transactions/usePrompt.ts` (new) + test
- `src/features/transactions/QuickAddPrompt.tsx` (new) + test
- `src/features/transactions/TransactionsPane.tsx` (wire in)
- `src/test/handlers.ts` (MSW handler)
