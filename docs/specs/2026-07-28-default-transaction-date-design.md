---
status: draft
---

# Configurable & persistent default transaction date (web)

Tracker: [homeaccounting/web#71](https://github.com/homeaccounting/web/issues/71)

## Context

When creating a transaction, the date field always defaults to **now**. Every create dialog
seeds its form with `nowDateTimeInput()` from `src/lib/dates.ts`:

- `src/features/transactions/CreateIncomeDialog.tsx` — `date: nowDateTimeInput()`
- `src/features/transactions/CreateExpenseDialog.tsx` — `date: nowDateTimeInput()`
- `src/features/transactions/CreateTransferDialog.tsx` — `date: nowDateTimeInput()`
- `src/features/transactions/CopyTransactionDialog.tsx` — also re-defaults to `nowDateTimeInput()`

`nowDateTimeInput()` returns a local wall-clock `YYYY-MM-DDTHH:MM` string (minute precision).
The full "now" timestamp is deliberate: same-day rows get **distinct, entry-ordered
timestamps** out of the box because the time part advances as you enter them
(`src/lib/dates.ts:11-16`).

A user batch-entering transactions for a **specific, non-current day** (reconciling a past
day, entering yesterday's receipts) must re-edit the date on **every single new transaction**.
This is repetitive friction.

### Mount behavior (load-bearing for the design)

The three Create dialogs are rendered **unconditionally** in `ControlBar.tsx` (lines ~90-104);
only their `open` prop toggles visibility. The shadcn `DialogContent` uses a plain
`DialogPortal` with **no `forceMount`** (`src/components/ui/dialog.tsx`), so Radix
mounts/unmounts only the **inner form** (`IncomeExpenseForm` / `TransferForm`) as the dialog
opens and closes. The **parent dialog component** (`CreateExpenseDialog` etc., which owns the
`defaults` memo) stays mounted for the life of the transactions page.

Two consequences the design must account for:

1. A value frozen in the parent at first mount (e.g. via a `useState` initializer, or a
   `useMemo` whose deps don't change on open) is **never re-read** when the dialog reopens —
   the inner form remounts but reads the same frozen object.
2. This already affects the current `nowDateTimeInput()` default: because the `defaults` memo's
   deps are the primitive `accountId` / `currency` / `expenseCategory` (unchanged across a
   submit), the "now" timestamp is effectively **frozen at first page mount**. Sitting on the
   page and then adding a transaction seeds a stale time. The fix below corrects this latent
   staleness as a side effect.

## Goal

Make a run of same-day entries default to the **day the user last used**, without losing the
per-row time ordering the app relies on, and without adding settings UI.

## Behavior

The three **Create** dialogs (Income, Expense, Transfer) default their date to the
**last-used day + the current time**, instead of today + the current time.

- **Last-used day** is written on a successful submit of any of the three Create dialogs, and
  read when any of them opens. The value is shared across all three (submit an income dated
  July 3, then open Create Expense → it also defaults to July 3).
- Only the **day** is sticky. The **time** is always "now" at open, preserving the existing
  distinct/entry-ordered-timestamp invariant for same-day batches.
- Backed by **`sessionStorage`** (auto-clears when the tab/window closes) plus a **stale-session
  guard**. The guard keys off **when the value was recorded**, not the value itself: alongside
  the sticky day we store the calendar day it was recorded on. If a **new calendar day has begun
  since it was recorded** (recorded-on day < today), the value is ignored and the default falls
  back to today. Otherwise the sticky day is used **as-is — including a past day** (the primary
  use case: on July 28 you set July 3 and keep entering July-3 rows) and including a future day.
  This is deliberately _not_ a check on whether the picked day is in the past; reconciling a
  past day is exactly what the feature is for.
- **Copy** and **Refund** are untouched — they neither read nor write the sticky day. Both are
  anchored to a specific source transaction and keep their current date semantics.
- **No new UI.** The existing `DatePicker` in each dialog is the only control; the user changes
  the day by picking a different one, which becomes the new sticky day on next submit.

### Resulting model

| Situation                                                             | Default date                                         |
| --------------------------------------------------------------------- | ---------------------------------------------------- |
| Fresh tab (empty `sessionStorage`)                                    | today + now-time (matches intended current behavior) |
| Same tab, same day, after submitting a Create dialog dated to day D   | D + now-time (D may be **past**, today, or future)   |
| Same tab, next calendar day (tab left open, value recorded yesterday) | today + now-time (stale-session guard)               |
| Tab closed and reopened                                               | today + now-time (`sessionStorage` cleared)          |

## Architecture

### 1. `src/features/transactions/stickyDate.ts` (pure functions only)

Pure, framework-free functions (each takes an injected `now: Date` for testability). No React
hook — see the "recompute on open" note below for why a frozen hook value is wrong here.

- `STICKY_DATE_KEY = 'ha.transactions.lastDay'` — `sessionStorage` key. The stored value is a
  JSON object `{ day: 'YYYY-MM-DD', recordedOn: 'YYYY-MM-DD' }`, where `recordedOn` is the
  calendar day the value was written.
- `readStickyDay(now: Date): string | null` — parses the stored JSON; returns `day` **only when
  `recordedOn` is not earlier than today's day** (i.e. no new calendar day has begun since it
  was recorded — ISO day strings compare correctly lexicographically). Otherwise, or on a
  missing/malformed value, returns `null`. Note this compares `recordedOn`, **not** `day`, so a
  past `day` recorded today is returned as-is.
- `writeStickyDay(dateValue: string, now: Date): void` — extracts the day (segment before `'T'`)
  from a `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM` value and stores
  `{ day, recordedOn: today(now) }`.
- `defaultTransactionDate(now: Date): string` — returns `YYYY-MM-DDTHH:MM`. If
  `readStickyDay(now)` yields a day, composes `stickyDay + now's HH:MM`; otherwise returns
  `nowDateTimeInput()` (byte-for-byte the pre-existing default). This is the single function the
  dialogs call in place of `nowDateTimeInput()`.

Composition reuses `nowDateTimeInput()`'s time part so the wall-clock/timezone handling stays
in one place (`src/lib/dates.ts`).

**Why no `useState`-frozen hook.** Per the Mount behavior note, the parent create dialogs stay
mounted for the page's life, so any value captured once at mount is never refreshed on reopen.
`defaultTransactionDate` must therefore be **called fresh each time the dialog opens**, not
memoized into a stable value at first mount.

### 2. Dialog wiring (Income / Expense / Transfer create)

In each of `CreateIncomeDialog.tsx`, `CreateExpenseDialog.tsx`, `CreateTransferDialog.tsx`:

- **Recompute the default date on each open.** Replace `date: nowDateTimeInput()` with
  `date: defaultTransactionDate(new Date())` and **stop memoizing `defaults`** — compute it as a
  plain object on every render. (The `defaults` value is only ever passed as the form's
  `defaultValues`, never used in a dependency array, so dropping the `useMemo` is safe.) Because
  Radix remounts the inner form each time the dialog opens (no `forceMount`) and it reads the
  current render's `defaults`, the remounting form gets a freshly computed day+time on every
  open. This is preferred over keying a `useMemo` on `open` because `open` isn't referenced in
  the memo body, which trips `react-hooks/exhaustive-deps` ("unnecessary dependency").
  - The inner form reads `defaultValues` only at mount, so recomputing `defaults` on later
    renders (e.g. an account change while open) does **not** reset the form mid-edit.
  - The time part is recomputed each open, preserving the **distinct/entry-ordered-timestamp**
    invariant across separately-opened transactions (and fixing the latent freeze described in
    Context).
- **Persist on success.** Call `writeStickyDay(values.date, new Date())` inside `handleSubmit`,
  only after the create mutation resolves successfully, so a failed submit does not change the
  sticky day.

`CopyTransactionDialog.tsx` and the refund dialog are **not** modified.

Implementation note (advisory): computing `defaults` unmemoized calls `defaultTransactionDate`
(one `sessionStorage` read + a couple of string ops) on every render of the create dialog —
negligible, and only while that dialog component is in the tree.

## Testing

`sessionStorage` is already cleared between tests in `src/test/setup.ts` (`afterEach` →
`sessionStorage.clear()`), so no leakage between tests and no setup change is required.

- **Unit — `stickyDate.test.ts`** (inject `now`):
  - empty store → `defaultTransactionDate` equals `nowDateTimeInput()` for the same `now`.
  - **past day recorded today → returned as-is** (core use case), composed with now's time.
  - today recorded today → used, composed with now's time.
  - future day recorded today → used, composed with now's time.
  - any day whose `recordedOn` is earlier than today → ignored, falls back to today
    (stale-session guard: tab left open across midnight).
  - malformed/absent stored value → `null` / today fallback.
  - `writeStickyDay` stores `{ day, recordedOn }` with only the day part of a
    `YYYY-MM-DDTHH:MM` value and `recordedOn` = injected today.
- **Component** — extend existing `CreateIncomeDialog`/`CreateExpenseDialog` tests:
  - existing "defaults the date to now" assertions still pass on an empty store (no regression).
  - new: on **one persistent dialog instance**, seed a **past** sticky day recorded today (the
    real reconciliation scenario) → open → close → reopen → assert the date field shows that
    past day (with a live time). This must exercise reopen on a _persistent_ mount (flip the
    `open` prop), **not** a fresh render of a new dialog — a fresh-mount test would pass even if
    the recompute-on-open wiring were missing, masking the exact defect this design guards
    against.

## Out of scope (YAGNI)

- No settings screen or global preference toggle (the sticky behavior is automatic).
- No explicit "reset to today" button — the date picker already makes changing the day trivial.
- No changes to Copy or Refund dialogs.
- No `localStorage` / durable-across-restart persistence (session-scoped by design).

## References

- `src/lib/dates.ts` (`nowDateTimeInput`, wall-clock/timezone handling)
- `src/features/transactions/CreateIncomeDialog.tsx`
- `src/features/transactions/CreateExpenseDialog.tsx`
- `src/features/transactions/CreateTransferDialog.tsx`
- `src/features/transactions/CopyTransactionDialog.tsx` (unchanged; noted for scope)
- `src/features/transactions/TransactionPagination.tsx` (`usePersistedPageSize` — existing
  storage-backed pattern for reference; note it uses **`localStorage`**, whereas this feature
  deliberately uses **`sessionStorage`** — mirror the shape, not the storage object)
- `src/features/transactions/ControlBar.tsx` (renders the create dialogs unconditionally)
- `src/components/ui/dialog.tsx` (no `forceMount` — inner form remounts per open)
- `src/test/setup.ts` (storage cleared between tests)
