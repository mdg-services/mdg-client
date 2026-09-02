import { describe, expect, it } from 'vitest';

import {
  AI_FIRSTLINE_INTENTS,
  AI_HANDOFF_REASONS,
  DEALER_FIRSTLINE_MODE_DEFAULT,
  aiVerdictTripsBreaker,
} from '@dk/shared';
import { aiPlanSchema } from '@dk/shared/schemas';

/**
 * The contract for the AI first line on dealer support, exercised from here for
 * the usual reason: `shared` has no test runner and `mdg-admin` has no `test`
 * script at all.
 *
 * Almost everything in that contract is a type and disappears at build time.
 * What survives to runtime is this schema and one predicate, and both of them
 * are load-bearing in a way that fails SILENTLY if they stop working — a plan
 * that accepts a stray field would let a sentence the model composed travel one
 * step further towards a dealer, and a breaker that counts the wrong verdicts
 * switches the feature off in the week it is being reviewed most carefully.
 */

/** The smallest plan the model may return: a label and a language, nothing else. */
const MINIMAL = { intent: 'dsr_status', lang: 'hi' };

describe('aiPlanSchema', () => {
  it('accepts a bare label and language', () => {
    expect(aiPlanSchema.parse(MINIMAL)).toEqual(MINIMAL);
  });

  it('REFUSES a plan carrying any extra field', () => {
    // The whole safety property in one assertion. Zod's default is to strip an
    // unknown key silently, which would make a model that started writing
    // prose invisible rather than fatal; `.strict()` turns it into a rejected
    // plan, and a rejected plan is a `bad_router_output` handoff to a person.
    const result = aiPlanSchema.safeParse({
      ...MINIMAL,
      answer: 'Sir, your DSR for today is ready.',
    });
    expect(result.success).toBe(false);
  });

  it('refuses a label that is not on the list', () => {
    expect(aiPlanSchema.safeParse({ intent: 'refund_status', lang: 'en' }).success).toBe(false);
  });

  it('refuses a language the dealer app does not speak', () => {
    expect(aiPlanSchema.safeParse({ ...MINIMAL, lang: 'ta' }).success).toBe(false);
  });

  it('accepts an IST calendar day and month, and refuses anything else', () => {
    expect(aiPlanSchema.safeParse({ ...MINIMAL, date: '2026-08-22' }).success).toBe(true);
    expect(aiPlanSchema.safeParse({ ...MINIMAL, month: '2026-08' }).success).toBe(true);
    // A day is a string in IST, never an instant: accepting a timestamp is how a
    // UTC boundary moves a business day.
    expect(aiPlanSchema.safeParse({ ...MINIMAL, date: '2026-08-22T00:00:00Z' }).success).toBe(
      false,
    );
    expect(aiPlanSchema.safeParse({ ...MINIMAL, date: '22-08-2026' }).success).toBe(false);
  });

  it('accepts a name in either script', () => {
    expect(aiPlanSchema.safeParse({ ...MINIMAL, personName: 'Ramesh Kumar' }).success).toBe(true);
    expect(aiPlanSchema.safeParse({ ...MINIMAL, personName: 'रमेश' }).success).toBe(true);
  });

  it('refuses a "name" that is really a sentence', () => {
    // `personName` is the one string on the plan. It is a lookup key matched
    // against the dealer's own employee list and never echoed back, but a value
    // shaped like prose is evidence the model is trying to write, and the right
    // answer to that is to fail the plan.
    expect(
      aiPlanSchema.safeParse({
        ...MINIMAL,
        personName: 'Ramesh, who was on the night shift, has 42 points this month.',
      }).success,
    ).toBe(false);
  });

  it('refuses a grade it does not have a product key for', () => {
    expect(aiPlanSchema.safeParse({ ...MINIMAL, productHint: 'HSD' }).success).toBe(true);
    expect(aiPlanSchema.safeParse({ ...MINIMAL, productHint: 'kerosene' }).success).toBe(false);
  });
});

describe('aiVerdictTripsBreaker', () => {
  it('counts WRONG', () => {
    expect(aiVerdictTripsBreaker('WRONG')).toBe(true);
  });

  it('does NOT count "should have handed off"', () => {
    // The figures were right and traceable; the machine simply should have
    // stayed quiet. Counting these would make the breaker fire hardest in the
    // week the team reviews most carefully, and switch the feature off for
    // being well supervised.
    expect(aiVerdictTripsBreaker('SHOULD_HAVE_HANDED_OFF')).toBe(false);
  });

  it('does not count a right answer, or an unreviewed turn', () => {
    expect(aiVerdictTripsBreaker('RIGHT')).toBe(false);
    expect(aiVerdictTripsBreaker(undefined)).toBe(false);
  });
});

describe('the closed label sets', () => {
  it('always offer a way out', () => {
    // `other` is how the model gives up and `talk_to_human` is how the dealer
    // asks it to. Remove either and the machine has to answer everything.
    expect(AI_FIRSTLINE_INTENTS).toContain('other');
    expect(AI_FIRSTLINE_INTENTS).toContain('talk_to_human');
  });

  it('name the free handoff — the one that costs no model call', () => {
    expect(AI_HANDOFF_REASONS).toContain('follow_up');
  });

  it('leave the first line OFF until somebody turns it on', () => {
    // A default of ON would enrol every new dealer in being answered by a
    // machine without anyone having decided that about them.
    expect(DEALER_FIRSTLINE_MODE_DEFAULT).toBe('OFF');
  });
});
