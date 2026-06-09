import { z } from 'zod';

export const bankConnectionFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  provider: z.literal('monobank'),
  // Write-only. Required on create; on edit, blank means "keep existing".
  token: z.string().trim().optional(),
  enabled: z.boolean(),
});
export type BankConnectionFormValues = z.infer<typeof bankConnectionFormSchema>;

export const mccRowSchema = z.object({
  mcc: z.string().regex(/^\d{4}$/, 'MCC must be 4 digits'),
  categoryId: z.string().uuid('Pick a category'),
});
export type MccRow = z.infer<typeof mccRowSchema>;
