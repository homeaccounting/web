---
status: draft
date: 2026-07-23
tracker: 41
---

# Optional contact (counterparty) on transactions — web

Web portion of tracker#41. The backend portion landed in server-infra
(release 0.9.0); its design lives at
`server-infra/docs/specs/2026-07-22-contact-dictionary-design.md` and is the
authority for the wire contract. This spec covers only the client repo.

This effort also folds in a requested UX refactor of the dictionaries editor
(single scrolling page → per-kind tabs), which the new contact dictionary
motivates.

## Problem

A transaction's counterparty — **who an expense goes to** (beneficiary) or
**who income comes from** (source) — has no structured home on the client.
Categories answer _what kind_ of movement it was; labels are free-form tags.
The backend now models an optional per-transaction contact drawn from a
user-curated **contact dictionary** (slug `contact`), mirroring how
`categoryId` / `labels` already work. The web must let a user:

- pick a contact when creating or editing an income/expense,
- see a transaction's contact at a glance and change it quickly,
- filter the transaction list by contact,
- manage the contact dictionary (add/rename/remove/nest) like any other.

Transfers and adjustments have no external counterparty and carry no contact.

## Backend seam (authority: server-infra spec)

Verified against the landed `server-infra/src/Web/Types.hs` and
`src/Web/API/TransactionAPI.hs`:

- **`IncomeRequest` / `ExpenseRequest`** gain `contactId :: Maybe UUID`.
  `TransferRequest` does **not** — it structurally cannot carry a contact.
- **`TransactionResponse`** gains `contactId :: Maybe UUID` — the
  dictionary-entry **id only**, no resolved name. The client resolves names
  from the dictionary it already holds.
- **`PUT /api/transactions/:id/contact`** with body
  `SetTransactionContactRequest { contactId :: Maybe UUID }` — replaces or
  (via `null`) clears the contact on a Completed transaction. Mirrors
  `PUT /:id/labels`.
- **`AmendTransactionRequest`** gains `contactId :: Maybe UUID`, carrying the
  transaction's **full desired contact state**: `null`/absent means "no
  contact" (**clears** an existing one); a present value equal to the current
  contact is a no-op. There is no "leave unchanged" sentinel — the caller must
  resend the current value to preserve it.
- **Contact dictionary CRUD** works for free through the generic slug router at
  `/api/users/me/configuration/dictionaries/contact/...`; no new endpoints.
- **No** server-side contact filter was added to the list query
  (`GET /api/transactions` still exposes only `label`), and **no**
  spend-by-contact report endpoint exists. Filtering is therefore browser-side;
  reporting is out of scope.

## Design

### 1. API / DTO layer (`src/api`)

`types.ts` (kept in lockstep with `server-infra/src/Web/Types.hs`, cite source
lines in comments):

- `IncomeRequest`, `ExpenseRequest`: add `contactId?: UUID | null`.
- `TransactionResponse`: add `contactId: UUID | null`.
- `AmendTransactionRequest`: add `contactId?: UUID | null`.
- Add `SetTransactionContactRequest { contactId: UUID | null }`.

`transactions.ts`:

- `setContact(id: UUID, body: SetTransactionContactRequest): Promise<TransactionResponse>`
  → `PUT /api/transactions/:id/contact`, mirroring `setLabels`.

The request/seed mappers in `schema.ts` are the load-bearing functions and must
each be updated (they already handle `labels` the same way):

- `toIncomeRequest` (schema.ts:254), `toExpenseRequest` (schema.ts:267): include
  `contactId` (a `UUID | null`; send `null`/omit for "no contact") from the form
  values. These are what `createIncome` / `createExpense` submit
  (CreateIncomeDialog / CreateExpenseDialog).
- `toIncomeExpenseFormValues` (schema.ts:297): seed `contactId` from
  `tx.contactId` so edit/copy pre-fill the current contact.

No new dictionary-API code: contact reuses the existing dictionary client and
`flattenDictionary(config.dictionaries.contact)`. The `contact` key may be
**absent** from `config.dictionaries` until the first entry exists (bootstrap
seeds no contact dictionary); every consumer must tolerate `undefined` —
`flattenDictionary(undefined)` returns `[]` and `<DictionaryList dict={undefined}>`
renders an empty list, so the empty-state ("add first contact") works with no
special-casing.

### 2. Amendment must preserve the contact (critical seam detail)

Because `AmendTransactionRequest.contactId` **clears on absence**, every
amendment the web emits must carry the desired contact or it will silently drop
an existing one. There are **two** independent amendment builders and both must
be handled:

- `diffTransaction.ts` — the edit-dialog diff.
- `convertTransaction.ts` — `toIncomeExpenseAmendment` (convert income↔expense),
  dispatched through `useEditTransaction`. This is a **separate builder** and is
  the source of a silent-clear bug if left unpatched.

Decision — `diffTransaction.ts`:

- `TransactionEditDiff` gains `contactId?: UUID | null`. Because `null` is a
  legal value (clear), presence is tested with `!== undefined`, exactly like the
  existing `diff.labels !== undefined` gate.
- Compute `contactChanged = next.contactId !== initial.contactId`.
- Whenever an `amendment` is emitted (posting facts changed), set
  `amendment.contactId = next.contactId` — preserving an unchanged contact and
  carrying a changed one. So an amount/account edit never clears the contact.
- Set the standalone `diff.contactId` (→ `setContact`) **only when
  `contactChanged` and no `amendment` is emitted**. When an amendment is present
  it already carries the new contact, so we do not also fire `setContact` — this
  avoids a redundant, audit-visible `TransactionContactSet` event (the backend
  has no documented no-op suppression).
- `useEditTransaction` (useEditTransaction.ts:36-44) gains a `setContact`
  sub-call gated on `diff.contactId !== undefined`, ordered like the `setLabels`
  sub-call.

Decision — `convertTransaction.ts`:

- `toConvertIncomeExpenseDefaults` seeds `contactId` from `tx.contactId` for the
  income↔expense case (drops it for a transfer target — transfers carry none).
- `toIncomeExpenseAmendment` sets `contactId` from the form values so a convert
  preserves (or changes) the contact instead of clearing it.

Tests: amount-only edit on a contact-bearing tx → `amendment.contactId ===` the
existing contact; contact-only edit → `diff.contactId` set, no amendment;
contact + amount edit → amendment carries the new contact, no separate
`setContact`; convert of a contact-bearing income↔expense preserves the contact.

### 3. Contact picker in the create/edit form

- New `ContactCombobox` — a single-select, **creatable**, searchable combobox
  with a "— none —" clear option, modeled on `CategoryCombobox` (single value,
  not the multi-select `LabelMultiSelect`). Options come from
  `flattenDictionary(config.dictionaries.contact)`; the value is a
  `UUID | null`. When the typed query matches no existing contact, the list
  shows a **"Create '<query>'"** row (see §3a); choosing it creates the contact
  and selects it. The search box starts **empty** (normal search).
- `IncomeExpenseForm` gains a `Contact (optional)` field below Labels. This
  form backs both income and expense; transfers use `TransferForm`, which is
  untouched, so contact never appears on a transfer.
- `schema.ts`: `IncomeExpenseFormValues` gains `contactId: string | null`
  (default `null`).

`IncomeExpenseForm` is reused by **four** dialogs; adding the field surfaces it
in all of them, so each needs a decision:

- `CreateIncomeDialog` / `CreateExpenseDialog`: contact starts empty; submit
  includes it via `toIncomeRequest` / `toExpenseRequest`.
- `EditTransactionDialog`: seeds from `tx.contactId` (via
  `toIncomeExpenseFormValues`); persists via `diffTransaction` → `setContact` /
  amendment (§2).
- `CopyTransactionDialog`: **carries the source's `tx.contactId`** into the new
  transaction, consistent with how copy already carries labels. Seeded via the
  same `toIncomeExpenseFormValues`; submitted via `toIncomeRequest` /
  `toExpenseRequest`.
- `RefundTransactionDialog`: **shows the field defaulting to none.** A refund is
  a fresh income the user curates; its own `defaults` (RefundTransactionDialog.tsx)
  gain `contactId: null`. The user may pick the refunding party, but nothing is
  auto-seeded from the refunded expense (kept simple; a future enhancement could
  pre-fill it).

### 3a. Creating dictionary entries cheaply (generic creatable + create-from-hint)

Contacts are user-curated and the backend import is **match-only, never
auto-create** — so we make _manual_ creation nearly free instead of ingesting
raw import strings (which would flood the dictionary with near-duplicates like
`SILPO 123 KYIV`). Rather than build this for contacts alone, the capability is
**generic** and lives in the shared components, so labels get the same
create-from-hint flow in the transaction-list context menu.

**Where the capability lives (scope: context-menu pickers + the contact form
control; not `LabelMultiSelect`):**

- **`MenuSearchList` (shared context-menu list)** gains two optional props,
  backward-compatibly:
  - `onCreate?: (name: string) => void | Promise<unknown>` — when set and the
    trimmed query matches no existing option name (case-insensitive), the list
    shows a **"Create '<query>'"** row as the last item; picking it calls
    `onCreate(query)`. When omitted, no create row appears (so
    `TxCategoryQuickPicker`, which passes neither, is unchanged).
  - `createHint?: string` — an opaque suggested name for a new item. The
    component does not know or care where it comes from; the quick-pickers pass
    the row's description, but as far as `MenuSearchList` is concerned it is just
    a hint. When set and non-blank, a small "Use: <hint>" affordance renders
    above/below the search box; activating it drops the **whitespace-normalized**
    hint into the search box for editing. The box still starts empty.
- **`ContactCombobox` (form)** is separately creatable (single-select, standalone
  — it does not share `MenuSearchList`, which is menu-scoped): a "Create
  '<query>'" row appears when nothing matches; choosing it creates the contact
  and selects it. No create hint in the form (no per-row context there).
- `LabelMultiSelect` is **unchanged** (labels remain non-creatable in the form).

**Generic create hook.** A `useCreateDictionaryEntry(dictId)` mutation wraps
`configurationApi.addEntry(dictId, { name, type: 'item', parentId: null })`,
returns the new `{ id, name }`, and invalidates `['configuration']` (same
pattern as the existing `useAddDictionaryEntry`). Creation is always at the
**root** as an `item`; nesting/renaming stays the dictionary tab's job (§6).

**Assign step is picker-specific** (the create hook is shared; wiring differs):

- Contact quick-picker `onCreate`: `useCreateDictionaryEntry('contact')` →
  `transactionsApi.setContact(txId, { contactId: newId })`; invalidate the
  transactions query.
- Label quick-picker `onCreate`: `useCreateDictionaryEntry('label')` →
  `setLabels(txId, { labels: [...current, newId] })` (append), reusing the
  quick-picker's existing serialized-PUT commit path.
- Contact form `onCreate`: `useCreateDictionaryEntry('contact')` → set the form
  field to `newId` (no persisted transaction yet; assignment happens on submit).

The import case for both contact and label then reads: right-click row → **Set
contact / Labels** → tap "Use: `SILPO 123 KYIV`" → trim to `Silpo` → **Create
"Silpo"** — created, assigned, human-confirmed, dictionary stays clean.

### 4. Row display + quick-assign

- **Display:** a single `ContactChip` rendered near the label chips
  (`LabelChips`), with a distinguishing counterparty icon and the full contact
  name as a tooltip. The name is resolved from a contact id→name map derived
  from `config.dictionaries.contact` (reuse `useDictionaryEntryNames` /
  `flattenDictionary`). Rows with no contact render nothing.
- **Quick-assign:** a `TxContactQuickPicker` in the row context menu ("Set
  contact" submenu), mirroring `TxCategoryQuickPicker` / `TxLabelQuickPicker` and
  built on the shared, now-generalized `MenuSearchList`. It passes `onCreate`
  (create-and-assign a contact) and `createHint={tx.description}` (§3a), so an
  imported row goes from raw description to an assigned, curated contact without
  leaving the list. Only meaningful for income/expense rows; suppressed for
  transfer/adjustment.
- **Label quick-picker parity:** `TxLabelQuickPicker` is refactored to pass the
  same `onCreate` (create-and-assign a label) and `createHint={tx.description}`
  to `MenuSearchList`, so labels gain the identical create-from-hint flow in the
  context menu. Its existing multi-select toggle/serialized-PUT behavior is
  preserved. `TxCategoryQuickPicker` passes neither prop and is unchanged.

### 5. Filter by contact (browser-side)

- `TransactionFilters` gains `contactId: string` (`''` = no constraint) — a
  dictionary-entry **id**, not a name. (Unlike the category filter, which
  matches by name to bridge the separate income/expense dictionaries, contact is
  a single shared dictionary so id equality is exact and correct.)
- `applyTransactionFilters` adds: when `contactId` is set, keep only rows whose
  `row.contactId === contactId`; transfer/adjustment rows (always contact-less)
  are thereby excluded.
- `TransactionFilterBar` gains a contact select (single, with an "any" option,
  its option values being contact ids), fed by the contact dictionary.

### 6. Dictionaries editor refactor (tabs)

`ProfileDictionariesPane` today renders one scrolling page: a Categories card
(income + expense `DictionaryList`s) and a Labels card. Replace with four
sibling **tabs** using the existing shadcn `Tabs` primitive, in this order:

1. **Expense** — `DictionaryList dictId="expense"`
2. **Income** — `DictionaryList dictId="income"`
3. **Contact** — `DictionaryList dictId="contact"` (new; `addLabel="Add contact"`)
4. **Label** — `DictionaryList dictId="label"`

Each tab renders exactly one kind's `DictionaryList`, so each dictionary is
edited in isolation. Loading/error states stay at the pane level (unchanged).
`DictionaryList` itself is not modified.

## Error handling

- `contactId` referencing a non-assignable entry → backend `ContactNotFound`
  (validation). Surface via the existing field-error mapping on the form; the
  quick picker surfaces it as a toast like the other quick-assign actions.
- Removing an in-use contact → backend `ContactInUse`; surfaced by
  `DictionaryList`'s existing remove-error handling (same path as
  category/label in-use).
- Contact on a transfer is structurally impossible from the web (no field on
  `TransferForm`/`TransferRequest`), so `ContactNotAllowedOnTransfer` is not a
  reachable client state.

## Testing

TDD, mirroring existing category/label coverage:

- **`src/api`**: `types` round-trip for the new fields; `transactions.setContact`
  and `createIncome`/`createExpense` with `contactId` (MSW).
- **`diffTransaction`**: contact-only change → `diff.contactId` set, no
  amendment; amount-only change on a contact-bearing tx → `amendment.contactId`
  preserves it and no standalone `diff.contactId`; contact + amount change →
  amendment carries the new contact, no separate `setContact`.
- **`convertTransaction`**: converting a contact-bearing income↔expense
  preserves the contact (`toIncomeExpenseAmendment.contactId` / defaults seeded).
- **`ContactCombobox`**: select, search, clear to none; **creatable** — "Create
  'X'" appears only when no existing contact matches (case-insensitive), and
  choosing it calls `addEntry` and selects the new id.
- **`useCreateDictionaryEntry`**: `addEntry(dictId, {name, type:'item', parentId:null})`
  is called; returns the new `{id,name}`; invalidates `['configuration']`.
- **`MenuSearchList` (generalized)**: with `onCreate`, "Create 'X'" row appears
  only when no option matches (case-insensitive) and calls `onCreate(query)`;
  without `onCreate`, no create row (category picker unaffected); with
  `createHint`, the "Use: <hint>" affordance drops the normalized hint into the
  box and the box otherwise starts empty.
- **`IncomeExpenseForm` / dialogs**: submit with and without a contact; edit
  seeds from response; edit clears via "— none —"; **copy** carries the source
  contact; **refund** shows the field defaulting to none.
- **`TxContactQuickPicker`**: assign, clear, and create-and-assign (`onCreate` →
  create hook → `setContact`; transactions query invalidated) from the row menu.
- **`TxLabelQuickPicker` parity**: create-and-assign a label (`onCreate` →
  create hook → `setLabels` appends the new id) while preserving existing
  multi-toggle behavior.
- **filters**: `applyTransactionFilters` contact matching + transfer exclusion;
  `TransactionFilterBar` control.
- **`ProfileDictionariesPane`**: four tabs present in the specified order, each
  rendering the right `DictionaryList`, contact tab wired to `dictionaries.contact`.
- **E2E/verify**: create an expense with a contact, see the chip, filter by it,
  edit the amount and confirm the contact survives, manage the contact
  dictionary from its tab.

## Out of scope

- Server-side contact filter and any spend-by-contact report (no backend
  endpoint; deferred to a future issue).
- Auto-creating contacts from import (backend is match-only by design). Note the
  web _create-and-assign_ path (§3a) is explicit, human-confirmed creation — not
  auto-create — and does not touch the import pipeline.
- A bulk "review unmatched descriptions → promote to contacts" screen (the
  heavier future path the backend spec defers); §3a is the lightweight
  per-transaction alternative.
- Resolved contact name on the transaction DTO (id-only by design).
- Contact on transfers/adjustments or per-allocation contacts.
