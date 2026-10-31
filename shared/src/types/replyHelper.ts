/**
 * The Reply helper (ADR 0025): an admin-only panel beside an open conversation
 * that DRAFTS replies to a dealer or a lead. It never sends, never posts and
 * never makes a payment link. "Use this" puts a draft in the reply box; the
 * admin still presses Send.
 *
 * ONE HELPER THREAD PER PERSON. The server derives the person, and so the
 * thread, from the open conversation alone ({@link ReplyHelperTarget}) — the
 * client never names a thread, so it cannot ask about one person while showing
 * another. A WhatsApp number that belongs to exactly one dealer login shares
 * that login's thread with the app chat.
 */
import type { GuideVideoFamily, GuideVideoText } from './videoLibrary';
import type { WhatsAppLine } from './whatsappInbox';

export const REPLY_HELPER_CHANNELS = ['app', 'whatsapp'] as const;
export type ReplyHelperChannel = (typeof REPLY_HELPER_CHANNELS)[number];

/** The conversation the panel sits beside. Everything else is worked out from this. */
export type ReplyHelperTarget =
  | { channel: 'app'; conversationId: string }
  | { channel: 'whatsapp'; line: WhatsAppLine; person: string };

/**
 * Who a draft is cleared for — the lowest-clearance person who will read it.
 * `none`: a lead or an unknown number. No outlet facts at all.
 */
export const REPLY_HELPER_READERS = ['owner', 'manager', 'none'] as const;
export type ReplyHelperReader = (typeof REPLY_HELPER_READERS)[number];

/** A dealer login a WhatsApp number may belong to. */
export interface ReplyHelperLogin {
  userId: string;
  name: string | null;
  role: 'dealer-owner' | 'dealer-staff';
  dealerCode: string | null;
}

export const REPLY_HELPER_NOTICE_KINDS = [
  /** WhatsApp: their last message is older than the reply window. */
  'window_closed',
  /** WhatsApp: the box cannot send to this chat at all (stop list, no number…). */
  'blocked',
  /** Several dealer logins share this number and none is picked. */
  'pick_login',
  /** The outlet is archived. */
  'archived',
  /** The model is not set up on this server. */
  'not_configured',
] as const;
export type ReplyHelperNoticeKind = (typeof REPLY_HELPER_NOTICE_KINDS)[number];

/** A line about the whole conversation, shown under the panel's header. Plain words. */
export interface ReplyHelperNotice {
  kind: ReplyHelperNoticeKind;
  words: string;
}

export interface ReplyHelperContext {
  /** "Anurag Singh · WhatsApp, Dealer's Kavach line". Always says who and which channel. */
  header: string;
  /** The person, as the header names them. */
  who: string;
  /** The channel, as the header names it ("App chat, owner's own chat"). */
  where: string;
  reader: ReplyHelperReader;
  /** Who reads a draft, in words: "the owner", "the manager and the owners", "a lead — no pump facts". */
  readerWords: string;
  dealerCode: string | null;
  /** WhatsApp only: the dealer login this number is tied to, when there is one. */
  login: ReplyHelperLogin | null;
  /** WhatsApp only: the logins to pick from, when several share this number. Empty otherwise. */
  loginChoices: ReplyHelperLogin[];
  /** WhatsApp only: how the reply box would send right now. Null for the app chat. */
  sendMode: 'text' | 'template' | null;
  notices: ReplyHelperNotice[];
}

export const REPLY_HELPER_WARNING_KINDS = [
  /** A figure that is in no record, the terms, or the admin's own words. */
  'unsourced_figure',
  'unsourced_date',
  'unsourced_name',
  'unsourced_service',
  /** A figure the person typed, repeated back as if MDG said it. */
  'echoed_figure',
  'contact_detail',
  /** An app-chat draft that says how or where to pay (Google Play). */
  'payment_words_in_app',
  /** An app-chat draft that carries a link. */
  'link_in_app',
  /** "First month free" in any words. The first month is paid. */
  'free_month',
  /** The draft wants the payment link and the open bill has none live. */
  'no_live_link',
  /** WhatsApp template mode: a greeting or sign-off the template already adds. */
  'template_repeat',
  /** WhatsApp template mode: longer than the template allows. */
  'too_long',
  /** Talks about how MDG does its work, or about the machine. */
  'internal_method',
  'other',
] as const;
export type ReplyHelperWarningKind = (typeof REPLY_HELPER_WARNING_KINDS)[number];

export interface ReplyHelperWarning {
  kind: ReplyHelperWarningKind;
  /** `red`: breaks a rule (Play, first month). `amber`: check before sending. */
  severity: 'red' | 'amber';
  /** Plain words for the admin. */
  words: string;
}

/** A stretch of a draft to highlight: `[start, end)` in UTF-16 code units of `text`. */
export interface ReplyHelperHighlight {
  start: number;
  end: number;
  kind: ReplyHelperWarningKind;
}

export interface ReplyHelperDraft {
  id: string;
  /** Ready for the reply box. In a WhatsApp draft the live payment link is already in place. */
  text: string;
  warnings: ReplyHelperWarning[];
  highlights: ReplyHelperHighlight[];
}

/**
 * A video the helper suggests sending beside the reply. The model names it; code
 * checks it is one this person may be sent on this channel (the same rules as
 * "Send a video") and that the start is one of its chapters. In the app chat the
 * admin sends the video itself with one tap; on WhatsApp only a public explainer
 * can be suggested, and its page link goes into the reply.
 */
export interface ReplyHelperVideo {
  /** The library id. */
  id: string;
  /** Where to start: one of its chapter starts, or 0. */
  startSec: number;
  /** Why it fits, in one short English line for the admin. */
  why: string;
  /** As the library named it when suggested, so an old turn still reads if the library moves on. */
  title: GuideVideoText;
  family: GuideVideoFamily;
  /** WhatsApp: the public page to put in the reply. Null in the app chat. */
  link: string | null;
}

export interface ReplyHelperReply {
  /** A short note to the admin: what the drafts do, and anything to check. */
  note: string;
  drafts: ReplyHelperDraft[];
  /** What neither the knowledge nor the conversation covers. "Check before sending." */
  notCovered: string[];
  /** Up to two videos worth sending with the reply, best first. Empty when none fits. */
  videos: ReplyHelperVideo[];
}

export interface ReplyHelperTurn {
  id: string;
  /** ISO time. */
  at: string;
  channel: ReplyHelperChannel;
  /** The channel as it was named when the turn was asked. */
  where: string;
  askedBy: { id: string; name: string | null };
  instruction: string;
  /** Null when the helper could not answer; `failure` says why. */
  reply: ReplyHelperReply | null;
  failure: string | null;
}

export interface ReplyHelperThread {
  context: ReplyHelperContext;
  /** Oldest first. */
  turns: ReplyHelperTurn[];
  /** Older turns exist; ask again with `before` = the oldest turn's id. */
  hasMore: boolean;
}

/** `POST /admin/reply-helper/turns` */
export interface ReplyHelperAskInput {
  target: ReplyHelperTarget;
  instruction: string;
}

export interface ReplyHelperAskResult {
  turn: ReplyHelperTurn;
  context: ReplyHelperContext;
}

/** `POST /admin/reply-helper/login`: which login a shared WhatsApp number belongs to. Null clears the pick. */
export interface ReplyHelperPickLoginInput {
  line: WhatsAppLine;
  person: string;
  userId: string | null;
}

/** Longest instruction an admin may type. */
export const REPLY_HELPER_INSTRUCTION_MAX = 1_000;
/** Turns returned per page. */
export const REPLY_HELPER_PAGE = 20;
