import { describe, expect, it } from 'vitest';

import type { TicketDealerView } from '@dk/shared/types';

import { msUntilPromiseEnds, ticketLineText, ticketLinesById } from './ticketLine';

function ticket(over: Partial<TicketDealerView> = {}): TicketDealerView {
  return {
    id: 't1',
    number: 42,
    state: 'OPEN',
    seen: false,
    raisedAt: '2026-10-12T10:00:00.000Z',
    ...over,
  };
}

// 15:30 IST on 30 Oct 2026, the moment every clock-dependent test below reads.
const NOW = new Date('2026-10-30T10:00:00.000Z');
// 18:00 IST the same day, and 10:00 IST the next morning.
const TODAY_6PM = '2026-10-30T12:30:00.000Z';
const TOMORROW_10AM = '2026-10-31T04:30:00.000Z';

describe('ticketLinesById', () => {
  it('reduces each ticket to a status word and a number, keyed by id', () => {
    const lines = ticketLinesById([
      ticket({ id: 'a', number: 1 }),
      ticket({ id: 'b', number: 2, seen: true }),
      ticket({ id: 'c', number: 3, state: 'RESOLVED', seen: true }),
    ]);
    expect(lines.get('a')).toEqual({ status: 'raised', number: 1 });
    expect(lines.get('b')).toEqual({ status: 'looking', number: 2 });
    expect(lines.get('c')).toEqual({ status: 'resolved', number: 3 });
    expect(lines.size).toBe(3);
  });

  it('reads all four states, and only the working one carries a time', () => {
    const lines = ticketLinesById(
      [
        ticket({ id: 'raised', number: 1 }),
        ticket({ id: 'looking', number: 2, seen: true }),
        ticket({ id: 'working', number: 3, seen: true, promiseUntil: TODAY_6PM }),
        ticket({ id: 'resolved', number: 4, state: 'RESOLVED', seen: true }),
      ],
      NOW,
    );
    expect(lines.get('raised')).toEqual({ status: 'raised', number: 1 });
    expect(lines.get('looking')).toEqual({ status: 'looking', number: 2 });
    expect(lines.get('working')).toEqual({ status: 'working', number: 3, until: TODAY_6PM });
    expect(lines.get('resolved')).toEqual({ status: 'resolved', number: 4 });
    // Not `until: undefined` — a line with nothing to say about time has no key for it.
    expect(Object.keys(lines.get('looking')!)).toEqual(['status', 'number']);
  });

  it('working beats seen: a person on an unseen ticket is "working", not "sent"', () => {
    const line = ticketLinesById(
      [ticket({ seen: false, promiseUntil: TODAY_6PM })],
      NOW,
    ).get('t1')!;
    expect(line.status).toBe('working');
  });

  it('goes back to the seen / unseen word once the promised time has passed', () => {
    const past = '2026-10-30T09:59:00.000Z';
    expect(
      ticketLinesById([ticket({ seen: true, promiseUntil: past })], NOW).get('t1'),
    ).toEqual({ status: 'looking', number: 42 });
    expect(
      ticketLinesById([ticket({ seen: false, promiseUntil: past })], NOW).get('t1'),
    ).toEqual({ status: 'raised', number: 42 });
  });

  it('is closed, not working, when the ticket is resolved with a time still ahead', () => {
    // The server takes the promise off on resolve; this is the belt for a payload
    // that was cached just before.
    expect(
      ticketLinesById(
        [ticket({ state: 'RESOLVED', seen: true, promiseUntil: TODAY_6PM })],
        NOW,
      ).get('t1'),
    ).toEqual({ status: 'resolved', number: 42 });
  });

  it('carries nothing but primitives, so a bubble never sees the ticket object', () => {
    const line = ticketLinesById([ticket()]).get('t1')!;
    expect(Object.keys(line).sort()).toEqual(['number', 'status']);
    expect(typeof line.status).toBe('string');
    expect(typeof line.number).toBe('number');
  });

  it('has no entry for a ticket the conversation does not list', () => {
    expect(ticketLinesById([ticket({ id: 'a' })]).has('missing')).toBe(false);
  });

  it('is empty for no tickets, or a server that never sent the field', () => {
    expect(ticketLinesById([]).size).toBe(0);
    expect(ticketLinesById(undefined).size).toBe(0);
  });
});

describe('msUntilPromiseEnds', () => {
  it('is the wait until the soonest running time', () => {
    expect(
      msUntilPromiseEnds(
        [
          ticket({ id: 'later', promiseUntil: TOMORROW_10AM }),
          ticket({ id: 'sooner', promiseUntil: TODAY_6PM }),
        ],
        NOW,
      ),
    ).toBe(2.5 * 60 * 60_000);
  });

  it('is null when nothing is running: no time, a time that has passed, or a closed ticket', () => {
    expect(msUntilPromiseEnds(undefined, NOW)).toBeNull();
    expect(msUntilPromiseEnds([ticket()], NOW)).toBeNull();
    expect(
      msUntilPromiseEnds([ticket({ promiseUntil: '2026-10-30T09:00:00.000Z' })], NOW),
    ).toBeNull();
    expect(
      msUntilPromiseEnds([ticket({ state: 'RESOLVED', promiseUntil: TODAY_6PM })], NOW),
    ).toBeNull();
  });

  it('never asks for more than a timer can hold', () => {
    // A timer given more than 2^31 - 1 ms fires at once; re-armed, it would spin.
    const wait = msUntilPromiseEnds([ticket({ promiseUntil: '2027-12-31T00:00:00.000Z' })], NOW);
    expect(wait).toBe(2 ** 31 - 1);
  });
});

describe('ticketLineText', () => {
  it('prefixes the ticket ref to the status phrase, in English', () => {
    expect(ticketLineText('en', 'raised', 42)).toBe('#42 · Sent to the MDG team');
    expect(ticketLineText('en', 'looking', 42)).toBe('#42 · MDG team is looking at it');
    expect(ticketLineText('en', 'resolved', 42)).toBe('#42 · Closed by the MDG team');
  });

  it('and in Hindi', () => {
    expect(ticketLineText('hi', 'raised', 7)).toBe('#7 · MDG टीम को भेजा गया');
    expect(ticketLineText('hi', 'looking', 7)).toBe('#7 · MDG टीम देख रही है');
    expect(ticketLineText('hi', 'resolved', 7)).toBe('#7 · MDG टीम ने बंद किया');
  });

  it('adds the time the team will update by to a working line', () => {
    expect(ticketLineText('en', 'working', 3, TODAY_6PM, NOW)).toBe(
      '#3 · MDG team is working on it · update by 6:00 pm',
    );
    expect(ticketLineText('hi', 'working', 3, TODAY_6PM, NOW)).toBe(
      '#3 · MDG टीम इस पर काम कर रही है · आज शाम 6 बजे तक अपडेट',
    );
  });

  it('says tomorrow when the time is on the next day', () => {
    expect(ticketLineText('en', 'working', 3, TOMORROW_10AM, NOW)).toBe(
      '#3 · MDG team is working on it · update by tomorrow 10:00 am',
    );
    expect(ticketLineText('hi', 'working', 3, TOMORROW_10AM, NOW)).toBe(
      '#3 · MDG टीम इस पर काम कर रही है · कल सुबह 10 बजे तक अपडेट',
    );
  });

  it('is only the first half, never an empty tail, when a working line has no time', () => {
    expect(ticketLineText('en', 'working', 3)).toBe('#3 · MDG team is working on it');
    expect(ticketLineText('en', 'working', 3, 'not a date', NOW)).toBe(
      '#3 · MDG team is working on it',
    );
  });

  it('ignores a time on any line that is not working', () => {
    expect(ticketLineText('en', 'looking', 3, TODAY_6PM, NOW)).toBe('#3 · MDG team is looking at it');
  });
});
