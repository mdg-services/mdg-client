/**
 * WhatsApp inbox — the admin's WhatsApp, for the numbers we run on Meta's
 * Cloud API.
 *
 * There is no handset behind those numbers. Every message we send and every
 * message sent to us is a row in our database (`whatsappmessages`), and this
 * inbox is the only place a person at MDG reads one or answers one. So it is
 * built to behave like the WhatsApp app does: one chat per person, newest
 * first, unread counts, ticks, and a box to type into.
 *
 * Two ways a typed message can go, and Meta decides which is allowed:
 *
 * - `text` — an ordinary message, exactly as typed. Only while the person's
 *   24-hour window is open: they wrote to us in the last 24 hours.
 * - `template` — the approved "simple message" template: a greeting, the
 *   typed words as its one variable, and a sign-off
 *   (`WHATSAPP_SIMPLE_TEMPLATE`). Allowed at any time, but it is a promotion
 *   in Meta's eyes: it is charged as one, it cannot go to anybody on the stop
 *   list, and the words have to fit on one paragraph.
 *
 * The server picks; the admin is told which before pressing send.
 */

// ─────────────────────────────────────────────────────────────────────────
// The template a message goes in when the window is closed
// ─────────────────────────────────────────────────────────────────────────

/**
 * `mdg_simple_message` (en, MARKETING), approved 21 Oct 2026. Its body is
 * exactly `${greeting}\n\n{{1}}\n\n${closing}` with one quick-reply button.
 * Change nothing here without changing the template at Meta — a send whose
 * shape differs from the approved one is refused.
 */
export const WHATSAPP_SIMPLE_TEMPLATE = {
  name: 'mdg_simple_message',
  language: 'en',
  greeting: 'Namaste,',
  closing: 'Thank you,\nTeam MDG Services',
  /** The quick-reply button under it. Tapping it puts the person on the stop list. */
  button: 'Stop promotions',
  /**
   * The longest the typed words may be. Meta caps a template body at 1,024
   * characters including the fixed words; this leaves a margin under that.
   */
  maxLength: 900,
} as const;

/** The longest ordinary message WhatsApp takes. */
export const WHATSAPP_TEXT_MAX_LENGTH = 4096;

/**
 * The typed words as the template's variable. Meta refuses a variable that
 * holds a line break, a tab, or more than four spaces in a row, so the lines
 * are joined into one paragraph. What comes back is exactly what is sent —
 * the composer previews it, so nobody is surprised by the join.
 */
export function toTemplateParam(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(' ')
    .replace(/\t/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
}

/** The whole message as the person sees it when it goes in the template. */
export function renderSimpleTemplate(text: string): string {
  const t = WHATSAPP_SIMPLE_TEMPLATE;
  return `${t.greeting}\n\n${toTemplateParam(text)}\n\n${t.closing}`;
}

// ─────────────────────────────────────────────────────────────────────────
// Chats
// ─────────────────────────────────────────────────────────────────────────

/** Where a lead stands, set by a person at MDG. Null until somebody sets it. */
export const WHATSAPP_STAGES = [
  'new',
  'talking',
  'interested',
  'converted',
  'not_interested',
] as const;
export type WhatsAppStage = (typeof WHATSAPP_STAGES)[number];

export const WHATSAPP_STAGE_LABELS: Record<WhatsAppStage, string> = {
  new: 'New lead',
  talking: 'In conversation',
  interested: 'Interested',
  converted: 'Converted',
  not_interested: 'Not interested',
};

/**
 * The lists the inbox can show.
 *
 * - `unread` — something from them nobody has read, or marked unread by hand.
 * - `needs_reply` — they wrote last and nobody has answered since.
 * - `waiting` — we wrote last and they have not answered (including people
 *   who have never written at all).
 * - `stopped` — on the stop list: no template can go to them.
 */
export const WHATSAPP_CHAT_FILTERS = [
  'all',
  'unread',
  'needs_reply',
  'waiting',
  'stopped',
] as const;
export type WhatsAppChatFilter = (typeof WHATSAPP_CHAT_FILTERS)[number];

export const WHATSAPP_CHAT_FILTER_LABELS: Record<WhatsAppChatFilter, string> = {
  all: 'All',
  unread: 'Unread',
  needs_reply: 'Needs reply',
  waiting: 'Waiting on them',
  stopped: 'Stopped',
};

/**
 * How far a message we sent got, as WhatsApp's ticks show it.
 *
 * - `accepted` — Meta took it; no "sent" report yet (a clock).
 * - `sent` / `delivered` / `read` — one grey tick, two grey, two blue.
 * - `failed` — Meta reported it was not delivered; `error` says why.
 * - `unknown` — the send got no clear answer; it may or may not have gone.
 */
export type WhatsAppDelivery = 'accepted' | 'sent' | 'delivered' | 'read' | 'failed' | 'unknown';

/** One line about the newest message, for the chat list. */
export interface WhatsAppChatLast {
  id: string;
  direction: 'in' | 'out';
  at: string;
  /** One line, already worded: "Sent a photo", "Asked us to stop", the words themselves. */
  preview: string;
  kind: string | null;
  /** Outbound only. */
  delivery: WhatsAppDelivery | null;
}

/** One person's chat, as the list shows it. */
export interface WhatsAppChatSummary {
  /**
   * Names the person: their number as WhatsApp writes it (`918340711366`), or
   * `user:<id>` when Meta withheld the number. Goes in URLs encoded.
   */
  person: string;
  phone: string | null;
  /**
   * What to call them, best first: the name saved in the inbox, the name we
   * greeted them by in a campaign, a name we hold elsewhere (an assistant
   * lead, a registration), their WhatsApp profile name. Null: show the number.
   */
  name: string | null;
  /** The name on their own WhatsApp profile. */
  profileName: string | null;
  /** Where we know them from, in a few words ("Assistant lead"), when we do. */
  source: string | null;
  stage: WhatsAppStage | null;
  pinned: boolean;
  /** Messages from them nobody has read. A recorded stop and a reaction are not counted. */
  unread: number;
  /** Marked unread by hand ("come back to this"). Cleared when the chat is read. */
  markedUnread: boolean;
  last: WhatsAppChatLast;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  /** They wrote last and nobody has answered. */
  needsReply: boolean;
  /** When an ordinary reply stops being possible. Null: the window is closed (or never opened). */
  windowClosesAt: string | null;
  /** On the stop list. */
  optedOut: boolean;
  /** They said stop and we could not tell whose number it is. */
  unplacedStop: boolean;
}

export interface WhatsAppChatList {
  items: WhatsAppChatSummary[];
  /** Chats in each list, whatever list or search is showing. */
  counts: Record<WhatsAppChatFilter, number>;
  /** Pass back as `cursor` for the next page; null when there is none. */
  nextCursor: string | null;
}

/** How the next message to this person would go, decided by the server. */
export interface WhatsAppReplyRoute {
  /** Our number it goes from (Meta's id for it). */
  phoneNumberId: string;
  /** That number as a person reads it: "+91 94702 93412 · MDG Services". */
  numberLabel: string;
  mode: 'text' | 'template';
  /** Why, in one plain sentence. */
  reason: string;
  /** Null when a message can go. Otherwise why it cannot, in one plain sentence. */
  blocked: string | null;
}

export interface WhatsAppChatDetail {
  chat: WhatsAppChatSummary;
  /** A private note about this person, for the team. */
  note: string | null;
  reply: WhatsAppReplyRoute;
  /** Every name we hold for this number and where it came from. */
  knownAs: Array<{ name: string; source: string }>;
  /** When the first message either way was. */
  firstAt: string | null;
}

// ─────────────────────────────────────────────────────────────────────────
// Messages
// ─────────────────────────────────────────────────────────────────────────

export interface WhatsAppChatMessage {
  /** Meta's id for the message (`wamid`). */
  id: string;
  direction: 'in' | 'out';
  at: string;
  /**
   * What Meta calls it: `text`, `template`, `image`, `video`, `audio`,
   * `document`, `sticker`, `location`, `contacts`, `button`, `interactive`,
   * `unsupported`, … Null on an old row we cannot name.
   */
  kind: string | null;
  /**
   * The words as the person at MDG should read them: the typed text, a
   * photo's caption, the label of a tapped button — or, for a template we
   * sent, the whole message as it arrived on their phone. Null when there are
   * none.
   */
  text: string | null;
  /** Outbound: whether it went as an ordinary message or in a template. Null for an old row. */
  via: 'text' | 'template' | null;
  /** Outbound: the template's name, when it went in one. */
  template: string | null;
  /** Buttons WhatsApp draws under the message (a template's quick replies and links). */
  buttons: string[];
  /** Outbound: who at MDG sent it. Null for a campaign or a send from outside the inbox. */
  sentBy: { id: string; name: string } | null;
  /** Outbound only. */
  delivery: WhatsAppDelivery | null;
  /** Outbound and failed: why, in plain words, and Meta's code. */
  error: { code: number | null; reason: string } | null;
  /** Inbound media, fetched through `GET /admin/whatsapp/media/:id`. */
  media: {
    mime: string | null;
    filename: string | null;
    /** False once Meta no longer holds the file (it keeps them about 30 days). */
    available: boolean;
  } | null;
  location: {
    latitude: number;
    longitude: number;
    name: string | null;
    address: string | null;
  } | null;
  /** The person's current reaction to this message, if they reacted. */
  reaction: string | null;
  /** The message this one quotes, when it quotes one. */
  replyTo: {
    id: string;
    direction: 'in' | 'out' | null;
    text: string | null;
    kind: string | null;
  } | null;
  /** Inbound: the person asked us to stop promotions. */
  stop: boolean;
  /** False with `stop`: we could not tell whose number it was, so nothing is on the stop list. */
  stopRecorded: boolean;
  /** Inbound: when somebody at MDG read it. */
  seenAt: string | null;
  /** Our number it was on. */
  phoneNumberId: string | null;
  /** Outbound from the inbox: the composer's id for it, so a pending bubble can be matched. */
  clientId: string | null;
}

export interface WhatsAppMessagePage {
  /** Oldest first. */
  items: WhatsAppChatMessage[];
  /** Older messages exist before `items[0]`; ask again with `before` = its `id`. */
  hasMore: boolean;
}

// ─────────────────────────────────────────────────────────────────────────
// Writing
// ─────────────────────────────────────────────────────────────────────────

export interface WhatsAppSendInput {
  text: string;
  /**
   * Made by the composer, one per message (a UUID). Sending the same id twice
   * sends once: a double tap or a retried request cannot message a lead twice.
   */
  clientId: string;
  /** The message being answered, to quote it. Honoured only for an ordinary message. */
  replyTo?: string | null;
}

/** Start a chat with somebody who is not in the inbox yet. */
export interface WhatsAppNewChatInput {
  /** An Indian mobile number in any shape a person types one. */
  phone: string;
  name?: string | null;
  text: string;
  clientId: string;
}

export interface WhatsAppSendResult {
  person: string;
  message: WhatsAppChatMessage;
}

/** What a person at MDG can change about a chat. Every field optional; null clears. */
export interface WhatsAppChatPatch {
  name?: string | null;
  stage?: WhatsAppStage | null;
  pinned?: boolean;
  markedUnread?: boolean;
  note?: string | null;
}

/** The two numbers the nav badge and the page title carry. */
export interface WhatsAppInboxSummary {
  /** Chats with something unread, or marked unread. */
  unreadChats: number;
  needsReply: number;
}

/** A saved answer, typed with `/shortcut` in the composer. */
export interface WhatsAppQuickReply {
  id: string;
  /** Lower-case letters, digits and dashes, no slash: `price`, `demo-time`. */
  shortcut: string;
  text: string;
  updatedAt: string;
}

export interface WhatsAppQuickReplyInput {
  shortcut: string;
  text: string;
}

/** What the composer needs to know before anything is typed. */
export interface WhatsAppInboxConfig {
  /** False when the server holds no access token: messages can be read, not sent. */
  sendingEnabled: boolean;
  /**
   * `auto` — an ordinary message while the window is open, the template
   * otherwise. `template` — always the template.
   */
  replyMode: 'auto' | 'template';
  template: {
    name: string;
    greeting: string;
    closing: string;
    button: string | null;
    maxLength: number;
  };
  textMaxLength: number;
  /** The numbers we send from. */
  numbers: Array<{ id: string; label: string; isDefault: boolean }>;
}

// ─────────────────────────────────────────────────────────────────────────
// Live updates (super-admin sockets only)
// ─────────────────────────────────────────────────────────────────────────

/** Something in these chats changed: a message, a tick, a name. Refetch what is on screen. */
export interface WhatsAppChangedEvent {
  persons: string[];
}

/** Somebody wrote to us. For the toast, the sound and the desktop notification. */
export interface WhatsAppIncomingEvent {
  person: string;
  /** What to call them (`WhatsAppChatSummary.name`), else null: show the number. */
  name: string | null;
  phone: string | null;
  /** One line: the words, or "Sent a photo". */
  preview: string;
  at: string;
}
