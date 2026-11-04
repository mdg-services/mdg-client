/**
 * WhatsApp results — what happened to the promotional messages we sent.
 *
 * Everything here is worked out from what we already store; nothing new is
 * asked of Meta. Meta reports each message we send as sent, delivered, read or
 * failed (`whatsappmessages`), a film invite's button carries the person's own
 * code so a tap on it lands in `filmviews`, and anything a person sends back —
 * a reply, an emoji, "Stop promotions" — is a message of its own.
 *
 * What it cannot know, and says so on screen:
 *
 * - **A second open.** Meta reports "read" once, the first time the message is
 *   on screen. It never says the person came back to it.
 * - **An open with blue ticks turned off.** Such a person never reports read.
 *   They are counted as opened only when they did something with the message —
 *   tapped its link, replied, reacted or said stop (`openedBy: 'sign'`).
 * - **A link Meta handles.** Only a link that goes through our own site with
 *   the person's code in it can be counted: the film invite's button, and the
 *   button on a message sent from the inbox with a link added
 *   (`whatsappLinks.ts`). A link typed into a message's words is not tracked.
 *
 * A "send" is one message to many people: one campaign from the campaign
 * script, the same words sent from the inbox on the same day, or every one of
 * the app's own messages of one kind (a bill, a sign-in reminder).
 *
 * Since 5 Nov 2026 the sends of each of our two numbers are kept apart (the
 * page shows one number at a time, as the inbox does), and sends are listed in
 * groups: a campaign is a place, and a campaign that went on more than one day
 * — the numbers it missed sent again — lists each day under its place.
 */

import type { WhatsAppLine } from './whatsappInbox';

/** Asked for as a send: every send from the open number at once. */
export const WHATSAPP_RESULTS_ALL = 'all';

/**
 * A send's place in its group (`WhatsAppResultSend.group`).
 *
 * - `total` — the whole group. For a campaign, every number it went to, each
 *   counted once at its latest try; for anything else, every message in it.
 *   Listed only for a campaign, or a group of two sends or more.
 * - `first` / `later` — one day of a campaign that went on more than one day:
 *   its first day, then each later day (the numbers it missed sent again, or
 *   more of its list).
 * - `single` — one send that is not a campaign.
 */
export const WHATSAPP_RESULT_PARTS = ['total', 'first', 'later', 'single'] as const;
export type WhatsAppResultPart = (typeof WHATSAPP_RESULT_PARTS)[number];

/** How far one message got with one person, best first. */
export const WHATSAPP_RESULT_OUTCOMES = [
  'opened',
  'reached',
  'waiting',
  'held_back',
  'not_delivered',
] as const;
export type WhatsAppResultOutcome = (typeof WHATSAPP_RESULT_OUTCOMES)[number];

export interface WhatsAppResultCounts {
  /** Messages Meta accepted from us — one per person per send. */
  sent: number;
  /** How many different people those messages went to. */
  people: number;
  /** Got to the phone, opened or not. */
  reached: number;
  /** Accepted, not on the phone yet — usually a phone that is off. */
  waiting: number;
  /**
   * Meta refused to deliver it because the person already gets too many
   * promotions (error 131049). Not charged.
   */
  heldBack: number;
  /** Did not arrive for any other reason. */
  notDelivered: number;
  /**
   * Of `notDelivered`: WhatsApp could not deliver to that number at all (error
   * 131026) — most often a number that is not on WhatsApp. Not charged.
   */
  notOnWhatsApp: number;
  /** `openedByTick + openedBySign`. */
  opened: number;
  /** Showed a blue tick. */
  openedByTick: number;
  /** No blue tick, but they tapped, replied, reacted or said stop. */
  openedBySign: number;
  /** People whose message carried a link we can count. 0 means no such link. */
  withLink: number;
  /** People who tapped that link at least once. */
  tappedLink: number;
  /** People who tapped it two times or more. */
  tappedLinkTwice: number;
  /** Every tap, from everyone. */
  linkTaps: number;
  /** People who wrote back or reacted (not counting "stop", or a "call me" tap). */
  replied: number;
  /** People who pressed the film invite's "मुझे कॉल करें": they want a call. */
  askedCall: number;
  /** People who asked for no more promotions. */
  stopped: number;
  /** Middle value of minutes from sending to the blue tick; null when nobody ticked. */
  openMinutesMedian: number | null;
}

export interface WhatsAppResultSend {
  /** A short opaque id, stable across reloads, for the URL. */
  id: string;
  /** What it said: the words sent, or what kind of message it was. */
  label: string;
  /**
   * `label` is the words that were sent. False when we do not hold them — a
   * film invite, the app's own messages, a send made outside the inbox — and
   * `label` says what it was instead.
   */
  hasWords: boolean;
  /** The kind of message in plain words: "Film invite", "Message", "Bill". */
  kind: string;
  /** The campaign script's name for it; null for anything sent another way. */
  campaign: string | null;
  /** Where its counted link sends people, when it went with one from the inbox. */
  link: string | null;
  firstSentAt: string;
  lastSentAt: string;
  counts: WhatsAppResultCounts;
  /** The number it went from: `marketing` (MDG Services) or `clients` (Dealer's Kavach). */
  line: WhatsAppLine;
  /**
   * The group it is listed under, in words: the place a campaign went to
   * ("Noida", read off `noida-film-29oct`), else what kind of message it was
   * ("Account ready", "Messages typed in the inbox"). Sends of one group are
   * next to each other in `sends`, its `total` first.
   */
  group: string;
  part: WhatsAppResultPart;
  /**
   * Messages to numbers this campaign had already tried: the ones it missed,
   * sent again. On a campaign's `total`, every try after a number's first. 0
   * for anything that is not a campaign.
   */
  sentAgain: number;
}

export interface WhatsAppResultPerson {
  /** The inbox's id for their chat: a number, `user:…` or `message:…`. */
  person: string;
  phone: string | null;
  name: string | null;
  /** The send this message is listed in: a campaign's day when it went on several, never a `total`. */
  sendId: string;
  outcome: WhatsAppResultOutcome;
  /** How we know they opened it. Null when we do not. */
  openedBy: 'tick' | 'sign' | null;
  sentAt: string;
  deliveredAt: string | null;
  readAt: string | null;
  /** Why it did not arrive, in Meta's words. */
  failure: string | null;
  /** Meta's code for why it did not arrive (131049 held back, 131026 not deliverable). */
  failureCode: number | null;
  hasLink: boolean;
  linkTaps: number;
  lastTapAt: string | null;
  /** The longest single watch of the film, in seconds; null without a tap. */
  watchedSeconds: number | null;
  replied: boolean;
  /** Pressed "मुझे कॉल करें". Not counted as `replied`. */
  askedCall: boolean;
  stopped: boolean;
  /**
   * Their lead on the Leads page, when they are one (29 Oct 2026): the page
   * links to it instead of offering "Add as lead". Absent from an older server.
   */
  lead?: WhatsAppResultLead | null;
  /**
   * On the stop list now, whichever promotion they stopped (`stopped` is about
   * this row's promotion only). A lead made of them would only close as "asked
   * to stop", so the page offers no "Add as lead". Absent from an older server.
   */
  onStopList?: boolean;
}

/** A Message results row's lead, as much as the row needs to link to it. */
export interface WhatsAppResultLead {
  id: string;
  ref: string;
}

export interface WhatsAppResults {
  /**
   * Both numbers' sends, in groups (`group`): campaigns first, the newest place
   * first and its days in order, then the other groups, the newest first.
   */
  sends: WhatsAppResultSend[];
  /** Every send of both numbers added together. */
  total: WhatsAppResultCounts;
  /** Every send of each number added together. */
  totals: Record<WhatsAppLine, WhatsAppResultCounts>;
  /** The number whose sends are open: the selected send's, or the one asked for with `all`. */
  line: WhatsAppLine;
  /** Which send `counts` and `people` are for: a send's id, or `all` (every send from `line`). */
  selected: string;
  counts: WhatsAppResultCounts;
  /** Everyone in the selected send, the most engaged first. */
  people: WhatsAppResultPerson[];
  generatedAt: string;
}
