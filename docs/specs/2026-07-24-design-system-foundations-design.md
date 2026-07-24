---
title: Design-system foundations + consistency rollout
date: 2026-07-24
status: draft
branch: feat/design-system-foundations
---

# Design-system foundations + consistency rollout

## 1. Problem & goal

The web client was assembled feature-by-feature on top of a stock shadcn/ui slate
theme with **no custom font and no documented design conventions**. As a result the
same semantic thing is expressed many different ways: card titles are larger than the
page title above them, "negative money" is one color in transactions and another in
reports, six files use a native `<select>` while eleven use the shadcn `Select`, badges
and toasts are hand-rolled in 5+ shapes, three different tab visual styles coexist, and
the expense/income dialog scrolls its entire body (title and action buttons included)
even on large monitors.

**Goal:** establish a small, deliberate design-system foundation (one font, a documented
type scale, semantic color tokens, a handful of shared primitives) and then roll it
across every feature so the app reads as one consistent, natural product — in a single
branch, delivered as ordered workstreams.

This is not a redesign. It keeps the existing slate/neutral character and information
architecture; it makes the existing intent consistent and fixes two concrete UX defects
(dialog scrolling, Profile title/tab hierarchy).

## 2. Locked decisions (from brainstorming)

| Decision         | Choice                                                                                                                                                                                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visual direction | **A — Refined Neutral**: Inter typeface + the current (tightened) slate palette                                                                                                                                                                                                             |
| Font delivery    | **Self-hosted** via `@fontsource-variable/inter` (no CDN, no FOUT, offline-safe)                                                                                                                                                                                                            |
| Money color      | **Income green, expense red** as _dedicated_ `--positive` / `--negative` tokens, **decoupled** from `--destructive` (which stays for delete/error only)                                                                                                                                     |
| Card title size  | shadcn `CardTitle` overridden `text-2xl` → **`text-lg font-semibold`**                                                                                                                                                                                                                      |
| Content width    | one container width, **`max-w-4xl`**, for app content pages (auth pages keep `max-w-md`)                                                                                                                                                                                                    |
| Status colors    | amber/blue promoted to **`--warning` / `--info`** tokens                                                                                                                                                                                                                                    |
| Tabs             | **keep the intentional two-tier system** (segmented = primary, underline = nested); fix only the real inconsistency — Header nav adopts the shared underline treatment + unified `border-primary` active token. Profile top-level tabs stay segmented; Dictionaries sub-tabs stay underline |
| Scope            | Foundation **+ full rollout** across all features in this branch                                                                                                                                                                                                                            |

## 3. Current-state audit (evidence)

Findings that this spec addresses (file:line references are the current `src/` at branch
base `c51fd13`). Condensed from the full survey.

**Typography.** No `@font-face`/Google Fonts/`fontFamily` anywhere (`index.html`,
`globals.css`, `tailwind.config.ts`) — app runs on the Preflight system stack. Heading
sizes for equivalent levels diverge: page `h1` `text-xl` (`ProfilePage.tsx:64`,
`ReportsPane.tsx:22`) vs `CardTitle` `text-2xl` (`ui/card.tsx:27`) vs report card `h2`
default `text-base` (`IncomeVsExpenseCard.tsx:31`, `SpendingByCategoryCard.tsx:31`,
`NetWorthCard.tsx:22`) vs account `h2 text-lg` (`AccountHeader.tsx:12`). Sub-headings mix
`font-semibold`/`font-medium`. Arbitrary `text-[10px]` at `AccountsPane.tsx:42`.

**Cards.** Two implementations: shadcn `Card` (profile) vs raw
`<section className="rounded-lg border p-4">` (all three reports cards) — the latter
lack `bg-card`/`text-card-foreground`/`shadow-sm`.

**Selects.** Native `<select>` at `DictionaryList.tsx:129,204,213`,
`TransferForm.tsx:100,125`, `IncomeExpenseForm.tsx:164`, `TransactionPagination.tsx:48`,
`AdjustBalanceDialog.tsx:151`; raw `<Input type="date">` at `SubtypeFields.tsx:289`.

**Color.** `text-green-600` success text at `ProfileGeneralPane.tsx:204`,
`ProfileAuthPane.tsx:136`, `UserIdCard.tsx:51`, `DefaultAccountsCard.tsx:94`,
`DefaultCategoriesCard.tsx:102`, `MccMappingEditor.tsx:121`. Reports use
`text-green-600`/`text-red-600` (`IncomeVsExpenseCard.tsx:40,41,45`) while transactions
use `text-destructive` for negatives (`TransactionsPane.tsx:542`). `bg-emerald-600`/
`text-emerald-600` at `AllocationsEditor.tsx:284,286`. `text-amber-600 dark:text-amber-400`
at `TransactionStatusIcon.tsx:12`. `text-green/blue-600 dark:*-400` at
`transactionType.tsx:42,50`. Categorical label palette `labelColors.ts:4-11` (intentional).

**Badges.** No `ui/badge.tsx`. Hand-rolled at `AccountsPane.tsx:42`,
`ManageAccessDialog.tsx:60`, `ProfileBankingPane.tsx:47`, `ContactChip.tsx:25`,
`RelationBadge.tsx:9`, `RefundBadge.tsx:7`, `TransactionsPane.tsx:728` — varying radius
(`rounded` vs `rounded-full`), padding, and text size.

**Toasts.** No primitive. Duplicated `fixed bottom-4 right-4 z-50 w-80 …` block at
`AccountsPane.tsx:325`, `SyncNowButton.tsx:104`, `ImportStatementButton.tsx:108`.

**Confirm.** Native `window.confirm('Remove this association?')` at `TransactionsPane.tsx:130`
(every other confirm uses `AlertDialog`).

**Icons/boxes.** `h-4 w-4` (47) vs `h-5 w-5` (12) vs `h-3 w-3` (5); icon-button box
`h-10`/`h-9`/`h-7` across `AccountsPane`, `ControlBar`, `TransactionsPane`.

**Radius.** Bare `rounded` (fixed 0.25rem, off the `--radius` scale) at
`TransactionPagination.tsx:50`, `UserIdCard.tsx:33`, `ProfileBankingPane.tsx:47`,
`BreakdownBar.tsx:15,18`.

**Empty/error/loading.** Empty-state wording/punctuation/size inconsistent; transactions
empty text omits `text-sm`. Errors: mixed `role`/`variant` order, retry present in
lists but absent in profile panes, copy "Could not…" vs "Failed to…". Loading: Skeleton
(most) vs plain text (`RefundTransactionDialog.tsx:55`) vs spinner (`SyncNowButton.tsx:95`);
profile skeleton wrappers `space-y-4` while loaded state is `space-y-6`.

**Layout.** Page padding `p-4 md:p-6` (reports) vs `p-6` (profile) vs `p-4` (oauth);
max-width `max-w-4xl` (reports) vs `max-w-3xl` (profile). `NotFoundPage.tsx` is a bare
unstyled `<div className="p-6">Not found.</div>`.

**Tabs/nav.** Header underline nav uses `border-foreground`; in-page `Tabs
variant="underline"` uses `border-primary` (`ui/tabs.tsx:45`); Profile uses segmented
`TabsList`, Dictionaries uses `variant="underline"` — three styles at once.

**Dialog.** `ui/dialog.tsx:39` — `DialogContent` is a single
`max-h-[85vh] w-full max-w-lg overflow-y-auto` scroll container; header + body + footer
scroll together. `IncomeExpenseForm.tsx` is a long single-column stack, so the dialog is
tall-and-narrow and scrolls on any screen size, pushing the title and Save/Cancel out of
view.

## 4. Design

Seven workstreams. Each is independently reviewable; ordering in §5.

### WS1 — Type & font foundation

- Add dependency `@fontsource-variable/inter`; import `@fontsource-variable/inter` in
  `src/main.tsx`.
- `tailwind.config.ts`: `theme.extend.fontFamily.sans = ['InterVariable', 'Inter',
...defaultTheme.fontFamily.sans]`. Keep `fontFamily.mono` default (IDs/code unchanged).
- Apply Tailwind's built-in `tabular-nums` to every money/amount display.
- Documented **type scale** (add to this spec + a short comment block; enforced by usage):

  | Role                                              | Class                                   |
  | ------------------------------------------------- | --------------------------------------- |
  | Page title (`h1`)                                 | `text-2xl font-semibold tracking-tight` |
  | Card / section title (incl. `AccountHeader` `h2`) | `text-lg font-semibold`                 |
  | Sub-heading (`h3`)                                | `text-sm font-medium`                   |
  | Body                                              | `text-sm`                               |
  | Meta / caption                                    | `text-xs text-muted-foreground`         |

- Override `ui/card.tsx` `CardTitle` from `text-2xl font-semibold leading-none
tracking-tight` → `text-lg font-semibold leading-none tracking-tight` (documented
  vendored-component edit; `ui/` normally regenerated, this one is intentional).
- Normalize `AccountHeader`'s `h2` to the "Card/section title" role (`text-lg
font-semibold`). The `ProfilePage` / `ReportsPane` page `h1`s are **not** restyled
  inline here — their normalization is handled by adopting `PageHeader` in WS3 (avoids
  restyle-then-refactor churn on the same lines).

### WS2 — Color tokens

- `globals.css`: add to `:root` and `.dark`:
  - `--positive` (income/gain): light `152 60% 32%`, dark `152 55% 45%`
  - `--negative` (expense/loss): light `0 72% 45%`, dark `0 70% 58%`
  - `--warning`: light `38 92% 32%`, dark `38 92% 55%`
  - `--info`: light `217 91% 50%`, dark `217 91% 65%`
    (FINALIZED against WCAG AA text-on-background in both themes: light ratios
    positive 4.75:1, negative 5.81:1, warning 4.87:1, info 5.05:1; all dark ≥4.9:1.
    Light `--positive`/`--warning` were darkened from the draft to reach AA.)
- `tailwind.config.ts`: map `positive`, `negative`, `warning`, `info` colors.
- Swaps: reports `text-green-600`/`text-red-600` → `text-positive`/`text-negative`;
  transactions negative `text-destructive` → `text-negative`; `bg/text-emerald-600`
  (AllocationsEditor) → tokens; `TransactionStatusIcon` amber → `text-warning`;
  `transactionType` green/blue → `text-positive`/`text-info`; inline success
  `text-green-600` messages replaced by toasts (WS3).
- Reports charts consume `chart-1..5` tokens (income = positive, expense = negative).
- Replace off-scale bare `rounded` with `rounded-md` at the four cited sites.
- `labelColors.ts` categorical palette is preserved as a documented intentional exception.

### WS3 — Shared primitives

- **`ui/badge.tsx`** (shadcn Badge) with variants `default | secondary | outline |
positive | negative | muted`. Replace all hand-rolled chips. Radius is **fixed per
  variant** (`rounded-full` for count/status variants, `rounded-md` for token/label
  variants); one padding scale; `text-xs font-medium`.
- **Toasts** — add shadcn **sonner** (`ui/sonner.tsx` + `<Toaster />` in `main.tsx`).
  Replace the three duplicated fixed toast blocks and inline success text with
  `toast.success(...)` / `toast.error(...)`.
- **`components/EmptyState.tsx`** — icon (optional) + `text-sm text-muted-foreground`
  message + optional action; standard copy pattern **"No X yet."**
- **`components/PageContainer.tsx` + `components/PageHeader.tsx`** — one layout wrapper:
  `p-4 md:p-6`, `max-w-4xl mx-auto`, `PageHeader` renders the `h1` at scale with optional
  right-aligned actions slot. Applied to Profile, Reports, and a rebuilt `NotFoundPage`.

### WS4 — Adoption sweep

- Native `<select>` → shadcn `Select` in the 6 cited files; `SubtypeFields` date input →
  `DatePicker`.
- Reports raw `<section>` cards → shadcn `Card`/`CardHeader`/`CardTitle`/`CardContent`.
- `window.confirm` (TransactionsPane association removal) → `AlertDialog`.
- Badge/toast/EmptyState/PageContainer adoption across features.
- Icon normalization: default icon-button `h-9 w-9` with `h-4 w-4` glyph; compact
  table-row action `h-7 w-7` with `h-3.5 w-3.5`. Remove stray `h-10`/`h-5` overrides.
- Spacing normalization: cards `space-y-6`, form fields `space-y-4`, tight groups
  `space-y-2` — including skeleton wrappers. Pane sub-headers unify to `px-4 py-2.5`.

### WS5 — Error / loading conventions

- Errors: consistent `<Alert variant="destructive" role="alert">` (fixed attribute
  order), unified copy **"Couldn't load X."**, and a **Retry** action on every query
  error (add to profile panes).
- Loading: `Skeleton` everywhere; convert `RefundTransactionDialog` text-spinner to
  skeletons. In-button spinner (`SyncNowButton`) retained (appropriate for an in-place
  action — documented).

### WS6 — Tabs & navigation

- **Preserve the intentional two-tier system** in `ui/tabs.tsx`: `segmented` = primary
  tab bar, `underline` = nested/secondary. The genuine inconsistency is the Header
  top-nav, which is hand-rolled with a _different_ active token (`border-foreground`)
  than the component's `underline` variant (`border-primary`).
- Migrate the Header nav to use the same underline treatment + `border-primary` active
  token as the shared `underline` variant (reuse the component or match its classes),
  so header nav and nested underline tabs share one active-indicator token.
- **Profile top-level tabs stay `segmented`** (primary level); **Dictionaries sub-tabs
  stay `underline`** (nested level) — this is already correct and is left as-is.
- No new tab styles introduced; no flattening of the hierarchy cue.
- Profile remains reachable via the avatar `UserMenu` (documented intentional; not moved
  into top nav).

### WS7 — Dialog UX

- Restructure `ui/dialog.tsx` `DialogContent` into a flex column:
  `flex max-h-[85vh] flex-col` with `DialogHeader` (`shrink-0`), a new **`DialogBody`**
  (`flex-1 min-h-0 overflow-y-auto`), and `DialogFooter` (`shrink-0`, subtle top border).
  Only the body scrolls; title and actions stay pinned.
- Add width variants to `DialogContent` via a **`size` prop** (single mechanism, uniform
  call sites): `sm` = `max-w-lg` (default, unchanged for existing simple dialogs), `lg` =
  `max-w-2xl`. Transaction create/edit dialogs (`CreateExpenseDialog`,
  `CreateIncomeDialog`, `EditTransactionDialog`, and the transfer dialog) use `lg`.
- `IncomeExpenseForm` layout: pair short fields into a responsive
  `grid grid-cols-1 sm:grid-cols-2 gap-4` — (Account, Currency) and (Date, Contact) —
  with AllocationsEditor and Description/Labels spanning full width. Move the form's
  `DialogFooter` into the pinned footer region. Net effect: the form is short enough to
  fit large monitors with no scrollbar; when it must scroll (small viewport / many
  allocation rows), only the body scrolls.
- Migrate the other dialogs' internal footers to the pinned-footer structure as they are
  touched (no behavior change).

## 5. Rollout ordering (within the one branch)

1. **WS1 + WS2** — foundation (font, type scale, tokens). Mostly additive; CardTitle +
   money-color swaps may require test updates.
2. **WS3** — build primitives (Badge, sonner, EmptyState, PageContainer/Header).
3. **WS7** — dialog restructure + IncomeExpenseForm layout (self-contained, high user
   value).
4. **WS4 + WS5 + WS6** — the adoption sweep, error/loading, tabs. Largest diff; done last
   so it consumes the finished primitives/tokens.
5. **Verification** — see §7.

## 6. Non-goals / out of scope

- No information-architecture changes (routes, nav structure, feature set unchanged).
- No backend/API/DTO changes (`src/api/types.ts` untouched).
- No dark-mode overhaul beyond wiring the new tokens in both themes.
- Moving Profile into the top nav (kept in avatar menu).
- The categorical label palette (`labelColors.ts`) is intentionally left as-is.

## 7. Testing & verification

- The existing web unit suite (883 tests, MSW-backed) stays green. Tests asserting
  `text-destructive` on amounts are updated to `text-negative`; any test asserting the
  hand-rolled toast/badge/select DOM is updated to the new primitives.
- New primitives (`Badge`, `EmptyState`, `PageContainer`/`PageHeader`, `DialogBody`) get
  focused unit tests.
- Gate: `just check` (typecheck + lint + format-check) + `just test` + Playwright smoke.
- **Live verification** via Playwright against the running dev server: screenshot the
  transactions view, reports, profile, and the expense dialog (default + narrow viewport)
  to confirm the dialog no longer scrolls its header/footer and the type/color/tab
  changes render correctly in light and dark.

## 8. Risks & mitigations

- **Vendored `ui/` edits** (`card.tsx`, `dialog.tsx`, `tabs.tsx`): normally regenerated
  from shadcn. Mitigation — keep edits minimal and documented here; note them in a code
  comment so a future `shadcn add` doesn't silently clobber intent.
- **Money-color semantics change** (negatives red-token vs former `text-destructive`):
  visually near-identical but a distinct token; snapshot/class-assertion tests updated.
- **Font swap shifting layout/metrics**: Inter's metrics differ slightly from the system
  stack; verify no clipped/truncated UI in the Playwright pass.
- **Large diff**: mitigated by the workstream ordering and by leaning on new primitives so
  the sweep is mechanical.
