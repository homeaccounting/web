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
  | 'conflicting-contacts';

export type MergeEligibility = { eligible: true } | { eligible: false; reason: MergeIneligibility };

const nonEmptyContacts = (txs: TransactionResponse[]): UUID[] => [
  ...new Set(txs.map((t) => t.contactId).filter((c): c is UUID => c != null)),
];

// Client-side pre-check mirroring the backend merge compatibility rules so the
// UI can disable/explain before calling the endpoint. Only income+income or
// expense+expense on one account/currency are mergeable; contacts must be the
// same or absent across the set.
export function checkMergeEligibility(txs: TransactionResponse[]): MergeEligibility {
  if (txs.length < 2) return { eligible: false, reason: 'too-few' };
  if (!txs.every((t) => t.status === 'Completed'))
    return { eligible: false, reason: 'not-completed' };

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

  return { eligible: true };
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
