# PrivatBank Business (XLSX) Import — Web Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the web upload PrivatBank Business **XLSX** statements through the existing file-import surfaces by deriving the `format` query param from the picked file's extension instead of hardcoding `csv`.

**Architecture:** One new pure helper (`statementFormat.ts`) owns the extension→format mapping and the shared `accept` string. The two file-upload surfaces (`ImportStatementButton`, `LinkAccountsDialog`) broaden their `accept` and pass the derived format. Everything else — provider discovery, connect dialog, multi-account mapping, dedup — is already provider-agnostic and untouched. No backend change.

**Tech Stack:** React 18 + TypeScript (strict), Vitest + Testing Library + happy-dom + MSW, TanStack Query, react-hook-form. Commands via `pnpm` (Node 22, pnpm 9).

**Spec:** `docs/specs/2026-08-08-privatbank-business-import-web-design.md`

---

## File Structure

- **Create** `src/features/banking/statementFormat.ts` — pure module: `STATEMENT_FILE_ACCEPT` constant + `statementFormatForFiles(files)` returning a discriminated `{ format } | { error }`. Lives alongside the other banking helpers (`importSummary.ts`, `matchAccountConnection.ts`).
- **Create** `src/features/banking/statementFormat.test.ts` — unit tests for the helper.
- **Modify** `src/features/accounts/ImportStatementButton.tsx` — use the shared `accept`; derive format in `onFileSelected`; toast + bail on mixed/unrecognized.
- **Modify** `src/features/accounts/ImportStatementButton.test.tsx` — add xlsx-path and mixed-selection tests.
- **Modify** `src/features/profile/LinkAccountsDialog.tsx` — use the shared `accept`; derive format in the file `onChange`; surface error on mixed/unrecognized.
- **Modify** `src/features/profile/LinkAccountsDialog.test.tsx` — add an xlsx from-file discovery test.
- **Modify** `package.json` — version bump `0.7.0` → `0.8.0`.

**Conventions to follow:**

- Path alias `@/…` (no deep relative imports).
- `just check` = typecheck + lint + format-check; must stay green. Run `just format` before committing.
- Tests sign the user in via `saveSession(...)` and render via `renderWithProviders`; MSW `onUnhandledRequest: 'error'`, so every network call needs a handler.
- The existing MSW handlers for `import/file` and `external-accounts/from-file` already read the `format` query param and accept any non-empty value — no handler change needed for xlsx.

---

## Task 1: The `statementFormat` helper (pure, TDD first)

**Files:**

- Create: `src/features/banking/statementFormat.ts`
- Test: `src/features/banking/statementFormat.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/banking/statementFormat.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { STATEMENT_FILE_ACCEPT, statementFormatForFiles } from './statementFormat';

function file(name: string): File {
  return new File(['x'], name, { type: 'application/octet-stream' });
}

describe('statementFormatForFiles', () => {
  it('maps a .csv selection to csv', () => {
    expect(statementFormatForFiles([file('statement.csv')])).toEqual({ format: 'csv' });
  });

  it('maps a .xlsx selection to xlsx', () => {
    expect(statementFormatForFiles([file('stmts_123.xlsx')])).toEqual({ format: 'xlsx' });
  });

  it('is case-insensitive on the extension', () => {
    expect(statementFormatForFiles([file('A.CSV')])).toEqual({ format: 'csv' });
    expect(statementFormatForFiles([file('B.XLSX')])).toEqual({ format: 'xlsx' });
  });

  it('accepts multiple files of the same format', () => {
    expect(statementFormatForFiles([file('jan.csv'), file('feb.csv')])).toEqual({ format: 'csv' });
  });

  it('rejects a mixed .csv + .xlsx selection', () => {
    const result = statementFormatForFiles([file('a.csv'), file('b.xlsx')]);
    expect(result).toHaveProperty('error');
  });

  it('rejects an unrecognized extension', () => {
    expect(statementFormatForFiles([file('notes.txt')])).toHaveProperty('error');
  });

  it('rejects an empty selection', () => {
    expect(statementFormatForFiles([])).toHaveProperty('error');
  });

  it('exposes an accept string covering csv and xlsx', () => {
    expect(STATEMENT_FILE_ACCEPT).toContain('.csv');
    expect(STATEMENT_FILE_ACCEPT).toContain('.xlsx');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/features/banking/statementFormat.test.ts`
Expected: FAIL — cannot resolve `./statementFormat` / exports not defined.

- [ ] **Step 3: Write minimal implementation**

Create `src/features/banking/statementFormat.ts`:

```typescript
// Maps a picked statement file to the `format` query param the backend's
// file-import endpoints expect (`csv` → StatementCsv, `xlsx` → StatementXlsx;
// see server-infra Web/API/BankingAPI.hs `parseUrlPiece`). The provider DTO
// does not advertise which format a provider accepts, so the format is derived
// from the file extension — provider-agnostic, so any future CSV/XLSX file
// provider works with no web change.

// `accept` value for the statement-file inputs, covering both formats.
export const STATEMENT_FILE_ACCEPT =
  '.csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const MIXED_OR_UNKNOWN = 'Select statement files of the same type (.csv or .xlsx).';

function formatForName(name: string): 'csv' | 'xlsx' | undefined {
  const lower = name.toLowerCase();
  if (lower.endsWith('.csv')) return 'csv';
  if (lower.endsWith('.xlsx')) return 'xlsx';
  return undefined;
}

// All files in one upload share a single `format` query param (the backend
// concatenates them into one batch), so the whole selection must resolve to one
// known format; otherwise return a user-facing error and send nothing.
export function statementFormatForFiles(
  files: File[],
): { format: 'csv' | 'xlsx' } | { error: string } {
  if (files.length === 0) return { error: MIXED_OR_UNKNOWN };
  const formats = new Set<'csv' | 'xlsx'>();
  for (const f of files) {
    const fmt = formatForName(f.name);
    if (!fmt) return { error: MIXED_OR_UNKNOWN };
    formats.add(fmt);
  }
  if (formats.size !== 1) return { error: MIXED_OR_UNKNOWN };
  return { format: [...formats][0]! };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/features/banking/statementFormat.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
just format
git add src/features/banking/statementFormat.ts src/features/banking/statementFormat.test.ts
git commit -m "feat(banking): statementFormatForFiles helper (extension → csv/xlsx)"
```

---

## Task 2: `ImportStatementButton` — accept + derived format

**Files:**

- Modify: `src/features/accounts/ImportStatementButton.tsx`
- Test: `src/features/accounts/ImportStatementButton.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to `ImportStatementButton.test.tsx`. First add an xlsx file factory near `makeCsvFile` (line ~73):

```typescript
function makeXlsxFile(name = 'statement.xlsx'): File {
  return new File(['PK\x03\x04'], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
```

Then add these two tests inside `describe('import statement button', …)`:

```typescript
it('uploads an XLSX file with format=xlsx', async () => {
  const user = userEvent.setup();
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
  useConfigHandler(configWith([privatbankConnection]));
  useProvidersHandler();
  const capture = captureImportRequests();

  renderWithProviders(ui(), { initialPath: '/' });
  await screen.findByRole('button', { name: /import statement/i });
  const fileInput = screen.getByTestId('import-statement-file-input');
  await user.upload(fileInput, makeXlsxFile('stmts_42.xlsx'));

  await waitFor(() => expect(toast.success).toHaveBeenCalled());
  expect(capture.calls).toBe(1);
  expect(capture.lastFileNames).toEqual(['stmts_42.xlsx']);
  expect(capture.format).toBe('xlsx');
});

it('rejects a mixed csv+xlsx selection without sending a request', async () => {
  const user = userEvent.setup();
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
  useConfigHandler(configWith([privatbankConnection]));
  useProvidersHandler();
  const capture = captureImportRequests();

  renderWithProviders(ui(), { initialPath: '/' });
  await screen.findByRole('button', { name: /import statement/i });
  const fileInput = screen.getByTestId('import-statement-file-input');
  await user.upload(fileInput, [makeCsvFile('a.csv'), makeXlsxFile('b.xlsx')]);

  await waitFor(() => expect(toast.error).toHaveBeenCalled());
  expect(capture.calls).toBe(0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/features/accounts/ImportStatementButton.test.tsx`
Expected: FAIL — the xlsx test sees `capture.format === 'csv'`; the mixed test sends a request (`capture.calls === 1`) and no error toast.

- [ ] **Step 3: Implement**

In `src/features/accounts/ImportStatementButton.tsx`:

Add import near the other banking imports (after line 13):

```typescript
import { STATEMENT_FILE_ACCEPT, statementFormatForFiles } from '@/features/banking/statementFormat';
```

Replace the body of `onFileSelected` (lines 44–62) so the format is derived and mixed/unknown selections bail:

```typescript
const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
  const files = Array.from(e.target.files ?? []);
  // Reset the input so the same files can be re-selected later.
  e.target.value = '';
  if (files.length === 0 || !matched) return;
  const resolved = statementFormatForFiles(files);
  if ('error' in resolved) {
    toast.error(resolved.error);
    return;
  }
  importStatement.mutate(
    // All selected files go in one request so the backend concatenates them
    // into a single batch (cross-file transfers pair). One file is just N=1.
    { connId: matched.id, format: resolved.format, files },
    {
      onSuccess: (result) => toast.success(formatSummary(summarize(result))),
      onError: (err) => {
        const message =
          err instanceof ApiError ? err.message : 'Couldn’t import this statement. Try again.';
        toast.error(message);
      },
    },
  );
};
```

Replace the file input's `accept` (line 87):

```typescript
accept = { STATEMENT_FILE_ACCEPT };
```

- [ ] **Step 4: Run the full component test file**

Run: `pnpm exec vitest run src/features/accounts/ImportStatementButton.test.tsx`
Expected: PASS — new xlsx + mixed tests pass and all pre-existing csv tests (including the `format` toBe `'csv'` assertions) still pass.

- [ ] **Step 5: Commit**

```bash
just format
git add src/features/accounts/ImportStatementButton.tsx src/features/accounts/ImportStatementButton.test.tsx
git commit -m "feat(banking): ImportStatementButton derives statement format from file (xlsx support)"
```

---

## Task 3: `LinkAccountsDialog` — accept + derived format for file discovery

**Files:**

- Modify: `src/features/profile/LinkAccountsDialog.tsx`
- Test: `src/features/profile/LinkAccountsDialog.test.tsx`

- [ ] **Step 1: Write the failing test**

Add this test **inside the `describe('LinkAccountsDialog (file provider)')` block** (the one that defines `fileConnection`, ~line 453) so it can reach `fileConnection`/`Wrapper`. Mirror the existing "discovers accounts from an uploaded statement" test at line 478, but upload an `.xlsx` and assert the `format` query param. Capture the format in the from-file handler:

```typescript
it('sends format=xlsx when an .xlsx statement is uploaded', async () => {
  const user = userEvent.setup();
  let format = '';
  server.use(
    http.post(externalAccountsFromFileUrl, ({ request }) => {
      format = new URL(request.url).searchParams.get('format') ?? '';
      return HttpResponse.json(externalAccountsFromFileFixture);
    }),
  );
  renderWithProviders(<Wrapper conn={fileConnection} />, { initialPath: '/' });

  const fileInput = await screen.findByLabelText(/statement files/i);
  const file = new File(['PK\x03\x04'], 'stmts_9.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  await user.upload(fileInput, file);

  await screen.findByRole('combobox', { name: /UA903052992990004149123456789/ });
  expect(format).toBe('xlsx');
});
```

(Confirm `http`, `HttpResponse`, `server`, `externalAccountsFromFileUrl`, `externalAccountsFromFileFixture`, `fileConnection`, and `Wrapper` are already imported/defined in this test file — they are used by the existing test at line 478. Reuse them.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/features/profile/LinkAccountsDialog.test.tsx -t "format=xlsx"`
Expected: FAIL — `format` is `'csv'`.

- [ ] **Step 3: Implement**

In `src/features/profile/LinkAccountsDialog.tsx`:

Add import near the other banking imports (after line 26):

```typescript
import { STATEMENT_FILE_ACCEPT, statementFormatForFiles } from '@/features/banking/statementFormat';
```

First add the error state **before** the `source` object (which references its setter), just after the providers/capabilities block near line 67 (top of the component body, before `const source: RowSource = …`):

```typescript
const [fileFormatError, setFileFormatError] = useState<string | null>(null);
```

Then change the file-provider `onPickFiles` closure (line 104) to derive the format. Replace:

```typescript
        onPickFiles: (files) => fromFile.mutate({ connId: connection.id, format: 'csv', files }),
```

with:

```typescript
        onPickFiles: (files) => {
          const resolved = statementFormatForFiles(files);
          if ('error' in resolved) {
            setFileFormatError(resolved.error);
            return;
          }
          setFileFormatError(null);
          fromFile.mutate({ connId: connection.id, format: resolved.format, files });
        },
```

Render the error under the file input. Inside the `{isFile && (…)}` block, after the `<Input …/>` (around line 174), add:

```typescript
            {fileFormatError && (
              <p role="alert" className="text-xs text-destructive">
                {fileFormatError}
              </p>
            )}
```

Change the file input's `accept` (line 169):

```typescript
accept = { STATEMENT_FILE_ACCEPT };
```

- [ ] **Step 4: Run the full component test file**

Run: `pnpm exec vitest run src/features/profile/LinkAccountsDialog.test.tsx`
Expected: PASS — new xlsx test passes; the existing csv discovery test still passes.

- [ ] **Step 5: Commit**

```bash
just format
git add src/features/profile/LinkAccountsDialog.tsx src/features/profile/LinkAccountsDialog.test.tsx
git commit -m "feat(banking): LinkAccountsDialog derives file-discovery format from statement (xlsx support)"
```

---

## Task 4: Version bump + full-suite verification

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Bump the version**

In `package.json` change `"version": "0.7.0"` to `"version": "0.8.0"`.

- [ ] **Step 2: Run the full check + test gate**

Run: `just check && just test`
Expected: typecheck clean, ESLint clean, prettier clean, and the entire Vitest suite green (all pre-existing tests + the new statementFormat/xlsx tests).

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: bump version to 0.8.0 (PrivatBank Business XLSX import, tracker#46)"
```

---

## Task 5: Update the spec status + memory

**Files:**

- Modify: `docs/specs/2026-08-08-privatbank-business-import-web-design.md`

- [ ] **Step 1: Flip spec status**

Change frontmatter `status: draft` → `status: completed`.

- [ ] **Step 2: Commit**

```bash
git add docs/specs/2026-08-08-privatbank-business-import-web-design.md
git commit -m "docs(banking): mark PrivatBank Business web import spec completed"
```

---

## Verification checklist (before opening a PR)

- [ ] `just check` clean (typecheck + lint + format).
- [ ] `just test` green — including `statementFormat.test.ts`, the two `ImportStatementButton` xlsx/mixed tests, and the `LinkAccountsDialog` xlsx test.
- [ ] Manual/@local (optional, requires backend with `BANKING_PRIVATBANK_BUSINESS_ENABLED=true`): the provider "PrivatBank (Business)" appears in the Add-connection picker with no token field; "Link accounts" accepts an `.xlsx`, lists the statement's IBAN accounts, and Save maps them; the statement Import button accepts an `.xlsx` and reports imported counts.

## Notes for the implementer

- **Do not** touch `BankConnectionDialog.tsx`, `useProviders.ts`, `api/banking.ts`, `api/types.ts`, or the MSW handlers — they are already format-neutral. Adding those to scope is a red flag.
- The backend provider is dark-launched OFF by env flag; the always-green unit/component suite is the verifiable core. A live end-to-end run depends on that backend flag and is out of the automated suite.
- Keep the mixed-selection error message identical between the helper and any UI copy — it lives once in `statementFormat.ts`.
