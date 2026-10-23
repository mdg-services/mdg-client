/**
 * What people send us from mdgservices.in — a grievance, a "Register your
 * pump" enrolment, or a "we'll call you" request — as the admin's Grievances,
 * Registrations and Call-backs pages list them.
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

/**
 * Where a grievance was made. The website form; the site assistant's chat (a
 * card it offers when somebody complains about us); or a live call with the
 * assistant, which takes the details by voice.
 */
export const GRIEVANCE_SOURCES = ['website', 'assistant-chat', 'assistant-call'] as const;
export type GrievanceSource = (typeof GRIEVANCE_SOURCES)[number];

/** The admin's words for where it came from. */
export const GRIEVANCE_SOURCE_LABELS: Record<GrievanceSource, string> = {
  website: 'Website form',
  'assistant-chat': 'Assistant chat',
  'assistant-call': 'Call with the assistant',
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
  /**
   * Always there for the website form, which sends the acknowledgement to it.
   * Optional through the assistant (nobody spells an address out on a call),
   * so null means "call them on the mobile".
   */
  email: string | null;
  mobile: string;
  /** Pump name or SAP code, when they gave one. */
  outlet: string | null;
  category: GrievanceCategory;
  source: GrievanceSource;
  /** The assistant conversation it was made in, for the transcript and the recording. Null for the website form. */
  assistSessionId: string | null;
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

/**
 * `NEW` until somebody at MDG has been in touch, then `CONTACTED`. Onboarding
 * v2 adds the two ends: `APPROVED` (an outlet was made from it, `dealerId` says
 * which) and `LOST` (the lead said no; `lostReason` says why).
 */
export const ENROLMENT_STATES = ['NEW', 'CONTACTED', 'APPROVED', 'LOST'] as const;
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
  // ── Onboarding v2 (docs/specs/onboarding-v2.md) ──
  /** The outlet made from it on approval. */
  dealerId: string | null;
  dealerCode: string | null;
  approvedAt: string | null;
  /** "MDG System" when it was approved because our campaigns messaged the number. */
  approvedByName: string | null;
  lostAt: string | null;
  lostReason: string | null;
  /** The phone or SAP code already belongs to a live outlet — a second pump, or a repeat. */
  alreadyClient: { dealerId: string; code: string } | null;
  /** Our WhatsApp campaigns sent to this number. */
  fromCampaign: boolean;
  /** The film link's share code the form was opened from, when it carried one. */
  ref: string | null;
  /** The Terms version they ticked, and when. Null for forms older than onboarding v2. */
  termsVersion: string | null;
  termsAcceptedAt: string | null;
  /** They agreed to messages about their account on WhatsApp. */
  consentWhatsApp: boolean;
  /** They chose a password on the form (never shown — it is stored hashed). */
  hasPassword: boolean;
  lang: WebsiteLang | null;
}

export type EnrolmentView = 'new' | 'all';

export interface EnrolmentList {
  /** Newest first. */
  items: Enrolment[];
  counts: { new: number; all: number };
}

// ── Call-back requests ("We'll call you") ──────────────────────────────────

/** `NEW` until somebody at MDG has called them, then `CALLED`. */
export const CALLBACK_STATES = ['NEW', 'CALLED'] as const;
export type CallbackState = (typeof CALLBACK_STATES)[number];

/**
 * Which form it came from: the film pages' "we'll call you", or any other
 * call-back form on the website (the home page, the Khata Kavach page, the
 * site assistant when a call cannot start). `message` says which of those.
 */
export const CALLBACK_SOURCES = ['website', 'film'] as const;
export type CallbackSource = (typeof CALLBACK_SOURCES)[number];

/** The two films, by the id the film pages and the Films page use. */
export const CALLBACK_FILMS = ['kavach', 'kavach-short'] as const;
export type CallbackFilm = (typeof CALLBACK_FILMS)[number];

/** Who a film link's code (`?r=`) was sent to on WhatsApp, when it was one of our sends. */
export interface CallbackRefSend {
  /** The name the promotion greeted them by. */
  name: string;
  /** Their WhatsApp number, as the send ledger holds it (digits, with the country code). */
  phone: string;
  /** When it was sent. Null when the send never went. */
  sentAt: string | null;
  /**
   * Whether the person asking gave that same number. False when the link was
   * forwarded: the film went to this person, and a friend of theirs is asking.
   */
  sameNumber: boolean;
}

export interface CallbackRequest {
  id: string;
  name: string;
  mobile: string;
  /** Pump name, when they gave one. */
  outlet: string | null;
  /** What the form added for the team, e.g. "Callback requested from the assistant." */
  message: string | null;
  source: CallbackSource;
  /** Which film page, for a request from one. */
  film: CallbackFilm | null;
  /** The film link's share code, when the page was opened from a link that carried one. */
  ref: string | null;
  /** That code's WhatsApp send, when it was ours. Looked up when the list is read. */
  refSend: CallbackRefSend | null;
  /** That code's share link from admin → Films, when it was one of those. */
  refLabel: string | null;
  /** The language of the page the form was on. */
  lang: WebsiteLang | null;
  state: CallbackState;
  /** When the first request arrived. A repeat within half an hour updates the row, not this. */
  submittedAt: string;
  calledAt: string | null;
  calledByName: string | null;
  /** Whatever the person who called them wrote down. Optional. */
  note: string | null;
}

export type CallbackView = 'new' | 'all';

export interface CallbackList {
  /** Newest first. */
  items: CallbackRequest[];
  counts: { new: number; all: number };
}
