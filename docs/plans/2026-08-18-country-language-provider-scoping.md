# Country/Language Settings + Country-Aware Provider Consumption — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user set their country and UI-language preference (persisted server-side), and curate the bank-provider pickers by the user's country.

**Architecture:** Signal-only (no i18n runtime). Sync `types.ts` with the shipped backend contract; add `configurationApi` methods + TanStack hooks; add Country/Language selectors to `ProfileGeneralPane`; group the two provider `Select`s (`BankConnectionDialog`, `SubtypeFields`) into in-country / other-country via a shared pure partition helper. Country change uses toast-after (no confirm) driven by diffing the refetched config.

**Tech Stack:** React 18 + TypeScript (strict), Vite, TanStack Query, react-hook-form + zod, shadcn/ui, Vitest + Testing Library + MSW, sonner (`@/lib/toast`), `just`/pnpm.

**Spec:** `docs/specs/2026-08-18-country-language-provider-scoping-design.md`

**Ground rules:**

- Run `nix develop` (or rely on direnv) so `node`/`pnpm`/`just` are on PATH.
- Verify with `just typecheck`, `just lint`, `just test` (Vitest). `just check` = typecheck + lint + format-check. Run `just format` before committing.
- Import via `@/…` (no deep relative paths). Don't hand-edit `src/components/ui/*` (vendored shadcn).
- MSW `onUnhandledRequest: 'error'` — any endpoint a test hits must have a handler in `src/test/handlers.ts`.
- Keep `types.ts` in lockstep with the backend and cite the backend source in a comment (repo convention).

---

## File Structure

**Modify:**

- `src/api/types.ts` — `ConfigurationResponse` (+`language`, +`country`), `BankProviderDTO` (+`countries`, +`inUserCountry`), new `LocalizationOptionsResponse`, `ChangeCountryRequest`/`ChangeLanguageRequest` (reuse existing request-type conventions).
- `src/api/configuration.ts` — `setCountry`, `setLanguage`, `getLocalizationOptions`.
- `src/test/fixtures.ts` — extend `configurationFixture` (+language/country), provider fixtures (+countries/inUserCountry), add a `localizationOptionsFixture`.
- `src/test/handlers.ts` — handlers for `PUT …/country`, `PUT …/language`, `GET …/localization-options`.
- `src/features/profile/ProfileGeneralPane.tsx` — new `LocalizationSection` (Country + Language selects).
- `src/features/profile/BankConnectionDialog.tsx` — grouped provider `Select`.
- `src/features/accounts/SubtypeFields.tsx` — grouped "Bank name" `Select`.

**Create:**

- `src/features/configuration/useLocalizationOptions.ts`
- `src/features/profile/useSetLanguage.ts`
- `src/features/profile/useSetCountry.ts`
- `src/features/banking/partitionProvidersByCountry.ts` (+ `.test.ts`)
- `src/features/configuration/localizationLabels.ts` (+ `.test.ts`) — `countryName`/`languageName` code→display maps with raw-code fallback.

**Do NOT change:** `useProviders.ts` return shape (all current callers destructure `.data`; the partition is a _separate_ pure helper per the spec-review advisory). `ImportStatementButton`, `ProfileBankingPane`, `SyncNowButton`, `LinkAccountsDialog` (capability-only, no picker — country must not gate them).

---

## Task 1: Type-layer sync

**Files:** Modify `src/api/types.ts`

- [ ] **Step 1: Add the fields/types**

In `src/api/types.ts`:

- On `ConfigurationResponse` add (cite backend):
  ```ts
  // Backend Web/API/ConfigurationAPI.hs ConfigurationResponse (language ~449, country ~451).
  language: string;
  country: string | null;
  ```
- On `BankProviderDTO` add (cite backend):
  ```ts
  // Backend Web/API/ConfigurationAPI.hs BankProviderDTO (countries/inUserCountry, tracker#47).
  countries: string[];
  inUserCountry: boolean;
  ```
- Add:

  ```ts
  // Mirrors backend Web/API/ConfigurationAPI.hs LocalizationOptionsResponse (~555).
  export interface LocalizationOptionsResponse {
    languages: string[];
    countries: string[];
  }
  // Mirrors backend ChangeCountryRequest / ChangeLanguageRequest (~543/533).
  export interface ChangeCountryRequest {
    country: string;
  }
  export interface ChangeLanguageRequest {
    language: string;
  }
  ```

- [ ] **Step 2: Typecheck**

Run: `just typecheck`
Expected: FAIL — every existing `configurationFixture` / provider fixture and any object literal typed as `ConfigurationResponse`/`BankProviderDTO` now lacks the new required fields. This surfaces the fixture sites to fix in Task 2. (If you prefer a green typecheck between tasks, do Task 2 in the same commit — see note.)

- [ ] **Step 3: Commit** (with Task 2 if you want an always-green tree)

```bash
just format
git add src/api/types.ts
git commit -m "feat(types): sync ConfigurationResponse/BankProviderDTO + localization DTOs with backend (tracker#47)"
```

> NOTE: Adding required fields makes fixtures fail typecheck. Recommended: implement **Task 1 + Task 2 together** and commit once, so the tree is green. The steps are split for clarity only.

---

## Task 2: Test fixtures + MSW handlers

**Files:** Modify `src/test/fixtures.ts`, `src/test/handlers.ts`

- [ ] **Step 1: Extend fixtures**

In `src/test/fixtures.ts` and `src/test/handlers.ts`:

- `configurationFixture`: add `language: 'en'` and `country: null` (or `'UA'` — pick whatever keeps existing tests' intent; default `null` is the safest neutral).
- `BankProviderDTO` literals: **there is no standalone provider fixture in `fixtures.ts`** — the provider objects are inline in `src/test/handlers.ts` in the `GET …/banking/providers` handler (~lines 323–328, `[…] satisfies BankProviderDTO[]`). Add `countries` + `inUserCountry` to those inline objects (default `countries: ['UA'], inUserCountry: true` — matches the real UA providers and keeps current provider-list tests showing them). For partition/grouping tests (Tasks 4/7), construct providers with `inUserCountry: false` inline in those tests (or add a `server.use` override returning a mixed list).
- Add `export const localizationOptionsFixture: LocalizationOptionsResponse = { languages: ['en', 'uk'], countries: ['US', 'UA', 'DE'] }`.

- [ ] **Step 2: Add handlers**

In `src/test/handlers.ts` add (mirror the existing `base-currency` PUT handler shape, returning 204/empty):

```ts
http.put(`${apiBase}/api/users/me/configuration/country`, () => new HttpResponse(null, { status: 204 })),
http.put(`${apiBase}/api/users/me/configuration/language`, () => new HttpResponse(null, { status: 204 })),
http.get(`${apiBase}/api/users/me/configuration/localization-options`, () => HttpResponse.json(localizationOptionsFixture)),
```

(Check the exact 204/empty pattern used by the base-currency handler and match it.)

- [ ] **Step 3: Typecheck + existing tests green**

Run: `just typecheck && just test`
Expected: PASS — fixtures now satisfy the Task 1 types, existing suite green.

- [ ] **Step 4: Commit**

```bash
just format
git add src/api/types.ts src/test/fixtures.ts src/test/handlers.ts
git commit -m "test(config): fixtures + MSW handlers for country/language + provider country fields (tracker#47)"
```

---

## Task 3: API methods

**Files:** Modify `src/api/configuration.ts`, `src/api/configuration.test.ts`

- [ ] **Step 1: Write failing tests**

In `src/api/configuration.test.ts` (follow the existing style — construct `configurationApi(client)` and assert the request URL/method/body via MSW `server.use(...)` capturing the request):

- `setCountry({ country: 'UA' })` issues `PUT /api/users/me/configuration/country` with body `{"country":"UA"}`.
- `setLanguage({ language: 'uk' })` issues `PUT /api/users/me/configuration/language` with body `{"language":"uk"}`.
- `getLocalizationOptions()` GETs `/api/users/me/configuration/localization-options` and returns `{ languages, countries }`.

- [ ] **Step 2: Run — verify fail**

Run: `pnpm exec vitest run src/api/configuration.test.ts`
Expected: FAIL — methods don't exist.

- [ ] **Step 3: Implement**

In `src/api/configuration.ts` add to `configurationApi` (import the new request/response types):

```ts
setCountry: (body: ChangeCountryRequest) =>
  client.put<void>('/api/users/me/configuration/country', body),
setLanguage: (body: ChangeLanguageRequest) =>
  client.put<void>('/api/users/me/configuration/language', body),
getLocalizationOptions: (): Promise<LocalizationOptionsResponse> =>
  client.get<LocalizationOptionsResponse>('/api/users/me/configuration/localization-options'),
```

- [ ] **Step 4: Run — verify pass**

Run: `pnpm exec vitest run src/api/configuration.test.ts` → PASS

- [ ] **Step 5: Commit**

```bash
just format && just lint
git add src/api/configuration.ts src/api/configuration.test.ts
git commit -m "feat(api): setCountry/setLanguage/getLocalizationOptions configuration methods (tracker#47)"
```

---

## Task 4: Pure helpers — partition + labels

**Files:** Create `src/features/banking/partitionProvidersByCountry.ts` (+test), `src/features/configuration/localizationLabels.ts` (+test)

- [ ] **Step 1: Write failing tests**

`src/features/banking/partitionProvidersByCountry.test.ts`:

```ts
import { partitionProvidersByCountry } from './partitionProvidersByCountry';
// helper to build a BankProviderDTO with a given inUserCountry/countries
it('splits on inUserCountry, preserving order', () => {
  const list = [mk('a', true), mk('b', false), mk('c', true)];
  expect(partitionProvidersByCountry(list)).toEqual({
    inCountry: [list[0], list[2]],
    otherCountries: [list[1]],
  });
});
it('all in-country → empty otherCountries', () => {
  /* … */
});
it('all out-of-country → empty inCountry', () => {
  /* … */
});
it('empty input → both empty', () => {
  /* … */
});
```

`src/features/configuration/localizationLabels.test.ts`:

```ts
import { countryName, languageName } from './localizationLabels';
it('maps known codes', () => {
  expect(countryName('UA')).toBe('Ukraine');
  expect(languageName('en')).toBe('English');
});
it('falls back to the raw code when unknown', () => {
  expect(countryName('ZZ')).toBe('ZZ');
  expect(languageName('xx')).toBe('xx');
});
```

- [ ] **Step 2: Run — verify fail**

Run: `pnpm exec vitest run src/features/banking/partitionProvidersByCountry.test.ts src/features/configuration/localizationLabels.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement**

`partitionProvidersByCountry.ts`:

```ts
import type { BankProviderDTO } from '@/api/types';
export interface ProviderPartition {
  inCountry: BankProviderDTO[];
  otherCountries: BankProviderDTO[];
}
export function partitionProvidersByCountry(providers: BankProviderDTO[]): ProviderPartition {
  const inCountry: BankProviderDTO[] = [];
  const otherCountries: BankProviderDTO[] = [];
  for (const p of providers) (p.inUserCountry ? inCountry : otherCountries).push(p);
  return { inCountry, otherCountries };
}
```

`localizationLabels.ts` — maps covering at least the supported set (US, UA, euro-area countries; en, uk), fallback to the raw code:

```ts
const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States',
  UA: 'Ukraine',
  DE: 'Germany' /* … euro-area … */,
};
const LANGUAGE_NAMES: Record<string, string> = { en: 'English', uk: 'Ukrainian' };
export const countryName = (code: string): string => COUNTRY_NAMES[code] ?? code;
export const languageName = (code: string): string => LANGUAGE_NAMES[code] ?? code;
```

(Use `Intl.DisplayNames` only if you confirm happy-dom supports it in tests; otherwise the static map above is safest.)

- [ ] **Step 4: Run — verify pass**; **Step 5: Commit**

```bash
just format && just lint
git add src/features/banking/partitionProvidersByCountry.ts src/features/banking/partitionProvidersByCountry.test.ts src/features/configuration/localizationLabels.ts src/features/configuration/localizationLabels.test.ts
git commit -m "feat(banking): pure provider country-partition + localization label helpers (tracker#47)"
```

---

## Task 5: Hooks — localization options, set language, set country

**Files:** Create `src/features/configuration/useLocalizationOptions.ts`, `src/features/profile/useSetLanguage.ts`, `src/features/profile/useSetCountry.ts` (+ tests)

- [ ] **Step 1: Write failing tests** (mirror `useSetBaseCurrency.test.tsx` — render hook via the test util, trigger mutation, assert MSW received the request and the config query was invalidated)

- `useSetLanguage`: calling `mutate({ language: 'uk' })` PUTs language and invalidates `['configuration']`.
- `useSetCountry`: calling `mutate({ country: 'UA' })` PUTs country, invalidates `['configuration']`, and — when the refetched config's `defaultCurrency`/`language`/`baseCurrency` differ from before — calls `toast` with the changed field(s); when nothing changed, does NOT toast. (Mock `@/lib/toast`'s `toast` via `vi.mock` and assert calls. Drive the "changed" case by overriding the configuration GET handler with `server.use` to return a different `defaultCurrency` after the mutation.)
  - **Test wiring note:** `invalidateQueries`/`refetchQueries` only refetch _active_ observers. A hook-only render with no mounted `['configuration']` observer will NOT refetch, so the diff branch won't fire and the test would wrongly see no change. Mount a `useConfiguration` observer in the same `QueryClientProvider` (e.g. render a tiny component that calls `useConfiguration()` alongside the hook under test, or use the shared render util that already provides the QueryClient) so the refetch actually runs.
- `useLocalizationOptions`: returns `localizationOptionsFixture`.

- [ ] **Step 2: Run — verify fail**

Run: `pnpm exec vitest run src/features/configuration/useLocalizationOptions.test.tsx src/features/profile/useSetLanguage.test.tsx src/features/profile/useSetCountry.test.tsx`
Expected: FAIL — hooks missing.

- [ ] **Step 3: Implement**

- `useLocalizationOptions.ts` — `useQuery({ queryKey: ['localization-options'], enabled: !!session, staleTime: Infinity, queryFn: … getLocalizationOptions() })` (mirror `useProviders` for client construction + `enabled`).
- `useSetLanguage.ts` — mirror `useSetBaseCurrency.ts` exactly (mutation → `setLanguage`, `onSuccess` invalidate `['configuration']`).
- `useSetCountry.ts` — mutation → `setCountry`. Read the current config from the query cache before mutating: `const prev = queryClient.getQueryData<ConfigurationResponse>(['configuration'])`. `onSuccess`: `await queryClient.invalidateQueries({ queryKey: ['configuration'] })`, then read `const next = queryClient.getQueryData<ConfigurationResponse>(['configuration'])`; if `next` and `prev` differ on `defaultCurrency`, `language`, or `baseCurrency`, `toast(...)` a concise summary (e.g. `Default currency updated to ${next.defaultCurrency}`; if several changed, one combined message). No toast otherwise. Handle `prev`/`next` possibly undefined (skip the toast). (Base currency is included because a country preset can re-base it when editable; keeping it silent would hide a real change.)

  > IMPLEMENTATION NOTE: `invalidateQueries` resolves after the active `['configuration']` query refetches, so `getQueryData` immediately after gives the fresh value. Confirm this against `useConfiguration` (it's an active mounted query in the pane). If flaky in the hook test, `await queryClient.refetchQueries({ queryKey: ['configuration'] })` instead.

- [ ] **Step 4: Run — verify pass**; **Step 5: Commit**

```bash
just format && just lint
git add src/features/configuration/useLocalizationOptions.ts src/features/configuration/useLocalizationOptions.test.tsx src/features/profile/useSetLanguage.ts src/features/profile/useSetLanguage.test.tsx src/features/profile/useSetCountry.ts src/features/profile/useSetCountry.test.tsx
git commit -m "feat(profile): useLocalizationOptions/useSetLanguage/useSetCountry hooks (tracker#47)"
```

---

## Task 6: Localization settings UI

**Files:** Modify `src/features/profile/ProfileGeneralPane.tsx` (+ its test)

- [ ] **Step 1: Write failing test**

In `ProfileGeneralPane.test.tsx` add cases (follow existing render/util + MSW patterns):

- Renders a **Country** select and a **Language** select, populated from `useLocalizationOptions` (option labels via `countryName`/`languageName`).
- Country shows the current `country` (or a "Not set" placeholder when `null`); Language shows current `language`.
- Selecting a language calls `PUT …/language`; selecting a country calls `PUT …/country` (assert via MSW capture). No confirmation dialog appears for either.

- [ ] **Step 2: Run — verify fail**

Run: `pnpm exec vitest run src/features/profile/ProfileGeneralPane.test.tsx`
Expected: FAIL — new selects absent.

- [ ] **Step 3: Implement**

Add a `LocalizationSection` (a `Card` like `CurrenciesSection`) rendering a Country `Select` and a Language `Select` built from `useLocalizationOptions().data` (`languages`, `countries`), wired to `useSetLanguage` / `useSetCountry`. Render it in `ProfileGeneralPane` alongside `<CurrenciesSection />`. Use `countryName`/`languageName` for option text. Country placeholder "Not set" when `country == null`. No confirm dialog (unlike base-currency). Follow the pane's existing `Select`/`Card` idioms and a11y labels.

- [ ] **Step 4: Run — verify pass**; **Step 5: Commit**

```bash
just format && just lint
git add src/features/profile/ProfileGeneralPane.tsx src/features/profile/ProfileGeneralPane.test.tsx
git commit -m "feat(profile): country + language selectors in general settings (tracker#47)"
```

---

## Task 7: Country-aware provider pickers (grouped Select)

**Files:** Modify `src/features/profile/BankConnectionDialog.tsx`, `src/features/accounts/SubtypeFields.tsx` (+ their tests)

- [ ] **Step 1: Write failing tests**

- `BankConnectionDialog.test.tsx`: with providers where some `inUserCountry:false`, the provider `Select` renders an "in-country" group and an "Other countries" group (assert group labels present, and an out-of-country item shows its country label). With all `inUserCountry:true` (or no country), no group headers render (flat list). Empty in-country → only the "Other countries" group renders and the dialog is still submittable.
- `SubtypeFields.test.tsx`: same grouping for the "Bank name" select, and the `"Other…"` item is still present and last.

- [ ] **Step 2: Run — verify fail**

Run: `pnpm exec vitest run src/features/profile/BankConnectionDialog.test.tsx src/features/accounts/SubtypeFields.test.tsx`
Expected: FAIL (no groups yet).

- [ ] **Step 3: Implement**

In both files, replace the flat `providerList.map`/`providers.map` `SelectItem` render with a grouped render driven by `partitionProvidersByCountry(list)`:

- If `otherCountries.length === 0` → render a flat list of `inCountry` (no `SelectGroup`), preserving today's behavior when there's nothing to curate.
- Else render `<SelectGroup>` for `inCountry` (omit the group entirely if empty) then a `<SelectGroup>` with a `<SelectLabel>Other countries</SelectLabel>` for `otherCountries`, each item's text suffixed with its country via `countryName(p.countries[0])` (guard empty `countries`).
- Import `SelectGroup`, `SelectLabel` from `@/components/ui/select` (confirmed exported).
- `SubtypeFields`: keep the `CUSTOM_BANK_VALUE` "Other…" `SelectItem` last, outside the groups.
- Do not otherwise change the dialog's schema/validation (`makeBankConnectionFormSchema` still receives the full `providerList`).

- [ ] **Step 4: Run — verify pass**

Run: `pnpm exec vitest run src/features/profile/BankConnectionDialog.test.tsx src/features/accounts/SubtypeFields.test.tsx` → PASS

- [ ] **Step 5: Commit**

```bash
just format && just lint
git add src/features/profile/BankConnectionDialog.tsx src/features/profile/BankConnectionDialog.test.tsx src/features/accounts/SubtypeFields.tsx src/features/accounts/SubtypeFields.test.tsx
git commit -m "feat(banking): group provider pickers by user country (tracker#47)"
```

---

## Task 8: Final verification

- [ ] **Step 1: Full gate**

Run: `just check && just test`
Expected: typecheck + lint + format-check clean; full Vitest suite green.

- [ ] **Step 2: Build**

Run: `just build`
Expected: `tsc -b` + `vite build` succeed.

- [ ] **Step 3: Manual/Playwright smoke** (against the running backend — see finishing step)

The user runs a real backend. After the suite is green, drive the app (Playwright, `just e2e` or a targeted script): sign in → Profile/General → set Country and Language (observe persistence + toast-on-change) → open "Add connection" and confirm provider grouping reflects the chosen country → create a bank-account subtype and confirm the grouped "Bank name" select. Capture the result.

- [ ] **Step 4: Confirm no scope leak**

Verify `useProviders.ts` return shape is unchanged and the capability-only surfaces (`ImportStatementButton`, `ProfileBankingPane`, `SyncNowButton`, `LinkAccountsDialog`) were not modified.
