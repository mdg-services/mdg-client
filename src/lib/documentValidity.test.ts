import { describe, expect, it } from 'vitest';

import {
  DEALER_PROFILE_EXPIRY_SOON_DAYS,
  DOCUMENT_REMINDER_OFFSETS_DEFAULT,
  addIsoMonths,
  compareDocumentValidityRows,
  daysBetweenIsoDays,
  dealerProfileExpiryState,
  documentDaysToExpiry,
  documentValidityLabel,
  documentValidityState,
  documentValidityTally,
  expiryState,
  isIsoDay,
  nextDocumentReminder,
  formatReminderLadder,
  normaliseReminderOffsets,
  parseReminderLadder,
  renewalPeriodKey,
  sameReminderLadder,
  renewalSlug,
  resolveReminderOffsets,
  settledReminderOffsets,
  shiftIsoDay,
  shouldOpenRenewalAsk,
  validitySoonDays,
  type ExpiryState,
} from '@dk/shared';

/**
 * The pure half of document validity, exercised from here for the reason
 * `documentAsk.test.ts` already gives: `shared` has no test runner of its own
 * and `mdg-admin` has no `test` script at all, so the dealer app's vitest is the
 * only one that can reach decidable logic living in `shared`.
 *
 * THESE ARE THE FUNCTIONS WORTH THE FILE. Between them they decide whether a
 * dealer is told their certificate is running out — and the two failure modes
 * are silent in opposite directions. Fire nothing and a Fire NOC lapses with
 * nobody warned. Fire everything and four notifications about one certificate
 * land on a phone in one minute, which is how a person learns to swipe us away
 * unread.
 *
 * Every date here is an IST calendar day, and every function takes "today" as an
 * argument rather than reading a clock, so none of these assertions go stale.
 */

/** The day this file pretends it is. */
const TODAY = '2026-09-08';

describe('isoDays', () => {
  it('counts whole days, zero on the day, negative after', () => {
    expect(daysBetweenIsoDays(TODAY, '2026-09-16')).toBe(8);
    expect(daysBetweenIsoDays(TODAY, TODAY)).toBe(0);
    expect(daysBetweenIsoDays(TODAY, '2026-09-06')).toBe(-2);
  });

  it('crosses a month, a year end and a leap day without drifting', () => {
    expect(daysBetweenIsoDays('2026-09-30', '2026-10-01')).toBe(1);
    expect(daysBetweenIsoDays('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetweenIsoDays('2028-02-28', '2028-03-01')).toBe(2);
  });

  /**
   * NaN, not 0 and not Infinity. `shared/src/data/festivals.ts` has a
   * `daysBetween` that returns 0 for an unreadable date; a reminder built on
   * that would read "expires today" and fire every step at once.
   */
  it('returns NaN for a date it cannot read, so a caller can refuse to judge', () => {
    expect(Number.isNaN(daysBetweenIsoDays(TODAY, 'not-a-date'))).toBe(true);
    expect(Number.isNaN(daysBetweenIsoDays('rubbish', TODAY))).toBe(true);
    // The dangerous one: parseable, but not a day that exists.
    expect(Number.isNaN(daysBetweenIsoDays(TODAY, '2026-02-30'))).toBe(true);
  });

  it('shifts a day in both directions', () => {
    expect(shiftIsoDay('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftIsoDay('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftIsoDay('nope', 1)).toBe('nope');
  });

  /**
   * CALENDAR MONTHS, CLAMPED. `setUTCMonth` alone rolls 31 January plus one
   * month into 3 March, which would prefill a licence's expiry with a date three
   * days past the one on the paper.
   */
  it('adds calendar months and clamps a short month rather than rolling', () => {
    expect(addIsoMonths('2026-11-30', 3)).toBe('2027-02-28');
    expect(addIsoMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addIsoMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addIsoMonths('2026-09-08', 12)).toBe('2027-09-08');
  });

  it('refuses a day that does not exist', () => {
    expect(isIsoDay('2026-09-08')).toBe(true);
    expect(isIsoDay('2026-02-30')).toBe(false);
    expect(isIsoDay('2026-9-8')).toBe(false);
    expect(isIsoDay(20260908)).toBe(false);
  });
});

describe('expiryState — one verdict, two thresholds', () => {
  it('fails CLOSED on a date nobody can read', () => {
    expect(expiryState('garbage', TODAY, 15)).toBeUndefined();
    expect(expiryState(undefined, TODAY, 15)).toBeUndefined();
  });

  it('moves the amber boundary with the threshold it is given', () => {
    expect(expiryState('2026-09-23', TODAY, 15)).toBe('expiring'); // 15 days
    expect(expiryState('2026-09-24', TODAY, 15)).toBe('valid'); // 16 days
    expect(expiryState('2026-09-24', TODAY, 60)).toBe('expiring'); // the profile's threshold
  });

  /** The profile keeps its sixty days; only the plumbing underneath changed. */
  it('leaves the outlet profile behaving exactly as it did', () => {
    expect(DEALER_PROFILE_EXPIRY_SOON_DAYS).toBe(60);
    expect(dealerProfileExpiryState('2026-11-01', TODAY)).toBe('expiring'); // 54 days
    expect(dealerProfileExpiryState('2026-12-01', TODAY)).toBe('valid'); // 84 days
    expect(dealerProfileExpiryState('2026-09-07', TODAY)).toBe('expired');
    expect(dealerProfileExpiryState('garbage', TODAY)).toBeUndefined();
  });
});

describe('normaliseReminderOffsets', () => {
  it('sorts descending, dedupes and drops rubbish', () => {
    expect(normaliseReminderOffsets([1, 15, 3, 15, 2])).toEqual([15, 3, 2, 1]);
    expect(normaliseReminderOffsets([3, 'x', 2.5, 1])).toEqual([3, 1]);
  });

  it('keeps 0 — a reminder on the expiry day itself is a real setting', () => {
    expect(normaliseReminderOffsets([3, 0])).toEqual([3, 0]);
  });

  it('rejects negatives and anything past a year', () => {
    expect(normaliseReminderOffsets([-1, 400, 366, 365])).toEqual([365]);
  });

  it('caps the ladder so nobody can train an estate to ignore us', () => {
    const twelve = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
    expect(normaliseReminderOffsets(twelve)).toHaveLength(8);
    expect(normaliseReminderOffsets(twelve)[0]).toBe(12);
  });

  it('is total — rubbish in gives the empty ladder, never a throw', () => {
    expect(normaliseReminderOffsets(undefined)).toEqual([]);
    expect(normaliseReminderOffsets('15,3,2,1')).toEqual([]);
  });

  /**
   * `Number(null)` is 0, which is a LEGAL step meaning "remind on the expiry day
   * itself". A stray null in a stored array would silently add a notification
   * nobody configured, on the worst possible morning.
   */
  it('does not turn null, empty string or false into a step on the day', () => {
    expect(normaliseReminderOffsets([3, null, 1])).toEqual([3, 1]);
    expect(normaliseReminderOffsets([3, '', 1])).toEqual([3, 1]);
    expect(normaliseReminderOffsets([3, false, [], 1])).toEqual([3, 1]);
    expect(normaliseReminderOffsets(['15', '3'])).toEqual([15, 3]);
  });
});

describe('resolveReminderOffsets', () => {
  it('prefers the ask over the kind, and the kind over the shipped ladder', () => {
    expect(resolveReminderOffsets([7], [30])).toEqual([7]);
    expect(resolveReminderOffsets(undefined, [30])).toEqual([30]);
    expect(resolveReminderOffsets(undefined, undefined)).toEqual([
      ...DOCUMENT_REMINDER_OFFSETS_DEFAULT,
    ]);
  });

  /**
   * The distinction the `undefined` check exists for. An admin who empties the
   * box for ONE certificate — because the dealer has already said it is being
   * replaced — must not silently fall back to the kind's ladder.
   */
  it('treats an empty override as "never remind about this one", not as absent', () => {
    expect(resolveReminderOffsets([], [15, 3])).toEqual([]);
  });

  /**
   * The row already in production. The seeder writes new catalog columns under
   * `$setOnInsert`, which never reaches an existing row, so a kind seeded before
   * this release carries `undefined` — and must still get the shipped ladder.
   */
  it('gives a pre-existing catalog row the shipped ladder rather than none', () => {
    expect(resolveReminderOffsets(undefined, undefined)).toEqual([15, 3, 2, 1]);
  });
});

describe('documentValidityState — the badge and the push agree by construction', () => {
  const cadence = [15, 3, 2, 1];

  it('has no verdict for a paper that does not run out', () => {
    expect(documentValidityState({ today: TODAY, cadence })).toBeUndefined();
  });

  it('turns amber exactly on the day the first reminder is due', () => {
    expect(documentValidityState({ validUntil: '2026-09-24', today: TODAY, cadence })).toBe(
      'valid',
    ); // 16 days — one day early
    expect(documentValidityState({ validUntil: '2026-09-23', today: TODAY, cadence })).toBe(
      'expiring',
    ); // 15 days — the first step
  });

  it('follows a longer ladder rather than the shipped one', () => {
    expect(
      documentValidityState({ validUntil: '2026-11-01', today: TODAY, cadence: [60, 30] }),
    ).toBe('expiring');
    expect(validitySoonDays([60, 30, 15])).toBe(60);
  });

  it('is expired the day after, and still expiring on the day itself', () => {
    expect(documentValidityState({ validUntil: TODAY, today: TODAY, cadence })).toBe('expiring');
    expect(documentValidityState({ validUntil: '2026-09-07', today: TODAY, cadence })).toBe(
      'expired',
    );
  });

  /** An empty ladder has nothing to turn amber on. That is the honest rendering. */
  it('reads valid right up to the day when reminders are switched off', () => {
    expect(documentValidityState({ validUntil: '2026-09-09', today: TODAY, cadence: [] })).toBe(
      'valid',
    );
    expect(validitySoonDays([])).toBe(0);
  });

  /**
   * `Date.parse('2026-02-30')` ROLLS TO 2 MARCH. Left unguarded, a certificate
   * stored with an impossible date comes back with a confident `expired` — a
   * verdict computed against a day that never existed. No verdict beats a wrong
   * one, in either direction.
   */
  it('gives NO verdict for a stored date that is not a real day', () => {
    expect(
      documentValidityState({ validUntil: '2026-02-30', today: TODAY, cadence }),
    ).toBeUndefined();
    expect(documentValidityState({ validUntil: 'soon', today: TODAY, cadence })).toBeUndefined();
    expect(documentDaysToExpiry('2026-02-30', TODAY)).toBeNull();
  });

  it('counts the days behind the verdict', () => {
    expect(documentDaysToExpiry('2026-09-16', TODAY)).toBe(8);
    expect(documentDaysToExpiry('2026-09-06', TODAY)).toBe(-2);
    expect(documentDaysToExpiry(undefined, TODAY)).toBeNull();
    expect(documentDaysToExpiry('rubbish', TODAY)).toBeNull();
  });
});

describe('documentValidityLabel', () => {
  it('never prints a raw date, in either language', () => {
    expect(documentValidityLabel(8, 'en')).toBe('8 days left');
    expect(documentValidityLabel(1, 'en')).toBe('1 day left');
    expect(documentValidityLabel(0, 'en')).toBe('Expires today');
    expect(documentValidityLabel(-1, 'en')).toBe('Expired 1 day ago');
    expect(documentValidityLabel(-4, 'en')).toBe('Expired 4 days ago');
    expect(documentValidityLabel(8, 'hi')).toBe('8 दिन बाकी');
    expect(documentValidityLabel(0, 'hi')).toBe('आज ख़त्म');
    expect(documentValidityLabel(-2, 'hi')).toBe('2 दिन पहले ख़त्म');
    expect(documentValidityLabel(null, 'hi')).toBe('—');
  });

  it('emits no ISO date for any input in a wide sweep', () => {
    for (let d = -400; d <= 400; d += 7) {
      for (const lang of ['en', 'hi'] as const) {
        expect(documentValidityLabel(d, lang)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
      }
    }
  });
});

describe('nextDocumentReminder', () => {
  const cadence = [15, 3, 2, 1];

  it('fires nothing while the first step is still ahead', () => {
    expect(
      nextDocumentReminder({ cadence, fired: [], daysLeft: 20, lapsedNoticeSent: false }),
    ).toEqual({ fire: null, skip: [], lapsedNotice: false });
  });

  it('fires each step on its own day and never twice', () => {
    expect(
      nextDocumentReminder({ cadence, fired: [], daysLeft: 15, lapsedNoticeSent: false }).fire,
    ).toBe(15);
    expect(
      nextDocumentReminder({ cadence, fired: [15], daysLeft: 15, lapsedNoticeSent: false }).fire,
    ).toBeNull();
    expect(
      nextDocumentReminder({ cadence, fired: [15], daysLeft: 3, lapsedNoticeSent: false }).fire,
    ).toBe(3);
    expect(
      nextDocumentReminder({
        cadence,
        fired: [15, 3, 2],
        daysLeft: 1,
        lapsedNoticeSent: false,
      }).fire,
    ).toBe(1);
  });

  /**
   * THE OUTAGE CASE, and the whole reason this is a function rather than four
   * lines inside the sweep. The box was down through the fifteen-day mark and
   * comes back with ten days left: the step still fires, late, because the
   * dealer still needs telling — and the sentence says "10 days left", because
   * `daysLeft` and not the step is what it is built from.
   */
  it('fires a missed step late rather than dropping it', () => {
    expect(
      nextDocumentReminder({ cadence, fired: [], daysLeft: 10, lapsedNoticeSent: false }),
    ).toEqual({ fire: 15, skip: [], lapsedNotice: false });
  });

  /**
   * THE PILE-UP. Down for a fortnight, back with one day left: three steps are
   * overdue at once. Exactly one notification goes out — the one closest to the
   * truth — and the other two are written off so they cannot fire tomorrow.
   */
  it('fires exactly one when several steps have piled up, and writes the rest off', () => {
    expect(
      nextDocumentReminder({ cadence, fired: [], daysLeft: 1, lapsedNoticeSent: false }),
    ).toEqual({ fire: 1, skip: [15, 3, 2], lapsedNotice: false });
  });

  it('fires the last step on the expiry day itself', () => {
    expect(
      nextDocumentReminder({ cadence, fired: [15, 3, 2], daysLeft: 0, lapsedNoticeSent: false }),
    ).toEqual({ fire: 1, skip: [], lapsedNotice: false });
  });

  /**
   * PAST THE DATE THE LADDER STOPS. Otherwise a dealer whose NOC ran out on
   * Friday is told "1 day left" on Saturday.
   */
  it('sends the lapsed notice instead of a step once the date has gone', () => {
    expect(
      nextDocumentReminder({ cadence, fired: [15], daysLeft: -1, lapsedNoticeSent: false }),
    ).toEqual({ fire: null, skip: [3, 2, 1], lapsedNotice: true });
  });

  it('sends the lapsed notice once, ever', () => {
    expect(
      nextDocumentReminder({
        cadence,
        fired: [15, 3, 2, 1],
        daysLeft: -9,
        lapsedNoticeSent: true,
      }),
    ).toEqual({ fire: null, skip: [], lapsedNotice: false });
  });

  /**
   * `fired` carries SENT AND SKIPPED steps together. Passing only the sent ones
   * makes every written-off step eligible again the next morning — the exact
   * loop the skip list exists to prevent.
   */
  it('treats a written-off step as settled, so it cannot come back tomorrow', () => {
    const first = nextDocumentReminder({
      cadence,
      fired: [],
      daysLeft: 1,
      lapsedNoticeSent: false,
    });
    const settled = [first.fire as number, ...first.skip];
    expect(
      nextDocumentReminder({ cadence, fired: settled, daysLeft: 1, lapsedNoticeSent: false }),
    ).toEqual({ fire: null, skip: [], lapsedNotice: false });
  });

  /**
   * COMPLETE SILENCE, INCLUDING THE LAPSED NOTICE. The lapsed notice does not
   * come off the ladder, so without the empty-cadence guard an admin who emptied
   * the box for one certificate would still get a push about it on the day it
   * ran out — and nobody would trust the setting enough to use it again.
   */
  it('does nothing at all when reminders are switched off for this paper', () => {
    expect(
      nextDocumentReminder({ cadence: [], fired: [], daysLeft: 0, lapsedNoticeSent: false }),
    ).toEqual({ fire: null, skip: [], lapsedNotice: false });
    expect(
      nextDocumentReminder({ cadence: [], fired: [], daysLeft: -9, lapsedNoticeSent: false }),
    ).toEqual({ fire: null, skip: [], lapsedNotice: false });
  });

  /**
   * THE WHOLE LADDER, DAY BY DAY, WITH NO OUTAGE. This is the assertion that
   * would catch a rewrite that fired twice on one day or skipped a step — the
   * per-day cases above each prove a point, this proves the sequence.
   */
  it('walks 20 days down to lapse and sends exactly five things', () => {
    const settled: number[] = [];
    let lapsedSent = false;
    const sent: { daysLeft: number; step: number | null; lapsed: boolean }[] = [];
    for (let daysLeft = 20; daysLeft >= -3; daysLeft -= 1) {
      const d = nextDocumentReminder({
        cadence,
        fired: settled,
        daysLeft,
        lapsedNoticeSent: lapsedSent,
      });
      if (d.fire !== null) settled.push(d.fire);
      settled.push(...d.skip);
      if (d.lapsedNotice) lapsedSent = true;
      if (d.fire !== null || d.lapsedNotice) {
        sent.push({ daysLeft, step: d.fire, lapsed: d.lapsedNotice });
      }
    }
    expect(sent).toEqual([
      { daysLeft: 15, step: 15, lapsed: false },
      { daysLeft: 3, step: 3, lapsed: false },
      { daysLeft: 2, step: 2, lapsed: false },
      { daysLeft: 1, step: 1, lapsed: false },
      { daysLeft: -1, step: null, lapsed: true },
    ]);
  });
});

describe('settledReminderOffsets', () => {
  it('reads back both outcomes, because both settle a step', () => {
    expect(
      settledReminderOffsets([
        { offsetDays: 15, at: '', outcome: 'sent', daysLeft: 10 },
        { offsetDays: 3, at: '', outcome: 'skipped', daysLeft: 1 },
      ]),
    ).toEqual([15, 3]);
    expect(settledReminderOffsets(undefined)).toEqual([]);
  });
});

describe('shouldOpenRenewalAsk — a condition, so a crashed pass self-heals', () => {
  const cadence = [15, 3, 2, 1];

  it('opens the slot on the morning the first reminder is due', () => {
    expect(shouldOpenRenewalAsk({ cadence, daysLeft: 16, kindAutoRenews: true })).toBe(false);
    expect(shouldOpenRenewalAsk({ cadence, daysLeft: 15, kindAutoRenews: true })).toBe(true);
  });

  /**
   * THE CRASH CASE, and the whole reason this is a condition rather than an
   * event. The pass fired the fifteen-day step and died before creating the ask.
   * On the tenth day no step fires — that one is settled — and a rule about the
   * firing instant would never open the slot at all: the dealer would be told
   * their NOC is expiring with nowhere to put the new one, silently, once,
   * months later.
   */
  it('still opens the slot on a later pass when an earlier one died', () => {
    expect(shouldOpenRenewalAsk({ cadence, daysLeft: 10, kindAutoRenews: true })).toBe(true);
  });

  it('opens it after the date has gone, too', () => {
    expect(shouldOpenRenewalAsk({ cadence, daysLeft: -30, kindAutoRenews: true })).toBe(true);
  });

  it('never opens a second — two replicas cannot make two requests', () => {
    expect(
      shouldOpenRenewalAsk({ cadence, daysLeft: 1, renewedByAskId: 'abc', kindAutoRenews: true }),
    ).toBe(false);
  });

  it('stays out of the way when the kind is renewed by hand', () => {
    expect(shouldOpenRenewalAsk({ cadence, daysLeft: 1, kindAutoRenews: false })).toBe(false);
  });

  /** "Never remind me about this one" means MDG handles it by hand, slot included. */
  it('opens nothing when the ladder is empty', () => {
    expect(shouldOpenRenewalAsk({ cadence: [], daysLeft: -5, kindAutoRenews: true })).toBe(false);
  });
});

describe('renewal period keys', () => {
  /**
   * THE COLLISION THIS EXISTS TO PREVENT. `ACCEPTED` is the one closed state
   * that refuses to reopen, so a renewal filed under the SAME key as the paper
   * it replaces would be refused and would simply never appear — no error on any
   * screen, and a certificate nobody was ever asked to renew.
   */
  it('gives a renewal a key of its own, distinct from the accepted paper', () => {
    const key = renewalPeriodKey({
      periodKind: 'NONE',
      today: TODAY,
      replacingValidUntil: '2027-03-31',
    });
    expect(key).toBe(':renew-2027-03-31');
    expect(key).not.toBe('');
  });

  it('keeps two renewal cycles of one certificate apart', () => {
    const first = renewalPeriodKey({
      periodKind: 'NONE',
      today: TODAY,
      replacingValidUntil: '2027-03-31',
    });
    const second = renewalPeriodKey({
      periodKind: 'NONE',
      today: '2027-03-01',
      replacingValidUntil: '2027-06-30',
    });
    expect(first).not.toBe(second);
  });

  /**
   * Two passes on the same day must produce the SAME key, so that even if the
   * idempotency guard were missed the unique index refuses the duplicate rather
   * than minting a second request.
   */
  it('is stable for one cycle, so a repeated pass cannot mint a duplicate', () => {
    const a = renewalPeriodKey({
      periodKind: 'NONE',
      today: TODAY,
      replacingValidUntil: '2027-03-31',
    });
    const b = renewalPeriodKey({
      periodKind: 'NONE',
      today: '2026-09-09',
      replacingValidUntil: '2027-03-31',
    });
    expect(a).toBe(b);
  });

  it('survives a paper with no date on it', () => {
    expect(renewalSlug(undefined)).toBe('renew');
    expect(renewalPeriodKey({ periodKind: 'NONE', today: TODAY })).toBe(':renew');
  });

  it('carries the day onto a dated period kind rather than replacing it', () => {
    expect(
      renewalPeriodKey({ periodKind: 'DAY', today: TODAY, replacingValidUntil: '2027-03-31' }),
    ).toBe('2026-09-08:renew-2027-03-31');
  });
});

describe('documentValidityTally', () => {
  it('counts four bands that always add up to the row count', () => {
    const rows: { validityState?: ExpiryState }[] = [
      { validityState: 'valid' },
      { validityState: 'valid' },
      { validityState: 'expiring' },
      { validityState: 'expired' },
      {},
    ];
    const tally = documentValidityTally(rows);
    expect(tally).toEqual({ valid: 2, expiring: 1, expired: 1, undated: 1 });
    expect(tally.valid + tally.expiring + tally.expired + tally.undated).toBe(rows.length);
  });
});

describe('compareDocumentValidityRows', () => {
  it('puts the most urgent paper first', () => {
    const rows = [
      { title: 'Register page' },
      { validityState: 'valid' as const, daysToExpiry: 40, title: 'Trade licence' },
      { validityState: 'expiring' as const, daysToExpiry: 8, title: 'Insurance' },
      { validityState: 'expired' as const, daysToExpiry: -3, title: 'Fire NOC' },
      { validityState: 'expiring' as const, daysToExpiry: 2, title: 'W&M licence' },
    ];
    expect([...rows].sort(compareDocumentValidityRows).map((r) => r.title)).toEqual([
      'Fire NOC',
      'W&M licence',
      'Insurance',
      'Trade licence',
      'Register page',
    ]);
  });

  it('breaks a tie on the title so a row cannot move under a thumb', () => {
    const rows = [
      { validityState: 'expiring' as const, daysToExpiry: 2, title: 'Insurance' },
      { validityState: 'expiring' as const, daysToExpiry: 2, title: 'Fire NOC' },
    ];
    expect([...rows].sort(compareDocumentValidityRows).map((r) => r.title)).toEqual([
      'Fire NOC',
      'Insurance',
    ]);
  });
});

describe('parseReminderLadder — the guard on the keyboard', () => {
  it('reads an ordinary ladder, in any spacing, biggest first', () => {
    expect(parseReminderLadder('15, 3, 2, 1').offsets).toEqual([15, 3, 2, 1]);
    expect(parseReminderLadder('1 2 3 15').offsets).toEqual([15, 3, 2, 1]);
    expect(parseReminderLadder('  30,7  ').offsets).toEqual([30, 7]);
  });

  it('drops a repeated step rather than refusing the whole ladder', () => {
    expect(parseReminderLadder('15, 15, 3').offsets).toEqual([15, 3]);
  });

  it('keeps 0 — a reminder on the expiry day itself', () => {
    expect(parseReminderLadder('3, 0').offsets).toEqual([3, 0]);
  });

  /**
   * THE WHOLE REASON THIS EXISTS BESIDE `normaliseReminderOffsets`. That one is
   * total and answers `[]` — the stored value meaning "never remind". Run it
   * over a box an admin has just cleared in order to retype the numbers, and a
   * slip between clearing and typing silences a whole kind of certificate, with
   * the save button looking exactly as it always does.
   */
  it('REFUSES the empty box, where the normaliser would answer "never remind"', () => {
    expect(normaliseReminderOffsets([])).toEqual([]);
    const parsed = parseReminderLadder('   ');
    expect(parsed.offsets).toBeNull();
    expect(parsed.error).toContain('Never remind');
  });

  it('refuses anything that is not a plain number of days', () => {
    // Every one of these passes `Number()` and a range check, and none of them
    // is a number of days anybody typed on purpose.
    for (const bad of ['15, 3, l', '1e3', '0x0f', 'Infinity', '-3', '2.5', '15; 3']) {
      expect(parseReminderLadder(bad).offsets).toBeNull();
    }
  });

  it('refuses a step further out than a year, and says why', () => {
    const parsed = parseReminderLadder('400');
    expect(parsed.offsets).toBeNull();
    expect(parsed.error).toContain('365');
  });

  it('refuses a ladder longer than the attention it can hold', () => {
    expect(parseReminderLadder('9 8 7 6 5 4 3 2 1').offsets).toBeNull();
    expect(parseReminderLadder('8 7 6 5 4 3 2 1').offsets).toHaveLength(8);
  });

  it('never returns both a ladder and an error', () => {
    for (const text of ['15,3,2,1', '', 'x', '400', '9 8 7 6 5 4 3 2 1', '0']) {
      const { offsets, error } = parseReminderLadder(text);
      expect(offsets === null).toBe(error !== null);
    }
  });

  it('round-trips through the box it came out of', () => {
    const parsed = parseReminderLadder('1, 15, 3, 2');
    expect(formatReminderLadder(parsed.offsets as number[])).toBe('15, 3, 2, 1');
    expect(parseReminderLadder(formatReminderLadder([1, 2, 3, 15])).offsets).toEqual([15, 3, 2, 1]);
  });
});

describe('sameReminderLadder', () => {
  it('ignores the order it arrived in, so a form can leave the save button alone', () => {
    expect(sameReminderLadder([15, 3, 2, 1], [1, 2, 3, 15])).toBe(true);
    expect(sameReminderLadder([15, 3], [15, 3, 1])).toBe(false);
    expect(sameReminderLadder([], [])).toBe(true);
    expect(sameReminderLadder([], [1])).toBe(false);
  });
});
