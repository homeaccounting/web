import type {
  Allocations,
  AmendTransactionRequest,
  ISO8601,
  TransactionResponse,
  UUID,
} from '@/api/types';
import { dateInputToWire } from '@/lib/dates';
import type { IncomeExpenseFormValues, TransferFormValues } from './schema';

export interface TransactionEditDiff {
  description?: string;
  date?: ISO8601;
  labels?: UUID[];
  amendment?: AmendTransactionRequest;
  allocations?: Allocations;
}

// Single-category edit → one allocation slice in the bucket matching the kind.
const bucketAllocation = (
  isIncome: boolean,
  categoryId: UUID,
  amount: number,
  currency: string,
): Allocations => {
  const slice = { categoryId, amount: { amount, currency } };
  return isIncome ? { incomes: [slice], expenses: [] } : { incomes: [], expenses: [slice] };
};

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

  const isIncome = tx.transactionType === 'income';
  const externalLeg = isIncome ? tx.sourceAccountId : tx.targetAccountId;
  const externalCurrency = isIncome ? tx.sourceCurrency : tx.targetCurrency;
  const accountChanged = next.accountId !== initial.accountId;
  const amountChanged = next.amount !== initial.amount;
  const categoryChanged = next.category !== initial.category;

  if (accountChanged || amountChanged) {
    diff.amendment = {
      sourceAccountId: isIncome ? externalLeg : next.accountId,
      targetAccountId: isIncome ? next.accountId : externalLeg,
      sourceAmount: next.amount,
      sourceCurrency: isIncome ? externalCurrency : next.currency,
      targetAmount: next.amount,
      targetCurrency: isIncome ? next.currency : externalCurrency,
    };
    diff.allocations = bucketAllocation(isIncome, next.category, next.amount, next.currency);
  } else if (categoryChanged) {
    diff.allocations = bucketAllocation(isIncome, next.category, next.amount, next.currency);
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
