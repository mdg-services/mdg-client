import { z } from 'zod';

/**
 * Sign in. `identifier` is an email or a mobile number (dealers mostly have no
 * email, and the mobile is required at registration). `email` is the older
 * field name, still accepted so the admin and older app builds keep working;
 * the server reads whichever came. Admins sign in by email only.
 */
export const loginSchema = z
  .object({
    identifier: z.string().trim().min(3).max(200).optional(),
    email: z.string().trim().email().toLowerCase().optional(),
    password: z.string().min(8).max(200),
  })
  .refine((v) => Boolean(v.identifier || v.email), {
    message: 'Enter your mobile number or email',
    path: ['identifier'],
  });
export type LoginInput = z.infer<typeof loginSchema>;

/** Change your own password. Required before anything else after signing in with a temporary one. */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(200),
    newPassword: z.string().min(8).max(200),
  })
  .strict()
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: 'Choose a new password',
    path: ['newPassword'],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** "Forgot password": raises a request the team handles by calling the registered number. Always answers the same. */
export const forgotPasswordSchema = z
  .object({ identifier: z.string().trim().min(3).max(200) })
  .strict();
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
