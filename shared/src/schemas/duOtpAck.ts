import { z } from 'zod';

import { DU_OTP_REASONS } from '../types/duOtpAck';

/**
 * Request bodies for DU OTP Acknowledgement (ADR 0033). See `types/duOtpAck.ts`.
 *
 * One body for every answer the owner's box (and an admin filling it on the
 * owner's behalf) can give, told apart by `step`. Each answer returns the
 * outlet's whole view again, so the box never has to work out what comes next.
 */

/** A group is named by its DU serial (or make + model); never empty, never long. */
const groupKey = z.string().trim().min(1).max(120);

/** The longest remark the portal's one-line text box is given. */
export const DU_OTP_REMARKS_MAX = 200;

export const DU_OTP_FILE_SLOTS = ['certificate', 'serviceReport', 'other'] as const;
export type DuOtpFileSlot = (typeof DU_OTP_FILE_SLOTS)[number];

export const DU_OTP_EDIT_FIELDS = ['reasons', 'certificate', 'serviceReport', 'other', 'remarks'] as const;
export type DuOtpEditField = (typeof DU_OTP_EDIT_FIELDS)[number];

export const duOtpAnswerSchema = z.discriminatedUnion('step', [
  /** "Do it for me": every pending event moves to collecting. */
  z.object({ step: z.literal('start') }).strict(),
  z
    .object({
      step: z.literal('reasons'),
      group: groupKey,
      reasons: z.array(z.enum(DU_OTP_REASONS)).min(1, 'Tick at least one reason').max(4),
    })
    .strict(),
  /** A paper uploaded through `/uploads/sign` scope `du-otp`; the server makes it a PDF. */
  z
    .object({
      step: z.literal('file'),
      group: groupKey,
      slot: z.enum(DU_OTP_FILE_SLOTS),
      key: z.string().min(1).max(512),
      filename: z.string().trim().min(1).max(255),
    })
    .strict(),
  /** Use the calibration certificate MDG already holds for the outlet. */
  z.object({ step: z.literal('certificate_on_file'), group: groupKey }).strict(),
  /** Fetch the certificate from eMaaptaul; it fills every group still waiting for one. */
  z.object({ step: z.literal('certificate_fetch'), group: groupKey }).strict(),
  /** There is no other document. */
  z.object({ step: z.literal('other_skip'), group: groupKey }).strict(),
  z
    .object({
      step: z.literal('remarks'),
      group: groupKey,
      remarks: z.string().trim().min(3, 'Write a short remark').max(DU_OTP_REMARKS_MAX),
    })
    .strict(),
  /** Everything is in: file it with IndianOil. */
  z.object({ step: z.literal('submit'), group: groupKey }).strict(),
  /** Go back and answer one field again. */
  z.object({ step: z.literal('edit'), group: groupKey, field: z.enum(DU_OTP_EDIT_FIELDS) }).strict(),
]);
export type DuOtpAnswerInput = z.infer<typeof duOtpAnswerSchema>;

/** `POST /du-otp/dealers/:dealerId/submit` — an admin files a ready group, or tries the fill without submitting. */
export const duOtpAdminSubmitSchema = z
  .object({
    group: groupKey,
    /** Fill the portal's row and stop before Submit: proves the page, files nothing. */
    dryRun: z.boolean().default(false),
  })
  .strict();
export type DuOtpAdminSubmitInput = z.infer<typeof duOtpAdminSubmitSchema>;
