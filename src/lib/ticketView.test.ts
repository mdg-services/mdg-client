import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AI_HANDOFF_REASONS,
  TICKET_DANGER_MINUTES,
  TICKET_DEALER_STATUS_TEXT,
  TICKET_FOLLOW_UPS_MAX,
  TICKET_NOTE_MAX,
  TICKET_STATES,
  TICKET_STATE_LABEL,
  TICKET_TOPICS,
  TICKET_TOPIC_LABEL,
  TICKET_TRIGGERS,
  TICKET_TRIGGER_FOR_REASON,
  TICKET_TRIGGER_KIND,
  TICKET_TRIGGER_LABEL,
  TICKET_WARN_MINUTES,
  onItChoices,
  promiseActive,
  promiseTimeText,
  ticketAgeLabel,
  ticketAgeMinutes,
  ticketAgeTone,
  ticketDealerStatus,
  ticketDealerUpdateBy,
  ticketRef,
  ticketTriggerTone,
  type AiHandoffReason,
  type TicketTone,
  type TicketTrigger,
  type TicketView,
} from '@dk/shared';

/**
 * The words, colours and rules for tickets, exercised from the dealer app.
 *
 * WHY THIS FILE IS HERE
 * ---------------------
 * `ticketView.ts` is in `shared` so the admin's Tickets page and the dealer's
 * chat read one set of words. `shared` has no test runner and `mdg-admin` has no
 * `test` script, so this app's vitest is the only place the module can be run —
 * the same arrangement `aiFirstLineView.test.ts` sits in.
 *
 * WHAT IS WORTH THE FILE
 * ----------------------
 *  - THE REASON MAP decides which of the machine's handoffs open a ticket. A
 *    reason missing from it, or mapped to the wrong trigger, is a dealer's
 *    question the machine gave up on and nobody was told about;
 *  - THE AGE TONES decide when an open ticket turns amber and red on the list,
 *    and a ticket that is urgent and unopened must be red at once;
 *  - THE DEALER'S LINE is the only thing a dealer is ever told about a ticket,
 *    so it must stay four plain phrases in both languages and never claim more
 *    than "a person closed it";
 *  - THE LABEL MAPS are `Record`s over closed lists, so a new trigger or topic
 *    cannot ship without a label. That is a compile-time guarantee everywhere
 *    except here, where it is checked at runtime too — a `Record` built from a
 *    stale copy of the union still compiles.
 */

/** The instant every age assertion is measured against. */
const NOW = new Date('2026-10-12T10:00:00.000Z');
const MIN = 60_000;

/** An ISO time `minutes` before NOW. */
const ago = (minutes: number): string => new Date(NOW.getTime() - minutes * MIN).toISOString();

type AgeTicket = Pick<TicketView, 'state' | 'raisedAt' | 'urgent' | 'seenAt'>;

/** An open, not-urgent, unseen ticket raised `minutes` ago; `over` changes the rest. */
function ticket(minutes: number, over: Partial<AgeTicket> = {}): AgeTicket {
  return { state: 'OPEN', raisedAt: ago(minutes), urgent: false, ...over };
}

function keysOf(record: object): string[] {
  return Object.keys(record).sort();
}

describe('the closed lists', () => {
  it('has exactly two states — there is no third, on purpose', () => {
    expect([...TICKET_STATES]).toEqual(['OPEN', 'RESOLVED']);
  });

  it('lists nothing twice', () => {
    for (const list of [TICKET_STATES, TICKET_TRIGGERS, TICKET_TOPICS]) {
      expect(new Set(list).size).toBe(list.length);
    }
  });

  it('keeps the two limits the API and the screens both depend on sane', () => {
    expect(Number.isInteger(TICKET_NOTE_MAX)).toBe(true);
    expect(TICKET_NOTE_MAX).toBeGreaterThan(0);
    expect(Number.isInteger(TICKET_FOLLOW_UPS_MAX)).toBe(true);
    expect(TICKET_FOLLOW_UPS_MAX).toBeGreaterThan(0);
  });
});

describe('the label maps', () => {
  it('labels every trigger, and only the triggers', () => {
    expect(keysOf(TICKET_TRIGGER_LABEL)).toEqual([...TICKET_TRIGGERS].sort());
    for (const trigger of TICKET_TRIGGERS) {
      expect(TICKET_TRIGGER_LABEL[trigger].trim().length).toBeGreaterThan(0);
    }
  });

  it('gives every trigger its own label, so two rows never read the same', () => {
    const labels = TICKET_TRIGGERS.map((t) => TICKET_TRIGGER_LABEL[t]);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('labels every topic, and only the topics', () => {
    expect(keysOf(TICKET_TOPIC_LABEL)).toEqual([...TICKET_TOPICS].sort());
    for (const topic of TICKET_TOPICS) {
      expect(TICKET_TOPIC_LABEL[topic].trim().length).toBeGreaterThan(0);
    }
    const labels = TICKET_TOPICS.map((t) => TICKET_TOPIC_LABEL[t]);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('labels both states, in the words the list shows', () => {
    expect(TICKET_STATE_LABEL).toEqual({ OPEN: 'Open', RESOLVED: 'Resolved' });
    expect(keysOf(TICKET_STATE_LABEL)).toEqual([...TICKET_STATES].sort());
  });

  it('sorts every trigger into exactly one of person, gap or fault', () => {
    expect(keysOf(TICKET_TRIGGER_KIND)).toEqual([...TICKET_TRIGGERS].sort());
    for (const trigger of TICKET_TRIGGERS) {
      expect(['person', 'gap', 'fault']).toContain(TICKET_TRIGGER_KIND[trigger]);
    }
  });

  it('files the machine breaking as a fault, so a bad morning shows', () => {
    expect(TICKET_TRIGGER_KIND.machine_fault).toBe('fault');
    expect(TICKET_TRIGGER_KIND.could_not_verify).toBe('fault');
    // A question the records could not answer is a gap in what we built, not a
    // bug and not a person's work.
    expect(TICKET_TRIGGER_KIND.not_in_records).toBe('gap');
    expect(TICKET_TRIGGER_KIND.needs_person).toBe('person');
  });
});

describe('ticketTriggerTone', () => {
  const EXPECTED: Record<TicketTrigger, TicketTone> = {
    needs_person: 'neutral',
    asked_for_person: 'neutral',
    // A person is unhappy with an answer: the one "person" trigger that is red.
    dissatisfied: 'danger',
    not_in_records: 'warning',
    could_not_verify: 'danger',
    attachment: 'neutral',
    blocked: 'neutral',
    machine_fault: 'danger',
    limit: 'neutral',
    // A dealer writing again on a ticket somebody already has: a person's job.
    dealer_wrote: 'neutral',
  };

  it('has an expected tone for every trigger (this table cannot go stale)', () => {
    expect(keysOf(EXPECTED)).toEqual([...TICKET_TRIGGERS].sort());
  });

  it.each(TICKET_TRIGGERS.map((t) => [t, EXPECTED[t]] as const))(
    'draws %s as %s',
    (trigger, tone) => {
      expect(ticketTriggerTone(trigger)).toBe(tone);
    },
  );

  it('paints every fault red and every gap amber, whatever the trigger is called', () => {
    for (const trigger of TICKET_TRIGGERS) {
      const kind = TICKET_TRIGGER_KIND[trigger];
      if (kind === 'fault') expect(ticketTriggerTone(trigger)).toBe('danger');
      if (kind === 'gap') expect(ticketTriggerTone(trigger)).toBe('warning');
    }
  });
});

describe('TICKET_TRIGGER_FOR_REASON', () => {
  /** Every first-line handoff reason and the ticket it opens. Pinned in full. */
  const EXPECTED: Record<AiHandoffReason, TicketTrigger | null> = {
    attachment: 'attachment',
    group_thread: null,
    asked_for_human: 'asked_for_person',
    guard_in: 'blocked',
    quota: 'limit',
    budget: 'machine_fault',
    repeat: 'needs_person',
    follow_up: null,
    dissatisfied: 'dissatisfied',
    repeat_miss: 'not_in_records',
    same_answer: 'dissatisfied',
    no_intent: 'not_in_records',
    tool_refused: 'not_in_records',
    tool_error: 'machine_fault',
    guard_out: 'could_not_verify',
    bad_router_output: 'machine_fault',
    model_error: 'machine_fault',
    vendor_busy: 'machine_fault',
    escalated: 'needs_person',
    could_not_verify: 'could_not_verify',
    // The three quiet reasons: the machine stood down on purpose and posted
    // nothing. None of them opens a ticket — a person is already on the thread.
    ack: null,
    quiet_reply: null,
    on_it: null,
  };

  it('covers every handoff reason the first line can give, and no other key', () => {
    expect(keysOf(TICKET_TRIGGER_FOR_REASON)).toEqual([...AI_HANDOFF_REASONS].sort());
  });

  it('opens a ticket for every reason except the five that post nothing new', () => {
    const noTicket = AI_HANDOFF_REASONS.filter((r) => TICKET_TRIGGER_FOR_REASON[r] === null);
    expect(noTicket.sort()).toEqual(['ack', 'follow_up', 'group_thread', 'on_it', 'quiet_reply']);
  });

  it.each(['ack', 'quiet_reply', 'on_it'] as const)(
    'opens NO ticket when the machine stands down because of "%s" — a person has the thread, or nobody needs to',
    (reason) => {
      expect(TICKET_TRIGGER_FOR_REASON[reason]).toBeNull();
    },
  );

  it('opens NO ticket on a group thread — nothing is posted to the dealer there', () => {
    expect(TICKET_TRIGGER_FOR_REASON.group_thread).toBeNull();
  });

  it('opens NO ticket on a follow-up — the dealer is disputing an answer, and the earlier ticket covers it', () => {
    expect(TICKET_TRIGGER_FOR_REASON.follow_up).toBeNull();
  });

  it('only ever names a real trigger', () => {
    for (const reason of AI_HANDOFF_REASONS) {
      const trigger = TICKET_TRIGGER_FOR_REASON[reason];
      if (trigger !== null) expect(TICKET_TRIGGERS).toContain(trigger);
    }
  });

  it.each(AI_HANDOFF_REASONS.map((r) => [r, EXPECTED[r]] as const))(
    'turns %s into %s',
    (reason, trigger) => {
      expect(TICKET_TRIGGER_FOR_REASON[reason]).toBe(trigger);
    },
  );

  it('leaves no trigger that nothing can raise', () => {
    // A trigger no reason maps to would be a filter on the Tickets page that
    // can never match a row. `dealer_wrote` is the one exception, on purpose: it
    // is only ever the trigger of a FOLLOW-UP folded into a ticket somebody
    // already holds (`followUps[].trigger`), never of the ticket itself.
    const raised = new Set(Object.values(TICKET_TRIGGER_FOR_REASON));
    for (const trigger of TICKET_TRIGGERS) {
      if (trigger === 'dealer_wrote') continue;
      expect(raised.has(trigger)).toBe(true);
    }
    expect(raised.has('dealer_wrote')).toBe(false);
  });
});

describe('ticketAgeMinutes', () => {
  it('counts whole minutes since the time given', () => {
    expect(ticketAgeMinutes(ago(0), NOW)).toBe(0);
    expect(ticketAgeMinutes(ago(1), NOW)).toBe(1);
    expect(ticketAgeMinutes(ago(90), NOW)).toBe(90);
  });

  it('rounds DOWN: 59 seconds is still 0 minutes, 61 seconds is 1', () => {
    expect(ticketAgeMinutes(new Date(NOW.getTime() - 59_000).toISOString(), NOW)).toBe(0);
    expect(ticketAgeMinutes(new Date(NOW.getTime() - 61_000).toISOString(), NOW)).toBe(1);
  });

  it('never goes negative when the server clock is ahead of the browser', () => {
    // A ticket raised "in the future" by a few seconds of clock drift must not
    // read as a bug on a screen whose job is telling people what is late.
    expect(ticketAgeMinutes(ago(-5), NOW)).toBe(0);
    expect(ticketAgeMinutes(ago(-60 * 24), NOW)).toBe(0);
  });

  it('reads an unreadable time as 0 rather than NaN', () => {
    expect(ticketAgeMinutes('not a date', NOW)).toBe(0);
    expect(ticketAgeMinutes('', NOW)).toBe(0);
  });

  describe('with no clock passed in', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
    });
    afterEach(() => vi.useRealTimers());

    it('measures against the real now', () => {
      expect(ticketAgeMinutes(ago(45))).toBe(45);
    });
  });
});

describe('ticketAgeLabel', () => {
  it.each([
    [0, '0 min'],
    [1, '1 min'],
    [59, '59 min'],
    [60, '1 h'],
    [119, '1 h'],
    [120, '2 h'],
    [23 * 60 + 59, '23 h'],
    [24 * 60, '1 d'],
    [49 * 60, '2 d'],
    [10 * 24 * 60, '10 d'],
  ])('writes %i minutes as "%s"', (minutes, label) => {
    expect(ticketAgeLabel(ago(minutes), NOW)).toBe(label);
  });

  it('writes a time in the future, or an unreadable one, as 0 min', () => {
    expect(ticketAgeLabel(ago(-30), NOW)).toBe('0 min');
    expect(ticketAgeLabel('nonsense', NOW)).toBe('0 min');
  });

  it('measures against the real now when no clock is passed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    try {
      expect(ticketAgeLabel(ago(180))).toBe('3 h');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('ticketAgeTone', () => {
  it('pins the two thresholds the list is read against', () => {
    expect(TICKET_WARN_MINUTES).toBe(30);
    expect(TICKET_DANGER_MINUTES).toBe(120);
    expect(TICKET_WARN_MINUTES).toBeLessThan(TICKET_DANGER_MINUTES);
  });

  it('is blue for a fresh ticket', () => {
    expect(ticketAgeTone(ticket(0), NOW)).toBe('info');
    expect(ticketAgeTone(ticket(TICKET_WARN_MINUTES - 1), NOW)).toBe('info');
  });

  it('turns amber at 30 minutes, not a minute before', () => {
    expect(ticketAgeTone(ticket(TICKET_WARN_MINUTES), NOW)).toBe('warning');
    expect(ticketAgeTone(ticket(TICKET_DANGER_MINUTES - 1), NOW)).toBe('warning');
  });

  it('turns red at 2 hours, not a minute before', () => {
    expect(ticketAgeTone(ticket(TICKET_DANGER_MINUTES), NOW)).toBe('danger');
    expect(ticketAgeTone(ticket(60 * 24 * 3), NOW)).toBe('danger');
  });

  it('is red at once when it is urgent and nobody has opened it', () => {
    expect(ticketAgeTone(ticket(0, { urgent: true }), NOW)).toBe('danger');
    expect(ticketAgeTone(ticket(1, { urgent: true }), NOW)).toBe('danger');
  });

  it('stops being red-at-once the moment someone opens an urgent ticket', () => {
    // Seen, so the clock decides again.
    const seenAt = ago(0);
    expect(ticketAgeTone(ticket(1, { urgent: true, seenAt }), NOW)).toBe('info');
    expect(ticketAgeTone(ticket(45, { urgent: true, seenAt }), NOW)).toBe('warning');
    expect(ticketAgeTone(ticket(200, { urgent: true, seenAt }), NOW)).toBe('danger');
  });

  it('does not treat a ticket that is merely unseen as urgent', () => {
    expect(ticketAgeTone(ticket(1, { urgent: false }), NOW)).toBe('info');
  });

  it('is green once resolved, however old and however urgent it was', () => {
    expect(ticketAgeTone(ticket(5, { state: 'RESOLVED' }), NOW)).toBe('success');
    expect(ticketAgeTone(ticket(60 * 24 * 7, { state: 'RESOLVED' }), NOW)).toBe('success');
    expect(ticketAgeTone(ticket(1, { state: 'RESOLVED', urgent: true }), NOW)).toBe('success');
  });

  it('measures against the real now when no clock is passed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    try {
      expect(ticketAgeTone(ticket(10))).toBe('info');
      expect(ticketAgeTone(ticket(31))).toBe('warning');
      expect(ticketAgeTone(ticket(121))).toBe('danger');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('ticketRef', () => {
  it('writes the running number the way a person says it', () => {
    expect(ticketRef(1)).toBe('#1');
    expect(ticketRef(42)).toBe('#42');
    expect(ticketRef(1000)).toBe('#1000');
  });
});

describe('ticketDealerStatus', () => {
  it('says "raised" until a person at MDG has opened it', () => {
    expect(ticketDealerStatus({ state: 'OPEN', seen: false })).toBe('raised');
  });

  it('says "looking" once somebody has opened it and it is still open', () => {
    expect(ticketDealerStatus({ state: 'OPEN', seen: true })).toBe('looking');
  });

  it('says "resolved" once closed, whether or not it was ever opened first', () => {
    // A person can resolve straight from the list without opening it; the
    // closed state wins over the seen flag.
    expect(ticketDealerStatus({ state: 'RESOLVED', seen: true })).toBe('resolved');
    expect(ticketDealerStatus({ state: 'RESOLVED', seen: false })).toBe('resolved');
  });

  it('says "working" while a person\'s "on it until" time is still ahead', () => {
    const promiseUntil = new Date(NOW.getTime() + 30 * MIN).toISOString();
    expect(ticketDealerStatus({ state: 'OPEN', seen: true, promiseUntil }, NOW)).toBe('working');
    // Working wins over "sent": a person on an unopened ticket has plainly opened it.
    expect(ticketDealerStatus({ state: 'OPEN', seen: false, promiseUntil }, NOW)).toBe('working');
  });

  it('goes back to "looking" / "raised" by itself once that time passes, with no job to do it', () => {
    const promiseUntil = ago(1);
    expect(ticketDealerStatus({ state: 'OPEN', seen: true, promiseUntil }, NOW)).toBe('looking');
    expect(ticketDealerStatus({ state: 'OPEN', seen: false, promiseUntil }, NOW)).toBe('raised');
    // The very instant it is reached counts as passed.
    expect(
      ticketDealerStatus({ state: 'OPEN', seen: true, promiseUntil: NOW.toISOString() }, NOW),
    ).toBe('looking');
  });

  it('says "resolved" for a closed ticket even if a promise is still ahead', () => {
    const promiseUntil = new Date(NOW.getTime() + 30 * MIN).toISOString();
    expect(ticketDealerStatus({ state: 'RESOLVED', seen: true, promiseUntil }, NOW)).toBe(
      'resolved',
    );
  });

  it('only ever returns a status the dealer text has words for', () => {
    const ahead = new Date(NOW.getTime() + 30 * MIN).toISOString();
    for (const state of TICKET_STATES) {
      for (const seen of [true, false]) {
        for (const promiseUntil of [undefined, ahead, ago(1)]) {
          expect(Object.keys(TICKET_DEALER_STATUS_TEXT)).toContain(
            ticketDealerStatus({ state, seen, promiseUntil }, NOW),
          );
        }
      }
    }
  });
});

describe('promiseActive', () => {
  it('is true only while the time is ahead of the clock', () => {
    expect(promiseActive(new Date(NOW.getTime() + MIN).toISOString(), NOW)).toBe(true);
    expect(promiseActive(NOW.toISOString(), NOW)).toBe(false);
    expect(promiseActive(ago(1), NOW)).toBe(false);
  });

  it('is false for no time, an empty one, or one it cannot read', () => {
    expect(promiseActive(undefined, NOW)).toBe(false);
    expect(promiseActive(null, NOW)).toBe(false);
    expect(promiseActive('', NOW)).toBe(false);
    expect(promiseActive('not a date', NOW)).toBe(false);
  });
});

describe('TICKET_DEALER_STATUS_TEXT', () => {
  const STATUSES = ['raised', 'looking', 'working', 'resolved'] as const;
  const DEVANAGARI = /[ऀ-ॿ]/;

  it('has four phrases, one per status, and no more', () => {
    expect(keysOf(TICKET_DEALER_STATUS_TEXT)).toEqual([...STATUSES].sort());
  });

  it('writes every phrase in both languages', () => {
    for (const status of STATUSES) {
      const { en, hi } = TICKET_DEALER_STATUS_TEXT[status];
      expect(en.trim().length).toBeGreaterThan(0);
      expect(hi.trim().length).toBeGreaterThan(0);
      // The Hindi is Hindi, not the English pasted into the second slot.
      expect(hi).not.toBe(en);
      expect(DEVANAGARI.test(hi)).toBe(true);
    }
  });

  it('gives each status its own wording in each language', () => {
    for (const lang of ['en', 'hi'] as const) {
      const texts = STATUSES.map((s) => TICKET_DEALER_STATUS_TEXT[s][lang]);
      expect(new Set(texts).size).toBe(texts.length);
    }
  });

  it('says who is acting, and never says "done"', () => {
    // RESOLVED means a person closed it and the reply they wrote is the answer.
    // The line says it is closed, not that the dealer's problem is solved.
    for (const status of STATUSES) {
      expect(TICKET_DEALER_STATUS_TEXT[status].en).toMatch(/MDG team/);
      expect(TICKET_DEALER_STATUS_TEXT[status].hi).toMatch(/MDG/);
    }
    for (const lang of ['en', 'hi'] as const) {
      for (const status of STATUSES) {
        expect(TICKET_DEALER_STATUS_TEXT[status][lang]).not.toMatch(/done|solved|हो गया/i);
      }
    }
  });

  it('never tells a dealer about our machinery', () => {
    for (const status of STATUSES) {
      for (const lang of ['en', 'hi'] as const) {
        expect(TICKET_DEALER_STATUS_TEXT[status][lang]).not.toMatch(
          /\bAI\b|\bbot\b|automatic|ticket|escalat/i,
        );
      }
    }
  });

  it('reads as the line under a bubble once prefixed with the ticket ref', () => {
    expect(`${ticketRef(42)} · ${TICKET_DEALER_STATUS_TEXT.looking.en}`).toBe(
      '#42 · MDG team is looking at it',
    );
    expect(`${ticketRef(42)} · ${TICKET_DEALER_STATUS_TEXT.looking.hi}`).toBe(
      '#42 · MDG टीम देख रही है',
    );
  });

  it('says in plain words that the team is on it, and promises nothing but an update', () => {
    expect(TICKET_DEALER_STATUS_TEXT.working.en).toBe('MDG team is working on it');
    expect(TICKET_DEALER_STATUS_TEXT.working.hi).toBe('MDG टीम इस पर काम कर रही है');
  });
});

/**
 * The "on it until" times. NOW is 15:30 IST on Monday 12 Oct 2026, so IST is
 * five and a half hours ahead of the UTC the strings below are written in.
 */
describe('onItChoices', () => {
  it('offers an hour, three hours, and tomorrow at ten, in that order', () => {
    const choices = onItChoices(NOW);
    expect(choices.map((c) => c.key)).toEqual(['1h', '3h', 'tomorrow']);
    expect(choices.map((c) => c.label)).toEqual(['1 hour', '3 hours', 'Tomorrow 10:00']);
  });

  it('gives times, not lengths', () => {
    const [hour, three, tomorrow] = onItChoices(NOW);
    expect(hour.until.toISOString()).toBe('2026-10-12T11:00:00.000Z');
    expect(three.until.toISOString()).toBe('2026-10-12T13:00:00.000Z');
    // 10:00 IST on 13 Oct is 04:30 UTC.
    expect(tomorrow.until.toISOString()).toBe('2026-10-13T04:30:00.000Z');
  });

  it('means the next IST day, even when it is already tomorrow in UTC', () => {
    // 23:30 IST on 12 Oct is 18:00 UTC; "tomorrow" is still 13 Oct 10:00 IST.
    const lateEvening = new Date('2026-10-12T18:00:00.000Z');
    expect(onItChoices(lateEvening)[2].until.toISOString()).toBe('2026-10-13T04:30:00.000Z');
    // 00:30 IST on 13 Oct is 19:00 UTC on the 12th; "tomorrow" is the 14th.
    const justAfterMidnight = new Date('2026-10-12T19:00:00.000Z');
    expect(onItChoices(justAfterMidnight)[2].until.toISOString()).toBe('2026-10-14T04:30:00.000Z');
  });

  it('rolls over a month end', () => {
    const lastDay = new Date('2026-10-31T10:00:00.000Z');
    expect(onItChoices(lastDay)[2].until.toISOString()).toBe('2026-11-01T04:30:00.000Z');
  });

  it('keeps every choice inside the 72 hours the server allows', () => {
    for (const c of onItChoices(NOW)) {
      expect(c.until.getTime() - NOW.getTime()).toBeLessThanOrEqual(72 * 60 * MIN);
      expect(c.until.getTime()).toBeGreaterThan(NOW.getTime());
    }
  });
});

describe('promiseTimeText', () => {
  it('says a time today as the clock alone, in English', () => {
    expect(promiseTimeText('2026-10-12T12:30:00.000Z', 'en', NOW)).toBe('6:00 pm');
    expect(promiseTimeText('2026-10-12T05:00:00.000Z', 'en', NOW)).toBe('10:30 am');
  });

  it('says noon and midnight as 12, not 0', () => {
    expect(promiseTimeText('2026-10-12T06:30:00.000Z', 'en', NOW)).toBe('12:00 pm');
    expect(promiseTimeText('2026-10-12T18:30:00.000Z', 'en', NOW)).toBe('tomorrow 12:00 am');
  });

  it('says tomorrow, and then the date', () => {
    expect(promiseTimeText('2026-10-13T04:30:00.000Z', 'en', NOW)).toBe('tomorrow 10:00 am');
    expect(promiseTimeText('2026-10-14T04:30:00.000Z', 'en', NOW)).toBe('14 Oct, 10:00 am');
  });

  it('judges today and tomorrow by the IST day, not the UTC one', () => {
    // 23:00 UTC on the 12th is 04:30 IST on the 13th: tomorrow, though the UTC date is today.
    expect(promiseTimeText('2026-10-12T23:00:00.000Z', 'en', NOW)).toBe('tomorrow 4:30 am');
  });

  it('writes the same moments in Hindi, with the part of the day', () => {
    expect(promiseTimeText('2026-10-12T12:30:00.000Z', 'hi', NOW)).toBe('आज शाम 6 बजे');
    expect(promiseTimeText('2026-10-13T04:30:00.000Z', 'hi', NOW)).toBe('कल सुबह 10 बजे');
    expect(promiseTimeText('2026-10-14T04:30:00.000Z', 'hi', NOW)).toBe('14 अक्टूबर सुबह 10 बजे');
  });

  it('calls a time just past midnight "tonight" when it is said in the evening', () => {
    // 23:30 IST on the 12th; "1 hour" lands at 00:30 on the 13th. "कल रात 12:30"
    // would read as the NEXT night, a day late.
    const evening = new Date('2026-10-12T18:00:00.000Z');
    expect(promiseTimeText('2026-10-12T19:00:00.000Z', 'en', evening)).toBe('12:30 am tonight');
    expect(promiseTimeText('2026-10-12T19:00:00.000Z', 'hi', evening)).toBe('आज रात 12:30 बजे');
    // From the morning, the same moment is still "tomorrow".
    expect(promiseTimeText('2026-10-12T19:00:00.000Z', 'en', new Date('2026-10-12T04:00:00.000Z'))).toBe(
      'tomorrow 12:30 am',
    );
  });

  it('keeps the minutes in Hindi when there are any', () => {
    expect(promiseTimeText('2026-10-12T12:45:00.000Z', 'hi', NOW)).toBe('आज शाम 6:15 बजे');
  });

  it('is empty for a time it cannot read', () => {
    expect(promiseTimeText('nope', 'en', NOW)).toBe('');
    expect(promiseTimeText('nope', 'hi', NOW)).toBe('');
  });
});

describe('ticketDealerUpdateBy', () => {
  it('is the tail of the working line, in both languages', () => {
    expect(ticketDealerUpdateBy('2026-10-12T12:30:00.000Z', 'en', NOW)).toBe('update by 6:00 pm');
    expect(ticketDealerUpdateBy('2026-10-12T12:30:00.000Z', 'hi', NOW)).toBe(
      'आज शाम 6 बजे तक अपडेट',
    );
    expect(ticketDealerUpdateBy('2026-10-13T04:30:00.000Z', 'en', NOW)).toBe(
      'update by tomorrow 10:00 am',
    );
  });
});
