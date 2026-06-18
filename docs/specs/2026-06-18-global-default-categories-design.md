---
status: draft
issue: 41
repos: [web, server-infra]
supersedes: []
---

# Global default income/expense categories

Promote the **default income category** and **default expense category** from
_banking-import_ settings to **global** user defaults, and relocate them in the
UI from the **Banking** tab to the **Dictionaries** tab.

Tracking: [#41](https://github.com/homeaccounting/web/issues/41). Builds on the
banking-configuration work ([#23](https://github.com/homeaccounting/web/issues/23))
and the Convert Transaction feature ([#20](https://github.com/homeaccounting/web/issues/20),
merged as web #42).

## Problem

Today `defaultIncomeCategory` / `defaultExpenseCategory` live inside the
`BankingConfiguration` sub-record and are only reachable when the banking
feature is enabled. They are generally useful — Convert (#20) already seeds the
target category from them as an interim source, and Create/Edit could too — so
they should be first-class **global** defaults independent of banking.

## Migration stance: hard breaking change

**The service has no production database.** There is no event history or wire
contract to preserve, so this is a clean breaking change:

- No event upcasting / replay-compat for the old `Banking*` events.
- No transitional dual wire shape — the response moves the fields and the old
  location is removed in the same change.
- Backend and web deploy together; web is MSW-testable before the backend lands.

Sequencing is **backend-first** (the backend defines the API contract), matching
the #23 convention.

## Desired state

- `defaultIncomeCategory` / `defaultExpenseCategory` are **top-level** config,
  available regardless of `bankingFeatureEnabled`.
- Surfaced under the **Dictionaries** tab (`ProfileDictionariesPane`) as a
  "Default categories" card, alongside the income/expense category dictionaries
  they reference.
- Bank import continues to consume them as its fallback — **no behavioural
  change to import**.
- Convert (#20) reads the new **global** defaults instead of `banking.*`.

---

## Backend (`server-infra`)

### Projection & aggregate (`Domain/Configuration/Projection.hs`)

- Move `defaultIncomeCategory :: !(Maybe CategoryId)` and
  `defaultExpenseCategory :: !(Maybe CategoryId)` **out of**
  `BankingConfiguration` and **onto** the top-level `Configuration` record.
- `BankingConfiguration` retains only `mccExpenseCategoryMap` + `connections`;
  drop the two fields from `emptyBankingConfiguration`.
- Add the two fields to `configurationDefault` (both `Nothing`).
- Update the event handlers (`handleConfigurationEvent`) to write the new
  top-level field instead of `config.banking.*`.

### Events (`Domain/Configuration/Events.hs`)

- Rename `BankingDefaultIncomeCategorySet` → `DefaultIncomeCategorySet` and
  `BankingDefaultExpenseCategorySet` → `DefaultExpenseCategorySet` (constructors,
  `deriveJSON`, the event sum-type entries). No compatibility shim for the old
  constructors (no prod history).

### Commands & handler (`Commands.hs`, `CommandHandler.hs`)

- Rename `SetBankingDefaultIncomeCategory` → `SetDefaultIncomeCategory` and
  `SetBankingDefaultExpenseCategory` → `SetDefaultExpenseCategory`.
- Update the command handler to emit the renamed events.
- Update the dictionary-entry deletion guard `isBankingDefault`
  (`CommandHandler.hs:142-145`) to read `config.defaultIncomeCategory` /
  `config.defaultExpenseCategory` (top-level) instead of `config.banking.*`.
  Rename it to `isGlobalDefault` and the corresponding error constructor
  `EntryIsBankingDefault` (raised at `:249`) → `EntryIsGlobalDefault` for
  consistency with the de-banking-ified concept.

### Read model (`Application/ReadModels/Configuration.hs`)

- Mirror the projection change: the read-model fold writes the two top-level
  fields; update the `BankingConfiguration` destructuring (`:72`).
- The read model consumes its **own** event-wrapper constructors
  `BankingDefaultIncomeCategorySetEvent` / `BankingDefaultExpenseCategorySetEvent`
  (`:60`, `:307`, `:320`), distinct from the `Domain/Configuration/Events.hs`
  constructors. Rename these to the global names too.

### Service layer (`Application/Services/ConfigurationService.hs`)

This is the file that emits the commands; all three call sites must be renamed
and repointed to the renamed `SetDefault*Category` commands:

- **Setter wrappers** (`:274-296`): `setBankingDefaultIncomeCategory` /
  `setBankingDefaultExpenseCategory` → `setDefaultIncomeCategory` /
  `setDefaultExpenseCategory`, emitting the renamed commands. These are what the
  new `/defaults` API handler calls.
- **Default-config seeding** (`:623-637`): user-bootstrap seeds Salary /
  "other-expense" as the defaults via these commands. Rename here too; the
  seeded global defaults are **preserved behaviour** (new users still get them,
  now as global rather than banking-scoped).
- **Clone path** (`:754-769`): repoint to the top-level fields and the renamed
  commands.

### Consumers (no behavioural change)

- `Application/Services/BankImportService.hs:209-210` — read the fallback
  category from `config.defaultIncomeCategory` / `config.defaultExpenseCategory`
  (top-level). Import behaviour is unchanged.

### API (`Web/API/ConfigurationAPI.hs`)

- `ConfigurationResponse`: add top-level `defaultIncomeCategory :: Maybe UUID`
  and `defaultExpenseCategory :: Maybe UUID`; **remove** them from the banking
  sub-DTO.
- **New endpoint** `PUT /api/users/me/configuration/defaults` with body
  `{ defaultIncomeCategory? :: Maybe UUID, defaultExpenseCategory? :: Maybe UUID }`
  (each field optional; **set-only** — a present UUID sets the field, absent/null
  is a no-op). Reuse the existing `validateFieldCtx`-based category-ID validation
  from the current banking handler. Clearing a default back to none is **not**
  supported (the current banking handler is already set-only — no `Unset`
  command/event exists); a clear path is a possible follow-up, out of scope here.
- The `PUT .../configuration/banking` request retains only `mccExpenseCategoryMap`.

### Backend tests

- Rename/adjust command, event, projection, and read-model specs for the
  renamed constructors and relocated fields.
- New spec for `PUT .../configuration/defaults` (set, clear, invalid category).
- Bank-import fallback spec stays green against the top-level field.
- Deletion-guard spec covers a category referenced by a global default.
- Config-seeding spec: a freshly bootstrapped user has the seeded global
  defaults (now top-level), not banking-scoped.

---

## Web (this repo)

### DTOs (`src/api/types.ts`)

- Add top-level `defaultIncomeCategory: UUID | null` and
  `defaultExpenseCategory: UUID | null` to `ConfigurationResponse`.
- Remove both fields from `BankingConfigurationDTO` and from
  `UpdateBankingRequest`.
- Add `UpdateDefaultsRequest { defaultIncomeCategory?: UUID | null;
defaultExpenseCategory?: UUID | null }`.

### API client & hook

- `src/api/configuration.ts`: add `updateDefaults(body)` →
  `PUT /api/users/me/configuration/defaults`. `updateBanking` keeps only the
  MCC map.
- New `src/features/configuration/useUpdateDefaults.ts` mirroring
  `useUpdateBanking` (invalidates `['configuration']`).

### Components

- Extract `DefaultCategoryField` out of `MccMappingEditor.tsx` into its own file
  `src/features/profile/DefaultCategoryField.tsx`, rewired to `useUpdateDefaults`
  and `UpdateDefaultsRequest`. `MccMappingEditor` keeps only the MCC table.
- Move the **"Default categories"** card from `ProfileBankingPane` into
  `ProfileDictionariesPane` as a third card (after Categories and Labels),
  bound to the top-level `c.defaultIncomeCategory` / `c.defaultExpenseCategory`.
  It is **ungated** from `bankingFeatureEnabled`.

### Convert (#20)

- `src/features/transactions/ConvertTransactionDialog.tsx:130-132` — read
  `config?.defaultIncomeCategory` / `config?.defaultExpenseCategory` (top-level)
  instead of `config?.banking.*`.

### Create (income/expense)

- `CreateExpenseDialog.tsx` / `CreateIncomeDialog.tsx` — seed the form's
  `category` default from `config?.defaultExpenseCategory` /
  `config?.defaultIncomeCategory` (empty string when unset). Edit is left
  untouched (it keeps the transaction's existing category).

### Web tests

- Update `ProfileBankingPane.test` (card removed), `ProfileDictionariesPane.test`
  (card added, works with banking disabled), `MccMappingEditor.test`
  (DefaultCategoryField extracted out).
- Add `useUpdateDefaults.test` and a `DefaultCategoryField.test`.
- Update the convert spec / fixtures to the top-level defaults.
- Update `EditTransactionDialog.test.tsx` (`:69-72`), which sets the fields under
  `banking` in its inline ConfigurationResponse override.
- Update MSW handlers/fixtures in `src/test` (`fixtures.ts:97-100`,
  `handlers.ts:285-289`) to the new response shape and the `/defaults` endpoint.

---

## Out of scope

- Wiring the global defaults into the **Edit** transaction flow (Edit keeps the
  transaction's existing category). Create now seeds them; see above.
- Any change to bank-import behaviour beyond the field relocation.
