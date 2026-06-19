import type {
  AccountResponse,
  AmendTransactionRequest,
  TransactionResponse,
  UUID,
} from '@/api/types';
import { wireToDateInput } from '@/lib/dates';
import type { IncomeExpenseFormValues, TransferFormValues } from './schema';
import { buildAllocations } from './diffTransaction';
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
  // Seed a single slice row in the target-kind bucket, carrying the magnitude
  // as the row amount. The other bucket starts empty.
  const slice = { category: defaultCategory ?? '', amount };
  return {
    accountId,
    currency,
    incomes: targetKind === 'income' ? [slice] : [],
    expenses: targetKind === 'expense' ? [slice] : [],
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

// Build an amend request for an income/expense target. `newAllocations` is
// carried INLINE: the backend requires allocations on EVERY categorised amend
// (no within-kind/cross-kind distinction); the separate PATCH /allocations is
// only for allocation-only edits that leave the total unchanged. Income/expense
// are single-currency, so both legs share the account amount/currency.
export function toIncomeExpenseAmendment(
  targetKind: 'income' | 'expense',
  v: IncomeExpenseFormValues,
  externalAccountId: UUID,
): AmendTransactionRequest {
  const income = targetKind === 'income';
  // The total is the sum of all slice amounts across both buckets; both legs
  // share it (single-currency income/expense).
  const total = [...v.incomes, ...v.expenses].reduce((s, r) => s + r.amount, 0);
  return {
    sourceAccountId: income ? externalAccountId : v.accountId,
    targetAccountId: income ? v.accountId : externalAccountId,
    sourceAmount: total,
    sourceCurrency: v.currency,
    targetAmount: total,
    targetCurrency: v.currency,
    newAllocations: buildAllocations(v, v.currency),
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
