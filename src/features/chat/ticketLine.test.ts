import { describe, expect, it } from 'vitest';

import type { TicketDealerView } from '@dk/shared/types';

import { ticketLineText, ticketLinesById } from './ticketLine';

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
});
