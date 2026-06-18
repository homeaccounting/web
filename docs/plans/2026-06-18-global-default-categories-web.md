# Global Default Categories — Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consume the now-global `defaultIncomeCategory` / `defaultExpenseCategory` (top-level on `ConfigurationResponse`), move the "Default categories" editor from the Banking tab to the Dictionaries tab (ungated from `bankingFeatureEnabled`), and repoint Convert (#20) at the global defaults.

**Architecture:** TanStack Query + typed `ApiClient`. DTOs in `src/api/types.ts` mirror the backend `ConfigurationResponse`. A new `useUpdateDefaults` hook calls a new `PUT /api/users/me/configuration/defaults` endpoint; the editor field is extracted into its own component and rendered in `ProfileDictionariesPane`.

**Tech Stack:** React 18, TypeScript (strict), Vitest + Testing Library + MSW, shadcn/ui.

**Spec:** `docs/specs/2026-06-18-global-default-categories-design.md`

**Depends on:** the backend PR landing the top-level fields + `/defaults` endpoint. MSW makes this fully testable before the backend merges. Branch: `feat/global-default-categories` (already created off `origin/master`).

**Commands:** `pnpm exec vitest run <path>` (single), `just check` (typecheck+lint+format), `just test`.

---

## Task 1: DTOs — move fields to top level, add request type

**Files:**

- Modify: `src/api/types.ts` (`:398-436`)

- [ ] **Step 1:** In `ConfigurationResponse` (`:425`) add `defaultIncomeCategory: UUID | null;` and `defaultExpenseCategory: UUID | null;`. Remove both fields from `BankingConfigurationDTO` (`:419-420`) and from `UpdateBankingRequest` (`:399-400`), so `UpdateBankingRequest` keeps only `mccExpenseCategoryMap?`. Add:

  ```ts
  export interface UpdateDefaultsRequest {
    defaultIncomeCategory?: UUID | null;
    defaultExpenseCategory?: UUID | null;
  }
  ```

  Update the comment at `:352` to cite the new top-level fields.

- [ ] **Step 2: Typecheck — expect failures** in consumers (fixtures, handlers, MccMappingEditor, ConvertTransactionDialog). That's expected; later tasks fix them.
      Run: `pnpm exec tsc --noEmit`
      Expected: errors localized to the known consumers.

- [ ] **Step 3: Commit.**
  ```bash
  git add src/api/types.ts
  git commit -m "refactor(api): move default categories to top-level ConfigurationResponse (#41)"
  ```

---

## Task 2: API client + `useUpdateDefaults` hook (TDD)

**Files:**

- Modify: `src/api/configuration.ts`
- Create: `src/features/configuration/useUpdateDefaults.ts`
- Create: `src/features/configuration/useUpdateDefaults.test.tsx`

- [ ] **Step 1: Write the failing test** `useUpdateDefaults.test.tsx`, modeled on `useUpdateBanking.test.tsx`: sign in via the test helper, mutate `{ defaultIncomeCategory: <id> }`, assert the MSW `PUT /configuration/defaults` handler received it and that `['configuration']` is invalidated.

- [ ] **Step 2: Run, expect FAIL** (hook + endpoint don't exist).
      Run: `pnpm exec vitest run src/features/configuration/useUpdateDefaults.test.tsx`
      Expected: FAIL.

- [ ] **Step 3: configuration.ts** — add to the client object:

  ```ts
  updateDefaults: (body: UpdateDefaultsRequest) =>
    client.put<ConfigurationResponse>('/api/users/me/configuration/defaults', body),
  ```

  Change `updateBanking`'s body type to the trimmed `UpdateBankingRequest` (still returns `BankingConfigurationDTO`). Add `UpdateDefaultsRequest` to the type imports.

- [ ] **Step 4: Create `useUpdateDefaults.ts`** mirroring `useUpdateBanking.ts` (`mutationFn` calls `configurationApi(client).updateDefaults`; `onSuccess` invalidates `['configuration']`). Return type `ConfigurationResponse`.

- [ ] **Step 5:** Add the MSW handler in `src/test/handlers.ts` (near `:284`):

  ```ts
  http.put(`${apiBase}/api/users/me/configuration/defaults`, async ({ request }) => {
    const body = (await request.json()) as UpdateDefaultsRequest;
    return HttpResponse.json({
      ...configurationFixture,
      defaultIncomeCategory: body.defaultIncomeCategory ?? null,
      defaultExpenseCategory: body.defaultExpenseCategory ?? null,
    });
  }),
  ```

- [ ] **Step 6: Run, expect PASS.**
      Run: `pnpm exec vitest run src/features/configuration/useUpdateDefaults.test.tsx`
      Expected: PASS.

- [ ] **Step 7: Commit.**
  ```bash
  git add src/api/configuration.ts src/features/configuration/useUpdateDefaults.ts src/features/configuration/useUpdateDefaults.test.tsx src/test/handlers.ts
  git commit -m "feat(configuration): useUpdateDefaults hook + /configuration/defaults client (#41)"
  ```

---

## Task 3: Fixtures + trim banking MSW handler

**Files:**

- Modify: `src/test/fixtures.ts` (`:97-100`)
- Modify: `src/test/handlers.ts` (`:284-290`)

- [ ] **Step 1:** In `configurationFixture`, move `defaultIncomeCategory: null` / `defaultExpenseCategory: null` out of `banking` (`:97-98`) to the top level of the fixture object; `banking` keeps only `mccExpenseCategoryMap` + `connections`.

- [ ] **Step 2:** In the existing `PUT …/configuration/banking` handler (`:284`), drop the two default fields from the returned `BankingConfigurationDTO` (keep `mccExpenseCategoryMap` + `connections`).

- [ ] **Step 3: Run the configuration/profile suites — expect them to surface remaining consumers.**
      Run: `pnpm exec vitest run src/features/profile`
      Expected: failures only in MccMappingEditor / ProfileBankingPane (fixed next).

- [ ] **Step 4: Commit.**
  ```bash
  git add src/test/fixtures.ts src/test/handlers.ts
  git commit -m "test(configuration): top-level default categories in fixtures/handlers (#41)"
  ```

---

## Task 4: Extract `DefaultCategoryField` into its own component (TDD)

**Files:**

- Create: `src/features/profile/DefaultCategoryField.tsx`
- Create: `src/features/profile/DefaultCategoryField.test.tsx`
- Modify: `src/features/profile/MccMappingEditor.tsx` (remove `DefaultCategoryField`, `:126-190`)

- [ ] **Step 1: Write the failing test** `DefaultCategoryField.test.tsx`: render with `field="defaultIncomeCategory"`, a `current` id, and a category list; change the select, click Save, assert the MSW `/configuration/defaults` handler got `{ defaultIncomeCategory: <id> }`. (Do **not** assert that "— none —" clears the value — clear is a server-side no-op, see backend plan Task 5; you may assert the request body carries `null`, but not that the stored default becomes null.)

- [ ] **Step 2: Run, expect FAIL** (new file).
      Run: `pnpm exec vitest run src/features/profile/DefaultCategoryField.test.tsx`
      Expected: FAIL.

- [ ] **Step 3: Create `DefaultCategoryField.tsx`** by moving the component out of `MccMappingEditor.tsx` (`:126-190`) verbatim, then rewiring:
  - import `useUpdateDefaults` (not `useUpdateBanking`) and `UpdateDefaultsRequest` (not `UpdateBankingRequest`).
  - `save()` builds `const body: UpdateDefaultsRequest = { [field]: selected === NONE_VALUE ? null : selected }`.
  - Keep the same `field: 'defaultIncomeCategory' | 'defaultExpenseCategory'` prop, labels, `NONE_VALUE`, and a11y attributes.

- [ ] **Step 4: MccMappingEditor.tsx** — delete the `DefaultCategoryField` component and its now-unused imports (`NONE_VALUE`, the `DefaultCategoryFieldProps`); the file keeps only the MCC table. Leave `useUpdateBanking` (still used by the MCC save).

- [ ] **Step 5: Run, expect PASS** + the existing `MccMappingEditor.test.tsx` still green (remove any DefaultCategoryField cases from it, since they moved).
      Run: `pnpm exec vitest run src/features/profile/DefaultCategoryField.test.tsx src/features/profile/MccMappingEditor.test.tsx`
      Expected: PASS.

- [ ] **Step 6: Commit.**
  ```bash
  git add src/features/profile/DefaultCategoryField.tsx src/features/profile/DefaultCategoryField.test.tsx src/features/profile/MccMappingEditor.tsx src/features/profile/MccMappingEditor.test.tsx
  git commit -m "refactor(profile): extract DefaultCategoryField onto useUpdateDefaults (#41)"
  ```

---

## Task 5: Move the card to the Dictionaries tab; remove from Banking (TDD)

**Files:**

- Modify: `src/features/profile/ProfileDictionariesPane.tsx`
- Modify: `src/features/profile/ProfileDictionariesPane.test.tsx`
- Modify: `src/features/profile/ProfileBankingPane.tsx` (`:24`, `:117-118`, `:144-162`)
- Modify: `src/features/profile/ProfileBankingPane.test.tsx`

- [ ] **Step 1: Update tests first.**
  - `ProfileDictionariesPane.test.tsx`: assert a "Default categories" card renders with both selects, works with `bankingFeatureEnabled: false`, and saving calls `/configuration/defaults`.
  - `ProfileBankingPane.test.tsx`: assert the "Default categories" card is **gone** (Bank connections + MCC mapping remain).

- [ ] **Step 2: Run, expect FAIL.**
      Run: `pnpm exec vitest run src/features/profile/ProfileDictionariesPane.test.tsx src/features/profile/ProfileBankingPane.test.tsx`
      Expected: FAIL.

- [ ] **Step 3: ProfileDictionariesPane.tsx** — add a third `<Card>` "Default categories" after Labels, importing `DefaultCategoryField`. Bind to top-level `c.defaultIncomeCategory` / `c.defaultExpenseCategory` and the dictionary entries already in scope:

  ```tsx
  const incomeCategories = c.dictionaries['income-category']?.entries ?? [];
  const expenseCategories = c.dictionaries['expense-category']?.entries ?? [];
  // …card body…
  <DefaultCategoryField field="defaultIncomeCategory" label="Default income category"
    current={c.defaultIncomeCategory} categories={incomeCategories} />
  <DefaultCategoryField field="defaultExpenseCategory" label="Default expense category"
    current={c.defaultExpenseCategory} categories={expenseCategories} />
  ```

- [ ] **Step 4: ProfileBankingPane.tsx** — delete the "Default categories" `<Card>` (`:144-162`), the `DefaultCategoryField` import (`:24` → import only `MccMappingEditor`), and the now-unused `incomeCategories` binding (`:118`). Keep `expenseCategories` (MCC card uses it).

- [ ] **Step 5: Run, expect PASS.**
      Run: `pnpm exec vitest run src/features/profile`
      Expected: PASS.

- [ ] **Step 6: Commit.**
  ```bash
  git add src/features/profile/ProfileDictionariesPane.tsx src/features/profile/ProfileDictionariesPane.test.tsx src/features/profile/ProfileBankingPane.tsx src/features/profile/ProfileBankingPane.test.tsx
  git commit -m "feat(profile): default categories card under Dictionaries, ungated (#41)"
  ```

---

## Task 6: Repoint Convert (#20) to global defaults

**Files:**

- Modify: `src/features/transactions/ConvertTransactionDialog.tsx` (`:130-132`)
- Modify: `src/features/transactions/ConvertTransactionDialog.test.tsx` (fixtures/overrides)
- Modify: `src/features/transactions/EditTransactionDialog.test.tsx` (`:69-72`)

- [ ] **Step 1: Update the convert test** so the config override sets top-level `defaultIncomeCategory`/`defaultExpenseCategory` (not under `banking`), asserting the converted form still seeds the category.

- [ ] **Step 2: Run, expect FAIL.**
      Run: `pnpm exec vitest run src/features/transactions/ConvertTransactionDialog.test.tsx`
      Expected: FAIL (type error / wrong seed).

- [ ] **Step 3: ConvertTransactionDialog.tsx** (`:130-132`):

  ```ts
  const defaultCategory =
    (targetKind === 'income' ? config?.defaultIncomeCategory : config?.defaultExpenseCategory) ??
    null;
  ```

- [ ] **Step 4: EditTransactionDialog.test.tsx** (`:69-72`) — move the two `default*Category` keys out of the inline `banking` override to the top level of the config object.

- [ ] **Step 5: Run, expect PASS.**
      Run: `pnpm exec vitest run src/features/transactions`
      Expected: PASS.

- [ ] **Step 6: Commit.**
  ```bash
  git add src/features/transactions/ConvertTransactionDialog.tsx src/features/transactions/ConvertTransactionDialog.test.tsx src/features/transactions/EditTransactionDialog.test.tsx
  git commit -m "refactor(transactions): convert reads global default categories (#41)"
  ```

---

## Task 7: Final verification

- [ ] `pnpm exec tsc --noEmit` — clean.
- [ ] `grep -rn "banking.defaultIncomeCategory\|banking.defaultExpenseCategory" src/` returns **nothing**.
- [ ] `just check` (typecheck + lint + format-check) — clean.
- [ ] `just test` — full suite green.
- [ ] Open web PR; note it pairs with the backend PR (breaking wire change) and that the e2e `convert-transaction` smoke continues to pass.
