import { z } from 'zod';

// Mirrors backend mkEntryName (Domain/Core/Types.hs): nonempty, trimmed.
export const entryNameSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Too long'),
});
export type EntryNameFormValues = z.infer<typeof entryNameSchema>;
