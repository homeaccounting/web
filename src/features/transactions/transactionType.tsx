import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Circle,
  Scale,
  type LucideIcon,
} from 'lucide-react';
import { TRANSACTION_TYPE, type TransactionTypeText } from '@/api/types';
import type { TransactionKind } from './labels';

// Predicates on the backend `transactionType` discriminator. Prefer these over
// hardcoding the string literals at each call site.
export const isIncome = (type: TransactionTypeText) => type === TRANSACTION_TYPE.income;
export const isExpense = (type: TransactionTypeText) => type === TRANSACTION_TYPE.expense;
export const isTransfer = (type: TransactionTypeText) => type === TRANSACTION_TYPE.transfer;
export const isAdjustment = (type: TransactionTypeText) => type === TRANSACTION_TYPE.adjustment;

// Maps a transaction's type to the editable form kind (income / expense /
// transfer). Adjustments have no editable form; callers guard them separately,
// so they fall through to `expense` here.
export function transactionKind(type: TransactionTypeText): TransactionKind {
  if (isTransfer(type)) return TRANSACTION_TYPE.transfer;
  if (isIncome(type)) return TRANSACTION_TYPE.income;
  return TRANSACTION_TYPE.expense;
}

export interface TransactionTypeMeta {
  Icon: LucideIcon;
  colorClass: string;
  label: string;
}

// Maps the backend `transactionType` discriminator to a leading icon + color
// for the list row. Unknown values (the open `(string & {})` arm of
// TransactionTypeText) fall back to a neutral dot labelled with the raw value.
export function transactionTypeMeta(type: TransactionTypeText): TransactionTypeMeta {
  switch (type) {
    case TRANSACTION_TYPE.income:
      return {
        Icon: ArrowDownToLine,
        colorClass: 'text-positive',
        label: 'Income',
      };
    case TRANSACTION_TYPE.expense:
      return { Icon: ArrowUpFromLine, colorClass: 'text-negative', label: 'Expense' };
    case TRANSACTION_TYPE.transfer:
      return {
        Icon: ArrowLeftRight,
        colorClass: 'text-info',
        label: 'Transfer',
      };
    case TRANSACTION_TYPE.adjustment:
      return { Icon: Scale, colorClass: 'text-muted-foreground', label: 'Adjustment' };
    default:
      return { Icon: Circle, colorClass: 'text-muted-foreground', label: type || 'Unknown' };
  }
}

// Directional color class for a transaction AMOUNT. Red/green is reserved for
// money genuinely entering or leaving via an external account — i.e. income
// (green) and expense (red). A transfer moves money between the user's own
// accounts and an adjustment reconciles a balance, so neither is "spending" or
// "earning": both render neutral (default foreground), consistently on the
// source and target legs. Returns '' for the neutral case.
//
// Distinct from `transactionTypeMeta().colorClass`, which colors the type icon
// (e.g. a transfer icon is blue) rather than the amount.
export function transactionAmountClass(type: TransactionTypeText): string {
  if (isIncome(type)) return 'text-positive';
  if (isExpense(type)) return 'text-negative';
  return '';
}
