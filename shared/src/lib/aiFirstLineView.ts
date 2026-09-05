/**
 * The words and the decidable rules behind the admin's view of the AI first
 * line: the inbox chip, the turn log's vocabulary, how each reply was produced,
 * the sentence the fence refused and why, what the guard saw on a thread, and
 * the one number that says whether the writer is earning its keep.
 *
 * EVERY RULE HERE IS ABOUT SUPERVISING A MACHINE THAT NOW WRITES ITS OWN
 * SENTENCES. Under v1 the answer to "where did that sentence come from" was "a
 * person wrote it, months ago", so a screen could say what the machine DID and
 * be finished. It now has to say how each reply was MADE, show the ones we
 * refused to send with the rules that refused them, and name which of up to five
 * lookups a turn ran — none of which is judgement, all of which is decidable,
 * and all of which therefore belongs in one tested module rather than in three
 * screens that each work it out again.
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
 *
 * AND WHY TWO OF THEM ARE NOT
 * ---------------------------
 * {@link AI_FENCE_RULE_LABEL} and {@link AI_TOOL_LABEL} mirror unions that live
 * in the backend — `fence.ts`'s `FenceRule` and `tools.ts`'s `TOOL_IDS` — which
 * are pure, backend-local, and have no business being imported by a browser.
 * `AiTurn.fenceFailure` and `AiTurn.toolIds` therefore cross the wire as
 * `string[]`, and their resolvers fall back on an unknown name rather than
 * failing. That is not the exhaustive rule being relaxed: the admin and the
 * backend deploy separately, so a screen one deploy behind a new eighteenth
 * fence rule must print "Unsourced quantity" and not a blank pill — and a blank
 * pill on the guard's own evidence reads as the guard having recorded nothing.
 */

import type {
  AiFirstLineIntent,
  AiFirstLineLang,
  AiHandoffReason,
  AiPlan,
  AiTurn,
  AiTurnOutcome,
  AiTurnVerdict,
  AiWriterDisposition,
  AiWriterSkip,
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
export function aiInboxChip(ai: ConversationAiState | undefined | null): AiInboxChipView | null {
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
    // `follow_up` is v1's deprecated dispute window and is never emitted again,
    // but a month of production rows carry it, so it keeps its chip. The three
    // that replaced it are all "the dealer told us, or showed us, that the last
    // answer missed", which is the same thing this chip has always said.
    if (
      ai.lastReason === 'follow_up' ||
      ai.lastReason === 'dissatisfied' ||
      ai.lastReason === 'repeat_miss' ||
      ai.lastReason === 'same_answer'
    ) {
      return {
        chip: 'questioned',
        label: 'AI answer questioned',
        tone: 'danger',
        hint: 'The dealer said the answer missed, or the machine had nothing new to say. The SLA clock was restarted from that message.',
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
  // v1 only, and never emitted again. Kept because a month of rows carry it and
  // this map is exhaustive — deleting the key would blank those rows.
  follow_up: 'The dealer wrote again straight after the answer (retired rule)',
  dissatisfied: 'The dealer said the answer was wrong',
  repeat_miss: 'It had failed to find a fact twice running',
  same_answer: 'It was about to repeat a sentence it had just sent',
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
  // Not faults in the machinery, but the strongest evidence available that an
  // answer missed, so none of them gets to look routine. `follow_up` is v1's
  // retired rule and keeps its colour for the rows that still carry it.
  if (
    reason === 'follow_up' ||
    reason === 'dissatisfied' ||
    reason === 'repeat_miss' ||
    reason === 'same_answer'
  ) {
    return 'danger';
  }
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
  water_ingress_status: 'Water ingress — where it stands',
  services_list: 'Which services are on',
  service_log: 'Did a service run',
  records_list: 'Documents on file',
  record_send: 'Re-send a document',
  docs_pending: 'Papers still wanted',
  talk_to_human: 'Asked for a person',
  todo: 'What is outstanding',
  thanks: 'Thanks',
  smalltalk: 'Small talk',
  other: 'Could not place it',
};

/**
 * The words ON THE BUTTON, and they carry the narrow meaning rather than the
 * enum's name — a verdict's semantics live at the point of the click, because
 * that is where somebody decides which one to press at nine at night.
 *
 * `WRONG` and `POORLY_WORDED` are the pair that matters and the difference has
 * to be unmissable: only the first one trips the breaker that switches the whole
 * first line off. A reviewer who reaches for `WRONG` because the Hindi was stiff
 * has just spent one of three lives on a sentence that was entirely true.
 */
export const AI_VERDICT_LABEL: Record<AiTurnVerdict, string> = {
  RIGHT: 'Looks right',
  WRONG: 'Wrong — it stated something untrue',
  POORLY_WORDED: 'Badly written — the facts were right',
  SHOULD_HAVE_HANDED_OFF: 'Should have handed off',
};

/**
 * How the reply was produced, for the turn log's new column.
 *
 * `'fallback'` is the row a reviewer opens: the writer composed something and we
 * declined to send it. What the dealer read was the hand-written template for
 * the same fact, and what the writer actually wrote is on `AiTurn.writerProse`
 * beside the fence rules that refused it.
 */
export const AI_WRITER_LABEL: Record<AiWriterDisposition, string> = {
  prose: 'Written',
  fallback: 'Template (prose refused)',
  skipped: 'Template (writer skipped)',
  off: 'Template (writer off)',
};

/**
 * Why the writer was never called, in the words the admin screen prints.
 *
 * A NAMED REASON RATHER THAN AN ABSENT ONE, and that is the whole point of the
 * field existing: "the writer keeps timing out" and "the writer is working
 * perfectly" are indistinguishable from the dealer's side, because both produce
 * a correct template and nobody complains. The three `'off'` reasons are kept
 * apart for the same reason — a PERSON pressed the middle notch, we RAN OUT OF
 * MONEY, or THE MACHINE TURNED ITS OWN PROSE OFF are a decision, a forecast that
 * was wrong, and a fault, and they are not the same conversation.
 */
export const AI_WRITER_SKIP_LABEL: Record<AiWriterSkip, string> = {
  no_facts: 'Nothing to phrase — a fixed sentence is the whole answer',
  deadline: 'Too little of the turn deadline was left',
  envelope_caps: 'Too many facts, or too many figures, to hand over safely',
  reshare: 'The re-send path posts its own message',
  handoff: 'The turn was standing down; there was no fact to phrase',
  switch_off: 'The writer is switched off',
  writer_budget: "The day's writer budget is spent — templates take over",
  fallback_breaker: 'The writer had been failing its own checks too often',
};

/** The two languages, for a count split by language. */
export const AI_LANG_LABEL: Record<AiFirstLineLang, string> = {
  hi: 'Hindi',
  en: 'English',
};

/* ──────────────────────── How the reply was produced ────────────────────── */

/**
 * The four ways a turn can end, from the dealer's side of the glass.
 *
 * `'silent'` is a turn that produced nothing the dealer read — stood down before
 * it started, or overtaken by a person mid-flight.
 */
export type AiProductionKind = 'written' | 'template' | 'handoff' | 'silent';

export interface AiProductionView {
  kind: AiProductionKind;
  /** The words on the mark. Taken from {@link AI_WRITER_LABEL} where one fits. */
  label: string;
  tone: AiTone;
  /** The sentence behind it, for a `title` — a four-word pill cannot carry this. */
  hint: string;
  /**
   * The writer composed a sentence and we declined to send it.
   *
   * THE ROW A REVIEWER OPENS. What the dealer read was the hand-written template
   * for the same fact; what the writer actually wrote, and which rules refused
   * it, is on {@link aiRefusal} and exists nowhere else.
   */
  refused: boolean;
}

/**
 * How this turn's reply was produced — written by the model, a fixed sentence,
 * a handoff, or nothing at all.
 *
 * THE COLUMN v2 IS SUPERVISED THROUGH. Under v1 there was one answer to "where
 * did that sentence come from" and it was "a person wrote it, months ago". Now
 * there are four, they carry different risk, and they are reviewed differently —
 * so the screen has to say which, on every row, without being opened.
 *
 * TONE IS THE SECOND SIGNAL AND NEVER THE ONLY ONE. `handoff` and a refused
 * template share amber deliberately: they are the two rows worth a second look,
 * and telling them apart is the job of the words and the glyph the caller pairs
 * with this. A screen that needed colour to separate them would be unreadable on
 * the greyscale a cheap phone in bright sun effectively is.
 *
 * A SHADOW turn is read exactly like an answered one, because the question here
 * is how the sentence was MADE and a rehearsal makes it the same way. That
 * nothing reached a dealer is the outcome badge's job, and the hint says it too.
 */
export function aiProduction(
  turn: Pick<AiTurn, 'outcome' | 'writer' | 'writerSkip'> | undefined | null,
): AiProductionView | null {
  if (!turn) return null;
  // A handoff first, whatever the writer did. On the `no_intent` path the writer
  // ran, said the facts do not answer the question, and its draft is kept — so
  // `refused` is still true and the drafted sentence is still worth reading, but
  // what the dealer got was the warm line and a person.
  if (turn.outcome === 'HANDED_OFF') {
    return {
      kind: 'handoff',
      label: 'Passed to a person',
      tone: 'warning',
      hint: 'Nothing was answered. The dealer got the warm line and the ticket stayed in the queue.',
      refused: turn.writer === 'fallback',
    };
  }
  if (turn.outcome === 'SUPPRESSED' || turn.outcome === 'SUPERSEDED') {
    return {
      kind: 'silent',
      label: 'Nothing posted',
      tone: 'neutral',
      hint:
        turn.outcome === 'SUPPRESSED'
          ? 'It chose not to act at all — a switch, or a thread it should stay out of.'
          : 'It was acting and the world moved: a person replied, or the dealer wrote again, before it finished.',
      refused: false,
    };
  }

  const rehearsal =
    turn.outcome === 'SHADOW' ? ' Nothing reached the dealer: this outlet is in rehearsal.' : '';
  switch (turn.writer) {
    case 'prose':
      return {
        kind: 'written',
        label: AI_WRITER_LABEL.prose,
        // Info, not success. A written answer is the new thing on the screen and
        // it still has to be read — painting it green would say "this one is
        // fine", which is the one claim this page exists NOT to make for us.
        tone: 'info',
        hint: `The model composed this sentence from this turn's facts and it passed every check.${rehearsal}`,
        refused: false,
      };
    case 'fallback':
      return {
        kind: 'template',
        label: AI_WRITER_LABEL.fallback,
        tone: 'warning',
        hint: `The model wrote something and we refused it, so the hand-written sentence for the same fact went instead. The dealer was told nothing.${rehearsal}`,
        refused: true,
      };
    case 'skipped':
      return {
        kind: 'template',
        label: AI_WRITER_LABEL.skipped,
        tone: 'neutral',
        hint: `${
          turn.writerSkip ? AI_WRITER_SKIP_LABEL[turn.writerSkip] : 'The writer was never called'
        }, so the hand-written sentence went out.${rehearsal}`,
        refused: false,
      };
    case 'off':
      return {
        kind: 'template',
        label: AI_WRITER_LABEL.off,
        tone: 'neutral',
        hint: `${
          turn.writerSkip ? AI_WRITER_SKIP_LABEL[turn.writerSkip] : 'The writer is off'
        }, so the hand-written sentence went out.${rehearsal}`,
        refused: false,
      };
    default:
      // No `writer` field at all: a row from before the writer shipped. Named as
      // such rather than guessed at — "Template" with no qualifier would read as
      // a decision somebody made today.
      return {
        kind: 'template',
        label: 'Fixed sentence',
        tone: 'neutral',
        hint: `A hand-written sentence, from before the writer existed.${rehearsal}`,
        refused: false,
      };
  }
}
/* ─────────────────── The rules that refuse, in plain words ──────────────── */

/**
 * Every reason the fence can refuse a sentence the writer composed.
 *
 * A MIRROR OF A BACKEND UNION, AND SAID SO OUT LOUD. The list lives in
 * `mdg-backend/src/assist/firstline/fence.ts`, which is pure, backend-local and
 * has no business being imported by a browser. `AiTurn.fenceFailure` therefore
 * crosses the wire as `string[]`, and this is the vocabulary that turns those
 * names into something a person can act on. The order is the fence's own — most
 * serious first, exactly as `RULE_NAMES` in `rules.ts` is ordered rather than
 * alphabetical — so `fenceFailure[0]` is the worst thing found and leads the row.
 *
 * Because it is a mirror, {@link aiRuleLabel} falls back rather than throwing:
 * the admin and the backend deploy separately, and an admin one deploy behind a
 * new eighteenth rule must print something readable instead of an empty cell.
 */
export const AI_FENCE_RULES = [
  'writer_shape',
  'contact_detail',
  'wrong_language',
  'over_length',
  'prompt_echo',
  'guard_out',
  'forbidden_subject',
  'unhonoured_instruction',
  'unsourced_person',
  'dealer_code',
  'unsourced_service',
  'unsourced_date',
  'unit_not_sourced',
  'unfoldable_digit',
  'iso_date',
  'unsourced_number',
  'echoed_figure',
  'spelled_quantity',
] as const;
export type AiFenceRule = (typeof AI_FENCE_RULES)[number];

/** Three or four words, for a pill. */
export const AI_FENCE_RULE_LABEL: Record<AiFenceRule, string> = {
  writer_shape: 'Not shaped like a reply',
  contact_detail: 'A phone number or an email',
  wrong_language: 'The wrong language',
  over_length: 'Too long',
  prompt_echo: 'It read our instructions back',
  guard_out: 'The output guard stopped it',
  forbidden_subject: 'A subject we do not answer in chat',
  unhonoured_instruction: 'It told the dealer to do something',
  unsourced_person: 'A name no lookup returned',
  dealer_code: 'An outlet code',
  unsourced_service: 'A service this turn never read',
  unsourced_date: 'A date nothing returned',
  unit_not_sourced: 'Rupees, litres, a percentage or a density',
  unfoldable_digit: 'A numeral we cannot read',
  iso_date: 'A raw 2026-08-28',
  unsourced_number: 'A figure no lookup returned',
  echoed_figure: "The dealer's own figure, repeated back",
  spelled_quantity: 'A quantity written out in words',
};

/**
 * The sentence behind each rule — what to DO about it.
 *
 * This is the tuning surface and it is why the hints are this long. THE FIX FOR
 * A HIGH REFUSAL RATE IS A BETTER ENVELOPE OR A BETTER PROMPT — more `display`
 * strings, a clearer instruction to copy them character for character. IT IS
 * NEVER A LOOSER FENCE: every loosening is permanent and invisible, and the
 * cheapest fix will always look like widening one regex.
 */
export const AI_FENCE_RULE_HINT: Record<AiFenceRule, string> = {
  writer_shape:
    'Empty, far too long, or carrying a line break, a bullet, a link or an emoji. A chat bubble is one or two sentences and nothing else.',
  contact_detail:
    'An email address, or eight digits in a row. The first line does not hand out contact details.',
  wrong_language: 'It answered a Hindi question in English, or an English one in Devanagari.',
  over_length:
    'Past the cap for that language. It is thrown away rather than cut short — a sentence chopped mid-word is the one failure a dealer would certainly notice.',
  prompt_echo:
    'The reply repeats a phrase out of the writer’s or the router’s own instruction. That is somebody probing, not a clumsy sentence, so the thread is marked.',
  guard_out:
    'The shared output scanner objected — a model or vendor name, how MDG works inside, or somebody’s details.',
  forbidden_subject:
    'Outstanding amounts, a variation figure, invoice contents, inspection findings, a Kavach score, a password, why a job failed, or a promise about when something will be ready. None of those go out over chat.',
  unhonoured_instruction:
    'The reply told the dealer to DO something this turn could not honour — the one rule that is about an instruction rather than a fact. It exists because “Send a photo of that day’s page right here.” carries no figure, no date, no name and no service, so it passed every other check while being flatly false: nothing filed the photograph the dealer then sent. Widening what may be said means writing the code that honours it first.',
  unsourced_person:
    'It named an employee this turn never looked up, or dropped the one it did. Names come off the outlet’s own roster or they do not appear.',
  dealer_code:
    'Any outlet-code-shaped token, INCLUDING this dealer’s own. No template has ever printed one, a dealer knows which pump they own, and a reply naming an outlet is the one place a cross-outlet mix-up could be manufactured.',
  unsourced_service:
    'It named a service whose label is nowhere in this turn’s facts — which is how an outlet gets told about something it is not even on.',
  unsourced_date:
    'A month name, a "today"/"yesterday", or a future word with no sourced date behind it. Every relative day but "yesterday" refuses always: no lookup returns a future date.',
  unit_not_sourced:
    'No lookup returns rupees, litres or a percentage by default, so those words may not stand next to a figure. This is also the rule that closes the ₹3,000 hole the shared output scanner leaves open.',
  unfoldable_digit:
    'A numeral from a script the fence does not carry. Refused rather than guessed at — guessing is the one direction that fails open.',
  iso_date:
    'Dates reach the writer already written the way a dealer reads them. Printing the machine’s own format means it rewrote one, which is exactly what it is told not to do.',
  unsourced_number:
    'The core rule. Every digit left after the sourced spans are blanked out is a number the machine made up — a rounded one included: "about 19,000" against a sourced 19,410.62 refuses, because a dealer arguing with an inspector writes down what we told them.',
  echoed_figure:
    'A figure that came from the dealer’s own message rather than from MDG’s records. Posted under "MDG Support" it would turn their claim into our assertion, so the thread is marked.',
  spelled_quantity:
    'A number word standing next to a unit — "nineteen thousand litres". A bare number word ("one moment", "एक मिनट") is ordinary speech and stays legal.',
};

/**
 * The other vocabulary a `guard` block can carry: the input scanner's families,
 * the two first-line-only checks, and the vendor's own refusal.
 *
 * ONE RESOLVER OVER BOTH MAPS ({@link aiRuleLabel}), because a turn's `guard`
 * block carries input-stage names and writer-stage fence names in the same
 * array, and `fence.ts` already keeps `prompt-echo` in the shared rule list for
 * exactly this reason — "so the admin filter and the trace share one vocabulary".
 */
export const AI_GUARD_RULES = [
  'injection',
  'abuse',
  'pii-dump',
  'internal-method',
  'model-name',
  'prompt-echo',
  'pricing',
  'competitor',
  'other-outlet',
  'credentials',
  'safety',
] as const;
export type AiGuardRule = (typeof AI_GUARD_RULES)[number];

export const AI_GUARD_RULE_LABEL: Record<AiGuardRule, string> = {
  injection: 'An instruction aimed at the machine',
  abuse: 'Abuse',
  'pii-dump': "A request for somebody's details",
  'internal-method': 'A question about how MDG works inside',
  'model-name': 'It named the model or the vendor',
  'prompt-echo': 'It read our instructions back',
  pricing: 'A price',
  competitor: 'A competitor was named',
  'other-outlet': 'Another outlet was named',
  credentials: 'A password, an OTP or a login',
  safety: 'The vendor refused on safety grounds',
};

/**
 * A rule name in words, whichever stage it came from.
 *
 * The fallback is deliberate and is the reason this is a function rather than a
 * lookup at the call site: the admin ships separately from the backend, so a
 * rule added on the box before the screen is redeployed must read as
 * "Unsourced quantity" and not as a blank pill. A raw `snake_case` token in
 * front of somebody who has never read this codebase is the failure being
 * prevented, and an empty cell is worse — it looks like the guard recorded
 * nothing.
 */
export function aiRuleLabel(name: string): string {
  const fence = (AI_FENCE_RULE_LABEL as Record<string, string | undefined>)[name];
  if (fence) return fence;
  const guard = (AI_GUARD_RULE_LABEL as Record<string, string | undefined>)[name];
  if (guard) return guard;
  const words = name.replace(/[-_]+/g, ' ').trim();
  if (!words) return name;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The long form, when there is one. Only the fence rules carry it. */
export function aiRuleHint(name: string): string | undefined {
  return (AI_FENCE_RULE_HINT as Record<string, string | undefined>)[name];
}

/**
 * Is this rule EVIDENCE OF AN ATTACK rather than our own writer being clumsy?
 *
 * The mirror of `FenceVerdict.flag`, and it must stay the same two rules: the
 * model echoing a figure the dealer planted, or reciting either system
 * instruction. Every other refusal is our failure, not the dealer's behaviour,
 * and marking a curious pump owner as a security observation because our Hindi
 * was stiff is precisely the wrong signal to record.
 */
export function aiRuleIsAttack(name: string): boolean {
  return name === 'echoed_figure' || name === 'prompt_echo' || name === 'prompt-echo';
}

/* ────────────────────── The guard, as seen from a thread ────────────────── */

/**
 * Did THIS turn's guard mark the thread?
 *
 * `Conversation.ai.abuse` is the server's own counter and it is DELIBERATELY NOT
 * SERIALIZED to anybody: `conversationToPublic` feeds the dealer's app as well
 * as the admin's, and telling somebody they have been marked is both unkind and
 * a map of the guards. The admin reaches the marked threads through the
 * server-side `ai-guard` lens instead.
 *
 * So an admin standing IN a thread has to learn why from the turn log, which is
 * admin-only and does carry `guard`. This mirrors, exactly, the two places
 * `run.ts` bumps the counter:
 *
 *  - a BLOCKING input hit — `stage: 'input'`, `action: 'handoff'`. An advisory
 *    input hit (`competitor` is the only one) is recorded and the turn carries
 *    on, and it marks nothing;
 *  - a fence refusal carrying evidence of an ATTACK — the model echoing a figure
 *    the dealer planted, or reciting a system instruction. A writer-stage guard
 *    whose only rule is `safety` is the VENDOR declining, not the dealer
 *    probing, and it marks nothing either.
 *
 * It is a mirror, so it can drift. What keeps it honest is that both halves are
 * spelled out above and the lens — which is the authority — is a server-side
 * filter on the counter itself.
 */
export function aiGuardMarkedThread(guard: AiTurn['guard'] | undefined | null): boolean {
  if (!guard) return false;
  if (guard.stage === 'input') return guard.action === 'handoff';
  return (guard.rules ?? []).some((r) => aiRuleIsAttack(r));
}

export interface AiThreadGuardView {
  /** The rules from the most recent marking turn, in the order it recorded them. */
  rules: string[];
  /** The same, in words. */
  labels: string[];
  /** Where it was caught. */
  stage: 'input' | 'writer';
  /** When the most recent one happened. */
  at: string;
  label: string;
  tone: Extract<AiTone, 'danger'>;
  hint: string;
}

/**
 * What the guard has seen on this thread, from the turns the admin already has
 * in hand — or `null`, which is almost every thread.
 *
 * NO COUNT ON THE LABEL, and that is the one thing to resist adding. This reads
 * the handful of turns the strip fetches, so any number it printed would be a
 * FLOOR and would disagree with the lens's badge, which counts the whole
 * thread's history. A screen whose entire job is being trusted about what the
 * machine did must not carry a figure that is quietly a lower bound.
 *
 * For the same reason this EXPLAINS a thread and never decides whether one is
 * marked: a hit older than the fetched window does not appear here at all. The
 * `ai-guard` lens is a server-side filter on the real counter, and it is the
 * authority.
 */
export function aiThreadGuard(
  turns: ReadonlyArray<Pick<AiTurn, 'guard'>> | undefined | null,
): AiThreadGuardView | null {
  if (!turns) return null;
  // The list arrives newest first, so the first match is the most recent.
  const hit = turns.find((t) => aiGuardMarkedThread(t.guard));
  const guard = hit?.guard;
  if (!guard) return null;
  const rules = [...(guard.rules ?? [])];
  return {
    rules,
    labels: rules.map((r) => aiRuleLabel(r)),
    stage: guard.stage,
    at: guard.at,
    label: 'AI guard',
    // Red, and it is the only red on this surface that is not about a clock.
    // Everything else here says how long somebody has waited; this says what
    // somebody wrote.
    tone: 'danger',
    hint:
      guard.stage === 'input'
        ? 'The input guard stopped this before the model saw it. The thread stays marked until a super-admin clears it — replying does not.'
        : 'What the writer produced carried evidence of an attempt. The thread stays marked until a super-admin clears it — replying does not.',
  };
}

/* ─────────────────────── The sentence we did not send ───────────────────── */

export interface AiRefusalView {
  /** What the writer composed. `null` when it never returned anything readable. */
  prose: string | null;
  /** The rule names, in the fence's own order — the worst thing found leads. */
  rules: string[];
  /** The same, in words. Same length, same order. */
  labels: string[];
  /** True when a rule on the list is evidence of an attack. See {@link aiRuleIsAttack}. */
  attack: boolean;
  /** One sentence saying what happened, and what the dealer got instead. */
  headline: string;
}

/**
 * The sentence the writer composed and we refused, with the reasons — or `null`
 * on every turn where that did not happen.
 *
 * THE SINGLE MOST VALUABLE THING ON THE REVIEW SCREEN, for two reasons. It is
 * how the fence is tuned: the pair "what it wanted to say" and "which rule
 * stopped it" is the only evidence that says whether a refusal was right, and it
 * exists nowhere else — the dealer never saw the text and it was never posted.
 * And it is the evidence that the guard is doing anything at all: a fence with
 * no visible refusals is indistinguishable from a fence that is switched off.
 *
 * THREE DIFFERENT THINGS PRODUCE `writer: 'fallback'` and the headline has to
 * tell them apart, because the right response to each is different:
 *
 *  - RULES PRESENT — the fence refused it. Read the sentence, decide whether the
 *    rule was right, and if it was not, fix the ENVELOPE or the PROMPT.
 *  - NO RULES, AND THE TURN HANDED OFF — the writer itself said the facts do not
 *    answer the question. That is not a fence failure at all; it is the writer
 *    reporting that the router mislabelled the message, and the label is what to
 *    look at.
 *  - NO RULES, AND THE TURN ANSWERED — the writer never came back with anything
 *    usable: a timeout, a vendor refusal, or JSON that would not parse. Nothing
 *    to read, and that absence is itself the finding.
 *
 * The third case returns a view with `prose: null` ON PURPOSE. A row marked
 * "prose refused" with nothing under it looks like a broken screen; a row that
 * says the writer returned nothing usable is a fact.
 *
 * AND THE HEADLINE NEVER CLAIMS THE DEALER READ THE TEMPLATE UNLESS THEY DID.
 * A rehearsal turn and one that lost the race to a human reply both post
 * NOTHING, so on those the fallback was composed and thrown away with everything
 * else. Saying "the dealer read the hand-written line instead" there would be
 * the same class of untruth this whole screen exists to catch — a sentence
 * asserting something the machinery did not do.
 */
export function aiRefusal(
  turn: Pick<AiTurn, 'writer' | 'writerProse' | 'fenceFailure' | 'outcome'> | undefined | null,
): AiRefusalView | null {
  if (!turn || turn.writer !== 'fallback') return null;
  const rules = turn.fenceFailure ?? [];
  const prose = turn.writerProse?.trim() || null;
  // Did anything at all reach the dealer on this turn? Only an ANSWERED turn
  // posted the fallback; a handoff posted the warm line, and the two silences
  // posted nothing.
  const posted = turn.outcome === 'ANSWERED';
  const headline =
    rules.length > 0
      ? posted
        ? 'The fence refused this sentence. The dealer read the hand-written line for the same fact instead, and was told nothing.'
        : 'The fence refused this sentence. Nothing was posted on this turn in any case — see the outcome beside it.'
      : turn.outcome === 'HANDED_OFF'
        ? 'The writer said these facts do not answer the question, so the thread went to a person. This is the sentence it had drafted.'
        : posted
          ? 'The writer returned nothing we could use — a timeout, a vendor refusal, or a reply that would not parse. The hand-written line went out instead.'
          : 'The writer returned nothing we could use — a timeout, a vendor refusal, or a reply that would not parse.';
  return {
    prose,
    rules: [...rules],
    labels: rules.map((r) => aiRuleLabel(r)),
    attack: rules.some((r) => aiRuleIsAttack(r)),
    headline,
  };
}
/* ──────────────────────── The lookups a turn ran ────────────────────────── */

/**
 * What each lookup ASKED THE DATABASE, in the words the question was asked in.
 *
 * A turn used to run one lookup; it now runs up to five in one parallel batch,
 * so `toolIds` stopped being a footnote and became the answer to "why did it say
 * that?". `dsr_status → documents_open` on one row is a `todo` turn that read
 * both halves of what is open between MDG and the outlet; `dsr_status` alone on
 * the same label means the second lookup refused, which is a different turn
 * entirely and reads identically if the ids are printed raw.
 *
 * Mirrored from `TOOL_IDS` in `mdg-backend/src/assist/firstline/tools.ts` for the
 * same reason the fence rules are, and {@link aiToolLabel} falls back the same
 * way. NAMES, NEVER PAYLOADS — the turn log stores which lookups ran and
 * deliberately not what they returned, because a turn log is not a data export.
 */
export const AI_TOOL_LABEL: Readonly<Record<string, string>> = {
  dsr_status: 'Is the DSR ready',
  dsr_report_for_date: 'The report for one day',
  dsr_shared_figures: "A shared report's figures",
  density_status: "Today's density page",
  density_latest: 'The latest density',
  density_missing_days: 'Missing density days',
  density_readings: "The last tanker's readings",
  kavach_pending: 'What Kavach is waiting for',
  kavach_task_states: 'Every Kavach task',
  staff_points: 'Staff points',
  staff_leave: 'Who is on leave',
  staff_last_batch: 'The last points submission',
  services_attached: 'Services this outlet is on',
  service_log_recent: 'Recent service runs',
  records_recent: 'Documents on file',
  documents_open: 'Papers open, both ways',
};

export function aiToolLabel(id: string): string {
  const hit = AI_TOOL_LABEL[id];
  if (hit) return hit;
  const words = id.replace(/[-_]+/g, ' ').trim();
  if (!words) return id;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/* ─────────────────────── What the router made of it ─────────────────────── */

export interface AiPlanAskView {
  intent: AiFirstLineIntent;
  /** The label for that intent, out of {@link AI_INTENT_LABEL}. */
  label: string;
  /** The scalars THIS ask carried, each with the word for what it is. */
  scalars: Array<{ label: string; value: string }>;
  /** Label and scalars on one line, for a table cell that has room for one. */
  summary: string;
  /** `asks[0]`. The reply leads with it, so the screen should too. */
  primary: boolean;
}

/**
 * The plan, one line per thing the dealer asked about.
 *
 * THE SCALARS BELONG TO THE ASK AND NOT TO THE TURN, and a screen that flattened
 * them would undo the reason they are per-ask. "22 tarikh ka DSR bhejo aur aaj
 * ki density batao" carries two different days; printing one "Day" for the turn
 * would show a reviewer a date the density lookup never read, and then the
 * screen asserts a figure the calculation did not use — the fault this codebase
 * has already been audited for once.
 *
 * Only the fields the model actually filled. An omitted date is not "no date",
 * it is a question that never named one, and printing "Day: —" invites the
 * reader to think the machine failed to find something it never looked for.
 */
export function aiPlanAsks(plan: AiPlan | undefined | null): AiPlanAskView[] {
  if (!plan || !plan.asks) return [];
  return plan.asks.map((ask, i) => {
    const scalars: Array<{ label: string; value: string }> = [];
    if (ask.date) scalars.push({ label: 'Day', value: ask.date });
    if (ask.month) scalars.push({ label: 'Month', value: ask.month });
    // A LOOKUP KEY, never something the dealer read back — what they were shown
    // is the name stored on the employee record. Labelled as such so nobody
    // reads this cell as evidence of what the machine said.
    if (ask.personName) scalars.push({ label: 'Name looked up', value: ask.personName });
    if (ask.productHint) scalars.push({ label: 'Grade', value: ask.productHint });
    const label = AI_INTENT_LABEL[ask.intent] ?? ask.intent;
    return {
      intent: ask.intent,
      label,
      scalars,
      summary: scalars.length > 0 ? `${label} · ${scalars.map((s) => s.value).join(' · ')}` : label,
      primary: i === 0,
    };
  });
}

/* ──────────────── The two numbers that say whether v2 worked ────────────── */

export interface AiWriterSplit {
  prose: number;
  fallback: number;
  skipped: number;
  off: number;
  /** Every turn the writer stage reached a decision about. */
  total: number;
}

/**
 * The writer's day, counted.
 *
 * The counts arrive as a loose `Record<string, number>` keyed by disposition —
 * the shape a Mongo `$group` produces — so a key the screen has never heard of
 * simply does not land in one of the four buckets. It still lands in `total`,
 * which is the honest arithmetic: the denominator is what the writer decided
 * about, not what this build can name.
 */
export function aiWriterSplit(
  byWriter: Readonly<Record<string, number>> | undefined | null,
): AiWriterSplit {
  const src = byWriter ?? {};
  let total = 0;
  for (const n of Object.values(src)) total += n;
  return {
    prose: src.prose ?? 0,
    fallback: src.fallback ?? 0,
    skipped: src.skipped ?? 0,
    off: src.off ?? 0,
    total,
  };
}

export interface AiProseRateView {
  /** Answers the writer's own sentence went out on, in the last day. */
  prose: number;
  /** Every answered turn in the same window — the denominator that was chosen. */
  answered: number;
  /** 0–100, rounded, and clamped. */
  percent: number;
  tone: AiTone;
  /** What the number means and what to do about it. */
  sentence: string;
}

/**
 * THE NUMBER THIS WHOLE VERSION IS MEASURED BY: how many of the last day's
 * answers the machine wrote in its own words.
 *
 * `prose ÷ every ANSWERED turn`, which is deliberately a harsher denominator
 * than `prose ÷ turns the writer reached`. Below about 70% NOTHING HAS CHANGED:
 * dealers are still reading v1's fixed sentences and we are paying for a writer
 * whose output is being thrown away. The looser denominator would hide exactly
 * that, because every skipped turn would drop out of it.
 *
 * CLAMPED AT 100, and the clamp is not paranoia. A `SHADOW` turn carries
 * `writer: 'prose'` and is NOT an `ANSWERED` turn, so during a rehearsal week the
 * numerator legitimately runs ahead of the denominator. "112%" on a safety
 * screen destroys the reader's trust in every other figure on it.
 *
 * `null` when nothing was answered at all. A percentage of nothing is a lie, and
 * an idle Sunday must not read as a broken writer.
 */
export function aiProseRate(
  byWriter: Readonly<Record<string, number>> | undefined | null,
  answered: number,
): AiProseRateView | null {
  if (!answered || answered <= 0) return null;
  const split = aiWriterSplit(byWriter);
  const percent = Math.min(100, Math.round((split.prose / answered) * 100));
  // The writer never ran at all: a box with the switch down, or the middle
  // notch. That is not a bad rate, it is the v1 product running on purpose, and
  // painting it amber would nag every day of a deliberate templates-only week.
  if (split.prose === 0 && split.fallback === 0 && split.off + split.skipped > 0) {
    return {
      prose: 0,
      answered,
      percent: 0,
      tone: 'neutral',
      sentence:
        'The writer did not run. Every answer was a hand-written sentence — exactly the product that was live before this version.',
    };
  }
  if (percent >= 70) {
    return {
      prose: split.prose,
      answered,
      percent,
      tone: 'success',
      sentence: `${percent}% of the last day's answers were written by the machine in its own words.`,
    };
  }
  return {
    prose: split.prose,
    answered,
    percent,
    tone: 'warning',
    sentence: `${percent}% of the last day's answers were written in the machine's own words. Below 70% means dealers are still reading the old fixed sentences — and the fix is a better envelope or a clearer prompt, never a looser fence.`,
  };
}

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
