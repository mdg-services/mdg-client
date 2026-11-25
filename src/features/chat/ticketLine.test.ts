import { describe, expect, it } from 'vitest';

import { MAX_TIMER_MS } from './ticketLine';
import * as ticketLine from './ticketLine';

describe('the ticket line under a bubble is gone (ADR 0055)', () => {
  it('no longer builds a "#42 · Sent to the MDG team" line for any bubble', () => {
    // A ticket number under a dealer's message told them a machine had raised it.
    // Where their question stands is the pinned bar's job, in the team's own words.
    expect(Object.keys(ticketLine)).toEqual(['MAX_TIMER_MS']);
  });
});

describe('MAX_TIMER_MS', () => {
  it('is the longest delay a timer holds: a larger one fires at once, and a timer re-armed after firing at once never stops', () => {
    expect(MAX_TIMER_MS).toBe(2 ** 31 - 1);
  });
});
