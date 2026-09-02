import { describe, expect, it } from 'vitest';

import {
  AI_FIRSTLINE_INTENTS,
  AI_HANDOFF_REASONS,
  AI_HANDOFF_REASON_LABEL,
  AI_INTENT_LABEL,
  AI_OUTCOME_LABEL,
  AI_OUTCOME_TONE,
  AI_TURN_OUTCOMES,
  AI_TURN_VERDICTS,
  AI_VERDICT_LABEL,
  aiCostLabel,
  aiInboxChip,
  aiReasonTone,
  aiTouchedThread,
  aiTurnAge,
  aiWithheldAnswer,
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
  return { state, streak: 0, ...extra };
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
