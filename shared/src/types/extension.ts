/**
 * The Dealer Kavach Chrome extension (ADR 0032). One public extension; what it
 * shows depends on who signs in to it:
 *
 * - a dealer (owner or manager): their chat in a side panel, files dropped into
 *   it, a badge for new messages, and (owners) their own outlet's portals signed in;
 * - an admin: Summon, a badge for waiting messages and tickets, a dealer search,
 *   and a picture of a summoned portal page sent into that dealer's chat.
 *
 * The extension signs in as its own device (`surface: 'extension'`), so a
 * dealer's phone stays signed in beside it.
 */
import type { ShareAudience } from './share';
import type { SummonPortal } from './laptopBridge';

/** Where a sign-in came from. Only the extension names itself; every other sign-in is the app's one slot. */
export const SIGN_IN_SURFACES = ['extension'] as const;
export type SignInSurface = (typeof SIGN_IN_SURFACES)[number];

/** The store item's id. Its origin is the one extension the API answers (`EXTENSION_ORIGINS` adds dev builds). */
export const EXTENSION_STORE_ID = 'fdeceedgoipgpnkcodehalppchjndped';

/** One line in the badge's list: a thread with something new in it. */
export interface ExtensionBadgeItem {
  conversationId: string;
  /** Dealer mode: the thread's name as the app shows it ("Support", "Manager chat", in Hindi unless the member chose English). Admin mode: the outlet's code. */
  title: string;
  /** The newest message, plain text, at most 120 characters ("Photo", "PDF" for an attachment). */
  preview: string;
  at: string;
  /** Admin mode only. */
  dealerId?: string;
  dealerCode?: string | null;
  /** Admin mode only: a dealer message nobody has read, or an open ticket waiting for a reply. */
  kind?: 'message' | 'ticket';
}

/** GET /extension/badge for a dealer. */
export interface ExtensionDealerBadge {
  mode: 'dealer';
  /** Messages from others the user has not read, across their threads. */
  unread: number;
  latest: ExtensionBadgeItem[];
}

/** GET /extension/badge for an admin. */
export interface ExtensionAdminBadge {
  mode: 'admin';
  /** Dealer threads with a message no admin has read. */
  unreadChats: number;
  /** Open tickets waiting for the team. */
  waitingTickets: number;
  latest: ExtensionBadgeItem[];
}

export type ExtensionBadge = ExtensionDealerBadge | ExtensionAdminBadge;

/** GET /extension/dealers?code= : just enough to open a dealer's page or summon their portal. */
export interface ExtensionDealerHit {
  id: string;
  code: string;
  oilCompany: string | null;
  archived: boolean;
}

/** POST /extension/page-picture: a picture of a summoned portal page, into that dealer's chat. */
export interface ExtensionPagePictureBody {
  dealerId: string;
  audience: ShareAudience;
  /** A `data:image/jpeg;base64,` (or png) URL, from chrome.tabs.captureVisibleTab. */
  image: string;
  /** Which portal the page is on, for the message's words. */
  portal?: SummonPortal;
  /** An optional line from the admin, sent with the picture. */
  note?: string;
}

/**
 * The longest picture, as data-URL characters, that `POST /extension/page-picture` takes.
 * The live server's front door refuses a request over 4 MB before the API sees it, so the
 * extension shrinks a picture until it fits under this, leaving room for the rest of the body.
 */
export const PAGE_PICTURE_MAX_CHARS = 3_500_000;

/** What the page picture reached. */
export interface ExtensionPagePictureResult {
  /** Threads the picture was posted to. */
  sent: number;
}

/** Messages between the extension's side panel and the dealer app shown inside it (`?embed=extension`). */
export type EmbedFromApp =
  | { source: 'dk-app'; type: 'ready' }
  | { source: 'dk-app'; type: 'token'; token: string }
  | { source: 'dk-app'; type: 'signed-out'; reason?: EmbedSignOutReason };

/**
 * Why the app inside the panel signed out. `logout`: the person pressed Log out (or left
 * after deleting the account), so the panel signs the extension out too. `refused`: the
 * server refused the token the app held, which may only be an older one, so the panel checks
 * its own and hands it over again if it is still good.
 */
export type EmbedSignOutReason = 'logout' | 'refused';

export type EmbedFromExtension = { source: 'dk-ext'; type: 'auth'; token: string };
