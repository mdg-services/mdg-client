/**
 * Validation for onboarding v2 (types/outletSetup.ts): what the owner saves on
 * the setup cards, and what an admin does at MDG's four points — approve, send
 * the bill, record the payment, start the services.
 */

import { z } from 'zod';

import { GST_STATES, cleanGstin, isGstin } from '../lib/gst';
import { SETUP_CALL_OUTCOMES, SETUP_PAYMENT_MODES, SETUP_SERVICE_IDS } from '../types/outletSetup';

import { dealerCodeSchema } from './dealer';

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

/** The owner's ticks. The server adds whatever a choice requires; at least one. */
export const chooseSetupServicesSchema = z
  .object({
    serviceIds: z.array(z.enum(SETUP_SERVICE_IDS)).min(1).max(SETUP_SERVICE_IDS.length),
  })
  .strict();
export type ChooseSetupServicesInput = z.infer<typeof chooseSetupServicesSchema>;

/**
 * The billing card. A GSTIN is optional and never blocks anything; when given
 * it must be a real one (shape, state, check character) and the state is read
 * from it, so a mismatching `stateCode` is corrected rather than refused.
 */
export const saveSetupBillingSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    address: z.string().trim().min(5).max(300),
    stateCode: z.string().refine((c) => Boolean(GST_STATES[c]), 'Pick a state'),
    gstin: z
      .union([z.string(), z.literal(''), z.null()])
      .optional()
      .transform((v) => (v ? cleanGstin(v) : null))
      .refine((v) => v === null || isGstin(v), 'Check the GSTIN'),
  })
  .strict()
  .transform((v) => ({ ...v, stateCode: v.gstin ? v.gstin.slice(0, 2) : v.stateCode }));
export type SaveSetupBillingInput = z.infer<typeof saveSetupBillingSchema>;

/** Approve a registration. The code defaults to the next free one. */
export const approveRegistrationSchema = z
  .object({
    code: dealerCodeSchema.optional(),
  })
  .strict();
export type ApproveRegistrationInput = z.infer<typeof approveRegistrationSchema>;

/** Close a registration or an outlet's setup: the lead said no, or went silent for good. */
export const closeSetupSchema = z.object({ reason: z.string().trim().min(3).max(500) }).strict();
export type CloseSetupInput = z.infer<typeof closeSetupSchema>;

/**
 * "Bill sent": the team sent the bill outside the app and records what and
 * when. Interim until the payments branch lands (then a Payment row is raised).
 */
export const sendSetupBillSchema = z
  .object({
    amountPaise: z.number().int().positive().max(100_000_000),
    dueOn: isoDay,
  })
  .strict();
export type SendSetupBillInput = z.infer<typeof sendSetupBillSchema>;

/** "Payment received" for money that came by UPI, bank transfer, cash or cheque. Super-admin. */
export const recordSetupPaymentSchema = z
  .object({
    amountPaise: z.number().int().positive().max(100_000_000),
    paidOn: isoDay,
    mode: z.enum(SETUP_PAYMENT_MODES),
    reference: z
      .string()
      .trim()
      .max(120)
      .optional()
      .transform((v) => (v ? v : undefined)),
  })
  .strict();
export type RecordSetupPaymentInput = z.infer<typeof recordSetupPaymentSchema>;

/** Start services: watch for `watchDays` (default 2). A missing checklist item needs a reason. */
export const startSetupServicesSchema = z
  .object({
    watchDays: z.number().int().min(0).max(7).default(2),
    overrideReason: z
      .string()
      .trim()
      .max(500)
      .optional()
      .transform((v) => (v ? v : undefined)),
  })
  .strict();
export type StartSetupServicesInput = z.infer<typeof startSetupServicesSchema>;

/** End the watch now, or extend it by whole days. */
export const changeSetupWatchSchema = z.union([
  z.object({ action: z.literal('end') }).strict(),
  z.object({ action: z.literal('extend'), days: z.number().int().min(1).max(7) }).strict(),
]);
export type ChangeSetupWatchInput = z.infer<typeof changeSetupWatchSchema>;

/** Log a call to a registration or a new outlet. `nextCallOn` only with `call_later`. */
export const logSetupCallSchema = z
  .object({
    outcome: z.enum(SETUP_CALL_OUTCOMES),
    note: z
      .string()
      .trim()
      .max(300)
      .optional()
      .transform((v) => (v ? v : undefined)),
    nextCallOn: isoDay.optional(),
  })
  .strict()
  .refine((v) => v.outcome === 'call_later' || v.nextCallOn === undefined, {
    message: 'A next-call date goes with "call later" only',
    path: ['nextCallOn'],
  });
export type LogSetupCallInput = z.infer<typeof logSetupCallSchema>;

/** Pause an outlet's services for non-payment, with a reason. Resuming takes no body. */
export const pauseForNonPaymentSchema = z
  .object({ reason: z.string().trim().min(3).max(300) })
  .strict();
export type PauseForNonPaymentInput = z.infer<typeof pauseForNonPaymentSchema>;
