/**
 * What people send us from mdgservices.in — a grievance, or a "Register your
 * pump" enrolment — as the admin's Grievances and Registrations pages list them.
 *
 * Both forms live on the website, whose own server (a Vercel function) sends
 * the emails. That server then hands each submission to our API with a shared
 * secret, so the admin app can list it beside everything else. The enrolment
 * form is also filled in inside the Dealer Kavach app, which posts to the same
 * website endpoint, so `source` says which.
 *
 * Super-admin only, like the assistant's leads and the WhatsApp replies: the
 * people writing in are members of the public, with their numbers and their
 * words, and a grievance may be about one of our own staff.
 */

// ── Grievances ─────────────────────────────────────────────────────────────

/** What the grievance is about. Picked by the person on the form. */
export const GRIEVANCE_CATEGORIES = [
  'service',
  'app',
  'billing',
  'staff',
  'privacy',
  'other',
] as const;
export type GrievanceCategory = (typeof GRIEVANCE_CATEGORIES)[number];

/** The admin's words for each category. The website carries its own, in Hindi and English. */
export const GRIEVANCE_CATEGORY_LABELS: Record<GrievanceCategory, string> = {
  service: 'Our service',
  app: 'Dealer Kavach app',
  billing: 'Billing or payment',
  staff: 'Our staff',
  privacy: 'Privacy or their data',
  other: 'Something else',
};

/** `OPEN` until a person resolves it with a written note. `RESOLVED` can be reopened. */
export const GRIEVANCE_STATES = ['OPEN', 'RESOLVED'] as const;
export type GrievanceState = (typeof GRIEVANCE_STATES)[number];

/** The language the person filled the form in, and so the language of the email they got. */
export const WEBSITE_LANGS = ['hi', 'en'] as const;
export type WebsiteLang = (typeof WEBSITE_LANGS)[number];

export interface Grievance {
  id: string;
  /** The number the person was given on screen and in their email: "G-0007". */
  ref: string;
  name: string;
  email: string;
  mobile: string;
  /** Pump name or SAP code, when they gave one. */
  outlet: string | null;
  category: GrievanceCategory;
  /** What they wrote, as they wrote it. */
  message: string;
  lang: WebsiteLang;
  state: GrievanceState;
  /** When it was sent from the website. */
  openedAt: string;
  resolvedAt: string | null;
  resolvedByName: string | null;
  /** What was done about it. Required to resolve. */
  resolutionNote: string | null;
}

export type GrievanceView = 'open' | 'all';

export interface GrievanceList {
  /** Newest first. */
  items: Grievance[];
  counts: { open: number; all: number };
}

// ── Enrolments ("Register your pump") ──────────────────────────────────────

/** `NEW` until somebody at MDG has been in touch, then `CONTACTED`. */
export const ENROLMENT_STATES = ['NEW', 'CONTACTED'] as const;
export type EnrolmentState = (typeof ENROLMENT_STATES)[number];

export const ENROLMENT_SITE_TYPES = ['Type A', 'Type B'] as const;
export type EnrolmentSiteType = (typeof ENROLMENT_SITE_TYPES)[number];

/** Where the form was filled in: the website, or the sign-up screen inside the app. */
export const ENROLMENT_SOURCES = ['website', 'app'] as const;
export type EnrolmentSource = (typeof ENROLMENT_SOURCES)[number];

export interface Enrolment {
  id: string;
  name: string;
  mobile: string;
  email: string | null;
  siteType: EnrolmentSiteType;
  pumpName: string | null;
  sapCode: string;
  source: EnrolmentSource;
  state: EnrolmentState;
  submittedAt: string;
  contactedAt: string | null;
  contactedByName: string | null;
  /** Whatever the person who called them wrote down. Optional. */
  note: string | null;
}

export type EnrolmentView = 'new' | 'all';

export interface EnrolmentList {
  /** Newest first. */
  items: Enrolment[];
  counts: { new: number; all: number };
}
