/**
 * Validation for payments as they reach the API (types/payment.ts, ADR 0022).
 *
 * No schema here carries an amount the dealer's browser chose. The admin sets
 * the amount when raising a payment; the dealer only ever names WHICH payment,
 * and the server reads the amount off the row.
 */

import { z } from 'zod';

import {
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
});
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

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
