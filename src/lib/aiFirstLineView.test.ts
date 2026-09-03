import { describe, expect, it } from 'vitest';

import {
  AI_FENCE_RULES,
  AI_FENCE_RULE_HINT,
  AI_FENCE_RULE_LABEL,
  AI_FIRSTLINE_INTENTS,
  AI_FIRSTLINE_LANGS,
  AI_GUARD_RULES,
  AI_GUARD_RULE_LABEL,
  AI_HANDOFF_REASONS,
  AI_HANDOFF_REASON_LABEL,
  AI_INTENT_LABEL,
  AI_LANG_LABEL,
  AI_OUTCOME_LABEL,
  AI_OUTCOME_TONE,
  AI_TURN_OUTCOMES,
  AI_TURN_VERDICTS,
  AI_VERDICT_LABEL,
  AI_WRITER_DISPOSITIONS,
  AI_WRITER_LABEL,
  AI_WRITER_SKIPS,
  AI_WRITER_SKIP_LABEL,
  aiCostLabel,
  aiGuardMarkedThread,
  aiInboxChip,
  aiPlanAsks,
  aiProduction,
  aiProseRate,
  aiReasonTone,
  aiRefusal,
  aiRuleHint,
  aiRuleIsAttack,
  aiRuleLabel,
  aiThreadGuard,
  aiToolLabel,
  aiTouchedThread,
  aiTurnAge,
  aiWithheldAnswer,
  aiWriterSplit,
  type AiTurn,
  type ConversationAiState,
} from '@dk/shared';

/**
 * The decidable half of the ADMIN's AI first-line surface, exercised from the
 * dealer app.
 *
 * WHY THE TEST FOR AN ADMIN SCREEN LIVES IN `mdg-client`
 * -----------------------------------------------------
 * `mdg-admin` has no `test` script and not one test file — checked, not assumed
 * — and `shared` has no runner of its own. So this follows the pattern
 * `documentsFormat.test.ts` next door already sets out: anything decidable goes
 * into `shared`, and the only vitest that can reach it is the dealer app's.
 * There is no precedent anywhere in this repo for a test in one app importing a
 * module out of another by relative path, and inventing one would put a file
 * outside `mdg-client`'s tsconfig and Vite alias set into its test graph.
 *
 * WHAT IS WORTH THE FILE
 * ----------------------
 * Five rules, and every one of them is silent when it is wrong:
 *
 *  - THE CHIP decides whether a wrong answer is flagged red or filed under the
 *    same amber as "the dealer sent a photo". Get it wrong and the worst
 *    answers the machine gives become the hardest ones to find;
 *  - THE WITHHELD-ANSWER RULE decides what an admin is offered to paste into a
 *    live thread. Too loose and it offers a body that FAILED its own
 *    verification, or re-offers a sentence the dealer has already read;
 *  - THE AGE is read on two screens off a clock passed in, and a negative one
 *    would read as a bug in a system that is working fine;
 *  - THE TONES are drawn by two screens an admin moves between in one click, and
 *    they were briefly two maps that disagreed about the same fact;
 *  - THE LABELS are exhaustive `Record`s, so a new intent or handoff reason
 *    cannot ship without English. That is a compile-time guarantee everywhere
 *    except here, where it is checked at runtime too — because a `Record` built
 *    from a stale copy of the union still compiles.
 */

/** The instant every age assertion is measured against: 2026-09-03, 10:00 IST. */
const NOW = Date.parse('2026-09-03T10:00:00+05:30');

/** An `ai` block with only the fields the chip reads. */
function aiState(
  state: ConversationAiState['state'],
  extra: Partial<ConversationAiState> = {},
): ConversationAiState {
  return { state, streak: 0, missStreak: 0, ...extra };
}

/** A turn with only the fields `aiWithheldAnswer` reads. */
function turn(
  outcome: AiTurn['outcome'],
  extra: Partial<Pick<AiTurn, 'answer' | 'reason'>> = {},
): Pick<AiTurn, 'answer' | 'outcome' | 'reason'> {
  return { outcome, ...extra };
}

describe('aiInboxChip', () => {
  it('shows nothing at all on a thread the machine never touched', () => {
    // Most threads. A permanent "the AI did nothing" chip would be a line every
    // admin learns to read past, on every row.
    expect(aiInboxChip(undefined)).toBeNull();
    expect(aiInboxChip(null)).toBeNull();
  });

  it('shows nothing while a turn is in flight or after a person took over', () => {
    // IDLE is not "the machine had its say"; claiming it did would be a lie on
    // the one screen whose job is telling us from the machine.
    expect(aiInboxChip(aiState('IDLE'))).toBeNull();
  });

  it('marks an answered thread grey, not as an alarm and not as resolved', () => {
    const chip = aiInboxChip(aiState('ANSWERED'));
    expect(chip?.chip).toBe('replied');
    expect(chip?.label).toBe('AI replied');
    expect(chip?.tone).toBe('neutral');
  });

  it('marks an ordinary handoff amber', () => {
    const chip = aiInboxChip(aiState('HANDED_OFF', { lastReason: 'attachment' }));
    expect(chip?.chip).toBe('passed_on');
    expect(chip?.label).toBe('AI passed on');
    expect(chip?.tone).toBe('warning');
  });

  it('SEPARATES the dispute window from an ordinary handoff', () => {
    // THE ASSERTION THIS FILE EXISTS FOR. A `follow_up` handoff means the dealer
    // wrote again seconds after the machine answered — the strongest signal
    // available that the answer missed, and it costs nothing to read because no
    // model is called. Filing it under the same amber as "the dealer sent a
    // photo" would bury the worst answers the machine gives among the routine
    // ones, which is the exact failure this screen exists to prevent.
    const chip = aiInboxChip(aiState('HANDED_OFF', { lastReason: 'follow_up' }));
    expect(chip?.chip).toBe('questioned');
    expect(chip?.label).toBe('AI answer questioned');
    expect(chip?.tone).toBe('danger');
  });

  it('gives every chip its own words, so colour is never the only signal', () => {
    const labels = [
      aiInboxChip(aiState('ANSWERED'))!.label,
      aiInboxChip(aiState('HANDED_OFF', { lastReason: 'quota' }))!.label,
      aiInboxChip(aiState('HANDED_OFF', { lastReason: 'follow_up' }))!.label,
    ];
    expect(new Set(labels).size).toBe(3);
  });

  it('agrees with the lens about which threads the machine touched', () => {
    // The tab is filtered server-side; this predicate is what any client-side
    // redraw uses. Two answers to one question is how a row appears in a tab
    // that then refuses to draw its chip.
    expect(aiTouchedThread(aiState('ANSWERED'))).toBe(true);
    expect(aiTouchedThread(aiState('HANDED_OFF', { lastReason: 'quota' }))).toBe(true);
    expect(aiTouchedThread(aiState('IDLE'))).toBe(false);
    expect(aiTouchedThread(undefined)).toBe(false);
  });
});

describe('aiWithheldAnswer', () => {
  it('offers the rehearsal answer nobody has read', () => {
    // A SHADOW turn ran end to end at real cost and posted nothing. Its answer
    // is the one an admin would otherwise write from scratch.
    expect(
      aiWithheldAnswer(turn('SHADOW', { answer: 'Aaj ka DSR taiyaar hai.' })),
    ).toBe('Aaj ka DSR taiyaar hai.');
  });

  it('offers an answer that lost the race to a human reply', () => {
    expect(
      aiWithheldAnswer(turn('SUPERSEDED', { answer: 'Density 0.7412 recorded.' })),
    ).toBe('Density 0.7412 recorded.');
  });

  it('does NOT re-offer an answer the dealer has already read', () => {
    // It is in the thread. A button offering to paste it again is an invitation
    // to say the same thing twice.
    expect(
      aiWithheldAnswer(turn('ANSWERED', { answer: 'Aaj ka DSR taiyaar hai.' })),
    ).toBeNull();
  });

  it('does NOT offer the warm handoff line', () => {
    // On the handoff path `run.ts` overwrites `turn.answer` with the line it
    // just posted — "somebody will be with you shortly". The dealer has read it;
    // pasting it back is noise. A `reason` on the row is what marks that path,
    // whatever the outcome, which is why the rule reads the reason and not only
    // the outcome.
    expect(
      aiWithheldAnswer(
        turn('SHADOW', { answer: 'Koi humara saathi jald aapse baat karega.', reason: 'attachment' }),
      ),
    ).toBeNull();
    expect(
      aiWithheldAnswer(
        turn('SUPERSEDED', { answer: 'Someone will be with you shortly.', reason: 'tool_refused' }),
      ),
    ).toBeNull();
  });

  it('offers nothing when there is nothing', () => {
    expect(aiWithheldAnswer(turn('SUPPRESSED'))).toBeNull();
    expect(aiWithheldAnswer(turn('SHADOW', { answer: '' }))).toBeNull();
    expect(aiWithheldAnswer(turn('SHADOW', { answer: '   ' }))).toBeNull();
    expect(aiWithheldAnswer(undefined)).toBeNull();
  });
});

describe('aiTurnAge', () => {
  it('reads the ladder a row has room for', () => {
    expect(aiTurnAge('2026-09-03T09:59:40+05:30', NOW)).toBe('now');
    expect(aiTurnAge('2026-09-03T09:55:00+05:30', NOW)).toBe('5m');
    expect(aiTurnAge('2026-09-03T07:00:00+05:30', NOW)).toBe('3h');
    expect(aiTurnAge('2026-09-01T10:00:00+05:30', NOW)).toBe('2d');
  });

  it('falls back to a date once a week has passed', () => {
    // Past a week "43d" stops meaning anything; the day it happened does.
    expect(aiTurnAge('2026-07-01T10:00:00+05:30', NOW)).not.toMatch(/^\d+d$/);
  });

  it('never prints a negative age', () => {
    // Clock skew between a phone and the server is real and small. "-1m" on a
    // row is a bug report about a system that is working fine.
    expect(aiTurnAge('2026-09-03T10:05:00+05:30', NOW)).toBe('now');
  });

  it('says nothing rather than "Invalid Date"', () => {
    expect(aiTurnAge(undefined, NOW)).toBe('');
    expect(aiTurnAge('not a date', NOW)).toBe('');
  });
});

describe('aiCostLabel', () => {
  it('calls a free turn free', () => {
    // Zero is a REAL value here, not a missing one: the dispute-window handoff
    // calls no model at all. "₹0.00" reads like a rounding artefact and hides
    // that the most valuable signal in the system is also the cheapest.
    expect(aiCostLabel(0)).toBe('free');
    expect(aiCostLabel(undefined)).toBe('free');
  });

  it('prints paise exactly, in rupees', () => {
    expect(aiCostLabel(8)).toBe('₹0.08');
    expect(aiCostLabel(125)).toBe('₹1.25');
  });
});

describe('the tone maps', () => {
  it('keeps a rehearsal distinguishable from something a dealer read', () => {
    // A SHADOW turn posted nothing. If it wore the same colour as an ANSWERED
    // one, a reviewer would judge a dress rehearsal as a live mistake — which is
    // the exact confusion the SHADOW outcome exists to prevent.
    expect(AI_OUTCOME_TONE.SHADOW).toBe('info');
    expect(AI_OUTCOME_TONE.SHADOW).not.toBe(AI_OUTCOME_TONE.ANSWERED);
  });

  it('does not paint a working handoff as a failure', () => {
    // A handoff IS the machine working correctly. Red here would teach the team
    // to read the screen's worst colour as normal.
    expect(AI_OUTCOME_TONE.HANDED_OFF).toBe('warning');
  });

  it('is ONE map, so the two screens that draw the badge agree', () => {
    // This existed briefly as two: the strip above the inbox composer painted an
    // answered turn grey while the review page painted it green — the same fact
    // in two moods, on two screens an admin moves between in one click.
    for (const o of AI_TURN_OUTCOMES) expect(AI_OUTCOME_TONE[o]).toBeTruthy();
  });

  it('separates our faults from the world’s', () => {
    // A dealer sending a photo is not a fault; a lookup throwing is. Without the
    // split, a morning of `tool_error` hides inside a morning of attachments.
    expect(aiReasonTone('tool_error')).toBe('danger');
    expect(aiReasonTone('model_error')).toBe('danger');
    expect(aiReasonTone('attachment')).toBe('neutral');
    expect(aiReasonTone('asked_for_human')).toBe('neutral');
    expect(aiReasonTone(undefined)).toBe('neutral');
  });

  it('refuses to let the dispute window look routine', () => {
    expect(aiReasonTone('follow_up')).toBe('danger');
  });
});

describe('the label maps', () => {
  it('name every outcome, reason, intent and verdict', () => {
    // Exhaustive at compile time by construction; asserted at runtime too,
    // because a `Record` built against a stale copy of the union still compiles.
    // A screen printing `bad_router_output` at a person who has never read this
    // codebase is the failure being prevented.
    for (const o of AI_TURN_OUTCOMES) expect(AI_OUTCOME_LABEL[o]).toBeTruthy();
    for (const r of AI_HANDOFF_REASONS) expect(AI_HANDOFF_REASON_LABEL[r]).toBeTruthy();
    for (const i of AI_FIRSTLINE_INTENTS) expect(AI_INTENT_LABEL[i]).toBeTruthy();
    for (const v of AI_TURN_VERDICTS) expect(AI_VERDICT_LABEL[v]).toBeTruthy();
  });

  it('never prints a raw enum value at a person', () => {
    expect(Object.values(AI_HANDOFF_REASON_LABEL)).not.toContain('follow_up');
    expect(Object.values(AI_OUTCOME_LABEL)).not.toContain('HANDED_OFF');
  });

  it('keeps "stood down" and "overtaken" apart', () => {
    // The turn log exists to tell "we chose not to" from "we lost the race".
    // One word for both throws away the only distinction on the row.
    expect(AI_OUTCOME_LABEL.SUPPRESSED).not.toBe(AI_OUTCOME_LABEL.SUPERSEDED);
  });
});

/* ══════════════════════════ v2: the writer's surface ══════════════════════ */

/** A turn with only the fields the v2 rules read. */
function v2turn(
  extra: Partial<
    Pick<
      AiTurn,
      'outcome' | 'reason' | 'writer' | 'writerSkip' | 'writerProse' | 'fenceFailure'
    >
  > = {},
): Pick<
  AiTurn,
  'outcome' | 'writer' | 'writerSkip' | 'writerProse' | 'fenceFailure'
> {
  return { outcome: 'ANSWERED', ...extra };
}

/** A turn carrying only the guard block the thread rules read. */
function guarded(
  stage: 'input' | 'writer',
  action: 'handoff' | 'fallback' | 'advisory',
  rules: string[],
): Pick<AiTurn, 'guard'> {
  return { guard: { stage, action, rules, at: '2026-09-03T09:30:00.000Z' } };
}

describe('aiGuardMarkedThread', () => {
  it('counts a BLOCKING input hit and not an advisory one', () => {
    // It mirrors, exactly, the two places `run.ts` bumps the counter. An
    // advisory hit — `competitor` is the only one — is recorded and the turn
    // carries on, and it marks nothing.
    expect(aiGuardMarkedThread(guarded('input', 'handoff', ['injection']).guard)).toBe(
      true,
    );
    expect(
      aiGuardMarkedThread(guarded('input', 'advisory', ['competitor']).guard),
    ).toBe(false);
  });

  it('counts a fence refusal only when it is evidence of an ATTACK', () => {
    // A curious pump owner must not become a security observation because our
    // Hindi was stiff.
    expect(
      aiGuardMarkedThread(guarded('writer', 'fallback', ['echoed_figure']).guard),
    ).toBe(true);
    expect(
      aiGuardMarkedThread(guarded('writer', 'fallback', ['prompt_echo']).guard),
    ).toBe(true);
    expect(
      aiGuardMarkedThread(guarded('writer', 'fallback', ['over_length']).guard),
    ).toBe(false);
  });

  it('does not count the VENDOR declining as the dealer probing', () => {
    // A writer-stage guard whose only rule is `safety` is the model refusing on
    // its own terms. Nobody wrote anything to provoke it.
    expect(aiGuardMarkedThread(guarded('writer', 'fallback', ['safety']).guard)).toBe(
      false,
    );
  });

  it('is false on the overwhelming majority of turns', () => {
    expect(aiGuardMarkedThread(undefined)).toBe(false);
    expect(aiGuardMarkedThread(null)).toBe(false);
  });
});

describe('aiThreadGuard', () => {
  it('says nothing on a thread nobody has probed', () => {
    expect(aiThreadGuard([])).toBeNull();
    expect(aiThreadGuard(undefined)).toBeNull();
    expect(aiThreadGuard([guarded('input', 'advisory', ['competitor'])])).toBeNull();
  });

  it('takes the MOST RECENT marking turn, the list being newest first', () => {
    const view = aiThreadGuard([
      guarded('writer', 'fallback', ['echoed_figure']),
      guarded('input', 'handoff', ['injection']),
    ]);
    expect(view?.stage).toBe('writer');
    expect(view?.rules).toEqual(['echoed_figure']);
  });

  it('skips unmarked turns to reach a marked one', () => {
    const view = aiThreadGuard([
      { guard: undefined },
      guarded('input', 'handoff', ['injection', 'other-outlet']),
    ]);
    expect(view?.labels).toEqual([
      AI_GUARD_RULE_LABEL.injection,
      AI_GUARD_RULE_LABEL['other-outlet'],
    ]);
  });

  it('carries NO count on the label', () => {
    // It reads the handful of turns the strip fetches, so any number would be a
    // FLOOR and would disagree with the lens's badge, which counts the whole
    // thread. A screen whose job is being trusted about what the machine did
    // must not carry a figure that is quietly a lower bound.
    const view = aiThreadGuard([
      guarded('input', 'handoff', ['injection']),
      guarded('input', 'handoff', ['injection']),
      guarded('input', 'handoff', ['injection']),
    ]);
    expect(view?.label).toBe('AI guard');
    expect(view?.label).not.toMatch(/\d/);
  });

  it('says in the hint that replying does NOT clear it', () => {
    // The whole reason the mark lives on `ai.abuse` and not on
    // `Conversation.flagged`: `flagged` is cleared by any admin reply, so a
    // security observation stored there would be erased by answering the dealer.
    const view = aiThreadGuard([guarded('input', 'handoff', ['injection'])]);
    expect(view?.hint).toMatch(/replying does not/i);
    expect(view?.hint).toContain('super-admin');
  });

  it('names the rules in words and never in enum spelling', () => {
    const view = aiThreadGuard([guarded('input', 'handoff', ['other-outlet'])]);
    expect(view?.labels).not.toContain('other-outlet');
    expect(view?.labels[0]).toBe(AI_GUARD_RULE_LABEL['other-outlet']);
  });
});

describe('aiProduction', () => {
  it('separates a written answer from a fixed sentence', () => {
    // THE COLUMN v2 IS SUPERVISED THROUGH. Under v1 there was one answer to
    // "where did that sentence come from"; there are now four, they carry
    // different risk, and the row must say which without being opened.
    expect(aiProduction(v2turn({ writer: 'prose' }))?.kind).toBe('written');
    expect(aiProduction(v2turn({ writer: 'fallback' }))?.kind).toBe('template');
    expect(aiProduction(v2turn({ writer: 'skipped' }))?.kind).toBe('template');
    expect(aiProduction(v2turn({ writer: 'off' }))?.kind).toBe('template');
  });

  it('marks the refused row, and only that row', () => {
    // The one flag the whole review queue is sorted by: a model composed
    // something and we declined to send it.
    expect(aiProduction(v2turn({ writer: 'fallback' }))?.refused).toBe(true);
    expect(aiProduction(v2turn({ writer: 'prose' }))?.refused).toBe(false);
    expect(aiProduction(v2turn({ writer: 'skipped' }))?.refused).toBe(false);
  });

  it('reads a handoff as a handoff whatever the writer did', () => {
    // On the `no_intent` path the writer ran, said the facts do not answer the
    // question, and its draft was kept. What the DEALER got was the warm line
    // and a person, so that is what the mark says — while `refused` stays true,
    // because the drafted sentence is still worth reading.
    const view = aiProduction(
      v2turn({ outcome: 'HANDED_OFF', reason: 'no_intent', writer: 'fallback' }),
    );
    expect(view?.kind).toBe('handoff');
    expect(view?.refused).toBe(true);
  });

  it('reads a rehearsal exactly like a live answer, and says so', () => {
    // The question here is how the sentence was MADE, and a rehearsal makes it
    // the same way. That nothing reached a dealer is the outcome badge's job —
    // but the hint carries it too, because the two are read together.
    const view = aiProduction(v2turn({ outcome: 'SHADOW', writer: 'prose' }));
    expect(view?.kind).toBe('written');
    expect(view?.hint).toMatch(/rehearsal/i);
  });

  it('does not claim anything was produced when nothing was', () => {
    expect(aiProduction(v2turn({ outcome: 'SUPPRESSED' }))?.kind).toBe('silent');
    expect(aiProduction(v2turn({ outcome: 'SUPERSEDED' }))?.kind).toBe('silent');
    expect(aiProduction(undefined)).toBeNull();
  });

  it('names a row from before the writer existed rather than guessing', () => {
    // A month of production rows carry no `writer` field at all. "Template" with
    // no qualifier would read as a decision somebody made today.
    const view = aiProduction(v2turn({}));
    expect(view?.kind).toBe('template');
    expect(view?.label).toBe('Fixed sentence');
  });

  it('gives every kind its own words, so colour is never the only signal', () => {
    // `handoff` and a refused template share amber deliberately — they are the
    // two rows worth a second look — so the WORDS have to carry the difference.
    const labels = [
      aiProduction(v2turn({ writer: 'prose' }))!.label,
      aiProduction(v2turn({ writer: 'fallback' }))!.label,
      aiProduction(v2turn({ writer: 'skipped' }))!.label,
      aiProduction(v2turn({ outcome: 'HANDED_OFF' }))!.label,
      aiProduction(v2turn({ outcome: 'SUPPRESSED' }))!.label,
    ];
    expect(new Set(labels).size).toBe(5);
  });

  it('explains a skip in words, because a silent degrade looks like success', () => {
    // A writer that times out on every turn produces a perfect-looking service:
    // every dealer gets a correct template and nobody complains.
    const view = aiProduction(v2turn({ writer: 'skipped', writerSkip: 'deadline' }));
    expect(view?.hint).toContain(AI_WRITER_SKIP_LABEL.deadline);
  });
});

describe('aiRefusal', () => {
  const prose = 'Aapke pump ka variation 19,410.62 L raha.';

  it('is null on every turn where the writer was not refused', () => {
    expect(aiRefusal(v2turn({ writer: 'prose' }))).toBeNull();
    expect(aiRefusal(v2turn({ writer: 'off' }))).toBeNull();
    expect(aiRefusal(undefined)).toBeNull();
  });

  it('hands back the sentence and the rules that stopped it', () => {
    // THE SINGLE MOST VALUABLE THING ON THE REVIEW SCREEN: it is the only
    // evidence that says whether a refusal was right, and it exists nowhere
    // else — the dealer never saw the text and it was never posted.
    const view = aiRefusal(
      v2turn({
        writer: 'fallback',
        writerProse: prose,
        fenceFailure: ['unsourced_number', 'unit_not_sourced'],
      }),
    );
    expect(view?.prose).toBe(prose);
    expect(view?.rules).toEqual(['unsourced_number', 'unit_not_sourced']);
    expect(view?.labels[0]).toBe(AI_FENCE_RULE_LABEL.unsourced_number);
  });

  it('keeps the fence’s own order, so the worst thing found leads the row', () => {
    const view = aiRefusal(
      v2turn({
        writer: 'fallback',
        writerProse: prose,
        fenceFailure: ['prompt_echo', 'unsourced_number'],
      }),
    );
    expect(view?.labels[0]).toBe(AI_FENCE_RULE_LABEL.prompt_echo);
  });

  it('separates an ATTACK from our own writer being clumsy', () => {
    // The mirror of the fence's `flag`, and it must stay these two rules. A
    // curious pump owner must not become a security observation because our
    // Hindi was stiff.
    expect(
      aiRefusal(v2turn({ writer: 'fallback', fenceFailure: ['echoed_figure'] }))?.attack,
    ).toBe(true);
    expect(
      aiRefusal(v2turn({ writer: 'fallback', fenceFailure: ['prompt_echo'] }))?.attack,
    ).toBe(true);
    expect(
      aiRefusal(v2turn({ writer: 'fallback', fenceFailure: ['over_length'] }))?.attack,
    ).toBe(false);
    expect(
      aiRefusal(v2turn({ writer: 'fallback', fenceFailure: ['forbidden_subject'] }))
        ?.attack,
    ).toBe(false);
  });

  it('never claims the dealer read the template when nothing was posted', () => {
    // A rehearsal turn and one that lost the race to a human reply both post
    // NOTHING, so the fallback was composed and thrown away with everything
    // else. Saying "the dealer read the hand-written line instead" there is the
    // same class of untruth this whole screen exists to catch.
    const answered = aiRefusal(
      v2turn({ outcome: 'ANSWERED', writer: 'fallback', fenceFailure: ['iso_date'] }),
    );
    const shadow = aiRefusal(
      v2turn({ outcome: 'SHADOW', writer: 'fallback', fenceFailure: ['iso_date'] }),
    );
    expect(answered!.headline).toMatch(/the dealer read the hand-written line/i);
    expect(shadow!.headline).not.toMatch(/the dealer read/i);
    expect(shadow!.headline).toMatch(/nothing was posted/i);
  });

  it('tells the three fallbacks apart, because the fix for each is different', () => {
    const fenced = aiRefusal(
      v2turn({ writer: 'fallback', writerProse: prose, fenceFailure: ['iso_date'] }),
    );
    const mislabelled = aiRefusal(
      v2turn({ outcome: 'HANDED_OFF', writer: 'fallback', writerProse: prose }),
    );
    const nothing = aiRefusal(v2turn({ writer: 'fallback' }));
    expect(fenced!.headline).toMatch(/fence refused/i);
    expect(mislabelled!.headline).toMatch(/do not answer the question/i);
    expect(nothing!.headline).toMatch(/nothing we could use/i);
    expect(new Set([fenced!.headline, mislabelled!.headline, nothing!.headline]).size).toBe(3);
  });

  it('still returns a view when there is no sentence to read', () => {
    // A row marked "prose refused" with nothing under it looks like a broken
    // screen. A row that says the writer returned nothing usable is a FACT, and
    // that absence is itself the finding.
    const view = aiRefusal(v2turn({ writer: 'fallback' }));
    expect(view).not.toBeNull();
    expect(view?.prose).toBeNull();
    expect(view?.rules).toEqual([]);
  });
});

describe('the rule vocabulary', () => {
  it('names every fence rule and every guard rule', () => {
    for (const r of AI_FENCE_RULES) {
      expect(AI_FENCE_RULE_LABEL[r]).toBeTruthy();
      expect(AI_FENCE_RULE_HINT[r]).toBeTruthy();
    }
    for (const r of AI_GUARD_RULES) expect(AI_GUARD_RULE_LABEL[r]).toBeTruthy();
  });

  it('never prints a raw rule name at a person', () => {
    for (const r of AI_FENCE_RULES) expect(aiRuleLabel(r)).not.toBe(r);
    for (const r of AI_GUARD_RULES) expect(aiRuleLabel(r)).not.toBe(r);
  });

  it('reads a rule this build has never heard of, rather than going blank', () => {
    // The maps mirror unions that live in the backend, and the admin deploys
    // separately from it. A blank pill on the guard's own evidence reads as the
    // guard having recorded nothing at all.
    expect(aiRuleLabel('unsourced_quantity')).toBe('Unsourced quantity');
    expect(aiRuleLabel('brand-new-rule')).toBe('Brand new rule');
    expect(aiRuleLabel('')).toBe('');
  });

  it('carries the long form only where there is one to carry', () => {
    expect(aiRuleHint('unsourced_number')).toBeTruthy();
    expect(aiRuleHint('made-up')).toBeUndefined();
  });

  it('flags exactly the two rules the fence flags and no others', () => {
    const flagged = AI_FENCE_RULES.filter((r) => aiRuleIsAttack(r));
    expect(flagged).toEqual(['prompt_echo', 'echoed_figure']);
  });
});

describe('aiToolLabel', () => {
  it('says what each lookup asked, not its id', () => {
    expect(aiToolLabel('documents_open')).toBe('Papers open, both ways');
    expect(aiToolLabel('dsr_status')).not.toBe('dsr_status');
  });

  it('reads a lookup this build has never heard of', () => {
    expect(aiToolLabel('dsr_recent_days')).toBe('Dsr recent days');
  });
});

describe('aiPlanAsks', () => {
  it('keeps each ask’s scalars on THAT ask', () => {
    // The reason the scalars are per-ask at all. "22 tarikh ka DSR bhejo aur
    // aaj ki density batao" carries two different days; one flattened "Day" for
    // the turn would show a reviewer a date the density lookup never read.
    const asks = aiPlanAsks({
      lang: 'hi',
      asks: [
        { intent: 'dsr_for_date', date: '2026-08-22' },
        { intent: 'density_today' },
      ],
    });
    expect(asks).toHaveLength(2);
    expect(asks[0]!.scalars).toEqual([{ label: 'Day', value: '2026-08-22' }]);
    expect(asks[1]!.scalars).toEqual([]);
  });

  it('marks the primary ask, because the reply leads with it', () => {
    const asks = aiPlanAsks({
      lang: 'en',
      asks: [{ intent: 'todo' }, { intent: 'dsr_status' }],
    });
    expect(asks[0]!.primary).toBe(true);
    expect(asks[1]!.primary).toBe(false);
  });

  it('prints nothing for a field the model never filled', () => {
    // An omitted date is not "no date", it is a question that never named one.
    // "Day: —" invites the reader to think the machine failed to find something
    // it never looked for.
    const [ask] = aiPlanAsks({ lang: 'en', asks: [{ intent: 'greeting' }] });
    expect(ask!.summary).toBe(AI_INTENT_LABEL.greeting);
  });

  it('labels a person name as a LOOKUP KEY', () => {
    const [ask] = aiPlanAsks({
      lang: 'en',
      asks: [{ intent: 'staff_person', personName: 'Ramesh' }],
    });
    expect(ask!.scalars[0]!.label).toMatch(/looked up/i);
  });

  it('is empty rather than throwing when the model never ran', () => {
    expect(aiPlanAsks(undefined)).toEqual([]);
    expect(aiPlanAsks(null)).toEqual([]);
  });
});

describe('aiProseRate', () => {
  it('says nothing at all when nothing was answered', () => {
    // A percentage of nothing is a lie, and an idle Sunday must not read as a
    // broken writer.
    expect(aiProseRate({ prose: 3 }, 0)).toBeNull();
  });

  it('calls a healthy day healthy', () => {
    const view = aiProseRate({ prose: 8, fallback: 2 }, 10);
    expect(view?.percent).toBe(80);
    expect(view?.tone).toBe('success');
  });

  it('warns below 70% — the line where NOTHING HAS CHANGED', () => {
    // Dealers are still reading v1's fixed sentences and we are paying for a
    // writer whose output is thrown away.
    const view = aiProseRate({ prose: 4, fallback: 6 }, 10);
    expect(view?.percent).toBe(40);
    expect(view?.tone).toBe('warning');
    expect(view?.sentence).toMatch(/never a looser fence/i);
  });

  it('does not nag on a deliberate templates-only day', () => {
    // The middle notch, or a box with the env flag down. That is not a bad
    // rate, it is the v1 product running on purpose.
    const view = aiProseRate({ off: 12 }, 12);
    expect(view?.tone).toBe('neutral');
    expect(view?.sentence).toMatch(/did not run/i);
  });

  it('never prints more than 100%', () => {
    // A SHADOW turn carries `writer: 'prose'` and is NOT an ANSWERED turn, so
    // during a rehearsal week the numerator legitimately runs ahead of the
    // denominator. "112%" on a safety screen destroys trust in every other
    // figure on it.
    expect(aiProseRate({ prose: 30 }, 10)?.percent).toBe(100);
  });

  it('counts a disposition it has never heard of into the denominator', () => {
    const split = aiWriterSplit({ prose: 2, something_new: 3 });
    expect(split.prose).toBe(2);
    expect(split.total).toBe(5);
  });
});

describe('the v2 label maps', () => {
  it('name every writer disposition and every skip', () => {
    for (const d of AI_WRITER_DISPOSITIONS) expect(AI_WRITER_LABEL[d]).toBeTruthy();
    for (const s of AI_WRITER_SKIPS) expect(AI_WRITER_SKIP_LABEL[s]).toBeTruthy();
    for (const l of AI_FIRSTLINE_LANGS) expect(AI_LANG_LABEL[l]).toBeTruthy();
  });

  it('keeps the three ways the writer is OFF apart', () => {
    // A PERSON pressed the middle notch, we RAN OUT OF MONEY, or THE MACHINE
    // TURNED ITS OWN PROSE OFF are a decision, a forecast that was wrong, and a
    // fault. They are not the same conversation.
    const three = [
      AI_WRITER_SKIP_LABEL.switch_off,
      AI_WRITER_SKIP_LABEL.writer_budget,
      AI_WRITER_SKIP_LABEL.fallback_breaker,
    ];
    expect(new Set(three).size).toBe(3);
  });

  it('does not let POORLY_WORDED read like WRONG', () => {
    // Only `WRONG` trips the breaker. A reviewer who reaches for it because the
    // Hindi was stiff has spent one of three lives on a sentence that was true.
    expect(AI_VERDICT_LABEL.POORLY_WORDED).not.toBe(AI_VERDICT_LABEL.WRONG);
    expect(AI_VERDICT_LABEL.POORLY_WORDED).toMatch(/facts were right/i);
  });
});
