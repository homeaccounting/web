---
status: in-progress
---

# User Profile (View & Edit) — Design

**Date:** 2026-06-05
**Status:** Draft (pre-implementation)
**Issue:** [homeaccounting/web#16](https://github.com/homeaccounting/web/issues/16)
**Scope:** A signed-in user can view and edit their profile from a dedicated `/profile` route. Three tabs:

1. **General** — change default currency (always editable); change base currency (editable only while the user's books contain no transactions).
2. **Dictionaries** — CRUD over the three user dictionaries: `income-category`, `expense-category`, `labels`.
3. **Auth** — change password (when a password is set); link/unlink Google; link/unlink Telegram.

**Predecessors:** [`2026-04-29-web-link-telegram-design.md`](./2026-04-29-web-link-telegram-design.md) (reuses `LinkTelegramDialog`); the create/edit-account specs for diff/error patterns.

## 1. Purpose & scope

The MVP shipped a Home page that lists accounts and transactions and a `UserMenu` dropdown with ad-hoc "Link Google" / "Link Telegram" / "Sign out" items. Users have no way to view their profile, change their default or base currency, manage categories/labels, change their password, or unlink an identity. This slice adds a dedicated profile page that consolidates those concerns.

### In scope

- New route `/profile` with three tab panes; `/profile/:tab` is bookmarkable (`general` | `dictionaries` | `auth`).
- General tab: edit default currency; edit base currency, gated on a new backend flag `baseCurrencyEditable` (see §2.1) and wrapped in a confirmation dialog.
- Dictionaries tab: add / rename / delete entries in `income-category`, `expense-category`, `labels`.
- Auth tab: change password (only when `hasPassword === true`); link/unlink Google (reusing the existing OAuth redirect flow); link/unlink Telegram (reusing `LinkTelegramDialog`).
- `UserMenu` trimmed to **Profile** + **Sign out**; the ad-hoc Link Google / Link Telegram menu items move into the Auth pane.

### Explicitly out of scope (deferred)

- Email change (backend `PUT /api/users/me` returns 501 today; the spec doesn't surface an email editor).
- Setting an initial password for OAuth-only users (`hasPassword === false`) — backend has no endpoint for this. The Auth pane shows a notice instead.
- Other OAuth providers the backend supports (GitHub, Microsoft). Issue #16 names Google + Telegram; we follow the issue.
- Multi-currency UX changes elsewhere in the app driven by a base-currency change.
- Optimistic updates for dictionary mutations. Invalidate-on-success matches every other feature in the codebase.

## 2. Backend dependency

### 2.1 Required backend change (in `server-infra`, prerequisite PR)

Base-currency change is gated server-side on the user's **External account** (`profile.externalAccountId`) having zero transactions (`Domain/Account/CommandHandler.hs:276` — `account.hasTransactions = Left AccountCurrencyLocked`). The current error path (`Application/Services/Internal.hs:118`) collapses every account-command rejection into a generic `AccountError "Account command rejected by domain"` → HTTP 400 / `code: "ACCOUNT_ERROR"`, so the web client cannot distinguish "currency locked" from any other account error.

To make the UI preventive rather than reactive, the backend must expose the precondition as a boolean on the configuration read model:

- Add `baseCurrencyEditable :: Bool` to `ConfigurationData` (`Application/ReadModels/Configuration.hs`) and to `ConfigurationResponse` (`Web/API/ConfigurationAPI.hs`).
- `ConfigurationService.getConfigurationForUser` populates it by reading the External account's `hasTransactions` and inverting.
- Backend tests: fresh user → `true`; after a posted transaction touching External → `false`.

The web client renders the base-currency select as disabled when the flag is `false`. We do **not** introduce a dedicated `BASE_CURRENCY_LOCKED` error code in this slice; the rare race (flag was `true` at page load, transaction posted before Save) surfaces the generic 400 as a toast asking the user to refresh and try again.

### 2.2 Existing endpoints reused

All other endpoints already exist (`server-infra`'s `Web/API/UserAPI.hs` and `Web/API/ConfigurationAPI.hs`):

| Endpoint                                                              | Used by                             |
| --------------------------------------------------------------------- | ----------------------------------- |
| `GET /api/users/me`                                                   | Auth tab + shared profile hook      |
| `POST /api/users/me/change-password`                                  | Auth tab                            |
| `DELETE /api/users/me/oauth/:provider`                                | Auth tab                            |
| `DELETE /api/users/me/telegram`                                       | Auth tab                            |
| `GET /api/auth/oauth/:provider` + `POST /api/auth/link-oauth`         | Auth tab (reuses existing flow)     |
| `POST /api/auth/telegram/link-code`                                   | Auth tab (via `LinkTelegramDialog`) |
| `GET /api/users/me/configuration`                                     | General + Dictionaries tabs         |
| `PUT /api/users/me/configuration/base-currency`                       | General tab                         |
| `PUT /api/users/me/configuration/default-currency`                    | General tab                         |
| `POST   /api/users/me/configuration/dictionaries/:dictId/entries`     | Dictionaries tab                    |
| `PUT    /api/users/me/configuration/dictionaries/:dictId/entries/:id` | Dictionaries tab                    |
| `DELETE /api/users/me/configuration/dictionaries/:dictId/entries/:id` | Dictionaries tab                    |

The `DELETE /oauth/:provider` capture is `Text` and parsed server-side; we send the slug `"google"` (lowercase) to mirror `initiateOAuth('google')`.

## 3. Routes & navigation

```tsx
// src/App.tsx
<Route element={<ProtectedRoute />}>
  <Route path="/" element={<HomePage />} />
  <Route path="/accounts/:id" element={<HomePage />} />
  <Route path="/profile" element={<ProfilePage />} />
  <Route path="/profile/:tab" element={<ProfilePage />} />
</Route>
```

`ProfilePage`:

- Reads `:tab` from URL params; defaults to `"general"`.
- Validates against the closed set `["general","dictionaries","auth"]`; an unknown tab redirects to `/profile/general` via `<Navigate replace>`.
- Renders shared `<Header/>` and a shadcn `<Tabs value={tab} onValueChange={…}>` container; switching tabs `navigate(/profile/${nextTab})` so each tab is bookmarkable and back/forward navigation works.

`UserMenu` becomes:

```
[avatar dropdown]
  email@example.com
  ──────────────────
  Profile           →  navigate('/profile')
  Sign out
```

The old `Link Google` / `Link Telegram` menu items are removed; `LinkTelegramDialog` is preserved as a reusable component, instantiated from the Auth pane.

## 4. File layout

```
src/
├── pages/
│   └── ProfilePage.tsx                # route component + tab plumbing
├── features/
│   └── profile/
│       ├── ProfileGeneralPane.tsx
│       ├── ProfileDictionariesPane.tsx
│       ├── ProfileAuthPane.tsx
│       ├── DictionaryList.tsx         # reusable list for one dictionary
│       ├── ProviderRow.tsx            # reusable row for one linked identity
│       ├── useUserProfile.ts          # shared ['users','me'] query
│       ├── useSetBaseCurrency.ts
│       ├── useSetDefaultCurrency.ts
│       ├── useAddDictionaryEntry.ts
│       ├── useRenameDictionaryEntry.ts
│       ├── useRemoveDictionaryEntry.ts
│       ├── useChangePassword.ts
│       ├── useUnlinkOAuth.ts
│       ├── useUnlinkTelegram.ts
│       ├── passwordSchema.ts
│       └── entryNameSchema.ts
└── components/
    └── UserMenu.tsx                   # trimmed; uses useUserProfile
```

`src/auth/oauthFlow.ts` gains an optional `returnTo` payload (see §7.3). `src/api/users.ts` and `src/api/configuration.ts` grow new methods (see §5). `src/api/types.ts` gains new DTOs (see §5).

## 5. API client additions

### 5.1 `src/api/types.ts`

```ts
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}
export interface ChangeCurrencyRequest {
  currency: string;
}
export interface AddEntryRequest {
  name: string;
}
export interface AddEntryResponse {
  id: UUID;
  name: string;
}
export interface RenameEntryRequest {
  name: string;
}

// Drift fix to keep types.ts in lockstep with backend `ConfigurationResponse`:
export interface ConfigurationResponse {
  baseCurrency: string;
  defaultCurrency: string;
  dictionaries: Record<string, DictionaryResponse>;
  banking: BankingConfigurationDTO;
  booksClosedThrough?: ISO8601 | null; // already present on backend
  baseCurrencyEditable: boolean; // NEW — added in the backend prerequisite PR (§2.1)
}
```

### 5.2 `src/api/users.ts`

```ts
export const usersApi = (client: ApiClient) => ({
  getMe: () => client.get<UserProfileResponse>('/api/users/me'),
  changePassword: (body: ChangePasswordRequest) =>
    client.post<void>('/api/users/me/change-password', body),
  unlinkOAuth: (provider: OAuthProviderName) =>
    client.delete<void>(`/api/users/me/oauth/${provider.toLowerCase()}`),
  unlinkTelegram: () => client.delete<void>('/api/users/me/telegram'),
});
```

### 5.3 `src/api/configuration.ts`

```ts
export const configurationApi = (client: ApiClient) => ({
  get: () => client.get<ConfigurationResponse>('/api/users/me/configuration'),
  setBaseCurrency: (body: ChangeCurrencyRequest) =>
    client.put<void>('/api/users/me/configuration/base-currency', body),
  setDefaultCurrency: (body: ChangeCurrencyRequest) =>
    client.put<void>('/api/users/me/configuration/default-currency', body),
  listDictionary: (dictId: string) =>
    client.get<DictionaryResponse>(`/api/users/me/configuration/dictionaries/${dictId}`),
  addEntry: (dictId: string, body: AddEntryRequest) =>
    client.post<AddEntryResponse>(
      `/api/users/me/configuration/dictionaries/${dictId}/entries`,
      body,
    ),
  renameEntry: (dictId: string, entryId: UUID, body: RenameEntryRequest) =>
    client.put<void>(`/api/users/me/configuration/dictionaries/${dictId}/entries/${entryId}`, body),
  removeEntry: (dictId: string, entryId: UUID) =>
    client.delete<void>(`/api/users/me/configuration/dictionaries/${dictId}/entries/${entryId}`),
});
```

### 5.4 `ApiClient`

If `client.delete<T>()` isn't already present, add it (mirroring `put/post`: `fetch` with `method: 'DELETE'`; empty-body 2xx → `void` via the existing handling).

## 6. General tab

Two fields backed by `useConfiguration()`. Each is a labeled shadcn `<Select>` over `SUPPORTED_CURRENCIES`. The Save button is per-field; it's disabled until the selection differs from the current value and shows a spinner while the mutation is pending.

### Default currency

1. User picks a value → clicks Save.
2. `useSetDefaultCurrency` calls `configurationApi.setDefaultCurrency({ currency })`.
3. On success: invalidate `['configuration']`; toast "Default currency updated".
4. On error: render `ApiError.message` (and `fieldErrors.currency` if present) under the field.

### Base currency

- When `configuration.baseCurrencyEditable === false`: the `<Select>` is rendered `disabled`, no Save button, and a note appears below: "Base currency is locked because your books already contain transactions."
- When `true`: same UX as default currency, but Save first opens an `<AlertDialog>`:
  > "Change base currency from {old} to {new}? This re-bases the External account that anchors your reporting. This cannot be undone from the UI."
  > **Cancel** | **Change base currency**
- Confirm fires the mutation; success path matches default currency; on 400 `ACCOUNT_ERROR` (the race window) we toast: "Couldn't change base currency. It may have been locked by a recent transaction. Refresh and try again."

### Schema

```ts
const currencySchema = z.object({ currency: z.enum(SUPPORTED_CURRENCIES) });
```

### Loading / error

- `useConfiguration` `pending` → two skeleton rows.
- `error` → inline message + Retry (`refetch`).

## 7. Dictionaries tab

Two cards stacked vertically:

- **Categories** — section heading "Income" listing `dictionaries['income-category'].entries`, then "Expense" listing `dictionaries['expense-category'].entries`, each with its own Add row.
- **Labels** — single list over `dictionaries['labels'].entries` with an Add row.

A reusable `DictionaryList` drives all three:

```ts
interface DictionaryListProps {
  dictId: 'income-category' | 'expense-category' | 'labels';
  title: string;
  entries: DictionaryEntryResponse[];
  addLabel: string;
}
```

### 7.1 Per-row interactions

Each row shows the entry name and two icon buttons (visible on hover; always on small screens):

- **Pencil → rename:** the row text is replaced by an `<Input>` seeded with the current name; Enter saves, Escape cancels, blur saves. Calls `renameEntry(dictId, id, { name })`. Invalidates `['configuration']` on success.
- **Trash → delete:** opens an `<AlertDialog>` ("Delete category 'Salary'? Transactions tagged with it will not be deleted."). Confirm fires `removeEntry(dictId, id)`.

### 7.2 Add row

A trailing row "[+ {addLabel}]". Clicking expands it into an `<Input>` + Save/Cancel pair. Enter/blur saves (`addEntry`), Escape cancels.

### 7.3 Schema

Shared schema mirrors backend `mkEntryName`:

```ts
export const entryNameSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
});
```

### 7.4 Error handling

- `ApiError.fieldErrors.name` → inline under the input.
- `LabelInUse` / `CategoryInUse` (HTTP 409 with the backend's `code`) → toast with the backend message; row stays.
- "Cannot remove last entry" (the aggregate-local rule) → toast with backend message.

### 7.5 Empty state

If a dictionary has zero entries (only realistic in fixtures), show "No entries yet" above the Add row.

## 8. Auth tab

Shared hook `useUserProfile` wraps the `['users','me']` query. `UserMenu` migrates to the same hook so both surfaces share the cache entry.

### 8.1 Password card

Renders only when `profile.hasPassword === true`. Otherwise shows: "Your account uses OAuth sign-in. Setting an initial password isn't available yet." (deferred to a future slice with backend support).

Three fields: current / new / confirm. React-hook-form + Zod:

```ts
const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(8, 'At least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });
```

Submit calls `usersApi.changePassword({ currentPassword, newPassword })`. On success: form reset, toast. On error: `ApiError.message` shown near the form; `fieldErrors.currentPassword` under that field if present. Submit button disabled until `formState.isValid && formState.isDirty`.

### 8.2 Linked accounts card

Two rows — **Google** and **Telegram** — driven by a reusable `ProviderRow`:

```ts
interface ProviderRowProps {
  provider: 'Google' | 'Telegram';
  status: { linked: false } | { linked: true; subtitle: string };
  onLink: () => void;
  onUnlink: () => Promise<void>;
  disableUnlinkReason?: string;
}
```

- **Linked subtitle** is derived per provider:
  - Google: the matching `oauthIdentities[i].subject` (the user's Google email).
  - Telegram: `@{username}` if username present, else `firstName`.
- **Link Google** reuses the existing flow (`authApi.initiateOAuth('google')` → `saveOAuthState` → `beginLinkFlow({ returnTo: '/profile/auth' })` → `window.location.href = redirectUrl`).
- **Link Telegram** opens `LinkTelegramDialog`.
- **Unlink** opens an `<AlertDialog>`:

  > "Unlink {Google|Telegram}? You won't be able to sign in with it until you link it again."

  Confirm calls `usersApi.unlinkOAuth('Google')` or `usersApi.unlinkTelegram()`. On success: invalidate `['users','me']`; toast.

### 8.3 Last-credential UX guard

The Unlink button is disabled with a tooltip "You need at least one way to sign in" when:

```
hasPassword === false
  && oauthIdentities.length + (telegramIdentity ? 1 : 0) <= 1
```

This is a UX guard — the backend remains the source of truth, and any 4xx is surfaced as a toast.

### 8.4 OAuth return-to extension

`src/auth/oauthFlow.ts` currently distinguishes "linking" vs "login" via session storage. We extend `beginLinkFlow` to accept an optional `returnTo: string` (default `'/'`) and persist it under a new session-storage key. `OAuthCallbackPage` reads it on the link path and `navigate(returnTo)`. Two-line change in `oauthFlow.ts` + one branch in the callback.

## 9. Error / loading conventions

- All mutations: invalidate the relevant query (`['configuration']` or `['users','me']`) on success; surface `ApiError.message` and optional `fieldErrors` on failure.
- All forms: react-hook-form + Zod schema; submit disabled until `isValid && isDirty`.
- Loading: skeleton rows or `<Spinner>` matching the existing patterns in `AccountsPane` / `TransactionsPane`.
- Toast notifications use the existing shadcn `<Toaster>` (same as `AdjustBalanceDialog`).

## 10. Testing strategy

### 10.1 MSW handlers (extend `src/test/handlers.ts`)

```
PUT    /api/users/me/configuration/base-currency           → 204
PUT    /api/users/me/configuration/default-currency        → 204
POST   /api/users/me/configuration/dictionaries/:dictId/entries           → 201 { id, name }
PUT    /api/users/me/configuration/dictionaries/:dictId/entries/:entryId  → 204
DELETE /api/users/me/configuration/dictionaries/:dictId/entries/:entryId  → 204
POST   /api/users/me/change-password                       → 204
DELETE /api/users/me/oauth/:provider                       → 204
DELETE /api/users/me/telegram                              → 204
```

`src/test/fixtures.ts` configuration fixture gains `baseCurrencyEditable: true`.

### 10.2 Unit / component tests

- `ProfileGeneralPane.test.tsx`:
  - Both selects render with current values from fixture.
  - Default-currency change: pick value → Save → request fires → cache invalidates → toast.
  - Base-currency change: Save opens AlertDialog; Cancel → no request; Confirm → request fires.
  - `baseCurrencyEditable: false` → base select disabled, no Save button, locked notice shown.
  - 400 error → inline message rendered.

- `ProfileDictionariesPane.test.tsx`:
  - Three lists render from fixture.
  - Add: click Add row → input appears → type + Enter → POST sent.
  - Rename: pencil → input with current name → edit + Enter → PUT sent.
  - Delete: trash → AlertDialog → Confirm → DELETE sent.
  - 409 `LabelInUse` / `CategoryInUse` → toast, row not removed.
  - Escape cancels inline inputs.

- `ProfileAuthPane.test.tsx`:
  - `hasPassword: true` → form renders; happy path; mismatch validation; 400 with `fieldErrors.currentPassword` rendered under the field.
  - `hasPassword: false` → notice shown, no form.
  - Google not linked → "Link Google" button initiates OAuth (asserts `initiateOAuth` called, `window.location.href` set).
  - Google linked → Unlink → AlertDialog → DELETE sent → cache invalidates.
  - Last-credential guard: Unlink button disabled with tooltip when only one identity remains and no password.
  - Telegram link button opens `LinkTelegramDialog`.

- `useUserProfile.test.ts`: shares the `['users','me']` query key with `UserMenu`.

- `ProfilePage.test.tsx`: default → General; `/profile/dictionaries` → Dictionaries; clicking a tab updates the URL.

- `UserMenu.test.tsx` (update): only Profile + Sign out items render.

- `oauthFlow.test.ts` (extend): `beginLinkFlow({ returnTo })` round-trips through session storage.

- `OAuthCallbackPage.test.tsx` (extend): successful link with `returnTo` navigates there instead of `/`.

### 10.3 E2E (`e2e/profile.spec.ts`)

One happy-path spec covering the non-OAuth flows:

1. Visit `/app/profile`.
2. **General**: change default currency from `USD` to `EUR`, Save → success toast visible; reload → field still `EUR`.
3. **Dictionaries**: switch to tab; add a label "trip"; rename it to "travel"; delete it.
4. **Auth**: change password using the seeded credentials; assert success toast.

OAuth and Telegram link flows are not E2E-tested (provider-dependent); they're covered by unit tests with mocked redirects.

### 10.4 Explicitly not tested

- Backend `baseCurrencyEditable` derivation — backend PR's responsibility.
- Provider round-trip end-to-end.
- Race where the flag becomes stale between page-load and Save — covered functionally by "fixture returns 400, toast appears" unit test.

## 11. Open questions / follow-ups

1. **Initial password set for OAuth-only users.** Requires a backend endpoint (e.g. `POST /api/users/me/set-password` with no `currentPassword`). Out of scope here; the Auth pane shows a placeholder notice.
2. **Other OAuth providers.** Issue #16 names Google + Telegram; GitHub and Microsoft can be added later by extending `ProviderRow` and the row list.
3. **Email change.** Backend `PUT /api/users/me` is stubbed (`501 Not Implemented`). Defer the UI until the backend lands.
4. **Optimistic mutations.** Skipped in v1; revisit if real-world perception of dictionary edits feels slow.
5. **Categories vs labels nesting.** If `dictionaries` grows beyond income/expense/labels (e.g. an "MCC" dict), the two-card layout will need a clearer organising principle.

## 12. Backwards compatibility & migration

- `UserMenu` removes the ad-hoc Link Google / Link Telegram items; users find them under Profile → Auth instead. No persisted state changes.
- `LinkTelegramDialog` remains exported with the same signature; only the call site moves.
- `ConfigurationResponse` gains `baseCurrencyEditable`. The field is required; the FE will not deploy ahead of the backend PR that introduces it.
- `oauthFlow` adds an optional `returnTo`; default behavior (no `returnTo`) is unchanged.
