---
status: completed
date: 2026-08-08
---

# PrivatBank Business (XLSX) statement import — web support (tracker#46)

## Problem

The backend has landed `privatbank-business` as a new bank provider slug that
imports statements from the **XLSX** export of Приват24 для бізнесу
(server-infra spec `2026-08-07-privatbank-business-file-import-design.md`). It is
registered as a **file-import** provider (`pull = Nothing`,
`fileImport = Just … StatementXlsx`). The file-import endpoints take the format
as a query param that the backend parses to a `StatementFormat`
(`Web/API/BankingAPI.hs`: `parseUrlPiece "csv" = StatementCsv`,
`parseUrlPiece "xlsx" = StatementXlsx`).

The web's banking surfaces are **already provider-agnostic** and need no change
to _discover_ or _connect_ this provider:

- The provider picker (`BankConnectionDialog.tsx`) is populated from
  `useProviders()` (`GET …/configuration/banking/providers`), so
  `privatbank-business` appears automatically once the backend runs with
  `BANKING_PRIVATBANK_BUSINESS_ENABLED=true`.
- File-only providers already connect cleanly: the dialog hides the token field
  when `!supportsPull` and creates the connection unmapped, with the account map
  built afterwards via "Link accounts".
- Multi-account mapping (`LinkAccountsDialog.tsx`) already renders one row per
  external account (the XLSX carries multiple of the user's own accounts via
  col M / IBAN), filters candidate local accounts by currency, and saves the
  many-to-one `accountMap`.
- Dedup, the import summary, and transaction rendering are all format-neutral.
  The Phase-2 cross-currency conversion → single `Transfer` is entirely
  backend-side; the web renders the resulting `Transfer` transactions with no
  change.

The **only** blocker is that the two file-upload surfaces hardcode CSV:

1. `src/features/accounts/ImportStatementButton.tsx` —
   `accept=".csv,text/csv"` and `format: 'csv'`.
2. `src/features/profile/LinkAccountsDialog.tsx` (the file-discovery upload) —
   `accept=".csv,text/csv"` and `format: 'csv'`.

An XLSX statement cannot be selected (the file dialog filters it out), and even
if selected it would be sent as `format=csv` and rejected by the backend parser.

## Decision: infer the statement format from the file extension

The provider DTO (`BankProviderDTO`) exposes only `supportsPull` / `supportsFile`
— **not** which statement format(s) a provider accepts. Rather than reopen the
"landed" backend to add a formats field, or hardcode a provider→format map on the
web (the exact provider-specific coupling the registry design avoids), the web
**derives the format from the picked file's extension**: `.xlsx → xlsx`,
`.csv → csv`.

This is fully provider-agnostic and future-proof: any new CSV- or XLSX-based file
provider works with **zero** further web change. The tradeoff — a file whose
extension does not match the provider's parser (e.g. a `.csv` at an xlsx-only
provider) — fails server-side with a per-file `ParseError`, surfaced through the
existing `ApiError`/toast path. That is an acceptable, clearly-messaged failure,
not silent corruption.

## Design

### New shared helper — `src/features/banking/statementFormat.ts`

A single module owns the extension↔format knowledge so both upload surfaces stay
in lockstep:

- `STATEMENT_FILE_ACCEPT: string` — the `accept` attribute value covering both
  formats, e.g.
  `'.csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'`.
- `statementFormatForFiles(files: File[]): { format: string } | { error: string }`
  — case-insensitively maps each file's extension to `'csv'` / `'xlsx'`. All
  files in one request share a single `format` query param (the backend
  concatenates them into one batch), so:
  - empty selection → caller does nothing (guarded upstream, but the helper
    returns an `error` for defensiveness);
  - a single format across all files → `{ format }`;
  - **mixed** extensions, or an **unrecognized** extension → `{ error }` with a
    user-facing message (e.g. "Select statement files of the same type
    (.csv or .xlsx)."). The caller surfaces it and sends no request.

Returning a discriminated result (not throwing) keeps both call sites simple and
uniformly testable.

### `ImportStatementButton.tsx`

- `accept` → `STATEMENT_FILE_ACCEPT`.
- In `onFileSelected`, after collecting `files`, call `statementFormatForFiles`.
  On `error`, `toast.error(message)` and return. On success, pass the derived
  `format` to `importStatement.mutate` instead of the literal `'csv'`. Everything
  else (single batched request, success/`ApiError` toasts) is unchanged.

### `LinkAccountsDialog.tsx`

- The file `<Input accept>` → `STATEMENT_FILE_ACCEPT`.
- In the `onPickFiles` handler, call `statementFormatForFiles`. On `error`,
  surface it (a local error state rendered in the existing error `Alert`, or a
  toast — implementation detail for the plan) and do not call the mutation. On
  success, pass the derived `format` to
  `fromFile.mutate({ connId, format, files })` instead of `'csv'`.

### Data flow (unchanged past the format string)

```
pick file(s) → statementFormatForFiles → format ∈ {csv, xlsx}
  ImportStatementButton → POST …/connections/:id/import/file?format=<fmt>
  LinkAccountsDialog     → POST …/connections/:id/external-accounts/from-file?format=<fmt>
```

Multi-account rows, currency filtering, `accountMap` save, dedup, and the
cross-currency `Transfer` are all handled as they are today.

## Testing (TDD)

- **Unit — `statementFormat.test.ts`**: `.xlsx`/`.XLSX` → `xlsx`; `.csv`/`.CSV`
  → `csv`; a mix of `.csv` + `.xlsx` → `error`; an unrecognized extension
  (`.txt`) → `error`; empty array → `error`.
- **Component — `ImportStatementButton.test.tsx`**: selecting an `.xlsx` file
  issues the import request with `format=xlsx` (assert the query param via the
  MSW handler); selecting mixed files shows an error toast and issues **no**
  request; the existing CSV path still sends `format=csv`.
- **Component — `LinkAccountsDialog.test.tsx`**: for a file provider, uploading
  an `.xlsx` calls the from-file discovery with `format=xlsx`; the existing CSV
  behavior is preserved.
- **MSW handlers** (`src/test/handlers.ts`) for `…/import/file` and
  `…/external-accounts/from-file` already read the `format` query param; assert
  it where these tests exercise the endpoints.
- **E2E (@local)** — a full connect → upload XLSX → map → import smoke test
  requires the backend running with `BANKING_PRIVATBANK_BUSINESS_ENABLED=true`;
  it is gated on that flag and is not part of the always-green suite. The
  unit + component tests are the verifiable core.

## Out of scope

- Any backend change, including exposing statement formats on `BankProviderDTO`.
- Phase-2 cross-currency conversion → `Transfer` (backend-only; already landed).
- A live Автоклієнт (AutoAPI) pull adapter (deferred backend-side).

## References

- tracker#46 — support business accounts (separate provider surface for import).
- Backend spec: server-infra
  `docs/specs/2026-08-07-privatbank-business-file-import-design.md`.
- #38 — file-import transport seam (reused).
- Web file-provider account-mapping / multi-file import:
  `docs/specs/2026-07-29-file-provider-account-mapping-multi-file-import-design.md`.
- Key web files: `src/features/accounts/ImportStatementButton.tsx`,
  `src/features/profile/LinkAccountsDialog.tsx`,
  `src/features/profile/BankConnectionDialog.tsx` (already generic),
  `src/api/banking.ts` (`importStatement` / `listExternalAccountsFromFile`),
  `src/api/types.ts` (`BankProviderDTO`).
