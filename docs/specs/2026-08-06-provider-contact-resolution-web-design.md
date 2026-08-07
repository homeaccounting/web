---
status: draft
---

# Web: provider-contact resolution (map editor + inline map-to-contact)

Tracker: homeaccounting/tracker#54 (web scope). Backend foundation is **already
merged** on server-infra (design:
`server-infra/docs/specs/2026-08-06-provider-contact-signal-design.md`; plan:
`.../docs/plans/2026-08-06-provider-contact-signal.md`). Web branch:
`feat/provider-contact-map`.

This mirrors the already-shipped web side of #51/#52 (provider-category map
editor, PR #84 / `feat/provider-category-map-editor`), applied to **contacts**
instead of categories — and it is deliberately _simpler_ than that predecessor.

## 1. Problem & context

Import used to resolve a transaction's contact by matching the bank description
**text** against contact-dictionary **names** — fragile, provider-dependent, and
broken the moment a user renames a contact. #54's backend replaced that with the
same foundation #51 gave categories: providers emit a name-agnostic counterparty
**token**, persisted verbatim, resolved by one user-editable map.

The merged backend exposes two new wire facts the web must consume:

- **Per transaction:** `TransactionResponse.bankProviderContact :: Maybe
BankProviderContact` — the raw provider token, serialised as a **plain string**
  (`"MagazinREMONTI"`, `"Магазин РЕМОНТІ"`) or `null`
  (`server-infra/src/Web/Types.hs:693`).
- **In banking config:** `BankingConfigurationDTO.contactMap :: Map Text UUID`
  and `UpdateBankingRequest.contactMap :: Maybe (Map Text UUID)`
  (`server-infra/src/Web/API/ConfigurationAPI.hs:314,565`). Keys are the **bare
  trimmed token** — no `mcc:`/`label:` tag (the token is a `newtype`, not a sum).
  Values are contact dictionary-entry ids (`ContactId = DictionaryEntryId`).

The web today has neither field, and no UI to view/edit the contact map.

### How this differs from the #52 predecessor (all simplifications)

| Aspect                   | #52 (categories)                           | #54 (contacts)                |
| ------------------------ | ------------------------------------------ | ----------------------------- |
| Key shape                | tagged `mcc:`/`label:`                     | bare trimmed token            |
| Row editor               | kind `Select` + MCC/label `Input`          | single token `Input`          |
| Key render/parse helpers | `renderBankProviderCategoryKey` / `parse…` | none — key **is** the token   |
| Value target             | expense-category dictionary                | contact dictionary            |
| Seed                     | universal MCC ∪ provider-label defaults    | **empty** (100% user-curated) |
| Transaction signal JSON  | tagged `{kind,value}` object               | plain string                  |

## 2. Scope

**In scope (web):**

1. DTO/type parity in `src/api/types.ts` for the three fields above.
2. Reorganise `ProfileBankingPane` into **sub-tabs** so a potentially large
   contact map lives on its own tab (Connections / Expenses / Contacts).
3. A **contact-map editor** on the Contacts sub-tab.
4. An **inline "Map to contact…" affordance** on the transaction edit dialog that
   maps the surfaced token to a contact (view/add/re-point per the tracker's
   "surface unmapped tokens so the user can map them").
5. Tests + fixtures.

**Out of scope (confirmed with the backend spec):**

- A dedicated **unmapped-token worklist**. Considered and dropped: the backend has
  no aggregate "distinct unmapped tokens" endpoint, so a worklist would require
  scanning the paginated transaction list client-side (incomplete if bounded,
  heavy if exhaustive). The inline affordance surfaces the token exactly where the
  user already sees the transaction, needs no scan, and is fully correct.
- **Auto-suggesting** a contact for an unmapped token (name-similarity hint) —
  backend spec lists this as later work.
- Any change to the per-transaction contact field (that flow already exists in the
  edit form). The inline affordance writes only the **global map**.

## 3. DTO / type changes (`src/api/types.ts`)

Additive, cite the backend source in comments (per repo convention):

- `TransactionResponse.bankProviderContact: string | null` — plain string; mirrors
  `Web/Types.hs` `TransactionResponse.bankProviderContact :: Maybe
BankProviderContact` (plain-string JSON instance, unlike the tagged
  `bankProviderCategory`).
- `BankingConfigurationDTO.contactMap: Record<string, UUID>` — bare-token keys;
  mirrors `ConfigurationAPI.hs` `BankingConfigurationDTO.contactMap`.
- `UpdateBankingRequest.contactMap?: Record<string, UUID>` — present replaces the
  whole map (set-semantics, like `expenseCategoryMap`); absent = no change.

## 4. Navigation — Banking sub-tabs

`ProfileBankingPane` currently stacks two `Card`s (connections + expense-category
map). Split them into a second-tier `Tabs`, following the **Reports** precedent
(`src/features/reports/ReportsPane.tsx`): `variant="underline"`, active section
persisted in the URL via `useSearchParams` (`?section=…`), default `connections`.

- **Connections** — the existing `ConnectionRow` list + "Add connection" (moved
  verbatim).
- **Expenses** — the existing `BankProviderExpenseCategoryMapEditor` (moved
  verbatim; still fed `expenseCategoryMap` + the `expense` dictionary).
- **Contacts** — new: `BankProviderContactMapEditor` fed `contactMap` + the
  `contact` dictionary, with a one-line note that mappings apply to **future
  imports**.

No route change: `/profile/:tab` stays; the section is a search param
(`/profile/banking?section=contacts`). The top-level `banking` tab and its
feature-flag gate in `ProfilePage` are untouched.

### Interaction with the two-tier tab tokens

Reuse the existing `Tabs`/`TabsList variant="underline"` primitives. The default
(`connections`) must apply for both an absent and an unrecognised `section` value,
so a stale/hand-edited URL never renders an empty pane.

## 5. Contact-map editor (`BankProviderContactMapEditor.tsx`)

A simpler sibling of `BankProviderExpenseCategoryMapEditor`. Local `Row[]` state
seeded from the `contactMap` prop; Save builds one `Record<string, UUID>` and
calls `useUpdateBanking({ contactMap })`.

```
interface Row { token: string; contactId: string; }
```

Each row renders:

- a **plain-text token `Input`** (no kind selector, no tag) — placeholder
  "Provider counterparty token";
- a **creatable `ContactCombobox`** (reused verbatim) over the `contact`
  dictionary entries: pick an existing contact **or** type a new name to create it
  inline. Create delegates to `useCreateDictionaryEntry()` — called
  `create.mutateAsync({ dictId: 'contact', name, dict })` with the contact
  dictionary tree for full-path nesting parity — then selects the returned id,
  the same create-and-assign path the transaction quick-pickers use. Note this
  swaps the predecessor's plain `Select` value control for a richer combobox; the
  combobox renders an unknown committed id as "Archived contact", which keeps a
  mapping whose contact was later deleted visible rather than silently blanking.
  **Empty-string coercion (required):** `ContactCombobox`'s archived branch fires
  for any non-`null` value with no matching option — including a fresh row's
  `contactId: ''` — so an unmapped new row must pass `value={row.contactId ||
null}` (coerce `'' → null`), mirroring how the category editor coerces
  `row.categoryId || undefined` for its `Select`. Without this a new row renders as
  an uneditable "Archived contact" box.
- a **delete** (`Trash2`) ghost button.

"Add mapping" appends an empty row; "Save mapping" validates and persists:

- trim each token; **reject blank** tokens and rows with no `contactId` (surface
  the first offending row's message in a destructive `Alert`, matching the
  category editor);
- **duplicate-token guard** — two rows with the same trimmed token is an error
  (`Duplicate mapping: <token>`), since a `Record` would silently collapse them;
- on success, `useUpdateBanking` invalidates `['configuration']` and a success
  toast fires.

Empty map → `EmptyState message="No mappings yet."` (parity with the category
editor). No seed rows (the backend map starts empty).

**Validation lives in a Zod schema** in `bankConnectionSchema.ts`
(`bankProviderContactRowSchema`: non-blank trimmed `token`, uuid `contactId`),
mirroring `bankProviderCategoryRowSchema` — so the editor stays presentational and
the rule is unit-testable in isolation.

## 6. Inline "Map to contact…" (transaction edit dialog)

`EditTransactionDialog`'s header already renders a read-only `bankProviderCategory`
line reading only `currentTx.bankProviderCategory`. Add a sibling block for
`currentTx.bankProviderContact`. Unlike the category line this one needs config
(to know whether the token is mapped and to resolve the contact name) — reuse the
existing `const { data: config } = useConfiguration()` already in the component (no
new call needed) plus `flattenDictionary(config?.dictionaries.contact)`:

- **config not yet resolved** (`config` is `undefined` while loading) → render the
  token **read-only** (`Imported · Counterparty <token>`) with **no** mapper. This
  avoids a flash of "unmapped" and, critically, prevents the mapper from writing
  `{ ...contactMap, [token] }` against an undefined map.
- **token present and already a key in `banking.contactMap`** → read-only:
  `Imported · Counterparty <token> → <contact name>` (resolve the mapped id
  against the `contact` dictionary; fall back to a generic "mapped contact" label
  if archived). Token shown `select-all font-mono`, matching the category line.
- **token present and unmapped** → `Imported · Counterparty <token>` **plus** a
  compact creatable `ContactCombobox` labelled "Map to contact…". Committing a
  contact `C` (existing or freshly created) calls `update.mutate({ contactMap: {
...config.banking.contactMap, [token]: C } })` — a single set-semantics write
  that merges the new entry into the current map (the payload goes to `.mutate`,
  not the hook). Create-and-map threads `dict` for parity as in §5. On success the
  header flips to the read-only mapped state (the config query re-fetches).
- **token absent** (`null`) → render nothing (manual entries, transfers,
  adjustments, providers that emit no token).

This affordance is **independent of the form's own contact field** — it curates
the global map for future imports and does not touch this transaction's
`contactId`. A short helper/tooltip states "Applies to future imports of this
merchant." No re-resolution of already-imported transactions (the backend resolves
at import time only — same semantics as the category map).

## 7. Testing (TDD, red-before-green)

- **`bankConnectionSchema.test.ts`** — `bankProviderContactRowSchema` accepts a
  trimmed token + uuid; rejects blank/whitespace token and missing contactId.
- **`BankProviderContactMapEditor.test.tsx`** — seeds rows from `contactMap`;
  add/edit/remove; Save calls `useUpdateBanking` with the assembled map;
  duplicate-token guard blocks + surfaces error; create-and-map path calls
  `useCreateDictionaryEntry` then includes the new id; empty state; **a newly
  added row renders an editable combobox, not the "Archived contact" box** (guards
  the `'' → null` coercion).
- **`ProfileBankingPane.test.tsx`** — sub-tab presence + labels; `?section=`
  drives the active pane; unknown/absent section falls back to Connections;
  Contacts pane renders the editor fed `contactMap` + contact dictionary.
- **`EditTransactionDialog.test.tsx`** — unmapped token renders the creatable
  mapper and committing writes the merged `contactMap`; mapped token renders the
  read-only "→ contact" line; `null` renders neither; **while config is
  unresolved the token shows read-only with no mapper**.
- **`src/test/fixtures.ts`** — every `TransactionResponse` fixture gains
  `bankProviderContact: null`; the banking-config fixture gains `contactMap: {}`.
  (These break existing type-checks until added — do them first, red-before-green
  for the DTO change.)

## 8. Backward compatibility & migration

Pure web-client change consuming an already-deployed backend. No web migration.
The backend's one-time DB-recreate exception is recorded on the server-infra side
(folded into #51's reset) and needs no web action.

## 9. Files touched

- `src/api/types.ts` — 3 additive fields.
- `src/features/profile/ProfileBankingPane.tsx` — sub-tabs; move existing cards.
- `src/features/profile/BankProviderContactMapEditor.tsx` — **new**.
- `src/features/profile/bankConnectionSchema.ts` — add `bankProviderContactRowSchema`.
- `src/features/transactions/EditTransactionDialog.tsx` — inline map-to-contact.
- `src/test/fixtures.ts` — new fields.
- Tests alongside each of the above.

Reused as-is: `ContactCombobox`, `useCreateDictionaryEntry`, `useUpdateBanking`,
`flattenDictionary`, `Tabs`/`TabsList variant="underline"`, `EmptyState`, `toast`.
