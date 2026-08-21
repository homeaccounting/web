import { z } from 'zod';

// Mirrors backend mkEntryName (Domain/Core/Types.hs): nonempty, trimmed.
export const entryNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'profile:validation.nameRequired')
    .max(100, 'profile:validation.nameTooLong'),
});
export type EntryNameFormValues = z.infer<typeof entryNameSchema>;
