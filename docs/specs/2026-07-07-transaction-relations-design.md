---
status: draft
---

# Explicit transaction relations — link existing transactions (web + backend)

Tracker: homeaccounting/tracker#34
Depends on: homeaccounting/backend#88 (merged — typed transaction relationships),
homeaccounting/tracker#33 (merged — refund relation UX)

## Context

backend#88 established a typed relationship model
(`RelationKind = Refund | Merge | Split | Associated`) and tracker#33 shipped the
_at-creation_ path: while building a refund, the web app records a `Refund` edge
on the income-create request. But not every relationship is known at creation
time — users capture or import transactions independently and only later realise
two rows are connected:

- A refund was entered as a plain Income before the user thought to link it to
  the original purchase → they want to attach the `Refund` edge retroactively so
  reports net it and both rows show the linkage.
- A purchase and its separately-recorded delivery charge arrive as two
  transactions → an `Associated` edge groups them without merging (merging would
  destroy the distinct rows).

This feature is the **after-the-fact, user-driven** counterpart to tracker#33: a
**"Link…" context-menu action** on a transaction row that attaches a typed edge
between two transactions that **already exist** in the ledger, plus a
**per-row relation indicator** in the transactions list so linkages are visible
at a glance.

### What already exists (so we don't rebuild it)

**Backend (`../server-infra`):**

- `RelationKind = Refund | Merge | Split | Associated` — **`Associated` is
  already a defined kind** with unrestricted validation
  (`validateRelationTarget`, `Associated -> pure ()`,
  `Application/Services/TransactionService.hs:763`). No new kind is needed.
- `recordTransactionRelation :: UserId -> TransactionId -> TransactionId ->
RelationKind -> AppM (Either DomainError ())`
  (`TransactionService.hs:790`) already runs self-link, visibility, per-kind
  target, and depth-1 chain validation, then dispatches `AddTransactionRelation`
  on the `from` stream. It is **not exposed as a public endpoint** ("NOT a public
  endpoint — used by the future merge/split domain operations").
- Read side is complete: the **list endpoint batch-loads outbound relations per
  row** (`relationsFromMany`, `ReadModels/Transaction.hs:413`), so every row in
  `TransactionListResponse` already carries `relations`; and
  `GET /api/transactions/:id/relations → { outbound, inbound }`
  (`TransactionAPI.hs:196`).
- The `transaction_relations` table has a `UniqueTransactionRelation
transactionId relatedTransactionId relationKind` constraint
  (`ReadModels/Transaction.hs:231`) — exact duplicate edges are already rejected
  at the DB level.

**Web (`monorepo`):**

- DTOs already exist in `src/api/types.ts`: `RelationKind`,
  `TransactionRelation { relatedTransactionId, relationKind }`,
  `TransactionRelationsResponse { outbound, inbound }`, and
  `TransactionResponse.relations`.
- `useTransactionRelations` (GET `/:id/relations`), `useRefundSummary` (remaining
  refundable from prior refunds), `buildRefundIndex` (reverse index over the
  loaded window), and `RefundBadge` all ship from tracker#33.

### What is missing

1. **Backend:** a public endpoint to attach a relation to an already-posted
   transaction (a thin wrapper over `recordTransactionRelation`), plus stronger
   guards on the retroactive **Refund** path; **and** a remove path (new command
   - event + read-model apply + `DELETE` endpoint) — none exists today.
2. **Web:** the "Link…" context-menu action + link dialog, an `attachRelation`
   client method / `useAttachRelation` hook, a `detachRelation` /
   `useDetachRelation` unlink path, and a generalized per-row relation indicator
   (with an unlink affordance) in the transactions list.

**Out of scope (deferred):** `Merge`/`Split` linking (produced by dedicated flows
in tracker#30/#31); cross-window inbound coverage in the list indicator; grouping
3+ transactions under a single `Associated` chain.

## Design decisions (locked with the user)

1. **Cross-repo, one effort** — add the backend attach endpoint _and_ build the
   full web UX under this spec.
2. **Include unlink** — v1 supports detaching a user-created edge from either
   endpoint. This adds a new backend command + event + read-model apply and a
   `DELETE` endpoint, plus a web unlink affordance. **Only `Refund` and
   `Associated` edges are removable**; `Merge`/`Split` lineage edges stay
   read-only.
3. **Full guards on the endpoint** — the attach endpoint enforces the Refund
   guards server-side (see §Backend) so the API cannot be bypassed, not just the
   client.
4. **Store directional, present symmetric** — edges remain directional
   (`from → to`); the acting transaction is `from`. Association is presented
   symmetrically by merging inbound + outbound.
5. **No association _chains_ in v1** — the existing depth-1 guard
   (`CannotChainRelations`, `validateRelationTarget:764-765`) rejects linking
   _to_ a transaction that already declares an outbound edge of the same kind,
   i.e. it blocks chaining `A→B→C`. It does **not** block fan-out from one anchor
   (`A→B`, `A→C`), which is the natural, acceptable way to lightly group several
   transactions under one and is left allowed. Deep/arbitrary grouping graphs are
   a follow-up.

## Backend design (`../server-infra`)

### New route

`POST /api/transactions/{id}/relations`

- `{id}` is always the **owner / `from`** side of the edge.
- Request body: `{ relatedTransactionId :: UUID, relationKind :: Text }`
  (reuse the existing `TransactionRelation` shape / a small request record).
  **Wire encoding is pinned to the existing `renderRelationKind` /
  `parseRelationKind` tokens** (lowercase: `"refund" | "merge" | "split" |
"associated"`, `Domain/Core/Types.hs`), matching the web `RelationKind` union
  in `types.ts`. The endpoint accepts only `"refund"` and `"associated"` for now
  (merge/split are produced by dedicated flows) — reject others with a 422.
- Response: the updated **`TransactionResponse`** (200), consistent with the
  other transaction mutation handlers (`setDescription`, `setLabels`, …).
- Handler wraps `recordTransactionRelation user.userId (mkTransactionId id)
relatedTransactionId kind`, then returns the refreshed read-model row via
  `fromTransactionData`.

### Refund guards (new validation on this path)

The existing `validateRelationTarget` only checks the **target**: for `Refund`,
target must be an `Expense` and not `Cancelled`, plus depth-1. Two guards are
added for the retroactive Refund path, so the endpoint matches the invariants the
tracker#33 dialog enforced client-side:

- **Source must be an Income with contra allocations** — the `from` transaction
  must be an `Income` whose allocations include expense-bucket (contra) entries.
  New domain error, e.g. `RefundSourceMustBeIncomeWithContra`.
- **Cumulative over-refund cap** — the `from` income's contra total, plus the
  contra totals of every _other_ income already holding a `Refund` edge to the
  target expense (`reverseRelations target Refund`), must not exceed the target
  expense total. New domain error, e.g. `RefundExceedsRefundableAmount`.
  Note: `reverseRelations` for `Refund` **already excludes cancelled sources**
  (`ReadModels/Transaction.hs:~600`), so cancelled prior refunds do not count
  toward the cap — the cap test must assert the sum with cancelled refunds
  excluded.

These are layered into (or alongside) the refund case so both the create path
(tracker#33) and this attach path share the guard.

### Duplicate / reciprocal-edge guard (pre-dispatch)

The `UniqueTransactionRelation` DB constraint fires only on an _exact_ duplicate
`(from, to, kind)` and only at event-append time (persistence layer), which
races and surfaces as a raw error. To make it testable and to cover the
symmetric-association case, the service does a **pre-dispatch existence check**
before dispatching `AddTransactionRelation`:

- **Forward duplicate** (any kind): if `relationsFrom from` already contains
  `(to, kind)` → `RelationAlreadyExists`.
- **Reciprocal duplicate** (`Associated` only): because Association is presented
  symmetrically, also reject when the reverse edge `to → from (Associated)`
  already exists (`relationsFrom to` contains `(from, Associated)`), so we never
  store both `A→B` and `B→A` for the same pair.

The raw DB constraint remains as a last-resort backstop (also translated to
`RelationAlreadyExists`) in case of a race. `Associated` otherwise requires no
new _target_ validation.

### Unlink (remove edge) — new backend pipeline

No remove path exists today, so it is built mirroring the add pipeline
(`AddTransactionRelation` → `TransactionRelationAdded` →
`insertUnique TransactionRelationEntity`, read model `Transaction.hs:350`):

- **Command** `RemoveTransactionRelation { relatedTransactionId, relationKind }`
  in the aggregate command union, alongside `AddTransactionRelation`
  (`Domain/Transaction/Commands.hs`).
- **Event** `TransactionRelationRemoved { relatedTransactionId, relationKind }`
  (`Domain/Transaction/Events.hs`).
- **Command handler arm** (`Domain/Transaction/CommandHandler.hs`) mirrors the
  add arm: Completed-only, self-link rejected, emits `TransactionRelationRemoved`.
  Like the add arm it does **not** track a relation set in aggregate state, so it
  emits unconditionally; edge-existence is enforced at the service layer (below),
  and the read-model delete is a no-op if the row is already gone (idempotent).
- **Read-model apply**: `TransactionRelationRemovedEvent evt → deleteWhere
[TransactionRelationEntityTransactionId ==. txId,
TransactionRelationEntityRelatedTransactionId ==. evt.relatedTransactionId,
TransactionRelationEntityRelationKind ==. evt.relationKind]`.
- **Service** `removeTransactionRelation :: UserId -> TransactionId ->
TransactionId -> RelationKind -> AppM (Either DomainError ())`:
  1. Reject `Merge`/`Split` kinds up front → `CannotRemoveLineageRelation` (422)
     (also enforced by the endpoint accepting only `refund`/`associated` tokens).
  2. **Resolve direction** — the edge is stored `from → to`, but the user may
     unlink from either endpoint. Check `relationsFrom id` for `(related, kind)`
     and `relationsFrom related` for `(id, kind)`; the match determines the real
     `from` stream. If neither exists → `RelationNotFound` (404).
  3. Enforce caller visibility (`ensureCanAccessTransaction`) on the acting id.
  4. Dispatch `RemoveTransactionRelation` on the resolved `from` stream.

### New route (unlink)

`DELETE /api/transactions/{id}/relations?relatedTransactionId={uuid}&relationKind={token}`

- Query params (not a body — matches the existing `DeleteNoContent` cancel route
  style). `relationKind` restricted to `refund`/`associated`.
- Returns the updated **`TransactionResponse`** for `{id}` (200) so the client
  refreshes the acting row in one round-trip, consistent with attach.

### Error mapping

- Duplicate/reciprocal edge → `RelationAlreadyExists` (409/422) from the
  pre-dispatch check above; the raw `UniqueTransactionRelation` violation is also
  translated to the same error as a race backstop rather than a 500.
- New refund errors → 422 with a field/message the web layer can surface.
- Unlink of a non-existent edge → `RelationNotFound` (404); unlink of a
  `Merge`/`Split` edge → `CannotRemoveLineageRelation` (422).
- Self-link, not-found/visibility, wrong target kind, cancelled target, depth-1
  chain — already produced by `recordTransactionRelation`.

### Backend tests

- Attach `Refund` happy path (income-with-contra → expense) returns the updated
  response with the new outbound edge.
- Refund source-not-income and source-without-contra → `RefundSourceMustBe…`.
- Over-refund (single and cumulative across prior refund edges) →
  `RefundExceedsRefundableAmount`.
- Attach `Associated` happy path; self-link and depth-1 (chain) rejections.
- `RelationAlreadyExists` from the pre-dispatch check — forward duplicate (any
  kind) **and** reciprocal `Associated` duplicate (`A→B` then attempt `B→A`) —
  asserted distinctly from the raw DB-constraint backstop.
- Rejected `relationKind` tokens (e.g. `"merge"`, unknown) → 422.
- **Unlink** `Refund` and `Associated` happy paths — removed from **either**
  endpoint (`DELETE` on the `from` row _and_ on the `to` row both resolve and
  remove the same stored edge); the read model no longer returns the edge.
- Unlink non-existent edge → `RelationNotFound`; unlink `Merge`/`Split` →
  `CannotRemoveLineageRelation`; unlink is idempotent (second delete →
  `RelationNotFound`, not a 500).

## Web design (`monorepo`)

### API layer

- `src/api/transactions.ts`: add
  `attachRelation(id, body: AttachRelationRequest): Promise<TransactionResponse>`
  → `POST /api/transactions/{id}/relations`.
- `src/api/types.ts`: add `AttachRelationRequest = TransactionRelation` (or a
  named alias) — no new relation primitives needed. Cite backend `Web/Types.hs`
  in a comment per repo convention.
- New hook `useAttachRelation` that invalidates the transactions list query and
  `['transaction-relations', id]` on success.
- `detachRelation(id, { relatedTransactionId, relationKind }):
Promise<TransactionResponse>` → `DELETE /api/transactions/{id}/relations` with
  the pair + kind as query params. New hook `useDetachRelation` with the same
  invalidations (list + `['transaction-relations', id]`, and the counterpart's
  relations key).

### "Link…" flow

Context-menu action on a completed transaction row, **kind-adaptive** so `{id}`
stays the `from` side:

- **Income-with-contra** row → "Mark as refund of…" (Refund) **and**
  "Associate with…".
- Any other completed row → "Associate with…" only.

**Link dialog** (`LinkTransactionDialog`):

- Counterpart picker — a searchable selector over the existing transactions
  query, client-filtered by description/date, excluding the acting row.
- Kind-specific guards, enforced before submit:
  - **Refund**: counterpart must be a non-cancelled `Expense`; show a
    remaining-refundable hint by reusing `useRefundSummary`; block over-refund and
    duplicate/self edges client-side (backend re-checks).
  - **Association**: any distinct visible transaction; block self-link and
    block a counterpart already related to the acting row **in either direction**
    (symmetric) — the client checks the acting row's loaded outbound edges and
    `useTransactionRelations` inbound so it never offers a reciprocal duplicate;
    the backend re-checks.
- Submit calls `useAttachRelation`; surfaces backend `ApiError`
  (`RelationAlreadyExists`, `RefundExceeds…`, etc.) inline.

### List indicator

Generalize `RefundBadge` into a **relation indicator** rendered per row:

- Kind-distinguished (refund vs association — icon variant/tint), with the
  refund summary preserved ("refunded in full" / "partially refunded $X of $Y").
- Interactive: hover/click reveals the counterpart(s); if the counterpart is in
  the loaded window, scroll/jump to its row.
- **Fed by a reverse index built over the loaded window** from the outbound
  `relations` that already ride on each row — **no per-row fetch, no backend read
  change.** Extends `buildRefundIndex` into a generic relation index keyed by
  transaction id and kind.
- **Unlink affordance**: the counterpart popover exposes an "Unlink" action for
  `Refund`/`Associated` edges only (never `Merge`/`Split`), behind a lightweight
  confirm (removing a refund edge changes report netting). It calls
  `useDetachRelation` with the acting row id + counterpart + kind; the backend
  resolves the stored direction. A `RelationNotFound` (already removed elsewhere)
  is treated as success and just refreshes.

**Known limitation (accepted, matches tracker#33 behavior):** inbound edges
appear only when the counterpart is on the current page (e.g. a refunded expense
flags "refunded" only if its refunding income is loaded). Full cross-window
inbound would require a batched inbound query or a backend read change and is
**deferred**.

### Cancellation semantics

Cancellation is **not blocked** by relations (the cancel command handler checks
only amendment/already-cancelled state). The edge's fate on cancellation is
kind-specific and set by the backend read model — the web only reflects it:

- **Refund auto-orphans**: `relationsTo`/`reverseRelations` drop `Refund` edges
  whose source is cancelled (`Transaction.hs:600,610`). So a cancelled refund
  income makes the original expense stop showing "refunded" — no web work needed.
- **`Associated` survives cancellation**: outbound (`relationsFrom(Many)`, what
  list rows carry) is unfiltered and inbound keeps all non-`Refund` kinds, so a
  cancelled associated transaction keeps its edge on both rows. The indicator
  **stays visible and marks the counterpart as cancelled** (struck-through label /
  "(cancelled)") rather than hiding it, matching the stored backend state.
- **Attach/unlink are Completed-only** (inherited from the add arm,
  `CannotEditUncompletedTransaction`): you cannot attach or unlink _from_ a
  cancelled row, but unlink still works from the **live counterpart** (direction
  resolution finds the edge from either endpoint). If both endpoints are
  cancelled the edge is unremovable — accepted, as it is a no-accounting-effect
  grouping between two dead rows.

### Web tests

- Dialog: kind-adaptive menu (refund option only on income-with-contra), per-kind
  counterpart guards, over-refund block, duplicate/self block.
- MSW: `POST /:id/relations` handler for attach happy path + error surfaces;
  `DELETE /:id/relations` handler for unlink.
- Reverse-index/indicator: refund and association badges render from loaded-window
  outbound edges; counterpart reveal.
- Unlink affordance: shown only for refund/associated edges (hidden for
  merge/split); confirm → `useDetachRelation`; `RelationNotFound` treated as
  success.
- Cancelled counterpart: an association whose counterpart is cancelled still
  renders the indicator, marked "(cancelled)"; a cancelled refund income drops
  the "refunded" badge on the original (auto-orphan, backend-driven).

## Data flow (attach a retroactive refund)

1. User opens the context menu on an income-with-contra row → "Mark as refund
   of…".
2. Dialog loads candidate expenses; `useRefundSummary` shows remaining refundable
   per candidate. User picks the original expense.
3. Submit → `POST /api/transactions/{income}/relations`
   `{ relatedTransactionId: expenseId, relationKind: "refund" }`.
4. Backend validates (source income-with-contra, target expense/not-cancelled,
   cumulative cap, depth-1), dispatches `AddTransactionRelation`, returns the
   updated `TransactionResponse`.
5. Hook invalidates the list; the reverse index rebuilds. The income row shows
   "refund of …" directly from its own outbound edge; the expense row shows
   "refunded" only when the income is in the loaded window (per the accepted
   cross-window limitation above).

## Data flow (unlink)

1. User opens the counterpart popover on a related row and clicks "Unlink" →
   confirm.
2. `DELETE /api/transactions/{actingId}/relations?relatedTransactionId={other}
&relationKind={kind}`.
3. Backend rejects `merge`/`split`, resolves which endpoint stores the edge
   (`actingId → other` or `other → actingId`), enforces visibility, dispatches
   `RemoveTransactionRelation` on the resolved `from` stream, and returns the
   updated `TransactionResponse` for `{actingId}`.
4. `TransactionRelationRemoved` → read-model `deleteWhere` drops the row.
5. Hook invalidates the list + relations keys; the reverse index rebuilds and the
   indicator disappears from both rows (subject to the same loaded-window caveat).

## Isolation / boundaries

- **Backend** adds one attach handler + one delete handler, the refund/duplicate
  validation predicates, and **one new command + event + read-model apply**
  (`RemoveTransactionRelation` / `TransactionRelationRemoved`) mirroring the
  existing add pipeline; no new aggregates or read-model columns.
- **Web** adds two client methods (`attachRelation`/`detachRelation`), two hooks,
  one dialog, and generalizes one badge + one index helper (adding an unlink
  affordance). The list pane consumes the generalized index the same way it
  consumes `buildRefundIndex` today.
