/**
 * The AI report check (ADR 0031) — what an admin sees about one report.
 *
 * A model reads each DSR and Credit & DOD report before it may be sent, with
 * lookups into the dealer's own data, and either says what it checked and found
 * right, or names the problems in plain words. A problem keeps the report from
 * going out until a person ticks "I checked this" against it.
 */

/** Which report a check is about. */
export const AI_CHECK_KINDS = ['dsr', 'credit-dod'] as const;
export type AiCheckKind = (typeof AI_CHECK_KINDS)[number];

/** Where the check is in its life. */
export type AiCheckStatus = 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED';

/**
 * What the check concluded.
 *
 * `COULD_NOT_CHECK` is never read as a pass: a report the AI could not read is
 * held exactly like one it found a problem in, until a person says they looked.
 */
export type AiCheckOutcome = 'CLEAR' | 'PROBLEMS' | 'COULD_NOT_CHECK';

/**
 * How sure the AI is that something is wrong.
 *
 * `LIKELY_WRONG` — the figures cannot all be true together; sending would put a
 * wrong number in front of the dealer. `PLEASE_CHECK` — unusual for this outlet,
 * and a person should confirm before it goes.
 */
export type AiProblemSeverity = 'LIKELY_WRONG' | 'PLEASE_CHECK';

/** Who raised a problem: the AI, or one of the fixed arithmetic checks. */
export type AiProblemSource = 'ai' | 'rule';

/** What part of the report a problem is about, when it is about one part. */
export interface AiProblemScope {
  product?: string;
  date?: string;
  tankNo?: number;
  nozzleNo?: number;
}

/** One thing the AI wants a person to look at, written for someone who is not technical. */
export interface AiProblem {
  /** Stable within one check; acknowledgements point at it. */
  id: string;
  severity: AiProblemSeverity;
  source: AiProblemSource;
  /** A short headline, e.g. "Diesel stock is 1,240 L short with no reason". */
  title: string;
  /** What the figures show, with the real numbers. */
  whatWeSaw: string;
  /** What goes wrong for the dealer if this is real. */
  whyItMatters: string;
  /** The one thing to do about it. */
  whatToDo: string;
  scope: AiProblemScope;
  /**
   * True when this explains a fault the DSR's fixed correctness checks are
   * already holding the report for. Released there (with a reason), not ticked
   * here — one fault, one place to release it.
   */
  heldByRuleCheck?: boolean;
}

/** One thing the AI checked and found right — the reason to trust a clear report. */
export interface AiCheckedItem {
  title: string;
  detail: string;
}

/** A problem the AI raised, then dropped on a second look, and why. Shown, never holding. */
export interface AiDismissedProblem {
  title: string;
  whatWeSaw: string;
  reason: string;
}

/** One lookup the AI made while checking — the trail behind the verdict. */
export interface AiLookup {
  /** Plain words, e.g. "Daily sheet for Diesel, 28 Oct – 3 Nov". */
  label: string;
  ok: boolean;
}

export interface AiCheckResult {
  outcome: AiCheckOutcome;
  /** One plain sentence. */
  summary: string;
  checked: AiCheckedItem[];
  problems: AiProblem[];
  dismissed: AiDismissedProblem[];
  /** Why the AI could not finish, in plain words. Set only for `COULD_NOT_CHECK`. */
  failure?: string;
  lookups: AiLookup[];
  model: string | null;
  turns: number;
  durationMs: number | null;
}

/** A person's "I checked this" against one problem. */
export interface AiAcknowledgement {
  /** A problem id, or `unchecked` for a report the AI could not check. */
  problemId: string;
  by: string;
  byName: string | null;
  at: string;
  note: string | null;
  /**
   * "Was the AI right to raise this?" — true: worth raising; false: a false
   * alarm; null: not answered. The labelled data a cheaper model is measured
   * against after the first two weeks.
   */
  aiWasRight: boolean | null;
}

/** "The AI missed something": a fault a person found that the check did not. */
export interface AiMissedReport {
  by: string;
  byName: string | null;
  at: string;
  note: string;
}

/** The id an acknowledgement uses when the AI could not check the report at all. */
export const AI_UNCHECKED_ID = 'unchecked';

/**
 * Whether this report may go to the dealer now, as far as the AI check is
 * concerned — the one field every screen reads.
 *
 *  - `OFF`           the AI check is switched off on this server.
 *  - `CHECKING`      queued or running; nothing may be sent yet.
 *  - `CLEAR`         the AI found nothing wrong. May be sent.
 *  - `NEEDS_REVIEW`  problems a person has not yet ticked. Not sent.
 *  - `REVIEWED`      every problem ticked by a person. May be sent.
 *  - `COULD_NOT_CHECK` the AI could not finish. Not sent until a person ticks it.
 *  - `NOT_CHECKED`   no check exists for these figures (a report from before the
 *                    AI check, or figures changed since). One is started; not sent yet.
 */
export type AiSendState =
  | 'OFF'
  | 'CHECKING'
  | 'CLEAR'
  | 'NEEDS_REVIEW'
  | 'REVIEWED'
  | 'COULD_NOT_CHECK'
  | 'NOT_CHECKED';

/** The send states in which a report may go to the dealer. */
export const AI_SENDABLE_STATES: ReadonlySet<AiSendState> = new Set<AiSendState>([
  'OFF',
  'CLEAR',
  'REVIEWED',
]);

export interface AiCheckView {
  kind: AiCheckKind;
  reportId: string;
  state: AiSendState;
  /** Problems still waiting for a person's tick. Empty unless `NEEDS_REVIEW`/`COULD_NOT_CHECK`. */
  waitingOn: string[];
  checkId: string | null;
  status: AiCheckStatus | null;
  queuedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  result: AiCheckResult | null;
  acknowledgements: AiAcknowledgement[];
  missed: AiMissedReport[];
}

/** One report the AI check is holding, for the cross-dealer list. */
export interface AiHoldItem {
  kind: AiCheckKind;
  reportId: string;
  dealerId: string;
  outletCode: string | null;
  /** The day the report describes, `YYYY-MM-DD`. */
  date: string | null;
  state: AiSendState;
  /** The first problem's headline, or why it could not be checked. */
  headline: string;
  problems: number;
  finishedAt: string | null;
}
