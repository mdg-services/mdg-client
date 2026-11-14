/**
 * The admin "action needed" queue (ADR 0043): the human-in-the-loop steps of a service
 * run that only a person can finish, surfaced to every admin in an urgent place.
 *
 * Two kinds, and neither defeats a captcha:
 *  - `robot_tick`   a human admin signs in to IndianOil Partners / IOC XtraPower in their
 *                   own Chrome (Summon) and clicks "I'm not a robot" themselves. The
 *                   server never signs these in, so such an item never holds a server
 *                   browser slot.
 *  - `picture_code` a distorted-text captcha (eMaaptaul, SDMS, IRAS) the model could not
 *                   read; the admin reads the image and types it. Its run holds a browser
 *                   slot only for the short window it is on screen (ADR 0043, option A).
 *
 * The view never carries a password or a user ID.
 */
import type { PortalId } from './portalLogin';

export const ADMIN_ACTION_KINDS = ['robot_tick', 'picture_code'] as const;
export type AdminActionKind = (typeof ADMIN_ACTION_KINDS)[number];

/**
 * `queued`   waiting for any admin; holds no browser slot.
 * `claimed`  an admin holds the lease and is handling it.
 * `running`  the claimed work is live (a `picture_code` is holding its slot for the window).
 * `done`     finished.
 * `failed`   could not be finished (a run error, not the timer).
 * `expired`  the timer ran out before it was finished; a `picture_code` becomes retryable.
 */
export const ADMIN_ACTION_STATES = ['queued', 'claimed', 'running', 'done', 'failed', 'expired'] as const;
export type AdminActionState = (typeof ADMIN_ACTION_STATES)[number];

/** Who holds the claim lease. Never more than one at a time. */
export interface AdminActionClaim {
  id: string;
  name: string | null;
  at: string;
}

/** One pending human step, as the admin queue draws it. Never a user ID or a password. */
export interface AdminActionView {
  id: string;
  kind: AdminActionKind;
  state: AdminActionState;
  dealerId: string;
  /** The outlet code, e.g. "15E" — a dealer IS its code. */
  dealerCode: string;
  /** The service this step belongs to, and its dealer-readable label. */
  serviceId: string | null;
  serviceLabel: string;
  portal: PortalId;
  /** The portal as a person reads it ("IndianOil Partners", "eMaaptaul"). */
  portalName: string;
  /** The service run this belongs to, when there is one. */
  runId: string | null;
  createdAt: string;
  /** The countdown end; null for an item with no timer. `picture_code` uses ~240s (4 min). */
  deadlineAt: string | null;
  claim: AdminActionClaim | null;
  /** How many times this step has been tried (a Retry adds one). */
  attempts: number;
  /** `robot_tick` only: open Summon for this dealer + portal to do the tick. */
  canSummon?: boolean;
  /** `picture_code` only: a signed URL to the captcha image, while it is on screen. */
  pictureUrl?: string | null;
  /** `picture_code` only: what the portal asks for, when known ("digits only", "letters only"). */
  pictureHint?: string | null;
}

/** `GET /admin-actions` — the open queue and a count for the badge. */
export interface AdminActionsView {
  /** Open items (not done/failed), newest need first. */
  actions: AdminActionView[];
  /** How many are `queued` and unclaimed — the urgent badge. */
  waiting: number;
}

/** The seconds a `picture_code` item stays live before it expires to a Retry (ADR 0043). */
export const PICTURE_CODE_WINDOW_SEC = 240;

/** A claim could not be taken because another admin holds it. */
export const ADMIN_ACTION_TAKEN = 'ADMIN_ACTION_TAKEN';
/** The item is no longer open (done, failed, or expired past retry). */
export const ADMIN_ACTION_GONE = 'ADMIN_ACTION_GONE';
