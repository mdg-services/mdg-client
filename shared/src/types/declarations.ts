/**
 * Dealer Declarations (ADR 0037).
 *
 * IndianOil's SDMS portal has a sidebar group "Dealer Declarations" with four
 * pages the outlet must keep up to date. MDG's service reads them and files the
 * ones it may, on the outlet's own SDMS login:
 *
 *  - `safety`   Safety Declaration — a tick-box list, EVERY DAY. MDG ticks every
 *               box, fills the text boxes and submits.
 *  - `washroom` Washroom Cleanliness — EVERY 7 DAYS, with two photos (one of the
 *               toilet from outside, one from inside; each at most 500 KB, both
 *               compulsory). MDG asks the owner for the photos in the chat, then
 *               files.
 *  - `standard` MDG & Customer Service Standard — once in 7–8 years: two Yes
 *               answers and two ticks. MDG fills it only if it is not filled yet.
 *  - `branded`  Branded Fuels — once per outlet. MDG NEVER fills this one. If it
 *               is not filled on the portal it is a pending task on the admin's
 *               side (an alert and a card in the outlet's pane); an admin fills
 *               it by hand and presses "I filled it" (or "Check again").
 *
 * WHAT IS KNOWN ABOUT THE PAGES: the Safety, Washroom and MDG&CSS pages were
 * seen as screenshots only (ADR 0037 §1); Branded Fuels was not seen at all. So
 * the robot reads each page's state itself and REFUSES rather than guesses: a
 * page it cannot read is `unknown`, and `unknown` is never treated as "filled".
 * A first read-only look at the live pages is the next step before the first
 * real filing (ADR 0037 §9).
 */

export const DECLARATIONS_SERVICE_ID = 'dealer-declarations';

export const DECLARATION_KINDS = ['safety', 'washroom', 'standard', 'branded'] as const;
export type DeclarationKind = (typeof DECLARATION_KINDS)[number];

/** The kinds the robot may file. `branded` is read only — a test pins this. */
export const DECLARATION_FILED_KINDS = ['safety', 'washroom', 'standard'] as const;
export type DeclarationFiledKind = (typeof DECLARATION_FILED_KINDS)[number];

/** How often each one comes round. */
export type DeclarationRule = 'daily' | 'weekly' | 'once' | 'admin';

export interface DeclarationKindInfo {
  kind: DeclarationKind;
  /** The sidebar link's text on the portal, verbatim (the robot finds the page by it). */
  portalName: string;
  titleEn: string;
  titleHi: string;
  rule: DeclarationRule;
}

export const DECLARATION_INFO: Record<DeclarationKind, DeclarationKindInfo> = {
  safety: {
    kind: 'safety',
    portalName: 'Safety Declaration',
    titleEn: 'Safety declaration',
    titleHi: 'सेफ्टी डिक्लेरेशन',
    rule: 'daily',
  },
  washroom: {
    kind: 'washroom',
    portalName: 'Washroom Cleanliness',
    titleEn: 'Washroom cleanliness',
    titleHi: 'वॉशरूम की सफ़ाई',
    rule: 'weekly',
  },
  standard: {
    kind: 'standard',
    portalName: 'MDG&Cust Service Std',
    titleEn: 'MDG & Customer Service Standard',
    titleHi: 'MDG और कस्टमर सर्विस स्टैंडर्ड',
    rule: 'once',
  },
  branded: {
    kind: 'branded',
    portalName: 'Branded Fuels',
    titleEn: 'Branded fuels',
    titleHi: 'ब्रांडेड फ्यूल',
    rule: 'admin',
  },
};

/* ───────────────────────────── the rules, as numbers ───────────────────────────── */

/** The washroom declaration comes round every this many days (the owner's rule: 7). */
export const WASHROOM_EVERY_DAYS_DEFAULT = 7;
export const WASHROOM_EVERY_DAYS_MIN = 1;
export const WASHROOM_EVERY_DAYS_MAX = 31;

/** Two photos, in this order: the portal's table has "Outside toilet photo" then "Inside toilet photo". */
export const WASHROOM_PHOTO_SLOTS = ['outside', 'inside'] as const;
export type WashroomPhotoSlot = (typeof WASHROOM_PHOTO_SLOTS)[number];
export const WASHROOM_PHOTO_COUNT = WASHROOM_PHOTO_SLOTS.length;

/**
 * The portal: "Photo size should not be more than 500 KB. All the photos are mandatory."
 * Counted as 500,000 bytes, the stricter reading of "KB", so a file the portal's own
 * check might refuse never leaves MDG.
 */
export const WASHROOM_PHOTO_MAX_BYTES = 500 * 1000;
/** What the owner's phone squeezes each photo down to before sending, so the cap is never close. */
export const WASHROOM_PHOTO_TARGET_BYTES = 400 * 1024;

/** The page's "Toilet No." box starts at 1; an outlet files its one toilet as 1. */
export const WASHROOM_TOILET_NO = '1';

/** What goes in the portal's "feedback" box when nobody has set other words: the usual "not applicable". */
export const DECLARATION_FEEDBACK_DEFAULT = 'NA';

/** A box left unanswered this long is posted again (at most {@link WASHROOM_MAX_REASKS} times). */
export const WASHROOM_REASK_AFTER_HOURS = 24;
export const WASHROOM_MAX_REASKS = 3;
/** Photos still not sent after this many days: an admin is told (an alert). */
export const WASHROOM_ALERT_AFTER_DAYS = 2;
/** A daily safety declaration missing for this many IST days: an admin is told. */
export const SAFETY_ALERT_AFTER_DAYS = 2;

/* ───────────────────────────── what the portal says ───────────────────────────── */

/**
 * Where the portal's own page says a declaration stands:
 *  - `open`    a form waiting to be filled in
 *  - `filled`  the page shows it is done (or locked)
 *  - `unknown` the robot could not tell. NEVER read as `filled`.
 */
export const DECLARATION_PORTAL_STATES = ['open', 'filled', 'unknown'] as const;
export type DeclarationPortalState = (typeof DECLARATION_PORTAL_STATES)[number];

/**
 * How one attempt to file ended.
 *  - `submitted`      the portal said it has it
 *  - `filled`         a test fill: filled, read back right, Submit NOT pressed
 *  - `already_done`   the page (or the portal's answer) says it was already done
 *  - `refused`        the portal answered Submit with something else (its words kept)
 *  - `no_reply`       Submit was pressed and no answer came; the next read settles it
 *  - `fill_mismatch`  a box read back wrong, so Submit was never pressed
 *  - `not_open`       the page was not a form the robot could fill (state unknown)
 *  - `photos_missing` the washroom's photos were not available
 *  - `skipped`        not attempted (switch off, not due)
 */
export const DECLARATION_OUTCOMES = [
  'submitted',
  'filled',
  'already_done',
  'refused',
  'no_reply',
  'fill_mismatch',
  'not_open',
  'photos_missing',
  'skipped',
] as const;
export type DeclarationOutcome = (typeof DECLARATION_OUTCOMES)[number];

/** True for the outcomes that mean the portal now has the declaration. */
export function declarationOutcomeIsDone(outcome: DeclarationOutcome | null | undefined): boolean {
  return outcome === 'submitted' || outcome === 'already_done';
}

/* ───────────────────────────── the washroom cycle ───────────────────────────── */

/**
 * Where this week's washroom declaration stands at MDG.
 *  - `idle`        nothing in progress (not due yet, or just filed)
 *  - `collecting`  due: the owner has been asked for the two photos
 *  - `ready`       both photos are in and the owner said they are fresh; a run will file
 *  - `filing`      a run is filling the portal now
 *  - `failed`      the filing did not go through; `failure` says why in plain words
 */
export const WASHROOM_STATES = ['idle', 'collecting', 'ready', 'filing', 'failed'] as const;
export type WashroomState = (typeof WASHROOM_STATES)[number];

export interface WashroomPhotoRef {
  slot: WashroomPhotoSlot;
  key: string;
  filename: string;
  size: number;
  mime: string;
  at: string;
}
export interface WashroomPhotoView extends WashroomPhotoRef {
  /** Short-lived link to open it. */
  url: string | null;
}

export interface WashroomCycleView {
  state: WashroomState;
  /** The box was first posted for this cycle. */
  askedAt: string | null;
  /** How many reminder posts have gone out since. */
  remindersSent: number;
  /** The photos sent so far (0, 1 or 2), in slot order. */
  photos: WashroomPhotoView[];
  /** The owner pressed Send (YYYY-MM-DD IST day they said the photos were taken). */
  confirmedDay: string | null;
  sentAt: string | null;
  failure: string | null;
}

/** What the owner's box draws, NOW. */
export const DECLARATION_SCREENS = [
  /** Nothing is wanted from the owner; the box says what was last filed and when the next is due. */
  'idle',
  /** The two photos are wanted. */
  'collect',
  /** Sent; a run is filing it. */
  'waiting',
  /** Filed on IndianOil's portal. */
  'done',
  /** Our filing failed; an admin has been told. */
  'failed',
] as const;
export type DeclarationScreen = (typeof DECLARATION_SCREENS)[number];

export interface DeclarationsView {
  dealerId: string;
  /** Is the service attached and switched on for this outlet. */
  active: boolean;
  screen: DeclarationScreen;
  washroom: WashroomCycleView;
  /** IST day the washroom was last filed, YYYY-MM-DD. */
  lastWashroomFiledDay: string | null;
  /** IST day the next washroom declaration is due. */
  nextWashroomDueDay: string | null;
  /** Each photo's size limit, bytes. */
  maxPhotoBytes: number;
}

/* ───────────────────────────── the admin's pane ───────────────────────────── */

export interface DeclarationStatusView {
  kind: DeclarationKind;
  rule: DeclarationRule;
  portalState: DeclarationPortalState | null;
  checkedAt: string | null;
  lastFiledAt: string | null;
  /** IST day, YYYY-MM-DD. */
  lastFiledDay: string | null;
  lastAttemptAt: string | null;
  lastOutcome: DeclarationOutcome | null;
  /** The portal's own answer to our Submit, verbatim. */
  lastReply: string | null;
  /** Plain words: why the last attempt did not go through. */
  lastFailure: string | null;
  /** IST day it is next due, or null (done for good, or the admin's own). */
  nextDueDay: string | null;
  due: boolean;
  /** Does the robot file it by itself (always false for `branded`). */
  auto: boolean;
  /** Plain words: what a person has to do, or null when nothing. */
  todo: string | null;
  /** `branded` only: an admin said they filled it on the portal. */
  markedDoneBy: string | null;
  markedDoneAt: string | null;
  /** Plain words: why the last read of this page failed (the page would not open), or null. */
  checkFailure: string | null;
  checkFailedAt: string | null;
  /** When the robot last pressed Submit and has not been told how it went, or null. */
  pressedAt: string | null;
  /**
   * Submit was pressed, no answer came, and it has been long enough that no live run
   * can still be waiting for one: only an admin looking at the portal, or the next
   * read, can say whether it went through. Drives the "I checked: it went through /
   * it did not" buttons.
   */
  maybeFiled: boolean;
}

export interface DeclarationFilingView {
  id: string;
  kind: DeclarationKind;
  /** IST day it was for, YYYY-MM-DD. */
  day: string;
  outcome: DeclarationOutcome;
  /** One plain sentence. */
  summary: string;
  portalReply: string | null;
  dryRun: boolean;
  at: string;
  runId: string | null;
  /** Washroom: the month the page was filed under. */
  month: string | null;
  /** Washroom: the two photos filed. */
  photos: WashroomPhotoView[];
}

export interface DeclarationRunSummary {
  id: string;
  action: DeclarationAction;
  kind: DeclarationKind | null;
  trigger: string;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'PENDING' | 'CANCELLED';
  startedAt: string;
  finishedAt: string | null;
  summary: string | null;
  dryRun: boolean;
}

/** The attachment's switches, as the pane shows and edits them. */
export interface DeclarationsConfigView {
  safetyDaily: boolean;
  washroomEveryDays: number;
  washroomAuto: boolean;
  standardAuto: boolean;
  feedbackText: string;
  /** An override for "Place of declaration"; null = the outlet's city (or site, or the portal's own). */
  placeOfDeclaration: string | null;
}

export interface DeclarationsAdminView extends DeclarationsView {
  /** One per kind, in {@link DECLARATION_KINDS} order. */
  statuses: DeclarationStatusView[];
  /** Newest first, last 20. */
  history: DeclarationFilingView[];
  runs: DeclarationRunSummary[];
  config: DeclarationsConfigView;
}

/** On a message: draw the Declarations box. It reads the outlet's live view; the message carries nothing else. */
export type MessageDeclarations = Record<string, never>;

/**
 * The plugin's run actions (`config.action`):
 *  - `sweep`  (the default; the daily timer and "Run now"): read what needs reading,
 *             file what is due and allowed, ask the owner for what is missing
 *  - `check`  read the four pages' state only; files nothing
 *  - `file`   file ONE declaration now (`config.kind`); `dryRun` fills, reads back, stops
 */
export const DECLARATION_ACTIONS = ['sweep', 'check', 'file'] as const;
export type DeclarationAction = (typeof DECLARATION_ACTIONS)[number];
