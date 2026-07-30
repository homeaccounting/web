import { z } from 'zod';
import type { BankProviderDTO } from '@/api/types';

export const bankConnectionFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  // Data-driven (tracker#38 pluggable providers): any provider id returned by
  // GET .../banking/providers, not a hardcoded literal.
  provider: z.string().min(1, 'Provider is required'),
  // Write-only. Required on create when the chosen provider supports pull
  // (poll-based sync needs a credential up front); on edit, blank means "keep
  // existing". File-only providers never need a token — see
  // makeBankConnectionFormSchema.
  token: z.string().trim().optional(),
  enabled: z.boolean(),
});
export type BankConnectionFormValues = z.infer<typeof bankConnectionFormSchema>;

// Provider-capability-aware conditional requirements, built with the fetched
// provider list — same idiom as makeTransferFormSchema/makeIncomeExpenseFormSchema
// in features/transactions/schema.ts, which take external data (accounts) as a
// parameter and layer a `.superRefine` on top of the base object schema.
//
// Edit mode never requires a token (blank token = keep existing), so the
// refinement is a no-op there. File-only connections are created unmapped —
// their accountMap is built afterwards via "Link accounts" — so create mode
// only requires a token for pull providers.
export function makeBankConnectionFormSchema(providers: BankProviderDTO[], isEdit: boolean) {
  return bankConnectionFormSchema.superRefine((v, ctx) => {
    if (isEdit) return;
    // No provider chosen yet: the base `provider: z.string().min(1)` check
    // already reports "Provider is required" — skip the token check below so
    // that case doesn't also show a spurious second error.
    if (v.provider === '') return;
    const provider = providers.find((p) => p.id === v.provider);
    // Fail-soft default when the provider list hasn't loaded (or the chosen id
    // isn't in it): treat as a pull provider, matching the pre-tracker#38
    // monobank-only behavior.
    const supportsPull = provider?.supportsPull ?? true;
    if (supportsPull && (v.token ?? '').trim() === '') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['token'], message: 'Token is required' });
    }
  });
}

export const mccRowSchema = z.object({
  mcc: z.string().regex(/^\d{4}$/, 'MCC must be 4 digits'),
  categoryId: z.string().uuid('Pick a category'),
});
export type MccRow = z.infer<typeof mccRowSchema>;
