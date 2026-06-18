import type {
  AccountResponse,
  AmendTransactionRequest,
  TransactionResponse,
  UUID,
} from '@/api/types';
import { wireToDateInput } from '@/lib/dates';
import type { IncomeExpenseFormValues, TransferFormValues } from './schema';
import { isExpense, isIncome } from './transactionType';

// Seed a target-kind income/expense form from a source transaction. The "kept"
// regular leg follows the §4 table:
//   expense → income : keep source ; transfer → income : keep target ("to")
//   income  → expense: keep target ; transfer → expense: keep source ("from")
// Category seeds from the target-kind default (banking default for now, see #41);
// a categorised source's own category is NOT carried across (different dictionary).
export function toConvertIncomeExpenseDefaults(
  tx: TransactionResponse,
  targetKind: 'income' | 'expense',
  accounts: AccountResponse[],
  defaultCategory: UUID | null,
): IncomeExpenseFormValues {
  const keepSource =
    targetKind === 'income' ? isExpense(tx.transactionType) : !isIncome(tx.transactionType);
  const accountId = keepSource ? tx.sourceAccountId : tx.targetAccountId;
  const amount = Math.abs(keepSource ? tx.sourceAmount : tx.targetAmount);
  const currency =
    accounts.find((a) => a.id === accountId)?.currency ??
    (keepSource ? tx.sourceCurrency : tx.targetCurrency);
  return {
    accountId,
    amount,
    currency,
    category: defaultCategory ?? '',
    description: tx.description,
    date: wireToDateInput(tx.date),
    labels: tx.labels,
  };
}

// Seed a transfer form from an income/expense source. The kept regular leg
// becomes the source (from expense) or target (from income); the counterparty is
// left empty for the user to pick. Only income/expense can convert to transfer.
export function toConvertTransferDefaults(
  tx: TransactionResponse,
  accounts: AccountResponse[],
): TransferFormValues {
  // Guard the contract: a transfer target is only reachable from an
  // income/expense source (the UI's convertTargets filters out same-kind).
  if (!isIncome(tx.transactionType) && !isExpense(tx.transactionType)) {
    throw new Error(`Cannot convert ${tx.transactionType} to a transfer`);
  }
  const fromExpense = isExpense(tx.transactionType);
  const keptId = fromExpense ? tx.sourceAccountId : tx.targetAccountId;
  const amount = Math.abs(fromExpense ? tx.sourceAmount : tx.targetAmount);
  const currency =
    accounts.find((a) => a.id === keptId)?.currency ??
    (fromExpense ? tx.sourceCurrency : tx.targetCurrency);
  return {
    sourceAccountId: fromExpense ? keptId : '',
    targetAccountId: fromExpense ? '' : keptId,
    amount,
    currency,
    exchangeRate: undefined,
    description: tx.description,
    date: wireToDateInput(tx.date),
    labels: tx.labels,
  };
}

// Build a cross-kind amend request for an income/expense target. `newAllocations`
// is carried INLINE (a true cross-kind change requires it; the separate
// PATCH /allocations is only for within-kind edits). Income/expense are
// single-currency, so both legs share the account amount/currency.
export function toIncomeExpenseAmendment(
  targetKind: 'income' | 'expense',
  v: IncomeExpenseFormValues,
  externalAccountId: UUID,
): AmendTransactionRequest {
  const income = targetKind === 'income';
  const slice = { categoryId: v.category, amount: { amount: v.amount, currency: v.currency } };
  return {
    sourceAccountId: income ? externalAccountId : v.accountId,
    targetAccountId: income ? v.accountId : externalAccountId,
    sourceAmount: v.amount,
    sourceCurrency: v.currency,
    targetAmount: v.amount,
    targetCurrency: v.currency,
    newAllocations: income
      ? { incomes: [slice], expenses: [] }
      : { incomes: [], expenses: [slice] },
  };
}

// Build a cross-kind amend request for a transfer target. Like diffTransfer, the
// target amount is the source amount scaled by the rate when cross-currency —
// but here cross-currency is keyed off the PICKED accounts' currencies (passed
// in by the dialog), not the source tx's, since the source is a single-currency
// income/expense.
export function toTransferAmendment(
  v: TransferFormValues,
  sourceCurrency: string,
  targetCurrency: string,
): AmendTransactionRequest {
  const crossCurrency = sourceCurrency !== targetCurrency;
  return {
    sourceAccountId: v.sourceAccountId,
    targetAccountId: v.targetAccountId,
    sourceAmount: v.amount,
    sourceCurrency,
    targetAmount: crossCurrency ? v.amount * (v.exchangeRate ?? 1) : v.amount,
    targetCurrency,
    ...(crossCurrency && v.exchangeRate !== undefined ? { exchangeRate: v.exchangeRate } : {}),
  };
}
