---
status: draft
---

# File-Provider Account Mapping & Multi-File Import

Brings **file-import** bank providers (e.g. PrivatBank) to parity with **pull** providers
(e.g. Monobank) so that internal-transfer detection — shipped for the pull path in
server-infra PR #143 — also works for file providers, with **no provider-specific code**.

This is a cross-repo feature: a thin, generic **backend** addition in `server-infra`
(prerequisite) plus **web-client** reuse in this repo. The backend transfer-detection
mechanism itself already exists (PR #143); this feature only supplies the missing
*account-enumeration + mapping + batching* plumbing that the file transport lacks.

## Problem

server-infra PR #143 detects an internal transfer between two of a user's linked accounts
at import time and posts a single `Transfer` instead of a double-booked income + expense.
It works end-to-end for **pull** providers with no web change, because pull providers can:

1. **enumerate their accounts** (`PullCapability.fetchAccounts` → `GET …/external-accounts`),
   which `LinkAccountsDialog` uses to build the connection's `accountMap`
   (`externalAccountId → local accountId`); and
2. **import all of a connection's accounts in one batch** (`importConnection` fetches every
   linked account, then imports once), so both legs of a transfer are present together and
   pair.

**File providers can do neither today.** They have no `fetchAccounts`, so
`LinkAccountsDialog` is gated to `supportsPull` and a file connection is instead forced to
map an entire file to **one** account via a `'statement'` sentinel key
(`BankConnectionDialog.tsx`). And each import is a **single** uploaded file, so a transfer
whose two legs live in two per-card statements never lands in one batch. Consequences:

- A file connection cannot map multiple cards to multiple accounts.
- Transfers in file imports are never detected (both legs never share a batch) unless the
  user manually merges statements into one multi-account file — a workaround we explicitly
  do not want to require.

## Goals

- Give **file** providers a generic account-enumeration capability (the file analog of
  `fetchAccounts`), reusing the existing statement parsers — **no new per-provider code**.
- Let a file connection hold a real many-to-one `accountMap` (multiple card masks → local
  accounts), built through the **existing** `LinkAccountsDialog` + `setAccountMap`.
- Let the user **upload multiple statement files in one import**, so the backend batches
  them together and transfers pair — eliminating the manual-merge requirement.
- Preserve the app's existing information architecture: **profile = configuration; the
  accounts view = transaction-creating actions** (both import actions — `SyncNowButton`,
  `ImportStatementButton` — already live in the accounts view, while connection config /
  account linking / MCC mapping live in profile).
- **One unified mechanism; single-file import still works.** There must be a *single*
  import + mapping path, not a separate single-account special-case. A single-file import is
  simply the N = 1 case of the same multi-file mechanism (parse → route by real
  `externalAccountId` → import); a one-account connection is just an `accountMap` with one
  real-mask entry. No sentinel branch, no dual code path.

## Non-goals

- **Cross-currency** and **cross-provider** transfer detection (unchanged from PR #143).
- Any **provider-specific** UI or parsing (no card-mask templates, no manual mask entry).
- Changing how **pull** sync works functionally — it already imports the whole connection
  in one batch; this feature only aligns where the action is surfaced.

## Architecture — restore pull/file symmetry

The capability model is asymmetric: pull can enumerate accounts and batch-import; file
cannot. Two generic additions close the gap, both derived from machinery that already
exists:

| Concern | Pull (today) | File (this feature) |
|---|---|---|
| Enumerate accounts | `fetchAccounts` (live API) → `GET …/external-accounts` | Parse an uploaded statement via existing `parsers` → `POST …/external-accounts/from-file` |
| Map accounts | `LinkAccountsDialog` + `setAccountMap` | **same** dialog + endpoint (un-gated) |
| Import as one batch | `importConnection` fetches all accounts, imports once | `POST …/import/file` accepts **multiple** files → concat → one `importMany` |

The account-map **save** path (`setBankConnectionAccountMap`) is already transport-neutral
and many-to-one capable (proven in PR #143). Only the **enumeration** and **batching**
inputs are missing, and both fall out of the existing `FileImportCapability.parsers`.

---

## Backend changes (`server-infra` — prerequisite, separate PR)

### B1. File-provider account discovery (the `fetchAccounts` analog)

New endpoint `POST /api/banking/connections/:id/external-accounts/from-file` — multipart,
one or more statement files + a `format`. The handler resolves the connection's
`FileImportCapability`, parses each file with the existing `parsers[format]`, and returns
the **distinct** external accounts across all rows as `[ExternalAccountDTO]`:

- `externalId` = the real external account id the parser emits (for PrivatBank, the `Картка`
  mask, e.g. `"5169 **** **** 1440"`);
- `currency` = mapped from the row `currencyCode`;
- `maskedPan` = the mask; `iban` = `""`; `balance` = `0` (display-only, unknown from a
  statement).

**No new capability field** — this is a pure derivation from parser output (`StatementParser`
already yields `BankTransaction`s carrying `externalAccountId` + `currencyCode`), so it is
generic to every file provider. Reuses the existing pull `ExternalAccountDTO` shape and the
existing "list external accounts" web contract.

Note: discovery lists only accounts that have **activity in the uploaded file(s)** (they're
derived from parsed rows), unlike pull's `fetchAccounts` which lists all accounts. A card
with no transactions in the uploaded statement won't appear for mapping — inherent to the
file transport and acceptable (map it once a statement containing it is uploaded).

### B2. Multi-file import

`POST /api/banking/connections/:id/import/file` changes from a single raw body
(`postBinary`) to **multipart with 1..N files** (+ `format`). Each file is parsed
independently with the provider's parser; all resulting `BankTransaction`s are
**concatenated into one `importMany` batch** (so transfer legs across two files pair — the
file analog of `importConnection`'s fetch-all). Per-row parse failures aggregate across
files into the existing `unresolved`. `ImportResponse` shape is unchanged.

**No-regression:** N = 1 must behave identically to today's single-file import (one file →
parse → `importMany`). Multi-file is a strict superset.

### B3. Retire the `'statement'` sentinel — one routing rule

Today `importStatementFileHandler` has a single-entry special-case that routes **every** card
to the one target:

```haskell
accountLink = case writableMap of
  [(_, target)] -> [(cardId, target) | cardId <- distinct cards in file]  -- route-all
  _ -> writableMap
```

Drop it. Routing is always by the real `externalAccountId`, unmapped → `unresolved`, for
any number of mapped accounts (one or many):

```haskell
accountLink = writableMap  -- route each card by its real externalAccountId
```

This is the **single mechanism**: a one-account file connection is just an `accountMap` with
one real-mask entry (imports that card's rows), and a multi-account connection has several —
same code path. The `'statement'` sentinel and its special-case are removed. Per the
project's no-backward-compat stance, any existing sentinel-mapped connection re-maps via B1;
no migration/upcaster.

### Backend dependency & format note

Both B1 and B2 move from `OctetStream` to **multipart**, which the codebase does not use
yet — the plan must add `servant-multipart` (dependency in `package.yaml` + a multipart
request type in `Web/Types.hs`). **Format** stays as it is today: the web
`ImportStatementButton` hardcodes `format = "csv"` and both B1/B2 take a `format` param, so
no format-picker UI is introduced (consistent with the "no provider-specific UI" non-goal);
a provider whose files aren't CSV is a future concern.

### Backend testing (Hspec)

- Discovery handler: multiple files → distinct external accounts, currency mapped, dedup
  across files.
- Multi-file import: two files whose transfer legs live in different files → a single
  `Transfer`, correct balances, no External double-count.
- **Single-file (N = 1) import** goes through the same mechanism: a one-real-mask-entry
  connection imports that card's rows to its account; unmapped cards → `unresolved`. No
  sentinel, no separate single-file path.
- Routing: each card routes by its real `externalAccountId`; a card absent from the map →
  `unresolved` (never route-all-to-one).

---

## Web changes (this repo)

Guiding IA rule (an established convention of this codebase, not a written rule): **the
profile page configures; it does not create transactions.** Both existing import actions
(`SyncNowButton`, `ImportStatementButton`) live in the accounts view; profile holds only
connection config, account linking, and MCC mapping. Therefore *mapping/discovery* lives in
profile, and *importing* stays in the accounts view.

### W1. Generalize `LinkAccountsDialog` to both transports (profile — configuration)

Un-gate `LinkAccountsDialog` for file providers. Make its **row source** transport-aware:

- **pull:** `GET …/external-accounts` (as today);
- **file:** a **multi-file picker** that POSTs the selected statement(s) to **B1** and
  populates the same rows.

Everything else is unchanged — the per-row account `Select`, same-currency filtering,
duplicate-account disabling, and the `setAccountMap` save. Empty state for file: "Upload
your statement(s) to list accounts." The discovery upload **creates no transactions** — it
only lists accounts to map — so it is legitimately configuration and belongs in profile.

In `ProfileBankingPane.tsx`, the "Link accounts" trigger is un-gated from `supportsPull`
(shown for `supportsPull || supportsFile`).

### W2. `BankConnectionDialog` — drop the file-only single-account picker (profile)

Remove the `fileOnly` "Import into account" picker, its `'statement'` sentinel write
(`setAccountMap … { statement: accountId }`), the zod requirement (`bankConnectionSchema`),
and the edit-mode single-value read (`Object.values(accountMap)[0]`). A file connection is
created **unmapped**; its `accountMap` — one real-mask entry or many — is built afterwards
via **Link accounts** (W1). One card and many cards use the same path; there is no separate
single-account picker.

### W3. Multi-file import (accounts view — transaction-creating; unchanged home)

Extend the **existing** per-account `ImportStatementButton` (already in the accounts view,
gated on `supportsFile`) to accept **multiple** files (`<input multiple>`), sending them in
one multipart request to **B2**. It continues to resolve the connection via
`matchAccountConnection` and import the **whole connection** in one batch — the same
connection-wide semantics the pull `SyncNowButton` already has. No import action is added to
profile.

`src/api/banking.ts`: `importStatement` → multipart multi-file; new
`listExternalAccountsFromFile(connectionId, format, files)` (multipart). `ImportResponse` and
`ExternalAccountDTO` types reused unchanged.

### Pull path

Functionally unchanged. `SyncNowButton` already imports the whole connection in one batch;
no edit required. (Optional, non-blocking: relabel to "Sync connection" for clarity — left
out of scope unless desired.)

### Web testing (Vitest + MSW; strings hardcoded — no i18n)

- `LinkAccountsDialog`: file-provider discovery — upload → rows rendered from B1 fixture →
  `setAccountMap` PUT body asserts the many-to-one map; pull path unchanged.
- `BankConnectionDialog`: a file connection is created unmapped (no single-account picker,
  no `'statement'` write); "Link accounts" is reachable for file providers.
- `ImportStatementButton`: single-file selection produces a valid (N = 1) request through
  the same multipart path; multi-file selection produces one request with all files.
- Extend `e2e/banking.spec.ts` for the file connection: link accounts from an uploaded
  statement, then multi-file import.
- MSW handlers (`src/test/handlers.ts`) gain the B1 route and a multipart B2; fixtures
  (`src/test/fixtures.ts`) gain a file-discovery `ExternalAccountDTO[]`.

---

## End-to-end flow

1. **Configure (profile):** create the PrivatBank file connection (unmapped) → **Link
   accounts** → upload statement file(s) → dialog lists `…1440`, `…9713`, `…9959` → map
   `…1440→A`, `…9713→B`, `…9959→B` → save. One-time setup, mirrors pull's "Link accounts".
2. **Import (accounts view):** on an account of that connection, **Import statements** →
   select all statement files → one multipart batch → the `…1440↔…9713` transfer collapses
   to a single `Transfer`; siblings on B don't self-pair (different-local-account guard).
   Steady state: just import.

**Single-card users** use the same path with less in it: create the connection → **Link
accounts** → upload a statement → the one card is listed → map it → import a single file.
Same mechanism, one entry instead of several.

## Dependencies & sequencing

Backend B1–B3 land first (a `server-infra` PR); the web changes depend on those endpoints.
The web PR targets this repo's `master`. Builds on server-infra PR #143 (the transfer
detection + `TransactionInterpretation`/PrivatBank self-label matcher).

## Affected code

**server-infra:** `Web/API/BankingAPI.hs` (B1 handler, B2 multipart, B3 routing),
possibly `Web/Types.hs` (multipart request types); tests under `test/`.

**monorepo:** `src/features/profile/LinkAccountsDialog.tsx`,
`src/features/profile/BankConnectionDialog.tsx`,
`src/features/profile/bankConnectionSchema.ts`,
`src/features/profile/ProfileBankingPane.tsx`,
`src/features/accounts/ImportStatementButton.tsx`,
`src/features/banking/useImportStatement.ts` (+ a new discovery hook),
`src/api/banking.ts`, `src/api/types.ts` (no shape changes expected),
`src/test/handlers.ts`, `src/test/fixtures.ts`, `e2e/banking.spec.ts`.
