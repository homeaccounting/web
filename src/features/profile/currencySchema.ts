import { z } from 'zod';
import { SUPPORTED_CURRENCIES } from '@/api/types';

export const currencySchema = z.object({
  currency: z.enum(SUPPORTED_CURRENCIES),
});
export type CurrencyFormValues = z.infer<typeof currencySchema>;
