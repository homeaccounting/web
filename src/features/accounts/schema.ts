import { z } from 'zod';
import {
  ASSET_TYPE_KINDS,
  CARD_NETWORK_KINDS,
  SUPPORTED_CURRENCIES,
  type AccountResponse,
  type CreateAccountRequest,
} from '@/api/types';

const cashSchema = z.object({
  type: z.literal('cash'),
  storageLocation: z.string().trim().optional(),
});

const bankAccountSchema = z.object({
  type: z.literal('bankAccount'),
  bankName: z.string().trim().optional(),
  accountNumber: z.string().trim().optional(),
  cardNetwork: z.enum(CARD_NETWORK_KINDS).optional(),
});

const eWalletSchema = z.object({
  type: z.literal('eWallet'),
  provider: z.string().trim().optional(),
  accountIdentifier: z.string().trim().optional(),
});

const assetSchema = z.object({
  type: z.literal('asset'),
  assetType: z.enum(ASSET_TYPE_KINDS).optional(),
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

const baseAccountFields = {
  name: z.string().trim().min(1, 'Name is required').max(120),
  overdraftLimit: z
    .union([z.coerce.number().nonnegative(), z.literal('').transform(() => undefined)])
    .optional(),
  subtype: subtypeSchema,
};

export const createAccountFormSchema = z
  .object({
    ...baseAccountFields,
    currency: z.enum(SUPPORTED_CURRENCIES),
    initialBalance: z.coerce.number().finite(),
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

// Edit mode widens currency to z.string() because the account being edited
// may have a currency outside the four-currency enum (older accounts). The
// control is disabled in edit mode, so the value cannot drift from the
// loaded account — but the schema must accept whatever the cached
// AccountResponse holds, or zodResolver rejects on mount.
export const editAccountFormSchema = z.object({
  ...baseAccountFields,
  currency: z.string(),
});

export type EditAccountFormValues = z.infer<typeof editAccountFormSchema>;

function asEnum<T extends string>(allowed: readonly T[], value: unknown): T | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

function normaliseSubtype(subtype: AccountResponse['subtype']): EditAccountFormValues['subtype'] {
  if (!subtype) return { type: 'cash' };
  const s = subtype as Record<string, unknown> & { type: string };
  switch (s.type) {
    case 'cash':
      return {
        type: 'cash',
        storageLocation: typeof s.storageLocation === 'string' ? s.storageLocation : undefined,
      };
    case 'bankAccount':
      return {
        type: 'bankAccount',
        bankName: typeof s.bankName === 'string' ? s.bankName : undefined,
        accountNumber: typeof s.accountNumber === 'string' ? s.accountNumber : undefined,
        cardNetwork: asEnum(CARD_NETWORK_KINDS, s.cardNetwork),
      };
    case 'eWallet':
      return {
        type: 'eWallet',
        provider: typeof s.provider === 'string' ? s.provider : undefined,
        accountIdentifier:
          typeof s.accountIdentifier === 'string' ? s.accountIdentifier : undefined,
      };
    case 'asset':
      return {
        type: 'asset',
        assetType: asEnum(ASSET_TYPE_KINDS, s.assetType),
        description: typeof s.description === 'string' ? s.description : undefined,
      };
    case 'loan':
      return {
        type: 'loan',
        lender: typeof s.lender === 'string' ? s.lender : undefined,
        interestRate: typeof s.interestRate === 'number' ? s.interestRate : undefined,
        dueDate: typeof s.dueDate === 'string' ? s.dueDate : undefined,
      };
    default:
      return { type: 'cash' };
  }
}

export function fromAccountResponse(account: AccountResponse): EditAccountFormValues {
  return {
    name: account.name,
    currency: account.currency,
    overdraftLimit: account.overdraftLimit ?? undefined,
    subtype: normaliseSubtype(account.subtype),
  };
}
