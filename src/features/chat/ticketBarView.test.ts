import { describe, expect, it } from 'vitest';

import type { TicketDealerView } from '@dk/shared/types';

import { msUntilBarChange, ticketBarView } from './ticketBarView';
import { MAX_TIMER_MS } from './ticketLine';

function ticket(over: Partial<TicketDealerView> = {}): TicketDealerView {
  return {
    id: 't1',
    number: 3,
    state: 'OPEN',
    seen: false,
    raisedAt: '2026-10-30T04:00:00.000Z',
    ...over,
  };
}

/** A moment on the IST wall clock: `ist(30, 15, 30)` is 15:30 on 30 Oct 2026 in India. */
function ist(day: number, hour: number, minute = 0, second = 0, ms = 0): Date {
  return new Date(Date.UTC(2026, 9, day, hour, minute, second, ms) - 330 * 60_000);
}

const NOW = ist(30, 15, 30);
const HOUR = 3_600_000;

describe('ticketBarView — every phase, in English and in Hindi', () => {
  // Inside the team's hours (15:30 IST) so "new" is not "night".
  const CASES: Array<[string, Partial<TicketDealerView>, string, string]> = [
    ['new', {}, '#3 · Sent to the MDG team', '#3 · MDG टीम को भेज दिया है'],
    [
      'looking',
      { seen: true },
      '#3 · MDG team is looking at it',
      '#3 · MDG टीम देख रही है',
    ],
    [
      'working',
      { seen: true, promiseUntil: ist(30, 18).toISOString() },
      '#3 · Being worked on · update by 6:00 pm',
      '#3 · काम चल रहा है · आज शाम 6 बजे तक अपडेट',
    ],
    [
      'late',
      { seen: true, promiseUntil: ist(30, 15).toISOString(), teamReminded: true },
      '#3 · Taking a little longer · team reminded',
      '#3 · थोड़ा और समय लग रहा है · टीम को याद दिलाया',
    ],
    [
      'closed',
      { state: 'RESOLVED', seen: true, resolvedAt: ist(30, 14, 30).toISOString() },
      '#3 · Done ✓',
      '#3 · पूरा हुआ ✓',
    ],
  ];

  it.each(CASES)('%s', (phase, over, en, hi) => {
    const tickets = [ticket(over)];
    expect(ticketBarView(tickets, 'en', NOW)).toEqual({ phase, text: en });
    expect(ticketBarView(tickets, 'hi', NOW)).toEqual({ phase, text: hi });
  });

  it('night — a ticket raised outside the team hours says when the team will look', () => {
    const tickets = [ticket()];
    const sevenAm = ist(30, 7);
    expect(ticketBarView(tickets, 'en', sevenAm)).toEqual({
      phase: 'night',
      text: '#3 · The team will see this from 9 am',
    });
    expect(ticketBarView(tickets, 'hi', sevenAm)).toEqual({
      phase: 'night',
      text: '#3 · टीम सुबह 9 बजे से देखेगी',
    });
  });

  it('names tomorrow when the promised time is on the next day', () => {
    const tickets = [ticket({ seen: true, promiseUntil: ist(31, 10).toISOString() })];
    expect(ticketBarView(tickets, 'en', NOW)?.text).toBe(
      '#3 · Being worked on · update by tomorrow 10:00 am',
    );
    expect(ticketBarView(tickets, 'hi', NOW)?.text).toBe(
      '#3 · काम चल रहा है · कल सुबह 10 बजे तक अपडेट',
    );
  });

  it('says the time that was promised, not the clock the phone is on', () => {
    // 12:30 UTC is 18:00 in India — the same line wherever the phone thinks it is.
    const tickets = [ticket({ seen: true, promiseUntil: '2026-10-30T12:30:00.000Z' })];
    expect(ticketBarView(tickets, 'en', NOW)?.text).toContain('update by 6:00 pm');
  });
});

describe('ticketBarView — what is shown, and when nothing is', () => {
  it('is nothing for a chat with no tickets, or a server that sends none', () => {
    expect(ticketBarView(undefined, 'en', NOW)).toBeNull();
    expect(ticketBarView([], 'en', NOW)).toBeNull();
  });

  it('an update after the promised time ends "taking longer" — it is "looking" again', () => {
    const tickets = [
      ticket({
        seen: true,
        promiseUntil: ist(30, 15).toISOString(),
        teamReminded: true,
        updatedAfterPromise: true,
      }),
    ];
    expect(ticketBarView(tickets, 'en', NOW)?.phase).toBe('looking');
  });

  it('shows the open ticket over a closed one', () => {
    const view = ticketBarView(
      [
        ticket({ id: 'old', number: 2, state: 'RESOLVED', resolvedAt: ist(30, 14).toISOString() }),
        ticket({ id: 'open', number: 3, seen: true }),
      ],
      'en',
      NOW,
    );
    expect(view).toEqual({ phase: 'looking', text: '#3 · MDG team is looking at it' });
  });

  it('with none open, shows the most recently closed one', () => {
    const view = ticketBarView(
      [
        ticket({ id: 'a', number: 1, state: 'RESOLVED', resolvedAt: ist(30, 9).toISOString() }),
        ticket({ id: 'b', number: 2, state: 'RESOLVED', resolvedAt: ist(30, 14).toISOString() }),
      ],
      'en',
      NOW,
    );
    expect(view?.text).toBe('#2 · Done ✓');
  });
});

describe('ticketBarView — the team’s hours decide "sent" or "from 9 am" (IST)', () => {
  const tickets = [ticket()];
  const phaseAt = (at: Date) => ticketBarView(tickets, 'en', at)?.phase;

  it.each([
    ['one second before 9 am', ist(30, 8, 59, 59), 'night'],
    ['9:00:00 am sharp', ist(30, 9), 'new'],
    ['one second before 11 pm', ist(30, 22, 59, 59), 'new'],
    ['11:00:00 pm sharp', ist(30, 23), 'night'],
    ['half past midnight', ist(31, 0, 30), 'night'],
  ] as const)('%s is %s', (_label, at, phase) => {
    expect(phaseAt(at)).toBe(phase);
  });

  it('reads the hour in India, not in UTC', () => {
    // 04:00 UTC is 09:30 in India — inside hours — though UTC says four in the morning.
    expect(phaseAt(new Date('2026-10-30T04:00:00.000Z'))).toBe('new');
    // 18:00 UTC is 23:30 in India — outside hours — though UTC says six in the evening.
    expect(phaseAt(new Date('2026-10-30T18:00:00.000Z'))).toBe('night');
  });
});

describe('ticketBarView — the 24 hours a closed ticket stays', () => {
  const closedAt = ist(30, 9);
  const tickets = [ticket({ state: 'RESOLVED', seen: true, resolvedAt: closedAt.toISOString() })];
  const at = (offsetMs: number) => ticketBarView(tickets, 'en', new Date(closedAt.getTime() + offsetMs));

  it('is there a moment after it was closed, and an hour before the end', () => {
    expect(at(0)?.text).toBe('#3 · Done ✓');
    expect(at(23 * HOUR)?.text).toBe('#3 · Done ✓');
  });

  it('is still there at exactly 24 hours, and gone a millisecond later', () => {
    expect(at(24 * HOUR)?.text).toBe('#3 · Done ✓');
    expect(at(24 * HOUR + 1)).toBeNull();
  });

  it('is gone the next day', () => {
    expect(at(30 * HOUR)).toBeNull();
  });

  it('a closed ticket with no closing time cannot be shown', () => {
    expect(ticketBarView([ticket({ state: 'RESOLVED', seen: true })], 'en', NOW)).toBeNull();
  });
});

describe('ticketBarView — the flip when the promised time passes', () => {
  const until = ist(30, 18);
  const tickets = [ticket({ seen: true, promiseUntil: until.toISOString() })];

  it('is "being worked on" up to the moment, and "looking" from it — it has not been said that the team was reminded', () => {
    expect(ticketBarView(tickets, 'en', new Date(until.getTime() - 1))?.phase).toBe('working');
    const atIt = ticketBarView(tickets, 'en', until);
    expect(atIt?.phase).toBe('looking');
    expect(atIt?.text).toBe('#3 · MDG team is looking at it');
  });

  it('stays "looking" however long the lapsed time has been left, until the server says the team was reminded', () => {
    // Four hours on, with no `teamReminded` from the server: the bar does not claim a reminder.
    const later = new Date(until.getTime() + 4 * HOUR);
    expect(ticketBarView(tickets, 'en', later)?.phase).toBe('looking');
    expect(ticketBarView(tickets, 'hi', later)?.text).toBe('#3 · MDG टीम देख रही है');
  });

  it('is "taking longer · team reminded" from the moment, once the server says the team was reminded', () => {
    const reminded = [{ ...tickets[0]!, teamReminded: true }];
    expect(ticketBarView(reminded, 'en', new Date(until.getTime() - 1))?.phase).toBe('working');
    expect(ticketBarView(reminded, 'en', until)).toEqual({
      phase: 'late',
      text: '#3 · Taking a little longer · team reminded',
    });
    expect(ticketBarView(reminded, 'hi', until)?.text).toBe(
      '#3 · थोड़ा और समय लग रहा है · टीम को याद दिलाया',
    );
  });

  it('"team reminded" is only ever said when it is true: false and a missing field read the same', () => {
    const explicitFalse = [{ ...tickets[0]!, teamReminded: false }];
    expect(ticketBarView(explicitFalse, 'en', until)?.phase).toBe('looking');
    expect(ticketBarView(tickets, 'en', until)?.phase).toBe('looking');
  });

  it('"team reminded" with no promised time at all is not "taking longer": there is no time that passed', () => {
    const noPromise = [ticket({ seen: true, teamReminded: true })];
    expect(ticketBarView(noPromise, 'en', NOW)?.phase).toBe('looking');
  });

  it('goes back to "looking" if the team wrote to the dealer in the meantime', () => {
    const updated = [{ ...tickets[0]!, teamReminded: true, updatedAfterPromise: true }];
    expect(ticketBarView(updated, 'en', until)?.phase).toBe('looking');
  });
});

describe('msUntilBarChange — the next moment the bar can read differently', () => {
  it('while being worked on: the promised time', () => {
    const tickets = [ticket({ seen: true, promiseUntil: ist(30, 18).toISOString() })];
    expect(msUntilBarChange(tickets, NOW)).toBe(2.5 * HOUR);
  });

  it('while being worked on with the time on another day: India’s midnight, when "tomorrow" stops being true', () => {
    const tickets = [ticket({ seen: true, promiseUntil: ist(31, 10).toISOString() })];
    expect(msUntilBarChange(tickets, NOW)).toBe(8.5 * HOUR);
  });

  it('a new ticket, in team hours: when the team’s hours end (11 pm)', () => {
    expect(msUntilBarChange([ticket()], NOW)).toBe(7.5 * HOUR);
  });

  it('a new ticket at night: when the team’s hours start (9 am), today or tomorrow', () => {
    expect(msUntilBarChange([ticket()], ist(30, 23, 30))).toBe(9.5 * HOUR);
    expect(msUntilBarChange([ticket()], ist(31, 3))).toBe(6 * HOUR);
  });

  it('at the very moment of a boundary, the one after it', () => {
    expect(msUntilBarChange([ticket()], ist(30, 9))).toBe(14 * HOUR);
    expect(msUntilBarChange([ticket()], ist(30, 23))).toBe(10 * HOUR);
  });

  it('a closed ticket: its 24 hours, plus the millisecond they last through', () => {
    const tickets = [
      ticket({ state: 'RESOLVED', seen: true, resolvedAt: ist(30, 14, 30).toISOString() }),
    ];
    expect(msUntilBarChange(tickets, NOW)).toBe(23 * HOUR + 1);
  });

  it('is nothing for a bar only the server can change', () => {
    expect(msUntilBarChange(undefined, NOW)).toBeNull();
    expect(msUntilBarChange([], NOW)).toBeNull();
    // looking
    expect(msUntilBarChange([ticket({ seen: true })], NOW)).toBeNull();
    // a promise that ran out, with no reminder said: "looking"
    expect(
      msUntilBarChange([ticket({ seen: true, promiseUntil: ist(30, 15).toISOString() })], NOW),
    ).toBeNull();
    // taking longer, team reminded
    expect(
      msUntilBarChange(
        [ticket({ seen: true, promiseUntil: ist(30, 15).toISOString(), teamReminded: true })],
        NOW,
      ),
    ).toBeNull();
    // a closed ticket past its day
    expect(
      msUntilBarChange(
        [ticket({ state: 'RESOLVED', seen: true, resolvedAt: ist(29, 9).toISOString() })],
        NOW,
      ),
    ).toBeNull();
  });

  it('never asks for more than a timer can hold', () => {
    // A phone with a clock set far wrong: a closing time a year ahead.
    const tickets = [
      ticket({ state: 'RESOLVED', seen: true, resolvedAt: '2027-10-30T00:00:00.000Z' }),
    ];
    expect(msUntilBarChange(tickets, NOW)).toBe(MAX_TIMER_MS);
  });

  it('is a time that moves the bar: at it, the phase is different', () => {
    const cases: TicketDealerView[][] = [
      [ticket({ seen: true, promiseUntil: ist(30, 18).toISOString() })],
      [ticket()],
      [ticket({ state: 'RESOLVED', seen: true, resolvedAt: ist(30, 14, 30).toISOString() })],
    ];
    for (const tickets of cases) {
      const wait = msUntilBarChange(tickets, NOW)!;
      const later = new Date(NOW.getTime() + wait);
      expect(ticketBarView(tickets, 'en', later)).not.toEqual(ticketBarView(tickets, 'en', NOW));
      // …and a millisecond sooner it is not.
      const sooner = new Date(later.getTime() - 1);
      expect(ticketBarView(tickets, 'en', sooner)).toEqual(ticketBarView(tickets, 'en', NOW));
    }
  });
});
