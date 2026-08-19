---
status: draft
date: 2026-08-18
---

# Country/Language settings + country-aware provider consumption (web)

Web-client follow-up to the backend personalization work: P1 (country/language
signal foundation, `homeaccounting/backend#164`) and P2 (bank-provider scoping by
country, `homeaccounting/backend#167`, tracker#47). The backend contract is
shipped and stable; this spec covers the **web client** (`homeaccounting/monorepo`)
consuming it:

1. Let the user **set their country and UI-language preference** (persisted
   server-side via the existing configuration endpoints).
2. **Consume the annotated provider list correctly** — curate the connect/import
   provider surfaces by the user's country.

## Scope

**In scope (signal-only):** country + language selectors that persist to the
backend, and country-aware curation of the provider surfaces.

**Out of scope:** the actual UI-translation runtime (extracting strings,
translation catalogs, a react-i18n layer). That is the localization epic
(`homeaccounting/tracker#56` / `#35`); the language selector built here is the
input that effort will later consume. No onboarding step (the app has no
onboarding flow today; an onboarding country/language prompt is tracked
separately as `homeaccounting/tracker#58`).

## Backend contract (already shipped — do not change)

- `GET /api/users/me/configuration` → `ConfigurationResponse`, which includes
  `language :: string` and `country :: string | null`
  (`backend/src/Web/API/ConfigurationAPI.hs`).
- `PUT /api/users/me/configuration/language` — body `{ "language": string }`
  (ISO 639-1, e.g. `"en"`/`"uk"`) → `204`.
- `PUT /api/users/me/configuration/country` — body `{ "country": string }`
  (ISO 3166-1 alpha-2, e.g. `"US"`/`"UA"`) → `204`. **Applies a regional preset:
  may also change `language` and `defaultCurrency` (and base currency if
  editable).** The response carries no body, so the new values are only learned
  by refetching the configuration.
- `GET /api/users/me/configuration/localization-options` →
  `{ "languages": string[], "countries": string[] }` — the backend-authoritative
  supported sets the selectors render from.
- `GET /api/users/me/configuration/banking/providers` → `BankProviderDTO[]`, each
  now annotated with `countries: string[]` (ISO codes; `[]` = global/no
  restriction) and `inUserCountry: boolean`.

## Type-layer sync (`src/api/types.ts`)

The web DTOs have drifted from the backend; bring them back into lockstep (cite
the backend source in comments per the repo convention):

- `ConfigurationResponse` gains `language: string` and `country: string | null`.
- `BankProviderDTO` gains `countries: string[]` and `inUserCountry: boolean`.
- New `LocalizationOptionsResponse { languages: string[]; countries: string[] }`.

## API methods (`src/api/configuration.ts`)

Add to `configurationApi`:

- `setCountry(body: { country: string }): Promise<void>` →
  `PUT /api/users/me/configuration/country`.
- `setLanguage(body: { language: string }): Promise<void>` →
  `PUT /api/users/me/configuration/language`.
- `getLocalizationOptions(): Promise<LocalizationOptionsResponse>` →
  `GET /api/users/me/configuration/localization-options`.

## Hooks

- **`useLocalizationOptions`** — TanStack query for the supported country/language
  sets; long/`staleTime: Infinity`-ish cache (rarely changes).
- **`useSetLanguage`** — mutation → `setLanguage`; on success invalidate the
  configuration query. No cascade.
- **`useSetCountry`** — mutation → `setCountry`. Because the backend applies a
  preset cascade with no response body, the hook:
  1. reads the current `language`/`defaultCurrency` from the cached config
     before mutating,
  2. on success invalidates + refetches the configuration query,
  3. after the refetch settles, diffs pre-vs-post `language`/`defaultCurrency`
     and fires a **"what changed" toast** only when something actually changed
     (e.g. _"Default currency updated to UAH"_). No confirmation dialog, and no
     toast in the common no-change case.
- Provider partitioning lives in **`useProviders`** (below), not a separate hook.

### Country-change UX rationale

No confirmation. The preset's value is concentrated at first-setup, not in a
settings pane; supported countries mostly map to presets the user already
matches, so the cascade is usually a no-op. A confirmation would add friction to
the common case to guard a rare one. The toast-after approach is frictionless
when nothing changes and honest when something does.

_(Noted, out of scope: the root cause is the backend's wholesale-apply preset,
which overwrites even explicitly-set fields. A future backend refinement —
"preset fills only unset fields" — would make the cascade purely additive and let
this pane be silent. Tracked separately; not part of this task.)_

## Localization settings UI (`src/features/profile/ProfileGeneralPane.tsx`)

Add **Country** and **Language** selectors alongside the existing base/default
currency settings (this pane already owns regional configuration).

- shadcn `Select`; option sets from `useLocalizationOptions`.
- ISO codes rendered via a small **code→display-name map** (e.g. `UA → "Ukraine"`,
  `en → "English"`) kept in a `lib`/feature helper. Codes not in the map fall
  back to the raw code (never crash).
- **Language select** → `useSetLanguage` on change.
- **Country select** → `useSetCountry` on change (toast-after, per above).
  `country` may be `null` → the select shows a "Not set" placeholder. Selecting a
  country is the only action; there is no "unset country" affordance (YAGNI).

## Country-aware provider consumption

Both real provider **pickers** are shadcn `Select`s (not free-form lists), so the
curation is expressed as **grouped options** (`SelectGroup` + `SelectLabel`) — an
in-country group shown first, an "Other countries" group below — rather than an
expander button (a `Select` can't host one). With only a handful of providers,
grouping deprioritises out-of-country options without hiding them behind an extra
interaction.

- **`useProviders`** returns the raw list plus a computed partition:
  `{ inCountry: BankProviderDTO[]; otherCountries: BankProviderDTO[] }`, split on
  `inUserCountry`, each preserving the backend order. Single source of truth so
  every picker renders consistently.

### Pickers to update (grouped options)

1. **Connect a bank — `BankConnectionDialog.tsx`** (the provider `Select`, the
   one genuine connect picker; `ProfileBankingPane` itself has no dropdown — it
   only reads capabilities and opens this dialog). Render `inCountry` items
   first, then an "Other countries" `SelectGroup` (its items labeled with the
   country, e.g. "PrivatBank — Ukraine", via the code→name map).
2. **Bank-name suggestion — `SubtypeFields.tsx`** (the "Bank name" `Select` used
   when creating/editing a bank-account subtype, over `providers.map`, with an
   existing `"Other…"` custom fallback). Apply the **same** grouped partition for
   consistency; keep the `"Other…"` item last. Included deliberately so curation
   is uniform across every provider dropdown, not just the connect flow.

Both pickers:

- **Empty in-country** (e.g. a US user today — all three providers are UA): the
  in-country group is omitted; only the "Other countries" group renders, so the
  picker stays usable. (`SubtypeFields` additionally always keeps `"Other…"`.)
- **No `otherCountries`** (user has no country set → backend returns
  `inUserCountry=true` for all; or all providers are in-country): render a flat
  list with no group headers — nothing to curate.

### Surfaces that do NOT change

`ImportStatementButton`, `ProfileBankingPane`/`ConnectionRow`, `SyncNowButton`,
and `LinkAccountsDialog` use `useProviders` only for **capability lookups on an
already-selected account's connection** (`supportsFile`/`supportsPull`) — there is
no provider _picker_ to curate. Country must **not** gate these: an
already-connected account keeps importing/syncing regardless of the user's
current country (matches the backend's "no country gate on connect/import" and
"changing country never breaks existing connections").

## Testing

- **api** (`configuration.test.ts`): `setCountry`/`setLanguage`/
  `getLocalizationOptions` hit the correct URLs/methods/bodies; DTO round-trips
  through MSW with the new fields.
- **hooks:** `useSetCountry` invalidates config and fires the diff toast only on
  an actual change (and not otherwise); `useSetLanguage` invalidates;
  `useProviders` partition correctness across in-country / other / empty-in-country
  / no-country-set.
- **components:** `ProfileGeneralPane` renders both selectors from the options and
  drives the mutations; `BankConnectionDialog` and `SubtypeFields` group the
  provider `Select` into in-country / other-country (and fall back to a flat list
  when there is nothing to curate, `SubtypeFields` keeping `"Other…"`). A
  regression assertion that `ImportStatementButton`/`SyncNowButton` still resolve
  an already-connected account's capability regardless of country.
- Extend MSW handlers in `src/test/handlers.ts` and fixtures in
  `src/test/fixtures.ts` with the new endpoints/fields.

## Non-goals / follow-ups

- UI-translation runtime (#35/#56).
- Onboarding country step (no onboarding flow exists) — tracked as
  `homeaccounting/tracker#58`.
- Backend "preset fills only unset fields" refinement (separate, optional).
