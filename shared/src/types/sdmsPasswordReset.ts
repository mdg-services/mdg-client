/**
 * "Forgot password?" for the IndianOil SDMS portal, done for the owner from the
 * chat's login box.
 *
 * IndianOil expires every outlet's SDMS password every few months ("Your password
 * has expired. Please go to Forgot Password option to reset."). The portal's own
 * reset asks for the outlet's SAP code and a picture code, sends an OTP to the
 * mobile registered with SDMS, and then takes the OTP and the new password
 * together. MDG does every step except the two only the owner can: reading the
 * OTP off their phone and choosing the new password.
 *
 * ONE RESET PER OUTLET AT A TIME. Several owners share one owners' chat, so two
 * of them can tap "Forgot password?" in the same minute. The second tap joins the
 * reset the first one started (both boxes follow the same record), and the first
 * OTP-and-password typed is the one used; a second answer is refused while the
 * first is being tried.
 */

/**
 * Where one reset stands.
 *
 *  - `starting`  MDG is opening the portal's reset page and sending the OTP.
 *  - `otp_sent`  the OTP went to the registered mobile; the box asks for it and
 *                for the new password. Also where a refused try comes back to,
 *                with `retry` saying why.
 *  - `checking`  an owner typed them; MDG is putting them into the portal.
 *  - `done`      the portal took the new password and MDG saved it.
 *  - `failed`    it stopped; `message` says why. Tap again to start over.
 *  - `expired`   nobody typed the OTP in time.
 *  - `cancelled` an owner saved the new password in the box instead.
 */
export const SDMS_RESET_STATES = [
  'starting',
  'otp_sent',
  'checking',
  'done',
  'failed',
  'expired',
  'cancelled',
] as const;
export type SdmsResetState = (typeof SDMS_RESET_STATES)[number];

/** The states in which the reset is still going, so a box keeps following it. */
export const SDMS_RESET_LIVE_STATES: readonly SdmsResetState[] = ['starting', 'otp_sent', 'checking'];

export function sdmsResetIsLive(state: SdmsResetState): boolean {
  return SDMS_RESET_LIVE_STATES.includes(state);
}

/**
 * Why the box is asking again after a try:
 *  - `wrong_otp`      the portal said the OTP was not right;
 *  - `password_used`  the portal will not take a password used before;
 *  - `password_rule`  the portal did not like the new password's shape.
 */
export type SdmsResetRetry = 'wrong_otp' | 'password_used' | 'password_rule';

/**
 * The portals whose "Forgot password?" works by an OTP to the owner's phone: SDMS, and the
 * old SDMS (IndianOil's "Business Login", `portalLogin.ts` `OLD_SDMS_PORTAL`). Both run on
 * this one record and this one box; what differs is the portal's page and its password rule.
 */
export type OtpResetPortal = 'sdms' | 'sdmsOld';

export const OTP_RESET_PORTALS: readonly OtpResetPortal[] = ['sdms', 'sdmsOld'];

/** `GET /me/portal-logins/sdms/reset/:id`, and the reset inside the login box's view. */
export interface SdmsResetView {
  id: string;
  /** Which login this reset is setting. Absent from a server that predates the old SDMS: `sdms`. */
  portal?: OtpResetPortal;
  state: SdmsResetState;
  /**
   * What the portal printed about where the OTP went, in its own words (it
   * masks the number itself, e.g. "OTP sent to registered mobile no XXXXXX4321").
   * Null until the OTP is sent.
   */
  sentTo: string | null;
  /** When the box stops taking the OTP (ISO). Null until the OTP is sent. */
  expiresAt: string | null;
  /** Set in `otp_sent` after a refused try. */
  retry: SdmsResetRetry | null;
  /**
   * The portal's own words about that refused try, clipped, when it gave any. Shown by the
   * old SDMS's box, whose password rule IndianOil does not print until it refuses one.
   */
  retryWords?: string | null;
  /** Plain words for an end state (`failed` mostly), both languages. */
  message: { en: string; hi: string } | null;
  /** Who tapped "Forgot password?", so a second owner reads "Ramesh started this". */
  startedByName: string | null;
  /** Who typed the OTP, while it is being tried and after. */
  answeredByName: string | null;
}

/**
 * The portal's own rule for a new password, from its reset page: 8 to 15
 * characters with at least one small letter, one capital and one digit. No
 * spaces — the portal does not say it refuses them, but a password a dealer
 * cannot type back reliably on a phone is no help.
 */
export const SDMS_NEW_PASSWORD_MIN = 8;
export const SDMS_NEW_PASSWORD_MAX = 15;
export const SDMS_NEW_PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[\x21-\x7e]{8,15}$/;

/**
 * The old SDMS's rule for a new password. IndianOil's "Business Login" does not print one
 * before a try, so this asks for what such logins take (and what its owners' passwords
 * look like): 8 to 15 characters with a small letter, a capital, a digit and a symbol. A password that passes this passes the SDMS rule too. If the portal still
 * refuses one, its own words come back to the box (`retryWords`).
 */
export const SDMS_OLD_NEW_PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])[\x21-\x7e]{8,15}$/;

/** The rule a new password must follow on this portal before it is sent. */
export function newPasswordRuleFor(portal: OtpResetPortal | null | undefined): RegExp {
  return portal === 'sdmsOld' ? SDMS_OLD_NEW_PASSWORD_RE : SDMS_NEW_PASSWORD_RE;
}

/** The OTP the portal sends: digits only. Its length is not printed anywhere, so 4–8. */
export const SDMS_RESET_OTP_RE = /^\d{4,8}$/;

/**
 * `POST /me/portal-logins/sdms-old/reset` answers 409 with this when no user ID is on record
 * (no old SDMS login and no SDMS login saved) and none was typed.
 */
export const SDMS_OLD_RESET_NO_USER_ID = 'SDMS_OLD_RESET_NO_USER_ID';
/** A start of one portal's reset while the other portal's reset is going for the outlet. */
export const SDMS_RESET_OTHER_GOING = 'SDMS_RESET_OTHER_GOING';

/** `POST /me/portal-logins/sdms/reset` answers 409 with this when no SAP code is on record. */
export const SDMS_RESET_NO_SAP_CODE = 'SDMS_RESET_NO_SAP_CODE';
/** `PUT …/reset/:id`: someone else's OTP is already being tried. */
export const SDMS_RESET_ALREADY_ANSWERED = 'SDMS_RESET_ALREADY_ANSWERED';
/** `PUT …/reset/:id`: the reset has ended. */
export const SDMS_RESET_OVER = 'SDMS_RESET_OVER';
/** `PUT /me/portal-logins/sdms` while a reset is putting a new password in. */
export const SDMS_RESET_IN_PROGRESS = 'SDMS_RESET_IN_PROGRESS';
