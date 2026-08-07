# Web provider-contact resolution — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users curate a provider-token → contact map on the web, both from a dedicated Banking → Contacts sub-tab and inline from an imported transaction's edit dialog.

**Architecture:** Additive DTO parity in `src/api/types.ts` for the merged backend contract (`bankProviderContact` on transactions; `contactMap` on banking config + update request). `ProfileBankingPane` splits into URL-persisted sub-tabs (Connections / Expenses / Contacts). A new `BankProviderContactMapEditor` (simpler sibling of the category editor — bare-token key, no kind selector) edits the map via `useUpdateBanking`. `EditTransactionDialog`'s header gains an inline creatable "Map to contact…" affordance for the surfaced token.

**Tech Stack:** React 18 + TS, TanStack Query, react-hook-form + Zod, shadcn/ui, Vitest + Testing Library + MSW. Reuses `ContactCombobox`, `useCreateDictionaryEntry`, `useUpdateBanking`, `Tabs variant="underline"`, `useSearchParams`.

**Spec:** `docs/specs/2026-08-06-provider-contact-resolution-web-design.md`

---

## File structure

- `src/api/types.ts` — +3 additive fields (owns the wire contract).
- `src/test/fixtures.ts` — new fields on the transaction + banking-config fixtures.
- `src/features/profile/bankConnectionSchema.ts` — +`bankProviderContactRowSchema` (owns validation).
- `src/features/profile/BankProviderContactMapEditor.tsx` — **new** (presentational editor).
- `src/features/profile/ProfileBankingPane.tsx` — sub-tab shell; moves existing cards into panes.
- `src/features/transactions/EditTransactionDialog.tsx` — inline map-to-contact header block.
- Tests alongside each.

---

### Task 1: DTO parity + fixtures

**Files:**

- Modify: `src/api/types.ts` (`TransactionResponse`, `BankingConfigurationDTO`, `UpdateBankingRequest`)
- Modify: `src/test/fixtures.ts:88` (transaction), `:119` (banking)

- [ ] **Step 1: Add the transaction field.** In `src/api/types.ts`, after the `bankProviderCategory` field of `TransactionResponse` (~line 440):

```ts
// Raw provider counterparty token for imported transactions; `null` for
// manual entries, transfers/adjustments, and providers that supply none.
// A PLAIN string (unlike the tagged bankProviderCategory) — the backend key
// is the bare trimmed token. Mirrors server-infra Web/Types.hs:693
// `TransactionResponse.bankProviderContact :: Maybe BankProviderContact`.
// Lets the user map an unmapped merchant to a contact from the edit dialog.
bankProviderContact: string | null;
```

- [ ] **Step 2: Add the banking-config + update fields.** In `BankingConfigurationDTO` (~line 615) after `expenseCategoryMap`:

```ts
// User-editable provider-token → contact map. Keys are bare trimmed provider
// counterparty tokens (no mcc:/label: tag). Starts empty (no seed). Mirrors
// server-infra Web/API/ConfigurationAPI.hs:314 `BankingConfigurationDTO.contactMap`.
contactMap: Record<string, UUID>;
```

In `UpdateBankingRequest` (~line 565) after `expenseCategoryMap?`:

```ts
  // Present replaces the whole contact map (set-semantics); absent = no change.
  // Mirrors server-infra Web/API/ConfigurationAPI.hs:565 `UpdateBankingRequest.contactMap`.
  contactMap?: Record<string, UUID>;
```

- [ ] **Step 3: Update fixtures.** `src/test/fixtures.ts` — add `bankProviderContact: null,` after `bankProviderCategory: null,` (line 88), and `contactMap: {},` after `expenseCategoryMap: {},` (line 119).

- [ ] **Step 4: Typecheck.** Run: `pnpm typecheck`. Expected: PASS (adding required fields to fixtures satisfies the new required DTO fields; no other fixture builds these two objects — verify no other `TransactionResponse`/`BankingConfigurationDTO` literal errors).

- [ ] **Step 5: Commit.**

```bash
git add src/api/types.ts src/test/fixtures.ts
git commit -m "feat(banking): web DTO parity for provider-contact signal + contactMap (tracker#54)"
```

---

### Task 2: `bankProviderContactRowSchema`

**Files:**

- Modify: `src/features/profile/bankConnectionSchema.ts` (append)
- Test: `src/features/profile/bankConnectionSchema.test.ts`

- [ ] **Step 1: Failing test.** Append to `bankConnectionSchema.test.ts`:

```ts
import { bankProviderContactRowSchema } from './bankConnectionSchema';

describe('bankProviderContactRowSchema', () => {
  const cid = '00000000-0000-0000-0000-0000000000c1';
  it('accepts a trimmed token + uuid contact', () => {
    const r = bankProviderContactRowSchema.safeParse({
      token: '  MagazinREMONTI ',
      contactId: cid,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.token).toBe('MagazinREMONTI'); // trimmed
  });
  it('rejects a blank/whitespace token', () => {
    expect(bankProviderContactRowSchema.safeParse({ token: '   ', contactId: cid }).success).toBe(
      false,
    );
  });
  it('rejects a missing/invalid contactId', () => {
    expect(bankProviderContactRowSchema.safeParse({ token: 'X', contactId: '' }).success).toBe(
      false,
    );
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`bankProviderContactRowSchema` not exported). Run: `pnpm exec vitest run src/features/profile/bankConnectionSchema.test.ts`

- [ ] **Step 3: Implement.** Append to `bankConnectionSchema.ts`:

```ts
// One entry of the provider-token → contact map (tracker#54). Unlike the
// category map there is no kind tag: the key is the bare trimmed token (backend
// `mkBankProviderContact` trims and rejects blank — mirror that here). `contactId`
// is a contact dictionary-entry id.
export const bankProviderContactRowSchema = z.object({
  token: z.string().trim().min(1, 'Token is required'),
  contactId: z.string().uuid('Pick a contact'),
});
export type BankProviderContactRow = z.infer<typeof bankProviderContactRowSchema>;
```

- [ ] **Step 4: Run — expect PASS.** Same command as Step 2.

- [ ] **Step 5: Commit.**

```bash
git add src/features/profile/bankConnectionSchema.ts src/features/profile/bankConnectionSchema.test.ts
git commit -m "feat(banking): bankProviderContactRowSchema (tracker#54)"
```

---

### Task 3: `BankProviderContactMapEditor`

**Files:**

- Create: `src/features/profile/BankProviderContactMapEditor.tsx`
- Test: `src/features/profile/BankProviderContactMapEditor.test.tsx`

Reference the category editor (`BankProviderExpenseCategoryMapEditor.tsx`) for structure; this is the simplified variant (single token `Input` + creatable `ContactCombobox`, no kind selector, no key render/parse).

- [ ] **Step 1: Failing test.** Create `BankProviderContactMapEditor.test.tsx`. Render via `src/test/utils.tsx` `renderWithProviders` (QueryClient + Auth wired). Sign in per repo convention; add an MSW override for `PATCH`/`PUT` banking update if needed (mirror the category editor's test). Cover:

```ts
// seeds rows from value; edits a token + picks a contact; Save calls updateBanking
//   with { contactMap: { '<token>': '<contactId>' } }
// Add mapping appends an empty row
// duplicate token across two rows -> destructive alert, no mutate
// blank token -> alert; missing contact -> alert
// create-and-map: typing a new name in the ContactCombobox + activating "Create ‘X’"
//   calls useCreateDictionaryEntry then includes the returned id on Save
// a newly ADDED row renders an editable combobox (role="combobox"), NOT the
//   "Archived contact" box -> guards the value={row.contactId || null} coercion
// empty value -> "No mappings yet." EmptyState
```

Model the assertions on `ProfileBankingPane.test.tsx` / the category editor test (whichever exercises `useUpdateBanking`). Spy on the update by asserting the outgoing request body via an MSW handler.

- [ ] **Step 2: Run — expect FAIL** (module missing). Run: `pnpm exec vitest run src/features/profile/BankProviderContactMapEditor.test.tsx`

- [ ] **Step 3: Implement.** Create the component:

```tsx
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { DictionaryEntryResponse, DictionaryResponse, UUID } from '@/api/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EmptyState } from '@/components/EmptyState';
import { toast } from '@/lib/toast';
import { useUpdateBanking } from '@/features/configuration/useUpdateBanking';
import { useCreateDictionaryEntry } from '@/features/configuration/useCreateDictionaryEntry';
import { ContactCombobox } from '@/features/transactions/ContactCombobox';
import { bankProviderContactRowSchema } from './bankConnectionSchema';

interface Row {
  token: string;
  contactId: string;
}

interface BankProviderContactMapEditorProps {
  // Provider-token → contact map. Keys are bare trimmed tokens (see
  // BankingConfigurationDTO.contactMap).
  value: Record<string, UUID>;
  contacts: DictionaryEntryResponse[]; // flattened, for the combobox options
  contactDict?: DictionaryResponse; // raw tree, for full-path create parity
}

// Editor for the provider-token → contact map (tracker#54). Simpler sibling of
// BankProviderExpenseCategoryMapEditor: a key is one bare token (no mcc/label
// tag), a value is a contact dictionary entry, and the map starts empty (no
// seed). The contact picker is creatable — a new contact can be added inline.
export function BankProviderContactMapEditor({
  value,
  contacts,
  contactDict,
}: BankProviderContactMapEditorProps) {
  const update = useUpdateBanking();
  const createContact = useCreateDictionaryEntry();
  const [rows, setRows] = useState<Row[]>(() =>
    Object.entries(value).map(([token, contactId]) => ({ token, contactId })),
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  const setRow = (index: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const addRow = () => setRows((prev) => [...prev, { token: '', contactId: '' }]);
  const removeRow = (index: number) => setRows((prev) => prev.filter((_, i) => i !== index));

  const createAndSelect = async (index: number, name: string) => {
    try {
      const r = await createContact.mutateAsync({ dictId: 'contact', name, dict: contactDict });
      setRow(index, { contactId: r.id });
    } catch {
      setValidationError('Could not create contact.');
    }
  };

  const save = () => {
    setValidationError(null);
    const map: Record<string, UUID> = {};
    for (const row of rows) {
      const parsed = bankProviderContactRowSchema.safeParse(row);
      if (!parsed.success) {
        setValidationError(parsed.error.issues[0]?.message ?? 'Invalid mapping');
        return;
      }
      if (map[parsed.data.token] !== undefined) {
        setValidationError(`Duplicate mapping: ${parsed.data.token}`);
        return;
      }
      map[parsed.data.token] = parsed.data.contactId;
    }
    update.mutate({ contactMap: map }, { onSuccess: () => toast.success('Updated.') });
  };

  const opError = validationError ?? update.error?.message ?? null;

  return (
    <section className="space-y-3" aria-labelledby="bank-provider-contact-mapping-heading">
      <h3 id="bank-provider-contact-mapping-heading" className="sr-only">
        Bank provider token to contact mapping
      </h3>
      <p className="text-xs text-muted-foreground">Mappings apply to future imports.</p>
      {rows.length === 0 && <EmptyState message="No mappings yet." className="p-0" />}
      <ul className="space-y-2">
        {rows.map((row, index) => (
          <li key={index} className="flex items-center gap-2">
            <Input
              value={row.token}
              onChange={(e) => setRow(index, { token: e.target.value })}
              placeholder="Provider counterparty token"
              className="flex-1 font-mono"
              aria-label={`Provider token, row ${index + 1}`}
            />
            <div className="flex-1">
              <ContactCombobox
                options={contacts}
                value={row.contactId || null}
                onChange={(id) => setRow(index, { contactId: id ?? '' })}
                onCreate={(name) => createAndSelect(index, name)}
                placeholder="Contact"
                aria-label={`Contact, row ${index + 1}`}
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove mapping ${row.token || `row ${index + 1}`}`}
              onClick={() => removeRow(index)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={addRow}>
          <Plus className="mr-1 h-4 w-4" />
          Add mapping
        </Button>
        <Button size="sm" onClick={save} disabled={update.isPending} aria-label="Save mapping">
          {update.isPending ? 'Saving…' : 'Save mapping'}
        </Button>
      </div>
      {opError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{opError}</AlertDescription>
        </Alert>
      )}
    </section>
  );
}
```

NOTES (verified against source):

- `useCreateDictionaryEntry().mutateAsync` takes `{ dictId, name, dict? }` (`useCreateDictionaryEntry.ts:8-17`); `dict` is optional (root-only when omitted). Passing `contactDict` gives full-path nesting parity with the transaction flow. The payload goes to `.mutateAsync`, not the hook (the hook takes no args).
- `ContactCombobox` props are `options/value/onChange/onCreate` (`ContactCombobox.tsx:11-26`). **Its archived branch (`value !== null && !selected`, line 59) fires for `contactId: ''`**, so the code passes `value={row.contactId || null}` — do not drop this coercion or new rows render as an uneditable "Archived contact" box.

- [ ] **Step 4: Run — expect PASS.** Same command as Step 2. Then `pnpm typecheck`.

- [ ] **Step 5: Commit.**

```bash
git add src/features/profile/BankProviderContactMapEditor.tsx src/features/profile/BankProviderContactMapEditor.test.tsx
git commit -m "feat(banking): provider-token → contact map editor (tracker#54)"
```

---

### Task 4: Banking sub-tabs

**Files:**

- Modify: `src/features/profile/ProfileBankingPane.tsx`
- Test: `src/features/profile/ProfileBankingPane.test.tsx`

- [ ] **Step 1: Failing test.** Extend `ProfileBankingPane.test.tsx`:

```ts
// renders Connections / Expenses / Contacts sub-tab triggers (banking-enabled config)
// default section (no ?section) shows Connections (the connections list / Add connection)
// ?section=contacts (via MemoryRouter initialEntries) shows the contact map editor
//   fed contactMap + contact dictionary
// unknown ?section=zzz falls back to Connections
```

Follow the file's existing render helper (it already renders the pane with a banking-enabled config). Use the router entry the test harness provides to set `?section=`.

- [ ] **Step 2: Run — expect FAIL.** Run: `pnpm exec vitest run src/features/profile/ProfileBankingPane.test.tsx`

- [ ] **Step 3: Implement.** Refactor `ProfileBankingPane` (the success branch) to a sub-tab shell mirroring `src/features/reports/ReportsPane.tsx`:
  - `import { useSearchParams } from 'react-router-dom'` and `Tabs, TabsContent, TabsList, TabsTrigger` from `@/components/ui/tabs`.
  - `const [params, setParams] = useSearchParams();`
  - `const SECTIONS = ['connections', 'expenses', 'contacts'] as const;`
  - `const section = SECTIONS.includes(params.get('section') as never) ? params.get('section')! : 'connections';`
  - `onValueChange={(next) => setParams((p) => { p.set('section', next); return p; }, { replace: true })}` (match Reports' exact setter idiom).
  - Move the existing **Connections** `Card` into `<TabsContent value="connections">`, the existing **expense-category** `Card` into `<TabsContent value="expenses">`, and add `<TabsContent value="contacts">` rendering:

```tsx
<Card>
  <CardHeader>
    <CardTitle>Bank provider token → contact</CardTitle>
  </CardHeader>
  <CardContent>
    <BankProviderContactMapEditor
      value={c.banking.contactMap}
      contacts={flattenDictionary(c.dictionaries['contact'])}
      contactDict={c.dictionaries['contact']}
    />
  </CardContent>
</Card>
```

- `<TabsList variant="underline">` with three `TabsTrigger`s (Connections / Expenses / Contacts). Import `BankProviderContactMapEditor`.

- [ ] **Step 4: Run — expect PASS.** Same command as Step 2, then full profile suite: `pnpm exec vitest run src/features/profile src/pages/ProfilePage.test.tsx`, then `pnpm typecheck`.

- [ ] **Step 5: Commit.**

```bash
git add src/features/profile/ProfileBankingPane.tsx src/features/profile/ProfileBankingPane.test.tsx
git commit -m "feat(banking): split Banking into Connections/Expenses/Contacts sub-tabs (tracker#54)"
```

---

### Task 5: Inline "Map to contact…" in the edit dialog

**Files:**

- Modify: `src/features/transactions/EditTransactionDialog.tsx` (header block ~lines 117-143)
- Test: `src/features/transactions/EditTransactionDialog.test.tsx`

- [ ] **Step 1: Failing test.** Add cases to `EditTransactionDialog.test.tsx`:

```ts
// tx.bankProviderContact = 'MagazinREMONTI', not in contactMap -> renders a
//   creatable contact picker labelled "Map to contact…"; committing an existing
//   contact issues updateBanking with { contactMap: { MagazinREMONTI: <id> } }
//   merged over the current map (assert body via MSW handler)
// tx.bankProviderContact present AND a key in contactMap -> read-only line
//   "Imported · Counterparty MagazinREMONTI → <contact name>", no picker
// tx.bankProviderContact = null -> neither picker nor line
// while config is unresolved (config query pending) -> token shows read-only,
//   NO mapper (prevents a write against an undefined map)
```

Use the test's existing config/MSW setup; seed `contactMap` via the banking-enabled config override where the mapped-case needs it.

- [ ] **Step 2: Run — expect FAIL.** Run: `pnpm exec vitest run src/features/transactions/EditTransactionDialog.test.tsx`

- [ ] **Step 3: Implement.** The outer component already has `const { data: config } = useConfiguration()` (`EditTransactionDialog.tsx:43`) and renders the header from `currentTx` — **reuse both**. Add three things to that outer component: `const update = useUpdateBanking();`, `const createContact = useCreateDictionaryEntry();`, and `const contacts = flattenDictionary(config?.dictionaries.contact);`. Then, in the `DialogHeader` after the existing `bankProviderCategory` block (line 137), add the `bankProviderContact` block. **Guard on `config`** — while it is `undefined` (query pending) render the token read-only with no mapper:

```tsx
{
  currentTx.bankProviderContact &&
    (() => {
      const token = currentTx.bankProviderContact;
      const map = config?.banking.contactMap;
      const readOnly = (suffix?: string) => (
        <p className="text-xs text-muted-foreground">
          Imported · Counterparty{' '}
          <span className="select-all font-mono" title="Counterparty token from the bank">
            {token}
          </span>
          {suffix}
        </p>
      );
      // Config not yet loaded: show the token, no mapper (can't merge into an
      // unknown map).
      if (!map) return readOnly();
      const mappedId = map[token];
      if (mappedId) {
        const name = contacts.find((x) => x.id === mappedId)?.name;
        return readOnly(` → ${name ?? 'mapped contact'}`);
      }
      const mapTo = (id: UUID) => update.mutate({ contactMap: { ...map, [token]: id } });
      return (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Imported · Counterparty</span>
          <span className="select-all font-mono">{token}</span>
          <div className="w-56">
            <ContactCombobox
              options={contacts}
              value={null}
              onChange={(id) => {
                if (id) mapTo(id);
              }}
              onCreate={async (name) => {
                const r = await createContact.mutateAsync({
                  dictId: 'contact',
                  name,
                  dict: config?.dictionaries.contact,
                });
                mapTo(r.id);
              }}
              placeholder="Map to contact…"
              aria-label="Map to contact"
            />
          </div>
        </div>
      );
    })();
}
```

Imports to add: `ContactCombobox`, `useUpdateBanking`, `useCreateDictionaryEntry`, `flattenDictionary` (if not already imported), and `UUID` type. No `config!` non-null assertions anywhere — the `if (!map) return` guard makes `map` definitely-defined below it.

- [ ] **Step 4: Run — expect PASS.** Same command as Step 2, then `pnpm typecheck`.

- [ ] **Step 5: Commit.**

```bash
git add src/features/transactions/EditTransactionDialog.tsx src/features/transactions/EditTransactionDialog.test.tsx
git commit -m "feat(transactions): inline map-to-contact for imported provider tokens (tracker#54)"
```

---

### Task 6: Full verification + live smoke test

- [ ] **Step 1: Full check.** Run: `pnpm typecheck && pnpm lint && pnpm exec vitest run`. Expected: all green. Fix any fallout (e.g. other fixtures/usages of the changed DTOs).

- [ ] **Step 2: Live smoke test** (backend is running per the operator). Use the `verify`/`run` skill to drive the real app:
  - Start the app (`just run` / `pnpm dev`, `http://localhost:5173/app/`) against the running backend; sign in.
  - Profile → Banking → **Contacts**: add a mapping (token e.g. `MagazinREMONTI` → a contact), Save; reload and confirm it persisted (round-trips through `GET .../configuration`).
  - Open an **imported** expense that carries a provider token: confirm the header shows `Imported · Counterparty <token>`; if unmapped, map it inline and confirm the header flips to the read-only `→ <contact>` state.
  - Confirm the **Expenses** sub-tab and **Connections** sub-tab still work (no regression from the tab split), and `?section=` deep-links.

- [ ] **Step 3: Version bump.** Bump the web package version (patch/minor per repo convention for a feature — check the last feature PR; likely a minor). Commit.

- [ ] **Step 4: Push + PR.** Push `feat/provider-contact-map`; open a PR titled `feat(banking): web provider-contact resolution (tracker#54)` with base `master`, summarising the sub-tabs + inline mapper and linking tracker#54.

---

## Notes for the implementer

- **Reuse, don't rebuild:** `ContactCombobox` already handles searchable + creatable + archived-value display; do not reimplement a picker.
- **Set-semantics:** every `useUpdateBanking({ contactMap })` sends the WHOLE map. When mapping inline, spread the current `config.banking.contactMap` and add the one key — never send a single-key map (it would wipe the rest).
- **No re-resolution:** mapping a token affects future imports only; already-imported transactions keep their `contactId`. Don't add any client-side reprocessing.
- **MSW:** `onUnhandledRequest: 'error'` — add/override handlers for the banking update in each new test; per-test `server.use(...)` resets automatically.
- **DRY the two call sites** of create-and-map if it reads cleanly, but a tiny bit of duplication between the editor and the dialog is acceptable — do not over-abstract into a shared hook unless a third caller appears.
