import { describe, expect, it } from 'vitest';

import {
  compareDocumentAskReviewRows,
  compareDocumentAskRows,
  documentAskAge,
  documentAskEstateTally,
  documentAskListCaveat,
  documentAskMark,
  documentAskStatusRank,
  documentPeriodStartDay,
  type DocumentAskEstateStatus,
  type DocumentAskTableRowLike,
} from '@dk/shared';

/**
 * The decidable half of the ADMIN's document estate table, exercised from the
 * dealer app.
 *
 * WHY THE TEST FOR AN ADMIN SCREEN LIVES IN `mdg-client`
 * -----------------------------------------------------
 * `mdg-admin` has no `test` script and not one test file — checked, not assumed
 * — and `shared` has no runner of its own. So the standing pattern in this repo
 * is the one `documentAsk.test.ts` next door already follows: anything decidable
 * goes into `shared`, and the only vitest that can reach it is the dealer app's.
 *
 * The alternative was a `format.ts` inside the admin page, imported by a
 * relative path from here. There is NO precedent for that anywhere in this repo
 * — nothing under `mdg-client/src` imports across app boundaries — and inventing
 * one would put a file outside `mdg-client`'s tsconfig and its Vite alias set
 * into its test graph, which fails in a way that reads like a broken test rather
 * than a broken import.
 *
 * WHAT IS WORTH THE FILE
 * ----------------------
 * Five rules, and every one of them is silent when it is wrong:
 *
 *  - the MARK decides whether an admin chases a dealer or chases their own
 *    colleague, and MDG's backlog and the dealer's must never share one;
 *  - the RANK decides which dealer is looked at first on a screen nobody scrolls
 *    to the bottom of;
 *  - the AGE decides which paper gets phoned about, and it reads a different
 *    clock depending on whose turn it is — the one thing here a person would
 *    never notice was wrong;
 *  - the TALLY is what the four tiles say, and tiles that do not add up to the
 *    list below them are how a screen loses its reader's trust;
 *  - the REVIEW ORDER is first-in-first-out over MDG's own queue, which is the
 *    only thing stopping a photograph that landed on Tuesday from staying unread
 *    because fresher ones keep arriving above it.
 */

/** The instant every age assertion is measured against: 2026-09-02, 10:00 IST. */
const NOW = Date.parse('2026-09-02T10:00:00+05:30');

/** A row with only the fields the comparators read. */
function row(
  dealerCode: string,
  status: DocumentAskEstateStatus,
  extra: Partial<DocumentAskTableRowLike> = {},
): DocumentAskTableRowLike {
  return { dealerCode, status, late: false, ...extra };
}

describe('documentAskMark', () => {
  /**
   * The distinction the whole table exists to draw. If these two ever collapse
   * onto one mark, a screen full of them says "chase forty dealers" when half of
   * those rows are sitting in MDG's own review queue.
   */
  it('never gives our backlog and theirs the same mark', () => {
    expect(documentAskMark('ASKED')).toBe('THEM');
    expect(documentAskMark('SENT')).toBe('US');
    expect(documentAskMark('ASKED')).not.toBe(documentAskMark('SENT'));
  });

  /** A sent-back paper is the dealer's move again — we said why, they re-send. */
  it('puts a rejected paper back on the dealer', () => {
    expect(documentAskMark('REJECTED')).toBe('THEM');
  });

  /**
   * The anti-join's honest answer. A dealer who photographs their register every
   * morning creates no ask at all; showing them as missing would be chasing
   * somebody for doing exactly the right thing.
   */
  it('treats a period the service already satisfied as received', () => {
    expect(documentAskMark('RECEIVED')).toBe('HAVE');
    expect(documentAskMark('ACCEPTED')).toBe('HAVE');
  });

  /**
   * Five marks and not four. An expired ask is not "not on this service" — the
   * dealer WAS on the hook and nothing came — and it is plainly not "we have
   * it". Folding it into either would erase a request that went unanswered.
   */
  it('keeps a closed-with-nothing row apart from a dealer who was never asked', () => {
    expect(documentAskMark('EXPIRED')).toBe('CLOSED');
    expect(documentAskMark('WITHDRAWN')).toBe('CLOSED');
    expect(documentAskMark('NOT_ON_SERVICE')).toBe('NOT_APPLICABLE');
    expect(documentAskMark('EXPIRED')).not.toBe(documentAskMark('NOT_ON_SERVICE'));
  });
});

describe('documentAskStatusRank', () => {
  it('leads with the ask whose due date has gone by', () => {
    expect(documentAskStatusRank('ASKED', true)).toBe(0);
    expect(documentAskStatusRank('ASKED', false)).toBe(2);
  });

  /** Problems first, in the order the screen was specified in. */
  it('orders the whole table problems first', () => {
    const order: Array<[DocumentAskEstateStatus, boolean]> = [
      ['ASKED', true],
      ['REJECTED', false],
      ['NOT_SENT', false],
      ['SENT', false],
      ['ACCEPTED', false],
      ['WITHDRAWN', false],
      ['NOT_ON_SERVICE', false],
    ];
    const ranks = order.map(([status, late]) => documentAskStatusRank(status, late));
    expect(ranks).toEqual([0, 1, 2, 3, 4, 5, 6]);
    // Strictly increasing, which is the property that actually matters: any two
    // adjacent statuses must be separable, not merely ordered on average.
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
  });

  /**
   * `dueOn` survives a rejection — only `expiresAt` is given a fresh window — so
   * a sent-back row can carry a due date that has already gone. Promoting it
   * would push rows nobody has looked at yet below rows somebody already has.
   */
  it('does not promote a rejected row for being past its old due date', () => {
    expect(documentAskStatusRank('REJECTED', true)).toBe(1);
  });

  /**
   * A dealer we do not run the service for sinks below everything, including the
   * closed rows. On an estate of fifty where three are attached, the other
   * forty-seven would otherwise bury the three rows that mean anything.
   */
  it('sinks a dealer who was never on the hook below every real state', () => {
    const notOnService = documentAskStatusRank('NOT_ON_SERVICE', false);
    for (const status of ['ASKED', 'SENT', 'ACCEPTED', 'EXPIRED'] as const) {
      expect(documentAskStatusRank(status, false)).toBeLessThan(notOnService);
    }
  });
});

describe('documentPeriodStartDay', () => {
  it('takes the first day out of every period shape', () => {
    expect(documentPeriodStartDay('DAY', '2026-09-02')).toBe('2026-09-02');
    expect(documentPeriodStartDay('MONTH', '2026-09')).toBe('2026-09-01');
    expect(documentPeriodStartDay('YEAR', '2026')).toBe('2026-01-01');
    expect(documentPeriodStartDay('NONE', '')).toBeUndefined();
  });

  /** The suffix names the ASK, not the period — the age is of the period. */
  it('ignores a freeform suffix', () => {
    expect(documentPeriodStartDay('DAY', '2026-09-02:bijli-ka-bil')).toBe('2026-09-02');
  });

  /** A malformed key gets no clock at all rather than a plausible wrong one. */
  it('refuses a key that is not that shape', () => {
    expect(documentPeriodStartDay('DAY', '2026-09')).toBeUndefined();
    expect(documentPeriodStartDay('MONTH', 'rubbish')).toBeUndefined();
  });
});

describe('documentAskAge', () => {
  /**
   * THE BUG THIS FUNCTION EXISTS TO PREVENT. A register page photographed this
   * morning, answering an ask opened eight days ago, must read as a wait of
   * hours and not of eight days — otherwise the review queue puts today's work
   * at the head of the line and the admin phones a dealer who has done nothing
   * wrong.
   */
  it('measures MDG’s own turn from the send, not from the ask', () => {
    const age = documentAskAge(
      {
        waitingOn: 'mdg',
        askedAt: '2026-08-25T09:00:00+05:30',
        submittedAt: '2026-09-02T08:00:00+05:30',
      },
      NOW,
    );
    expect(age).toEqual({ days: 0, basis: 'sent', label: 'Today' });
  });

  it('measures the dealer’s turn from the last time we asked', () => {
    const age = documentAskAge(
      { waitingOn: 'dealer', askedAt: '2026-08-29T10:00:00+05:30', periodDay: '2026-08-20' },
      NOW,
    );
    expect(age).toEqual({ days: 4, basis: 'asked', label: '4 days' });
  });

  /**
   * An estate row carries NO `askedAt` — half its rows have no ask behind them
   * at all — so a missing paper's only honest clock is the day its period began.
   */
  it('falls back to the period when nobody has asked yet', () => {
    const age = documentAskAge({ waitingOn: 'dealer', periodDay: '2026-09-01' }, NOW);
    expect(age).toEqual({ days: 1, basis: 'period', label: '1 day' });
  });

  /** Nobody is waiting on an accepted paper, so the column shows a dash. */
  it('gives no age to a row that is over', () => {
    expect(documentAskAge({ waitingOn: 'none', submittedAt: '2026-08-01T00:00:00Z' }, NOW)).toBeNull();
  });

  /**
   * A `SENT` row with no submission timestamp is a contradiction. It shows a
   * dash rather than falling back to the date we happened to ask on, which would
   * be a made-up number driving a real decision.
   */
  it('does not paper over a sent row with no send time', () => {
    expect(
      documentAskAge({ waitingOn: 'mdg', askedAt: '2026-08-25T09:00:00+05:30' }, NOW),
    ).toBeNull();
  });

  /**
   * Clock skew is normal — a phone a few minutes ahead, an ask made at 23:59 —
   * and "-1 days" on a compliance screen reads as a broken figure rather than as
   * the rounding it is.
   */
  it('never reports a negative age', () => {
    const age = documentAskAge(
      { waitingOn: 'dealer', askedAt: '2026-09-02T23:59:00+05:30' },
      NOW,
    );
    expect(age).toEqual({ days: 0, basis: 'asked', label: 'Today' });
  });

  it('says “1 day”, not “1 days”', () => {
    const age = documentAskAge({ waitingOn: 'dealer', periodDay: '2026-09-01' }, NOW);
    expect(age?.label).toBe('1 day');
    const older = documentAskAge({ waitingOn: 'dealer', periodDay: '2026-08-31' }, NOW);
    expect(older?.label).toBe('2 days');
  });

  /** A period key that is not a day at all leaves the row with no age. */
  it('gives no age when the clock will not parse', () => {
    expect(documentAskAge({ waitingOn: 'dealer', askedAt: 'not a date' }, NOW)).toBeNull();
  });
});

describe('documentAskEstateTally', () => {
  /**
   * The four tiles plus the two footnotes must account for every line in the
   * table. A screen showing four numbers that do not add up to the rows beneath
   * them is one an admin stops believing.
   */
  it('accounts for every row exactly once', () => {
    const rows: { status: DocumentAskEstateStatus }[] = [
      { status: 'NOT_SENT' },
      { status: 'ASKED' },
      { status: 'SENT' },
      { status: 'ACCEPTED' },
      { status: 'RECEIVED' },
      { status: 'REJECTED' },
      { status: 'EXPIRED' },
      { status: 'WITHDRAWN' },
      { status: 'NOT_ON_SERVICE' },
    ];
    const tally = documentAskEstateTally(rows);
    expect(tally).toEqual({
      notSent: 2,
      sent: 1,
      accepted: 2,
      rejected: 1,
      closed: 2,
      notOnService: 1,
      total: 9,
    });
    const counted =
      tally.notSent +
      tally.sent +
      tally.accepted +
      tally.rejected +
      tally.closed +
      tally.notOnService;
    expect(counted).toBe(tally.total);
  });

  /**
   * "Not sent" is one number and not two. An admin asking who has not sent
   * today's page does not care whether we got round to asking — the paper is not
   * here either way.
   */
  it('counts an unasked period and an unanswered ask as the same problem', () => {
    expect(documentAskEstateTally([{ status: 'NOT_SENT' }, { status: 'ASKED' }]).notSent).toBe(2);
  });

  it('counts an empty estate as all zeroes', () => {
    expect(documentAskEstateTally([]).total).toBe(0);
    expect(documentAskEstateTally([]).notSent).toBe(0);
  });
});

describe('compareDocumentAskRows', () => {
  it('puts the problems at the top and the untouched dealers at the bottom', () => {
    const rows = [
      row('15E', 'ACCEPTED'),
      row('3E', 'NOT_ON_SERVICE'),
      row('9E', 'SENT'),
      row('2E', 'ASKED', { late: true }),
      row('7E', 'REJECTED'),
      row('4E', 'NOT_SENT'),
    ];
    expect([...rows].sort(compareDocumentAskRows).map((r) => r.dealerCode)).toEqual([
      '2E',
      '7E',
      '4E',
      '9E',
      '15E',
      '3E',
    ]);
  });

  /**
   * `2E, 3E, 15E`, the way a person reads them. A plain string compare puts 15E
   * first because `'1' < '2'`, and this table re-sorts client-side over a list
   * the backend already ordered — the two disagreeing is how a dealer goes
   * missing from where an operator expected them.
   */
  it('breaks a tie on the dealer code the way a person reads it', () => {
    const rows = [row('15E', 'NOT_SENT'), row('2E', 'NOT_SENT'), row('3E', 'NOT_SENT')];
    expect([...rows].sort(compareDocumentAskRows).map((r) => r.dealerCode)).toEqual([
      '2E',
      '3E',
      '15E',
    ]);
  });
});

describe('compareDocumentAskReviewRows', () => {
  /**
   * First in, first out over MDG's own backlog. Every row in the review queue
   * has the same status, so the only thing separating them is how long the
   * dealer has been waiting on us.
   */
  it('reviews the oldest wait first', () => {
    const rows = [
      row('3E', 'SENT', { submittedAt: '2026-09-02T09:00:00+05:30' }),
      row('2E', 'SENT', { submittedAt: '2026-08-30T18:00:00+05:30' }),
      row('9E', 'SENT', { submittedAt: '2026-09-01T07:30:00+05:30' }),
    ];
    expect([...rows].sort(compareDocumentAskReviewRows).map((r) => r.dealerCode)).toEqual([
      '2E',
      '9E',
      '3E',
    ]);
  });

  /**
   * Ascending order would otherwise put "we do not know when this arrived" at
   * the head of the queue, which is the opposite of what an unknown deserves.
   */
  it('sends a row with no send time to the back, not the front', () => {
    const rows = [
      row('5E', 'SENT'),
      row('2E', 'SENT', { submittedAt: '2026-09-01T07:30:00+05:30' }),
    ];
    expect([...rows].sort(compareDocumentAskReviewRows).map((r) => r.dealerCode)).toEqual([
      '2E',
      '5E',
    ]);
  });
});

/**
 * WHAT A CAPPED LIST IS ALLOWED TO IMPLY.
 *
 * The admin's flat list of requests asks for 200 rows at a time. It used to send
 * no cursor at all and simply not draw row 201, with nothing on screen saying
 * so: the table stopped, and the four counters above it — built from the rows on
 * screen, deliberately, so they cannot disagree with the list — quietly
 * described a page as if it were the estate.
 *
 * The list pages now. These are the words that go with it, and the case that
 * matters most is the search: "Nothing matches this filter" over a page of a
 * longer list is indistinguishable, on screen, from "that dealer has sent
 * everything".
 */
describe('documentAskListCaveat', () => {
  it('says nothing at all when the page IS everything', () => {
    // No caveat, so the caller renders no line — a reassurance nobody needs to
    // read is still a line of text between an admin and their work.
    expect(documentAskListCaveat({ shown: 12, hasMore: false, searching: false })).toBe('');
    expect(documentAskListCaveat({ shown: 12, hasMore: false, searching: true })).toBe('');
  });

  it('names the number actually on screen, not the page size', () => {
    // After "Load more" the honest figure is 400. A hard-coded "the first 200"
    // would be a second place for the same fact to live, and a wrong one.
    expect(documentAskListCaveat({ shown: 400, hasMore: true, searching: false })).toContain(
      'first 400 requests',
    );
  });

  it('warns that a search has only searched what was fetched', () => {
    const said = documentAskListCaveat({ shown: 200, hasMore: true, searching: true });
    expect(said).toContain('first 200 requests');
    // The whole point: an admin must not read "nothing found" as "nothing
    // exists" when the dealer they typed is simply further down.
    expect(said).toContain('does not mean nothing exists');
  });

  it('offers the way out — load more, or narrow the filter', () => {
    for (const searching of [true, false]) {
      const said = documentAskListCaveat({ shown: 200, hasMore: true, searching });
      expect(said.toLowerCase()).toContain('load more');
      expect(said.toLowerCase()).toContain('narrow by document or status');
    }
  });

  it('keeps the count grammatical when exactly one row came back', () => {
    expect(documentAskListCaveat({ shown: 1, hasMore: true, searching: false })).toContain(
      'first 1 request.',
    );
  });
});
