# Contact Dictionary (web) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the optional per-transaction **contact** (counterparty) on income/expense in the web app — pick it on create/edit, see it on the row, quick-assign & create-from-hint from the context menu, filter by it — plus refactor the dictionaries editor into per-kind tabs (Expense / Income / Contact / Label).

**Architecture:** Mirror the existing `labels` machinery. Contact is a scalar `Maybe UUID`, edited through the dedicated `PUT /:id/contact` endpoint (like `setLabels`) — NOT via amendment — but because the backend's `AmendTransactionRequest.contactId` **clears on absence**, every amendment builder must resend the current contact. Creatable-picker + create-from-hint is generalized into the shared `MenuSearchList` and reused by both the Contact and Label context-menu pickers.

**Tech Stack:** React 18 + TypeScript (strict), TanStack Query, react-hook-form + Zod, shadcn/ui + Tailwind, Vitest + Testing Library + MSW, Playwright.

**Spec:** `docs/specs/2026-07-23-contact-dictionary-web-design.md`. **Backend authority:** `../server-infra/docs/specs/2026-07-22-contact-dictionary-design.md` (landed in release 0.9.0).

**Conventions (follow throughout):**

- Commit per task with Conventional Commits, scope `transactions` (or `configuration` for the dict-tab task): `feat(transactions): …`.
- Import via `@/…`, never deep relative paths.
- Run `just typecheck` and `just lint` clean before each commit; `just test` for the touched area.
- TDD: write the failing test, watch it fail, implement minimally, watch it pass, commit.

---

## Task 1: API DTOs + `setContact` client

**Files:**

- Modify: `src/api/types.ts`
- Modify: `src/api/transactions.ts`
- Modify: `src/test/fixtures.ts` (+ any inline full `TransactionResponse` literals in tests)
- Modify: `src/test/handlers.ts` (MSW `setContact` handler)
- Test: `src/api/types.test.ts`, `src/api/transactions.test.ts`

> **Why fixtures change here:** `TransactionResponse.contactId` is **required** (the backend always returns it), so the moment it lands, every full `TransactionResponse` literal that omits it fails `tsc`. `just typecheck` is a per-task gate, so those literals MUST be fixed in this task, not deferred.

- [ ] **Step 1: Write failing tests**

In `src/api/transactions.test.ts`, add an MSW-backed test asserting `setContact` PUTs to `/api/transactions/:id/contact` with `{ contactId }` and returns the response; add a test that `createIncome`/`createExpense` forward `contactId` in the body. In `src/api/types.test.ts` add a compile/round-trip assertion that a `TransactionResponse` fixture with `contactId: string | null` and an `ExpenseRequest`/`AmendTransactionRequest` with `contactId` type-check.

- [ ] **Step 2: Run to verify fail**

Run: `pnpm exec vitest run src/api/transactions.test.ts src/api/types.test.ts`
Expected: FAIL (`setContact` undefined / `contactId` not on types).

- [ ] **Step 3: Implement**

In `src/api/types.ts`:

- `ExpenseRequest`: add `contactId?: UUID | null;` (comment: `// backend Web/Types.hs ExpenseRequest.contactId :: Maybe UUID`). **Do NOT touch `IncomeRequest`** — it is `type IncomeRequest = ExpenseRequest & { relation? }` (types.ts:276), so it inherits the field. Leave `InternalTransferRequest` untouched.
- `TransactionResponse`: add `contactId: UUID | null;` (**required**; comment cite `Web/Types.hs TransactionResponse.contactId :: Maybe UUID`, id-only, no name).
- `AmendTransactionRequest`: add `contactId?: UUID | null;` with a comment: `// FULL desired state — absent/null CLEARS the contact; resend current to preserve (Web/Types.hs AmendTransactionRequest).`
- Add:

```ts
// Body for PUT /api/transactions/:id/contact — replaces or (via null) clears
// the contact on a Completed transaction. Mirrors SetTransactionLabelsRequest.
export interface SetTransactionContactRequest {
  contactId: UUID | null;
}
```

In `src/api/transactions.ts`: import `SetTransactionContactRequest`; add after `setLabels`:

```ts
setContact: (id: UUID, body: SetTransactionContactRequest) =>
  client.put<TransactionResponse>(`/api/transactions/${id}/contact`, body),
```

Fix fixtures/handlers so the whole project type-checks and existing HTTP-mocked tests stay green:

- `src/test/fixtures.ts` `transactionFixture` (near `labels: []`): add `contactId: null,`.
- Grep for other full literals and add `contactId: null`:
  `rg -l "transactionType:.*status:|labels: \[\]" src --glob '*.test.ts*'` is unreliable — instead run `just typecheck` after the type change and fix each reported inline `TransactionResponse` literal (expected in `diffTransaction.test.ts`, `convertTransaction.test.ts`, `ConvertTransactionDialog.test.tsx`, `EditTransactionDialog.test.tsx`, `CopyTransactionDialog.test.tsx`, `transactionFilters.test.ts`, `CancelTransactionDialog.test.tsx`, `useRefundSummary.test.tsx`, and `src/test/handlers.ts`). Add `contactId: null`.
- `src/test/handlers.ts`: add a `http.put('*/api/transactions/:id/contact', …)` handler returning the updated transaction (mirror the `labels` handler). MSW runs with `onUnhandledRequest: 'error'`, so this is required for Tasks 4 & 11 that follow.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run src/api/transactions.test.ts src/api/types.test.ts` → PASS. Then `just typecheck` (whole project) → clean.

- [ ] **Step 5: Commit** — `feat(transactions): add contactId DTOs and setContact client (tracker#41)`

---

## Task 2: Form schema + request/seed mappers

**Files:**

- Modify: `src/features/transactions/schema.ts`
- Test: `src/features/transactions/schema.test.ts`

- [ ] **Step 1: Write failing tests**

Assert: (a) `IncomeExpenseFormValues` default has `contactId: null`; (b) `toIncomeRequest({…, contactId: 'c1'})` includes `contactId: 'c1'`, and omits/nulls it when `null`; (c) `toIncomeExpenseFormValues(tx)` seeds `contactId` from `tx.contactId` (both a value and `null`).

- [ ] **Step 2: Run to verify fail** — `pnpm exec vitest run src/features/transactions/schema.test.ts` → FAIL.

- [ ] **Step 3: Implement**
- Add `contactId: z.string().nullable().default(null)` to the income/expense form schema (the object that yields `IncomeExpenseFormValues`). Also add `contactId: string | null;` to the hand-declared `IncomeExpenseFormValues` interface (schema.ts ~:56-66), since it is declared explicitly (not inferred).
- `IncomeExpenseInput` already `Omit`s only `labels`; `contactId` flows through. In `toIncomeRequest`, add `contactId: v.contactId ?? null,` to the returned object (send `null` for "no contact"; the backend treats absent/null identically). `toExpenseRequest` aliases `toIncomeRequest`, so it's covered.
- In `toIncomeExpenseFormValues`, add `contactId: tx.contactId ?? null,`.
- Do **not** add contact to `toTransferRequest`/`transferFormSchema`.
- **Fix every other full `IncomeExpenseFormValues` literal** so the whole project type-checks (the interface field is required). Don't rely on a hand-enumerated list — run `just typecheck` and add `contactId: null,` to each reported literal. Expect at least: `CreateIncomeDialog.tsx`, `CreateExpenseDialog.tsx`, `convertTransaction.ts` `toConvertIncomeExpenseDefaults` (Task 5 changes this to `tx.contactId`), `RefundTransactionDialog.tsx` `defaults` (Task 8 confirms it stays `null`), **and the test files with inline literals that aren't touched until later tasks**: `IncomeExpenseForm.test.tsx` (~5 literals), `diffTransaction.test.ts` (~5 literals), and `schema.test.ts`.

- [ ] **Step 4: Run to verify pass** — vitest PASS + `just typecheck` (whole project) clean.
- [ ] **Step 5: Commit** — `feat(transactions): thread contactId through form schema + mappers`

---

## Task 3: `diffTransaction` — preserve/change contact

**Files:**

- Modify: `src/features/transactions/diffTransaction.ts`
- Test: `src/features/transactions/diffTransaction.test.ts`

The rules (spec §2): amendment always carries `next.contactId`; a standalone `diff.contactId` is emitted only when the contact changed AND no amendment is emitted.

- [ ] **Step 1: Write failing tests** (in `diffTransaction.test.ts`, income/expense fixtures with `tx.contactId = 'c1'`):
  - contact-only change (`initial.contactId='c1'`, `next.contactId='c2'`, no amount change) → `diff.contactId === 'c2'`, `diff.amendment === undefined`.
  - amount change + unchanged contact → `diff.amendment.contactId === 'c1'` (preserved), `diff.contactId === undefined`.
  - amount change + contact change (`'c1'`→`'c2'`) → `diff.amendment.contactId === 'c2'`, `diff.contactId === undefined`.
  - clear contact only (`'c1'`→`null`) → `diff.contactId === null`, no amendment.

- [ ] **Step 2: Run to verify fail** — FAIL.

- [ ] **Step 3: Implement** in `diffIncomeExpense`:
- Add to `TransactionEditDiff`: `contactId?: UUID | null;`.
- Compute `const contactChanged = (next.contactId ?? null) !== (initial.contactId ?? null);`.
- In the `if (accountChanged || totalChanged)` branch, add `contactId: next.contactId ?? null,` to the `diff.amendment` object.
- After the amendment/allocations block, add:

```ts
// Contact edits go through the dedicated setContact endpoint (like labels), but
// only when no amendment is emitted — an amendment already carries contactId
// (absent would CLEAR it), so re-sending via setContact would be a redundant,
// audit-visible event. See spec §2.
if (contactChanged && !diff.amendment) diff.contactId = next.contactId ?? null;
```

- Note: `diffTransfer` does not get contact (transfers carry none), but if a transfer amendment is emitted it must NOT set contactId — leave it absent (a transfer never has a contact to clear).

- [ ] **Step 4: Run to verify pass** — PASS.
- [ ] **Step 5: Commit** — `feat(transactions): preserve/emit contactId in diffTransaction`

---

## Task 4: `useEditTransaction` — apply the contact sub-call

**Files:**

- Modify: `src/features/transactions/useEditTransaction.ts`
- Test: `src/features/transactions/useEditTransaction.test.tsx`

- [ ] **Step 1: Write failing test** — a diff with `contactId: 'c2'` triggers `api.setContact(id, { contactId: 'c2' })`; a diff with `contactId: null` sends `{ contactId: null }`; a diff without the key does NOT call `setContact`.

- [ ] **Step 2: Run to verify fail** — FAIL.

- [ ] **Step 3: Implement** — after the `diff.labels !== undefined` sub-call (~line 44):

```ts
// Presence, not truthiness — null is the explicit "clear contact".
if (diff.contactId !== undefined) apply(await api.setContact(id, { contactId: diff.contactId }));
```

- [ ] **Step 4: Run to verify pass** — PASS.
- [ ] **Step 5: Commit** — `feat(transactions): apply contactId edit via setContact in useEditTransaction`

---

## Task 5: `convertTransaction` — preserve contact across convert

**Files:**

- Modify: `src/features/transactions/convertTransaction.ts`
- Test: `src/features/transactions/convertTransaction.test.ts`

- [ ] **Step 1: Write failing tests**:
  - `toConvertIncomeExpenseDefaults(tx, …)` seeds `contactId: tx.contactId` for an income↔expense convert.
  - `toIncomeExpenseAmendment('income'|'expense', v, ext)` sets `contactId: v.contactId ?? null`.
  - (transfer target defaults `toConvertTransferDefaults` do NOT gain contact — assert no `contactId` key.)

- [ ] **Step 2: Run to verify fail** — FAIL.

- [ ] **Step 3: Implement**:
- In `toConvertIncomeExpenseDefaults`'s returned object add `contactId: tx.contactId ?? null,`.
- In `toIncomeExpenseAmendment`'s returned object add `contactId: v.contactId ?? null,`.
- Leave `toConvertTransferDefaults` / `toTransferAmendment` untouched.

- [ ] **Step 4: Run to verify pass** — PASS.
- [ ] **Step 5: Commit** — `feat(transactions): preserve contact when converting income/expense`

---

## Task 6: Generic `useCreateDictionaryEntry` hook

**Files:**

- Create: `src/features/configuration/useCreateDictionaryEntry.ts`
- Test: `src/features/configuration/useCreateDictionaryEntry.test.tsx`

Root-level `item` create for any dictionary, returning `{ id, name }`, invalidating `['configuration']` (model on `src/features/profile/useAddDictionaryEntry.ts`).

- [ ] **Step 1: Write failing test** — calling `mutateAsync({ dictId: 'contact', name: 'Silpo' })` POSTs to `/api/users/me/configuration/dictionaries/contact/entries` with `{ name: 'Silpo', type: 'item', parentId: null }`, returns `{ id, name }`, and invalidates `['configuration']` (assert via a refetch or a spy on `invalidateQueries`).

- [ ] **Step 2: Run to verify fail** — FAIL.

- [ ] **Step 3: Implement** — copy the shape of `useAddDictionaryEntry` but fix `type: 'item'`, `parentId: null`, and take `{ dictId, name }`:

```ts
export function useCreateDictionaryEntry() {
  const { tokenRef, signOut } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<AddEntryResponse, Error, { dictId: string; name: string }>({
    mutationFn: ({ dictId, name }) => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return configurationApi(client).addEntry(dictId, { name, type: 'item', parentId: null });
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['configuration'] }),
  });
}
```

- [ ] **Step 4: Run to verify pass** — PASS.
- [ ] **Step 5: Commit** — `feat(configuration): add generic useCreateDictionaryEntry hook`

---

## Task 7: `ContactCombobox` (creatable single-select)

**Files:**

- Create: `src/features/transactions/ContactCombobox.tsx`
- Test: `src/features/transactions/ContactCombobox.test.tsx`

Model on `CategoryCombobox` (own popup + outside-click + keyboard), but: value is `UUID | null`; first option is a **"— none —"** clear row; when the trimmed query matches no option name (case-insensitive), append a **"Create '<query>'"** row that calls `onCreate(query)`.

- [ ] **Step 1: Write failing tests**:
  - renders selected contact name; picking "— none —" calls `onChange(null)`.
  - typing a substring filters; picking an option calls `onChange(id)`.
  - typing a non-matching name shows "Create '<name>'"; activating it calls `onCreate('<name>')` (and does NOT call `onChange` directly — the parent selects the new id after create).
  - "Create" row is absent when a case-insensitive match exists or when `onCreate` is not provided.

- [ ] **Step 2: Run to verify fail** — FAIL.

- [ ] **Step 3: Implement** `ContactCombobox` with props:

```ts
interface ContactComboboxProps {
  options: DictionaryEntryResponse[];
  value: UUID | null;
  onChange: (id: UUID | null) => void;
  onCreate?: (name: string) => void | Promise<unknown>;
  placeholder?: string;
  id?: string;
  name?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-describedby'?: string;
}
```

Reuse `CategoryCombobox`'s open/query/active/keyboard/outside-click scaffolding. List = optional "— none —" row + filtered options + (when `onCreate` && trimmed query non-empty && no exact-ci match) a "Create '<query>'" row. Enter/click on the create row calls `onCreate(query.trim())` then closes. Keep the archived-value read-only branch from `CategoryCombobox` (a non-null value with no matching option renders "Archived contact").

- [ ] **Step 4: Run to verify pass** — PASS. `just lint`.
- [ ] **Step 5: Commit** — `feat(transactions): add creatable ContactCombobox`

---

## Task 8: Contact field in `IncomeExpenseForm` + wire all four dialogs

**Files:**

- Modify: `src/features/transactions/IncomeExpenseForm.tsx` (add `contacts` prop + field)
- Modify: `src/features/transactions/CreateIncomeDialog.tsx`, `CreateExpenseDialog.tsx`, `EditTransactionDialog.tsx`, `CopyTransactionDialog.tsx`, `RefundTransactionDialog.tsx`
- Test: `IncomeExpenseForm.test.tsx`, plus per-dialog tests as needed

- [ ] **Step 1: Write failing tests**:
  - `IncomeExpenseForm` renders a "Contact (optional)" field; submitting with a picked contact yields `contactId` in `onSubmit` values; the `onCreate` passed to the combobox is invoked when creating.
  - Edit dialog seeds the field from `tx.contactId`; Copy dialog seeds from source `tx.contactId`; Refund dialog renders the field defaulting to none.

- [ ] **Step 2: Run to verify fail** — FAIL.

- [ ] **Step 3: Implement**:
- `IncomeExpenseForm`: add prop `contacts: DictionaryEntryResponse[]` and `onCreateContact?: (name: string) => Promise<UUID | null>`. Add a `FormField name="contactId"` below the Labels field rendering `<ContactCombobox options={contacts} value={field.value ?? null} onChange={field.onChange} onCreate={async (name) => { const id = await onCreateContact?.(name); if (id) field.onChange(id); }} />`. **Do NOT call `useCreateDictionaryEntry` inside the render callback** — that violates the Rules of Hooks. The form only receives the `onCreateContact` callback.
- Each dialog (the hook lives at the dialog **body** level): `const create = useCreateDictionaryEntry();`, compute `const contacts = flattenDictionary(config?.dictionaries.contact);`, and pass `contacts` plus `onCreateContact={(name) => create.mutateAsync({ dictId: 'contact', name }).then((r) => r.id)}`.
- Create dialogs already build the request via `toIncomeRequest`/`toExpenseRequest` → `contactId` flows automatically (Task 2). Confirm `defaultValues.contactId` is `null` for create.
- Copy: its default values come from `toIncomeExpenseFormValues(sourceTx, …)` → carries `contactId` automatically.
- Refund: extend its `defaults` object with `contactId: null`.

- [ ] **Step 4: Run to verify pass** — PASS. `just typecheck` + `just lint`.
- [ ] **Step 5: Commit** — `feat(transactions): contact picker in income/expense form and dialogs`

---

## Task 9: Generalize `MenuSearchList` (onCreate + createHint)

**Files:**

- Modify: `src/features/transactions/MenuSearchList.tsx`
- Test: `src/features/transactions/MenuSearchList.test.tsx`

- [ ] **Step 1: Write failing tests**:
  - with `onCreate`: typing a non-matching name shows a "Create '<name>'" row that calls `onCreate('<name>')`; with a matching name, no create row; without `onCreate`, never a create row.
  - with `createHint='SILPO 123 KYIV'`: a "Use: SILPO 123 KYIV" affordance is shown; activating it fills the search box with the normalized hint (`'SILPO 123 KYIV'` → collapsed whitespace) and the box was empty before.

- [ ] **Step 2: Run to verify fail** — FAIL.

- [ ] **Step 3: Implement** — add optional props `onCreate?: (name: string) => void | Promise<unknown>` and `createHint?: string`. Add a normalize helper `const norm = (s: string) => s.trim().replace(/\s+/g, ' ')`. Render (when `createHint` non-blank) a small button above the list: `Use: {norm(createHint)}` that does `setQuery(norm(createHint))` and refocuses the input. In the list, when `onCreate` is set and `norm(query)` is non-empty and no option name equals it case-insensitively, append a final `<li>` "Create '<query>'" wired to `onCreate(norm(query))` on mousedown, and include it in Enter/Arrow navigation as the last active index. Keep existing `onPick` behavior unchanged. Category picker (no new props) is unaffected.

- [ ] **Step 4: Run to verify pass** — PASS.
- [ ] **Step 5: Commit** — `feat(transactions): make MenuSearchList creatable with an optional name hint`

---

## Task 10: `TxContactQuickPicker` + `TxLabelQuickPicker` create parity

**Files:**

- Create: `src/features/transactions/TxContactQuickPicker.tsx`
- Modify: `src/features/transactions/TxLabelQuickPicker.tsx`
- Test: `TxContactQuickPicker.test.tsx`, `TxLabelQuickPicker.test.tsx`

**Key rule (spec §3a):** `onCreate` only **creates the dictionary entry and returns its new id** — `(name: string) => Promise<UUID | null>`. The _assignment_ is owned by each picker so it flows through that picker's existing commit path (the label picker's serialized `commitChain`, NOT a separate `commitLabels` call — otherwise a create followed by a rapid toggle races two unserialized full-array PUTs and can drop a label; see spec §3a).

- [ ] **Step 1: Write failing tests**:
  - `TxContactQuickPicker`: renders a "Contact" submenu with the current contact marked selected; picking an option calls `onSelect(id)`; the "— none —"/clear row calls `onSelect(null)`; typing a new name + "Create" calls `onCreate(name)` and then the resulting id is passed to `onSelect`; `createHint` is forwarded.
  - `TxLabelQuickPicker`: creating a new label via the create row calls `onCreate(name)` and then appends the returned id **through the serialized commit chain** (assert the appended label is committed via the same `onCommit` path and shows checked); existing multi-toggle behavior unchanged.

- [ ] **Step 2: Run to verify fail** — FAIL.

- [ ] **Step 3: Implement**:
- `TxContactQuickPicker` (mirror `TxCategoryQuickPicker` but single-select-nullable): props `{ options, value: UUID | null, onSelect: (id: UUID | null) => void, onCreate: (name: string) => Promise<UUID | null>, createHint?: string }`. Use `MenuSearchList` with `isSelected={(id)=>id===value}`, `onPick={onSelect}`, `createHint`, plus a leading "— none —" affordance to clear (an extra menu item above `MenuSearchList`, calling `onSelect(null)`). Pass `onCreate={async (name) => { const id = await onCreate(name); if (id) onSelect(id); }}` so create-then-assign is one gesture. Icon: a counterparty glyph (e.g. `Users` or `Store` from lucide).
- `TxLabelQuickPicker`: add props `onCreate: (name: string) => Promise<UUID | null>` and `createHint?: string`. Forward `createHint` to `MenuSearchList`; wire `MenuSearchList`'s `onCreate` to a local handler that awaits `onCreate(name)` and, if it returns an id, **appends it through the same serialized `commitChain`/`selected` update used by `toggle`** (reuse/extract an `append(id)` that mirrors the add branch of `toggle`). Keep the existing toggle logic intact.

- [ ] **Step 4: Run to verify pass** — PASS.
- [ ] **Step 5: Commit** — `feat(transactions): contact quick-picker + label create-from-hint parity`

---

## Task 11: `ContactChip` + row display + context-menu wiring + create-and-assign

**Files:**

- Create: `src/features/transactions/ContactChip.tsx`
- Modify: `src/features/transactions/TransactionsPane.tsx`
- Test: `ContactChip.test.tsx`, `TransactionsPane.test.tsx`

- [ ] **Step 1: Write failing tests**:
  - `ContactChip`: given `contactId` + a `nameById` map, renders the contact leaf name with the full name as `title`; renders nothing when id absent from map or null.
  - `TransactionsPane`: an income row with `contactId` shows the chip near the labels; the row context menu has a "Set contact" submenu; picking commits via `setContact`; creating from the hint calls create-then-`setContact`; transfer/adjustment rows have no contact submenu.

- [ ] **Step 2: Run to verify fail** — FAIL.

- [ ] **Step 3: Implement**:
- `ContactChip` — model on `LabelChips` but single, with a leading lucide icon and a distinct neutral style (e.g. `bg-muted`), `title={fullName}`, showing `entryLeafName(fullName)`.
- `TransactionsPane`:
  - Contact options: `const contactOptions = useMemo(() => flattenDictionary(configuration?.dictionaries.contact), [configuration]);`
  - Name map already available via `useDictionaryEntryNames` (contact ids included). Render `<ContactChip contactId={t.contactId} nameById={nameById} />` beside `<LabelChips …>` in the description cell.
  - Add `const commitContact = (t, contactId: UUID | null) => edit.mutateAsync({ id: t.id, accountIds: affectedAccountIds(t), diff: { contactId }, onSubCallApplied: () => {} });`
  - Add a `const create = useCreateDictionaryEntry();` at the pane. Define a create-only helper that returns the new id (the pickers own the assign): `const createEntry = async (dictId, name) => { const r = await create.mutateAsync({ dictId, name }); return r.id; };`
  - In the context menu, gate the contact submenu the same way the sibling pickers are gated — `t.status === 'Completed' && (isIncome(t.transactionType) || isExpense(t.transactionType))` — and render `<TxContactQuickPicker options={contactOptions} value={t.contactId} onSelect={(id)=>commitContact(t,id)} onCreate={(name)=>createEntry('contact', name)} createHint={t.description} />`. `TxContactQuickPicker` calls `onSelect(newId)` itself after create (Task 10), so the pane does not double-commit.
  - Wire the existing `<TxLabelQuickPicker>` new props: `onCreate={(name)=>createEntry('label', name)}` (the label picker appends the returned id through its own serialized chain — Task 10) and `createHint={t.description}`. Do NOT call `commitLabels` from `onCreate`.

- [ ] **Step 4: Run to verify pass** — PASS. `just typecheck` + `just lint`.
- [ ] **Step 5: Commit** — `feat(transactions): show contact chip and quick-assign/create from the row menu`

---

## Task 12: Filter by contact (browser-side)

**Files:**

- Modify: `src/features/transactions/transactionFilters.ts`
- Modify: `src/features/transactions/TransactionFilterBar.tsx`
- Modify: `src/features/transactions/TransactionsPane.tsx` (default filter + pass options)
- Test: `transactionFilters.test.ts`, `TransactionFilterBar.test.tsx`

- [ ] **Step 1: Write failing tests**:
  - `applyTransactionFilters`: with `contactId: 'c1'`, keeps only rows whose `contactId === 'c1'`; excludes rows with a different/no contact (incl. transfers); empty `contactId` imposes no constraint.
  - `TransactionFilterBar`: renders a contact select (single, "any" default = id `''`) fed by contact options; choosing updates the filter.

- [ ] **Step 2: Run to verify fail** — FAIL.

- [ ] **Step 3: Implement**:
- `TransactionFilters`: add `contactId: string;` (`''` = no constraint). Update the default filter object in `TransactionsPane` to include `contactId: ''`.
- `applyTransactionFilters`: add `if (filters.contactId && row.contactId !== filters.contactId) return false;`.
- `TransactionFilterBar`: add a labeled `<select>` (or the existing select primitive) of contact options (value = id, plus an "Any contact" option with value `''`), driven from a new `contactOptions` prop. Wire in `TransactionsPane` passing `contactOptions`.
- **Update `activeFilterCount`** (TransactionsPane.tsx ~:239-243) to add `+ (filters.contactId ? 1 : 0)` so an active contact filter counts toward the collapsed "Filters" badge (TS won't catch this omission).

- [ ] **Step 4: Run to verify pass** — PASS.
- [ ] **Step 5: Commit** — `feat(transactions): filter transactions by contact`

---

## Task 13: Dictionaries editor → per-kind tabs

**Files:**

- Modify: `src/features/profile/ProfileDictionariesPane.tsx`
- Test: `src/features/profile/ProfileDictionariesPane.test.tsx` (create if absent)

- [ ] **Step 1: Write failing test** — the pane renders four tabs in order **Expense, Income, Contact, Label**; each tab panel renders a single `DictionaryList` with the matching `dictId`; the Contact tab is wired to `dictionaries.contact` with add label "Add contact"; the loading/error states still render.

- [ ] **Step 2: Run to verify fail** — FAIL.

- [ ] **Step 3: Implement** — replace the two-card layout with shadcn `Tabs` (`src/components/ui/tabs.tsx`): `Tabs defaultValue="expense"` → `TabsList` with `TabsTrigger`s (Expense/Income/Contact/Label in that order) → four `TabsContent`, each rendering one `DictionaryList` (`dictId` `expense`/`income`/`contact`/`label`, matching `title`/`addLabel`, `dict={c.dictionaries[dictId]}`). Keep the pane-level `isPending`/`isError` guards unchanged.

- [ ] **Step 4: Run to verify pass** — PASS. `just typecheck` + `just lint`.
- [ ] **Step 5: Commit** — `refactor(configuration): split dictionaries editor into per-kind tabs (tracker#41)`

---

## Task 14: Full check, release bump, and Playwright smoke test

**Files:**

- Modify: `package.json` (version bump)
- Modify: `src/test/handlers.ts` if MSW needs a `contact` dictionary / `setContact` handler for existing tests to stay green

- [ ] **Step 1: Full suite** — `just check` (typecheck + lint + format-check) then `just test`. Fix any drift (e.g. existing fixtures/handlers that now need `contactId: null` on `TransactionResponse` or a `contact` dictionary key). Expected: all green.

- [ ] **Step 2: Bump version** — `package.json` `0.2.0` → `0.3.0` (new feature). Commit: `chore(release): bump version to 0.3.0`.

- [ ] **Step 3: Playwright smoke test (backend running)** — Use the verify skill / Playwright MCP against the running backend. Sign in, then exercise:
  1. Profile → Dictionaries → **Contact** tab → add a contact ("Silpo").
  2. Create an **expense** with that contact; confirm the contact chip on the row.
  3. Right-click the row → **Set contact** → use the description hint → **Create** a new contact; confirm it's assigned.
  4. Right-click → **Labels** → create-from-hint a new label; confirm assigned.
  5. **Edit** the expense amount; confirm the contact survives (not cleared).
  6. Filter the list by the contact; confirm only matching rows show.
  7. Verify tab order Expense/Income/Contact/Label.

- [ ] **Step 4: Commit any test/handler fixes** — `test(transactions): update fixtures/handlers for contact`

---

## Notes / landmines

- **Amendment clears contact on absence** — the whole reason Tasks 3 & 5 set `contactId` on every income/expense amendment. Do not "simplify" by dropping it.
- **Presence vs truthiness** — `diff.contactId !== undefined` gates the sub-call; `null` is a legal value (clear). Same pattern as `diff.labels`.
- **`config.dictionaries.contact` may be `undefined`** until the first entry exists — `flattenDictionary(undefined) === []` and `<DictionaryList dict={undefined}>` render empty; don't special-case.
- **No server-side contact filter/report** — filtering is browser-side over the loaded window; do not invent a query param.
- **MSW handlers** — `onUnhandledRequest: 'error'`, so add a `PUT /api/transactions/:id/contact` handler and ensure the `configuration` fixture can include a `contact` dictionary where tests need it.
