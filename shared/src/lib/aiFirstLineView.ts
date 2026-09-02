/**
 * The words and the decidable rules behind the admin's view of the AI first
 * line — the inbox chip, the turn log's vocabulary, and the one rule that says
 * whether the machine composed something a person can still use.
 *
 * WHY ADMIN VOCABULARY LIVES IN `shared`
 * --------------------------------------
 * `mdg-admin` has no `test` script and not one test file — checked, not assumed
 * — and `shared` has no runner of its own. The standing pattern in this repo,
 * written out at length in `mdg-client/src/lib/documentsFormat.test.ts`, is that
 * anything decidable goes into `shared` where the dealer app's vitest can reach
 * it, because nothing under `mdg-client/src` imports across an app boundary and
 * inventing that precedent would put a file outside `mdg-client`'s tsconfig into
 * its test graph. So this module is here for the same reason
 * `types/documentAsk.ts` holds the document estate's mark and rank.
 *
 * None of it reaches a dealer. Every export is a plain const or a pure function
 * in an ESM module with no side effects, so the dealer bundle tree-shakes the
 * lot; the only app that imports it is the admin.
 *
 * WHY THE LABEL MAPS ARE EXHAUSTIVE `Record`s
 * -------------------------------------------
 * Every one is `Record<TheWholeUnion, string>`, so adding a twenty-second intent
 * or a sixteenth handoff reason to `types/aiFirstLine.ts` stops this file
 * compiling until somebody writes the English for it. The alternative — a
 * partial map with a fallback — is how a screen ends up printing
 * `bad_router_output` at a person who has never read this codebase.
 */

import type {
  AiFirstLineIntent,
  AiHandoffReason,
  AiTurn,
  AiTurnOutcome,
  AiTurnVerdict,
  ConversationAiState,
} from '../types/aiFirstLine';

/* ───────────────────────────── The inbox chip ───────────────────────────── */

/**
 * Which chip an inbox row wears, when the machine has been near the thread.
 *
 * Three cases and no more, because a fourth would be a state the SLA rule does
 * not have an answer for. `questioned` is the dispute window — the dealer wrote
 * again, soon, on a thread the machine had just answered — and it is separated
 * from the ordinary handoff on purpose: an answer that was wrong enough to
 * provoke a second message is the single most useful thing this screen can point
 * at, and it must not be filed under the same amber as "the dealer sent a photo".
 */
export type AiInboxChip = 'replied' | 'passed_on' | 'questioned';

/**
 * The tone words are the admin app's own `Intent` union
 * (`mdg-admin/src/lib/statusIntent.ts`), spelled out here rather than imported
 * because `shared` must not depend on an app. Keeping the exact spellings means
 * a tone drops into `<Badge intent={…}>` with no translation table in between,
 * and a translation table is the thing that drifts.
 */
export type AiTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

/** The three an inbox chip may take. Never green: see {@link aiInboxChip}. */
export type AiChipTone = Extract<AiTone, 'neutral' | 'warning' | 'danger'>;

export interface AiInboxChipView {
  chip: AiInboxChip;
  /** The words on the pill. The caller pairs them with a SHAPE — never colour alone. */
  label: string;
  tone: AiChipTone;
  /**
   * What the chip is telling the admin, for the row's `title`/`aria-label`.
   * Three words on a pill cannot carry "the SLA clock is still running".
   */
  hint: string;
}

/**
 * The chip for one thread, or `null` for the overwhelming majority of threads
 * the machine has never touched.
 *
 * `IDLE` deliberately yields nothing. It is the state a thread sits in while a
 * turn is in flight and after an admin has taken over, and a chip there would
 * claim the machine said something when it has not.
 *
 * NOTE WHAT IS NOT HERE: the row's preview text. The backend refuses to write
 * `lastMessagePreview` from an AI message, and the UI must not put one back —
 * sixty threads all previewing the same warm handoff line turns triage by
 * scanning into triage by opening.
 */
export function aiInboxChip(
  ai: ConversationAiState | undefined | null,
): AiInboxChipView | null {
  if (!ai) return null;
  if (ai.state === 'ANSWERED') {
    return {
      chip: 'replied',
      label: 'AI replied',
      // Grey, and grey is the point: an answered thread has had its SLA colour
      // cleared but is still unread and still in the queue. It is not an alarm
      // and it is not a resolution.
      tone: 'neutral',
      hint: 'The first line answered. The SLA clock is stopped; the thread is still unread and still in Unassigned.',
    };
  }
  if (ai.state === 'HANDED_OFF') {
    if (ai.lastReason === 'follow_up') {
      return {
        chip: 'questioned',
        label: 'AI answer questioned',
        tone: 'danger',
        hint: 'The dealer wrote again straight after the first line answered — the strongest sign the answer missed. The SLA clock was restarted from that message.',
      };
    }
    return {
      chip: 'passed_on',
      label: 'AI passed on',
      tone: 'warning',
      hint: 'The first line stood down and told the dealer a person is coming. The SLA clock never stopped.',
    };
  }
  return null;
}

/**
 * Is this thread in the ⚡ AI lens?
 *
 * The lens is applied by the server (`GET /conversations?status=ai`), so this is
 * not what filters the list. It exists so the tab's own empty state and any
 * client-side re-filter after a socket update agree with the query that fetched
 * the rows, rather than each deciding separately what "the machine touched this"
 * means.
 */
export function aiTouchedThread(ai: ConversationAiState | undefined | null): boolean {
  return aiInboxChip(ai) !== null;
}

/* ─────────────────────────── The turn log's words ───────────────────────── */

export const AI_OUTCOME_LABEL: Record<AiTurnOutcome, string> = {
  ANSWERED: 'Answered',
  HANDED_OFF: 'Passed to a person',
  // "Stood down" and "Overtaken" are kept apart because the turn log exists to
  // tell "we chose not to" from "we lost the race". Calling both of them
  // "Skipped" would throw away the only distinction on the row.
  SUPPRESSED: 'Stood down',
  SUPERSEDED: 'Overtaken',
  SHADOW: 'Rehearsal',
};

/**
 * Why it stood down, in the words an admin reading this at nine at night can act
 * on. Every one names an event rather than a score — there is no confidence
 * number anywhere in this stack, deliberately, because `generateContent` returns
 * no logprobs and any number printed here would be invented.
 */
export const AI_HANDOFF_REASON_LABEL: Record<AiHandoffReason, string> = {
  attachment: 'The dealer sent a photo, voice note or file',
  group_thread: "A manager's group thread — several people are talking",
  asked_for_human: 'They asked for a person',
  guard_in: 'The input guard stopped it before the model saw it',
  quota: "This dealer's turns for the day are used up",
  budget: "The first line's own daily budget is spent",
  repeat: 'It had already answered this thread too many times running',
  follow_up: 'The dealer wrote again straight after the answer',
  no_intent: 'It could not place the question',
  tool_refused: 'The lookup ran and had nothing to give',
  tool_error: 'The lookup failed',
  guard_out: 'The finished answer failed its own check and was thrown away',
  bad_router_output: 'The model returned something that is not a valid plan',
  model_error: 'The model call failed',
  vendor_busy: 'The vendor was busy or too slow',
};

/**
 * The outcome badge's colour, on every surface that draws one — the strip above
 * the composer and the turn log both.
 *
 * ONE MAP, because it was briefly two: the strip painted `ANSWERED` grey while
 * the review page painted it green, which is the same fact reported in two
 * moods on two screens an admin moves between in one click. `SHADOW` is `info`
 * and nothing else, so a rehearsal is never mistakable for something a dealer
 * read; `HANDED_OFF` is amber rather than red, because a handoff is the machine
 * working correctly and painting it as a failure teaches the team to read the
 * screen's worst colour as normal.
 *
 * Note this is NOT the inbox chip's tone. The chip answers "what does this row
 * need from me?" and its `ANSWERED` is grey — an answered thread is still unread
 * and still in the queue, so it is neither an alarm nor a result to celebrate.
 * The badge answers "what did the machine do?", where answering IS the success.
 * Two questions, two scales, deliberately.
 */
export const AI_OUTCOME_TONE: Record<AiTurnOutcome, AiTone> = {
  ANSWERED: 'success',
  HANDED_OFF: 'warning',
  SUPPRESSED: 'neutral',
  SUPERSEDED: 'neutral',
  SHADOW: 'info',
};

/**
 * Which handoff reasons are OUR problem rather than the world's.
 *
 * A dealer sending a photo is not a fault; a lookup throwing is. Painting the
 * second group red is what stops a morning's worth of `tool_error` hiding inside
 * a morning's worth of attachments.
 */
const FAULT_REASONS: ReadonlySet<AiHandoffReason> = new Set<AiHandoffReason>([
  'tool_error',
  'model_error',
  'bad_router_output',
  'guard_out',
  'vendor_busy',
]);

export function aiReasonTone(reason: AiHandoffReason | undefined | null): AiTone {
  if (!reason) return 'neutral';
  if (FAULT_REASONS.has(reason)) return 'danger';
  // The dispute window. Not a fault in the machinery, but the strongest evidence
  // available that an answer missed, so it does not get to look routine.
  if (reason === 'follow_up') return 'danger';
  return 'neutral';
}

/** What the dealer was asking about, in a column heading's worth of words. */
export const AI_INTENT_LABEL: Record<AiFirstLineIntent, string> = {
  greeting: 'Greeting',
  dsr_status: "Today's DSR",
  dsr_for_date: 'DSR for a day',
  dsr_reshare: 'Re-send a DSR',
  density_today: "Today's density",
  density_missing: 'Missing density',
  density_backdate: 'Density for a day',
  density_latest: 'Latest density',
  kavach_asks: 'Kavach — what is pending',
  kavach_last_verified: 'Kavach — last verified',
  staff_total: 'Staff points — team',
  staff_person: 'Staff points — one person',
  staff_leave: 'Staff leave',
  staff_last_batch: 'Staff — last submission',
  services_list: 'Which services are on',
  service_log: 'Did a service run',
  records_list: 'Documents on file',
  record_send: 'Re-send a document',
  docs_pending: 'Papers still wanted',
  talk_to_human: 'Asked for a person',
  other: 'Could not place it',
};

export const AI_VERDICT_LABEL: Record<AiTurnVerdict, string> = {
  RIGHT: 'Looks right',
  WRONG: 'Wrong',
  SHOULD_HAVE_HANDED_OFF: 'Should have handed off',
};

/* ─────────────────────── The withheld sentence ──────────────────────────── */

/**
 * The sentence the machine composed and never sent, or `null`.
 *
 * This is what the "Put in composer" button offers, and getting the rule wrong
 * in either direction is expensive, so it is spelled out rather than guessed at
 * from the outcome alone:
 *
 *  - AN `ANSWERED` TURN IS NOT WITHHELD. Its answer is already in the thread; a
 *    button offering to paste it again is an invitation to say the same thing
 *    twice.
 *  - A TURN WITH A `reason` IS NOT WITHHELD, whatever its outcome. On the
 *    handoff path `run.ts` overwrites `turn.answer` with the WARM HANDOFF LINE
 *    it just posted, so the text on those rows is "somebody will be with you
 *    shortly" — the dealer has already read it and pasting it again is noise.
 *  - AN ANSWER THAT FAILED VERIFICATION IS GONE, and that is deliberate on the
 *    backend's side: `finishAnswer` clears `turn.answer` before it hands off on
 *    `guard_out`. A body that failed its own check must never be offered to a
 *    person to paste, because the failure is evidence something upstream is
 *    wrong, not a typo to wave through.
 *
 * What is left is exactly the two cases where a real, verified answer exists and
 * nobody has read it: a `SHADOW` rehearsal, and a `SUPERSEDED` turn that lost the
 * race to a human reply. Both are answers an admin would otherwise have to
 * compose from scratch, which is the whole point of showing them.
 */
export function aiWithheldAnswer(
  turn: Pick<AiTurn, 'answer' | 'outcome' | 'reason'> | undefined | null,
): string | null {
  if (!turn) return null;
  if (turn.reason) return null;
  if (turn.outcome !== 'SHADOW' && turn.outcome !== 'SUPERSEDED') return null;
  const body = turn.answer?.trim();
  return body ? body : null;
}

/* ──────────────────────────────── Clocks ────────────────────────────────── */

/**
 * How long ago, in the two characters an inbox row has space for.
 *
 * `nowMs` is a parameter and never `Date.now()` inside, for the reason every
 * other clock in this repo takes one: a function that reads the wall clock
 * cannot be tested, and the admin's inbox re-renders this on a one-minute
 * interval from a `now` it already holds.
 *
 * A future instant reads `'now'` rather than a negative age. Clock skew between
 * a phone and the server is real and small, and "-1m" on a row is a bug report
 * waiting to happen about a system that is working fine.
 */
export function aiTurnAge(iso: string | undefined | null, nowMs: number): string {
  if (!iso) return '';
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const mins = Math.round((nowMs - then) / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(then).toLocaleDateString(undefined, {
    month: 'short',
    day: '2-digit',
  });
}

/**
 * What one turn cost, from its own purse.
 *
 * ZERO PRINTS AS "free", not as "₹0.00", because zero is a real and meaningful
 * value here rather than a missing one: a `follow_up` handoff — the dispute
 * window — calls no model at all, and a reviewer scanning the log should be able
 * to see at a glance that the most valuable signal in the system is also the
 * cheapest. `₹0.00` reads like a rounding artefact and hides that.
 *
 * Paise, not rupees, is what the turn stores; two decimals is therefore exact
 * and not a truncation.
 */
export function aiCostLabel(estPaise: number | undefined | null): string {
  if (!estPaise || estPaise <= 0) return 'free';
  return `₹${(estPaise / 100).toFixed(2)}`;
}
