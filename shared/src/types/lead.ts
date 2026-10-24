/**
 * Leads — every person who started the full Dealer Kavach film from a link we
 * can tie to them, or asked for a call from that film's page, kept on one list
 * until they say no, ask us to stop, or become a client (ADR 0024).
 *
 * WHO IS A LEAD. The owner's rule (24 Oct 2026): the full film page
 * (mdgservices.in/film, film id `kavach`) played for at least one second. A
 * film view carries no name or number (ADR 0015 §8), so a view becomes a lead
 * only through the share code in its link (`?r=`): a WhatsApp campaign send
 * names the person and their number, an admin's share link names them by its
 * label. A call-back asked for on the full film's page is a lead too: they were
 * on that page and left a number. Viewers who came without a code stay
 * anonymous — counted and listed, never followed up.
 *
 * WHY THE STATUS IS DERIVED. Where a lead stands is worked out on the server
 * from facts (their film visits, WhatsApp replies, call-backs, registration,
 * the team's logged contacts) by one pure clock. Nobody sets it by hand, so
 * the list, the alerts and the morning digest cannot disagree.
 */

/** How the lead first reached us. */
export const LEAD_ORIGINS = [
  /** A WhatsApp film invite: the send ledger knows their name and number. */
  'campaign',
  /** A share link an admin made on the Films page: known by the link's label. */
  'share_link',
  /** Asked for a call on the full film's page. */
  'film_callback',
] as const;
export type LeadOrigin = (typeof LEAD_ORIGINS)[number];

export const LEAD_ORIGIN_LABELS: Record<LeadOrigin, string> = {
  campaign: 'WhatsApp film invite',
  share_link: 'Share link',
  film_callback: 'Call-back from the film page',
};

/** Where a lead stands. */
export const LEAD_STATUSES = [
  /** Nobody at MDG has been in touch yet. */
  'new',
  /** We called or messaged; they have not answered yet. */
  'trying',
  /** We have spoken, or they wrote back; no decision yet. */
  'talking',
  /** They said they want to go ahead. */
  'interested',
  /** They filled in "Register your pump" and are not approved yet; the Onboarding page has the registration. */
  'registered',
  /** Their registration was approved: an outlet now. Closed, won. */
  'client',
  /** They said no. Closed. */
  'not_interested',
  /** They asked us to stop contacting them. Closed, and on the WhatsApp stop list. */
  'asked_to_stop',
  /** The number is not theirs. Closed. */
  'wrong_number',
  /** Our own team, a test, or a duplicate. Closed. */
  'not_a_lead',
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/**
 * The statuses the follow-up clock chases. A registered lead is chased once
 * somebody has contacted them about the registration: until then Onboarding's
 * own "New registration" alert does it, and after it nothing else would until
 * the outlet is approved.
 */
export const LEAD_CHASED_STATUSES = ['new', 'trying', 'talking', 'interested', 'registered'] as const;
/** Every status that is still open. */
export const LEAD_OPEN_STATUSES = ['new', 'trying', 'talking', 'interested', 'registered'] as const;
/** Every closed status. */
export const LEAD_CLOSED_STATUSES = [
  'client',
  'not_interested',
  'asked_to_stop',
  'wrong_number',
  'not_a_lead',
] as const;

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'New',
  trying: 'Trying to reach',
  talking: 'In talks',
  interested: 'Interested',
  registered: 'Registered',
  client: 'Client',
  not_interested: 'Not interested',
  asked_to_stop: 'Asked to stop',
  wrong_number: 'Wrong number',
  not_a_lead: 'Not a lead',
};

/** Why a lead was closed. `client` is only ever set by the server. */
export const LEAD_CLOSE_REASONS = [
  'client',
  'not_interested',
  'asked_to_stop',
  'wrong_number',
  'not_a_lead',
] as const;
export type LeadCloseReason = (typeof LEAD_CLOSE_REASONS)[number];

/** The reasons an admin may pick when closing a lead by hand. */
export const LEAD_ADMIN_CLOSE_REASONS = [
  'not_interested',
  'asked_to_stop',
  'wrong_number',
  'not_a_lead',
] as const;
export type LeadAdminCloseReason = (typeof LEAD_ADMIN_CLOSE_REASONS)[number];

/** How a contact was made. */
export const LEAD_CONTACT_CHANNELS = ['call', 'whatsapp', 'visit'] as const;
export type LeadContactChannel = (typeof LEAD_CONTACT_CHANNELS)[number];

export const LEAD_CONTACT_CHANNEL_LABELS: Record<LeadContactChannel, string> = {
  call: 'Call',
  whatsapp: 'WhatsApp',
  visit: 'Met in person',
};

/** What came of a contact. The last three close the lead. */
export const LEAD_CONTACT_OUTCOMES = [
  /** Spoke to them: they want to go ahead. */
  'interested',
  /** Spoke to them: thinking it over, or asked us to call later. */
  'thinking',
  /** No answer, busy, or switched off. */
  'no_answer',
  /** Sent them a message; no conversation yet. */
  'message_sent',
  /** They said no. Closes the lead. */
  'not_interested',
  /** They asked us not to contact them again. Closes the lead and stops WhatsApp promotions to them. */
  'asked_to_stop',
  /** The number is not theirs. Closes the lead. */
  'wrong_number',
] as const;
export type LeadContactOutcome = (typeof LEAD_CONTACT_OUTCOMES)[number];

/** Outcomes that close the lead in the same step. */
export const LEAD_CLOSING_OUTCOMES = ['not_interested', 'asked_to_stop', 'wrong_number'] as const;

export const LEAD_CONTACT_OUTCOME_LABELS: Record<LeadContactOutcome, string> = {
  interested: 'Spoke — interested',
  thinking: 'Spoke — thinking it over',
  no_answer: 'No answer',
  message_sent: 'Sent a message',
  not_interested: 'Not interested',
  asked_to_stop: 'Asked us to stop',
  wrong_number: 'Wrong number',
};

/** What the next follow-up is for. */
export const LEAD_DUE_REASONS = [
  /** A new lead nobody has called. */
  'first_contact',
  /** They did something after our last contact (see `lastSign`). */
  'they_came_back',
  /** They did not answer last time. */
  'no_answer_retry',
  /** We messaged and heard nothing. */
  'after_message',
  /** We spoke; time to check in. */
  'check_in',
  /** A time somebody at MDG chose. */
  'scheduled',
] as const;
export type LeadDueReason = (typeof LEAD_DUE_REASONS)[number];

/** Things a lead does that tell us they are still listening. */
export const LEAD_SIGN_KINDS = [
  /** Opened the full film again. */
  'watched',
  /** Wrote to us on WhatsApp. */
  'replied',
  /** Tapped "Call me" under the film invite. */
  'call_me',
  /** Asked for a call-back on the website. */
  'callback',
  /** Talked to the website's assistant and left their number. */
  'assistant',
  /** Filled in "Register your pump". */
  'registered',
] as const;
export type LeadSignKind = (typeof LEAD_SIGN_KINDS)[number];

export const LEAD_SIGN_LABELS: Record<LeadSignKind, string> = {
  watched: 'Watched the film again',
  replied: 'Replied on WhatsApp',
  call_me: 'Tapped "Call me"',
  callback: 'Asked for a call-back',
  assistant: 'Talked to the website assistant',
  registered: 'Registered their pump',
};

/** What the team's own log on a lead records. */
export const LEAD_ACTIVITY_KINDS = [
  'contact',
  'note',
  'follow_up',
  'assigned',
  'closed',
  'reopened',
  'phone_added',
] as const;
export type LeadActivityKind = (typeof LEAD_ACTIVITY_KINDS)[number];

/** The list's tabs. `viewers` is the anonymous film viewers, not leads. */
export const LEAD_VIEWS = ['todo', 'open', 'mine', 'closed', 'viewers'] as const;
export type LeadView = (typeof LEAD_VIEWS)[number];

/** How much of the full film a lead has watched, across every visit we can tie to them. */
export interface LeadWatch {
  /** Visits where the film played at least a second. */
  visits: number;
  /** The most seconds watched in any one visit. */
  bestSeconds: number;
  /** The film's length in seconds. */
  durationSeconds: number;
  /** Any visit watched (nearly) to the end. */
  completed: boolean;
  /** Any visit turned the sound on. */
  soundOn: boolean;
  /** Distinct browsers. More than one usually means the link was forwarded or opened twice. */
  devices: number;
  firstAt: string | null;
  lastAt: string | null;
  /** The city the latest visit came from, as the network guessed it. */
  city: string | null;
}

export interface LeadPerson {
  id: string;
  name: string;
}

export interface LeadContactSummary {
  at: string;
  byName: string | null;
  channel: LeadContactChannel;
  outcome: LeadContactOutcome;
}

export interface LeadSign {
  at: string;
  kind: LeadSignKind;
}

/** One row of the Leads list. */
export interface LeadRow {
  id: string;
  /** Human reference, e.g. "L-0007". */
  ref: string;
  /** Best name we know: the campaign's greeting, the share link's label, what they typed, or one an admin gave. */
  name: string | null;
  /** Ten digits, when we have a number. */
  phone: string | null;
  /** The WhatsApp chat id (91 + ten digits), when the number is a WhatsApp-able Indian mobile. */
  waId: string | null;
  /**
   * The WhatsApp inbox has a chat with them (we sent them something, or they
   * wrote). Without one, opening the inbox at their number lands on "no messages".
   */
  hasChat: boolean;
  /** Pump name or town, when known. */
  place: string | null;
  origin: LeadOrigin;
  /** The WhatsApp campaign that first reached them. */
  campaign: string | null;
  /** The share link's label, for a share-link lead. */
  linkLabel: string | null;
  status: LeadStatus;
  watch: LeadWatch;
  owner: LeadPerson | null;
  /** The last contact somebody logged, or a WhatsApp message a person sent from the inbox. */
  lastContact: LeadContactSummary | null;
  /** The latest thing they did. */
  lastSign: LeadSign | null;
  /** When to get in touch next. Null for closed and registered leads. */
  nextDueAt: string | null;
  dueReason: LeadDueReason | null;
  /** Due time has passed (as of the response's `now`). */
  overdue: boolean;
  /** Overdue by a working day or more. */
  cold: boolean;
  /** Calls and messages since they last engaged that got no answer. */
  unanswered: number;
  /** Their registration, when they filled one in. */
  registration: { id: string; state: 'NEW' | 'CONTACTED' | 'APPROVED' | 'LOST'; at: string } | null;
  /** The outlet they became, once approved. */
  dealer: { id: string; code: string | null } | null;
  /** On the WhatsApp stop list. */
  optedOut: boolean;
  /** When they became a lead. */
  firstSeenAt: string;
  closedAt: string | null;
  closedByName: string | null;
  updatedAt: string;
}

export interface LeadCounts {
  /** Open leads due now or never contacted: the "To do" tab. */
  todo: number;
  /** Every open lead. */
  open: number;
  /** Open leads owned by the person asking. */
  mine: number;
  closed: number;
  /** Anonymous full-film viewers in the last 30 days. */
  viewers: number;
  /** Open leads nobody has contacted yet. */
  new: number;
  /** Open leads we have spoken with, or who wrote back: in talks or interested. */
  talking: number;
  overdue: number;
  cold: number;
}

/** The last 30 days, as a funnel. Each number counts leads that reached at least that step. */
export interface LeadFunnel {
  days: number;
  watched: number;
  contacted: number;
  spoke: number;
  registered: number;
  clients: number;
}

export interface LeadList {
  items: LeadRow[];
  counts: LeadCounts;
  funnel: LeadFunnel;
  /** Server time the overdue/cold flags were worked out at. */
  now: string;
}

/** One visit to the full film page that belongs to a lead. */
export interface LeadVisit {
  at: string;
  lastAt: string;
  seconds: number;
  /** 0–100 of the film. */
  percent: number;
  completed: boolean;
  soundOn: boolean;
  city: string | null;
  /** E.g. "Android · Chrome", "iPhone · in WhatsApp". */
  device: string | null;
  /** Opened from their personal link (true) or later without it from the same browser (false). */
  viaLink: boolean;
}

/** The team's own log on a lead. */
export interface LeadActivity {
  id: string;
  at: string;
  kind: LeadActivityKind;
  byName: string | null;
  channel: LeadContactChannel | null;
  outcome: LeadContactOutcome | null;
  note: string | null;
  /** For a contact or follow-up: the follow-up time chosen. */
  nextAt: string | null;
  /** For a close: why. */
  reason: LeadCloseReason | null;
  /** For an assignment: who it went to (null = nobody). */
  ownerName: string | null;
}

export const LEAD_TIMELINE_KINDS = [
  'film_visit',
  'campaign_sent',
  'whatsapp_in',
  'whatsapp_out',
  'call_me',
  'callback',
  'registration',
  'registration_call',
  'client',
  'assistant',
  'opted_out',
  'activity',
] as const;
export type LeadTimelineKind = (typeof LEAD_TIMELINE_KINDS)[number];

/** Everything we know happened with this person, from every source, newest first. Worded on the server. */
export interface LeadTimelineItem {
  at: string;
  kind: LeadTimelineKind;
  title: string;
  detail: string | null;
  by: string | null;
  /** An admin page that shows more, when there is one this admin can open. */
  href: string | null;
}

export interface LeadDetail {
  lead: LeadRow;
  visits: LeadVisit[];
  activity: LeadActivity[];
  timeline: LeadTimelineItem[];
  /** The WhatsApp inbox chat to open, when they have one. */
  chatPerson: string | null;
  /** Plain-words "what to do next" for the top of the drawer. */
  nextStep: string;
  now: string;
}

/** An anonymous full-film viewer: no code in their link, so nobody we can name. */
export interface LeadViewerRow {
  id: string;
  at: string;
  lastAt: string;
  seconds: number;
  percent: number;
  completed: boolean;
  soundOn: boolean;
  city: string | null;
  device: string | null;
  /** This browser opened the film before. */
  returning: boolean;
}

export interface LeadViewerList {
  items: LeadViewerRow[];
  /** Anonymous viewers in the window, even when the list is capped. */
  total: number;
  days: number;
}

/** What the WhatsApp inbox shows about a chat that is a lead. */
export interface LeadLookup {
  id: string;
  ref: string;
  status: LeadStatus;
  nextDueAt: string | null;
  overdue: boolean;
  ownerName: string | null;
}

/** Admins a lead can be given to. */
export interface LeadOwnerOption {
  id: string;
  name: string;
}
