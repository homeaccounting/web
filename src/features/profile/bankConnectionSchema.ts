import { z } from 'zod';
import type { BankProviderCategory, BankProviderDTO } from '@/api/types';

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

// One entry of the unified provider-category → category map (tracker#51/#52/#55).
// A key is an ISO-18245 MCC (`ByMcc`), a provider's own label (`ByLabel`), or a
// universal counterparty token (`ByCounterparty` — EDRPOU/IBAN/stable
// descriptor). `value` is the 4-digit code for an mcc row, the free-text label
// for a label row, or the trimmed token for a counterparty row. Mirrors backend
// `Domain.Core.Types.BankProviderCategory`.
export const bankProviderCategoryRowSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('mcc'),
    value: z.string().regex(/^\d{4}$/, 'MCC must be 4 digits'),
    categoryId: z.string().uuid('Pick a category'),
  }),
  z.object({
    kind: z.literal('label'),
    // Backend `mkByLabel` trims and rejects blank — mirror that here.
    value: z.string().trim().min(1, 'Label is required'),
    categoryId: z.string().uuid('Pick a category'),
  }),
  z.object({
    kind: z.literal('counterparty'),
    // Backend `mkByCounterparty` trims and rejects blank — mirror that here.
    value: z.string().trim().min(1, 'Counterparty token is required'),
    categoryId: z.string().uuid('Pick a category'),
  }),
]);
export type BankProviderCategoryRow = z.infer<typeof bankProviderCategoryRowSchema>;

// Tagged text key form shared with the backend map keys: `"mcc:0742"` /
// `"label:eating_out"`. Mirrors backend `renderBankProviderCategoryKey` /
// `parseBankProviderCategoryKey` (Domain/Core/Types.hs): split on the FIRST
// colon only, so a label containing colons round-trips.
export function renderBankProviderCategoryKey(c: BankProviderCategory): string {
  return `${c.kind}:${c.value}`;
}

export function parseBankProviderCategoryKey(key: string): BankProviderCategory | null {
  const idx = key.indexOf(':');
  if (idx === -1) return null;
  const prefix = key.slice(0, idx);
  const value = key.slice(idx + 1);
  if (prefix === 'mcc' || prefix === 'label' || prefix === 'counterparty')
    return { kind: prefix, value };
  return null;
}

// One entry of the provider-token → contact map (tracker#54). Unlike the
// category map there is no kind tag: the key is the bare trimmed token (backend
// `mkBankProviderContact` trims and rejects blank — mirror that here). `contactId`
// is a contact dictionary-entry id.
export const bankProviderContactRowSchema = z.object({
  token: z.string().trim().min(1, 'Token is required'),
  contactId: z.string().uuid('Pick a contact'),
});
export type BankProviderContactRow = z.infer<typeof bankProviderContactRowSchema>;
