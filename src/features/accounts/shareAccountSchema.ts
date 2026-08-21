import { z } from 'zod';
import { GRANTABLE_ROLES } from './roles';

// UI grants Editor/Viewer only — Owner is intentionally excluded (a granted
// Owner cannot be revoked). See docs/specs/2026-07-09-share-account-design.md.
export const shareAccountSchema = z.object({
  userId: z.string().uuid('accounts:validation.userIdInvalid'),
  role: z.enum(GRANTABLE_ROLES),
});

export type ShareAccountFormValues = z.infer<typeof shareAccountSchema>;
