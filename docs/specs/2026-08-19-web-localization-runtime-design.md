---
status: draft
date: 2026-08-19
---

# Web localization runtime — i18n runtime + locale-aware formatting

Web-client feature (`homeaccounting/monorepo`) that makes the app actually
render in the user's **language** and format dates/numbers/currency for the
user's **locale**. Tracker: `homeaccounting/tracker#56` (localization epic),
covering issue **#35** (user-selectable UI language) plus the epic's
**locale-aware formatting** scope item.

This spec covers **Slices A + B** of the epic:

- **A — i18n runtime + feature-namespaced catalogs (#35).** A translation
  runtime, `en` + full `uk` catalogs, and the wiring that switches the live UI to
  the server-persisted language signal.
- **B — locale-aware formatting.** Date / number / currency formatting driven by
  the active locale.

**Slice C — locale-aware backend-generated output** (emails, Telegram replies in
the user's language) is explicitly **out of scope**; it is backend work, gated on
this slice shipping, and gets its own spec.

## Motivation

The shared **country/language signal foundation** already exists and is live:

- The backend persists per-user `language` (default `"en"`, plus `"uk"`) and
  `country` (ISO 3166-1 alpha-2, nullable), exposed on `ConfigurationResponse`
  and mutable via `setLanguage` (backend#164).
- The web client already has the **language selector**, wired in both Settings
  (#92) and Onboarding (#93). It reads/writes the server signal via
  `useConfiguration()` / `useSetLanguage()`.

What is missing is **everything downstream of the signal** — nothing yet renders
differently when the language changes:

- No i18n runtime or library. Every UI string is hardcoded English across
  ~115 `.tsx` files, plus app-authored label maps
  (`accounts/labels.ts`, `transactions/labels.ts`).
- `src/lib/format.ts` hardcodes the `'en-US'` locale and slices ISO dates — it is
  not locale-aware.

This spec closes that gap on the web client: the language selector becomes
functional, and formatting follows the active locale.

## Scope

**In scope**

- An `i18next` + `react-i18next` runtime, initialized once, with `en` as the
  bootstrap language and `en` as the fallback.
- Feature-namespaced catalogs for **`en`** (full — relocating existing strings)
  and **`uk`** (full — authored translation of every key).
- Live language switching driven by the server-persisted `language` signal, with
  no page reload.
- Locale-aware `formatMoney` / `formatDate` / `formatDateTime`, driven by the
  user's `country` (language drives translation only; see §4).
- A catalog-completeness test (`uk` keyset ≡ `en` keyset) and unit/e2e coverage.

**Out of scope**

- Slice C (locale-aware backend-generated output: emails, Telegram).
- Locales beyond `en` / `uk` (the design is extensible; adding one is a
  catalog + one registry entry, done as future work).
- Translating **user-authored content** — dictionary names (categories, labels,
  contacts) and transaction descriptions. These are shown verbatim in whatever
  language the user wrote them (see Constraints).
- A hard "no inline strings" ESLint gate. Full extraction leaves no inline
  strings; an automated lint rule can be added later. Called out as deferred so
  it is a conscious choice, not an oversight.

## Constraints / principles (from the epic)

- **Localize UI chrome, never stored user content.** Translation catalogs cover
  app-authored strings only. User-authored dictionary names and transaction
  descriptions are never routed through `t()`; switching language never rewrites
  them.
- **English is the fallback** for any missing key or unbundled locale.
- **Extensible by construction** — adding a language = drop a `uk`-shaped catalog
  folder + one registry line; no feature-component changes.
- **Server-authoritative, cross-device** — the language signal already persists
  server-side (mirroring base currency), so it is consistent across
  web / Telegram / devices. This spec only *consumes* that signal.

## Approach

**Library: `react-i18next` (i18next core + React binding).** Chosen over a
compile-time extractor (`@lingui`) and a home-grown `t()` because we are
committing to a **full `uk` catalog now**, and Ukrainian has a genuinely hard
plural system (one / few / many + other). i18next gives us, out of the box:

- **Namespaces** that map 1:1 onto our feature-namespaced catalogs.
- **`fallbackLng: 'en'`** — the "English is the fallback" principle for free.
- **Interpolation** and a **`<Trans>`** component for strings that wrap JSX.
- **Plural handling via `Intl.PluralRules`** — Ukrainian plurals work without us
  hand-rolling them, removing the epic's "pluralization coverage" future risk.

The home-grown alternative's only real advantage (no dependency) is outweighed by
the fact that the part it forces us to build by hand — `uk` pluralization — is
exactly the sharp edge that is in scope this release.

## Design

### 1. Runtime & wiring

A single init module `src/lib/i18n.ts`:

- Configures `i18next` + `initReactI18next` with **both catalogs statically
  imported** (no lazy loading for two languages — avoids a loading flash).
- `fallbackLng: 'en'`, `defaultNS: 'common'`, `interpolation` on,
  `returnEmptyString: false` (so an empty `uk` value also falls back to `en`
  rather than rendering blank).
- Initializes with **`en`** as the starting language.
- In **dev only**, a `missingKeyHandler` / `saveMissing` logs missing keys to the
  console so gaps surface during development; disabled in prod.

**Live language sync.** A thin component **`<LanguageSync/>`** is mounted inside
`AuthProvider` in `main.tsx`. It reads `useConfiguration().data?.language` and, on
change, calls `i18n.changeLanguage(lang)`:

- **Signed out / pre-auth** (login, register, OAuth callback): no config → stays
  `en`. Correct — those screens are English.
- **Signed in**: config loads → `LanguageSync` flips i18next to the server signal;
  the whole tree, consuming `useTranslation()`, re-renders reactively.
- **Selector change**: the existing selector calls `useSetLanguage()`, which on
  success invalidates `['configuration']`; `LanguageSync` observes the new value
  and the UI switches **live, no reload**.

> Verification note: the past "live no-reload" bugs (web PR #92 follow-up) came
> from RHF `defaultValues` and server-computed fields not re-reading on config
> change. The implementation must confirm the language switch actually
> re-renders translated text live (covered by the `LanguageSync` test and the
> Playwright smoke).

`i18next` is a global singleton, so no additional React provider is required
beyond `initReactI18next`; components use the `useTranslation(ns)` hook directly.

### 2. Catalog structure

Feature-namespaced, one folder per locale:

```
src/locales/
  en/
    common.json          # shared chrome: Save, Cancel, OK, generic nav, errors
    accounts.json        # incl. subtype / card-network / asset-type labels
    transactions.json    # incl. transaction-kind labels
    profile.json
    banking.json
    onboarding.json
    reports.json
    configuration.json
  uk/                    # same files, fully translated
    ...
  index.ts               # resources = { en: {...}, uk: {...} }; SUPPORTED_LANGUAGES
```

- **Namespace == feature folder.** A key reads `t('transactions:addIncome.title')`.
- Keys are **semantic** (`addIncome.title`), not English-text-as-key, so editing a
  `uk` value never churns key ids.
- Adding a language = a new locale folder in the `uk` shape + one line in
  `index.ts`. No feature-component changes (extensibility principle).

### 3. String extraction (full)

1. **Label maps** (`accounts/labels.ts`, `transactions/labels.ts`) → strings move
   into the namespace JSON; the maps become thin `t()`-lookups keyed by the enum
   value (e.g. `t('accounts:subtype.' + type)`), preserving the existing
   forward-compat fallback to the raw value for unknown backend enum values.
2. **JSX / component strings** across the ~115 `.tsx` files → `useTranslation(ns)`
   + `t()`; `<Trans>` where a string wraps JSX (e.g. "Deleted **{{name}}**").
3. **Toasts, `aria-label`s, placeholders, validation messages** → same treatment
   (app chrome, in scope).
4. **User-authored content is not touched** — dictionary names, categories,
   labels, contacts, transaction descriptions render verbatim.

Note: **default / fallback literals inside helper functions** are also app chrome
and in scope — e.g. the hardcoded `'Account'` default in
`formatAccountSubtypeLabel` (`features/accounts/format.ts`). Full extraction must
catch these, not only the named label maps and JSX.

### 4. Locale-aware formatting (Slice B)

**The two signals are independent: `language` drives *translation*, `country`
drives *regional formatting* (dates, number grouping, currency placement).** This
mirrors the epic's framing and lets them diverge — a Ukrainian-speaker living in
Germany gets Ukrainian UI text with German number/date conventions.

Rationale for choosing `country` over `language` as the formatting driver:
English is the **international default** language, so it must not carry a
country's conventions — defaulting English to US format (`4/27/2026`,
month-first) is exactly the ambiguity the rest of the world avoids. Formatting
belongs to *where the user is*, not *what language they read*.

Formatting-locale resolution (in `useFormat()`):

1. **`country` set** → that country's convention via a `localeForCountry(country)`
   map covering the full supported country set (US → `en-US`, UA → `uk-UA`,
   DE → `de-DE`, FR → `fr-FR`, … one entry per supported ISO code; see below).
   Dates are all-numeric, so the region subtag drives ordering/separators and no
   spelled-out month names in a foreign language leak in.
2. **`country` null / unknown** → the **international neutral default**: ISO 8601
   dates (`2026-04-27`) and neutral English number grouping (`1,234.50`,
   `narrowSymbol`). This is exactly today's behavior — so users without a country
   (and all existing users) see **no change**. The default is *never* a country's
   convention, and **US formatting appears only when `country === 'US'`**.

Supported-set `localeForCountry` map (aligned with the p13n foundation's fixed
country set — US, UA, euro-area): `US`→`en-US`, `UA`→`uk-UA`, `AT`→`de-AT`,
`BE`→`nl-BE`, `HR`→`hr-HR`, `CY`→`el-CY`, `EE`→`et-EE`, `FI`→`fi-FI`, `FR`→`fr-FR`,
`DE`→`de-DE`, `GR`→`el-GR`, `IE`→`en-IE`, `IT`→`it-IT`, `LV`→`lv-LV`, `LT`→`lt-LT`,
`LU`→`fr-LU`, `MT`→`mt-MT`, `NL`→`nl-NL`, `PT`→`pt-PT`, `SK`→`sk-SK`, `SI`→`sl-SI`,
`ES`→`es-ES`. Any code not in the map → international default. Extending = one
line.

`src/lib/format.ts` becomes locale-parametrized, where **`undefined` locale means
the international default** (preserving current behavior):

- **`formatMoney(amount, currency, locale?)`** — `locale` set → `Intl.NumberFormat(locale, …)`; `locale` undefined → neutral `en-US` grouping (today's behavior). `currencyDisplay: 'narrowSymbol'` unchanged throughout.
- **`formatDate(iso, locale?)`** — `locale` set → `Intl.DateTimeFormat(locale)`; `locale` undefined → ISO 8601 slice (today's behavior).
- **`formatDateTime(iso, locale?)`** — `locale` set → `Intl.DateTimeFormat(locale, {…, hourCycle: 'h23'})` (24-hour retained); `locale` undefined → today's `YYYY-MM-DD HH:MM`. **Stays in the viewer's timezone** either way (intentional, per its existing comment).
- **Access pattern:** a hook **`useFormat()`** reads
  `useConfiguration().data?.country`, resolves `localeForCountry(country)` (→ a
  BCP-47 string or `undefined`), and returns bound
  `formatMoney` / `formatDate` / `formatDateTime`. Components call
  `const { formatMoney } = useFormat()`. Raw functions stay exported (pure,
  explicit-locale arg) for non-React/test callers.
- **Non-React callers** (e.g. `formatAccountBalance` in
  `features/accounts/format.ts`): prefer moving formatting to the **component
  boundary** (caller uses `useFormat()`); pure modules that genuinely cannot use a
  hook pass `undefined` (international default) interim, localized later in their
  owning namespace task.
- **Default when config not loaded:** international default (`undefined` locale) —
  unchanged current behavior.

Consequence (intended): a `UA`-country user sees `27.04.2026` and `1 234,50`; a
`US`-country user sees `4/27/2026` and `1,234.50`; a country-less user sees ISO
`2026-04-27` and `1,234.50` (today's behavior). **`language` never affects
formatting.**

### 5. Error handling & fallback

- **Missing key / missing locale** → `fallbackLng: 'en'` returns the English
  string; `returnEmptyString: false` makes an empty `uk` value also fall back.
- **Unknown language from the server** (a future locale not yet bundled) →
  i18next falls back to `en`. No crash.
- **Unknown / null country** → `localeForCountry` returns `undefined` → the
  international default formatting. No crash.
- **User content** is never passed through `t()`, so a missing-key path cannot
  mangle a category or description.

### 6. Testing

- **Catalog-completeness test (primary guard):** asserts the `uk` keyset is
  identical to the `en` keyset across every namespace (deep key diff, both
  directions). Keeps "full `uk`" honest and catches drift as strings are added —
  operationalizing the epic's "CI catalog-completeness checks."
- **Runtime unit tests:** `localeForCountry` mapping (a few representative
  countries + null → `undefined`); `useFormat` returns `uk-UA` formatting for
  `country: 'UA'`, `en-US` for `'US'`, and the ISO/neutral default for no country.
- **`LanguageSync` test:** changing the mocked config language calls
  `i18n.changeLanguage` and re-renders translated text (guards the live-switch).
- **Component tests:** existing tests asserting English text keep passing because
  the default/fallback is `en`. Where a test needs a specific language, wrap it in
  an i18n test-provider helper (e.g. `src/test/i18n.tsx`) that renders children
  under a chosen language (reuse existing infra; do not re-roll setup).
- **`uk` plural forms:** one focused test per pluralized key exercising
  one / few / many through i18next's `Intl.PluralRules`.
- **e2e (Playwright):** one smoke — switch language in settings, assert a visible
  nav/label string flips to Ukrainian and back, with no reload.

## Rollout / compatibility

- Purely additive on the web client; no backend or API change (the signal and its
  endpoints already exist).
- No stored-data or event-schema impact (this is a client-only concern).
- Default and fallback are `en`, so **translated strings** are preserved for any
  user who has not chosen `uk`, and **user-authored content** is never touched.
- **Formatting is country-driven with an international default**, so users with
  **no country set — including every existing user — see no change** (ISO
  `2026-04-27` dates, `1,234.50` numbers, exactly as today). Regional formatting
  appears only once a user has a country: `UA` → `27.04.2026` / `1 234,50`,
  `US` → `4/27/2026` / `1,234.50`, etc. US conventions never appear as a default.
  `formatDateTime` keeps **24-hour** time (`hourCycle: 'h23'`) under any locale to
  preserve its documented "readable ordered time" intent.

## Future work (not in this spec)

- **Slice C** — locale-aware backend-generated output (emails, Telegram replies),
  its own spec, gated on this shipping.
- Additional locales beyond `en` / `uk` (catalog + registry entry).
- A hard "no inline strings" ESLint gate.
- Region-appropriate **starter-content seeding** (tracked under #48 future
  scope) — seed-once, not live-translate.
