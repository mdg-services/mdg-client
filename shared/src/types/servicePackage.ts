/**
 * The standard package: the nine services every Indian Oil outlet gets, set up
 * by the server from one button (or by itself once the outlet's logins work).
 *
 * The server works the start-up figures out from the portals — the pump's day
 * close, how far back the credit ledger must be read, the litres delivered since
 * the inspection — attaches each service with the same schedule every other
 * outlet runs on, and runs each once. Nothing reaches the dealer or writes to a
 * portal before the team presses Start services: tanker density (which messages
 * the dealer), water-test filing (which writes to the portal) and DU OTP
 * acknowledgements (which message the dealer when an event appears) are attached
 * PAUSED and switched on by Start services.
 *
 * The admin reads progress as a list of steps, each in plain words. A step that
 * cannot go on says why in one sentence and what a person has to do; "Try again"
 * resumes from that step.
 */

/** The nine services, in the order they are attached. */
export const STANDARD_PACKAGE_SERVICE_IDS = [
  'inspection-reports',
  'iras-shift-data',
  'credit-dod-monitoring',
  'water-ingress-testing',
  'ro-supply-status',
  'du-otp-acknowledgement',
  'tt-density',
  'dsr-report',
  'load-planner',
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

/** GET /dealers/:id/service-package */
export interface ServicePackageState {
  /** Null until the package has been started for this outlet. */
  setup: ServicePackageView | null;
  /** The eight services and whether each is attached now. */
  services: Array<{
    serviceId: StandardPackageServiceId;
    attached: boolean;
    status: string | null;
  }>;
  /** Why the button cannot be pressed now; null when it can. */
  cannotStart: string | null;
}
