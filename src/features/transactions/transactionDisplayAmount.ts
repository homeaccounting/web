import type { TransactionResponse, UUID } from '@/api/types';
import {
  isAdjustment,
  isExpense,
  isIncome,
  isTransfer,
  transactionAmountClass,
} from './transactionType';

export interface DisplayAmount {
  amount: number; // signed for income/expense; positive magnitude for transfer/adjustment
  currency: string;
  colorClass: string; // '' | 'text-positive' | 'text-negative'
}

// The amount to show for a row. `viewedAccountId` is the single scoped account
// (or null in multi/all scope). Single scope keeps the historical viewed-leg
// logic; multi/all uses a scope-independent per-type rule.
export function transactionDisplayAmount(
  t: TransactionResponse,
  viewedAccountId: UUID | null,
): DisplayAmount {
  const colorClass = transactionAmountClass(t.transactionType);
  if (viewedAccountId) {
    const isTarget = t.targetAccountId === viewedAccountId && t.sourceAccountId !== viewedAccountId;
    return {
      amount: isTarget ? t.targetAmount : -t.sourceAmount,
      currency: isTarget ? t.targetCurrency : t.sourceCurrency,
      colorClass,
    };
  }
  if (isIncome(t.transactionType)) {
    return { amount: t.targetAmount, currency: t.targetCurrency, colorClass };
  }
  if (isExpense(t.transactionType)) {
    return { amount: -t.sourceAmount, currency: t.sourceCurrency, colorClass };
  }
  // transfer / adjustment: neutral magnitude on the source leg; the Account
  // column's "from → to" conveys direction.
  return { amount: t.sourceAmount, currency: t.sourceCurrency, colorClass };
}

export interface AccountCell {
  fromId: UUID;
  toId?: UUID; // present ⇒ render "from → to" (transfer / adjustment)
}

// Which account(s) label a row: income → target, expense → source,
// transfer/adjustment → source → target.
export function transactionAccountCell(t: TransactionResponse): AccountCell {
  if (isTransfer(t.transactionType) || isAdjustment(t.transactionType)) {
    return { fromId: t.sourceAccountId, toId: t.targetAccountId };
  }
  return { fromId: isIncome(t.transactionType) ? t.targetAccountId : t.sourceAccountId };
}
