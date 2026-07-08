# Explicit Transaction Relations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users link two already-existing transactions (retroactive `Refund` or `Associated`) from the transactions list, unlink them, and see relations flagged per row.

**Architecture:** Backend adds a public `POST /:id/relations` (wrapping the existing internal `recordTransactionRelation`, hardened with refund guards + a duplicate/reciprocal pre-check) and a brand-new unlink pipeline (`RemoveTransactionRelation` command → `TransactionRelationRemoved` event → read-model delete → `DELETE /:id/relations`). Web adds `attachRelation`/`detachRelation` client methods + hooks, a `LinkTransactionDialog`, and generalizes the shipped refund badge/index into a kind-aware relation indicator with an unlink affordance.

**Tech Stack:** Backend — Haskell, event-sourced aggregate + Persistent read model, Servant, Hspec. Web — React 18 + TypeScript, TanStack Query, react-hook-form + Zod, shadcn/ui, Vitest + Testing Library + MSW.

**Spec:** `docs/specs/2026-07-07-transaction-relations-design.md` (approved).

---

## Repositories & Branches

This is a **two-repo** effort. Commit backend tasks in one repo, web tasks in the other.

- **Backend:** `/Users/oleksandrsy/Projects/Current/Wix/server-infra` — create branch `feat/transaction-relations` before Task B1.
- **Web:** `/Users/oleksandrsy/Projects/Current/Wix/monorepo` — already on `feat/transaction-relations` (this plan lives here).

Backend must land (or at least be contract-stable) before web tasks W2/W3/W6/W7 can integration-test against it, but web unit tests use MSW and do not require a running backend. Recommended order: **B1–B4, then W1–W7.**

### Wire contract (both repos must agree)

- `POST /api/transactions/{id}/relations` — body `{ relatedTransactionId: UUID, relationKind: "refund"|"associated" }`, returns the updated `TransactionResponse` (200). `{id}` is the owner (`from`).
- `DELETE /api/transactions/{id}/relations?relatedTransactionId={uuid}&relationKind={token}` — returns the updated `TransactionResponse` for `{id}` (200).
- `relationKind` wire tokens are lowercase (`renderRelationKind`/`parseRelationKind`); only `refund`/`associated` accepted (others → 422).

### Commands

- **Backend** (`cd /Users/oleksandrsy/Projects/Current/Wix/server-infra`, inside `nix develop`):
  - Build: `cabal build all -fci`
  - Test all: `cabal test all -fci --test-show-details=direct --enable-tests`
  - Filter: `cabal test all -fci --test-option='--match' --test-option="/PATTERN/"`
  - Run `hpack` if `package.yaml` changed.
- **Web** (`cd /Users/oleksandrsy/Projects/Current/Wix/monorepo`, inside `nix develop`):
  - Typecheck: `pnpm exec tsc --noEmit` · Lint: `pnpm exec eslint .` · Format: `pnpm exec prettier --write .`
  - Test all: `pnpm exec vitest run` · By name: `pnpm exec vitest run -t "NAME"` · By path: `pnpm exec vitest run src/features/transactions`

---

## File Structure

**Backend (server-infra):**

- Modify `src/Domain/Transaction/Commands.hs` — add `RemoveTransactionRelation` command.
- Modify `src/Domain/Transaction/Events.hs` — add `TransactionRelationRemoved` event.
- Modify `src/Domain/Transaction/CommandHandler.hs` — remove-arm (reuses existing `TransactionError` constructors).
- Modify `src/Domain/Core/Errors.hs` — new service-layer `DomainError` constructors (attach guards + unlink errors).
- Modify `src/Application/ReadModels/Transaction.hs` — delete apply case for the remove event.
- Modify `src/Application/Services/TransactionService.hs` — attach guards + duplicate/reciprocal pre-check; `removeTransactionRelation`; error translation.
- Modify `src/Web/API/TransactionAPI.hs` — `POST`/`DELETE` routes + handlers + server wiring.
- Modify `src/Web/Types.hs` — reuse `TransactionRelation`; no new response type needed.
- Test: extend `test/Integration/TransactionRelationsIntegrationSpec.hs`.

**Web (monorepo):**

- Modify `src/api/types.ts` — `AttachRelationRequest`.
- Modify `src/api/transactions.ts` — `attachRelation`, `detachRelation`.
- Create `src/features/transactions/useAttachRelation.ts`, `useDetachRelation.ts`.
- Create `src/features/transactions/relationIndex.ts` (generalizes `refundIndex.ts`).
- Create `src/features/transactions/RelationBadge.tsx` (generalizes `RefundBadge.tsx`) OR extend in place.
- Create `src/features/transactions/LinkTransactionDialog.tsx`.
- Modify `src/features/transactions/TransactionsPane.tsx` — context action, badges, unlink, cancelled marking.
- Tests: co-located `*.test.ts(x)`; MSW handlers in `src/test/handlers.ts`.

---

# BACKEND (server-infra)

- [ ] **Task B0: Create backend branch**

```bash
cd /Users/oleksandrsy/Projects/Current/Wix/server-infra
git checkout -b feat/transaction-relations
git status   # expect: on feat/transaction-relations, clean
```

---

## Task B1: Attach — refund source guard, cumulative cap, duplicate/reciprocal pre-check

Harden the service path so the new endpoint cannot be bypassed. `recordTransactionRelation` (`TransactionService.hs:790`) and `validateRelationTarget` (`:752`) already handle target rules + depth-1; we add the _source_ guards and the pre-dispatch existence check.

**Files:**

- Modify: `src/Application/Services/TransactionService.hs`
- Modify: `src/Domain/Core/Errors.hs` — `DomainError` sum type is at `:42`; refund/relation constructors are at `:181–189` (`RefundTargetMustBeExpense`, `CannotRefundCancelledTransaction`, `CannotRelateTransactionToItself`, `CannotChainRelations`) with display strings at `:319–322`.
- Test: `test/Integration/TransactionRelationsIntegrationSpec.hs`

- [ ] **Step 1: Add the three new `DomainError` constructors**

In `src/Domain/Core/Errors.hs`, add `RefundSourceMustBeIncomeWithContra`, `RefundExceedsRefundableAmount`, and `RelationAlreadyExists` to the `DomainError` sum type next to `CannotChainRelations` (`:189`), add matching display strings near `:322`, and add them to the module export list. These are thrown at the **service layer** (via `throwE` before dispatch), so they belong in `DomainError` — not `TransactionError`.

- [ ] **Step 2: Write failing integration tests**

Add to `test/Integration/TransactionRelationsIntegrationSpec.hs`, following the existing `postExpense`/`postContraRefund`/`setupFixture` helpers (lines 98–160). Use the _service_ function `recordTransactionRelation` directly (the endpoint comes in B2) so this task is endpoint-independent:

```haskell
attachGuardSpec :: Spec
attachGuardSpec = describe "attach relation guards" $ do
  it "rejects a Refund whose source is not an income-with-contra" $ do
    env <- createTestAppEnvWithProcessManager
    fx  <- setupFixture env "attach-src-notincome@test.com"
    purchaseId <- postExpense env fx 100
    plainId    <- postExpense env fx 50           -- not an income-with-contra
    res <- runAppM env (recordTransactionRelation fx.userId plainId purchaseId Refund)
    res `shouldBe` Left RefundSourceMustBeIncomeWithContra

  it "rejects a Refund that exceeds the remaining refundable amount" $ do
    env <- createTestAppEnvWithProcessManager
    fx  <- setupFixture env "attach-overrefund@test.com"
    purchaseId <- postExpense env fx 100
    incomeId   <- postContraRefundNoRelation env fx 150   -- contra total 150 > 100
    res <- runAppM env (recordTransactionRelation fx.userId incomeId purchaseId Refund)
    res `shouldBe` Left RefundExceedsRefundableAmount

  it "rejects a duplicate forward edge" $ do
    env <- createTestAppEnvWithProcessManager
    fx  <- setupFixture env "attach-dup@test.com"
    purchaseId <- postExpense env fx 100
    incomeId   <- postContraRefundNoRelation env fx 40
    _   <- runAppM env (recordTransactionRelation fx.userId incomeId purchaseId Refund)
    res <- runAppM env (recordTransactionRelation fx.userId incomeId purchaseId Refund)
    res `shouldBe` Left RelationAlreadyExists

  it "rejects a reciprocal Associated edge (B->A when A->B exists)" $ do
    env <- createTestAppEnvWithProcessManager
    fx  <- setupFixture env "attach-recip@test.com"
    a <- postExpense env fx 10
    b <- postExpense env fx 20
    _   <- runAppM env (recordTransactionRelation fx.userId a b Associated)
    res <- runAppM env (recordTransactionRelation fx.userId b a Associated)
    res `shouldBe` Left RelationAlreadyExists
```

**Required helper:** the over-refund and duplicate tests depend on `postContraRefundNoRelation` (an income with an expense-bucket/contra allocation of the given total but **no** `relation` in the create body). Add it now by copying `postContraRefund` (`:138`) and dropping the `relation` field — Step 2 will not compile without it.

- [ ] **Step 3: Run tests — expect FAIL (compile error: constructors/helper missing, then assertion failures)**

Run: `cabal test all -fci --test-option='--match' --test-option="/attach relation guards/"`

- [ ] **Step 4: Implement the guards in `recordTransactionRelation`**

Background (verified): `TransactionData` has **no** `allocations` field — the categorised allocations are carried inside `transactionType` and read via `allocationsOf :: TransactionType -> Maybe Allocations` (exported from `ReadModels/Transaction.hs`, used at `:543`). For an **Income**, the _contra_ bucket is `Allocations.expenses`. `Allocation.amount :: Money`; `unMoney :: Money -> Rational` (`Domain/Core/Types.hs:248`). An expense's total is `unMoney target.sourceAmount`. `ensureCanAccessTransaction userId txId :: AppM (Either DomainError TransactionData)`.

Add these pure helpers (top-level in `TransactionService.hs`):

```haskell
contraTotal :: TransactionData -> Rational
contraTotal td = case allocationsOf td.transactionType of
  Just a  -> sum [ unMoney al.amount | al <- a.expenses ]
  Nothing -> 0

isIncomeWithContra :: TransactionData -> Bool
isIncomeWithContra td = case td.transactionType of
  Income _ -> not (null (maybe [] (.expenses) (allocationsOf td.transactionType)))
  _        -> False
```

Then, in `recordTransactionRelation`, after the existing `validateRelationTarget` call and before `runTransactionCmd`, add the source/cap guard (Refund only) and the duplicate/reciprocal pre-check:

```haskell
ExceptT (validateRefundSourceAndCap userId fromId toId kind)
ExceptT (validateNoExistingEdge fromId toId kind)

validateRefundSourceAndCap :: UserId -> TransactionId -> TransactionId -> RelationKind -> AppM (Either DomainError ())
validateRefundSourceAndCap userId fromId toId Refund = runExceptT $ do
  src    <- ExceptT (ensureCanAccessTransaction userId fromId)
  unless (isIncomeWithContra src) $ throwE RefundSourceMustBeIncomeWithContra
  target <- ExceptT (ensureCanAccessTransaction userId toId)   -- already Expense/not-cancelled per validateRelationTarget
  priorIds <- lift (runDb (ReadModel.reverseRelations toId Refund))  -- cancelled sources already excluded (Transaction.hs:600)
  priors   <- lift (traverse contraOfId priorIds)
  when (contraTotal src + sum priors > unMoney target.sourceAmount) $
    throwE RefundExceedsRefundableAmount
  where
    contraOfId tid = either (const 0) (contraTotal . snd) <$> getTransaction (unTransactionId tid)
validateRefundSourceAndCap _ _ _ _ = pure (Right ())   -- Associated: no source/cap guard

validateNoExistingEdge :: TransactionId -> TransactionId -> RelationKind -> AppM (Either DomainError ())
validateNoExistingEdge fromId toId kind = runExceptT $ do
  fwd <- lift (getOutboundRelations fromId)
  when (any (== (toId, kind)) fwd) $ throwE RelationAlreadyExists
  when (kind == Associated) $ do
    rev <- lift (getOutboundRelations toId)
    when (any (== (fromId, Associated)) rev) $ throwE RelationAlreadyExists
```

Use `getOutboundRelations` (the `AppM` service wrapper at `:768`), not `relationsFrom` (the raw `SqlPersistT` query), inside service code. Confirm `getTransaction` is in scope (defined in the same module).

- [ ] **Step 5: Run tests — expect PASS**

Run: `cabal test all -fci --test-option='--match' --test-option="/attach relation guards/"`

- [ ] **Step 6: Commit**

```bash
cd /Users/oleksandrsy/Projects/Current/Wix/server-infra
git add -A && git commit -m "feat(transactions): refund source/cap guards + duplicate-edge pre-check (tracker#34)"
```

---

## Task B2: Attach — `POST /api/transactions/{id}/relations` endpoint

**Files:**

- Modify: `src/Web/API/TransactionAPI.hs` (route ~202, handler after `relationsHandler` :459, wiring :225–239)
- Test: `test/Integration/TransactionRelationsIntegrationSpec.hs` (or the HTTP-level spec if one exists — grep `test/` for `hspec-wai`/`withApplication`).

- [ ] **Step 1: Write a failing endpoint test**

Add a test that drives the Servant handler (match the repo's HTTP test style; if only service-level tests exist, test `attachRelationHandler` directly by constructing an `AuthenticatedUser`). Assert: attaching `associated` between two expenses returns a `TransactionResponse` whose `relations` now contains the edge; an unknown/`merge` token yields a 422 (`parseRelationKind` rejects / kind not in allowlist).

- [ ] **Step 2: Run — expect FAIL (handler/route not defined)**

Run: `cabal test all -fci --test-option='--match' --test-option="/attach relation endpoint/"`

- [ ] **Step 3: Add the route** after the GET relations route (`TransactionAPI.hs:202`)

```haskell
:<|> AuthProtect "jwt"
  :> "api" :> "transactions"
  :> Capture "id" UUID
  :> "relations"
  :> ReqBody '[JSON] TransactionRelation
  :> Post '[JSON] TransactionResponse
```

- [ ] **Step 4: Add the handler** (after `relationsHandler`, ~:459)

```haskell
attachRelationHandler :: AuthenticatedUser -> UUID -> TransactionRelation -> AppM TransactionResponse
attachRelationHandler user rawId req = do
  txId  <- validateField "id" (mkTransactionId rawId)
  relId <- validateField "relatedTransactionId" (mkTransactionId req.relatedTransactionId)
  kind  <- requireLinkableKind req.relationKind          -- refund|associated only, else 422
  result <- TransactionService.recordTransactionRelation user.userId txId relId kind
  case result of
    Right () -> do
      refreshed <- TransactionService.getTransaction (unTransactionId txId)
      case refreshed of
        Right (tid, td) -> pure (fromTransactionData tid td)
        Left err        -> throwDomainError err
    Left err -> throwDomainError err
```

Add `requireLinkableKind :: Text -> AppM RelationKind` that uses `parseRelationKind` and rejects anything other than `Refund`/`Associated` with a 422 validation error (reuse the `validateField`/`mkValidationError` pattern already in the module).

- [ ] **Step 5: Wire the handler** into `transactionServer` (`:225–239`) in the same position as the route (right after `relationsHandler`, before `getTransactionHandler`). **Order of routes and handlers must match.**

- [ ] **Step 6: Run — expect PASS**; then full build `cabal build all -fci`.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(transactions): POST /:id/relations attach endpoint (tracker#34)"
```

---

## Task B3: Unlink — command, event, handler arm, read-model delete, service

Driven by one service-level integration test; implements the full new pipeline.

**Files:**

- Modify: `src/Domain/Transaction/Commands.hs` (record :~402, TH list :58–73, deriveJSON :421, exports)
- Modify: `src/Domain/Transaction/Events.hs` (record :~313, TH list :61–76, deriveJSON :351, exports)
- Modify: `src/Domain/Transaction/CommandHandler.hs` (add the remove arm after :440 — it reuses existing `RelationSelfLink` and `CannotEditUncompletedTransaction`; **no new `TransactionError` constructors needed**)
- Modify: `src/Domain/Core/Errors.hs` — add `RelationNotFound`, `CannotRemoveLineageRelation` to `DomainError` (they are thrown at the service layer via `throwE`, like B1's errors)
- Modify: `src/Application/ReadModels/Transaction.hs` (apply case after :351)
- Modify: `src/Application/Services/TransactionService.hs` (`removeTransactionRelation`; translation :1007–1047)
- Test: `test/Integration/TransactionRelationsIntegrationSpec.hs`

- [ ] **Step 1: Write failing integration tests**

```haskell
unlinkSpec :: Spec
unlinkSpec = describe "unlink relation" $ do
  it "removes an Associated edge from either endpoint" $ do
    env <- createTestAppEnvWithProcessManager
    fx  <- setupFixture env "unlink-assoc@test.com"
    a <- postExpense env fx 10
    b <- postExpense env fx 20
    _ <- runAppM env (recordTransactionRelation fx.userId a b Associated)
    -- unlink initiated from the *to* side (b); direction resolution finds a->b
    res <- runAppM env (removeTransactionRelation fx.userId b a Associated)
    res `shouldBe` Right ()
    fwd <- runAppM env (getOutboundRelations a)
    fwd `shouldBe` []

  it "returns RelationNotFound when no edge exists" $ do
    env <- createTestAppEnvWithProcessManager
    fx  <- setupFixture env "unlink-missing@test.com"
    a <- postExpense env fx 10
    b <- postExpense env fx 20
    res <- runAppM env (removeTransactionRelation fx.userId a b Associated)
    res `shouldBe` Left RelationNotFound

  it "is idempotent: second unlink is RelationNotFound, not a crash" $ do
    env <- createTestAppEnvWithProcessManager
    fx  <- setupFixture env "unlink-idem@test.com"
    a <- postExpense env fx 10
    b <- postExpense env fx 20
    _  <- runAppM env (recordTransactionRelation fx.userId a b Associated)
    _  <- runAppM env (removeTransactionRelation fx.userId a b Associated)
    r2 <- runAppM env (removeTransactionRelation fx.userId a b Associated)
    r2 `shouldBe` Left RelationNotFound

  it "refuses to remove Merge/Split lineage edges" $ do
    env <- createTestAppEnvWithProcessManager
    fx  <- setupFixture env "unlink-lineage@test.com"
    a <- postExpense env fx 10
    b <- postExpense env fx 20
    _  <- runAppM env (recordTransactionRelation fx.userId a b Merge)   -- internal hook
    res <- runAppM env (removeTransactionRelation fx.userId a b Merge)
    res `shouldBe` Left CannotRemoveLineageRelation
```

- [ ] **Step 2: Run — expect FAIL (compile errors: `removeTransactionRelation`, `RemoveTransactionRelation`, errors missing)**

Run: `cabal test all -fci --test-option='--match' --test-option="/unlink relation/"`

- [ ] **Step 3: Add the command** (`Commands.hs`, mirror `AddTransactionRelation` :397)

```haskell
data RemoveTransactionRelation = RemoveTransactionRelation
  { transactionId :: TransactionId,
    relatedTransactionId :: TransactionId,
    relationKind :: RelationKind
  }
  deriving (Show, Eq)
```

Add `''RemoveTransactionRelation` to `transactionCommands`, `deriveJSON defaultOptions ''RemoveTransactionRelation`, and export.

- [ ] **Step 4: Add the event** (`Events.hs`, mirror `TransactionRelationAdded` :307)

```haskell
data TransactionRelationRemoved = TransactionRelationRemoved
  { relatedTransactionId :: TransactionId,
    relationKind :: RelationKind
  }
  deriving (Show, Eq)
```

Add to `transactionEvents`, `deriveJSON`, and export.

- [ ] **Step 5: Add the handler arm** (`CommandHandler.hs` after :440). No new `TransactionError` constructors — the arm only emits the event or reuses existing `RelationSelfLink` / `CannotEditUncompletedTransaction`. Add `RelationNotFound` and `CannotRemoveLineageRelation` to `DomainError` (`Errors.hs`, next to B1's new errors) — they are thrown by the service in Step 7, never by the aggregate.

```haskell
handleTransactionCommand transaction (RemoveTransactionRelationTransactionCommand RemoveTransactionRelation {..})
  | unTransactionId transactionId == unTransactionId relatedTransactionId = Left RelationSelfLink
  | otherwise = case transaction ^. #status of
      Completed ->
        Right
          [ TransactionRelationRemovedTransactionEvent
              TransactionRelationRemoved
                { relatedTransactionId = relatedTransactionId,
                  relationKind = relationKind
                }
          ]
      _ -> Left CannotEditUncompletedTransaction
```

(The aggregate emits unconditionally — existence is enforced in the service in Step 7; the read-model delete is a no-op if the row is gone. `RelationNotFound`/`CannotRemoveLineageRelation` are `DomainError`s added above, not `TransactionError`s.)

- [ ] **Step 6: Add read-model delete apply** (`Transaction.hs` after :351)

```haskell
TransactionRelationRemovedEvent evt ->
  deleteWhere
    [ TransactionRelationEntityTransactionId ==. txId,
      TransactionRelationEntityRelatedTransactionId ==. evt.relatedTransactionId,
      TransactionRelationEntityRelationKind ==. evt.relationKind
    ]
```

(`deleteWhere` is already imported per the read-model module.)

- [ ] **Step 7: Add `removeTransactionRelation` service** (`TransactionService.hs` after :806)

```haskell
removeTransactionRelation :: UserId -> TransactionId -> TransactionId -> RelationKind -> AppM (Either DomainError ())
removeTransactionRelation userId actingId otherId kind = runExceptT $ do
  when (kind == Merge || kind == Split) $ throwE CannotRemoveLineageRelation
  _ <- ExceptT (ensureCanAccessTransaction userId actingId)
  -- resolve which endpoint stores the edge (acting->other or other->acting)
  fwd <- lift (getOutboundRelations actingId)
  rev <- lift (getOutboundRelations otherId)
  fromId <- if any (== (otherId, kind)) fwd then pure actingId
            else if any (== (actingId, kind)) rev then pure otherId
            else throwE RelationNotFound
  let toId = if fromId == actingId then otherId else actingId
  runTransactionCmd translateTransactionError id (unTransactionId fromId)
    (RemoveTransactionRelationTransactionCommand (RemoveTransactionRelation fromId toId kind))
```

`RelationNotFound`/`CannotRemoveLineageRelation` are thrown directly as `DomainError` via `throwE` (they never pass through the aggregate), so they need **no** `translateTransactionError` entry. Only add a `translateTransactionError` mapping if the remove arm surfaces a new `CommandRejected` case — it does not (it reuses `RelationSelfLink`/`CannotEditUncompletedTransaction`, already mapped).

- [ ] **Step 8: Run — expect PASS**; then `cabal build all -fci`.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat(transactions): RemoveTransactionRelation pipeline (command/event/read-model/service) (tracker#34)"
```

---

## Task B4: Unlink — `DELETE /api/transactions/{id}/relations` endpoint

**Files:**

- Modify: `src/Web/API/TransactionAPI.hs`
- Test: `test/Integration/TransactionRelationsIntegrationSpec.hs`

- [ ] **Step 1: Write a failing endpoint test** — attach an `associated` edge, call the delete handler with `relatedTransactionId` + `relationKind=associated`, assert the returned `TransactionResponse.relations` no longer contains it; `relationKind=merge` → 422; unknown pair → maps `RelationNotFound` (404).

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Add the route** (after the POST relations route)

```haskell
:<|> AuthProtect "jwt"
  :> "api" :> "transactions"
  :> Capture "id" UUID
  :> "relations"
  :> QueryParam "relatedTransactionId" UUID
  :> QueryParam "relationKind" Text
  :> Delete '[JSON] TransactionResponse
```

**Intentional divergence:** the existing cancel route uses `DeleteNoContent` (`:214`), but this one returns `Delete '[JSON] TransactionResponse` so the client gets the refreshed row in one round-trip (mirrors the attach endpoint, per spec). Do not "fix" it to `DeleteNoContent`.

- [ ] **Step 4: Add the handler**

```haskell
removeRelationHandler :: AuthenticatedUser -> UUID -> Maybe UUID -> Maybe Text -> AppM TransactionResponse
removeRelationHandler user rawId mRel mKind = do
  txId  <- validateField "id" (mkTransactionId rawId)
  relId <- maybe (missing "relatedTransactionId") (validateField "relatedTransactionId" . mkTransactionId) mRel
  kind  <- maybe (missing "relationKind") requireLinkableKind mKind
  result <- TransactionService.removeTransactionRelation user.userId txId relId kind
  case result of
    Right () -> do
      refreshed <- TransactionService.getTransaction (unTransactionId txId)
      either throwDomainError (\(tid, td) -> pure (fromTransactionData tid td)) refreshed
    Left err -> throwDomainError err
```

Reuse `requireLinkableKind` from B2; `missing` is a small helper throwing a required-field validation error (or reuse the existing pattern).

- [ ] **Step 5: Wire the handler** into `transactionServer` in the matching position.

- [ ] **Step 6: Run — expect PASS**; `cabal build all -fci`; run the full relations spec `--test-option="/relation/"`.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(transactions): DELETE /:id/relations unlink endpoint (tracker#34)"
```

---

# WEB (monorepo)

All web tasks are committed in `/Users/oleksandrsy/Projects/Current/Wix/monorepo` on `feat/transaction-relations`.

## Task W1: DTOs

**Files:** Modify `src/api/types.ts` (relation types ~216–230).

- [ ] **Step 1: Add the request type** (no test — pure type; verified by W2). Place near `TransactionRelation`, with a comment citing the backend source per repo convention:

```typescript
// Mirrors POST /api/transactions/:id/relations body (backend Web/Types.hs TransactionRelation).
export type AttachRelationRequest = TransactionRelation;
```

- [ ] **Step 2: Typecheck** — `pnpm exec tsc --noEmit` (expect PASS).

- [ ] **Step 3: Commit** — `git add -A && git commit -m "feat(transactions): AttachRelationRequest DTO (tracker#34)"`

---

## Task W2: API client methods + `useAttachRelation`

**Files:**

- Modify `src/api/transactions.ts` (after `createIncome` / near `setLabels` :47 and `cancel` :56).
- Create `src/features/transactions/useAttachRelation.ts` (template: `useRefundTransaction.ts`).
- Test: `src/features/transactions/useAttachRelation.test.tsx` (template: `useRefundTransaction.test.tsx`).

- [ ] **Step 1: Write failing hook test**

```tsx
it('POSTs to /api/transactions/:id/relations with the relation body', async () => {
  let captured: unknown;
  server.use(
    http.post(`${apiBase}/api/transactions/tx-income/relations`, async ({ request }) => {
      captured = await request.json();
      return HttpResponse.json({
        id: 'tx-income',
        relations: [{ relatedTransactionId: 'tx-exp', relationKind: 'refund' }] /* ...rest */,
      });
    }),
  );
  const { result } = renderHook(() => useAttachRelation('tx-income'), { wrapper: makeWrapper() });
  await result.current.mutateAsync({ relatedTransactionId: 'tx-exp', relationKind: 'refund' });
  expect(captured).toEqual({ relatedTransactionId: 'tx-exp', relationKind: 'refund' });
});

it('invalidates transactions + relations queries on success', async () => {
  server.use(
    http.post(`${apiBase}/api/transactions/tx-income/relations`, () =>
      HttpResponse.json({ id: 'tx-income', relations: [] /* ... */ }),
    ),
  );
  const client = new QueryClient();
  const spy = vi.spyOn(client, 'invalidateQueries');
  const { result } = renderHook(() => useAttachRelation('tx-income'), {
    wrapper: makeWrapper(client),
  });
  await result.current.mutateAsync({ relatedTransactionId: 'tx-exp', relationKind: 'refund' });
  expect(spy).toHaveBeenCalledWith({ queryKey: ['transactions'] });
  expect(spy).toHaveBeenCalledWith({ queryKey: ['transaction-relations', 'tx-income'] });
});
```

Copy `makeWrapper` from `useRefundTransaction.test.tsx` (:13–27).

- [ ] **Step 2: Run — expect FAIL** — `pnpm exec vitest run src/features/transactions/useAttachRelation.test.tsx`

- [ ] **Step 3: Add the client method** (`transactions.ts`), matching the `client.post`/`URLSearchParams` style already in the module:

```typescript
attachRelation: (id: UUID, body: AttachRelationRequest): Promise<TransactionResponse> =>
  client.post<TransactionResponse>(`/api/transactions/${id}/relations`, body),
```

- [ ] **Step 4: Create the hook** `useAttachRelation.ts` (mirror `useRefundTransaction.ts`), invalidating `['transactions']` and `['transaction-relations', id]`.

**Key note:** `useRefundTransaction` invalidates the _account-scoped_ key `['transactions', accountId]` because it knows the account. `useAttachRelation(id)` does **not** receive an account id, so it invalidates the **prefix** `['transactions']` — TanStack Query partial-matches by prefix, so every `['transactions', accountId]` list refreshes. This is why the test asserts `{ queryKey: ['transactions'] }` (not an account-scoped key). Attaching a relation does not move balances, so `['accounts']` invalidation is not required.

- [ ] **Step 5: Run — expect PASS.** Then `pnpm exec tsc --noEmit`.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(transactions): attachRelation client + useAttachRelation hook (tracker#34)"`

---

## Task W3: `detachRelation` client method + `useDetachRelation`

**Files:**

- Modify `src/api/transactions.ts`.
- Create `src/features/transactions/useDetachRelation.ts`.
- Test: `src/features/transactions/useDetachRelation.test.tsx`.

- [ ] **Step 1: Write failing hook test** — assert a `DELETE` to `/api/transactions/tx-a/relations?relatedTransactionId=tx-b&relationKind=associated`, and that the hook treats a `RelationNotFound` `ApiError` as success (resolves, still invalidates). Use MSW `http.delete`.

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Add the client method**, building the query string like `list()` does:

```typescript
detachRelation: (id: UUID, params: { relatedTransactionId: UUID; relationKind: RelationKind }): Promise<TransactionResponse> => {
  const qs = new URLSearchParams({ relatedTransactionId: params.relatedTransactionId, relationKind: params.relationKind });
  return client.delete<TransactionResponse>(`/api/transactions/${id}/relations?${qs.toString()}`);
},
```

Confirm `client.delete<T>` returns the parsed body (the client "treats any empty body as void" — a `TransactionResponse` body is returned as `T`). If `cancel` uses a `void` delete, ensure the generic form is used here.

- [ ] **Step 4: Create the hook** `useDetachRelation.ts` — mutation; in `mutationFn` catch `ApiError` with `code === 'RelationNotFound'` and resolve; `onSuccess`/`onSettled` invalidate `['transactions']`, `['transaction-relations', id]`, and the counterpart's relations key.

- [ ] **Step 5: Run — expect PASS.** Then `pnpm exec tsc --noEmit`.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(transactions): detachRelation client + useDetachRelation hook (tracker#34)"`

---

## Task W4: Generalize the reverse index (`relationIndex.ts`)

**Files:**

- Create `src/features/transactions/relationIndex.ts` (generalizes `refundIndex.ts`).
- Test: `src/features/transactions/relationIndex.test.ts`.

- [ ] **Step 1: Write failing unit tests** for a pure `buildRelationIndex(transactions, kind)`:
  - Given two income rows each with a `refund` edge to the same expense id, the index maps that expense id → `{ count: 2, total: sumOfTheirTotals }`.
  - Given `associated` edges, filtering by `'associated'` returns association stats and ignores `refund` edges.
  - `buildRefundIndex` (kept as a thin wrapper `buildRelationIndex(txns, 'refund')`) still returns the same shape as today (guard against regressions in `RefundBadge`/`TransactionsPane`).

- [ ] **Step 2: Run — expect FAIL** — `pnpm exec vitest run src/features/transactions/relationIndex.test.ts`

- [ ] **Step 3: Implement** — copy `refundIndex.ts`, replace the hardcoded `if (rel.relationKind !== 'refund')` (`:24`) with the `kind` parameter; export `buildRelationIndex`. Re-export `buildRefundIndex = (txns) => buildRelationIndex(txns, 'refund')` from `refundIndex.ts` (or move callers to the new module) so existing imports keep working.

- [ ] **Step 4: Run — expect PASS.** `pnpm exec tsc --noEmit`.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(transactions): generalize refund index into buildRelationIndex (tracker#34)"`

---

## Task W5: Generalize the badge (`RelationBadge`) + unlink affordance

**Files:**

- Create `src/features/transactions/RelationBadge.tsx` (generalizes `RefundBadge.tsx`), or extend `RefundBadge.tsx` and re-export.
- Test: `src/features/transactions/RelationBadge.test.tsx`.

- [ ] **Step 1: Write failing component tests:**
  - Refund origin mode still renders "partially refunded ($30.00 of $100.00)" / "refunded in full" (parity with `RefundBadge.test.tsx`).
  - Refund mode renders "refund of <description>".
  - Association mode renders "associated with <description>" and, when the counterpart is cancelled, appends "(cancelled)".
  - When an `onUnlink` prop is provided, clicking the unlink control calls it; when the kind is `merge`/`split`, no unlink control renders.

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** — extend the discriminated `RefundBadgeProps` union with association variants and an optional `onUnlink?: () => void` + `counterpartCancelled?: boolean`. Keep the `CHIP` styling (`RefundBadge.tsx:7`). Render an unlink icon-button only for `refund`/`associated` when `onUnlink` is set. Preserve existing refund text branches verbatim.

- [ ] **Step 4: Run — expect PASS.** Ensure `RefundBadge.test.tsx` still passes (`pnpm exec vitest run src/features/transactions`).

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(transactions): generalize RefundBadge into RelationBadge with unlink affordance (tracker#34)"`

---

## Task W6: `LinkTransactionDialog`

**Files:**

- Create `src/features/transactions/LinkTransactionDialog.tsx` (structure template: `RefundTransactionDialog.tsx`).
- Test: `src/features/transactions/LinkTransactionDialog.test.tsx` (template: `RefundTransactionDialog.test.tsx`).

- [ ] **Step 1: Write failing component tests** (render via `renderWithProviders`, sign in via `saveSession`, MSW handlers as in `RefundTransactionDialog.test.tsx:65–93`):
  - On an income-with-contra acting row, the kind picker offers both **Refund** and **Association**; on a plain expense row it offers **Association** only.
  - Refund kind: the counterpart picker lists only non-cancelled expenses; selecting one and submitting calls `attachRelation` with `{ relatedTransactionId, relationKind: 'refund' }`.
  - Association kind: selecting any distinct visible transaction and submitting calls `attachRelation` with `relationKind: 'associated'`; the acting row itself and already-related counterparts (either direction) are excluded from the list.
  - A backend `ApiError` (`RefundExceedsRefundableAmount` / `RelationAlreadyExists`) surfaces inline.

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** the dialog. Props `{ open, onOpenChange, acting: TransactionResponse }`. Use shadcn `Dialog` + a `Select`/`RadioGroup` for kind and a `Command`/combobox for the counterpart (fed by the transactions list query, client-filtered by description/date). Compute available kinds from `acting` (income-with-contra ⇒ refund+association; else association only). For Refund, reuse `useRefundSummary` to show remaining-refundable and block over-refund client-side. Exclude self and already-related counterparts (check `acting.relations` outbound + `useTransactionRelations(acting.id)` inbound). Submit via `useAttachRelation`; map `ApiError.fieldErrors`/`code` to inline messages (mirror `RefundTransactionDialog.tsx:129–144`).

- [ ] **Step 4: Run — expect PASS.** `pnpm exec tsc --noEmit`.

- [ ] **Step 5: Add MSW handlers** for `POST /:id/relations` in `src/test/handlers.ts` (default happy path) so other suites don't error on unhandled requests.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(transactions): LinkTransactionDialog with per-kind guards (tracker#34)"`

---

## Task W7: Wire into `TransactionsPane` (context action, badges, unlink, cancelled marking)

**Files:**

- Modify `src/features/transactions/TransactionsPane.tsx` (context menu ~:417–421; badge placement ~:301–319; dialog slots ~:48).
- Test: `src/features/transactions/TransactionsPane.test.tsx` (extend existing, or create).

- [ ] **Step 1: Write failing component tests:**
  - A "Link to another transaction…" item appears in a completed row's context menu and opens `LinkTransactionDialog`.
  - A row with an `associated` outbound edge renders a `RelationBadge` (association) built from `buildRelationIndex`; clicking its unlink control calls `useDetachRelation` with the right ids/kind; a cancelled counterpart shows "(cancelled)".
  - Existing refund badges/behavior remain (regression).

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement:**
  - Add `const [linkTarget, setLinkTarget] = useState<TransactionResponse | null>(null)` and render `<LinkTransactionDialog open={!!linkTarget} .../>` near the existing dialog slot (~:48).
  - Add a `ContextMenuItem` "Link to another transaction…" for `status === 'Completed'` rows (near :417–421), `onSelect={() => setLinkTarget(t)}`.
  - Build `const assocIndex = buildRelationIndex(transactions, 'associated')` alongside the existing refund index; render association `RelationBadge`s after the refund badges (~:319), passing `onUnlink` (calls `useDetachRelation`) and `counterpartCancelled` (derive from the loaded window; a counterpart is cancelled if its loaded row `status === 'Cancelled'`).
  - For unlink, resolve the counterpart id + kind from the rendered relation; treat `RelationNotFound` as success (hook already does).

- [ ] **Step 4: Run — expect PASS.** Then full check: `pnpm exec vitest run src/features/transactions && pnpm exec tsc --noEmit && pnpm exec eslint . && pnpm exec prettier --check .`

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(transactions): link/unlink actions + relation badges in list (tracker#34)"`

---

## Final verification (both repos)

- [ ] **Backend:** `cd /Users/oleksandrsy/Projects/Current/Wix/server-infra && cabal build all -fci && cabal test all -fci --test-show-details=direct --enable-tests` — all green.
- [ ] **Web:** `cd /Users/oleksandrsy/Projects/Current/Wix/monorepo && pnpm exec tsc --noEmit && pnpm exec eslint . && pnpm exec prettier --check . && pnpm exec vitest run` — all green.
- [ ] **Manual smoke** (optional, needs backend running): use the `verify`/`run` skill to attach a refund retroactively, attach an association, confirm both rows show indicators, unlink one, cancel an associated transaction and confirm the badge marks "(cancelled)".
- [ ] Open PRs: one in server-infra (`feat/transaction-relations`), one in monorepo (`feat/transaction-relations`), cross-referencing tracker#34 and each other.

---

## Notes / gotchas

- **Route/handler order in Servant** must match exactly (`transactionServer` list vs the `:<|>` route type). A mismatch compiles but mis-dispatches.
- **`hpack`**: if `package.yaml` changes (it won't for pure `src/` edits, but the `.cabal` may need regening if modules are added), run `hpack` before `cabal build`.
- **Attach/unlink are Completed-only** (inherited from the add arm). Web should not offer link/unlink actions on non-completed rows; unlink is offered from the live counterpart.
- **Cancellation semantics** (spec §Cancellation semantics): `refund` auto-orphans in the backend read model; `associated` survives — the web only reflects this, no backend change.
- **`buildRelationIndex` window-only** (spec §List indicator known limitation): inbound flags depend on the counterpart being in the loaded page; do not add per-row fetches.
