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
 * ONE INBOX PER NUMBER (`WhatsAppLine`). We run two numbers with two jobs —
 * MDG Services for marketing, Dealer's Kavach for the dealers who use the
 * product — and a message from the wrong one is the mistake this page exists
 * to make impossible. So each number is its own inbox, as two phones would
 * be: its own chat list, unread counts, pins and windows. A message always
 * leaves from the inbox it was typed in, and every send names that inbox
 * (`line`): the server refuses one that does not, and never picks a number by
 * itself. A person who wrote to both numbers has two chats, one in each.
 * What the team knows about the PERSON — the name, the note, the lead stage —
 * is shared by both.
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
// Our numbers — one inbox each
// ─────────────────────────────────────────────────────────────────────────

/** Our WhatsApp numbers, by the job each does. Goes in URLs (`?line=`) and in every inbox request. */
export const WHATSAPP_LINES = ['marketing', 'clients'] as const;
export type WhatsAppLine = (typeof WHATSAPP_LINES)[number];

/** The inbox to open when nothing else says which. */
export const WHATSAPP_DEFAULT_LINE: WhatsAppLine = 'marketing';

export interface WhatsAppLineInfo {
  line: WhatsAppLine;
  /** Meta's id for the number. A send goes to this id's `/messages`. */
  numberId: string;
  /** The number as a person reads it. */
  phone: string;
  /** The name WhatsApp shows the person, exactly as Meta approved it. */
  name: string;
  /** The job, in one word: what the team calls this inbox. */
  purpose: string;
  /** What it is for, in one short sentence. */
  use: string;
}

/**
 * The two numbers. Both are on the same WhatsApp Business account, so the
 * templates below can go from either. Change an id only when Meta's changes.
 */
export const WHATSAPP_LINE_INFO: Readonly<Record<WhatsAppLine, WhatsAppLineInfo>> = {
  marketing: {
    line: 'marketing',
    numberId: '1359075327291270',
    phone: '+91 94702 93412',
    name: 'MDG Services',
    purpose: 'Marketing',
    use: 'Promotions, films and new leads.',
  },
  clients: {
    line: 'clients',
    numberId: '1407795215740559',
    phone: '+91 94702 93427',
    name: "Dealer's Kavach",
    purpose: 'Clients',
    use: 'Product messages to dealers who use Dealer Kavach.',
  },
};

export const isWhatsAppLine = (v: unknown): v is WhatsAppLine =>
  typeof v === 'string' && (WHATSAPP_LINES as readonly string[]).includes(v);

/** The inbox a number belongs to; null for an id that is not one of ours. */
export function lineOfNumber(numberId: string | null | undefined): WhatsAppLine | null {
  if (!numberId) return null;
  return WHATSAPP_LINES.find((l) => WHATSAPP_LINE_INFO[l].numberId === numberId) ?? null;
}

/** "Dealer's Kavach · Clients" — the inbox's name wherever there is room for only one line. */
export function lineLabel(line: WhatsAppLine): string {
  const info = WHATSAPP_LINE_INFO[line];
  return `${info.name} · ${info.purpose}`;
}

// ─────────────────────────────────────────────────────────────────────────
// The template a message goes in when the window is closed
// ─────────────────────────────────────────────────────────────────────────

/**
 * `mdg_simple_message` (en, MARKETING), approved 21 Oct 2026. Its body is
 * exactly `${greeting}\n\n{{1}}\n\n${closing}`, and it has no buttons.
 * Change nothing here without changing the template at Meta — a send whose
 * shape differs from the approved one is refused.
 */
export const WHATSAPP_SIMPLE_TEMPLATE = {
  name: 'mdg_simple_message',
  language: 'en',
  greeting: 'Namaste,',
  closing: 'Thank you,\nTeam MDG Services',
  /**
   * No button. It carried a "Stop promotions" quick reply until 21 Oct 2026,
   * when it was removed: Meta does not require one. Its policy asks that a
   * stop is honoured, not that every message carries a button for it, and
   * WhatsApp gives every person its own "Offers and announcements" switch for
   * a business's promotions, which reaches us as a `user_preferences` webhook.
   * A typed "stop promotions", "STOP" and the like put them on the stop list too.
   */
  button: null as string | null,
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

/** One person's chat with one of our numbers, as the list shows it. */
export interface WhatsAppChatSummary {
  /**
   * Names the person: their number as WhatsApp writes it (`918340711366`), or
   * `user:<id>` when Meta withheld the number. Goes in URLs encoded.
   */
  person: string;
  /** The inbox — our number — this chat is on. */
  line: WhatsAppLine;
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
  /** Shared by both inboxes: it is about the person. */
  stage: WhatsAppStage | null;
  /** In this inbox only. */
  pinned: boolean;
  /** Messages from them to this number nobody has read. A recorded stop and a reaction are not counted. */
  unread: number;
  /** Marked unread by hand ("come back to this"), in this inbox only. Cleared when the chat is read. */
  markedUnread: boolean;
  last: WhatsAppChatLast;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  /** They wrote last and nobody has answered. */
  needsReply: boolean;
  /**
   * When an ordinary reply from THIS number stops being possible. Null: the
   * window is closed (or never opened). A window belongs to a person and a
   * number together: writing to one number opens nothing on the other.
   */
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

/**
 * How the next message to this person would go, decided by the server. It
 * always goes from the chat's own inbox: the route says HOW, never which
 * number — that was settled by which inbox the chat is in.
 */
export interface WhatsAppReplyRoute {
  /** The chat's inbox, which the message goes from. */
  line: WhatsAppLine;
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

/** A person's chat on one of our numbers, in brief. */
export interface WhatsAppChatOnLine {
  line: WhatsAppLine;
  /** Messages from them to that number nobody has read. */
  unread: number;
  /** They wrote to that number last and nobody has answered there. */
  needsReply: boolean;
  /** They wrote to that number in the last 24 hours: an ordinary message can go from there now. */
  windowOpen: boolean;
  /** The newest message either way on that number. */
  lastAt: string;
}

/** Every inbox this person has a chat in, newest first (`GET /chats/:person/lines`). */
export interface WhatsAppChatLines {
  lines: WhatsAppChatOnLine[];
}

export interface WhatsAppChatDetail {
  chat: WhatsAppChatSummary;
  /** The inbox this detail is for (`chat.line`). */
  line: WhatsAppLine;
  /** A private note about this person, for the team. Shared by both inboxes. */
  note: string | null;
  reply: WhatsAppReplyRoute;
  /** Every name we hold for this number and where it came from. */
  knownAs: Array<{ name: string; source: string }>;
  /** When the first message either way was, on this number. */
  firstAt: string | null;
  /**
   * The same person's chats in our OTHER inboxes, newest first; empty when
   * they have none. The page shows it so an answer that belongs on the other
   * number is given there, not here.
   */
  elsewhere: WhatsAppChatOnLine[];
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
  /**
   * The inbox the message was typed in, which is the number it leaves from.
   * Required: a send without it is refused (`WHATSAPP_LINE_REQUIRED`) rather
   * than guessed — an old tab must not send from a number its screen never
   * showed.
   */
  line: WhatsAppLine;
  text: string;
  /**
   * Made by the composer, one per message (a UUID). Sending the same id twice
   * sends once: a double tap or a retried request cannot message a lead twice.
   */
  clientId: string;
  /** The message being answered, to quote it. Honoured only for an ordinary message. */
  replyTo?: string | null;
  /**
   * An address to send them to, as typed (`toLinkTarget` reads it). With one,
   * the message always goes in the link template — even inside the 24-hour
   * window — because only its button can be counted (`whatsappLinks.ts`).
   */
  link?: string | null;
}

/** Start a chat with somebody who is not in the inbox yet. */
export interface WhatsAppNewChatInput {
  /** As `WhatsAppSendInput.line`: the inbox it is started from, and the number it leaves from. */
  line: WhatsAppLine;
  /** An Indian mobile number in any shape a person types one. */
  phone: string;
  name?: string | null;
  text: string;
  clientId: string;
  /** As `WhatsAppSendInput.link`. */
  link?: string | null;
}

export interface WhatsAppSendResult {
  person: string;
  message: WhatsAppChatMessage;
}

/**
 * What a person at MDG can change about a chat. Every field optional; null
 * clears. Sent with the chat's inbox (`?line=`): `pinned` and `markedUnread`
 * belong to that inbox alone; `name`, `stage` and `note` are about the person
 * and show in both.
 */
export interface WhatsAppChatPatch {
  name?: string | null;
  stage?: WhatsAppStage | null;
  pinned?: boolean;
  markedUnread?: boolean;
  note?: string | null;
}

/** Marking a chat read, up to the newest message the reader's screen showed. */
export interface WhatsAppReadInput {
  /** The inbox the chat was read in. Only that number's messages are marked. */
  line: WhatsAppLine;
  upTo: string;
}

/** The counts the nav badge, the page title and the inbox switch carry. */
export interface WhatsAppInboxSummary {
  /** Chats with something unread, or marked unread — both inboxes together. */
  unreadChats: number;
  /** Both inboxes together. */
  needsReply: number;
  /** The same two counts for each inbox on its own. */
  lines: Record<WhatsAppLine, { unreadChats: number; needsReply: number }>;
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
  /**
   * The template a message with a link goes in (`WHATSAPP_LINK_TEMPLATE`).
   * Null until the server is told Meta has approved it: no link can be added.
   */
  linkTemplate: {
    name: string;
    greeting: string;
    closing: string;
    button: string;
    maxLength: number;
  } | null;
  textMaxLength: number;
  /**
   * The inboxes this server can send from. An admin page only lets a message
   * go from an inbox listed here: a server from before the two inboxes sends
   * no list — and would pick the number itself — so against one the page
   * refuses to send rather than show a number it cannot promise.
   */
  lines: WhatsAppLine[];
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
  /** The inbox — our number — they wrote to. Null for a number that is not one of our inboxes. */
  line: WhatsAppLine | null;
  /** What to call them (`WhatsAppChatSummary.name`), else null: show the number. */
  name: string | null;
  phone: string | null;
  /** One line: the words, or "Sent a photo". */
  preview: string;
  at: string;
}
