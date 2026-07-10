---
status: draft
---

# Share an account with another user (web + backend)

Tracker: homeaccounting/tracker#29

## Context

Users want to share an account with another person (e.g. a spouse) so both can
view balances and record expenses against the same account. The backend already
models this with a three-tier RBAC scheme (`Owner`/`Editor`/`Viewer`) and exposes
two write endpoints:

| Action | Method / Path                             | Body                                                      | Response |
| ------ | ----------------------------------------- | --------------------------------------------------------- | -------- |
| Share  | `POST /api/accounts/:id/share`            | `{ userId: UUID, role: "owner" \| "editor" \| "viewer" }` | `204`    |
| Revoke | `DELETE /api/accounts/:id/access/:userId` | —                                                         | `204`    |

Capability tiers (`Application/Services/AuthorizationService.hs`):

- **View** (Viewer+) — read balance & transactions.
- **Modify** (Editor+) — record / transfer / adjust balance.
- **Manage** (Owner only) — share, revoke, close/reopen.

Backend rules the UI must respect: only an Owner can share/revoke; the Owner
cannot be removed; a user cannot share with themselves (`CannotShareWithSelf`);
External accounts cannot be shared (`ExternalAccountCannotBeShared`); a user has
exactly one role per account (re-sharing replaces it).

### What the backend does NOT provide today (verified in `server-infra`)

The tracker issue assumed the backend was complete for the UI, but three gaps
exist:

1. **No role on account reads.** `AccountResponse` (`Web/Types.hs:267`) carries
   only `id, name, balance, currency, overdraftLimit, subtype, status, version`.
   The web app therefore cannot know its own role, gate actions, or distinguish
   owned vs shared accounts. However, `AccountService.listAccountsForUser`
   already receives `(aid, account, role)` from
   `ReadModel.getAccessibleAccounts` and simply **discards** the role — so
   surfacing it is a small change, not new infrastructure.
2. **No "list access" endpoint.** Only share/revoke exist; the owner cannot
   enumerate who currently has access, which the manage/revoke UI needs.
3. **No user lookup.** `UserAPI` exposes only `/me`. There is no email→userId
   resolution, so a share target can only be identified by raw `userId`.

Additional finding: External accounts are **already filtered out** of
`GET /api/accounts` (`listAccountsForUser` drops `accountType == External`), so
the account list never contains a non-shareable account. The "hide share for
External" requirement is effectively free; we still guard defensively.

## Decisions

- **Cross-repo, backend-first.** Extend the backend with the two missing reads,
  then build the web UI. Two PRs (backend, then web).
- **Identify share targets by UUID, not email.** The person to be added copies
  their user ID from their own Profile page and sends it (out of band) to the
  owner, who pastes it into the share dialog.
  - Rationale: `GET /api/users/me` **already returns `userId`**
    (`UserProfileResponse.userId`, `UserAPI.hs:138`), so no new lookup endpoint
    is needed. It works for **every** login method, including Telegram-only
    users who have no email (`RegisterViaTelegram` carries no email; the read
    model stores `email = ""`). It avoids leaking whether an email is
    registered. The only cost is UX friction (copy/paste a UUID), acceptable for
    a household-scale app and mitigated by a copy button + format validation.
- **Grantable roles in the UI: Editor and Viewer only.** Owner is not grantable
  via the dialog (a granted Owner cannot be revoked — avoid an irreversible
  misclick). The backend still accepts `owner` if ever needed.
- **Access-list endpoint is Owner-only.** Non-owners do not see the roster.

## Backend changes (server-infra) — additive

### B1 — Surface role on account reads

- Add `role :: Text` (`"owner" | "editor" | "viewer"`) to `AccountResponse`
  (`Web/Types.hs`).
- Thread the already-available role from `getAccessibleAccounts` through
  `fromAccountData` in `listAccountsForUser` instead of discarding it.
- `getAccountHandler` (single-account GET) resolves the requesting user's role
  from the access list and includes it.
- Wire impact: the field is **non-optional**; the web app is the only client.
  All backend and web fixtures that build an `AccountResponse` must include
  `role`.

### B2 — List access endpoint

- `GET /api/accounts/:id/access` — **Owner only** (return `404` otherwise, to
  hide account existence, consistent with `checkAccountAccess`).
- Response:
  ```json
  {
    "access": [
      { "userId": "…", "role": "owner", "email": "a@x.com", "telegramUsername": null },
      { "userId": "…", "role": "editor", "email": null, "telegramUsername": "jane" }
    ]
  }
  ```
  `email` and `telegramUsername` are nullable (a user has at most one human
  label; some have neither). Includes the owner entry.
- The handler resolves each access-list `userId` against the **user read model**
  (`Domain/User/Projection.hs`) to obtain `email` / `telegramUsername`.
- The read model stores `email` as non-nullable `Text` defaulting to `""` for
  Telegram-only users, so the handler must normalize **empty string → `null`**
  before emitting the response (otherwise the web label fallback below treats
  `""` as present).
- The web derives a display label with this precedence:
  `email` → else `"@" + telegramUsername` → else `short(userId)`
  (i.e. `email ?? ("@" + telegramUsername) ?? short(userId)`).

### Reused as-is

`POST …/share` (`{ userId, role }`) and `DELETE …/access/:userId`. The share
handler already enforces Owner-only, self-share, and External rejection.

## Web changes (monorepo)

### API layer (`src/api/`)

- `types.ts`: add `role` to `AccountResponse`; add `AccountRole`
  (`'owner' | 'editor' | 'viewer'`), `ShareAccountRequest`, `AccountAccessEntry`,
  `AccountAccessListResponse`. Cite backend source lines per repo convention.
- `accounts.ts`: add
  - `listAccess(id): Promise<AccountAccessEntry[]>` → `GET …/:id/access`
  - `share(id, body: ShareAccountRequest): Promise<void>` → `POST …/:id/share`
  - `revokeAccess(id, userId): Promise<void>` → `DELETE …/:id/access/:userId`

### Hooks (`src/features/accounts/`)

- `useAccountAccess(id)` — query for the access list (enabled only when the
  dialog is open and the user is owner).
- `useShareAccount()` / `useRevokeAccess()` — mutations; invalidate the account
  list and the access query on success.

### Profile page — expose UUID

- `ProfilePage.tsx`: display the current user's ID (from the existing `/me`
  response) with a **copy-to-clipboard** button and a one-line hint:
  _"Share this ID with someone to let them add you to an account."_

### Manage-access dialog (Owner only)

Entry points: an item in `AccountContextMenu` and a toolbar button in
`AccountsPane`, shown only when `account.role === 'owner'`.

- **Add person:** UUID text input (Zod `.uuid()` validation) + role select
  (**Editor / Viewer**) + Share button. Map server errors to friendly copy:
  user-not-found, cannot-share-with-self, already-has-access.
- **People with access:** list from B2 — display label + role badge +
  **Revoke** button. Revoke is disabled on the owner row and on the current
  user's own row. Confirm before revoking.

### Role reflection in the accounts UI

| UI action                          | Required tier    | Hidden/disabled for            |
| ---------------------------------- | ---------------- | ------------------------------ |
| View balance & transactions        | View             | — (always visible when listed) |
| Record / transfer / adjust balance | Modify (Editor+) | Viewer                         |
| Share / revoke / close / reopen    | Manage (Owner)   | Editor, Viewer                 |

- **Owned vs shared:** add a **"Shared with me"** group in `AccountsPane` for
  accounts where `role !== 'owner'`, with a small role badge on those rows.
- Exact tier for rename / set-subtype / overdraft-limit (Modify vs Manage) will
  be confirmed against the handlers during planning. Web gating is UX only — the
  backend enforces authorization regardless.

## Testing

- MSW handlers for `GET …/:id/access`, `POST …/share`, `DELETE …/access/:userId`;
  update **all** account fixtures to include `role`.
- Component/unit tests: share dialog (UUID validation, role options, error
  mapping), access list + revoke (owner row and self row disabled), role-based
  action hiding, profile copy button, "Shared with me" grouping.
- One Playwright smoke: owner shares by UUID → entry appears → revoke removes it.

## Out of scope (this iteration)

- Email or autocomplete resolution of share targets.
- Invite-by-email for people who don't yet have an account.
- Granting the Owner role via the UI.
- Editing an existing user's role in place (revoke + re-share instead).

## References

- Backend: `src/Web/API/AccountAPI.hs`, `src/Web/Types.hs`,
  `src/Application/Services/{AccountService,AuthorizationService}.hs`,
  `src/Domain/User/Projection.hs`, `src/Web/API/UserAPI.hs`.
- Web: `src/api/{accounts,types,users}.ts`,
  `src/features/accounts/*`, `src/pages/ProfilePage.tsx`.
