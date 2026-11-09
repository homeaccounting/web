import type { Allocations, TransactionResponse } from '@/api/types';
import { roundMoney } from '@/lib/money';
import { toMoneySlices } from './allocations';

// Transfer fees (tracker#104). The backend stores only the debited total
// (`sourceAmount`), the fee allocations (expense bucket, source currency) and the
// credited amount; the credited amount before conversion is always
// `debit − Σfees`. Who bears the fee is a client-only input convenience:
//   source — the typed amount is what moves; the fee is debited on top.
//   target — the typed amount is what is debited; the fee is deducted from it.
export type FeeMode = 'source' | 'target';

export interface FeeRow {
  category: string;
  amount: number;
  comment?: string;
}

export interface FeeInput {
  amount: number | string;
  expenses: readonly FeeRow[];
  feeMode: FeeMode;
}

const toNumber = (n: unknown) => (typeof n === 'number' ? n : Number(n));

export function feeTotal(fees: readonly { amount: number }[]): number {
  return roundMoney(
    fees.reduce((s, f) => {
      const n = toNumber(f.amount);
      return Number.isFinite(n) ? s + n : s;
    }, 0),
  );
}

// The total debited from the source account: the wire `amount` on create and
// `sourceAmount` on amend.
export function transferDebit(v: FeeInput): number {
  const amount = toNumber(v.amount);
  const fees = feeTotal(v.expenses);
  if (fees === 0 || v.feeMode === 'target') return amount;
  return roundMoney(amount + fees);
}

// What reaches the target account, in the source currency (before the rate).
export function transferCredit(v: FeeInput): number {
  const fees = feeTotal(v.expenses);
  const debit = transferDebit(v);
  return fees === 0 ? debit : roundMoney(debit - fees);
}

// Fee rows as wire allocations, or undefined for a plain transfer (the backend
// rejects an empty Allocations).
export function feeAllocations(fees: readonly FeeRow[], currency: string): Allocations | undefined {
  if (fees.length === 0) return undefined;
  return { incomes: [], expenses: toMoneySlices(fees, currency) };
}

// Σ fee allocations on a stored transfer (0 for a plain one).
export function transferFeeTotal(tx: Pick<TransactionResponse, 'allocations'>): number {
  return feeTotal(tx.allocations.expenses.map((a) => ({ amount: a.amount.amount })));
}
