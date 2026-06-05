import { z } from 'zod';
import type { ExpenseRequest, IncomeRequest, InternalTransferRequest, UUID } from '@/api/types';

const uuid = z.string().uuid();
const positiveAmount = z.coerce.number().positive('Amount must be positive');
const description = z.string().min(1, 'Description is required').max(500);

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

export function toIncomeRequest(v: IncomeExpenseInput): IncomeRequest {
  return {
    accountId: v.accountId,
    amount: v.amount,
    currency: v.currency,
    category: v.category,
    description: v.description,
    date: v.date ? isoDay(v.date) : undefined,
    labels: labelsOrUndefined(v.labels),
  };
}

export const toExpenseRequest: (v: IncomeExpenseInput) => ExpenseRequest = toIncomeRequest;

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
