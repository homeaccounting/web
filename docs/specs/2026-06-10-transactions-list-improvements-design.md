---
status: draft
---

# Transactions List Improvements — Design

**Date:** 2026-06-10
**Status:** Draft (pre-implementation)
**Issue:** [homeaccounting/web#25](https://github.com/homeaccounting/web/issues/25)
**Scope:** Improve the transactions list (`TransactionsPane`) — make labels visible (gmail style), make transaction types easy to identify, add filtering (label, description, date range) and client-side pagination.
**Predecessors:** [`2026-06-04-edit-transaction-design.md`](./2026-06-04-edit-transaction-design.md), [`2026-06-01-create-transaction-design.md`](./2026-06-01-create-transaction-design.md) — this slice reads the same `TransactionResponse` rows and reuses `LabelMultiSelect`.

## 1. Purpose & scope

A signed-in user viewing an account's transactions in `TransactionsPane` can:

- **See labels** on each row as colored chips (gmail style), so labels are visible at a glance without opening the row.
- **Identify the transaction type** of each row instantly via a per-type icon and color (income / expense / transfer / adjustment).
- **Filter** the currently-loaded transactions by **label**, **category**, **description** (partial, case-insensitive), and a **date range** (From / To).
- **Page** through the results: a page-size selector (newest-first), Prev / Next, and a "showing N–M of T" count.

The guiding constraint from the issue and follow-up discussion: filtering is **mostly browser-side**. The backend's filtering support is used only to **bound the fetched window by date** (so we never load the entire account history); all other filtering and all pagination happen in the browser over the loaded window.

### Explicitly out of scope (deferred)

- **Status filtering via the backend.** The backend supports a `status` filter param, but all status filtering is browser-side (see §5.1) consistent with the general browser-side filtering policy.
- **Server-side pagination as the primary mechanism.** `limit`/`offset` are used internally only to accumulate the date-bounded window (§4); the user-facing pager is browser-side over the filtered set.
- **Persisting filter values** (description text, selected labels, date range) across visits. Only the **page size** is persisted (§6). Dates default to the last month on every visit.
- **Saved filters / filter presets, URL-encoded filter state, multi-account views.**
- **Infinite scroll / virtualization.** A simple paged table is sufficient for the bounded window.

## 2. Backend dependency

**No backend changes.** The web client consumes the existing list endpoint and its query grammar (`backend` repo at `../server-infra`, `src/Web/API/TransactionAPI.hs:130-145`, design doc `docs/specs/2026-06-09-transaction-query-language-design.md`):

`GET /api/transactions` query params (all optional; absent = no constraint):

| Param                 | Type / format                     | Used here | Notes                                                                                                                    |
| --------------------- | --------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------ |
| `accountId`           | UUID                              | ✅ yes    | restrict to the viewed account (already sent today)                                                                      |
| `dateFrom` / `dateTo` | `UTCTime` ISO-8601, **inclusive** | ✅ yes    | bounds the fetched window; `dateFrom > dateTo` → 400                                                                     |
| `status`              | CSV `StatusKind` (IN)             | ❌ no     | out of scope                                                                                                             |
| `label`               | CSV UUID (set **overlap / ANY**)  | ❌ no     | label filtering done browser-side for uniformity (§5)                                                                    |
| (category)            | — **no param exists**             | ❌ n/a    | backend defers category filtering (`2026-06-09-...:49`); done browser-side over the response's populated `category` (§5) |
| `limit`               | Int, default 50, **max 200**      | ✅ yes    | window accumulation page size (§4)                                                                                       |
| `offset`              | Int, default 0                    | ✅ yes    | window accumulation offset (§4)                                                                                          |

Response — `TransactionListResponse` (`Web/Types.hs:565-575`) has **four** fields:

```jsonc
{ "transactions": [...], "totalCount": <Int>, "limit": <Int>, "offset": <Int> }
```

`totalCount` counts all matches **before** paging.

### 2.1 DTO sync (CLAUDE.md lockstep)

`src/api/types.ts` drifts from the backend and is brought in lockstep as part of this slice (additive only; cite source in comments):

- `TransactionListResponse`: **add** `limit: number` and `offset: number` (currently only `transactions`, `totalCount`). Source: `Web/Types.hs:565-575`.
- `TransactionResponse`: **add** `amendmentCount: number` (backend `amendmentCount :: Word`). Source: `Web/Types.hs` `data TransactionResponse`. Not used by this feature, but added to keep the DTO faithful since we touch this module.

`category` is already present on `TransactionResponse` and **is** populated by the list response (`fromTransactionData` derives it via `transactionTypeCategoryText transactionType` — non-null for income/expense, null for transfer/adjustment). No change needed there.

## 3. Data flow & architecture

```
useParams(id) ──► useWindowedTransactions(accountId, dateFrom, dateTo)
                     │  (TanStack Query; queryKey includes the ISO window)
                     │  fetches the WHOLE window by paging limit=200/offset
                     ▼
              all rows in window (newest-first)
                     │
        TransactionFilters (state: description, labelIds, categoryId)
                     │  applyTransactionFilters(rows, filters)  ── pure, browser-side
                     ▼
              filtered rows
                     │
        Pagination (state: pageSize [persisted], pageIndex)
                     ▼
              page slice ──► <table>  (type icon + colored label chips per row)
```

- `TransactionsPane` owns filter state and pagination state and composes the pieces. It calls `useConfiguration()` and passes to `TransactionFilterBar`: the **labels dictionary entries** (`config.dictionaries.labels?.entries ?? []`, key `labels`) for `LabelMultiSelect`, and the **union of category entries** (`income-category` ⊎ `expense-category` entries) for the category `CategoryCombobox`. It passes the flat **id→name map** (`useDictionaryEntryNames`) to `LabelChips`. The category options handed to the filter bar are `[{ id: '', name: 'All categories' }, ...incomeEntries, ...expenseEntries]` (sentinel-first; see §5). It stays presentational beyond wiring.
- The window fetch is the only network dependency; changing description/label/page does **not** refetch.
- Changing **From/To** changes the query key and refetches the window.

### 3.1 Component / module boundaries

| Unit                         | Responsibility                                                                                                                                                                                                                                                                                                       | Depends on                                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `useWindowedTransactions.ts` | Fetch the full date-bounded window via paged `limit`/`offset` accumulation; expose `{ data, isLoading, isError, refetch }`.                                                                                                                                                                                          | `transactionsApi.list`, `useAuth`                               |
| `transactions.ts` `list()`   | Extend to accept optional `dateFrom`/`dateTo`/`limit`/`offset`; return the full `TransactionListResponse` (incl. `totalCount`).                                                                                                                                                                                      | `ApiClient`                                                     |
| `transactionFilters.ts`      | Pure `applyTransactionFilters(rows, { description, labelIds, categoryId })`; pure `defaultDateWindow()` helper.                                                                                                                                                                                                      | types only                                                      |
| `labelColors.ts`             | Pure `labelChipClasses(labelId)` → deterministic Tailwind classes from a fixed palette.                                                                                                                                                                                                                              | —                                                               |
| `transactionType.ts`         | Pure map: `transactionType` → `{ Icon, colorClass, srLabel }`.                                                                                                                                                                                                                                                       | `lucide-react`                                                  |
| `TransactionFilterBar.tsx`   | Renders From/To `DatePicker`s, description input, `LabelMultiSelect`, `CategoryCombobox`, Clear button; controlled via props. Receives the **label entries** and **category entries** (`DictionaryEntryResponse[]`) as props — both `LabelMultiSelect` and `CategoryCombobox` require `options`, not a name map.     | `DatePicker`, `LabelMultiSelect`, `CategoryCombobox`, ui inputs |
| `DatePicker.tsx`             | Shared, controlled single-date picker (shadcn Popover + Calendar / react-day-picker). Mouse-driven; value is a `YYYY-MM-DD` string (`''` = empty); range-limited via `minDate`/`maxDate`. FormControl-friendly (forwards `id`/`aria-*`/`name`/`onBlur` to the trigger). Reused in the create/edit transaction forms. | `Popover`, `Calendar`, `date-fns`                               |
| `TransactionPagination.tsx`  | Page-size selector + Prev/Next + "N–M of T"; controlled via props.                                                                                                                                                                                                                                                   | ui button/select                                                |
| `LabelChips.tsx`             | Renders a row's labels as colored chips (name from dictionary).                                                                                                                                                                                                                                                      | `labelColors`, configuration names                              |
| `TransactionTypeIcon.tsx`    | Renders the per-type icon with accessible label.                                                                                                                                                                                                                                                                     | `transactionType`                                               |

Each pure module is unit-testable in isolation; each component takes plain props (no data fetching inside) so it renders deterministically in tests.

## 4. Windowed fetch (the only backend filtering)

`useWindowedTransactions(accountId, dateFrom, dateTo)`:

1. Convert the From/To **date** inputs (`YYYY-MM-DD`) to inclusive UTC bounds: `dateFrom → <date>T00:00:00.000Z`, `dateTo → <date>T23:59:59.999Z`. The start-of-day half follows the existing `isoDay`/`isoDayUtc` pattern (`schema.ts:41`, `diffTransaction.ts:18`, `adjustBalanceSchema.ts:30`); the **end-of-day** bound (`T23:59:59.999Z`) is a **new helper** introduced by this slice (no existing precedent) and is unit-tested. It is correct against the backend because `Range.within` compares the ISO `Text` lexicographically, so `...T23:59:59.999Z` includes the whole `to` day.
2. Query `GET /api/transactions?accountId&dateFrom&dateTo&limit=200&offset=0`.
3. From the first response read `totalCount`. Loop fetching the next page (`offset += 200`) and appending **until** a page returns fewer than 200 rows OR `accumulated.length >= totalCount` (the dual guard avoids an infinite loop if `totalCount` drifts under concurrent mutation). Typically a single request for a month-sized window.
4. Return the accumulated array, sorted defensively client-side to match the backend ordering exactly: **`date` descending, ties broken by `id` ascending** (backend `compare b.date a.date <> compare idA idB`, `Application/ReadModels/Transaction.hs:462`), so ordering is deterministic in tests regardless of network/page-merge order.

`queryKey: ['transactions', accountId, dateFromIso, dateToIso]`. `enabled` only when `session && accountId`.

**Guardrails:**

- The filter bar prevents `From > To` (disables/validates) so we never send a 400-triggering range.
- **Known scaling limit:** a very wide window (e.g. years with thousands of rows) loads everything into memory. Acceptable for the personal-finance MVP and the last-month default; documented here and revisited if it becomes a problem (future: push pagination server-side once description/label filters exist server-side).

## 5. Filtering (browser-side)

Pure function — `applyTransactionFilters(rows, { description, labelIds, categoryId })`:

- **description:** if non-empty, keep rows whose `description` contains the query, case-insensitive (trimmed).
- **labelIds:** if non-empty, keep rows where `row.labels` intersects `labelIds` (**ANY of** — matches the backend's overlap semantics).
- **categoryId** (typed `string`, i.e. `UUID | ''` — **not** `UUID`, so the "no constraint" empty state is assignable): if non-empty, keep rows where `row.category === categoryId` (exact match on the populated `category`). Rows with `category === null` (transfers/adjustments) are excluded when a category is selected. Category-entry ids are globally-unique UUIDs (`useConfiguration.ts:24-26`), so a single id unambiguously identifies one entry across the income/expense dictionaries.
  - **Known limitation — head-allocation only.** The backend's `category` is the **head** of a (possibly multi-) allocation list (`Web/Types.hs:993-1000`, `transactionTypeCategoryText = listToMaybe …`; documented there as transitional, to be widened to a list). So a transaction split across categories A+B (head A) **matches a filter for A but not B**. This slice filters on the head allocation only; full multi-allocation matching is deferred until the backend widens the field. Stated as an explicit limitation, not a silent gap.
- Filters compose with **AND** across fields; an empty field (`""`/`[]`) imposes no constraint.
- Order-preserving (input is already newest-first).

Filter state lives in `TransactionsPane` (`useState`), reset by a **Clear** button (description → "", labels → [], category → "", `showCancelledFailed` → false, dates → default window). Changing any filter resets `pageIndex` to 0 (§6).

### 5.1 Status visibility (Failed & Cancelled)

`TransactionFilters` has a boolean `showCancelledFailed` (default `false`). When false, `applyTransactionFilters` excludes any row whose `status` is `'Failed'` or `'Cancelled'`. A "Show cancelled & failed" checkbox in `TransactionFilterBar` toggles this field; it is part of the AND-composed filter predicate, browser-side only (consistent with §5).

Non-Completed rows that _are_ shown display status via a small icon (`TransactionStatusIcon`) rendered in the **leading cell alongside the transaction-type icon** — deliberately **not** a chip, so status is never visually confused with label chips. The icon is the sole status signal; no additional text badge is rendered.

| Status      | Icon (lucide)   | Color             | Extra row presentation                                           |
| ----------- | --------------- | ----------------- | ---------------------------------------------------------------- |
| `Pending`   | `Clock`         | Amber             | —                                                                |
| `Failed`    | `TriangleAlert` | Destructive (red) | Row muted; description struck through; `title` = `failureReason` |
| `Cancelled` | `Ban`           | Muted (gray)      | Row muted; description struck through                            |
| `Completed` | _(none)_        | —                 | —                                                                |

For `Failed` and `Cancelled` rows the entire row text is de-emphasized (`text-muted-foreground`) and the description is struck through (`line-through`). The amount cell does **not** apply the destructive red on de-emphasized rows (it reads muted with the rest of the row).

`failureReason` (set by the backend when `status === 'Failed'`) is exposed as a native `title` tooltip on the icon (`"Failed: <reason>"`).

**Rationale:** keeping status as a leading icon (not a chip in the description cell) maintains a clear visual separation between _status_ (left, structural) and _labels_ (right, user-defined colored chips). A chip-based status badge was ambiguous at a glance.

**Per-field category clear.** `CategoryCombobox.onChange` only ever emits a real entry id (`CategoryCombobox.tsx:71-77`), so it cannot by itself return to `""`. To give the category field its own deselect (rather than forcing a global Clear), the filter bar **prepends a sentinel option `{ id: '', name: 'All categories' }`** to the category options. Selecting it calls `onChange('')` → `categoryId = ''` → no constraint, and the combobox then displays "All categories" (since `options.find(o => o.id === '')` resolves the sentinel). No change to `CategoryCombobox` is required. The empty initial state likewise shows "All categories".

**Display-name ambiguity (minor UX).** Income and expense categories live in separate dictionaries and may share a display name (e.g. "Other"); the merged option list can therefore show two same-named entries. They have distinct ids and produce distinct filter results, so this is not a correctness bug. Disambiguating the labels (e.g. an "(income)"/"(expense)" suffix) is **deferred** — called out here so it isn't mistaken for an oversight.

## 6. Pagination (browser-side)

Over the **filtered** set:

- **Page size:** selector with `25 / 50 / 100`, default `50`, **persisted in `localStorage`** under a stable key (e.g. `ha.transactions.pageSize`); invalid/missing → default. This is the only persisted UI setting.
- **Page index:** the single source of truth is a `pageIndex` state, but `pageCount` and the **effective (clamped) page index** are **derived during render** from the _current_ filtered array length — never stored eagerly. This makes the slice correct even while a window refetch is in flight and `data` is momentarily stale/`undefined` (filter → paginate is recomputed from current `data` each render). `pageIndex` is **explicitly reset to 0** only on discrete events: a filter change, a date-window change, or a page-size change. There is no clamp-via-effect (which would cause an extra render/flash); the render-time clamp handles a shrunk filtered length.
- **Controls:** Prev / Next (disabled at bounds) and a label "Showing N–M of T" where T is the filtered count.
- **Slice:** `filtered.slice(pageIndex * pageSize, pageIndex * pageSize + pageSize)`.

## 7. Row presentation

### 7.1 Transaction type cue

`transactionType.ts` maps the `transactionType` discriminator to a `lucide-react` icon + color, rendered as a leading cell/badge with an accessible name (`aria-label`/`sr-only`):

| type         | icon (lucide)       | color      |
| ------------ | ------------------- | ---------- |
| `income`     | `ArrowDownToLine`   | green      |
| `expense`    | `ArrowUpFromLine`   | red        |
| `transfer`   | `ArrowLeftRight`    | blue       |
| `adjustment` | `Settings2`/`Scale` | muted/gray |
| unknown      | fallback dot        | muted      |

Icons reuse the same lucide set already used by `ControlBar` for consistency. The existing **amount color** (negative → destructive) is preserved.

### 7.2 Labels (gmail style)

`LabelChips.tsx` renders each `row.labels` id as a small rounded chip:

- **Name** resolved from the configuration dictionary (`useDictionaryEntryNames`); unknown ids are skipped.
- **Color** deterministic via `labelChipClasses(labelId)`: hash the id to an index into a small fixed Tailwind palette (e.g. 8 bg/text pairs chosen for contrast in light & dark). Same label → same color always; no schema or config-UI change.
- Chips **wrap** within the cell. No max/overflow truncation in this slice (YAGNI — the issue asks only for visible gmail-style labels); a "+k overflow" affordance is deferred until dense rows are a demonstrated problem.

The label column is additive; the existing Date / Description / Category / Amount columns are preserved. Labels render in (or beside) the Description cell to stay gmail-like.

## 8. Empty / loading / error states

- **Loading:** existing skeleton rows (unchanged).
- **Error:** existing error alert + Retry (`refetch`) (unchanged).
- **No transactions in window:** "No transactions in this date range." This **changes** the current copy (`"No transactions yet."`, `TransactionsPane.tsx:67`) because a date window now always applies, so "yet" is misleading. The existing assertion (`TransactionsPane.test.tsx:54`, `/no transactions yet/i`) is **updated** accordingly — this is a deliberate copy change, not a preserved behavior.
- **Filters exclude everything:** "No transactions match your filters." with the filter bar still visible so the user can adjust/Clear.
- **No account selected:** existing "Select an account." (unchanged).

## 9. Accessibility

- Filter inputs have associated labels. The From/To date inputs use a shared `DatePicker` (shadcn Popover + Calendar / react-day-picker): a mouse-driven popover calendar whose label-associated trigger button carries the `From`/`To` `aria-label` and any `FormControl`-injected `id`/`aria-*`. The range is constrained by binding each picker's `maxDate`/`minDate` to the other bound, so `From > To` can't be selected. The same control is reused for the date field in the create/edit transaction forms.
- `LabelMultiSelect` already implements combobox a11y (reused as-is).
- Type icon carries an `aria-label`/`sr-only` text ("Income", etc.) so the type is conveyed to screen readers, not by color alone.
- Pager controls are real `<button>`s with disabled states; the "N–M of T" text is in the DOM (not just visual).

## 10. Testing strategy (high effort)

| Scope            | What                                                                                                                                                              | Tool            |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| Unit             | `applyTransactionFilters` — description partial/case, label ANY-overlap, category exact-match (incl. null-category exclusion), AND composition, empty fields      | Vitest          |
| Unit             | `defaultDateWindow()` — last-month bounds; date→UTC inclusive conversion                                                                                          | Vitest          |
| Unit             | `labelChipClasses` — deterministic, stable across calls, within palette                                                                                           | Vitest          |
| Unit             | `transactionType` map — every type + unknown fallback                                                                                                             | Vitest          |
| Unit/integration | `useWindowedTransactions` — single-page window, multi-page accumulation (totalCount > 200), query-key changes on date change                                      | Vitest + MSW    |
| Component        | `TransactionFilterBar` — typing/clearing, From>To guard, label select, category select, **"All categories" sentinel deselects category**, Clear resets all fields | Testing Library |
| Component        | `TransactionPagination` — size change, prev/next bounds, N–M of T text, localStorage persistence                                                                  | Testing Library |
| Component        | `TransactionsPane` — labels render as chips, type icon present, filtering narrows rows, pagination slices, empty-filter message                                   | Testing Library |
| Handlers         | MSW `GET /api/transactions` updated to honor `dateFrom`/`dateTo`/`limit`/`offset` and return the **4-field** `{ transactions, totalCount, limit, offset }` shape  | MSW             |

The DTO change (§2.1) makes `amendmentCount` a required field on `TransactionResponse`, so every literal that constructs one must add it: `src/test/fixtures.ts` (`transactionFixture`/`editedTransactionFixture`), the inline `TransactionResponse` objects in `src/test/handlers.ts`, and any in `TransactionsPane.test.tsx`. `amendmentCount: 0` is the natural default.

Existing `TransactionsPane.test.tsx` is **extended** for new behavior; the row double-click → edit, context-menu edit, and amount-color behaviors are preserved and re-asserted. The empty-state assertion is **updated** per §8 (copy change).

## 11. Risks & mitigations

- **DTO drift** (the prompt's most common bug source): addressed by §2.1 with cited backend sources.
- **Window too large:** documented in §4; mitigated by last-month default and the `From>To`/range UI; not solved structurally this slice.
- **MSW handler must mirror the 4-field response** or the new `useWindowedTransactions` accumulation loop will misbehave in tests — covered by the handler update + accumulation test.
- **Ordering assumptions:** defensive client-side sort (date desc, id tiebreak) so tests and pagination are deterministic regardless of backend order guarantees.
