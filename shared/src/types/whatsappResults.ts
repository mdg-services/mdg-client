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
 *   the person's code in it can be counted, and so far that is the film
 *   invite's button. A link typed into a message's words is not tracked.
 *
 * A "send" is one message to many people: one campaign from the campaign
 * script, or the same words sent from the inbox on the same day.
 */

/** Which send the page shows when it names none: every send at once. */
export const WHATSAPP_RESULTS_ALL = 'all';

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
  /** People who wrote back or reacted (not counting "stop"). */
  replied: number;
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
  /** The kind of message in plain words: "Film invite", "Message". */
  kind: string;
  /** The campaign script's name for it; null for anything sent another way. */
  campaign: string | null;
  firstSentAt: string;
  lastSentAt: string;
  counts: WhatsAppResultCounts;
}

export interface WhatsAppResultPerson {
  /** The inbox's id for their chat: a number, `user:…` or `message:…`. */
  person: string;
  phone: string | null;
  name: string | null;
  sendId: string;
  outcome: WhatsAppResultOutcome;
  /** How we know they opened it. Null when we do not. */
  openedBy: 'tick' | 'sign' | null;
  sentAt: string;
  deliveredAt: string | null;
  readAt: string | null;
  /** Why it did not arrive, in Meta's words. */
  failure: string | null;
  hasLink: boolean;
  linkTaps: number;
  lastTapAt: string | null;
  /** The longest single watch of the film, in seconds; null without a tap. */
  watchedSeconds: number | null;
  replied: boolean;
  stopped: boolean;
}

export interface WhatsAppResults {
  /** Newest first. */
  sends: WhatsAppResultSend[];
  /** Every send added together. */
  total: WhatsAppResultCounts;
  /** Which send `counts` and `people` are for: a send's id, or `all`. */
  selected: string;
  counts: WhatsAppResultCounts;
  /** Everyone in the selected send, the most engaged first. */
  people: WhatsAppResultPerson[];
  generatedAt: string;
}
