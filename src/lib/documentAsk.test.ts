import { describe, expect, it } from 'vitest';

import {
  DOCUMENT_ASK_STATES,
  documentAskWaitingOn,
  documentPeriodLabel,
  isValidPeriodKey,
  periodKeyFor,
  slugifyDocumentLabel,
} from '@dk/shared';

/**
 * The pure half of Document Ask, exercised from here because `shared` has no
 * test runner of its own and `mdg-admin` has no `test` script at all. That is
 * the standing pattern in this repo: decidable logic lives in `shared`, and the
 * only vitest that can reach it is the dealer app's.
 *
 * These four functions are worth the file. Between them they decide what a row's
 * identity is (so whether two requests are one row or two), and what a
 * Hindi-first pump owner reads on the card — and both failure modes are silent.
 * A collided key loses a request with nothing logged; a wrong label just shows
 * the wrong day.
 *
 * Every date here is an IST calendar day. `documentPeriodLabel` takes "today"
 * as an argument rather than reading a clock, so these assertions do not go
 * stale — and the dates are fixed for the same reason.
 */

/** The day the whole file pretends it is. */
const TODAY = '2026-09-02';
const YESTERDAY = '2026-09-01';
/** A day in the month before, so the "neither today nor yesterday" arm is real. */
const LAST_MONTH_DAY = '2026-08-28';

describe('periodKeyFor', () => {
  it('takes each period out of the same IST day', () => {
    expect(periodKeyFor('DAY', TODAY)).toBe('2026-09-02');
    expect(periodKeyFor('MONTH', TODAY)).toBe('2026-09');
    expect(periodKeyFor('YEAR', TODAY)).toBe('2026');
    expect(periodKeyFor('NONE', TODAY)).toBe('');
  });

  /**
   * The collision the suffix exists for. Without it both of these asks key on
   * `2026-09-02`, the second overwrites the first on the unique index, and the
   * dealer sees one request where MDG made two.
   */
  it('keeps two freeform asks made on the same day apart', () => {
    const a = periodKeyFor('DAY', TODAY, 'Electricity bill');
    const b = periodKeyFor('DAY', TODAY, 'Weighing certificate');
    expect(a).toBe('2026-09-02:electricity-bill');
    expect(b).toBe('2026-09-02:weighing-certificate');
    expect(a).not.toBe(b);
    // And without the label they would have been the same row.
    expect(periodKeyFor('DAY', TODAY)).toBe(periodKeyFor('DAY', TODAY));
  });

  /** The same words for the same day is one request asked twice, not two rows. */
  it('folds the same label on the same day onto one key', () => {
    expect(periodKeyFor('DAY', TODAY, 'Electricity bill')).toBe(
      periodKeyFor('DAY', TODAY, '  ELECTRICITY   BILL  '),
    );
  });

  /**
   * The bug an ASCII-only slugifier would reintroduce: every Hindi-labelled ask
   * slugs to the empty string, so they all share a key and collide again — the
   * fix for the collision causing the collision.
   */
  it('keeps a Devanagari label, so Hindi asks do not all collide', () => {
    const bill = periodKeyFor('DAY', TODAY, 'बिजली का बिल');
    const cert = periodKeyFor('DAY', TODAY, 'तौल प्रमाणपत्र');
    expect(bill).toBe('2026-09-02:बिजली-का-बिल');
    expect(bill).not.toBe(cert);
    expect(bill).not.toBe('2026-09-02');
  });

  it('adds no suffix for a label that slugs to nothing', () => {
    expect(periodKeyFor('DAY', TODAY, '///')).toBe('2026-09-02');
    expect(periodKeyFor('DAY', TODAY, '')).toBe('2026-09-02');
  });
});

describe('slugifyDocumentLabel', () => {
  it('caps the slug and leaves no trailing hyphen where the cut landed', () => {
    // 47 letters, a gap, then more: the 48-character cut lands exactly on the
    // hyphen the gap became, and a key ending in a hyphen is a key nobody meant.
    const slug = slugifyDocumentLabel(`${'a'.repeat(47)} bill`);
    expect(slug).toBe('a'.repeat(47));
  });

  it('removes the key separator rather than keeping it', () => {
    expect(slugifyDocumentLabel('bank: statement')).toBe('bank-statement');
    expect(slugifyDocumentLabel('a/b')).toBe('a-b');
  });
});

describe('isValidPeriodKey', () => {
  it('accepts the shape each kind is filed under', () => {
    expect(isValidPeriodKey('DAY', '2026-09-02')).toBe(true);
    expect(isValidPeriodKey('MONTH', '2026-09')).toBe(true);
    expect(isValidPeriodKey('YEAR', '2026')).toBe(true);
    expect(isValidPeriodKey('NONE', '')).toBe(true);
  });

  it("refuses another kind's shape", () => {
    expect(isValidPeriodKey('DAY', '2026-09')).toBe(false);
    expect(isValidPeriodKey('MONTH', '2026-09-02')).toBe(false);
    expect(isValidPeriodKey('YEAR', '2026-09')).toBe(false);
    expect(isValidPeriodKey('NONE', '2026')).toBe(false);
  });

  it('refuses an impossible month and an unpadded day', () => {
    expect(isValidPeriodKey('DAY', '2026-13-01')).toBe(false);
    expect(isValidPeriodKey('DAY', '2026-9-2')).toBe(false);
    expect(isValidPeriodKey('MONTH', '2026-00')).toBe(false);
  });

  /**
   * Shape only, and deliberately. 31 February is refused by
   * `ttBusinessDateSchema` in `schemas/documentAsk.ts`, which is the repo's one
   * date validator; a second one here is how a screen and a route come to
   * disagree about which days exist.
   */
  it('leaves "is that a real day" to the date validator', () => {
    expect(isValidPeriodKey('DAY', '2026-02-31')).toBe(true);
  });

  it('accepts a freeform suffix and refuses a broken one', () => {
    expect(isValidPeriodKey('DAY', '2026-09-02:electricity-bill')).toBe(true);
    expect(isValidPeriodKey('DAY', '2026-09-02:बिजली-का-बिल')).toBe(true);
    // An empty suffix, a second colon, whitespace, or one past the cap.
    expect(isValidPeriodKey('DAY', '2026-09-02:')).toBe(false);
    expect(isValidPeriodKey('DAY', '2026-09-02:a:b')).toBe(false);
    expect(isValidPeriodKey('DAY', '2026-09-02:a b')).toBe(false);
    expect(isValidPeriodKey('DAY', `2026-09-02:${'a'.repeat(49)}`)).toBe(false);
  });

  it('round-trips every key periodKeyFor builds', () => {
    expect(isValidPeriodKey('DAY', periodKeyFor('DAY', TODAY, 'Electricity bill'))).toBe(true);
    expect(isValidPeriodKey('MONTH', periodKeyFor('MONTH', TODAY))).toBe(true);
    expect(isValidPeriodKey('YEAR', periodKeyFor('YEAR', TODAY))).toBe(true);
    expect(isValidPeriodKey('NONE', periodKeyFor('NONE', TODAY))).toBe(true);
  });
});

describe('documentPeriodLabel', () => {
  it('names today and yesterday in words, in both languages', () => {
    expect(documentPeriodLabel('DAY', TODAY, 'en', TODAY)).toBe('Today');
    expect(documentPeriodLabel('DAY', TODAY, 'hi', TODAY)).toBe('आज');
    expect(documentPeriodLabel('DAY', YESTERDAY, 'en', TODAY)).toBe('Yesterday');
    expect(documentPeriodLabel('DAY', YESTERDAY, 'hi', TODAY)).toBe('कल');
  });

  /** Hindi takes the full month name; its short form is a less legible abbreviation. */
  it('dates an older day, short in English and spelled out in Hindi', () => {
    expect(documentPeriodLabel('DAY', LAST_MONTH_DAY, 'en', TODAY)).toBe('28 Aug');
    expect(documentPeriodLabel('DAY', LAST_MONTH_DAY, 'hi', TODAY)).toBe('28 अगस्त');
  });

  it('names a month by its name and year', () => {
    expect(documentPeriodLabel('MONTH', '2026-08', 'en', TODAY)).toBe('August 2026');
    expect(documentPeriodLabel('MONTH', '2026-08', 'hi', TODAY)).toBe('अगस्त 2026');
  });

  it('leaves a year and an unperiodic ask alone', () => {
    expect(documentPeriodLabel('YEAR', '2026', 'en', TODAY)).toBe('2026');
    expect(documentPeriodLabel('YEAR', '2026', 'hi', TODAY)).toBe('2026');
    expect(documentPeriodLabel('NONE', '', 'en', TODAY)).toBe('');
    expect(documentPeriodLabel('NONE', '', 'hi', TODAY)).toBe('');
  });

  /** The suffix names the ASK; the label names the PERIOD, so it is dropped. */
  it('ignores the freeform suffix', () => {
    expect(documentPeriodLabel('DAY', `${TODAY}:electricity-bill`, 'hi', TODAY)).toBe('आज');
    expect(documentPeriodLabel('DAY', `${LAST_MONTH_DAY}:electricity-bill`, 'en', TODAY)).toBe(
      '28 Aug',
    );
  });

  /**
   * "कल" means yesterday and tomorrow both. An ask's period can never be in the
   * future, so the word is safe — but if one ever is, the dated form is printed
   * rather than a word that would then genuinely be ambiguous.
   */
  it('never says "yesterday" about a day after today', () => {
    expect(documentPeriodLabel('DAY', '2026-09-03', 'hi', TODAY)).toBe('3 सितंबर');
    expect(documentPeriodLabel('DAY', '2026-09-03', 'en', TODAY)).toBe('3 Sept');
  });

  /** A dealer must never see a raw key, so an unparseable one still returns something. */
  it('falls back to the key rather than throwing', () => {
    expect(documentPeriodLabel('DAY', 'not-a-day', 'en', TODAY)).toBe('not-a-day');
  });
});

describe('documentAskWaitingOn', () => {
  it('puts the ball back with the dealer while they owe the paper', () => {
    expect(documentAskWaitingOn('ASKED')).toBe('dealer');
    // We looked, we said why, and it is their move again.
    expect(documentAskWaitingOn('REJECTED')).toBe('dealer');
  });

  it('puts a sent paper on MDG', () => {
    expect(documentAskWaitingOn('SENT')).toBe('mdg');
  });

  it('leaves the closed states with nobody', () => {
    expect(documentAskWaitingOn('ACCEPTED')).toBe('none');
    expect(documentAskWaitingOn('EXPIRED')).toBe('none');
    expect(documentAskWaitingOn('WITHDRAWN')).toBe('none');
  });

  /** Every shipped state has an answer — a new one must not fall through to undefined. */
  it('answers for every state in the enum', () => {
    for (const state of DOCUMENT_ASK_STATES) {
      expect(['dealer', 'mdg', 'none']).toContain(documentAskWaitingOn(state));
    }
  });
});
