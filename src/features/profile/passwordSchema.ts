import { z } from 'zod';

export const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'profile:validation.currentPasswordRequired'),
    newPassword: z.string().min(8, 'profile:validation.passwordMinLength'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    path: ['confirmPassword'],
    message: 'profile:validation.passwordsMismatch',
  });
export type PasswordFormValues = z.infer<typeof passwordSchema>;
