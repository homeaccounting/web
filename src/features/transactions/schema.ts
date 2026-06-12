import { z } from 'zod';
import type {
  AllocationsRequest,
  ExpenseRequest,
  IncomeRequest,
  InternalTransferRequest,
  UUID,
} from '@/api/types';

const uuid = z.string().uuid();
const positiveAmount = z.coerce.number().positive('Amount must be positive');
// Optional: an empty description is allowed. The backend accepts an empty
// `description` (Web/Types.hs `description :: Text` with no non-empty validation),
// consistent with the adjust-balance field.
const description = z.string().max(500);

const optionalIsoDate = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'), z.literal('')])
  .optional()
  .transform((v) => (v === '' || v === undefined ? undefined : v));

export const incomeExpenseFormSchema = z.object({
  accountId: uuid,
  amount: positiveAmount,
  currency: z.string().min(1),
  category: uuid,
  description,
  date: optionalIsoDate,
  labels: z.array(uuid).default([]),
});
export type IncomeExpenseFormValues = z.infer<typeof incomeExpenseFormSchema>;

export const transferFormSchema = z
  .object({
    sourceAccountId: uuid,
    targetAccountId: uuid,
    amount: positiveAmount,
    currency: z.string().min(1),
    description,
    exchangeRate: z.coerce.number().positive().optional(),
    date: optionalIsoDate,
    labels: z.array(uuid).default([]),
  })
  .refine((v) => v.sourceAccountId !== v.targetAccountId, {
    message: 'Source and target accounts must differ',
    path: ['targetAccountId'],
  });
export type TransferFormValues = z.infer<typeof transferFormSchema>;

const isoDay = (yyyyMmDd: string) => `${yyyyMmDd}T00:00:00.000Z`;
const labelsOrUndefined = (xs: readonly UUID[]) => (xs.length === 0 ? undefined : (xs as UUID[]));

type IncomeExpenseInput = Omit<IncomeExpenseFormValues, 'labels'> & {
  labels: readonly UUID[];
};

// The single-category UI maps to one allocation slice in the bucket that
// matches the transaction kind (income → `incomes`, expense → `expenses`).
// The other bucket stays empty; the categorised total is the slice amount.
function toAllocationsRequest(
  bucket: 'incomes' | 'expenses',
  category: UUID,
  amount: number,
): AllocationsRequest {
  const slice = { category, amount };
  return bucket === 'incomes'
    ? { incomes: [slice], expenses: [] }
    : { incomes: [], expenses: [slice] };
}

export function toIncomeRequest(v: IncomeExpenseInput): IncomeRequest {
  return {
    accountId: v.accountId,
    currency: v.currency,
    allocations: toAllocationsRequest('incomes', v.category, v.amount),
    description: v.description,
    date: v.date ? isoDay(v.date) : undefined,
    labels: labelsOrUndefined(v.labels),
  };
}

export function toExpenseRequest(v: IncomeExpenseInput): ExpenseRequest {
  return {
    accountId: v.accountId,
    currency: v.currency,
    allocations: toAllocationsRequest('expenses', v.category, v.amount),
    description: v.description,
    date: v.date ? isoDay(v.date) : undefined,
    labels: labelsOrUndefined(v.labels),
  };
}

type TransferInput = Omit<TransferFormValues, 'labels'> & {
  labels: readonly UUID[];
};

export function toTransferRequest(
  v: TransferInput,
  sourceCurrency: string,
  targetCurrency: string,
): InternalTransferRequest {
  return {
    sourceAccountId: v.sourceAccountId,
    targetAccountId: v.targetAccountId,
    amount: v.amount,
    currency: v.currency,
    description: v.description,
    exchangeRate: sourceCurrency === targetCurrency ? undefined : v.exchangeRate,
    date: v.date ? isoDay(v.date) : undefined,
    labels: labelsOrUndefined(v.labels),
  };
}

import type { AccountResponse, TransactionResponse } from '@/api/types';

const dateToYyyyMmDd = (iso: string) => iso.slice(0, 10);

export function toIncomeExpenseFormValues(
  tx: TransactionResponse,
  accounts: AccountResponse[],
): IncomeExpenseFormValues {
  const isIncome = tx.transactionType === 'income';
  const accountId = isIncome ? tx.targetAccountId : tx.sourceAccountId;
  const amount = isIncome ? tx.targetAmount : tx.sourceAmount;
  const currency =
    accounts.find((a) => a.id === accountId)?.currency ??
    (isIncome ? tx.targetCurrency : tx.sourceCurrency);
  return {
    accountId,
    amount,
    currency,
    category: tx.category ?? '',
    description: tx.description,
    date: dateToYyyyMmDd(tx.date),
    labels: tx.labels,
  };
}

export function toTransferFormValues(
  tx: TransactionResponse,
  accounts: AccountResponse[],
): TransferFormValues {
  return {
    sourceAccountId: tx.sourceAccountId,
    targetAccountId: tx.targetAccountId,
    amount: tx.sourceAmount,
    currency: accounts.find((a) => a.id === tx.sourceAccountId)?.currency ?? tx.sourceCurrency,
    description: tx.description,
    exchangeRate: tx.exchangeRate ?? undefined,
    date: dateToYyyyMmDd(tx.date),
    labels: tx.labels,
  };
}
