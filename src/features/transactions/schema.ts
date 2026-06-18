import { z } from 'zod';
import type {
  AllocationsRequest,
  ExpenseRequest,
  IncomeRequest,
  InternalTransferRequest,
  UUID,
} from '@/api/types';
import { isIncome } from './transactionType';
import { dateInputToWire, wireToDateInput } from '@/lib/dates';
import { formatMoney } from '@/lib/format';

const uuid = z.string().uuid();
const positiveAmount = z.coerce.number().positive('Amount must be positive');
// Optional: an empty description is allowed. The backend accepts an empty
// `description` (Web/Types.hs `description :: Text` with no non-empty validation),
// consistent with the adjust-balance field.
const description = z.string().max(500);

// Accepts a bare date ('YYYY-MM-DD') or a date+time ('YYYY-MM-DDTHH:MM', from
// the time-enabled DatePicker); '' means "omitted" (server defaults to now).
const optionalIsoDate = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/, 'Invalid date'), z.literal('')])
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

// Issue #46: client-side guard mirroring the backend debit rule
// (../server-infra/src/Domain/Account/CommandHandler.hs): a debit is rejected
// when `balance - amount < -overdraftLimit`. `overdraftLimit === null` means no
// limit (no check). The boundary is inclusive. `amount` is already in the source
// account's currency (the create form locks `currency` to the selected source),
// so no FX conversion is needed here.
function balanceIssue(
  accounts: AccountResponse[],
  accountId: string,
  amount: number,
): string | null {
  const acc = accounts.find((a) => a.id === accountId);
  if (!acc || acc.overdraftLimit === null || !Number.isFinite(amount)) return null;
  const available = acc.balance + acc.overdraftLimit;
  if (amount <= available) return null;
  return `Exceeds available balance (${formatMoney(available, acc.currency)})`;
}

// Create-only: expense debits `accountId`; income only credits, so it is never
// funds-constrained and the refine is a no-op for it.
export function makeIncomeExpenseFormSchema(
  accounts: AccountResponse[],
  kind: 'income' | 'expense',
) {
  return incomeExpenseFormSchema.superRefine((v, ctx) => {
    if (kind === 'income') return;
    const message = balanceIssue(accounts, v.accountId, v.amount);
    if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['amount'], message });
  });
}

// Create-only: transfer debits `sourceAccountId`. `transferFormSchema` is a
// `ZodEffects` (it carries the source ≠ target refine), so chain `.superRefine`
// — `.extend` is not available on effects.
export function makeTransferFormSchema(accounts: AccountResponse[]) {
  return transferFormSchema.superRefine((v, ctx) => {
    const message = balanceIssue(accounts, v.sourceAccountId, v.amount);
    if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['amount'], message });
  });
}

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
    date: v.date ? dateInputToWire(v.date) : undefined,
    labels: labelsOrUndefined(v.labels),
  };
}

export function toExpenseRequest(v: IncomeExpenseInput): ExpenseRequest {
  return {
    accountId: v.accountId,
    currency: v.currency,
    allocations: toAllocationsRequest('expenses', v.category, v.amount),
    description: v.description,
    date: v.date ? dateInputToWire(v.date) : undefined,
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
    date: v.date ? dateInputToWire(v.date) : undefined,
    labels: labelsOrUndefined(v.labels),
  };
}

import type { AccountResponse, TransactionResponse } from '@/api/types';

// Seed the date field as local 'YYYY-MM-DDTHH:MM' from the backend UTC
// timestamp so the edit form's time-enabled DatePicker shows the stored time
// in the viewer's timezone.
const dateToInput = (iso: string) => wireToDateInput(iso);

export function toIncomeExpenseFormValues(
  tx: TransactionResponse,
  accounts: AccountResponse[],
): IncomeExpenseFormValues {
  const income = isIncome(tx.transactionType);
  const accountId = income ? tx.targetAccountId : tx.sourceAccountId;
  const amount = income ? tx.targetAmount : tx.sourceAmount;
  const currency =
    accounts.find((a) => a.id === accountId)?.currency ??
    (income ? tx.targetCurrency : tx.sourceCurrency);
  return {
    accountId,
    amount,
    currency,
    category: tx.category ?? '',
    description: tx.description,
    date: dateToInput(tx.date),
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
    date: dateToInput(tx.date),
    labels: tx.labels,
  };
}
