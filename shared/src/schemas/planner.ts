/**
 * New Pump Guide (ADR 0058): the sign-up of a person planning a pump, and the
 * switch to Dealer Kavach once their pump opens.
 *
 * The limits are the ones the outlet registration already uses (the app's
 * `features/register/enroll.ts` LIMITS and `schemas/websiteIntake.ts`), so a name
 * or a SAP code one form takes is never one the other refuses.
 */

import { z } from 'zod';

import { GST_STATES } from '../lib/gst';
import { SIGN_IN_MOBILE_HINT, signInMobileOf } from '../lib/mobile';
import { DEALER_LANGS } from '../types/dealerLanguage';
import { FUNNEL_DEVICES, FUNNEL_LANGS, FUNNEL_SOURCE_PATTERN } from '../types/funnel';
import { OIL_COMPANIES } from '../types/oilCompany';
import { PLANNER_OIL_COMPANIES, PLANNER_STAGES } from '../types/planner';
import { ENROLMENT_SOURCES } from '../types/websiteIntake';

/** Optional text where "" means "not given". */
const optionalText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.literal('')])
    .optional()
    .transform((v) => (v ? v : undefined));

/**
 * A funnel tag (ADR 0059 §2), kept only when it is the short, safe shape; anything
 * else becomes `undefined` instead of failing the request. A sign-up or a tap must
 * never be refused because of the tag on the link that brought it.
 */
const funnelSource = z
  .unknown()
  .transform((v) => {
    if (typeof v !== 'string') return undefined;
    const s = v.trim().toLowerCase();
    return FUNNEL_SOURCE_PATTERN.test(s) ? s : undefined;
  })
  .optional();

/**
 * A planner's registration as it reaches `POST /v1/website/enrolments` (§3.2): the
 * app's form, sent on through the website's server like the outlet form, told apart
 * by `kind: 'planner'`. It has no SAP code and no site type: there is no pump yet.
 *
 * The mobile comes out as the plain 10 digits a login stores, because a planner's
 * account is opened at once (§3.3) and the sign-in only ever matches that form.
 *
 * `lang` is the app's language (hi, hl or en) and becomes the owner's language.
 * The Terms were shown in Hindi or English only, so the registration row keeps
 * `baseLangOf(lang)` as the language the tick was given in.
 */
export const plannerRegisterSchema = z.object({
  kind: z.literal('planner'),
  name: z.string().trim().min(1).max(120),
  mobile: z
    .string()
    .trim()
    .refine((v) => signInMobileOf(v) !== null, SIGN_IN_MOBILE_HINT)
    .transform((v) => signInMobileOf(v) as string),
  // Taken as typed, spaces included: trimming a password changes it. Required here,
  // unlike the outlet form, because the account opens with it straight away.
  password: z.string().min(8).max(200),
  /** GST state code: the place of supply on their bill, and the state the answers are about. */
  stateCode: z.string().refine((c) => Boolean(GST_STATES[c]), 'Pick a state'),
  district: optionalText(120),
  oilCompany: z.enum(PLANNER_OIL_COMPANIES),
  stage: z.enum(PLANNER_STAGES),
  email: z
    .union([z.string().trim().email().max(200), z.literal('')])
    .optional()
    .transform((v) => (v ? v : undefined)),
  lang: z.enum(DEALER_LANGS),
  // ── The same wire extras the outlet form carries (`websiteEnrolmentIntakeSchema`) ──
  source: z.enum(ENROLMENT_SOURCES).default('app'),
  submissionId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{8,64}$/)
    .optional(),
  termsVersion: z.string().trim().min(1).max(40).optional(),
  termsTextHash: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
  consentWhatsApp: z.boolean().optional(),
  ref: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,32}$/)
    .optional(),
  userAgent: z.string().max(500).optional(),
  /**
   * The website page that sent them (ADR 0059 §3): the funnel link's `from`, carried
   * by the app to the form. Not part of what the Terms tick records.
   */
  from: funnelSource,
});
export type PlannerRegisterInput = z.infer<typeof plannerRegisterSchema>;

/**
 * One press of the website's "Ask in Kavach Shuruaat" link (ADR 0059 §2), as the
 * website's server reports it to `POST /v1/website/funnel-taps`. Nothing about the
 * person: the page's tag, the kind of device, the page's language.
 */
export const funnelTapSchema = z.object({
  source: funnelSource.transform((v) => v ?? null),
  device: z.enum(FUNNEL_DEVICES),
  lang: z.enum(FUNNEL_LANGS).default('en'),
});
export type FunnelTapInput = z.infer<typeof funnelTapSchema>;

/**
 * "My pump is open now": `POST /v1/me/planner/convert` (§7). The outlet's own
 * details, the least the normal Dealer Kavach setup needs to begin. The oil company
 * is one of the three a running pump can be with: "other" and "not decided" were
 * only for the planning stage.
 */
export const plannerConvertSchema = z
  .object({
    sapCode: z.string().trim().min(1).max(60),
    pumpName: z.string().trim().min(1).max(160),
    siteType: z.enum(['A', 'B']),
    oilCompany: z.enum(OIL_COMPANIES),
  })
  .strict();
export type PlannerConvertInput = z.infer<typeof plannerConvertSchema>;
