/**
 * Validation for the website's two forms as they reach our API, and for what an
 * admin does with them afterwards (types/websiteIntake.ts).
 *
 * The intake schemas are what the website's server sends, not what a browser
 * sends: the website has already checked the form with its own copy of these
 * rules, and its server is the only caller (it holds the shared secret). They
 * are checked again here because a database is not the place to find out the
 * two copies drifted.
 */

import { z } from 'zod';

import {
  ENROLMENT_SITE_TYPES,
  ENROLMENT_SOURCES,
  GRIEVANCE_CATEGORIES,
  WEBSITE_LANGS,
} from '../types/websiteIntake';

/** A mobile number as the forms accept it: digits, spaces, +, -; 10 to 15 characters. */
const mobile = z
  .string()
  .trim()
  .regex(/^[0-9+\s-]{10,15}$/);

/** Optional text where "" means "not given". */
const optionalText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.literal('')])
    .optional()
    .transform((v) => (v ? v : undefined));

/**
 * One id per filled-in form, made by the browser when the page opens. A retry
 * after a dropped connection carries the same id, so it finds the grievance the
 * first attempt already saved instead of making a second one.
 */
const submissionId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);

export const websiteGrievanceIntakeSchema = z.object({
  submissionId,
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  mobile,
  outlet: optionalText(160),
  category: z.enum(GRIEVANCE_CATEGORIES),
  message: z.string().trim().min(10).max(3000),
  lang: z.enum(WEBSITE_LANGS),
});
export type WebsiteGrievanceIntake = z.infer<typeof websiteGrievanceIntakeSchema>;

export const websiteEnrolmentIntakeSchema = z.object({
  /** The website's form sends one; the app's sign-up screen does not. */
  submissionId: submissionId.optional(),
  name: z.string().trim().min(1).max(120),
  mobile,
  email: z
    .union([z.string().trim().email().max(200), z.literal('')])
    .optional()
    .transform((v) => (v ? v : undefined)),
  siteType: z.enum(ENROLMENT_SITE_TYPES),
  pumpName: optionalText(160),
  sapCode: z.string().trim().min(1).max(60),
  source: z.enum(ENROLMENT_SOURCES).default('website'),
});
export type WebsiteEnrolmentIntake = z.infer<typeof websiteEnrolmentIntakeSchema>;

/** Resolving a grievance needs a note: what was done, in words the next person can read. */
export const resolveGrievanceSchema = z.object({
  note: z.string().trim().min(3).max(2000),
});
export type ResolveGrievanceInput = z.infer<typeof resolveGrievanceSchema>;

/** Marking an enrolment contacted. The note is optional: "called, will join in Nov". */
export const markEnrolmentContactedSchema = z.object({
  note: optionalText(1000),
});
export type MarkEnrolmentContactedInput = z.infer<typeof markEnrolmentContactedSchema>;
