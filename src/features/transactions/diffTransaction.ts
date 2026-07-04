import type {
  Allocation,
  Allocations,
  AmendTransactionRequest,
  ISO8601,
  TransactionResponse,
  UUID,
} from '@/api/types';
import { dateInputToWire } from '@/lib/dates';
import type { IncomeExpenseFormValues, TransferFormValues } from './schema';
import { normalizeComment } from './allocations';
import { isIncome } from './transactionType';

export interface TransactionEditDiff {
  description?: string;
  date?: ISO8601;
  labels?: UUID[];
  amendment?: AmendTransactionRequest;
  allocations?: Allocations;
}

// Each form row maps 1:1 to an allocation slice (money tagged with the form
// currency). The transaction total is the sum of all slice amounts across both
// buckets — there is no separate top-level amount.
const toMoneySlices = (
  rows: { category: string; amount: number; comment?: string }[],
  currency: string,
): Allocation[] =>
  rows.map((r) => ({
    categoryId: r.category,
    amount: { amount: r.amount, currency },
    comment: normalizeComment(r.comment),
  }));

export const buildAllocations = (v: IncomeExpenseFormValues, currency: string): Allocations => ({
  incomes: toMoneySlices(v.incomes, currency),
  expenses: toMoneySlices(v.expenses, currency),
});

// Precondition: callers pass cleaned/finite slice amounts — the baseline comes
// from `toIncomeExpenseFormValues` (always finite) and the next values are
// cleaned by `dropEmptySlices` in IncomeExpenseForm before submit. A NaN here
// would make `newTotal !== oldTotal` spuriously true and emit a bogus amendment.
const sumSlices = (v: IncomeExpenseFormValues) =>
  [...v.incomes, ...v.expenses].reduce((s, r) => s + r.amount, 0);

const sameSlices = (
  a: { category: string; amount: number; comment?: string }[],
  b: { category: string; amount: number; comment?: string }[],
) =>
  a.length === b.length &&
  a.every(
    (s, i) =>
      s.category === b[i]!.category &&
      s.amount === b[i]!.amount &&
      normalizeComment(s.comment) === normalizeComment(b[i]!.comment),
  );

const sameLabels = (a: readonly UUID[], b: readonly UUID[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);

export function diffIncomeExpense(
  initial: IncomeExpenseFormValues,
  next: IncomeExpenseFormValues,
  tx: TransactionResponse,
): TransactionEditDiff {
  const diff: TransactionEditDiff = {};
  if (next.description !== initial.description) diff.description = next.description;
  if (next.date !== initial.date && next.date) diff.date = dateInputToWire(next.date);
  if (!sameLabels(initial.labels, next.labels)) diff.labels = [...next.labels];

  const income = isIncome(tx.transactionType);
  const externalLeg = income ? tx.sourceAccountId : tx.targetAccountId;
  const externalCurrency = income ? tx.sourceCurrency : tx.targetCurrency;
  const accountChanged = next.accountId !== initial.accountId;
  const newTotal = sumSlices(next);
  const oldTotal = sumSlices(initial);
  const totalChanged = newTotal !== oldTotal;
  const splitChanged =
    !sameSlices(initial.incomes, next.incomes) || !sameSlices(initial.expenses, next.expenses);

  // The backend requires `newAllocations` on EVERY categorised amend (omitting
  // them is rejected with AllocationsRequiredForCategorisedKind). So when the
  // total or account changes we fold BOTH buckets into the amendment and never
  // also emit a separate diff.allocations. A pure re-split (same total) uses the
  // dedicated PATCH /allocations endpoint instead.
  if (accountChanged || totalChanged) {
    diff.amendment = {
      sourceAccountId: income ? externalLeg : next.accountId,
      targetAccountId: income ? next.accountId : externalLeg,
      sourceAmount: newTotal,
      sourceCurrency: income ? externalCurrency : next.currency,
      targetAmount: newTotal,
      targetCurrency: income ? next.currency : externalCurrency,
      newAllocations: buildAllocations(next, next.currency),
    };
  } else if (splitChanged) {
    diff.allocations = buildAllocations(next, next.currency);
  }

  return diff;
}

export function diffTransfer(
  initial: TransferFormValues,
  next: TransferFormValues,
  tx: TransactionResponse,
): TransactionEditDiff {
  const diff: TransactionEditDiff = {};
  if (next.description !== initial.description) diff.description = next.description;
  if (next.date !== initial.date && next.date) diff.date = dateInputToWire(next.date);
  if (!sameLabels(initial.labels, next.labels)) diff.labels = [...next.labels];

  const sourceChanged = next.sourceAccountId !== initial.sourceAccountId;
  const targetChanged = next.targetAccountId !== initial.targetAccountId;
  const amountChanged = next.amount !== initial.amount;
  const rateChanged = (next.exchangeRate ?? null) !== (initial.exchangeRate ?? null);

  if (sourceChanged || targetChanged || amountChanged || rateChanged) {
    const crossCurrency = tx.sourceCurrency !== tx.targetCurrency;
    const sourceAmount = next.amount;
    const targetAmount = crossCurrency ? next.amount * (next.exchangeRate ?? 1) : next.amount;
    diff.amendment = {
      sourceAccountId: next.sourceAccountId,
      targetAccountId: next.targetAccountId,
      sourceAmount,
      sourceCurrency: tx.sourceCurrency,
      targetAmount,
      targetCurrency: tx.targetCurrency,
      ...(crossCurrency && next.exchangeRate !== undefined
        ? { exchangeRate: next.exchangeRate }
        : {}),
    };
  }

  return diff;
}
