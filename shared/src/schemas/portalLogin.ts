import { z } from 'zod';

/**
 * Request bodies for the portal-login box. See `types/portalLogin.ts`.
 *
 * The limits match the admin's own credential form (`dealerCredentials.ts`) so
 * a login one side accepts the other never refuses.
 */

export const portalIdSchema = z.enum(['sdms', 'iras', 'bpcl', 'econnect', 'hpcl', 'partners']);

/**
 * A login nothing tries on its own: a company portal (BPCL, BROMA/eConnect, HPCL) or
 * IndianOil Partners. The admin's own save / read-back routes under
 * `/company-portal-credentials/:portal` take only these.
 */
export const companyPortalIdSchema = z.enum(['bpcl', 'econnect', 'hpcl', 'partners']);

/** `PUT /dealers/:id/company-portal-credentials/:portal` — an admin types a BPCL, BROMA/eConnect, HPCL or IndianOil Partners login for the outlet. */
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
    portals: z.array(portalIdSchema).min(1).max(3).optional(),
    /** Send the "why we need your login" video with it. */
    withVideo: z.boolean().default(true),
  })
  .strict();
export type AskPortalLoginInput = z.infer<typeof askPortalLoginSchema>;

/**
 * `POST /me/portal-logins/:portal/reset` — the owner's "Forgot password?". The user ID
 * (for IndianOil Partners, the vendor SAP code) is the saved one; an owner with none
 * saved types it here.
 */
export const resetPortalPasswordSchema = z
  .object({
    username: z.string().trim().min(1).max(200).optional(),
  })
  .strict();
export type ResetPortalPasswordInput = z.infer<typeof resetPortalPasswordSchema>;

/** `PUT /me/portal-logins/tanker` and the admin's `PUT /dealers/:id/portal-logins/tanker`: does the owner run a tanker? */
export const saveTankerAnswerSchema = z.object({ owns: z.boolean() }).strict();
export type SaveTankerAnswerInput = z.infer<typeof saveTankerAnswerSchema>;
