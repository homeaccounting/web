import { z } from 'zod';
import type { AdjustBalanceRequest } from '@/api/types';
import { dateInputToWire } from '@/lib/dates';

export const adjustBalanceFormSchema = z
  .object({
    targetBalance: z.coerce.number().finite(),
    description: z.string().trim().max(255),
    // 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM' (time-enabled picker).
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/, 'accounts:validation.dateRequired'),
  })
  .superRefine((v, ctx) => {
    const today = new Date().toISOString().slice(0, 10);
    // Compare the calendar-day part so a same-day time (e.g. today 14:30) is
    // not misread as "future".
    if (v.date.slice(0, 10) > today) {
      ctx.addIssue({
        path: ['date'],
        code: z.ZodIssueCode.custom,
        message: 'accounts:validation.dateFuture',
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
    date: dateInputToWire(values.date),
    description: values.description,
  };
}
