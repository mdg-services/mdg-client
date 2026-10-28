/**
 * The outlet's portal logins — Indian Oil's SDMS and IRAS, or the one dealer
 * portal of BPCL or HPCL (`types/oilCompany.ts`) — as the dealer side may see
 * and fill them.
 *
 * MDG's team works on these portals on the outlet's behalf: the daily sales
 * report and the stock variation sheet come from IRAS, credit and due dates,
 * water checks, the density register, supply status and inspection reports
 * from SDMS. Until a login is in, the services that need it cannot start, and
 * when the dealer changes a password on the portal they must give MDG the new
 * one.
 *
 * MDG ASKS IN THE CHAT. An MDG message carrying {@link MessagePortalLogin} is
 * drawn by the dealer's app as a small form — user ID, password, Save — inside
 * the bubble. What is typed goes straight to the outlet's record over its own
 * route (`PUT /me/portal-logins/:portal`), encrypted at rest, and NEVER into a
 * chat message: the thread only ever learns that a login was saved, not what
 * it was.
 *
 * DEALER-SAFE BY TYPE. Nothing here carries a user ID or a password. The box
 * learns whether a login is saved, missing or was refused by the portal, and
 * when — enough to draw "saved ✓" or the empty form, and nothing a screenshot
 * of the chat could leak.
 */

export type PortalId = 'sdms' | 'iras' | 'bpcl' | 'econnect' | 'hpcl';

export const PORTAL_IDS: readonly PortalId[] = ['sdms', 'iras', 'bpcl', 'econnect', 'hpcl'];

/**
 * The company portals: BPCL's two (its dealer portal, and BROMA/eConnect) and HPCL's
 * one. MDG's team works them by hand for now, so nothing tries such a login on its own
 * (no queued check, no refusal hold) and the box never sends the SDMS/IRAS explainer
 * video with it.
 */
export const COMPANY_PORTAL_IDS: readonly PortalId[] = ['bpcl', 'econnect', 'hpcl'];

/** True for a company portal (BPCL, BROMA/eConnect, HPCL): saved and read back, never tried automatically. */
export function isCompanyPortal(p: PortalId): boolean {
  return COMPANY_PORTAL_IDS.includes(p);
}

/**
 * The portal's name as a dealer knows it. The same in both languages. A company
 * portal is named by its company ("BPCL portal") or by the name the dealer knows it
 * by ("BROMA/eConnect"), never by what MDG does on it.
 */
export const PORTAL_NAMES: Readonly<Record<PortalId, string>> = {
  sdms: 'SDMS',
  iras: 'IRAS',
  bpcl: 'BPCL portal',
  econnect: 'BROMA/eConnect',
  hpcl: 'HPCL portal',
};

/**
 * Set on an MDG message that asks an owner for portal logins. The app draws
 * one row per portal: the empty form while the login is missing or refused,
 * "saved" once it is in. An app that predates the field shows the words only.
 */
export interface MessagePortalLogin {
  /** The logins asked for, in the order the box shows them. */
  portals: PortalId[];
}

/**
 * Where one login stands:
 *  - `missing`  no login on the outlet's record
 *  - `refused`  a login is saved but the portal stopped accepting it (the
 *               password was changed on the portal) — the box asks again
 *  - `saved`    a login is in and nothing says it stopped working
 */
export type PortalLoginStatus = 'saved' | 'missing' | 'refused';

export interface PortalLoginState {
  portal: PortalId;
  /**
   * True when a service attached to this outlet uses this login (SDMS: any of
   * the SDMS services; IRAS: the shift readings) — or when no service at all is
   * attached yet, because then the outlet is still being set up and every MDG
   * service it can take needs both. An outlet whose daily sales report is typed
   * in by hand, with no shift readings attached, does not need IRAS.
   */
  needed: boolean;
  status: PortalLoginStatus;
  /** When the saved login was entered (ISO). Absent while `missing`. */
  savedAt?: string;
  /** Who entered it: an owner from the app, or MDG's team. Absent while `missing`. */
  savedBy?: 'dealer' | 'mdg';
  /** When the portal stopped accepting it (ISO). Only with `refused`. */
  refusedAt?: string;
}

/** `GET /me/portal-logins` — the box's state for the signed-in dealer user. */
export interface PortalLoginsView {
  portals: PortalLoginState[];
  /** True when this user may fill the box. Owners only: the logins are the owner's. */
  canEdit: boolean;
}

/**
 * The error code `PUT /me/portal-logins/:portal` answers when the dealer types
 * the very user ID and password the portal has already refused. Saving it again
 * would only be refused again, so the box says so instead.
 */
export const PORTAL_LOGIN_SAME_AS_REFUSED = 'PORTAL_LOGIN_SAME_AS_REFUSED';

/** `POST /dealers/:id/portal-login/ask` — what an admin's ask posted. */
export interface PortalLoginAskResult {
  /** Owner chats the box went into. */
  posted: number;
  /** The logins asked for. */
  portals: PortalId[];
  /** True when the explainer video went with it. */
  video: boolean;
}

/**
 * The id of one of the short videos MDG sends inside the chat — a plain string,
 * validated against the video library (`types/videoLibrary.ts`), not a fixed
 * list. A video is one folder with a `library.json` plus an upload, so adding
 * one is never a code change: `app_tour`, `portal_login`, `papers`,
 * `density_register`, `kavach_photos`, `add_manager`, `getting_started` and
 * every service video are all just ids in the catalog.
 */
export type GuideVideoId = string;

/** True for an attachment the chat should play inline rather than offer as a download. */
export function isVideoAttachment(a: { contentType?: string | null }): boolean {
  return typeof a.contentType === 'string' && a.contentType.toLowerCase().startsWith('video/');
}
