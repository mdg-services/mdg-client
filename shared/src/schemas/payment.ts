/**
 * Validation for payments as they reach the API (types/payment.ts, ADR 0022).
 *
 * No schema here carries an amount the dealer's browser chose. The admin sets
 * the amount when raising a payment; the dealer only ever names WHICH payment,
 * and the server reads the amount off the row.
 */

import { z } from 'zod';

import { GST_STATES, isGstin, cleanGstin } from '../lib/gst';
import { SETUP_MESSAGE_LANGS } from '../types/outletSetup';
import {
  MANUAL_PAYMENT_MODES,
  PAYMENT_MAX_PAISE,
  PAYMENT_MIN_PAISE,
  PAYMENT_PURPOSES,
  PAYMENT_STATUSES,
} from '../types/payment';

import { objectIdSchema } from './common';

const paise = z.number().int().min(PAYMENT_MIN_PAISE).max(PAYMENT_MAX_PAISE);

/** Optional text where "" means "not given". */
const optionalText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.literal('')])
    .optional()
    .transform((v) => (v ? v : undefined));

/**
 * Who the invoice is made out to. A GSTIN, when given, must be a real one, and
 * its first two digits ARE the place of supply — a different state alongside
 * it is refused rather than silently believed.
 */
export const billToSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    gstin: z
      .union([z.string().trim(), z.literal(''), z.null()])
      .optional()
      .transform((v) => (v ? cleanGstin(v) : null))
      .refine((v) => v === null || isGstin(v), { message: 'Not a valid GSTIN' }),
    address: z.string().trim().min(5).max(300),
    stateCode: z.string().refine((v) => v in GST_STATES, { message: 'Unknown state' }),
  })
  .refine((b) => b.gstin === null || b.gstin.slice(0, 2) === b.stateCode, {
    message: 'The state must be the one in the GSTIN',
    path: ['stateCode'],
  });
export type BillToInput = z.infer<typeof billToSchema>;

/** An admin raising a payment for one outlet. */
export const createPaymentSchema = z.object({
  dealerId: objectIdSchema,
  title: z.string().trim().min(3).max(120),
  purpose: z.enum(PAYMENT_PURPOSES),
  amountPaise: paise,
  /** `YYYY-MM-DD`. */
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  note: optionalText(500),
  /**
   * Make a Razorpay payment link at once and have Razorpay send it by SMS (and
   * email, when there is one). On unless the admin turns it off. The phone and
   * email default to the outlet owner's; `contact` overrides them.
   */
  sendLink: z.boolean().default(true),
  contact: z
    .object({
      name: optionalText(120),
      /** A 10-digit Indian mobile, optionally with +91. */
      phone: z
        .string()
        .trim()
        .regex(/^(\+?91)?[6-9]\d{9}$/)
        .optional(),
      email: z.string().trim().email().max(200).optional(),
    })
    .optional(),
  /** Who the GST invoice is made out to. Can be set later, until the invoice is issued. */
  billTo: billToSchema.optional(),
});
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

/** Setting or correcting who to bill, while no invoice has been issued. */
export const updateBillToSchema = z.object({ billTo: billToSchema });
export type UpdateBillToInput = z.infer<typeof updateBillToSchema>;

export const cancelPaymentSchema = z.object({
  reason: z.string().trim().min(3).max(300),
});
export type CancelPaymentInput = z.infer<typeof cancelPaymentSchema>;

/** Leave `amountPaise` out to refund everything not yet refunded. */
export const refundPaymentSchema = z.object({
  amountPaise: paise.optional(),
  reason: z.string().trim().min(3).max(300),
});
export type RefundPaymentInput = z.infer<typeof refundPaymentSchema>;

/**
 * What Razorpay's pop-up hands the browser after a successful payment. Only
 * the signature makes it worth anything: the server recomputes it from the
 * order id it created and the payment id, with the key secret.
 */
export const verifyCheckoutSchema = z.object({
  razorpayOrderId: z.string().regex(/^order_[A-Za-z0-9]{6,40}$/),
  razorpayPaymentId: z.string().regex(/^pay_[A-Za-z0-9]{6,40}$/),
  razorpaySignature: z.string().regex(/^[a-f0-9]{64}$/),
});
export type VerifyCheckoutInput = z.infer<typeof verifyCheckoutSchema>;

export const adminPaymentsQuerySchema = z.object({
  status: z.enum(PAYMENT_STATUSES).optional(),
  dealerId: objectIdSchema.optional(),
  /** Matches the receipt number, the title, or a Razorpay order / payment / link id. */
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type AdminPaymentsQuery = z.infer<typeof adminPaymentsQuerySchema>;

/**
 * Record money that came outside Razorpay against a due payment.
 * The amount may be short of the payment's (TDS deducted at source): the row is
 * then paid for what came, and the shortfall is visible on it.
 */
export const recordManualPaymentSchema = z
  .object({
    amountPaise: paise,
    paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    mode: z.enum(MANUAL_PAYMENT_MODES),
    reference: optionalText(120),
  })
  .strict();
export type RecordManualPaymentInput = z.infer<typeof recordManualPaymentSchema>;

/**
 * "Send bill" for an outlet's onboarding (`POST /dealers/:id/setup/bill`). Every
 * field is optional: the amount is the flat monthly price and the due date is
 * `PAYMENT_DUE_DAYS` ahead unless the person says otherwise. Whatever the amount,
 * it is GST included, in whole paise, within what a payment may be.
 */
export const sendSetupBillRequestSchema = z
  .object({
    amountPaise: paise.optional(),
    dueOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
      .optional(),
    /**
     * The language of the bill's WhatsApp message, one language: Hinglish (`hi`) or
     * English (`en`). Unset: the outlet's default (`services/outletSetup/messageLang.ts`).
     */
    messageLang: z.enum(SETUP_MESSAGE_LANGS).optional(),
  })
  .strict();
export type SendSetupBillRequest = z.infer<typeof sendSetupBillRequestSchema>;

/**
 * A refund made by hand (`POST /admin/payments/:id/manual-refund`, super-admin):
 * money that came outside Razorpay, given back outside it — by bank, UPI, cash or
 * cheque. Recording it reduces what the payment counts as paid and issues the
 * credit note. At most what is still unrefunded; the day is the day it went back.
 */
export const recordManualRefundSchema = z
  .object({
    amountPaise: paise,
    refundedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    mode: z.enum(MANUAL_PAYMENT_MODES),
    reference: optionalText(120),
    reason: z.string().trim().min(3).max(300),
  })
  .strict();
export type RecordManualRefundInput = z.infer<typeof recordManualRefundSchema>;
