/**
 * The standard package: the twelve services every Indian Oil outlet gets, set up
 * by the server from one button (or by itself once the outlet's logins work).
 *
 * The server works the start-up figures out from the portals — the pump's day
 * close, how far back the credit ledger must be read, the litres delivered since
 * the inspection — attaches each service with the same schedule every other
 * outlet runs on, and runs each once. Nothing reaches the dealer or writes to a
 * portal before the team presses Start services: tanker density (which messages
 * the dealer), water-test filing (which writes to the portal), DU OTP
 * acknowledgements (which message the dealer when an event appears) and TT
 * acknowledgement (which acknowledges tankers on SDMS when the outlet asks) are
 * attached PAUSED and switched on by Start services.
 *
 * The admin reads progress as a list of steps, each in plain words. A step that
 * cannot go on says why in one sentence and what a person has to do; "Try again"
 * resumes from that step.
 */

/** The twelve services, in the order they are attached. */
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
 * - `pending`  not reached yet
 * - `running`  working now
 * - `waiting`  waiting on something outside the server (a login not saved yet); checked again by itself
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
 * - `waiting`   a step waits on the dealer (a login); re-checked every few minutes
 * - `blocked`   a step needs a person; "Try again" resumes it
 * - `ready`     every step is done: review, then press Start services
 * - `released`  Start services was pressed and the held services were switched on
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
  /** Whose package this outlet gets: Indian Oil's twelve services, or HPCL's own. */
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
}
