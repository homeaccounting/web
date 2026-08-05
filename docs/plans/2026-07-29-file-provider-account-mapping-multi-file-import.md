# File-Provider Account Mapping & Multi-File Import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Bring file-import bank providers to parity with pull providers — generic account discovery, real many-to-one account mapping, and multi-file import — so internal-transfer detection (server-infra PR #143) works for file providers with no provider-specific code, on **one unified mechanism** (single-file = N=1).

**Architecture:** Two generic backend additions that mirror pull (a file analog of `fetchAccounts` derived from the existing parsers; multi-file import that concatenates into one `importMany` batch) plus retirement of the single-account `'statement'` sentinel so routing is always by real `externalAccountId`. The web client then reuses the existing `LinkAccountsDialog` + `setAccountMap` (un-gated for file providers, sourced from a file-upload discovery) and extends the existing accounts-view import button to multiple files. IA preserved: profile configures, the accounts view imports.

**Tech Stack:** Backend — Haskell/Servant (server-infra), adds `servant-multipart`. Web — Vite + React + TS + Tailwind/shadcn + react-query + react-hook-form/zod; Vitest + MSW; no i18n (hardcoded strings).

**Spec:** `docs/specs/2026-07-29-file-provider-account-mapping-multi-file-import-design.md` (this repo). Builds on server-infra PR #143.

**Cross-repo:** Phase A is a **server-infra** PR and MUST merge (or at least be available) before Phase B. Phase B is a **monorepo** PR. Each task below is tagged `[server-infra]` or `[monorepo]`.

---

## File Structure

**Phase A — server-infra**
| File | Responsibility | Change |
|---|---|---|
| `package.yaml` | add `servant-multipart` dependency | Modify |
| `src/Web/Server.hs` (`buildApplication`) | add `MultipartOptions Mem` to the existing `authContext` + extend the `AuthContext` type list threaded through `hoistServerWithContext` | Modify |
| `src/Web/API/BankingAPI.hs` | multipart import endpoint (B2); new discovery endpoint (B1); retire sentinel routing (B3); handlers + DTO mapping | Modify |
| `src/Web/Types.hs` (if DTO/type helpers needed) | any shared types | Modify (maybe) |
| `test/**` (BankingAPI handler specs) | discovery, multi-file, routing, no-regression | Modify/Create |

**Phase B — monorepo**
| File | Responsibility | Change |
|---|---|---|
| `src/api/client.ts` | `postForm` (multipart) method; don't auto-JSON a `FormData` body | Modify |
| `src/api/banking.ts` | `importStatement` → multi-file multipart; add `listExternalAccountsFromFile` | Modify |
| `src/features/banking/useImportStatement.ts` | accept `File[]` | Modify |
| `src/features/configuration/useExternalAccounts.ts` | add a file-discovery variant hook | Modify/Create |
| `src/features/accounts/ImportStatementButton.tsx` | `multiple` file input → one request | Modify |
| `src/features/profile/BankConnectionDialog.tsx` | drop file-only single-account picker + `'statement'` write | Modify |
| `src/features/profile/bankConnectionSchema.ts` | drop the `fileOnly` accountId requirement | Modify |
| `src/features/profile/LinkAccountsDialog.tsx` | transport-aware row source (pull GET vs file upload→POST) | Modify |
| `src/features/profile/ProfileBankingPane.tsx` | un-gate "Link accounts" for `supportsFile` | Modify |
| `src/test/handlers.ts`, `src/test/fixtures.ts`, `e2e/banking.spec.ts` | MSW routes + fixtures + e2e | Modify |

Notes for implementers:

- Backend: `nix develop -c just build` / `just test` / `just format` / `just lint`; `-Werror` via `-fci`; Postgres container `accounting-postgres` must be up for integration specs.
- Web: `pnpm test` (Vitest), `pnpm lint`, `pnpm build`; MSW handlers in `src/test/handlers.ts`, fixtures in `src/test/fixtures.ts`; strings hardcoded (no i18n).

---

# Phase A — Backend (server-infra PR)

## Task A1: multipart infrastructure `[server-infra]`

**Files:** `package.yaml`, the composition root doing `serveWithContext`, `src/Web/API/BankingAPI.hs`.

- [ ] **Step 1:** Add `servant-multipart` to `package.yaml` dependencies; `nix develop -c hpack`.
- [ ] **Step 2:** Convert the **existing** import endpoint to multipart as a **single-file, behavior-preserving** move first (prove the plumbing before adding multi-file/discovery). In `BankingAPI`, change the `import/file` row from `ReqBody '[OctetStream] ByteString` to `MultipartForm Mem (MultipartData Mem)` (keep the `QueryParam' '[Required,Strict] "format"`). Update `importStatementFileHandler`'s signature to take `MultipartData Mem` and read `fdPayload <$> files` (use the **first** file for now to preserve behavior).
- [ ] **Step 3:** Server wiring lives in `src/Web/Server.hs` `buildApplication`, which already uses `serveWithContext` with `authContext = authHandler jwtConfig :. EmptyContext` and a `hoistServerWithContext … (Proxy :: Proxy AuthContext)`. Add `defaultMultipartOptions (Proxy :: Proxy Mem)` to that context (`authHandler … :. defaultMultipartOptions (Proxy @Mem) :. EmptyContext`) and extend the `AuthContext` type-level list accordingly so `hoistServerWithContext` still matches. **Note:** servant-multipart's `HasServer` instance _defaults_ `MultipartOptions` when it's absent from the Context, so a compile-clean build **without** touching the Context is acceptable too — don't treat the no-Context path as wrong; only add it if you need non-default limits or the build demands it.
- [ ] **Step 4:** `nix develop -c just build` clean. Run the existing file-import handler test (single file) — it must still pass (adjust the test's request construction to multipart with one file; behavior unchanged). Expected: green.
- [ ] **Step 5:** `just format` + `just lint`; commit: `feat(banking): multipart file-import endpoint (single-file behavior preserved)`.

> Escalation: if `servant-multipart` + `Context` wiring fights the existing server setup, STOP and report BLOCKED with the exact `serveWithContext`/`serve` signature — this is the highest-risk step.

## Task A2: multi-file import `[server-infra]`

**Files:** `src/Web/API/BankingAPI.hs`, tests.

- [ ] **Step 1 (failing test):** Handler spec — a multipart request with **two** files whose transfer legs live in different files (debit card A in file 1, credit card B in file 2; both mapped to distinct accounts) → exactly one `Transfer`. Expected FAIL (only first file parsed today).
- [ ] **Step 2:** In `importStatementFileHandler`, parse **every** file in `MultipartData.files` with the format's parser, concatenate all `Right` rows into one `[BankTransaction]`, aggregate per-row `Left` errors across files, and call `importMany` **once** over the union (unchanged downstream). Preserve the existing `unresolved`/row-error merge.
- [ ] **Step 3:** Run the spec → PASS. Add a **no-regression** case: a single-file multipart request behaves exactly as before.
- [ ] **Step 4:** build/format/lint; commit: `feat(banking): import concatenates multiple statement files into one batch`.

## Task A3: retire the `'statement'` sentinel routing `[server-infra]`

**Files:** `src/Web/API/BankingAPI.hs` (the `accountLink` computation in `importStatementFileHandler`), tests.

- [ ] **Step 1 (failing test):** Handler spec — a connection whose `accountMap` maps a **single real card mask** to account A, importing a file that also contains card B (unmapped) → card A's rows import to A, card B's rows go to `unresolved` (NOT routed to A). Expected FAIL (today the single-entry special-case routes _all_ cards to A).
- [ ] **Step 2:** Replace
  ```haskell
  accountLink = case writableMap of
    [(_, target)] -> [(cardId, target) | cardId <- nubOrd (map (.externalAccountId) goods)]
    _ -> writableMap
  ```
  with `accountLink = writableMap` (always route by real `externalAccountId`; unmapped → `unresolved`). Remove the now-dead `'statement'`-related helper/comment.
- [ ] **Step 3:** Run → PASS. Confirm existing multi-account and dedup specs stay green.
- [ ] **Step 4:** build/format/lint; commit: `refactor(banking): route file imports by real external id (retire statement sentinel)`.

## Task A4: file-provider account discovery endpoint (B1) `[server-infra]`

**Files:** `src/Web/API/BankingAPI.hs`, tests.

- [ ] **Step 1 (failing test):** Handler spec — POST a multipart statement (two distinct cards, one UAH) to the new endpoint → returns `[ExternalAccountDTO]` with the **distinct** external ids and mapped currency, no duplicates. Expected FAIL (endpoint absent).
- [ ] **Step 2:** Add API row `POST …/connections/:id/external-accounts/from-file` — `MultipartForm Mem (MultipartData Mem) :> QueryParam' '[Required,Strict] "format" StatementFormat :> Post '[JSON] [ExternalAccountDTO]`. Handler: resolve the connection's `FileImportCapability` (reuse `ConfigService.getConnectionFileImport`), look up `parsers[format]`, parse every file, collect **distinct** `(externalAccountId, currencyCode)` across all `Right` rows, map each to `ExternalAccountDTO { externalId = <mask>, currency = <from currencyCode>, maskedPan = Just <mask>, iban = "", balance = 0 }` (note `maskedPan :: Maybe Text` — wrap in `Just`; reuse the `currencyFromNumericCode` mapping). No new `FileImportCapability` field.
- [ ] **Step 3:** Run → PASS. Add a test: unsupported `format` → the existing unsupported-format error.
- [ ] **Step 4:** build/format/lint; commit: `feat(banking): list external accounts from an uploaded statement (file discovery)`.

## Task A5: Phase-A verification + PR `[server-infra]`

- [ ] `nix develop -c just rebuild` (clean `-fci`) + `just test` (Postgres up) — all green.
- [ ] Open the server-infra PR: `feat(banking): file-provider account discovery + multi-file import`. Note it enables monorepo `feat/file-provider-multi-account-import`.

---

# Phase B — Web (monorepo PR)

## Task B1: multipart API client + banking API + hooks `[monorepo]`

**Files:** `src/api/client.ts`, `src/api/banking.ts`, `src/features/banking/useImportStatement.ts`, `src/features/configuration/useExternalAccounts.ts`.

- [ ] **Step 1 (failing test):** `src/api/banking.test.ts` — `importStatement(connId, 'csv', [file1, file2])` issues ONE POST to `…/import/file?format=csv` with a `FormData` body containing both files; and `listExternalAccountsFromFile(connId, 'csv', [file])` POSTs to `…/external-accounts/from-file?format=csv`. Expected FAIL.
- [ ] **Step 2:** `client.ts` — add
  ```ts
  postForm<T>(path: string, form: FormData): Promise<T> {
    return this.request<T>(path, { method: 'POST', body: form });
  }
  ```
  and in `request`, do NOT auto-set JSON content-type for a `FormData` body:
  ```ts
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type'))
    headers.set('Content-Type', 'application/json');
  ```
  (Let the browser set the multipart boundary.)
- [ ] **Step 3:** `banking.ts` — change `importStatement` to accept `files: File[]`, build `FormData` (append each under the field name the backend expects, e.g. `files`), `postForm`. Add `listExternalAccountsFromFile(connectionId, format, files: File[]): Promise<ExternalAccountDTO[]>` (same `FormData` shape, discovery path). `useImportStatement` input `file: Blob` → `files: File[]`; a new `useExternalAccountsFromFile` mutation hook (mirrors `useExternalAccounts` but POSTs files, `gcTime: 0`).
- [ ] **Step 4:** run → PASS; `pnpm lint`; commit: `feat(banking): multipart multi-file client + file account-discovery api`.

## Task B2: multi-file import button `[monorepo]`

**Files:** `src/features/accounts/ImportStatementButton.tsx`, its test.

- [ ] **Step 1 (failing test):** selecting two files fires ONE `useImportStatement` call with both files. Also assert single-file selection still works (N=1). Expected FAIL.
- [ ] **Step 2:** add `multiple` to the file input; in `onFileSelected`, collect `Array.from(e.target.files)` → call `importStatement.mutate({ connId, format: 'csv', files })`. Update the summary toast to reflect the combined result (reuse `importSummary`).
- [ ] **Step 3:** run → PASS; commit: `feat(banking): allow selecting multiple statement files in one import`.

## Task B3: drop the file-only single-account picker `[monorepo]`

**Files:** `src/features/profile/BankConnectionDialog.tsx`, `src/features/profile/bankConnectionSchema.ts`, tests.

- [ ] **Step 1 (failing test):** creating a file-only connection no longer requires an account and does NOT PUT a `{ statement: … }` accountMap. Expected FAIL (today it forces it).
- [ ] **Step 2:** remove the `fileOnly` "Import into account" `AccountSelect`, the `FILE_IMPORT_ACCOUNT_MAP_KEY` sentinel writes (create + edit paths), the edit-mode `Object.values(accountMap)[0]` default, and the schema's `fileOnly`-conditional `accountId` requirement (`bankConnectionSchema.ts` `superRefine`). A file connection is created unmapped.
- [ ] **Step 3:** run → PASS (existing pull/token behavior unchanged); commit: `refactor(banking): file connections are created unmapped (mapped via Link accounts)`.

## Task B4: generalize `LinkAccountsDialog` for file discovery `[monorepo]`

**Files:** `src/features/profile/LinkAccountsDialog.tsx`, `src/features/profile/ProfileBankingPane.tsx`, tests.

- [ ] **Step 1 (failing test):** For a file provider, `LinkAccountsDialog` shows an upload control; after selecting a statement it lists the discovered accounts (from `useExternalAccountsFromFile`) and saving PUTs the expected many-to-one `accountMap` via `setAccountMap`. Pull behavior unchanged. Expected FAIL.
- [ ] **Step 2:** make the row source transport-aware. Determine `supportsPull` for the connection's provider; if pull → existing `useExternalAccounts` GET; if file → render a multi-file upload that calls `useExternalAccountsFromFile` and feeds its result into the SAME row-rendering + `selection` + `setAccountMap` save code. Empty state for file: "Upload your statement(s) to list accounts." Keep currency filtering, duplicate-account disabling, rate-limit/409 handling.
- [ ] **Step 3:** `ProfileBankingPane.tsx` — derive `supportsFile` from the same `providers` lookup that today yields only `supportsPull` (line ~43), then un-gate the "Link accounts" button to `supportsPull || supportsFile` (currently `supportsPull`).
- [ ] **Step 4:** run → PASS; commit: `feat(banking): link accounts for file providers via statement discovery`.

## Task B5: MSW handlers, fixtures, e2e `[monorepo]`

**Files:** `src/test/handlers.ts`, `src/test/fixtures.ts`, `e2e/banking.spec.ts`.

- [ ] **Step 1:** MSW — add `POST …/external-accounts/from-file` (returns a file-discovery `ExternalAccountDTO[]` fixture) and make `POST …/import/file` accept multipart. Add a file-discovery fixture to `fixtures.ts`.
- [ ] **Step 2:** e2e (`banking.spec.ts`) — file connection: create unmapped → Link accounts via uploaded statement → map two cards → multi-file import → assert success summary. Run the suite green.
- [ ] **Step 3:** commit: `test(banking): MSW + e2e for file discovery and multi-file import`.

## Task B6: Phase-B verification + PR `[monorepo]`

- [ ] `pnpm lint && pnpm test && pnpm build` all green.
- [ ] Open the monorepo PR: `feat(banking): file-provider account mapping + multi-file import`. Depends on the server-infra PR (Phase A).

---

## Final review

After both phases: REQUIRED SUB-SKILL superpowers:requesting-code-review on each PR's diff; then superpowers:finishing-a-development-branch per repo.
