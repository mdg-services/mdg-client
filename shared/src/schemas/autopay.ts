/**
 * Validation for autopay (types/autopay.ts, ADR 0022 §13). No schema carries an
 * amount: a new autopay takes the current monthly price, read on the server.
 */

import { z } from 'zod';

import { AUTOPAY_STOP_REASONS } from '../types/autopay';
import { MANUAL_PAYMENT_MODES } from '../types/payment';

/** The owner stopping autopay in the app. The reason is optional and never blocks the stop. */
export const stopAutopayDealerSchema = z
  .object({
    reason: z.enum(AUTOPAY_STOP_REASONS).optional(),
    /**
     * "Also give me my first month back", offered only while the first month is
     * refundable. The stop then sends no payment link, and a super-admin gets a
     * task to refund after a call. Refused (400) once the first month is over.
     */
    refundFirstMonth: z.boolean().optional(),
  })
  .strict();
export type StopAutopayDealerInput = z.infer<typeof stopAutopayDealerSchema>;

/**
 * "Send a pay link instead" (`POST /admin/autopay/dealers/:dealerId/pay-link-instead`):
 * a first-month autopay approval nobody has approved is stopped, and the first
 * bill goes out as a one-time payment link (Razorpay's SMS and email, plus the
 * bill WhatsApp). For an owner whose bank does not do UPI autopay, or who would
 * rather pay once.
 */
export const payLinkInsteadSchema = z
  .object({
    note: z.string().trim().min(3).max(300).optional(),
  })
  .strict();
export type PayLinkInsteadInput = z.infer<typeof payLinkInsteadSchema>;

/** An admin stopping it, on the owner's word: who asked and how goes in the note. */
export const stopAutopayAdminSchema = z
  .object({
    note: z.string().trim().min(3).max(300),
    reason: z.enum(AUTOPAY_STOP_REASONS).optional(),
  })
  .strict();
export type StopAutopayAdminInput = z.infer<typeof stopAutopayAdminSchema>;

/** The call after a stop is done: what the owner said. */
export const autopayFollowUpSchema = z
  .object({
    note: z.string().trim().min(3).max(500),
  })
  .strict();
export type AutopayFollowUpInput = z.infer<typeof autopayFollowUpSchema>;

/**
 * The first-month money-back (super-admin): autopay is stopped and the first bill
 * refunded in full. The note says who asked and why; it goes on the refund.
 */
export const autopayMoneyBackSchema = z
  .object({
    note: z.string().trim().min(3).max(300),
    /** Only for a first month that came by hand: how and when the money went back. */
    manual: z
      .object({
        mode: z.enum(MANUAL_PAYMENT_MODES),
        refundedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        reference: z
          .union([z.string().trim().max(120), z.literal('')])
          .optional()
          .transform((v) => (v ? v : undefined)),
      })
      .strict()
      .optional(),
  })
  .strict();
export type AutopayMoneyBackInput = z.infer<typeof autopayMoneyBackSchema>;
