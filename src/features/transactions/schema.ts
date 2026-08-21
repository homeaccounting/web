import { z } from 'zod';
import type {
  AllocationsRequest,
  ExpenseRequest,
  IncomeRequest,
  InternalTransferRequest,
  UUID,
} from '@/api/types';
import { isIncome } from './transactionType';
import { normalizeComment, sliceArraysFromTx } from './allocations';
import { dateInputToWire, wireToDateInput } from '@/lib/dates';
import { formatMoney } from '@/lib/format';
import { roundMoney } from '@/lib/money';
import i18n from '@/lib/i18n';

const uuid = z.string().uuid();
// Static validation messages are stored as i18n KEYS; `FormMessage` translates
// them at render (live language switch). Dynamic messages that embed a formatted
// money value are resolved via `i18n.t(...)` at validation time (inside the
// refinement callbacks below) because `FormMessage` cannot pass interpolation
// values — those i18n.t calls run per validation, never at module load.
const positiveAmount = z.coerce.number().positive('transactions:validation.amountPositive');
// Optional: an empty description is allowed. The backend accepts an empty
// `description` (Web/Types.hs `description :: Text` with no non-empty validation),
// consistent with the adjust-balance field.
const description = z.string().max(500);

// Required transaction date. Accepts a bare date ('YYYY-MM-DD') or a date+time
// ('YYYY-MM-DDTHH:MM', from the time-enabled DatePicker). Empty/malformed is
// rejected — the create dialogs pre-fill the current datetime, so the field is
// never blank unless the user clears it. Mirrors adjustBalanceSchema's date.
const requiredIsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/, 'transactions:validation.dateRequired');

// One allocation row in the form. The total of a transaction is the sum of all
// slice amounts across both buckets; there is no separate top-level amount.
const sliceSchema = z.object({
  category: uuid,
  amount: z.coerce.number().positive('transactions:validation.amountPositive'),
  comment: z.string().max(500).optional(),
});

export const incomeExpenseFormSchema = z.object({
  accountId: uuid,
  currency: z.string().min(1),
  incomes: z.array(sliceSchema),
  expenses: z.array(sliceSchema),
  description,
  date: requiredIsoDate,
  labels: z.array(uuid).default([]),
  // Optional contact link (tracker#41). Nullable scalar: `null` means "no
  // contact". Mirrors `ExpenseRequest.contactId` in src/api/types.ts.
  contactId: z.string().nullable().default(null),
  // Client-side authoring aid for multi-allocation entry (tracker#32). Never
  // sent to the backend — request mappers read only their known fields.
  targetMode: z.boolean().default(false),
  // Blank stays blank; a typed value coerces to a number. The empty-vs-mismatch
  // distinction is validated in refineAllocations. z.literal('') must come
  // first so an empty string is preserved rather than coerced to 0.
  targetTotal: z.union([z.literal(''), z.coerce.number()]).default(''),
});

// The form-values shape (post-parse, slices coerced). Declared explicitly so the
// `labels` default surfaces as a required `string[]` to consumers.
export type IncomeExpenseFormValues = {
  accountId: string;
  currency: string;
  incomes: { category: string; amount: number; comment?: string }[];
  expenses: { category: string; amount: number; comment?: string }[];
  description: string;
  date: string;
  labels: string[];
  contactId: string | null;
  targetMode?: boolean;
  targetTotal?: number | '';
};

export const transferFormSchema = z
  .object({
    sourceAccountId: uuid,
    targetAccountId: uuid,
    amount: positiveAmount,
    currency: z.string().min(1),
    description,
    exchangeRate: z.coerce.number().positive().optional(),
    date: requiredIsoDate,
    labels: z.array(uuid).default([]),
  })
  .refine((v) => v.sourceAccountId !== v.targetAccountId, {
    message: 'transactions:validation.accountsMustDiffer',
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
  return i18n.t('transactions:validation.exceedsBalance', {
    amount: formatMoney(available, acc.currency),
  });
}

// Kind-aware refinement shared by create AND edit. Pass `accounts: null` when
// balance enforcement is off — the empty/contra checks still run.
//
// `opts.targetCeiling` (tracker#33): when true, a locked target is a CEILING, not
// an exact target — allocations may sum to <= target (partial allowed); only
// going OVER is blocked. Default (false/absent) keeps the equality gate used by
// create/edit's target-total UX (tracker#32) exactly as-is.
function refineAllocations(
  kind: 'income' | 'expense',
  accounts: AccountResponse[] | null,
  opts?: { targetCeiling?: boolean },
) {
  return (v: IncomeExpenseFormValues, ctx: z.RefinementCtx) => {
    if (v.incomes.length + v.expenses.length === 0)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expenses'],
        message: 'transactions:validation.addCategory',
      });
    if (kind === 'expense' && v.incomes.length > 0)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['incomes'],
        message: 'transactions:validation.expenseNoIncome',
      });
    if (kind === 'expense' && accounts) {
      // Expense debits `accountId`; the debited total is the sum of expense
      // slices. Income only credits, so it is never funds-constrained.
      const total = v.expenses.reduce((s, r) => s + r.amount, 0);
      const message = balanceIssue(accounts, v.accountId, total);
      if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['expenses'], message });
    }
    if (v.targetMode) {
      // `targetTotal` is `'' | number` after zod defaults, so `=== undefined`
      // never fires via `superRefine`; it's defensive for the optional param type.
      if (
        v.targetTotal === '' ||
        v.targetTotal === undefined ||
        !Number.isFinite(Number(v.targetTotal))
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['targetTotal'],
          message: 'transactions:validation.enterTargetTotal',
        });
      } else {
        const sum = roundMoney(
          v.incomes.reduce((s, r) => s + r.amount, 0) +
            v.expenses.reduce((s, r) => s + r.amount, 0),
        );
        const target = roundMoney(Number(v.targetTotal));
        const diff = roundMoney(target - sum);
        if (opts?.targetCeiling) {
          // Ceiling mode: only block going OVER the target (diff < 0); a sum
          // <= target (short or exact) is allowed. `diff < -0.005` ⇔ over by
          // more than sub-cent.
          if (diff < -0.005) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['expenses'],
              message: i18n.t('transactions:validation.overTarget', {
                amount: formatMoney(-diff, v.currency),
              }),
            });
          }
        } else if (Math.abs(diff) >= 0.005) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['expenses'],
            message:
              diff > 0
                ? i18n.t('transactions:validation.shortOfTarget', {
                    amount: formatMoney(diff, v.currency),
                  })
                : i18n.t('transactions:validation.overTarget', {
                    amount: formatMoney(-diff, v.currency),
                  }),
          });
        }
      }
    }
  };
}

export function makeIncomeExpenseFormSchema(
  accounts: AccountResponse[] | null,
  kind: 'income' | 'expense',
  opts?: { targetCeiling?: boolean },
) {
  return incomeExpenseFormSchema.superRefine(refineAllocations(kind, accounts, opts));
}

// Produces a `superRefine` callback that enforces partial-refund caps. Each
// expense slice must not exceed its per-category remaining, and the total of
// all expense slices must not exceed `remainingTotal`. Used by the refund
// dialog (tracker#33) to chain onto the shared income/expense form schema.
export function refundAllocationCaps(
  remainingByCategory: Record<string, number>,
  remainingTotal: number,
) {
  return (v: IncomeExpenseFormValues, ctx: z.RefinementCtx) => {
    let total = 0;
    v.expenses.forEach((row, index) => {
      total += row.amount;
      const cap = roundMoney(remainingByCategory[row.category] ?? 0);
      if (roundMoney(row.amount) - cap > 0.005) {
        // Per-slice cap lives on the row's amount field so it surfaces at the
        // row's FormMessage, distinct from the section-level `['expenses']` path
        // used by the total cap below and by the shared target-total check
        // (schema.ts refineAllocations). The resolver keeps only the first issue
        // per path, so a same-path collision would let the target message mask
        // this more specific cap. `path[0]` stays `'expenses'`, so schema-level
        // assertions keyed on the bucket are unaffected.
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['expenses', index, 'amount'],
          message: i18n.t('transactions:validation.refundCategoryCap', {
            amount: formatMoney(cap, v.currency),
          }),
        });
      }
    });
    if (roundMoney(total) - roundMoney(remainingTotal) > 0.005) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expenses'],
        message: i18n.t('transactions:validation.refundTotalCap', {
          amount: formatMoney(remainingTotal, v.currency),
        }),
      });
    }
  };
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

// Each form row maps 1:1 to an allocation slice. The categorised total is the
// sum of the slice amounts across both buckets (no top-level amount).
const toReqSlices = (
  rows: { category: string; amount: number; comment?: string }[],
): AllocationsRequest['incomes'] =>
  rows.map((r) => ({
    category: r.category,
    amount: r.amount,
    comment: normalizeComment(r.comment),
  }));

export function toIncomeRequest(v: IncomeExpenseInput): IncomeRequest {
  return {
    accountId: v.accountId,
    currency: v.currency,
    allocations: { incomes: toReqSlices(v.incomes), expenses: toReqSlices(v.expenses) },
    description: v.description,
    date: dateInputToWire(v.date),
    labels: labelsOrUndefined(v.labels),
    contactId: v.contactId ?? null,
  };
}

// Structurally identical: the expense form guarantees `incomes: []` by
// construction (refineAllocations rejects income slices on an expense).
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
    date: dateInputToWire(v.date),
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
  const currency =
    accounts.find((a) => a.id === accountId)?.currency ??
    (income ? tx.targetCurrency : tx.sourceCurrency);
  const { incomes, expenses } = sliceArraysFromTx(tx);
  return {
    accountId,
    currency,
    incomes,
    expenses,
    description: tx.description,
    date: dateToInput(tx.date),
    labels: tx.labels,
    contactId: tx.contactId ?? null,
    targetMode: false,
    targetTotal: '',
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
