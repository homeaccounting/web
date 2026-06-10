import { z } from 'zod';
import type { AdjustBalanceRequest } from '@/api/types';

export const adjustBalanceFormSchema = z
  .object({
    targetBalance: z.coerce.number().finite(),
    description: z.string().trim().max(255),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date is required'),
  })
  .superRefine((v, ctx) => {
    const today = new Date().toISOString().slice(0, 10);
    if (v.date > today) {
      ctx.addIssue({
        path: ['date'],
        code: z.ZodIssueCode.custom,
        message: 'Date cannot be in the future.',
      });
    }
  });

export type AdjustBalanceFormValues = z.infer<typeof adjustBalanceFormSchema>;

export function toAdjustBalanceRequest(
  values: AdjustBalanceFormValues,
  currency: string,
): AdjustBalanceRequest {
  return {
    targetBalance: values.targetBalance,
    currency,
    date: `${values.date}T00:00:00.000Z`,
    description: values.description,
  };
}
