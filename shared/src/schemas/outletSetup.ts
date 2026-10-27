/**
 * Validation for onboarding v2 (types/outletSetup.ts): what the owner saves on
 * the setup cards, what an admin does at MDG's four points — approve, send the
 * bill, record the payment, start the services — and what an admin does FOR the
 * dealer (mark them signed in, send the welcome again, mark logins not needed).
 */

import { z } from 'zod';

import { GST_STATES, cleanGstin, isGstin } from '../lib/gst';
import { OIL_COMPANIES } from '../types/oilCompany';
import {
  SETUP_CALL_OUTCOMES,
  SETUP_MESSAGE_LANGS,
  SETUP_PAYMENT_MODES,
} from '../types/outletSetup';

import { dealerCodeSchema } from './dealer';
import { portalIdSchema } from './portalLogin';

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

/**
 * The billing card. The owner's `PUT /me/setup/billing` and the admin's
 * `PUT /dealers/:id/setup/billing` take this same body. A GSTIN is optional and never blocks anything; when given
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

/**
 * The company card: which oil company the pump is with. The owner's
 * `PUT /me/setup/company` and the admin's `PUT /dealers/:id/setup/company` take this body.
 */
export const saveSetupCompanySchema = z.object({ company: z.enum(OIL_COMPANIES) }).strict();
export type SaveSetupCompanyInput = z.infer<typeof saveSetupCompanySchema>;

/** Approve a registration. The code defaults to the next free one. */
export const approveRegistrationSchema = z
  .object({
    code: dealerCodeSchema.optional(),
    /** Add the registration as another outlet of the owner whose login this is (one person, several pumps). */
    linkToUserId: z
      .string()
      .regex(/^[a-f0-9]{24}$/i, 'Invalid id')
      .optional(),
    /**
     * The language of the WhatsApp welcome: Hinglish (`hi`) or English (`en`). Unset:
     * the default for this person (`services/outletSetup/messageLang.ts`).
     */
    messageLang: z.enum(SETUP_MESSAGE_LANGS).optional(),
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

/** "Payment received" for money that came by UPI, bank transfer, cash or cheque. */
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

/** Change the flat monthly price. GST included, in paise: 354000 = ₹3,540. */
export const setMonthlyPriceSchema = z
  .object({ monthlyPricePaise: z.number().int().min(100).max(10_000_000) })
  .strict();
export type SetMonthlyPriceInput = z.infer<typeof setMonthlyPriceSchema>;

/**
 * "Mark signed in" (an admin, for a dealer who cannot or will not use the app yet).
 * The reason is required and kept on the outlet ("helped by phone"); the audit row
 * says how long it was, never what it said.
 */
export const markSignedInSchema = z.object({ reason: z.string().trim().min(3).max(300) }).strict();
export type MarkSignedInInput = z.infer<typeof markSignedInSchema>;

/**
 * "Send welcome on WhatsApp" again. `messageLang` unset: the outlet's default
 * language. `force` sends even though the welcome already went (sent, delivered or
 * marked sent by hand).
 */
export const sendSetupWelcomeSchema = z
  .object({
    messageLang: z.enum(SETUP_MESSAGE_LANGS).optional(),
    force: z.boolean().optional(),
  })
  .strict();
export type SendSetupWelcomeInput = z.infer<typeof sendSetupWelcomeSchema>;

/** "Not needed for this outlet": this portal login is not asked for. A reason is required. */
export const portalNotNeededSchema = z
  .object({ portal: portalIdSchema, reason: z.string().trim().min(3).max(300) })
  .strict();
export type PortalNotNeededInput = z.infer<typeof portalNotNeededSchema>;
