/**
 * Mock Drill submission (ADR 0034).
 *
 * Every outlet must run an emergency mock drill from time to time and record it
 * on IndianOil's SDMS portal: sidebar ▸ Mock Drill Declarations ▸ Mock Drill
 * (opens a new tab, `ioconline/Safety/mock_drill_details.jsp`). A Field Officer
 * approves what is submitted; while one report waits for approval the portal
 * refuses another.
 *
 * MDG's version asks the owner for the two things only they can give — WHICH
 * emergency was practised and the photos of the drill — and fills the rest.
 * The fields split in two:
 *
 *  - DEPENDENT: scenario, the two photos, persons present, observers,
 *    observations, recommendations. They depend on what the photos show, so a
 *    person (an admin) checks them the first time. Once approved they are kept
 *    on the outlet and reused for later drills unless the owner says it was a new
 *    kind of drill.
 *  - GENERATED: date, time, the response-time table, duration, "all clear", the
 *    short narrative and the remarks. Written fresh every time, short and varied.
 *
 * WHAT THE PORTAL'S PAGE IS (read live on 1E, 11 Nov 2026, nothing saved): see
 * `MockDrillPortalValues` for the field ids. The page loads its own saved data
 * with `POST ../MockDrill content=EXISTINGDATA` (status NOTPRESENT / PRESENT = a
 * saved draft / PENDING = a report awaits approval, buttons disabled / REJECTED =
 * returned by the Field Officer with a remark), and Submit is one multipart
 * `POST ../MockDrill content=Submit` that answers "S" (success), "P" (one is
 * already pending approval) or "E" (try later), each shown as an alert().
 */

export const MOCK_DRILL_SERVICE_ID = 'mock-drill';

/** What kind of emergency a scenario is; the text generator writes from this. */
export const MOCK_DRILL_FAMILIES = [
  'fire',
  'spill',
  'leak',
  'electric',
  'vehicle',
  'injury',
  'security',
  'natural',
  'explosion',
] as const;
export type MockDrillFamily = (typeof MOCK_DRILL_FAMILIES)[number];

export interface MockDrillScenario {
  /** The portal's own option value, e.g. "e18". */
  id: string;
  /** The portal's own option text, verbatim, e.g. "Electrical Fire in DU". */
  label: string;
  family: MockDrillFamily;
  /** The ones an outlet really practises; listed first in the dealer's dropdown. */
  common: boolean;
}

/**
 * The portal's "Details of Emergency Scenario" options (read live 11 Nov 2026),
 * without "Other" (it needs a free-text scenario, which the chat does not ask).
 * Order here = the order the dealer's dropdown shows.
 */
export const MOCK_DRILL_SCENARIOS: readonly MockDrillScenario[] = [
  { id: 'e18', label: 'Electrical Fire in DU', family: 'fire', common: true },
  { id: 'e17', label: 'Electrical Fire in Panel', family: 'fire', common: true },
  { id: 'e19', label: 'Electrical Fire in Sales Building', family: 'fire', common: true },
  { id: 'e15', label: 'Fire during TT decantation', family: 'fire', common: true },
  { id: 'e16', label: 'Product Spillage during TT Decantation', family: 'spill', common: true },
  { id: 'e21', label: 'Fire in Customer Vehicle', family: 'fire', common: true },
  { id: 'e24', label: 'Vehicle hitting DU causing leakage & fire', family: 'vehicle', common: true },
  { id: 'e23', label: 'Vehicle hitting DU causing leakage only', family: 'vehicle', common: true },
  { id: 'e20', label: 'Electrical Shock to RO staff / vendor contract worker', family: 'electric', common: true },
  { id: 'e25', label: 'RO staff hit by stray vehicle', family: 'injury', common: true },
  { id: 'e14', label: 'Sabotage, Bomb Expolsion, Threat', family: 'security', common: true },
  { id: 'e12', label: 'Agitation / Forced entry by external group of people', family: 'security', common: true },
  { id: 'e13', label: 'Natural perils like Earthquake, Flood, Tsunami', family: 'natural', common: true },
  { id: 'e4', label: 'Spillage from storage tank during receipt', family: 'spill', common: true },
  { id: 'e1', label: 'Product leakage from flanges / pipe / valves', family: 'leak', common: true },
  { id: 'e22', label: 'Fall from height', family: 'injury', common: true },
  { id: 'e2', label: 'Pinhole leakage from Piping', family: 'leak', common: false },
  { id: 'e3', label: 'Failure of gasket resulting in leakage', family: 'leak', common: false },
  { id: 'e5', label: 'Leakage from Piping due uto damage from external source, sabotage, pilferage', family: 'leak', common: false },
  { id: 'e6', label: 'Failure caused by corrosion effect', family: 'leak', common: false },
  { id: 'e7', label: 'Failure caused by miscellaneous factors such as material defects', family: 'leak', common: false },
  { id: 'e8', label: 'Failure of Road Tankers', family: 'spill', common: false },
  { id: 'e9', label: 'Full bore rupture of piping', family: 'leak', common: false },
  { id: 'e10', label: 'Vapour Cloud Explosion', family: 'explosion', common: false },
  { id: 'e11', label: 'BLEVE (Fireball)', family: 'explosion', common: false },
];

/** "Type of Mock Drill": the portal's option values. Outlets practise Level 1. */
export const MOCK_DRILL_LEVELS = ['1', '2', '3'] as const;
export type MockDrillLevel = (typeof MOCK_DRILL_LEVELS)[number];

/** The nine rows of the response-time table, in the portal's order (ids t11x … t19x). */
export const MOCK_DRILL_EVENT_ROWS = [
  'Siren activation after initiation',
  'Reporting of CIC',
  'Reporting of SIC',
  'Fire Team',
  'Medical Team',
  'Security Team',
  'Mutual Aid',
  'E&M',
  'Others',
] as const;

/** Longest text each portal box takes (its maxlength). */
export const MOCK_DRILL_LIMITS = {
  initiation: 150,
  description: 500,
  eventRemark: 500,
  headCountAction: 1000,
  observations: 500,
  recommendations: 1000,
  observerName: 1000,
  observerArea: 1000,
  scenarioOther: 500,
} as const;

/** The photos the portal needs: exactly two images, each at most 5 MB. */
export const MOCK_DRILL_PHOTO_COUNT = 2;
export const MOCK_DRILL_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

export interface MockDrillPhotoRef {
  key: string;
  filename: string;
  size: number;
  mime: string;
  at: string;
}
export interface MockDrillPhotoView extends MockDrillPhotoRef {
  /** Short-lived link to open it. */
  url: string | null;
}

export interface MockDrillObserver {
  name: string;
  area: string;
}

/**
 * The part that depends on the photos and the outlet. An admin checks it the
 * first time (and any time the owner starts a new kind of drill); once approved it
 * is the outlet's reusable setup.
 */
export interface MockDrillDependent {
  scenarioId: string;
  scenarioLabel: string;
  photos: MockDrillPhotoRef[];
  /** "Total persons present in the installation before the drill" (t21). */
  personsPresent: number;
  /** Persons not found at the assembly point (t23); almost always 0. */
  headCountShort: number;
  /** Up to three observers (t331/t332, t341/t342, t351/t352). */
  observers: MockDrillObserver[];
  /** "Observations (including the positives of the drill)" (t31). */
  observations: string;
  /** "Recommendations" (t32). */
  recommendations: string;
}

export interface MockDrillDependentView extends Omit<MockDrillDependent, 'photos'> {
  photos: MockDrillPhotoView[];
}

/** One row of the response-time table. Seconds; the remark is usually empty. */
export interface MockDrillEventRow {
  event: (typeof MOCK_DRILL_EVENT_ROWS)[number];
  expected: number;
  actual: number;
  remark: string;
}

/** The part written fresh for every drill. */
export interface MockDrillGenerated {
  /** YYYY-MM-DD, IST. The day the drill was done. */
  date: string;
  /** HH:mm, a multiple of 5 minutes (the portal's picker steps by 5). */
  time: string;
  durationMinutes: number;
  /** "dd/mm/yyyy HH:mm": start + duration. */
  allClear: string;
  initiation: string;
  description: string;
  events: MockDrillEventRow[];
  /** "Action taken to search the shortfall of headcounts, if any." (t24) */
  headCountAction: string;
}

/**
 * Exactly what the portal's page is given, keyed by the page's own element ids.
 * Strings throughout: the page reads every box with `.val()`.
 */
export interface MockDrillPortalValues {
  /** dd/mm/yyyy (the picker's format; the box is disabled, set by script). */
  date: string;
  /** HH:mm. */
  time: string;
  /** "1" | "2" | "3". */
  type: string;
  /** The scenario option value, e.g. "e18". */
  scenarios: string;
  /** Only for "Other"; always "" here. */
  scenario: string;
  initiation: string;
  description: string;
  /** t11x … t19x: x1 expected seconds, x2 actual seconds, x3 remark. */
  rows: Array<{ expected: string; actual: string; remark: string }>;
  /** t21 persons present, t22 at assembly point, t23 difference, t24 action. */
  t21: string;
  t22: string;
  t23: string;
  t24: string;
  /** dd/mm/yyyy HH:mm (disabled, set by script). */
  allClear: string;
  /** Duration in minutes. */
  t26: string;
  t31: string;
  t32: string;
  /** Observers 1–3: t331/t332, t341/t342, t351/t352. */
  observers: Array<{ name: string; area: string }>;
}

/** Where a submission stands at MDG. */
export const MOCK_DRILL_STATES = [
  /** The owner is giving the scenario, photos and the day. */
  'collecting',
  /** Waiting for an admin to check the dependent fields against the photos. */
  'review',
  /** Approved (or reused and cleared); a run will file it. */
  'ready',
  /** A run is filling the portal now. */
  'submitting',
  /** The portal said "S". The Field Officer's approval is the portal's own. */
  'submitted',
  /** Our submit did not go through; `failure` says why in plain words. */
  'failed',
  /** The owner or an admin dropped it. */
  'cancelled',
] as const;
export type MockDrillState = (typeof MOCK_DRILL_STATES)[number];

export const MOCK_DRILL_OPEN_STATES: readonly MockDrillState[] = [
  'collecting',
  'review',
  'ready',
  'submitting',
  'failed',
];

/** Where the portal itself says the outlet's mock drill stands (read from EXISTINGDATA). */
export const MOCK_DRILL_PORTAL_STATES = [
  'unknown',
  /** Nothing saved or submitted. */
  'none',
  /** A saved draft (PRESENT). */
  'draft',
  /** Submitted; waiting for the Field Officer (PENDING). Another cannot be filed. */
  'pending_approval',
  /** Sent back by the Field Officer with a remark (REJECTED). */
  'returned',
] as const;
export type MockDrillPortalState = (typeof MOCK_DRILL_PORTAL_STATES)[number];

/** Which drill the owner is filing: the approved setup again, or a new kind. */
export type MockDrillMode = 'same' | 'new';

export interface MockDrillSubmissionView {
  id: string;
  state: MockDrillState;
  mode: MockDrillMode;
  /** The step the owner's box is on while `collecting`. */
  step: MockDrillStep | null;
  dependent: MockDrillDependentView | null;
  generated: MockDrillGenerated | null;
  /** The owner said the drill really happened, on this day (YYYY-MM-DD). */
  confirmedDay: string | null;
  createdAt: string;
  /** When an admin approved it, and who (their name). */
  reviewedAt: string | null;
  reviewedBy: string | null;
  /** Why an admin sent it back to the owner, when they did. */
  sentBackReason: string | null;
  submittedAt: string | null;
  /** What the portal said on our Submit, verbatim. */
  portalReply: string | null;
  failure: string | null;
}

/** The steps of the owner's box, in order. */
export const MOCK_DRILL_STEPS = [
  /** An approved setup exists: same as last time, or a new kind of drill. */
  'choose',
  'scenario',
  'photos',
  /** "Did you do it today or yesterday?" — also the owner's word that it happened. */
  'when',
  /** Everything is in; one button sends it. */
  'review',
] as const;
export type MockDrillStep = (typeof MOCK_DRILL_STEPS)[number];

/**
 * What the owner's box draws, NOW. `screen` is the one thing to show:
 *  - `start`   nothing open and no approved setup: "Start" begins a new one
 *  - `choose`  nothing open, an approved setup exists: same / new
 *  - `collect` an open submission in `collecting` (see `open.step`)
 *  - `waiting` sent; an admin is checking, or a run is filing it
 *  - `done`    submitted to IndianOil (the Field Officer approves next)
 *  - `blocked` the portal already has a report waiting for approval
 *  - `failed`  our submit failed (words in `open.failure`); an admin has been told
 */
export const MOCK_DRILL_SCREENS = ['start', 'choose', 'collect', 'waiting', 'done', 'blocked', 'failed'] as const;
export type MockDrillScreen = (typeof MOCK_DRILL_SCREENS)[number];

export interface MockDrillScenarioOption {
  id: string;
  label: string;
  common: boolean;
}

export interface MockDrillView {
  dealerId: string;
  /** Is the service attached and switched on for this outlet. */
  active: boolean;
  screen: MockDrillScreen;
  /** The dropdown's options. */
  scenarios: MockDrillScenarioOption[];
  /** The submission in progress (any open state), or the newest closed one while `done`. */
  open: MockDrillSubmissionView | null;
  /** The outlet's approved, reusable setup; null until one has been approved. */
  setup: (MockDrillDependentView & { approvedAt: string; approvedBy: string | null }) | null;
  portal: { state: MockDrillPortalState; returnRemark: string | null; checkedAt: string | null };
  lastSubmittedAt: string | null;
}

/** One run of the service, as the admin's pane lists it. */
export interface MockDrillRunSummary {
  id: string;
  action: MockDrillAction;
  trigger: string;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'PENDING' | 'CANCELLED';
  startedAt: string;
  finishedAt: string | null;
  summary: string | null;
  dryRun: boolean;
}

/** The admin's pane: the owner's view plus what needs a person. */
export interface MockDrillAdminView extends MockDrillView {
  /** Submissions waiting for an admin to check (`review`), oldest first. Usually 0 or 1. */
  toReview: MockDrillSubmissionView[];
  /** Newest first, last 12. */
  history: MockDrillSubmissionView[];
  runs: MockDrillRunSummary[];
  /** Config switch: file an approved or reused drill by itself. */
  autoSubmit: boolean;
  /** Config switch: a reused setup also waits for an admin (default false). */
  reviewReused: boolean;
}

/** On a message: draw the Mock Drill box. It reads the outlet's live view; the message carries nothing else. */
export type MessageMockDrill = Record<string, never>;

/** The plugin's run actions (`config.action`). */
export const MOCK_DRILL_ACTIONS = ['check', 'submit'] as const;
export type MockDrillAction = (typeof MOCK_DRILL_ACTIONS)[number];
