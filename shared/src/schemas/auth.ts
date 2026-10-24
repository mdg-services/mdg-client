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

/** Switch to another of the same person's outlets (`OutletChoice.userId`). Answers a fresh token. */
export const switchOutletSchema = z.object({ userId: z.string().regex(/^[0-9a-f]{24}$/) }).strict();
export type SwitchOutletInput = z.infer<typeof switchOutletSchema>;

/** "Forgot password": raises a request the team handles by calling the registered number. Always answers the same. */
export const forgotPasswordSchema = z
  .object({ identifier: z.string().trim().min(3).max(200) })
  .strict();
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

// ── "Forgot password" by a code on WhatsApp or by email ─────────────────────
// Three public steps (no token yet): ask for a code, hand the code in, choose a
// new password. `forgotPasswordSchema` above stays for the "ask the team to call
// me" fallback.

/** Where a reset code can be sent. */
export const PASSWORD_RESET_CHANNELS = ['whatsapp', 'email'] as const;
export type PasswordResetChannel = (typeof PASSWORD_RESET_CHANNELS)[number];

/** The code is this many digits, and nothing else. */
export const PASSWORD_RESET_CODE_LENGTH = 6;

/** Step 1. Always answers `{ sent: true }`, whether or not the account exists. */
export const resetRequestSchema = z
  .object({
    identifier: z.string().trim().min(3).max(200),
    channel: z.enum(PASSWORD_RESET_CHANNELS),
  })
  .strict();
export type ResetRequestInput = z.infer<typeof resetRequestSchema>;

/** Step 2. The code from the message; answers a one-time `resetToken`. */
export const resetVerifySchema = z
  .object({
    identifier: z.string().trim().min(3).max(200),
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/, 'The code is 6 digits'),
  })
  .strict();
export type ResetVerifyInput = z.infer<typeof resetVerifySchema>;

/** Step 3. The token from step 2 and the password the person chose (same rule as every password). */
export const resetConfirmSchema = z
  .object({
    resetToken: z.string().regex(/^[A-Za-z0-9_-]{20,200}$/, 'Not a reset token'),
    newPassword: z.string().min(8).max(200),
  })
  .strict();
export type ResetConfirmInput = z.infer<typeof resetConfirmSchema>;

/** Which channels the server can send a code on at all (`GET /auth/password-reset/options`). */
export interface PasswordResetOptions {
  whatsapp: boolean;
  email: boolean;
}
