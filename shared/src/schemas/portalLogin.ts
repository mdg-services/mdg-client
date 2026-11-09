import { z } from 'zod';

import { SDMS_NEW_PASSWORD_RE, SDMS_RESET_OTP_RE } from '../types/sdmsPasswordReset';

/**
 * Request bodies for the portal-login box. See `types/portalLogin.ts`.
 *
 * The limits match the admin's own credential form (`dealerCredentials.ts`) so
 * a login one side accepts the other never refuses.
 */

export const portalIdSchema = z.enum(['sdms', 'iras', 'bpcl', 'econnect', 'hpcl']);

/** A company portal (BPCL, BROMA/eConnect, HPCL): the admin's own save / read-back routes take only these. */
export const companyPortalIdSchema = z.enum(['bpcl', 'econnect', 'hpcl']);

/** `PUT /dealers/:id/company-portal-credentials/:portal` — an admin types a BPCL, BROMA/eConnect or HPCL login for the outlet. */
export const saveCompanyPortalLoginSchema = z
  .object({
    username: z.string().trim().min(1).max(200),
    password: z.string().min(1).max(500),
  })
  .strict();
export type SaveCompanyPortalLoginInput = z.infer<typeof saveCompanyPortalLoginSchema>;

/** `PUT /me/portal-logins/:portal` — an owner fills the box. */
export const savePortalLoginSchema = z
  .object({
    username: z.string().trim().min(1).max(200),
    password: z.string().min(1).max(500),
  })
  .strict();
export type SavePortalLoginInput = z.infer<typeof savePortalLoginSchema>;

/** `POST /dealers/:id/portal-login/ask` — an admin asks the outlet's owners. */
export const askPortalLoginSchema = z
  .object({
    /** Omitted: every login the outlet needs that is missing or refused, else every login it needs. */
    portals: z.array(portalIdSchema).min(1).max(2).optional(),
    /** Send the "why we need your login" video with it. */
    withVideo: z.boolean().default(true),
  })
  .strict();
export type AskPortalLoginInput = z.infer<typeof askPortalLoginSchema>;

/**
 * `PUT /me/portal-logins/sdms/reset/:id` — the OTP from the owner's phone and the
 * new password, together, because the portal takes them in one step. The
 * password is checked against the portal's own rule here, so a shape the portal
 * would refuse never costs the owner their OTP.
 */
export const answerSdmsResetSchema = z
  .object({
    otp: z.string().trim().regex(SDMS_RESET_OTP_RE, 'The OTP is the digits in the SMS'),
    password: z.string().regex(SDMS_NEW_PASSWORD_RE, 'The new password does not follow the rule'),
  })
  .strict();
export type AnswerSdmsResetInput = z.infer<typeof answerSdmsResetSchema>;
