# Banking Configuration — Web (Frontend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a **Banking** tab to the Profile page (manage monobank connections, default categories, and the MCC→category map) and a **Sync now** action on the Accounts toolbar, all driven by the backend contract from the companion backend plan.

**Architecture:** Mirror the existing profile/dictionary feature patterns. Per-resource API functions in `src/api/`, TanStack `useMutation`/`useQuery` hooks in `src/features/`, presentational components built from shadcn primitives, react-hook-form + zod for the connection form, MSW for tests. The whole Banking surface is gated on a global `bankingFeatureEnabled` flag from `GET /configuration`. Account↔connection links and "Sync now" gating key off each connection's `accountMap` (external→local id), never typed strings.

**Tech Stack:** React 18, TypeScript (strict), TanStack Query, react-hook-form + zod, shadcn/ui (Radix + Tailwind), Vitest + Testing Library + MSW, Playwright.

**Spec:** `docs/specs/2026-06-07-banking-configuration-design.md` (§3 is this plan).
**Prerequisite:** the backend plan (`../../../server-infra/docs/plans/2026-06-07-banking-configuration-backend.md`) ships the contract this plan consumes. Tests here use MSW, so this plan can be **written and even built/tested against MSW before** the backend merges; only end-to-end verification needs the real backend.

---

## Conventions

- **Run tests:** `pnpm test` (all) · `pnpm exec vitest run src/features/configuration` (by path) · `pnpm exec vitest run -t "sync now"` (by name).
- **Typecheck/lint:** `pnpm typecheck` · `pnpm lint`. **`just check` = typecheck + lint + format-check.**
- Import via `@/…`. Keep DTOs in `src/api/types.ts` in lockstep with the backend; cite `server-infra/src/Web/API/ConfigurationAPI.hs` in comments (repo rule).
- **No toast system exists** — surface async results with `Alert` banners / inline status text, matching `ProfileGeneralPane`/`DictionaryList`. (Do **not** add a toast lib; the spec says "toast" but the house pattern is an Alert.)
- Every mutation hook follows the house shape: `ApiClient` built from `tokenRef`/`signOut`, `invalidateQueries(['configuration'])` on success. Template: `src/features/profile/useAddDictionaryEntry.ts`.
- Commit after each green task. `feat(banking): …` / `test(banking): …`.

## File Structure

**Create:**

- `src/components/ui/switch.tsx` — shadcn Switch (Task 2).
- `src/api/banking.ts` — `resync`, `listExternalAccounts`.
- `src/features/configuration/useUpdateBanking.ts`, `useAddConnection.ts`, `useUpdateConnection.ts`, `useChangeToken.ts`, `useRemoveConnection.ts`, `useSetAccountMap.ts`, `useExternalAccounts.ts`.
- `src/features/banking/useResync.ts` (+ `useResync.test.tsx`).
- `src/features/profile/ProfileBankingPane.tsx` (+ test).
- `src/features/profile/BankConnectionDialog.tsx` (+ test).
- `src/features/profile/LinkAccountsDialog.tsx` (+ test).
- `src/features/profile/MccMappingEditor.tsx` (+ test).
- `src/features/profile/bankConnectionSchema.ts` — zod schemas (connection form + MCC row).
- `src/features/accounts/SyncNowButton.tsx` (+ test) — or inline in `AccountsPane`; see Task 9.

**Modify:**

- `src/api/types.ts` — `BankConnectionDTO`, `ExternalAccountDTO`, extend `BankingConfigurationDTO` + `ConfigurationResponse`, request types.
- `src/api/configuration.ts` — `updateBanking`, connection CRUD, `setAccountMap`.
- `src/pages/ProfilePage.tsx` — add `'banking'` tab (conditional on `bankingFeatureEnabled`).
- `src/features/accounts/AccountsPane.tsx` — mount the Sync action.
- `src/test/fixtures.ts` — extend `configurationFixture` (`bankingFeatureEnabled`, `connections`); add an external-accounts fixture.
- `src/test/handlers.ts` — handlers for the new endpoints.

---

## Task 1: API types + client functions

**Files:** Modify `src/api/types.ts`, `src/api/configuration.ts`. Create `src/api/banking.ts`.

- [ ] **Step 1: Failing test** — `src/api/banking.test.ts`, following the existing **API-layer** test style in `src/api/configuration.test.ts` (which uses `vi.stubGlobal('fetch', …)` and asserts on URL/method/body — NOT MSW): `resync(client, 'conn-1', {from,to})` POSTs to `/api/banking/connections/conn-1/resync` and returns the `ResyncResponse`; `listExternalAccounts(client,'conn-1')` GETs `/api/banking/connections/conn-1/external-accounts` and returns `ExternalAccountDTO[]`.
- [ ] **Step 2: Run** `pnpm exec vitest run src/api/banking.test.ts` → FAIL.
- [ ] **Step 3: Implement.** In `types.ts` (after the existing Configuration block ~line 302):

```ts
export interface BankConnectionDTO {
  id: UUID;
  provider: string; // "monobank"
  name: string;
  enabled: boolean;
  tokenSet: boolean;
  tokenHint: string; // masked display only
  accountMap: Record<string, UUID>; // externalAccountId → local accountId
}

export interface ExternalAccountDTO {
  externalId: string;
  iban: string;
  maskedPan: string | null;
  currency: string;
  balance: number; // minor units, display only
}

export interface AddBankConnectionRequest {
  provider: string;
  name: string;
  token: string;
  enabled: boolean;
}
export interface UpdateBankConnectionRequest {
  name?: string;
  enabled?: boolean;
}
export interface ChangeBankTokenRequest {
  token: string;
}
export interface SetAccountMapRequest {
  accountMap: Record<string, UUID>;
}
export interface UpdateBankingRequest {
  defaultIncomeCategory?: UUID | null;
  defaultExpenseCategory?: UUID | null;
  mccExpenseCategoryMap?: Record<string, UUID>;
}
export interface ResyncRequest {
  from: string;
  to: string;
} // ISO-8601 UTC
export interface ResyncAccountResult {
  externalAccountId: string;
  localAccountId: UUID;
  importedCount: number;
  skippedCount: number;
  failureCount: number;
}
export interface ResyncResponse {
  accounts: ResyncAccountResult[];
}
```

Extend `BankingConfigurationDTO` with `connections: BankConnectionDTO[];` and `ConfigurationResponse` with `bankingFeatureEnabled: boolean;`.

In `configuration.ts` add to the returned object:

```ts
  updateBanking: (body: UpdateBankingRequest) =>
    client.put<BankingConfigurationDTO>('/api/users/me/configuration/banking', body),
  addConnection: (body: AddBankConnectionRequest) =>
    client.post<BankConnectionDTO>('/api/users/me/configuration/banking/connections', body),
  updateConnection: (id: UUID, body: UpdateBankConnectionRequest) =>
    client.put<void>(`/api/users/me/configuration/banking/connections/${id}`, body),
  changeToken: (id: UUID, body: ChangeBankTokenRequest) =>
    client.put<void>(`/api/users/me/configuration/banking/connections/${id}/token`, body),
  removeConnection: (id: UUID) =>
    client.delete<void>(`/api/users/me/configuration/banking/connections/${id}`),
  setAccountMap: (id: UUID, body: SetAccountMapRequest) =>
    client.put<void>(`/api/users/me/configuration/banking/connections/${id}/accounts`, body),
```

Create `src/api/banking.ts`:

```ts
import type { ApiClient } from './client';
import type { ExternalAccountDTO, ResyncRequest, ResyncResponse, UUID } from './types';

export const bankingApi = (client: ApiClient) => ({
  resync: (connectionId: UUID, body: ResyncRequest): Promise<ResyncResponse> =>
    client.post<ResyncResponse>(`/api/banking/connections/${connectionId}/resync`, body),
  listExternalAccounts: (connectionId: UUID): Promise<ExternalAccountDTO[]> =>
    client.get<ExternalAccountDTO[]>(`/api/banking/connections/${connectionId}/external-accounts`),
});
```

- [ ] **Step 4: Run** → PASS. `pnpm typecheck`.
- [ ] **Step 5: Commit** — `feat(banking): api types + client for connections, external-accounts, resync`

---

## Task 2: shadcn Switch component

**Files:** Create `src/components/ui/switch.tsx`.

- [ ] **Step 1:** `pnpm dlx shadcn@latest add switch` (vendored; excluded from ESLint per `components.json`). If the CLI can't run offline, hand-add the standard shadcn `Switch` (Radix `@radix-ui/react-switch`) — confirm the dep is installed, else `pnpm add @radix-ui/react-switch`.
- [ ] **Step 2:** `pnpm typecheck` → PASS; `import { Switch } from '@/components/ui/switch'` resolves.
- [ ] **Step 3: Commit** — `chore(ui): add shadcn switch component`

---

## Task 3: Test fixtures + MSW handlers

**Files:** Modify `src/test/fixtures.ts`, `src/test/handlers.ts`.

- [ ] **Step 1:** Extend `configurationFixture`: add `bankingFeatureEnabled: true` and `banking.connections: []`. Add fixtures: `bankConnectionFixture: BankConnectionDTO` (enabled, `tokenHint: '3f2'`, `accountMap: {}`) and `externalAccountsFixture: ExternalAccountDTO[]` (two accounts). (TypeScript will force these onto the new types — that itself verifies Task 1.)
- [ ] **Step 2:** Add default MSW handlers in `handlers.ts` mirroring the dictionary handlers (lines ~209): `POST …/banking/connections` → 201 echo as `BankConnectionDTO`; `PUT …/connections/:id` → 204; `PUT …/connections/:id/token` → 204; `DELETE …/connections/:id` → 204; `PUT …/connections/:id/accounts` → 204; `PUT …/configuration/banking` → 200 `BankingConfigurationDTO`; `GET …/banking/connections/:id/external-accounts` → 200 `externalAccountsFixture`; `POST …/banking/connections/:id/resync` → 200 `{accounts: []}`. Per-test specifics use `server.use(...)`.
- [ ] **Step 3: Run** `pnpm test` → still green (no behavior yet; fixtures/handlers compile). Commit — `test(banking): fixtures + MSW handlers for banking endpoints`

---

## Task 4: Mutation/query hooks

**Files:** Create the six configuration hooks under `src/features/configuration/` and `useResync.ts` under `src/features/banking/` (single canonical location — not `accounts/`). Template: `useAddDictionaryEntry.ts` (mutation), `useAccounts.ts` (query).

**Design.** All mutation hooks invalidate `['configuration']` on success. `useExternalAccounts(connectionId)` is a **lazy** query (`enabled: false`, fetched via `refetch()` when the Link dialog opens) so it only triggers the live monobank call on demand. `useResync` invalidates `['transactions']` and `['accounts']` on success (a sync changes both). Example (`useAddConnection.ts`):

```ts
export function useAddConnection() {
  const { tokenRef, signOut } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<BankConnectionDTO, Error, AddBankConnectionRequest>({
    mutationFn: (body) => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return configurationApi(client).addConnection(body);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['configuration'] }),
  });
}
```

`useExternalAccounts.ts`:

```ts
export function useExternalAccounts(connectionId: UUID) {
  const { tokenRef, signOut } = useAuth();
  return useQuery({
    queryKey: ['external-accounts', connectionId],
    enabled: false, // fetched on demand from the Link dialog
    gcTime: 0, // never cache a live bank listing
    queryFn: () => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return bankingApi(client).listExternalAccounts(connectionId);
    },
  });
}
```

- [ ] **Step 1: Failing tests** — one `*.test.tsx` per hook (renderHook + AuthProvider + `server.use`), mirroring `useAddDictionaryEntry.test.tsx`: assert correct method/URL/body and parsed result. For `useExternalAccounts`, assert it does **not** fetch until `refetch()` is called, then returns the fixture. For `useResync`, assert POST body `{from,to}` and that it parses `ResyncResponse`.
- [ ] **Step 2: Run** `pnpm exec vitest run src/features/configuration src/features/banking` → FAIL.
- [ ] **Step 3: Implement** the hooks.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(banking): TanStack hooks for connections, account-map, external-accounts, resync`

---

## Task 5: zod schemas

**Files:** Create `src/features/profile/bankConnectionSchema.ts`. Template: `accounts/schema.ts`, `profile/entryNameSchema.ts`.

```ts
import { z } from 'zod';

export const bankConnectionFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  provider: z.literal('monobank'),
  // Write-only. Required on create; on edit, blank means "keep existing".
  token: z.string().trim().optional(),
  enabled: z.boolean(),
});
export type BankConnectionFormValues = z.infer<typeof bankConnectionFormSchema>;

export const mccRowSchema = z.object({
  mcc: z.string().regex(/^\d{4}$/, 'MCC must be 4 digits'),
  categoryId: z.string().uuid('Pick a category'),
});
export type MccRow = z.infer<typeof mccRowSchema>;
```

- [ ] **Step 1: Failing test** — `bankConnectionSchema.test.ts`: name required; `mcc` rejects non-4-digit; `categoryId` must be uuid.
- [ ] **Step 2: Run** → FAIL. **Step 3:** implement. **Step 4:** PASS. **Step 5: Commit** — `feat(banking): zod schemas for connection form + MCC rows`

---

## Task 6: BankConnectionDialog (add/edit)

**Files:** Create `src/features/profile/BankConnectionDialog.tsx` (+ test). Template: `CreateAccountDialog.tsx` + `AccountForm.tsx` (FormProvider, zodResolver, imperative field-error handling), `Switch` from Task 2.

**Design.** Props: `{ open, onOpenChange, connection?: BankConnectionDTO }` (absent = create). Fields: `name` (Input), `provider` (Select, monobank-only, disabled), `token` (Input `type="password"`; placeholder `"•••• kept"` in edit; **required on create**, blank-keeps on edit), `enabled` (Switch). On submit:

- create → `useAddConnection().mutateAsync({provider:'monobank',name,token,enabled})`.
- edit → `useUpdateConnection(id,{name,enabled})`; **iff** a non-blank token was entered, also `useChangeToken(id,{token})`. Close on success.
  Map `ApiError.fieldErrors` onto fields via `form.setError` (e.g. `name`); show a non-field `Alert` otherwise — exactly as `CreateAccountDialog`.

- [ ] **Step 1: Failing tests** — create requires token (submitting blank shows a token error, no POST); happy create POSTs `{provider,name,token,enabled}` and closes; edit with blank token PUTs only metadata (no token call); edit with a token also calls the token endpoint; backend `fieldErrors.name` shows on the name input.
- [ ] **Step 2: Run** `pnpm exec vitest run src/features/profile/BankConnectionDialog.test.tsx` → FAIL.
- [ ] **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(banking): add/edit bank connection dialog`

---

## Task 7: LinkAccountsDialog (map external → local)

**Files:** Create `src/features/profile/LinkAccountsDialog.tsx` (+ test). Uses `useExternalAccounts` (Task 4), `useSetAccountMap`, `useAccounts` (to list local accounts).

**Design.** Props `{ open, onOpenChange, connection }`. On open, call `externalAccounts.refetch()` (lazy). States: loading (Skeleton), error/429 (`Alert` + a "Try again" button that re-`refetch()`s; detect rate limit via `ApiError.code === 'BANKING_RATE_LIMITED'` or `status === 429`), loaded. Render one row per external account: `iban` / `maskedPan` / `currency` / `balance` + a `Select` of the user's local accounts, pre-selected from `connection.accountMap` (reverse lookup external→local), plus a "— not imported —" option. Disallow selecting the same local account for two external accounts (disable already-chosen options / validate before save). Save builds `accountMap: Record<externalId, accountId>` (omit "not imported") → `useSetAccountMap(connection.id, {accountMap})`; surface field/`Alert` errors (e.g. 409 conflict, 400 not-owned); close on success.

- [ ] **Step 1: Failing tests** — opening triggers the external-accounts fetch and lists two rows; pre-selects from a non-empty `accountMap`; choosing the same local account twice is prevented; Save PUTs the expected `{accountMap}`; a 429 from the fetch shows a retry affordance; a 409 on save shows an error.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(banking): link external monobank accounts to local accounts`

---

## Task 8: MccMappingEditor + default categories

**Files:** Create `src/features/profile/MccMappingEditor.tsx` (+ test). (Default-category selects can live directly in the pane — Task 9 — or here; keep the MCC editor standalone.)

**Design.** Props `{ value: Record<string,UUID>, expenseCategories: DictionaryEntryResponse[] }`. Editable rows `{mcc, categoryId}` (local state seeded from `value`), each = a 4-digit `Input` + a category `Select` + remove button; an "+ Add mapping" button; a "Save" button that validates all rows with `mccRowSchema`, rejects duplicate MCC codes, builds `Record<mcc,categoryId>`, and calls `useUpdateBanking({mccExpenseCategoryMap})`. Errors → inline messages / `Alert`. Default-category selects (income/expense) call `useUpdateBanking({defaultIncomeCategory|defaultExpenseCategory})`.

- [ ] **Step 1: Failing tests** — renders existing rows from `value`; add row → enter `5411` + category → Save PUTs `{mccExpenseCategoryMap:{'5411':<id>}}`; non-4-digit MCC blocks save with a message; remove row drops it from the payload; duplicate MCC blocked.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(banking): MCC→category mapping editor + default category selects`

---

## Task 9: ProfileBankingPane + tab wiring

**Files:** Create `src/features/profile/ProfileBankingPane.tsx` (+ test); modify `src/pages/ProfilePage.tsx`.

**Design (pane).** Mirror `ProfileDictionariesPane`: `useConfiguration()`, pending→Skeleton, error→Alert. Three `Card`s:

1. **Bank connections** — list `c.banking.connections`: name, provider badge, masked `•••• {tokenHint}`, an `enabled` `Switch` (inline `useUpdateConnection`), a mapped-account count (`Object.keys(conn.accountMap).length`), **Link accounts** (opens `LinkAccountsDialog`), **Edit** (opens `BankConnectionDialog`), **Remove** (AlertDialog → `useRemoveConnection`). "+ Add connection" opens the dialog in create mode.
2. **Default categories** — income/expense `Select`s from `c.dictionaries['income-category'|'expense-category']` → `useUpdateBanking`.
3. **MCC → category mapping** — `MccMappingEditor` with `value={c.banking.mccExpenseCategoryMap}` and the expense entries.

**Design (tab).** In `ProfilePage.tsx`: read `useConfiguration()`; compute `bankingEnabled = config.data?.bankingFeatureEnabled ?? false`. Build `TABS` conditionally (append `'banking'` only when enabled). Add `<TabsTrigger value="banking">Banking</TabsTrigger>` + `<TabsContent value="banking"><ProfileBankingPane/></TabsContent>` when enabled. Treat `'banking'` as a valid tab only when enabled.

> **Redirect-race (important):** `active` is computed synchronously from the URL `tab` before `useConfiguration()` resolves. Today `isTab('banking')` is false → the page would immediately redirect `/profile/banking` → `/profile/general` before the flag is known, causing a flicker/false-redirect even when banking IS enabled. **Gate the redirect on config having loaded:** while `config.isPending`, render a Skeleton (don't redirect); only after `config.isSuccess` decide — if `tab === 'banking'` and `!bankingEnabled`, then `<Navigate to="/profile/general" replace />`; if enabled, render the pane. Keep the existing redirect for genuinely-unknown tabs once config is settled.

- [ ] **Step 1: Failing tests** —
  - Pane: with a connection in the fixture, renders its name + masked token + mapped count; toggling the Switch calls `PUT …/connections/:id`; Add opens the dialog.
  - ProfilePage: when `bankingFeatureEnabled: true`, a "Banking" tab is shown and `/profile/banking` renders the pane; when `false`, no Banking tab and `/profile/banking` redirects to `/profile/general`. (Use `server.use` to return a config with the flag off.)
- [ ] **Step 2: Run** `pnpm exec vitest run src/features/profile/ProfileBankingPane.test.tsx src/pages/ProfilePage.test.tsx` → FAIL.
- [ ] **Step 3: Implement** the pane + tab wiring.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(banking): Banking profile tab gated on bankingFeatureEnabled`

---

## Task 10: "Sync now" account action

**Files:** Modify `src/features/accounts/AccountsPane.tsx`; create `src/features/accounts/SyncNowButton.tsx` (+ test). Uses `useConfiguration`, `useResync`.

**Design.** A `RefreshCw` (lucide) icon button in the Accounts toolbar (beside Edit/Adjust/Add). Compute the matched connection:

```ts
const enabledConn = config?.bankingFeatureEnabled
  ? config.banking.connections.find(
      (c) => c.enabled && Object.values(c.accountMap).includes(selectedAccount?.id ?? ''),
    )
  : undefined;
```

Render the button **only when** `selectedAccount && enabledConn` (hidden otherwise — not just disabled). On click: fixed 30-day window — `to = now`, `from = now - 30d` as ISO strings — `useResync(enabledConn.id).mutate({from,to})`. Result feedback via an **`Alert`** rendered in the pane (no toast system): success → "Imported N, skipped M, failed K" summed from `ResyncResponse.accounts`; error → destructive Alert with `ApiError.message` (handle 422 `CONNECTION_DISABLED` / 404 / `FEATURE_DISABLED` defensively → hide/retreat). Keep the date math in a tiny pure helper `last30Days(now: Date)` so it's unit-testable without mocking the clock (pass `new Date()` at the call site).

- [ ] **Step 1: Failing tests** —
  - Hidden when the selected account is **not** a value in any enabled connection's `accountMap`; hidden when `bankingFeatureEnabled` is false even if mapped; shown when mapped + enabled + flag on.
  - Clicking posts to `/api/banking/connections/<matched>/resync` with a `{from,to}` ~30 days apart; success renders the imported/skipped/failed summary; a 422 renders a destructive Alert.
  - `last30Days` returns `to - from === 30 days` (pure unit test).
- [ ] **Step 2: Run** `pnpm exec vitest run -t "sync now"` → FAIL.
- [ ] **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(banking): Sync now account action routed to the mapped connection`

---

## Task 11: Full green + e2e smoke

- [ ] **Step 1:** `just check` (typecheck + lint + format-check) — fix any issues; `pnpm format` if needed.
- [ ] **Step 2:** `pnpm test` — entire unit/component suite PASS.
- [ ] **Step 3:** Playwright smoke (`e2e/`): sign in, open `/profile/banking` (MSW/dev backend with banking enabled), add a connection, see it listed with a masked token. Mark `test.skip` with a note if the dev backend can't enable banking without the real backend; otherwise wire it.
- [ ] **Step 4: Commit** any fixups — `test(banking): green suite + e2e smoke`.
- [ ] **Step 5:** Open PR `feat(banking): banking configuration tab + sync now (#23)` targeting `main`, based on `feat/banking-configuration`. Note it depends on the backend PR (contract). Link issue #23.

---

## Verification before "done" (per superpowers:verification-before-completion)

- [ ] `just check` clean; `pnpm test` green (paste counts).
- [ ] Manually (or via `superpowers:verify` / the `verify` skill) against a banking-enabled backend: add connection → Link accounts maps real monobank accounts → Banking tab shows masked token + mapped count → select a mapped account → **Sync now** imports → transactions appear. Confirm the tab is **absent** when the backend disables banking.

## Risks & notes

- **No toast** — all async feedback is `Alert`/inline (spec says "toast"; house pattern overrides). Keep it consistent.
- **`bankingFeatureEnabled` drives visibility** — gate the tab AND the Sync button on it; also treat a `FEATURE_DISABLED` response defensively (feature toggled off mid-session).
- **Account subtype is untyped** (`{type, [k]:unknown}`) — but Sync gating keys off `accountMap` **values** (account ids), so no `bankName`/subtype access is needed. Don't reintroduce string matching.
- **Live external-accounts call** — `useExternalAccounts` must stay lazy (`enabled:false`, `gcTime:0`); only the Link dialog triggers it; handle 429 with a retry button.
- **Token is write-only** — never render the token; edit leaves it blank to keep. The DTO never carries it.
- **MSW-first** — this whole plan is testable before the backend merges; only Task 11 e2e needs the real backend.
