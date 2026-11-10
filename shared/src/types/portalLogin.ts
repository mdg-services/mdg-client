import type { SdmsResetView } from './sdmsPasswordReset';

/**
 * The outlet's portal logins — Indian Oil's SDMS and IRAS (and IndianOil Partners for
 * an owner who runs a tanker, and IOC XtraPower where the team asks for it), or the dealer portals of BPCL or HPCL
 * (`types/oilCompany.ts`) — as the dealer side may see and fill them.
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

export type PortalId = 'sdms' | 'iras' | 'bpcl' | 'econnect' | 'hpcl' | 'partners' | 'xtrapower' | 'sdmsOld';

export const PORTAL_IDS: readonly PortalId[] = ['sdms', 'iras', 'bpcl', 'econnect', 'hpcl', 'partners', 'xtrapower', 'sdmsOld'];

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
 * IndianOil Partners (pwa.indianoil.in/Partners), the portal of an Indian Oil owner who
 * also runs a tanker for IndianOil. Asked only of an owner who said yes to "do you own a
 * tanker?" (`PortalLoginsView.tanker`). Its sign-in sits behind Google's "I'm not a
 * robot" tick, so like a company portal it is saved and read back and never tried
 * automatically; MDG's team works it by hand. Unlike one, it sits BESIDE SDMS and IRAS,
 * never in their place — which is why it is not a company portal.
 *
 * Its one automated step is the owner's own "Forgot password?": IndianOil's reset page
 * takes the user ID (the vendor SAP code) and a picture code, and sends a new password to
 * the mobile or email IndianOil has on record (`PortalResetView`).
 */
export const TANKER_PORTAL: PortalId = 'partners';

/**
 * IOC XtraPower (beta.iocxtrapower.com), IndianOil's fleet-card portal. Asked ON DEMAND
 * only: the team ticks it in "Ask for portal login" for the outlet that needs it, and it
 * is never part of onboarding. Its sign-in sits behind Google's "I'm not a robot" tick,
 * so like IndianOil Partners it is saved and read back and never tried automatically.
 *
 * Its "Forgot password?" is GUIDED, never automated: the last step of XtraPower's own
 * reset is behind the same tick, so the owner does the reset on XtraPower's page (the
 * phone app opens it in its own screen with the steps on top) and then types the new
 * password into the box. See {@link XTRAPOWER_RESET_URL}.
 */
export const XTRAPOWER_PORTAL: PortalId = 'xtrapower';

/** XtraPower's own "Reset Password" page: user ID, registered mobile, a 6-digit SMS code, a new password. */
export const XTRAPOWER_RESET_URL = 'https://beta.iocxtrapower.com/account/reset-password';

/**
 * The old SDMS: IndianOil's older Siebel-based SDMS, signed in to through IndianOil's
 * "Business Login" page (access.ex.indianoil.in). Its user ID is usually the same as the
 * outlet's SDMS ID. It is NEVER part of onboarding and no service uses it: MDG's team asks
 * an owner for it when a piece of work needs it ("Ask for login" in the admin), and only
 * then does the outlet's box carry its row (`Dealer.sdmsOldAskedAt`). Saved and read back,
 * never tried automatically — MDG's team works it by hand.
 *
 * Its one automated step is the owner's "Forgot password?", done like the SDMS one: IndianOil
 * sends an OTP to the mobile registered with the login, the owner types it with a new
 * password, MDG puts them in (`SdmsResetView` with `portal: 'sdmsOld'`).
 */
export const OLD_SDMS_PORTAL: PortalId = 'sdmsOld';

/**
 * The portals MDG asks for only when the team asks — IOC XtraPower and the old SDMS: never
 * part of onboarding or of what a service needs, and never "owed" by the outlet.
 */
export const ON_DEMAND_PORTAL_IDS: readonly PortalId[] = [XTRAPOWER_PORTAL, OLD_SDMS_PORTAL];

/** True for a login asked for only on demand ({@link ON_DEMAND_PORTAL_IDS}). */
export function isOnDemandPortal(p: PortalId): boolean {
  return ON_DEMAND_PORTAL_IDS.includes(p);
}

/** The portals nothing tries on its own: the company portals, IndianOil Partners, IOC XtraPower and the old SDMS. */
export const HAND_WORKED_PORTAL_IDS: readonly PortalId[] = [
  ...COMPANY_PORTAL_IDS,
  TANKER_PORTAL,
  XTRAPOWER_PORTAL,
  OLD_SDMS_PORTAL,
];

/** True for a login that is saved and read back but never tried automatically. */
export function isHandWorkedPortal(p: PortalId): boolean {
  return HAND_WORKED_PORTAL_IDS.includes(p);
}

/**
 * True for a portal whose box row offers the "new password is sent to you" kind of
 * "Forgot password?" (`POST /me/portal-logins/partners/reset`). SDMS and the old SDMS have
 * the OTP kind instead ({@link OtpResetPortal}), IOC XtraPower the guided kind
 * ({@link guidedResetUrl}).
 */
export function canResetPortalPassword(p: PortalId): boolean {
  return p === TANKER_PORTAL;
}

/**
 * The portal's own reset page, for a portal whose "Forgot password?" the owner does
 * themselves with the box's steps beside it (IOC XtraPower). Null for every other portal.
 */
export function guidedResetUrl(p: PortalId): string | null {
  return p === XTRAPOWER_PORTAL ? XTRAPOWER_RESET_URL : null;
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
  partners: 'IndianOil Partners',
  xtrapower: 'IOC XtraPower',
  sdmsOld: 'Old SDMS',
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
  /** The newest "Forgot password?" on this login, while it matters. Only where one can be asked. */
  reset?: PortalResetView;
  /**
   * SDMS and the old SDMS: the box may offer the OTP "Forgot password?". For SDMS the
   * outlet's SAP code is on record, which is what the portal's own reset asks for. For
   * the old SDMS a user ID is on record to reset with (its own saved one, else the SDMS
   * ID, which is usually the same), so "Forgot password?" works with the ID field left
   * empty. See `sdmsPasswordReset.ts`.
   */
  resetPossible?: boolean;
}

/**
 * Where an owner's "Forgot password?" stands (`canResetPortalPassword`):
 *  - `running`  MDG is filling the portal's reset page now (about a minute)
 *  - `sent`     the portal said it sent a new password to the owner's registered mobile
 *               or email: the box asks the owner to type it in
 *  - `failed`   it did not go through; `reason` says why
 */
export type PortalResetState = 'running' | 'sent' | 'failed';

/**
 * Why a reset did not go through:
 *  - `wrong_id`   the portal does not know that user ID
 *  - `not_done`   anything else: the portal was down, slow, changed, or its picture code
 *                 would not read. Never the owner's fault; they may try again later.
 */
export type PortalResetFailure = 'wrong_id' | 'not_done';

export interface PortalResetView {
  state: PortalResetState;
  /** When it was asked for (ISO). */
  at: string;
  /** When it ended (ISO). Absent while `running`. */
  doneAt?: string;
  /** Only with `failed`. */
  reason?: PortalResetFailure;
  /**
   * Only with `sent`: the request went in, but the portal's answer was not a plain "sent".
   * The owner is still asked to watch for the new password, in less certain words.
   */
  unclear?: boolean;
  /**
   * What the portal itself said, word for word and clipped, when it said something
   * worth showing ("Password sent to your registered email id"). Never a password:
   * the portal does not show one, and nothing that looks like one is kept.
   */
  portalWords?: string;
}

/**
 * The "do you also own a tanker?" question of an Indian Oil outlet. A yes adds the
 * IndianOil Partners login to what the box asks for.
 */
export interface PortalTankerView {
  /** True when this outlet is asked the question: an Indian Oil outlet. */
  asked: boolean;
  /** The answer, or null while there is none. */
  owns: boolean | null;
  /** Who answered: the owner, or MDG's team for them. Null while there is no answer. */
  answeredBy: 'dealer' | 'mdg' | null;
}

/** `GET /me/portal-logins` — the box's state for the signed-in dealer user. */
export interface PortalLoginsView {
  portals: PortalLoginState[];
  /** True when this user may fill the box. Owners only: the logins are the owner's. */
  canEdit: boolean;
  /** The tanker question. Absent from a server that predates it. */
  tanker?: PortalTankerView;
  /**
   * The SDMS "Forgot password?" reset that is going now, or that ended in the last
   * few minutes (so every owner's box shows how it ended). Null when there is none.
   */
  sdmsReset?: SdmsResetView | null;
  /** The same for the old SDMS's "Forgot password?". Absent from a server that predates it. */
  sdmsOldReset?: SdmsResetView | null;
}

/**
 * The error codes of `POST /me/portal-logins/:portal/reset`: a reset is already under
 * way, or the outlet has used up today's resets (each one makes the portal send a new
 * password, and the last one is the only one that works).
 */
export const PORTAL_RESET_RUNNING = 'PORTAL_RESET_RUNNING';
export const PORTAL_RESET_TOO_MANY = 'PORTAL_RESET_TOO_MANY';
/** No user ID saved and none typed: the portal's reset page needs one. */
export const PORTAL_RESET_NO_USER_ID = 'PORTAL_RESET_NO_USER_ID';

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
