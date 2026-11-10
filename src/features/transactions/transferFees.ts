import type { Allocations, AmendTransactionRequest } from '@/api/types';
import { roundMoney } from '@/lib/money';
import { sumSlices, toMoneySlices, type SliceValues } from './allocations';
import type { TransferFormValues } from './schema';

// Transfer fees (tracker#104). The backend stores only the debited total
// (`sourceAmount`), the fee allocations (expense bucket, source currency) and the
// credited amount; the credited amount before conversion is always
// `debit − Σfees`. Who bears the fee is a client-only input convenience:
//   source — the typed amount is what moves; the fee is debited on top.
//   target — the typed amount is what is debited; the fee is deducted from it.
export const FEE_MODES = ['source', 'target'] as const;
export type FeeMode = (typeof FEE_MODES)[number];

export interface FeeInput {
  // Raw watched form values can still be a string while typing.
  amount: number | string;
  fees: readonly SliceValues[];
  feeMode: FeeMode;
}

// The total debited from the source account: the wire `amount` on create and
// `sourceAmount` on amend. A plain transfer passes the typed amount through unrounded.
export function transferDebit(v: FeeInput): number {
  const amount = Number(v.amount);
  const fees = sumSlices(v.fees);
  if (fees === 0 || v.feeMode === 'target') return amount;
  return roundMoney(amount + fees);
}

// What reaches the target account, in the source currency (before the rate).
export function transferCredit(v: FeeInput): number {
  const fees = sumSlices(v.fees);
  const debit = transferDebit(v);
  return fees === 0 ? debit : roundMoney(debit - fees);
}

// The credited amount in the target currency. The backend re-derives it from the
// debit and rate, so this only has to agree to the cent.
export function transferTargetAmount(
  credit: number,
  exchangeRate: number | null | undefined,
  crossCurrency: boolean,
): number {
  return crossCurrency ? roundMoney(credit * (exchangeRate ?? 1)) : credit;
}

// Fee rows as wire allocations, or undefined for a plain transfer (the backend
// rejects an empty Allocations).
export function feeAllocations(
  fees: readonly SliceValues[],
  currency: string,
): Allocations | undefined {
  if (fees.length === 0) return undefined;
  return { incomes: [], expenses: toMoneySlices(fees, currency) };
}

// Σ fee allocations on a stored transfer (0 for a plain one).
export function transferFeeTotal(allocations: Allocations): number {
  return sumSlices(allocations.expenses.map((a) => a.amount));
}

// Full amend request for a transfer. Fees are always resent: an amendment
// without them clears any existing fees. Fees are tagged with `sourceCurrency`,
// the same currency the debit is sent in.
export function toTransferAmendment(
  v: TransferFormValues,
  sourceCurrency: string,
  targetCurrency: string,
): AmendTransactionRequest {
  const crossCurrency = sourceCurrency !== targetCurrency;
  const fees = feeAllocations(v.fees, sourceCurrency);
  return {
    sourceAccountId: v.sourceAccountId,
    targetAccountId: v.targetAccountId,
    sourceAmount: transferDebit(v),
    sourceCurrency,
    targetAmount: transferTargetAmount(transferCredit(v), v.exchangeRate, crossCurrency),
    targetCurrency,
    ...(crossCurrency && v.exchangeRate !== undefined ? { exchangeRate: v.exchangeRate } : {}),
    ...(fees ? { newAllocations: fees } : {}),
  };
}
