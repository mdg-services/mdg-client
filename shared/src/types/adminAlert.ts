/**
 * Admin alerts — the things a person at MDG has to act on, pushed to every
 * admin's phone and listed in the admin app until they are dealt with.
 *
 * ONE ALERT PER PROBLEM, NOT PER EVENT. A refused portal password makes a dozen
 * failed runs a day; it is one alert, raised once, that clears itself the first
 * time the password works again. That rule is the difference between a phone
 * that is listened to and one that is muted by Thursday, and it is why every
 * alert carries a `clearsWhen` sentence: the list says what makes it go away.
 *
 * Shared because the server decides who hears about a kind (`superAdminOnly`)
 * and the admin app labels the same kinds, and two copies of that table is how
 * a super-admin-only alert ends up on an account manager's screen.
 */

export const ADMIN_ALERT_KINDS = [
  /** A portal refused our password for an outlet, or no password is saved. */
  'login_refused',
  /** A service run failed and will not fix itself: a permanent fault, or a temporary one that outlived its retries. */
  'service_failed',
  /** A service was due and has not run. */
  'service_late',
  /** A service on a timer has no next run, so it will never run again by itself. */
  'service_stopped',
  /** A dealer has waited for a reply past the threshold. */
  'chat_waiting',
  /** A dealer sent a paper we asked for and it is waiting for review. */
  'paper_to_review',
  /** A filed paper is about to run out, or has, and no renewal has been filed. */
  'paper_expiring',
  /** A dealer sent proof for Kavach tasks and it is waiting for verification. */
  'kavach_to_verify',
  /** A daily report failed its correctness check and is being held back. */
  'report_held',
  /** An outlet's RO supply status reads blocked. */
  'supply_blocked',
  /** Ledger Watch found a charge that is not routine buying and paying. */
  'ledger_charge',
  /** A dealer holds a report or credit card that has since been corrected. */
  'outdated_copy',
  /** Somebody wrote back to our WhatsApp number and nobody has read it. */
  'whatsapp_reply',
  /** The server stopped without shutting down, or was off for a long time. */
  'server_restarted',
  /** One of the server's start-up steps failed. */
  'boot_step_failed',
] as const;
export type AdminAlertKind = (typeof ADMIN_ALERT_KINDS)[number];

/**
 * `OPEN` is on the to-do list. `DISMISSED` is hidden by a person while the
 * problem still stands, so it is not raised again until it has cleared and
 * come back. `RESOLVED` is over.
 */
export const ADMIN_ALERT_STATES = ['OPEN', 'DISMISSED', 'RESOLVED'] as const;
export type AdminAlertState = (typeof ADMIN_ALERT_STATES)[number];

/** Why an alert left the list. */
export const ADMIN_ALERT_RESOLUTIONS = ['cleared', 'dismissed', 'expired'] as const;
export type AdminAlertResolution = (typeof ADMIN_ALERT_RESOLUTIONS)[number];

export interface AdminAlertKindInfo {
  /** What the list filter calls this kind. */
  label: string;
  /** The one thing that makes it go away, in the words the list prints. */
  clearsWhen: string;
  /** Server health is engineering's business, not an account manager's. */
  superAdminOnly: boolean;
}

export const ADMIN_ALERT_KIND_INFO: Record<AdminAlertKind, AdminAlertKindInfo> = {
  login_refused: {
    label: 'Portal login',
    clearsWhen: 'Clears once the outlet signs in again.',
    superAdminOnly: false,
  },
  service_failed: {
    label: 'Service failed',
    clearsWhen: 'Clears on the next run that works, or when the service is paused.',
    superAdminOnly: false,
  },
  service_late: {
    label: 'Service late',
    clearsWhen: 'Clears once the service runs.',
    superAdminOnly: false,
  },
  service_stopped: {
    label: 'Service stopped',
    clearsWhen: 'Clears once the service has a next run again.',
    superAdminOnly: false,
  },
  chat_waiting: {
    label: 'Waiting for a reply',
    clearsWhen: 'Clears when someone replies.',
    superAdminOnly: false,
  },
  paper_to_review: {
    label: 'Paper to review',
    clearsWhen: 'Clears when the paper is accepted or sent back.',
    superAdminOnly: false,
  },
  paper_expiring: {
    label: 'Paper running out',
    clearsWhen: 'Clears when a renewal is sent in or filed.',
    superAdminOnly: false,
  },
  kavach_to_verify: {
    label: 'Kavach proof',
    clearsWhen: 'Clears when every submitted task is verified or sent back.',
    superAdminOnly: false,
  },
  report_held: {
    label: 'Report held back',
    clearsWhen: 'Clears when the report passes, is released by hand, or is sent.',
    superAdminOnly: false,
  },
  supply_blocked: {
    label: 'Supply blocked',
    clearsWhen: 'Clears when the RO supply status is no longer blocked.',
    superAdminOnly: false,
  },
  ledger_charge: {
    label: 'Ledger charge',
    clearsWhen: 'Clears when the movement is marked as read in Ledger watch.',
    superAdminOnly: false,
  },
  outdated_copy: {
    label: 'Outdated copy',
    clearsWhen: 'Clears when the corrected copy is sent.',
    superAdminOnly: false,
  },
  // Super-admin only, like the film pages and the site assistant's leads: the
  // people writing in are members of the public, not outlets on an account
  // manager's book, and the alert carries their name and what they wrote.
  whatsapp_reply: {
    label: 'WhatsApp reply',
    clearsWhen: 'Clears when the reply is marked as read.',
    superAdminOnly: true,
  },
  server_restarted: {
    label: 'Server',
    clearsWhen: 'Clears after a day, or when marked as seen.',
    superAdminOnly: true,
  },
  boot_step_failed: {
    label: 'Server start-up',
    clearsWhen: 'Clears when the step succeeds on a later start.',
    superAdminOnly: true,
  },
};

export interface AdminAlert {
  id: string;
  kind: AdminAlertKind;
  state: AdminAlertState;
  /** One line, outlet first: "15E · The portal refused our password". */
  title: string;
  /** What happened and what to do, in plain words. */
  body: string;
  /** The admin screen where it is fixed. */
  href: string;
  dealerId: string | null;
  dealerCode: string | null;
  /** How many of the thing, where the alert groups several (Kavach tasks). */
  count: number | null;
  /** When the problem was first seen. */
  openedAt: string;
  /** The last time the server checked and the problem was still there. */
  lastSeenAt: string;
  resolvedAt: string | null;
  resolution: AdminAlertResolution | null;
  dismissedAt: string | null;
  dismissedByName: string | null;
}

export interface AdminAlertList {
  items: AdminAlert[];
  /** Totals for the tab labels and the bell, scoped to what this admin may see. */
  counts: { open: number; dismissed: number };
}
