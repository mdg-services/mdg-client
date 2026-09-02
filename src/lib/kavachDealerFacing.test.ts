import { describe, expect, it } from 'vitest';

import { kavachScoreIsPublishable } from '@dk/shared';

/**
 * The one rule that decides whether MDG's Kavach figure may be shown to the
 * dealer it is about, exercised from here because `shared` has no test runner of
 * its own and `mdg-admin` has no `test` script at all — the same reason
 * `documentAsk.test.ts` lives beside this file.
 *
 * This rule is worth a test more than most. It used to be a `useMemo` inside
 * `KavachPage.tsx` and nothing else, so `GET /kavach/me` handed the percentage
 * to anything that asked and one React component was the entire gate. It now
 * runs in three places, and a rule that is replicated is a rule that drifts. A
 * test is at least something somebody has to delete on purpose.
 */

/** A programme whose figure MDG has stood behind: switched on, scored, settled. */
const PUBLISHED = {
  dealerFacingEnabled: true,
  settlingUntil: '2026-01-01T00:00:00.000Z',
  score: { scored: true },
};

/** Well after `PUBLISHED.settlingUntil`. */
const NOW = Date.parse('2026-09-02T06:00:00.000Z');

describe('kavachScoreIsPublishable', () => {
  it('publishes when all three conditions hold', () => {
    expect(kavachScoreIsPublishable(PUBLISHED, NOW)).toBe(true);
  });

  it('withholds until an admin switches dealer-facing messages on', () => {
    expect(kavachScoreIsPublishable({ ...PUBLISHED, dealerFacingEnabled: false }, NOW)).toBe(false);
  });

  it('treats a MISSING switch as off, not as on', () => {
    // The page it was extracted from tested `=== false`, so an absent flag read
    // as enabled. Safe there — `programmeToPublic` coerces the field with
    // `Boolean(...)`, so a live payload always carries one — but the rule now
    // runs server-side and against hand-built objects, where "nobody has turned
    // this on" is the only honest reading of a missing switch.
    const { dealerFacingEnabled: _omitted, ...noSwitch } = PUBLISHED;
    expect(kavachScoreIsPublishable(noSwitch, NOW)).toBe(false);
  });

  it('withholds when nothing has been verified, because there is no denominator', () => {
    expect(kavachScoreIsPublishable({ ...PUBLISHED, score: { scored: false } }, NOW)).toBe(false);
  });

  it('withholds while the settling-in grace is still running', () => {
    const settlingUntil = new Date(NOW + 60_000).toISOString();
    expect(kavachScoreIsPublishable({ ...PUBLISHED, settlingUntil }, NOW)).toBe(false);
  });

  it('publishes on the instant the grace elapses, not a moment later', () => {
    const settlingUntil = new Date(NOW).toISOString();
    expect(kavachScoreIsPublishable({ ...PUBLISHED, settlingUntil }, NOW)).toBe(true);
  });

  it('publishes when there is no settling-in grace at all', () => {
    const { settlingUntil: _omitted, ...noGrace } = PUBLISHED;
    expect(kavachScoreIsPublishable(noGrace, NOW)).toBe(true);
  });

  it('withholds when the grace date cannot be read', () => {
    // "We no longer know when the grace ends" is not a licence to publish.
    expect(kavachScoreIsPublishable({ ...PUBLISHED, settlingUntil: 'not a date' }, NOW)).toBe(false);
  });

  it('falls back to the real clock when no time is passed', () => {
    // `PUBLISHED` settled in January 2026, so this is true whenever it runs.
    expect(kavachScoreIsPublishable(PUBLISHED)).toBe(true);
  });
});
