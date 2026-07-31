import type { Allocations, TransactionResponse, UUID } from '@/api/types';
import { TRANSACTION_TYPE } from '@/api/types';
import { roundMoney } from '@/lib/money';

// The account whose balance the categorised leg touches: an income credits the
// target account, an expense debits the source account. Mirrors `accountIdOf`
// used elsewhere in the transactions feature.
export function mergeAccountId(tx: TransactionResponse): UUID {
  return tx.transactionType === TRANSACTION_TYPE.income ? tx.targetAccountId : tx.sourceAccountId;
}

// Currency of the categorised leg (target side for income, source side for
// expense). For a categorised (non-transfer) transaction both legs share one
// currency, but we pick the leg deliberately to stay correct.
export function mergeCurrency(tx: TransactionResponse): string {
  return tx.transactionType === TRANSACTION_TYPE.income ? tx.targetCurrency : tx.sourceCurrency;
}

// Amount of the leg that moves in a transfer-merge: an income's credited target
// amount, an expense's debited source amount. Matches the backend's leg
// projection (`transferMerge` uses `income.targetAmount` / `expense.sourceAmount`).
export function mergeLegAmount(tx: TransactionResponse): number {
  return tx.transactionType === TRANSACTION_TYPE.income ? tx.targetAmount : tx.sourceAmount;
}

// Time tolerance for a manual income/expense → transfer merge, mirroring the
// backend `mergeTransferWindow` (24h). More relaxed than import's 5-minute
// pairing: a manually-reconciled transfer may have legs dated further apart.
export const MERGE_TRANSFER_WINDOW_MS = 24 * 60 * 60 * 1000;

// Categorised total: sum of both allocation buckets. Matches how the backend
// derives a transaction's categorised total (and relationIndex.txTotal).
export function categorisedTotal(tx: TransactionResponse): number {
  return roundMoney(
    [...tx.allocations.incomes, ...tx.allocations.expenses].reduce(
      (s, a) => s + a.amount.amount,
      0,
    ),
  );
}

// Why a merge is not allowed, in the order the guard checks them. Mirrors the
// backend `mergeTransactions` validation (server-infra TransactionService).
export type MergeIneligibility =
  | 'too-few'
  | 'not-completed'
  | 'unsupported-kind'
  | 'mixed-kinds'
  | 'different-accounts'
  | 'different-currencies'
  | 'conflicting-contacts'
  | 'transfer-same-account'
  | 'transfer-legs-mismatch';

// The two merge modes, dispatched on the selection's shape:
//  - 'same-kind': ≥2 income (or ≥2 expense) on one account/currency folded into
//    a survivor that absorbs their allocations (the original merge).
//  - 'transfer': one income + one expense on different accounts collapsed into a
//    single Transfer (tracker#44). The income is always the survivor.
export type MergeMode = 'same-kind' | 'transfer';

export type MergeEligibility =
  | { eligible: true; mode: MergeMode }
  | { eligible: false; reason: MergeIneligibility };

// User-facing explanation per ineligibility reason. Shared by the merge dialog
// (inline alert) and the selection action bar (disabled-Merge tooltip).
export const MERGE_INELIGIBILITY_MESSAGE: Record<MergeIneligibility, string> = {
  'too-few': 'Select at least two transactions to merge.',
  'not-completed': 'Only completed transactions can be merged.',
  'unsupported-kind': 'Only income or expense transactions can be merged.',
  'mixed-kinds': 'All transactions must be the same kind — all income or all expense.',
  'different-accounts': 'All transactions must be on the same account.',
  'different-currencies': 'All transactions must use the same currency.',
  'conflicting-contacts':
    'The selection has two different contacts. They must share one contact, or leave it unset.',
  'transfer-same-account': 'A transfer needs two different accounts.',
  'transfer-legs-mismatch': 'Amount, currency, and dates (within 24h) must match.',
};

const nonEmptyContacts = (txs: TransactionResponse[]): UUID[] => [
  ...new Set(txs.map((t) => t.contactId).filter((c): c is UUID => c != null)),
];

// A transfer-merge selection is exactly one income + one expense. Returns the
// two legs (income = the eventual survivor, expense = the cancelled leg) in a
// fixed shape regardless of selection order, or null for any other shape.
export function transferPairOf(
  txs: TransactionResponse[],
): { income: TransactionResponse; expense: TransactionResponse } | null {
  if (txs.length !== 2) return null;
  const income = txs.find((t) => t.transactionType === TRANSACTION_TYPE.income);
  const expense = txs.find((t) => t.transactionType === TRANSACTION_TYPE.expense);
  return income && expense ? { income, expense } : null;
}

// Whether an income+expense pair is really one movement, mirroring the backend
// `isTransferMatch mergeTransferWindow`: equal amount ∧ currency (opposite
// direction is implied by the one-income/one-expense shape) within the 24h
// window. Account distinctness is checked separately so the UI can explain it.
function legsMatch(income: TransactionResponse, expense: TransactionResponse): boolean {
  const sameMoney =
    roundMoney(mergeLegAmount(income)) === roundMoney(mergeLegAmount(expense)) &&
    mergeCurrency(income) === mergeCurrency(expense);
  const withinWindow =
    Math.abs(new Date(income.date).getTime() - new Date(expense.date).getTime()) <=
    MERGE_TRANSFER_WINDOW_MS;
  return sameMoney && withinWindow;
}

// Client-side pre-check mirroring the backend merge compatibility rules so the
// UI can disable/explain before calling the endpoint. Only income+income or
// expense+expense on one account/currency are mergeable; contacts must be the
// same or absent across the set.
export function checkMergeEligibility(txs: TransactionResponse[]): MergeEligibility {
  if (txs.length < 2) return { eligible: false, reason: 'too-few' };
  if (!txs.every((t) => t.status === 'Completed'))
    return { eligible: false, reason: 'not-completed' };

  // Transfer-merge branch: one income + one expense. Dispatched on shape before
  // the same-kind checks, which would otherwise reject the opposite kinds as
  // 'mixed-kinds'. Mirrors the backend routing opposite kinds to transfer-merge.
  const pair = transferPairOf(txs);
  if (pair) {
    if (mergeAccountId(pair.income) === mergeAccountId(pair.expense))
      return { eligible: false, reason: 'transfer-same-account' };
    if (!legsMatch(pair.income, pair.expense))
      return { eligible: false, reason: 'transfer-legs-mismatch' };
    return { eligible: true, mode: 'transfer' };
  }

  const kinds = new Set(txs.map((t) => t.transactionType));
  const supported = (k: string): boolean =>
    k === TRANSACTION_TYPE.income || k === TRANSACTION_TYPE.expense;
  if (![...kinds].every(supported)) return { eligible: false, reason: 'unsupported-kind' };
  if (kinds.size > 1) return { eligible: false, reason: 'mixed-kinds' };

  if (new Set(txs.map(mergeAccountId)).size > 1)
    return { eligible: false, reason: 'different-accounts' };
  if (new Set(txs.map(mergeCurrency)).size > 1)
    return { eligible: false, reason: 'different-currencies' };
  if (nonEmptyContacts(txs).length > 1) return { eligible: false, reason: 'conflicting-contacts' };

  return { eligible: true, mode: 'same-kind' };
}

// The contact carried onto the merged transaction: the single distinct contact
// present on any of the merged transactions, or null when none has one.
// Assumes eligibility already holds (≤ 1 distinct contact).
export function resolveMergeContact(txs: TransactionResponse[]): UUID | null {
  const contacts = nonEmptyContacts(txs);
  return contacts.length === 1 ? (contacts[0] ?? null) : null;
}

// Combined categorised amount previewed for the merged result: the sum of every
// transaction's categorised total. The backend recomputes this authoritatively.
export function combinedTotal(txs: TransactionResponse[]): number {
  return roundMoney(txs.reduce((s, t) => s + categorisedTotal(t), 0));
}

// Combined allocation set previewed for the merged result: the concatenation of
// every transaction's buckets, matching the backend's compose step.
export function combinedAllocations(txs: TransactionResponse[]): Allocations {
  return {
    incomes: txs.flatMap((t) => t.allocations.incomes),
    expenses: txs.flatMap((t) => t.allocations.expenses),
  };
}
