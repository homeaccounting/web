---
status: in-progress
---

# Web: Universal provider-category map editor (MCC + label parity)

Tracker: homeaccounting/tracker#52 (label-key editor UX), delivered together
with the web side of homeaccounting/tracker#51 (provider category-signal
foundation). Backend foundation lands on server-infra
`feat/provider-category-signal`. Web branch: `feat/provider-category-map-editor`.

## 1. Problem & context

#51 unifies a provider's two ways of describing a transaction's category —
an ISO-18245 **MCC** (Monobank, Revolut, Wise) or the provider's **own label**
(PrivatBank's localized `Категорія`, Monzo's `eating_out`) — into **one domain
type** `BankProviderCategory = ByMcc MCC | ByLabel Text` and **one user-editable
map** `bankProviderExpenseCategoryMap :: Map BankProviderCategory CategoryId`,
seeded from banking defaults (universal MCC defaults ∪ each provider's label
defaults).

The backend map is already label-editable. What's missing is the **web UX**:
today the config editor (`MccMappingEditor`) only edits MCC keys, and the web
DTOs still use the pre-#51 shape (`mccExpenseCategoryMap`, `TransactionResponse.mcc`).

This work does both in one PR because they touch the same files:

1. **#51 web migration** — adopt the tagged provider-category wire contract.
2. **#52 editor** — let users edit **label** keys with full MCC parity.

## 2. Backend contract (already on `feat/provider-category-signal`)

- `BankProviderCategory` serialises as a **tagged value**:
  `{ "kind": "mcc",  "value": "0742" }` (zero-padded 4-digit MCC) or
  `{ "kind": "label", "value": "eating_out" }`.
- As a **map key** it serialises to a tagged **string**:
  `"mcc:0742"` / `"label:eating_out"` (split on the first `:` only, so labels
  containing colons round-trip). Source: `Domain/Core/Types.hs`
  (`renderBankProviderCategoryKey` / `parseBankProviderCategoryKey`).
- Config response: `configuration.banking.bankProviderExpenseCategoryMap ::
Map Text UUID` (tagged-string keys). Source: `Web/API/ConfigurationAPI.hs`
  (`BankingConfigurationDTO`, `toBankingDTO`).
- Update: `PUT …/configuration/banking` body
  `{ bankProviderExpenseCategoryMap?: Map Text UUID }` — absent means no change;
  present replaces the whole map. Keys validated via `parseBankProviderCategoryKey`.
- Transaction: `TransactionResponse.bankProviderCategory :: Maybe
BankProviderCategory` replaces the old flat `mcc :: Maybe Text`.

## 3. Design decision: one universal map, symmetric kinds

The client already gets **all** provider-category mappings — MCC and label
alike — from the single `bankProviderExpenseCategoryMap` field. There is no
separate enumeration endpoint for MCC codes, and there is none for labels
either: both kinds are **seeded into the same map** and rendered as rows.

Therefore labels are handled **identically** to MCC codes:

- **Discoverability** (#52's "re-point 'Дім та ремонт' / 'eating_out' without
  typing raw strings") is satisfied by the **seeded label rows** already present
  in the map — the user re-points a known label by changing its category
  dropdown, exactly like re-pointing a seeded MCC row.
- **No backend change.** A provider-grouped label picker / label-enumeration
  endpoint was considered and **rejected**: it breaks the MCC/label symmetry
  the unified map establishes, for no gain the seeded rows don't already provide.

## 4. Changes

### 4.1 DTOs — `src/api/types.ts`

- Add `export type BankProviderCategory = { kind: 'mcc' | 'label'; value: string }`.
- `TransactionResponse`: replace `mcc: string | null` with
  `bankProviderCategory: BankProviderCategory | null`.
- `BankingConfiguration`: `mccExpenseCategoryMap` → `bankProviderExpenseCategoryMap:
Record<string, UUID>` (tagged-string keys).
- `UpdateBankingRequest`: `mccExpenseCategoryMap?` →
  `bankProviderExpenseCategoryMap?: Record<string, UUID>`.
- Cite backend source locations in comments (project rule).

### 4.2 Key helpers + schema — `src/features/profile/bankConnectionSchema.ts`

- `renderBankProviderCategoryKey({kind, value}): string` → `"mcc:0742"` / `"label:…"`.
- `parseBankProviderCategoryKey(key): { kind, value }` — split on the **first** `:`
  only; unknown prefix is a parse failure. Mirrors the backend helpers.
- `mccRowSchema` → `bankProviderCategoryRowSchema`, discriminated on `kind`:
  `mcc` branch keeps `/^\d{4}$/`; `label` branch requires a non-empty trimmed
  string. `categoryId` stays a UUID.

### 4.3 Editor — rename `MccMappingEditor` → `BankProviderExpenseCategoryMapEditor`

(`src/features/profile/BankProviderExpenseCategoryMapEditor.tsx`)

- `Row = { kind: 'mcc' | 'label'; value: string; categoryId: string }`, seeded by
  parsing each map key with `parseBankProviderCategoryKey`.
- Flat list. Per row: a small **kind Select (MCC / Label)** that drives the value
  input — MCC = numeric 4-digit input (today's behavior); Label = free-text input
  — plus the category Select and remove button (unchanged).
- **Add mapping** appends a row defaulting to `kind: 'mcc'`.
- Save validates every row via `bankProviderCategoryRowSchema`, builds
  `Record<taggedKey, uuid>` with `renderBankProviderCategoryKey`, and rejects
  **duplicate tagged keys** (`mcc:5411` and `label:5411` are distinct). Emits
  `{ bankProviderExpenseCategoryMap: map }` via `useUpdateBanking`.
- `ProfileBankingPane` passes `c.banking.bankProviderExpenseCategoryMap`.

### 4.4 Transaction display — `src/features/transactions/EditTransactionDialog.tsx`

- The `currentTx.mcc` block reads `currentTx.bankProviderCategory`: `mcc` renders
  the code (as today); `label` renders the label text.

Naming: MCC is a global ISO-18245 namespace shared across MCC providers, whereas
labels are each bank provider's own vocabulary; the UI uses "Bank provider"
(matching the backend `BankProviderCategory` type) and names the target
explicitly as the **expense** category. The config card is titled "Bank provider
category → expense category". Editing the label case per provider is deferred to
a provider-qualified key (see §5).

### 4.5 Tests / fixtures / handlers

- `src/test/fixtures.ts`: `mcc: null` → `bankProviderCategory: null`; map field rename.
- `src/test/handlers.ts`: echo `bankProviderExpenseCategoryMap`.
- Update/extend `MccMappingEditor.test.tsx` (→ editor rename),
  `bankConnectionSchema.test.ts`, `useUpdateBanking.test.tsx` for tagged keys +
  label rows.

## 5. Out of scope

- Re-seeding existing users when a provider is added post-launch (#51: noted, not built).
- Provider-grouped label picker / label-enumeration endpoint (rejected — see §3).
- Monzo / Revolut / Wise providers (#53).

### Known limitation — labels are not provider-qualified (open)

The backend key `BankProviderCategory = ByMcc MCC | ByLabel Text` scopes MCC by
the global ISO namespace but keys labels by **bare text**, so all providers'
labels share one flat namespace. This is harmless while PrivatBank is the only
label provider, but two providers emitting the same label string would collide
(seed drop + provider-agnostic resolution). The robust fix is a
provider-qualified label — `ByLabel BankProviderId Text`, key
`"label:<provider>:<text>"` — which is a **backend #51/#53 key-model decision**
(web follows: 3-part label key + provider-grouped rows). Flagged; not yet
decided or built.

## 6. Testing strategy

- Unit: `parseBankProviderCategoryKey`/`renderBankProviderCategoryKey` round-trip (both
  kinds, colon-in-label); `bankProviderCategoryRowSchema` (valid/invalid mcc &
  label); editor seeds rows from tagged keys, adds/edits a label row, dedups on
  tagged key, emits correct payload.
- Component: transaction display renders mcc vs label.
- Verify: `just check` + `just test`; live-drive the editor against the running
  app to confirm a label row round-trips.
