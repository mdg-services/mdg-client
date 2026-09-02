import { describe, expect, it } from 'vitest';

import {
  NOC_KIND,
  OTHER_KIND,
  REGISTER_KIND,
  TODAY,
  YESTERDAY,
  makeAskRow,
} from '@/test/askFixtures';

import {
  askBarFace,
  askBarTap,
  askMatchKey,
  dayOptions,
  groupAsks,
  istHour,
  outstandingRows,
} from './askRules';

/**
 * The rules the ask bar and the ask sheet are made of, exercised without React.
 *
 * Each one of these is a decision somebody argued about — which face the bar
 * shows, whether a tap opens a camera or a list, which day a photograph is
 * offered as — and every one of them fails SILENTLY when it is wrong: a bar that
 * says the wrong thing still renders, and a photograph filed against the wrong
 * day still uploads.
 */

const KINDS = [REGISTER_KIND, NOC_KIND, OTHER_KIND];

describe('askMatchKey', () => {
  /**
   * The transition the whole queue turns on. A dealer answers a derived `owed`
   * line, the server mints a real ask with a brand new id, and the photograph
   * waiting on the phone has to still find its card — so the key cannot be the
   * row id.
   */
  it('survives an owed line becoming a real ask', () => {
    const owed = makeAskRow({
      id: `owed:${REGISTER_KIND.code}:${YESTERDAY}`,
      source: 'owed',
      periodKey: YESTERDAY,
    });
    const minted = makeAskRow({ id: '65f0000000000000000000aa', periodKey: YESTERDAY });
    expect(owed.id).not.toBe(minted.id);
    expect(askMatchKey(owed)).toBe(askMatchKey(minted));
  });

  /** Two freeform asks made on the same day are two papers, not one. */
  it('keeps two freeform asks made on the same day apart', () => {
    const bill = makeAskRow({
      kindCode: OTHER_KIND.code,
      periodKey: `${TODAY}:bijli-ka-bil`,
    });
    const cert = makeAskRow({
      kindCode: OTHER_KIND.code,
      periodKey: `${TODAY}:taul-pramanpatra`,
    });
    expect(askMatchKey(bill)).not.toBe(askMatchKey(cert));
  });
});

describe('outstandingRows', () => {
  it('counts only the rows it is the dealer’s turn on', () => {
    const rows = [
      makeAskRow({ id: 'a', periodKey: TODAY }),
      makeAskRow({ id: 'b', periodKey: YESTERDAY, state: 'SENT', waitingOn: 'mdg' }),
      makeAskRow({ id: 'c', periodKey: '2026-08-31', state: 'ACCEPTED', waitingOn: 'none' }),
    ];
    expect(outstandingRows(rows, new Set()).map((r) => r.id)).toEqual(['a']);
  });

  /**
   * A photograph saved on the phone HAS been dealt with as far as the dealer is
   * concerned. Counting it as outstanding leaves a bar telling them to do a
   * thing they just did, and the obvious response is to do it twice.
   */
  it('drops a row whose photo is already waiting in the queue', () => {
    const row = makeAskRow({ id: 'a' });
    expect(outstandingRows([row], new Set([askMatchKey(row)]))).toEqual([]);
  });
});

describe('askBarFace', () => {
  it('shows nothing when nothing is owed', () => {
    expect(askBarFace([])).toBeNull();
  });

  it('names the one paper when there is exactly one', () => {
    const row = makeAskRow();
    expect(askBarFace([row])).toEqual({ face: 'one', row });
  });

  it('counts them when there is more than one', () => {
    const rows = [
      makeAskRow({ id: 'a', periodKey: TODAY }),
      makeAskRow({ id: 'b', periodKey: YESTERDAY }),
      makeAskRow({ id: 'c', periodKey: '2026-08-31' }),
    ];
    expect(askBarFace(rows)).toEqual({ face: 'many', count: 3 });
  });

  it('says a single overdue paper is overdue', () => {
    const row = makeAskRow({ late: true });
    expect(askBarFace([row])).toEqual({ face: 'late', row });
  });

  /**
   * Three papers of which one is overdue is still "3 things to send". The count
   * is what tells the dealer how big the job is; naming one late day would hide
   * the other two behind a sentence about a single date.
   */
  it('prefers the count over lateness when there is more than one', () => {
    const rows = [
      makeAskRow({ id: 'a', periodKey: TODAY }),
      makeAskRow({ id: 'b', periodKey: YESTERDAY, late: true }),
    ];
    expect(askBarFace(rows)).toEqual({ face: 'many', count: 2 });
  });
});

describe('askBarTap', () => {
  it('opens the camera for one dated page that is simply not sent yet', () => {
    const row = makeAskRow();
    expect(askBarTap([row], KINDS)).toEqual({ action: 'camera', row });
  });

  /**
   * THE ONE THAT MATTERS MOST. MDG sent it back with a sentence saying what was
   * wrong, and that sentence is the only difference between the second
   * photograph and the first. A camera would skip it, and the dealer would send
   * the same unreadable page again.
   */
  it('goes to the list when the paper was sent back', () => {
    const row = makeAskRow({ state: 'REJECTED', rejectReason: 'The date is cut off.' });
    expect(askBarTap([row], KINDS)).toEqual({ action: 'list' });
  });

  it('goes to the list when there is more than one thing to do', () => {
    const rows = [makeAskRow({ id: 'a' }), makeAskRow({ id: 'b', periodKey: YESTERDAY })];
    expect(askBarTap(rows, KINDS)).toEqual({ action: 'list' });
  });

  /** A fire NOC is a scan as often as a photograph. A bar cannot offer both. */
  it('goes to the list for a paper that might be a PDF', () => {
    const row = makeAskRow({ kindCode: NOC_KIND.code, periodKind: 'NONE', periodKey: '' });
    expect(askBarTap([row], KINDS)).toEqual({ action: 'list' });
  });

  it('goes to the list for a freeform paper, whatever MDG named', () => {
    const row = makeAskRow({ kindCode: OTHER_KIND.code, periodKey: `${TODAY}:bijli` });
    expect(askBarTap([row], KINDS)).toEqual({ action: 'list' });
  });

  /** Kavach evidence is answered on the Kavach screen, which owns that exchange. */
  it('goes to the list for a Kavach row', () => {
    const row = makeAskRow({
      id: 'kavach:65f0000000000000000000bb',
      source: 'kavach',
      submitVia: '/v1/kavach/items/65f0000000000000000000bb/evidence',
      periodKind: 'NONE',
      periodKey: '',
    });
    expect(askBarTap([row], KINDS)).toEqual({ action: 'list' });
  });

  /**
   * A retired kind no longer appears in the catalog the payload carries. The
   * list can do everything the camera can and the camera cannot do everything
   * the list can, so an unresolvable kind falls the safe way.
   */
  it('goes to the list when the kind cannot be resolved', () => {
    const row = makeAskRow({ kindCode: 'something-retired' });
    expect(askBarTap([row], KINDS)).toEqual({ action: 'list' });
  });
});

describe('dayOptions', () => {
  const rows = [
    makeAskRow({ id: 'today', periodKey: TODAY }),
    makeAskRow({ id: 'yesterday', periodKey: YESTERDAY }),
  ];

  /** 11:30 IST — an ordinary morning, and today's page is the ordinary answer. */
  const MIDDAY = new Date('2026-09-02T06:00:00Z');
  /** 02:30 IST — the night shift, still writing on what it calls yesterday's page. */
  const PRE_DAWN = new Date('2026-09-02T21:00:00Z');

  it('reads the Indian hour off the clock, not the phone’s time zone', () => {
    expect(istHour(MIDDAY)).toBe(11);
    expect(istHour(PRE_DAWN)).toBe(2);
  });

  it('offers today first during the day', () => {
    expect(dayOptions(rows, REGISTER_KIND.code, TODAY, MIDDAY).map((r) => r.id)).toEqual([
      'today',
      'yesterday',
    ]);
  });

  /**
   * A pump does not close at midnight. At half past two the man on shift is
   * still writing on the page he opened at eight last night, and calls it
   * yesterday's — so that is what he is offered first.
   */
  it('offers yesterday first before six in the morning', () => {
    expect(dayOptions(rows, REGISTER_KIND.code, TODAY, PRE_DAWN).map((r) => r.id)).toEqual([
      'yesterday',
      'today',
    ]);
  });

  it('leaves the order alone before dawn when yesterday is not owed', () => {
    const onlyToday = [makeAskRow({ id: 'today', periodKey: TODAY })];
    expect(
      dayOptions(onlyToday, REGISTER_KIND.code, TODAY, PRE_DAWN).map((r) => r.id),
    ).toEqual(['today']);
  });

  it('never offers another kind’s days', () => {
    const mixed = [...rows, makeAskRow({ id: 'noc', kindCode: NOC_KIND.code, periodKind: 'NONE', periodKey: '' })];
    expect(dayOptions(mixed, REGISTER_KIND.code, TODAY, MIDDAY).map((r) => r.id)).toEqual([
      'today',
      'yesterday',
    ]);
  });
});

describe('groupAsks', () => {
  it('splits the list by whose turn it is', () => {
    const groups = groupAsks([
      makeAskRow({ id: 'mine', periodKey: TODAY }),
      makeAskRow({ id: 'theirs', periodKey: YESTERDAY, state: 'SENT', waitingOn: 'mdg' }),
      makeAskRow({ id: 'over', periodKey: '2026-08-31', state: 'ACCEPTED', waitingOn: 'none' }),
      makeAskRow({ id: 'back', periodKey: '2026-08-30', state: 'REJECTED' }),
    ]);
    expect(groups.todo.map((r) => r.id)).toEqual(['mine', 'back']);
    expect(groups.sent.map((r) => r.id)).toEqual(['theirs']);
    expect(groups.done.map((r) => r.id)).toEqual(['over']);
  });
});
