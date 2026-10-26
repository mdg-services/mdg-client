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
  /** The AI raised a ticket — a dealer question only a person can settle — and nobody has resolved it. */
  'ticket_open',
  /** Somebody sent a grievance from the website and nobody has resolved it. */
  'grievance_open',
  /** A dealer filled in "Register your pump" and nobody has been in touch yet. */
  'enrolment_new',
  /** Somebody asked for a call on the website (the film pages' form, among others) and nobody has called yet. */
  'callback_new',
  /** A payment went wrong in a way a person must look at: paid twice, paid after it was cancelled, or a refund that failed. */
  'payment_problem',
  // ── Onboarding v2 (docs/specs/onboarding-v2.md §4) ──
  /** A new outlet has not moved for a day and the next step is the dealer's. */
  'onboarding_stalled',
  /** A new outlet has not moved for two days or more: somebody should ring them. */
  'onboarding_call',
  /** A new outlet is waiting on MDG (send the bill, start the services) past the working-hours limit. */
  'onboarding_mdg_waiting',
  /** Somebody replied NO to the "your account is ready" WhatsApp: the registration may not be theirs. */
  'onboarding_not_me',
  /** The "your account is ready" WhatsApp did not reach the dealer. */
  'welcome_not_delivered',
  /** An owner signed in but their phone has never registered for notifications, so reminders cannot reach them. */
  'no_working_device',
  /** "Forgot password" from the sign-in screen: somebody should call the registered number. */
  'password_help',
  /** A message for an outlet in its watch period is waiting for a person to send or drop it. */
  'held_message',
  /** A subscription payment is past its due date. */
  'payment_overdue',
  /** An outlet's autopay stopped — the owner stopped it, their UPI app did, or the debits kept failing: call them. */
  'autopay_stopped',
  // ── Leads (ADR 0024) ──
  /** Somebody started the full film and nobody has been in touch yet. */
  'lead_new',
  /** A lead's follow-up time has come. */
  'lead_due',
  /** A lead's follow-up is a working day late. */
  'lead_cold',
  /** A dealer deleted their own account from the app; their details are wiped in 30 days unless it is undone. */
  'account_deletion',
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
  ticket_open: {
    label: 'Ticket',
    // Hiding the alert does NOT resolve the ticket. Only a person writing a
    // resolution note on the ticket does.
    clearsWhen: 'Clears when someone resolves the ticket with a note.',
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
  // Super-admin only for the same reason: a member of the public's complaint,
  // which may be about one of our own staff.
  grievance_open: {
    label: 'Grievance',
    clearsWhen: 'Clears when someone resolves the grievance with a note.',
    superAdminOnly: true,
  },
  // Every admin: approving a registration is onboarding work any admin does.
  enrolment_new: {
    label: 'New registration',
    clearsWhen: 'Clears when the registration is marked as contacted.',
    superAdminOnly: false,
  },
  callback_new: {
    label: 'Call-back',
    clearsWhen: 'Clears when the request is marked as called.',
    superAdminOnly: true,
  },
  payment_problem: {
    label: 'Payment',
    clearsWhen: 'Clears when someone marks the payment as checked.',
    superAdminOnly: true,
  },
  onboarding_stalled: {
    label: 'New outlet stuck',
    clearsWhen: 'Clears when the outlet moves to its next step, or the setup is closed.',
    superAdminOnly: false,
  },
  onboarding_call: {
    label: 'Call a new outlet',
    clearsWhen: 'Clears when a call is logged, the outlet moves, or the setup is closed.',
    superAdminOnly: false,
  },
  onboarding_mdg_waiting: {
    label: 'New outlet waiting on us',
    clearsWhen: 'Clears when MDG does the step (bill sent, services started).',
    superAdminOnly: false,
  },
  // Every admin: any admin checks a disowned registration and clears it.
  onboarding_not_me: {
    label: 'Registration disowned',
    clearsWhen: 'Clears when a person has checked it and marked it.',
    superAdminOnly: false,
  },
  welcome_not_delivered: {
    label: 'Welcome not delivered',
    clearsWhen: 'Clears when the owner signs in, or the welcome is sent again and arrives.',
    superAdminOnly: false,
  },
  no_working_device: {
    label: 'No notifications',
    clearsWhen: "Clears when the owner's phone registers for notifications.",
    superAdminOnly: false,
  },
  password_help: {
    label: 'Forgot password',
    clearsWhen: 'Clears when the request is marked done.',
    superAdminOnly: false,
  },
  held_message: {
    label: 'Message to check',
    clearsWhen: 'Clears when every held message is sent, dropped or has expired.',
    superAdminOnly: false,
  },
  payment_overdue: {
    label: 'Payment overdue',
    clearsWhen: 'Clears when the payment is paid or cancelled.',
    superAdminOnly: false,
  },
  // Every admin, by the owner's request (24 Oct 2026): the whole team works the
  // leads. The alert names the lead and nothing else — never a number or
  // anything a stranger typed — because it lands on a lock screen.
  lead_new: {
    label: 'New lead',
    clearsWhen: 'Clears when somebody logs a contact, or the lead is closed.',
    superAdminOnly: false,
  },
  lead_due: {
    label: 'Lead follow-up',
    clearsWhen: 'Clears when somebody logs a contact or sets a new follow-up time.',
    superAdminOnly: false,
  },
  lead_cold: {
    label: 'Lead going cold',
    clearsWhen: 'Clears when somebody logs a contact or sets a new follow-up time.',
    superAdminOnly: false,
  },
  autopay_stopped: {
    label: 'Autopay stopped',
    clearsWhen: 'Clears when the call is marked done, or autopay is set up again.',
    superAdminOnly: false,
  },
  account_deletion: {
    label: 'Account deleted',
    clearsWhen: 'Clears when the details are wiped, or a super-admin restores the account.',
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
