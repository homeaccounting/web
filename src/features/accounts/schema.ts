import { z } from 'zod';
import type { CreateAccountRequest } from '@/api/types';

const cashSchema = z.object({
  type: z.literal('cash'),
  storageLocation: z.string().trim().optional(),
});

const bankAccountSchema = z.object({
  type: z.literal('bankAccount'),
  bankName: z.string().trim().optional(),
  accountNumber: z.string().trim().optional(),
  cardNetwork: z.enum(['visa', 'mastercard', 'amex']).optional(),
});

const eWalletSchema = z.object({
  type: z.literal('eWallet'),
  provider: z.string().trim().optional(),
  accountIdentifier: z.string().trim().optional(),
});

const assetSchema = z.object({
  type: z.literal('asset'),
  assetType: z.enum(['property', 'vehicle', 'stocks', 'retirementFund']).optional(),
  description: z.string().trim().optional(),
});

const loanSchema = z.object({
  type: z.literal('loan'),
  lender: z.string().trim().optional(),
  interestRate: z.coerce.number().min(0).max(100).optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const subtypeSchema = z.discriminatedUnion('type', [
  cashSchema,
  bankAccountSchema,
  eWalletSchema,
  assetSchema,
  loanSchema,
]);

export const createAccountFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(120),
    currency: z.enum(['UAH', 'USD', 'EUR', 'GBP']),
    initialBalance: z.coerce.number().finite(),
    overdraftLimit: z
      .union([z.coerce.number().nonnegative(), z.literal('').transform(() => undefined)])
      .optional(),
    subtype: subtypeSchema,
  })
  .superRefine((v, ctx) => {
    if (v.initialBalance < 0) {
      if (v.overdraftLimit === undefined || v.overdraftLimit === null) {
        ctx.addIssue({
          path: ['overdraftLimit'],
          code: z.ZodIssueCode.custom,
          message: 'Overdraft limit is required when initial balance is negative.',
        });
      } else if (Math.abs(v.initialBalance) > v.overdraftLimit) {
        ctx.addIssue({
          path: ['overdraftLimit'],
          code: z.ZodIssueCode.custom,
          message: 'Overdraft limit must be at least |initial balance|.',
        });
      }
    }
  });

export type CreateAccountFormValues = z.infer<typeof createAccountFormSchema>;

// Strip empty optionals and shape values into the backend DTO.
export function toCreateAccountRequest(values: CreateAccountFormValues): CreateAccountRequest {
  const subtype: CreateAccountRequest['subtype'] = stripEmpty(values.subtype);
  const out: CreateAccountRequest = {
    name: values.name,
    currency: values.currency,
    initialBalance: values.initialBalance,
    subtype,
  };
  if (values.overdraftLimit !== undefined) out.overdraftLimit = values.overdraftLimit;
  return out;
}

function stripEmpty<T extends object>(obj: T): T {
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== '') cleaned[k] = v;
  }
  return cleaned as T;
}
