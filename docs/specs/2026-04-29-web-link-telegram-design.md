# Web — Link Telegram via bot deep-link

**Date:** 2026-04-29
**Status:** Draft (pre-implementation)
**Scope:** Add a "Link Telegram" affordance to the web MVP that consumes the
backend deep-link flow shipped per
`backend/docs/specs/2026-04-28-telegram-link-via-bot-deep-link-design.md`.

## 1. Purpose & scope

The backend now exposes `POST /api/auth/telegram/link-code`: an authenticated
endpoint that returns `{ deepLink, expiresAt }` where `deepLink` is a
`https://t.me/<bot>?start=LINK_<token>` URL. The user follows that link to
the Telegram bot, the bot redeems the token, and the user's existing web
account gains a linked Telegram identity.

The web client today:

- Renders a "Link Google" item in the avatar dropdown (`UserMenu.tsx:56-58`)
  that initiates OAuth and is hidden once the user has a Google identity.
- Already exposes `userProfile.telegramIdentity: TelegramIdentity | null`
  on `UserProfileResponse` (`api/types.ts:57-68`), unused so far.
- Has no calls to the now-removed `POST /auth/telegram` or
  `POST /auth/link-telegram` endpoints — confirmed by repo-wide grep.

### Goals

1. Logged-in users can attach their Telegram identity from the web app
   without leaving for a settings page that does not exist; it lives in the
   same dropdown as "Link Google".
2. Once Telegram is linked, the menu item disappears (symmetric with the
   Google pattern); the linked status is reflected by the existing
   `telegramIdentity` field on the cached profile.
3. The user does not have to refresh manually after linking — when they
   return to the tab, React Query's `refetchOnWindowFocus` brings the new
   profile state and the dialog flips to a success state.
4. No changes to authentication, routing, or the OAuth code path.

### Non-goals

- Unlinking Telegram from the UI. The Google flow has no unlink either; we
  match that. (Backend endpoint exists; surfacing it is a separate spec.)
- Live countdown for `expiresAt`. The token lives ~10 minutes; a static
  "expires at HH:MM" line is enough.
- QR code rendering for the deep link. Mobile users open Telegram via the
  link directly; desktop users have Telegram Desktop or Web. Add later if
  evidence emerges that it is needed.
- A general settings/profile page. Identity management stays in the
  dropdown until the product needs more.
- Any change to `OAuthProviderName` — Telegram is intentionally not an
  OAuth provider in this codebase; it has its own `TelegramIdentity` type.

## 2. UX flow

1. User opens the avatar dropdown. If `profile.telegramIdentity == null`,
   a "Link Telegram" item is shown alongside "Link Google".
2. User clicks "Link Telegram". The dropdown closes and a modal opens.
3. The modal immediately calls `POST /api/auth/telegram/link-code`. While
   pending, it shows "Generating link…".
4. On success, the modal:
   - Auto-fires `window.open(deepLink, '_blank', 'noopener,noreferrer')`
     once. Most users land in Telegram immediately.
   - Renders the same link as a clickable "Open Telegram" button (fallback
     when the popup is blocked).
   - Renders an "expires at HH:MM" hint (local time, formatted from
     `expiresAt`).
   - Renders an "I've linked it" secondary button that invalidates
     `['users', 'me']` so the profile refetches on demand.
5. The user follows the link, sends `/start LINK_<token>` to the bot
   (Telegram does this automatically on click), and the bot links the
   account.
6. The user returns to the web tab. React Query's
   `refetchOnWindowFocus: true` (already configured in
   `lib/queryClient.ts:3-7`) refetches the profile. The dialog observes
   `profile.telegramIdentity` flipping to a populated value and shows a
   "Telegram linked as @<username|firstName>" success state, then
   auto-closes after ~1.5 s.
7. The "Link Telegram" menu item is no longer rendered.

If the API call in step 3 fails, the modal renders an `Alert` with the
error message and a Retry button that re-fires the mutation. There is no
toast system in this project, and we are not introducing one for this
feature.

## 3. API client & types

### 3.1 New response type

`src/api/types.ts`:

```ts
export interface TelegramLinkCodeResponse {
  deepLink: string;
  expiresAt: ISO8601;
}
```

Mirrors `Web.API.AuthAPI.TelegramLinkCodeResponse` in the backend
(`backend/src/Web/API/AuthAPI.hs:187-193`). `ISO8601` is the existing
type alias; the backend returns `UTCTime` which serializes as
ISO-8601 `Z`-suffixed.

### 3.2 New auth API method

`src/api/auth.ts`:

```ts
requestTelegramLinkCode: () =>
  client.post<TelegramLinkCodeResponse>('/api/auth/telegram/link-code'),
```

Empty request body. `ApiClient.post(path)` already supports the
no-second-argument form (`client.ts:30-32`), which sends no body and no
`Content-Type` header — exactly what the backend's
`Post '[JSON] TelegramLinkCodeResponse` handler accepts (no `ReqBody`).

JWT is attached automatically by the existing `ApiClient` plumbing.

### 3.3 No other API changes

`OAuthProviderName` stays `'Google' | 'GitHub' | 'Microsoft'`.
`UserProfileResponse.telegramIdentity` is already in place.

## 4. Components

### 4.1 New UI primitive: `src/components/ui/dialog.tsx`

A thin shadcn-style wrapper around `@radix-ui/react-dialog`. Mirrors the
existing wrappers (`dropdown-menu.tsx`, `avatar.tsx`, etc.) in style and
Tailwind class composition.

New runtime dependency: `@radix-ui/react-dialog` (^1.1.x), the only Radix
package not yet in `package.json`. Install with pnpm.

Exports — minimum needed for this feature:

- `Dialog` (root, controlled via `open` / `onOpenChange`)
- `DialogContent` (portal + overlay + content with focus trap; standard
  Radix behavior, no customisation beyond Tailwind classes)
- `DialogHeader`
- `DialogTitle`
- `DialogDescription`
- `DialogFooter`
- `DialogClose`

We deliberately do not export `DialogTrigger`: this dialog is opened from
a `DropdownMenuItem`'s `onSelect`, not from a button colocated with the
dialog.

### 4.2 New feature component: `src/components/LinkTelegramDialog.tsx`

Public props:

```ts
interface LinkTelegramDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: ApiClient;
}
```

The parent (`UserMenu`) owns the open state and reuses its existing
`ApiClient` instance — keeping a single client per render with the
shared `getToken` / `onUnauthorized` wiring.

#### State machine

Derived from a `useMutation` against `requestTelegramLinkCode` plus the
cached `['users', 'me']` profile (read via `useQuery` with the same key
already used in `UserMenu`; React Query deduplicates).

| Phase        | Condition                                                                               | UI                                                                                                                                                             |
| ------------ | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `requesting` | `mutation.isPending`                                                                    | Dialog title "Link Telegram", body "Generating link…", spinner. No action buttons.                                                                             |
| `showing`    | `mutation.isSuccess && profile.telegramIdentity == null`                                | "Open Telegram" anchor button (`href={deepLink}`, `target="_blank"`, `rel="noopener noreferrer"`); "expires at HH:MM" line; "I've linked it" secondary button. |
| `linked`     | `profile.telegramIdentity != null` (regardless of mutation state, while dialog is open) | "Telegram linked as @<username \|\| firstName>". Close button. Auto-closes after 1.5 s via `setTimeout`.                                                       |
| `error`      | `mutation.isError`                                                                      | `Alert` (variant `destructive`) with `error.message`. "Retry" button calls `mutation.mutate()` again.                                                          |

Phase precedence when multiple conditions hold: `linked` wins over
everything else. If the cached profile shows a Telegram identity (e.g.,
the user linked successfully and the popup tab errored on a stale retry),
the dialog renders the success state. Order of checks in code:
`linked` → `error` → `requesting` → `showing`.

Time formatting for the "expires at" line: render `expiresAt` via
`new Date(expiresAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })`.
No project-specific date helper exists; use the standard locale API.

#### Effects

- **On open transitioning false → true**: `mutation.reset()`, reset the
  popup-fired ref to `false`, then `mutation.mutate()`. Each open issues
  a fresh code; the backend's `LinkCodeStore.issue` replaces any prior
  code for the same user, so re-issuance is safe and intentional.
  Resetting the ref ensures that closing and reopening the dialog
  re-fires `window.open` for the new code.
- **On `mutation.isSuccess` transitioning false → true**: if the
  popup-fired ref is `false`, call
  `window.open(data.deepLink, '_blank', 'noopener,noreferrer')` and set
  the ref to `true`. The ref guards against the popup re-firing on
  rerenders within the same open session.
- **"I've linked it" button**: calls
  `queryClient.invalidateQueries({ queryKey: ['users', 'me'] })`. No
  optimistic state change; the server is the source of truth.
- **On `phase === 'linked'` first observed**: start a 1.5 s timer that
  calls `onOpenChange(false)`. Clear the timer on unmount.
- **On open transitioning true → false**: clear any pending timer; do
  not abort an in-flight mutation (it's a one-shot POST and the result
  is harmless if the dialog is gone).

#### Dialog accessibility

- `DialogTitle` always rendered (Radix requirement).
- The "Open Telegram" element is a real `<a>` with `target="_blank"` so
  middle-click and right-click work. Styled via shared `Button` variants
  with `asChild`.
- Initial focus inside the dialog goes to the "Open Telegram" anchor in
  the `showing` phase; Radix handles focus restoration on close.

### 4.3 `src/components/UserMenu.tsx` integration

Symmetric with the Google branch. Diff sketch:

```tsx
const hasGoogle = profile?.oauthIdentities.some((i) => i.provider === 'Google') ?? false;
const hasTelegram = profile?.telegramIdentity != null;
const [tgOpen, setTgOpen] = useState(false);
// ...
<DropdownMenuContent align="end">
  <DropdownMenuLabel>{...}</DropdownMenuLabel>
  <DropdownMenuSeparator />
  {!hasGoogle && (
    <DropdownMenuItem onSelect={() => void onLinkGoogle()}>Link Google</DropdownMenuItem>
  )}
  {!hasTelegram && (
    <DropdownMenuItem onSelect={() => setTgOpen(true)}>Link Telegram</DropdownMenuItem>
  )}
  <DropdownMenuItem onSelect={signOut}>Sign out</DropdownMenuItem>
</DropdownMenuContent>
<LinkTelegramDialog open={tgOpen} onOpenChange={setTgOpen} client={client} />
```

The dialog sits as a sibling of `<DropdownMenu>`, not inside it — Radix
Dialog manages its own portal, and rendering it inside the dropdown can
cause focus interactions between the two overlays.

## 5. Error handling & edge cases

| Situation                                                            | Surface          | Behaviour                                                                                                                                                                                               |
| -------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Network failure / 5xx on `link-code` POST                            | Dialog `error`   | `Alert` with the message; "Retry" re-runs the mutation.                                                                                                                                                 |
| 401 on `link-code` POST                                              | Global           | `ApiClient.onUnauthorized` (the existing `signOut` callback) fires and the dialog unmounts as the auth context flips. No dialog-specific handling.                                                      |
| User waits past `expiresAt` and only then opens the bot              | Bot              | Bot replies "link no longer valid". Web has no signal; the user closes and reopens the dialog to issue a fresh code. (No web-side detection by design.)                                                 |
| User clicks "I've linked it" before linking                          | Dialog `showing` | Profile refetch returns the unchanged `telegramIdentity == null`; phase remains `showing`. No misleading state change.                                                                                  |
| Profile cache stale: user is already linked but cache says otherwise | Dialog           | The new code issues fine (idempotent on the server). User reopens Telegram, bot detects the existing link, replies "already linked"; refresh in web shows the existing identity. No duplicate accounts. |
| Popup blocker silences `window.open`                                 | Dialog `showing` | The "Open Telegram" anchor is the documented fallback; the user clicks it manually.                                                                                                                     |

We do not log mutation errors to the console beyond what React Query
does by default; the user-facing alert is the contract.

## 6. Testing

Mirror existing `Header.test.tsx` patterns (Vitest + React Testing
Library + MSW handlers).

### 6.1 `src/components/UserMenu.test.tsx` (extend / create)

If the file does not yet exist, create it; otherwise extend. Test cases:

- Renders "Link Telegram" when `profile.telegramIdentity` is `null`.
- Hides "Link Telegram" when `profile.telegramIdentity` is set.
- Hides "Link Google" still works (regression guard against the menu
  refactor).
- Clicking "Link Telegram" opens the dialog; assert the dialog title
  appears in the document.

### 6.2 `src/components/LinkTelegramDialog.test.tsx` (new)

- On open, fires `POST /api/auth/telegram/link-code` exactly once and
  renders the deep link in the "Open Telegram" anchor's `href`.
- Auto-fires `window.open(deepLink, '_blank', 'noopener,noreferrer')` —
  spy on `window.open`. Asserts a single call.
- Renders the formatted local time from `expiresAt`.
- Clicking "I've linked it" triggers a profile refetch (assert via the
  MSW handler being hit a second time, or via a `queryClient` spy).
- When the cached profile transitions to `telegramIdentity != null`,
  the dialog renders the linked state including the username, then
  auto-closes (assert via fake timers + `onOpenChange` spy).
- API failure renders the `Alert` with the message; clicking "Retry"
  refires the mutation (MSW handler called twice).
- Closing the dialog before success cancels the auto-close timer (no
  late `onOpenChange(false)` call).

### 6.3 No backend integration test from the web side

The contract is exercised by the backend's own integration tests
(`Web/API/AuthAPIIntegrationSpec.hs`). The web spec only verifies the
client-side wiring against MSW.

## 7. Out of repo: dependencies

Add to `package.json`:

```
"@radix-ui/react-dialog": "^1.1.x"
```

(Use the latest 1.1 release; aligns with the other Radix packages
already pinned in this repo.) No other runtime additions. No dev
dependencies. No config changes.

## 8. Drift from the backend spec

The backend spec
(`backend/docs/specs/2026-04-28-telegram-link-via-bot-deep-link-design.md`)
calls out non-goal: "Frontend implementation — the web app gains a
'Link Telegram' button that calls the new endpoint and renders the
returned deep-link, and removes any UI that posted to the dropped
`POST /auth/telegram` and `POST /auth/link-telegram` endpoints; visual
design is a separate frontend spec."

This spec is that separate frontend spec. The web app has no existing
calls to either dropped endpoint (verified via grep), so there is no
removal work — the placement of the new "Link Telegram" affordance and
the modal behaviour above are the entire delta.

## 9. Open questions

None.
