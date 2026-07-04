---
title: Default accounts (global + per-type) and reshaped defaults API
status: draft
date: 2026-07-03
issue: cross-repo (server-infra #26 / #119)
---

# Default accounts (global + per-type) and reshaped defaults API

## Summary

The backend (`server-infra`, commit `b08f84c`) reshaped the configuration
`defaults` surface as a **breaking change** and added two new capabilities:

1. A **global default account** (`defaults.account`).
2. **Per-type default accounts** (`defaults.subtypeAccounts`), keyed by account
   subtype.

At the same time the two existing default categories were **renamed and nested**:
`defaultIncomeCategory` / `defaultExpenseCategory` (top-level) →
`defaults.incomeCategory` / `defaults.expenseCategory`.

This spec covers the **web changes only**:

1. Fix `src/api/types.ts` to mirror the new nested `defaults` wire format.
2. Update all consumers of the old field names.
3. Add a new **Defaults** profile tab that lets the user set default categories,
   a global default account, and per-type default accounts.

No backend changes are in scope (see [Non-goals](#non-goals)).

## Backend contract (reference — already shipped)

`GET /api/users/me/configuration` response (relevant part):

```json
{
  "defaults": {
    "incomeCategory": "uuid | null",
    "expenseCategory": "uuid | null",
    "account": "uuid | null",
    "subtypeAccounts": { "CashKind": "uuid", "BankAccountKind": "uuid" }
  }
}
```

`PUT /api/users/me/configuration/defaults` request body — **all fields optional**:

```json
{
  "incomeCategory": "uuid",
  "expenseCategory": "uuid",
  "account": "uuid",
  "subtypeAccounts": { "CashKind": "uuid" }
}
```

Semantics (verified in `Web/API/ConfigurationAPI.hs`, `updateDefaultsHandler`):

- Each field is `forM_`-guarded: **absent → no change; a value → set**. There is
  **no clear**: sending `null` for `incomeCategory` / `expenseCategory` /
  `account` is a no-op (this is the locked "set-only" decision from #41).
- `subtypeAccounts`, **when present, replaces the whole map wholesale**. So an
  individual per-type default is cleared by _omitting its key_ from the sent map,
  and all are cleared by sending `{}`.
- Backend validates that every target account is a **Regular** (non-external)
  account **owned/editable** by the user; otherwise `ValidationErr`.
- The map keys are backend `AccountSubtypeKind` constructors:
  `CashKind`, `BankAccountKind`, `EWalletKind`, `AssetKind`, `LoanKind`.
  The web enum uses `cash` / `bankAccount` / `eWallet` / `asset` / `loan`, so a
  mapping layer is required.

## Non-goals

- **No backend change.** Clearing stays set-only per the #41 decision.
- **No default-account seeding in transaction dialogs.** Existing dialogs seed
  the default _category_ only; wiring the default _account_ into create dialogs
  is out of scope for this change (can be a follow-up). Only the field renames
  are applied to those dialogs.
- No change to how categories/labels dictionaries are managed.

## Design

### 1. API types (`src/api/types.ts`)

Add the backend↔web subtype-key mapping and the nested DTO. Replace the two
top-level category fields on `ConfigurationResponse`.

```ts
// Backend AccountSubtypeKind constructor names (Web/API/ConfigurationAPI.hs).
export const BACKEND_SUBTYPE_KIND = {
  cash: 'CashKind',
  bankAccount: 'BankAccountKind',
  eWallet: 'EWalletKind',
  asset: 'AssetKind',
  loan: 'LoanKind',
} as const satisfies Record<AccountSubtypeKind, string>;
export type BackendSubtypeKind = (typeof BACKEND_SUBTYPE_KIND)[AccountSubtypeKind];

export interface ConfigurationDefaultsDTO {
  incomeCategory: UUID | null;
  expenseCategory: UUID | null;
  account: UUID | null;
  subtypeAccounts: Partial<Record<BackendSubtypeKind, UUID>>;
}

// ConfigurationResponse: remove defaultIncomeCategory / defaultExpenseCategory,
// add:
//   defaults: ConfigurationDefaultsDTO;

export interface UpdateDefaultsRequest {
  incomeCategory?: UUID | null;
  expenseCategory?: UUID | null;
  account?: UUID | null;
  subtypeAccounts?: Partial<Record<BackendSubtypeKind, UUID>>;
}
```

A small helper module (`src/api/defaults.ts` or exported alongside the mapping)
provides:

```ts
toBackendSubtypeKind(k: AccountSubtypeKind): BackendSubtypeKind
fromBackendSubtypeKind(k: string): AccountSubtypeKind | undefined
```

`fromBackendSubtypeKind` returns `undefined` for unknown keys so a future backend
subtype does not crash the UI (unknown entries are ignored when reading).

### 2. Consumers of the renamed fields

Mechanical updates from top-level to nested:

- `src/features/transactions/CreateIncomeDialog.tsx` — `config?.defaults.incomeCategory`
- `src/features/transactions/CreateExpenseDialog.tsx` — `config?.defaults.expenseCategory`
- `src/features/transactions/ConvertTransactionDialog.tsx` — `config?.defaults.incomeCategory / .expenseCategory`
- Test infra: `src/test/fixtures.ts` (`configurationFixture`), `src/test/handlers.ts`
  (the `PUT .../defaults` handler must now read the new field names and echo a
  nested `defaults` object), and the affected `*.test.tsx` files — specifically
  including `src/features/configuration/useUpdateDefaults.test.tsx` (asserts the
  mutation request body and response field names directly) and
  `src/features/transactions/EditTransactionDialog.test.tsx` (spreads the old
  fields into a config override).
- The stale doc comment in `src/api/types.ts` (~line 361) asserting the category
  fields are "TOP-LEVEL" must be rewritten to cite the nested `defaults` object,
  per the CLAUDE.md rule to keep backend-citation comments in lockstep.

### 3. Defaults profile tab

**`src/pages/ProfilePage.tsx`** — add `defaults` to `STATIC_TABS`, a
`<TabsTrigger value="defaults">Defaults</TabsTrigger>`, and a `<TabsContent>`
rendering `<ProfileDefaultsPane />`. Place it after **Dictionaries**.

**Move** the "Default categories" card out of `ProfileDictionariesPane.tsx`
(delete that card and its `DefaultCategoryField` imports; the Dictionaries tab
keeps Categories + Labels only).

**New `src/features/profile/ProfileDefaultsPane.tsx`** — loads `useConfiguration()`
and `useAccounts()`. Renders skeleton while pending, destructive alert on error.
Contains two cards.

#### Card A — Default categories (`DefaultCategoriesCard.tsx`)

- Two selects: default income category (from `income-category` dictionary) and
  default expense category (from `expense-category` dictionary).
- **No "— none —" option** (backend cannot clear). When the current value is
  `null`, the trigger shows a `"Select…"` placeholder; the Save button is
  disabled until both the form is dirty and at least the changed field has a
  concrete value.
- Single **Save** → `PUT` with only the fields that hold a concrete value and
  differ from current, e.g. `{ incomeCategory, expenseCategory }`.

#### Card B — Default accounts (`DefaultAccountsCard.tsx`)

Account options come from `useAccounts()`, filtered to **selectable** accounts:
`status === 'Opened'` and `subtype !== null` (Regular accounts only — external
accounts have `subtype === null` and are rejected by the backend anyway).

- **Global default account** select — lists all selectable accounts. No "none"
  (set-only). Placeholder when unset.
- **Per-type** section — one row per web subtype in fixed order
  (`cash`, `bankAccount`, `eWallet`, `asset`, `loan`) using
  `ACCOUNT_SUBTYPE_LABELS`. Each row's select lists **only accounts whose
  `subtype.type` matches that row's kind**, plus a **"— none —"** option (per-type
  clearing works via map omission).
- Single **Save** builds one `UpdateDefaultsRequest`:
  - `account`: included only if a concrete account is selected (omit when unset —
    can't clear).
  - `subtypeAccounts`: the full assembled map, keyed by `BackendSubtypeKind` via
    `toBackendSubtypeKind`, including only rows whose selection is a concrete
    account (rows set to "none" are omitted → cleared). Always sent (present)
    when the per-type section is dirty, so omissions take effect.

Reading current values back: `defaults.subtypeAccounts` is keyed by backend
names; each row resolves its current value via `fromBackendSubtypeKind`.

#### Shared select

Introduce a small presentational `AccountSelect` (options + value + onChange +
optional `includeNone`) reused by the global and per-type selects to keep each
card focused. Categories reuse the existing shadcn `Select` inline (small enough
to not need extraction).

### 4. Save/refresh flow

Both cards use the existing `useUpdateDefaults()` mutation (unchanged — it already
takes `UpdateDefaultsRequest`, PUTs to `/configuration/defaults`, and invalidates
`['configuration']`). No new hook needed. `useAccounts()` already exists.

`DefaultCategoryField.tsx` (per-field autosave, with a now-invalid "none") is
**removed**; its behaviour is superseded by `DefaultCategoriesCard`.

## Data flow

```
useConfiguration()  ──> config.defaults (nested)  ─┐
useAccounts()       ──> AccountResponse[]          ─┼─> ProfileDefaultsPane
                                                    │      ├─ DefaultCategoriesCard ─┐
                                                    │      └─ DefaultAccountsCard   ─┼─> useUpdateDefaults()
                                                    │                                │        │
                                                    └────────────────────────────────┘        └─> PUT /configuration/defaults
                                                                                                     └─> invalidate ['configuration']
```

## Error handling

- Pane: skeleton while either query is pending; destructive `Alert` if config
  fails to load. (Accounts failing to load degrades to empty option lists with a
  small inline notice; Save stays usable for categories.)
- Per-card: surface `update.error.message` in a destructive `Alert`; show a brief
  "Updated." confirmation on success (mirrors current `DefaultCategoryField`).
- Save disabled while `update.isPending` or when the card is not dirty.

## Testing

Unit/component (Vitest + Testing Library + MSW):

- `src/api/defaults.test.ts` — round-trip `toBackendSubtypeKind` /
  `fromBackendSubtypeKind`, unknown key → `undefined`.
- `DefaultCategoriesCard.test.tsx` — renders current values; changing income +
  saving PUTs `{ incomeCategory }`; no "none" option present; Save disabled when
  clean.
- `DefaultAccountsCard.test.tsx` — per-type dropdown lists only matching-subtype
  Opened accounts; selecting a bank account for the Bank row + saving PUTs
  `subtypeAccounts: { BankAccountKind: <id> }`; setting a row to "none" omits its
  key; global account select has no "none"; external / closed accounts excluded.
- `ProfileDefaultsPane.test.tsx` — pending skeleton, error alert, both cards
  render.
- Update MSW `handlers.ts` `PUT .../defaults` to read the new fields and return a
  nested `defaults`; update `configurationFixture` to the nested shape; fix the
  transaction-dialog and profile tests that referenced the old field names.
- Remove/replace `DefaultCategoryField.test.tsx` and the "default categories"
  assertions in `ProfileDictionariesPane.test.tsx`.

E2E: no new Playwright spec required (covered by existing profile smoke +
component tests); optionally extend if the profile smoke asserts tab set.

## Files touched

New:

- `src/features/profile/ProfileDefaultsPane.tsx`
- `src/features/profile/DefaultCategoriesCard.tsx`
- `src/features/profile/DefaultAccountsCard.tsx`
- `src/features/profile/AccountSelect.tsx`
- `src/api/defaults.ts` (mapping helpers) — or co-locate in `types.ts`
- Corresponding `*.test.tsx` / `*.test.ts`

Modified:

- `src/api/types.ts` (incl. rewriting the stale "TOP-LEVEL" comment ~line 361)
- `src/features/configuration/useUpdateDefaults.test.tsx`
- `src/features/transactions/EditTransactionDialog.test.tsx`
- `src/pages/ProfilePage.tsx`
- `src/features/profile/ProfileDictionariesPane.tsx` (remove defaults card)
- `src/features/transactions/{CreateIncomeDialog,CreateExpenseDialog,ConvertTransactionDialog}.tsx`
- `src/test/fixtures.ts`, `src/test/handlers.ts`
- Affected existing tests

Removed:

- `src/features/profile/DefaultCategoryField.tsx` + `DefaultCategoryField.test.tsx`

## Open questions / risks

- **Wholesale `subtypeAccounts` replacement** is the main footgun: the card must
  always send the _complete_ desired map, assembled from all five rows' current
  selections, not just the changed row. The design assembles from full local
  state to guarantee this.
- Backend `subtypeAccounts` may (in future) contain a key the web enum doesn't
  know; `fromBackendSubtypeKind` returning `undefined` makes the reader skip it
  rather than throw.
