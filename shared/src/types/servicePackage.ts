/**
 * The standard package: the fifteen services every Indian Oil outlet gets, set up
 * by the server from one button (or by itself once the outlet's logins work).
 *
 * The server works the start-up figures out from the portals — the pump's day
 * close, how far back the credit ledger must be read, the litres delivered since
 * the inspection — attaches each service with the same schedule every other
 * outlet runs on, and runs each once. The services that act for the dealer
 * (tanker density, water-test filing, DU OTP and TT acknowledgement,
 * declarations, fuel orders) are attached PAUSED and switched on when the
 * services start — since ADR 0050 that is the minute both logins work, by
 * itself; the two-day watch still holds every message they would send for a
 * person to look at first.
 *
 * The admin reads progress as a list of steps, each in plain words. A step that
 * cannot finish is looked at by the setup's watch: a passing cause is tried again
 * by itself, and only what needs a person says what to do, with "Try again".
 */

/** The fifteen services, in the order they are attached. */
export const STANDARD_PACKAGE_SERVICE_IDS = [
  'inspection-reports',
  'iras-shift-data',
  'credit-dod-monitoring',
  'water-ingress-testing',
  'ro-supply-status',
  'du-otp-acknowledgement',
  'tt-density',
  // Owner, 18 Nov 2026: every outlet gets it. On demand only: it acknowledges a
  // tanker on SDMS when an owner or manager asks in the chat ("chalan bhar do").
  'tt-acknowledgement',
  // Owner, 20 Nov 2026: every outlet gets it (ADR 0048). On demand only: it reads the
  // tanks' stock from IRAS when an owner or manager asks in the chat ("stock kitna hai").
  'stock-check',
  // Owner, 21 Nov 2026: every outlet gets it (ADR 0049). On demand only: it closes the
  // open SDMS Electrical Audit points when an owner or manager asks in the chat.
  'electrical-audit',
  // Owner, 26 Nov 2026: every outlet gets it (ADR 0052). Files a maintenance complaint on
  // IndianOil's portals when an owner or manager reports something broken in the chat,
  // and follows it. Held: it files for the dealer, so Start services switches it on.
  'maintenance-complaints',
  'dealer-declarations',
  'dsr-report',
  'load-planner',
  // ADR 0041: tracks every fuel order and places the ones an owner confirms in the
  // chat. Held: it messages the dealer and (on an owner's yes) writes to the portal.
  'fuel-indent',
] as const;
export type StandardPackageServiceId = (typeof STANDARD_PACKAGE_SERVICE_IDS)[number];

/** The steps, in the order they run. */
export const SERVICE_PACKAGE_STEPS = [
  'logins',
  'basic',
  'inspection',
  'shift_time',
  'credit',
  'shift_days',
  'invoices',
  'ledger_check',
  'dsr',
  'planner',
  'first_runs',
] as const;
export type ServicePackageStepKey = (typeof SERVICE_PACKAGE_STEPS)[number];

/** What each step is called on the admin's screen. */
export const SERVICE_PACKAGE_STEP_LABELS: Record<ServicePackageStepKey, string> = {
  logins: 'Check the SDMS and IRAS logins',
  basic: 'Attach the services that need no starting figures',
  inspection: 'Read the last inspection report',
  shift_time: 'Find the time the pump closes its day',
  credit: 'Set up credit and dues',
  shift_days: 'Collect the recent days of shift data',
  invoices: 'Read every tanker invoice since the inspection',
  ledger_check: 'Check the invoices against the credit ledger',
  dsr: 'Set up the DSR and make its first reports',
  planner: 'Set up the load planner',
  first_runs: 'Check every service has run once',
};

/**
 * An HPCL pump's steps, in the order they run (ADR 0045). The same eleven keys as Indian
 * Oil's, so the admin's screen reads the same way, but the inspection comes straight after
 * the login: HPCL's portals do not hold the inspection report's figures, so the setup asks
 * the owner for a photo of their copy, and nothing is attached until a person has typed its
 * date and time in (owner, 15 Nov 2026).
 */
export const HPCL_PACKAGE_STEPS: readonly ServicePackageStepKey[] = [
  'logins',
  'inspection',
  'basic',
  'shift_time',
  'credit',
  'shift_days',
  'invoices',
  'ledger_check',
  'dsr',
  'planner',
  'first_runs',
];

/** What each step is called on an HPCL pump's screen. */
export const HPCL_PACKAGE_STEP_LABELS: Record<ServicePackageStepKey, string> = {
  logins: 'Check the HPCL portal login',
  inspection: "Get the last inspection's date and time from the owner's report",
  basic: 'Attach HPCL account and QA inspection reports',
  shift_time: 'Attach HPCL day readings at the day close',
  credit: 'Set up credit and dues',
  shift_days: 'Collect the recent days of shift data',
  invoices: 'Read every tanker invoice since the inspection',
  ledger_check: 'Check the invoices against the credit ledger',
  dsr: 'Work out the DSR starting figures from HPCL CRIS',
  planner: 'Set up the load planner',
  first_runs: 'Check every service has run once',
};

/**
 * What each step needs finished (done or skipped) before it can run (ADR 0050). A step
 * that waits or needs a person stops only the steps that name it here; the rest carry
 * on. The same for an HPCL pump, whose own order still keeps every need first.
 */
export const SERVICE_PACKAGE_STEP_NEEDS: Record<
  ServicePackageStepKey,
  readonly ServicePackageStepKey[]
> = {
  logins: [],
  basic: ['logins'],
  inspection: ['logins'],
  shift_time: ['logins'],
  credit: ['logins'],
  shift_days: ['shift_time'],
  invoices: ['inspection'],
  ledger_check: ['invoices'],
  dsr: ['inspection', 'shift_days', 'invoices', 'ledger_check'],
  planner: ['dsr'],
  first_runs: ['basic'],
};

/**
 * - `pending`  not reached yet (or waiting for a step it needs)
 * - `running`  working now
 * - `waiting`  waiting on something outside the server (a login, readings not on the portal yet);
 *              tried again by itself at `retryAt`
 * - `blocked`  cannot go on until a person acts; the message says what to do
 * - `done`     finished (it may still carry notes worth reading)
 * - `skipped`  nothing to do (the service was already attached)
 */
export const SERVICE_PACKAGE_STEP_STATES = [
  'pending',
  'running',
  'waiting',
  'blocked',
  'done',
  'skipped',
] as const;
export type ServicePackageStepState = (typeof SERVICE_PACKAGE_STEP_STATES)[number];

/**
 * - `running`   steps are being worked through
 * - `waiting`   a step waits on something outside the server; tried again by itself
 * - `blocked`   a step needs a person; "Try again" resumes it
 * - `ready`     every step is done
 * - `released`  every step is done and the services have started
 */
export const SERVICE_PACKAGE_STATUSES = [
  'running',
  'waiting',
  'blocked',
  'ready',
  'released',
] as const;
export type ServicePackageStatus = (typeof SERVICE_PACKAGE_STATUSES)[number];

export interface ServicePackageStepView {
  key: ServicePackageStepKey;
  label: string;
  state: ServicePackageStepState;
  /** One plain sentence: what happened, or what a person has to do. */
  message: string | null;
  /** Things worth a look that did not stop the step. */
  notes: string[];
  startedAt: string | null;
  finishedAt: string | null;
  /** For a long step: how far through it is ("52 of 148 invoices"). */
  progress: { done: number; total: number } | null;
  /** A waiting step: when it is tried again by itself. */
  retryAt: string | null;
  /** How many times the step has been tried since it was last started by a person. */
  tries: number;
  /** What the setup's watch made of a step that could not finish; null for one that did. */
  watch: SetupWatchNote | null;
  /** The steps this one waits for, by label; empty when it does not wait for any. */
  waitsFor: string[];
}

/**
 * The setup's watch over a step that could not finish (ADR 0050):
 *
 * - `retrying`     a passing cause (readings not on the portal yet, a portal that did not
 *                  answer); the setup tries again by itself
 * - `needs_dealer` only the dealer can give what is missing (a login the portal refused)
 * - `needs_team`   a person at MDG has to look; `action` says what
 * - `fine`         nothing is wrong
 */
export const SETUP_WATCH_VERDICTS = ['retrying', 'needs_dealer', 'needs_team', 'fine'] as const;
export type SetupWatchVerdict = (typeof SETUP_WATCH_VERDICTS)[number];

export interface SetupWatchNote {
  verdict: SetupWatchVerdict;
  /** One plain sentence: what happened. */
  headline: string;
  /** One plain sentence: what a person should do; null when nobody has to do anything. */
  action: string | null;
  /** Who judged it: the fixed rules for known passing causes, or the AI. */
  by: 'rules' | 'ai';
  at: string;
}

/** The AI's read of what the finished steps noted: things worth a look, one line each. */
export interface SetupReview {
  /** `look` when at least one point is worth a person's eye. */
  verdict: 'fine' | 'look';
  headline: string;
  points: string[];
  by: 'rules' | 'ai';
  at: string;
}

export interface ServicePackageView {
  dealerId: string;
  status: ServicePackageStatus;
  startedAt: string;
  /** `auto` = started by itself when the outlet's logins worked. */
  startedBy: { kind: 'admin' | 'auto'; name: string | null };
  updatedAt: string;
  steps: ServicePackageStepView[];
  /** The services attached paused, switched on by Start services. */
  held: string[];
  releasedAt: string | null;
  /** What the server worked out, one plain line each ("The pump closes its day at 06:30"). */
  found: Array<{ label: string; value: string }>;
  /** The AI's read of the finished setup's notes; null until every step is done. */
  review: SetupReview | null;
}

/**
 * An HPCL pump's last inspection, as a person typed it from the owner's copy of the
 * officer's report. The DSR's starting figures are read from HPCL CRIS at this moment.
 */
export interface HpclInspectionEntry {
  /** `YYYY-MM-DD`, India time; null until typed. */
  date: string | null;
  /** `HH:mm`, India time; null until typed. */
  time: string | null;
  enteredBy: string | null;
  enteredAt: string | null;
  /** True while it can be typed, or typed again: the setup has started and Start services has not been pressed. */
  canEnter: boolean;
}

/** POST /dealers/:id/service-package/inspection — the inspection's date and time, India time. */
export interface HpclInspectionInput {
  date: string;
  time: string;
}

/** GET /dealers/:id/service-package */
export interface ServicePackageState {
  /** Whose package this outlet gets: Indian Oil's fifteen services, or HPCL's own. */
  company: 'iocl' | 'hpcl';
  /** Null until the package has been started for this outlet. */
  setup: ServicePackageView | null;
  /** The package's services and whether each is attached now. */
  services: Array<{
    serviceId: string;
    attached: boolean;
    status: string | null;
  }>;
  /** Why the button cannot be pressed now; null when it can. */
  cannotStart: string | null;
  /** HPCL only: the last inspection typed from the owner's report. Null for Indian Oil. */
  inspection: HpclInspectionEntry | null;
  /** When the outlet's services started (by a person or by themselves); null while they have not. */
  servicesStartedAt: string | null;
  /**
   * Whether the services start by themselves the minute the logins work (ADR 0050):
   * `soon` they will; `off` the switch is off on the server; `served` the outlet has been
   * served for days without ever being started, so the team decides; `not_iocl` the
   * outlet is not Indian Oil and starts by a person's press. Null once they have started.
   */
  autoStart: 'soon' | 'off' | 'served' | 'not_iocl' | null;
}
