import { z } from 'zod';

/**
 * Request bodies for calibration subsidy claims (ADR 0029). See
 * `types/calibrationClaim.ts`.
 */

/** "2026-27": the April–March year a claim is for. */
export const financialYearSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, 'A financial year looks like 2026-27')
  .refine((v) => Number(v.slice(5)) === (Number(v.slice(0, 4)) + 1) % 100, {
    message: 'The second year must follow the first (2026-27)',
  });

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'A date looks like 2026-03-31');

/** `POST /calibration-claim/dealers/:dealerId/claims` — an admin starts a claim. */
export const startCalibrationClaimSchema = z
  .object({
    financialYear: financialYearSchema,
  })
  .strict();
export type StartCalibrationClaimInput = z.infer<typeof startCalibrationClaimSchema>;

/** Values an admin corrects by hand. An empty string clears a correction. */
export const claimOverridesSchema = z
  .object({
    certificateNo: z.string().trim().max(40).optional(),
    validityDate: ymd.or(z.literal('')).optional(),
    receiptNo: z.string().trim().max(40).optional(),
    receiptDate: ymd.or(z.literal('')).optional(),
    calibrationDate: ymd.or(z.literal('')).optional(),
    amountPerNozzle: z.number().int().min(1).max(100_000).nullable().optional(),
    excludeSerials: z.array(z.string().trim().min(1).max(60)).max(40).optional(),
  })
  .strict();
export type ClaimOverridesInput = z.infer<typeof claimOverridesSchema>;

/**
 * `POST /calibration-claim/claims/:claimId/action` — every admin button on a
 * claim. One route, one discriminated body, so the audit trail and the "is this
 * allowed now" rules live in one place.
 */
export const calibrationClaimActionSchema = z.discriminatedUnion('type', [
  /** Go and get the papers from eMaaptaul now. */
  z.object({ type: z.literal('fetch_documents') }).strict(),
  /** Post the eMaaptaul login box to the owner. */
  z.object({ type: z.literal('ask_wemmis_login') }).strict(),
  /** Ask the owner to send the certificate and receipt in the chat instead. */
  z.object({ type: z.literal('ask_documents') }).strict(),
  /** Read SDMS again (read-only). */
  z.object({ type: z.literal('portal_check') }).strict(),
  /** Make the letter again from the current values and send it (a new signature is needed). */
  z.object({ type: z.literal('resend_letter') }).strict(),
  /** Remind the owner about the letter. */
  z.object({ type: z.literal('remind_letter') }).strict(),
  /** The signed letter the owner sent looks right: use it. */
  z.object({ type: z.literal('accept_signed_letter') }).strict(),
  /** It does not: send it back with a reason the owner will read. */
  z.object({ type: z.literal('reject_signed_letter'), reason: z.string().trim().min(4).max(500) }).strict(),
  /** Allow filing. `finalize` also presses Finalize on the portal. */
  z
    .object({
      type: z.literal('approve'),
      finalize: z.boolean(),
      /** `planHash` from the view the admin approved from; a different current plan is refused. */
      planHash: z.string().min(1).max(128).optional(),
    })
    .strict(),
  z.object({ type: z.literal('unapprove') }).strict(),
  /** File now (needs approval and the signed letter). */
  z.object({ type: z.literal('file') }).strict(),
  /** Reopen the saved claim on SDMS and press Finalize. */
  z.object({ type: z.literal('finalize') }).strict(),
  /** Try the step that stopped again. */
  z.object({ type: z.literal('retry') }).strict(),
  /** Correct values by hand. */
  z.object({ type: z.literal('override'), overrides: claimOverridesSchema }).strict(),
  /** Accept a failed warning or block after looking at it. */
  z
    .object({ type: z.literal('acknowledge_check'), key: z.string().min(1).max(60), note: z.string().trim().min(4).max(300) })
    .strict(),
  /** Record by hand what happened on the portal. */
  z
    .object({
      type: z.literal('mark_filed'),
      finalized: z.boolean(),
      portalReference: z.string().trim().max(80).optional(),
    })
    .strict(),
  z.object({ type: z.literal('cancel'), reason: z.string().trim().min(4).max(300) }).strict(),
]);
export type CalibrationClaimActionInput = z.infer<typeof calibrationClaimActionSchema>;

/** `POST /calibration-claim/claims/:claimId/documents/:slot` — an admin files a paper uploaded with scope `calibration`. */
export const claimDocumentUploadSchema = z
  .object({
    storageKey: z.string().min(1).max(512),
    filename: z.string().min(1).max(255),
    contentType: z.string().min(1).max(127),
    size: z.number().int().positive().max(10 * 1024 * 1024),
  })
  .strict();
export type ClaimDocumentUploadInput = z.infer<typeof claimDocumentUploadSchema>;

/** eMaaptaul login, typed by an admin or by the owner in the chat box. */
export const saveWemmisLoginSchema = z
  .object({
    username: z.string().trim().min(1).max(200),
    password: z.string().min(1).max(500),
  })
  .strict();
export type SaveWemmisLoginInput = z.infer<typeof saveWemmisLoginSchema>;

/** `POST /me/wemmis-login/reset` — the owner asks for an OTP on the eMaaptaul-registered mobile. */
export const startWemmisResetSchema = z
  .object({
    mobile: z.string().regex(/^[6-9]\d{9}$/, 'A 10-digit Indian mobile number'),
  })
  .strict();
export type StartWemmisResetInput = z.infer<typeof startWemmisResetSchema>;

/** `PUT /me/wemmis-login/reset/:id` — the owner types what the box asks for. */
export const answerWemmisResetSchema = z
  .object({
    otp: z.string().regex(/^\d{4,8}$/).optional(),
    captcha: z.string().trim().min(1).max(12).optional(),
    username: z.string().trim().min(1).max(200).optional(),
  })
  .strict()
  .refine((v) => v.otp !== undefined || v.captcha !== undefined || v.username !== undefined, {
    message: 'Nothing to answer',
  });
export type AnswerWemmisResetInput = z.infer<typeof answerWemmisResetSchema>;

/** `POST /calibration-claim/live/:sessionId` — an admin types a picture code the robot could not read. */
export const answerLiveCaptchaSchema = z
  .object({
    answer: z.string().trim().min(1).max(12),
  })
  .strict();
export type AnswerLiveCaptchaInput = z.infer<typeof answerLiveCaptchaSchema>;
