import { describe, expect, it } from 'vitest';

import { NOW, report, task } from '@/features/glance/glanceFixtures';
import { translate } from '@/lib/i18n';
import type { MeServiceRun } from '@dk/shared/types';

import {
  SERVICE_STATES,
  serviceHealth,
  serviceState,
  serviceStateWord,
  serviceTimes,
  type ServiceStateId,
  type ServiceStateInput,
} from './serviceState';

const input = (over: Partial<ServiceStateInput> = {}): ServiceStateInput => ({
  serviceId: 'dsr-report',
  run: 'ok',
  tasks: [],
  reports: [],
  live: true,
  ...over,
});

const idOf = (over: Partial<ServiceStateInput> = {}) => serviceState(input(over))?.id ?? null;

const attentionDsr = [report('dsr_variation', { status: 'attention' })];
const declarationTask = task({ kind: 'declarations' });
const dsrTask = task({
  kind: 'ask',
  action: { type: 'photo', askRef: 'reg:2026-11-26', acceptsFile: false },
});

describe('serviceState: the state table, one test per row', () => {
  it('Needs you: an open task whose kind belongs to the service', () => {
    expect(idOf({ serviceId: 'dealer-declarations', tasks: [declarationTask] })).toBe('needs_you');
    expect(
      serviceState(input({ serviceId: 'dealer-declarations', tasks: [declarationTask] })),
    ).toMatchObject({ shape: 'clock' });
  });

  it('Needs you: a register-page ask belongs to TT Density', () => {
    expect(idOf({ serviceId: 'tt-density', tasks: [dsrTask] })).toBe('needs_you');
  });

  it('a task of another service does not make this one "Needs you"', () => {
    expect(idOf({ serviceId: 'dsr-report', tasks: [declarationTask] })).toBe('working');
  });

  it('Stopped: the server says failing', () => {
    const s = serviceState(input({ run: 'failing' }));
    expect(s?.id).toBe('stopped');
    expect(s?.shape).toBe('octagon');
  });

  it('Look at this: the newest report of its kinds is attention', () => {
    const s = serviceState(input({ reports: attentionDsr }));
    expect(s?.id).toBe('look');
    expect(s?.shape).toBe('triangle');
  });

  it('Look at this answers with no server answer at all (the feed alone is enough)', () => {
    expect(idOf({ run: undefined, reports: attentionDsr })).toBe('look');
  });

  it('Late: the server says late', () => {
    const s = serviceState(input({ run: 'late' }));
    expect(s?.id).toBe('late');
    expect(s?.shape).toBe('triangle');
  });

  it('Getting ready: new', () => {
    expect(idOf({ run: 'new' })).toBe('ready');
    expect(serviceState(input({ run: 'new' }))?.shape).toBe('circle-i');
  });

  it('Getting ready: held while the pump is not live', () => {
    expect(idOf({ run: 'held', live: false })).toBe('ready');
  });

  it('Paused: held while live', () => {
    const s = serviceState(input({ run: 'held', live: true }));
    expect(s?.id).toBe('paused');
    expect(s?.shape).toBe('circle-i');
  });

  it('On request', () => {
    expect(idOf({ run: 'on_request' })).toBe('on_request');
  });

  it.each<MeServiceRun>(['ok', 'running'])('Working: %s with nothing above', (run) => {
    const s = serviceState(input({ run }));
    expect(s?.id).toBe('working');
    expect(s?.shape).toBe('tick');
  });
});

describe('serviceState: first match wins', () => {
  it('Needs you beats Stopped, Look and Late', () => {
    expect(
      idOf({ serviceId: 'dealer-declarations', run: 'failing', tasks: [declarationTask] }),
    ).toBe('needs_you');
    expect(
      idOf({
        serviceId: 'dealer-declarations',
        run: 'late',
        tasks: [declarationTask],
        reports: [report('declaration_filed', { status: 'attention' })],
      }),
    ).toBe('needs_you');
  });

  it('Stopped beats Look', () => {
    expect(idOf({ run: 'failing', reports: attentionDsr })).toBe('stopped');
  });

  it('Look beats Late', () => {
    expect(idOf({ run: 'late', reports: attentionDsr })).toBe('look');
  });

  it('Look beats Getting ready, Paused, On request and Working', () => {
    for (const run of ['new', 'held', 'on_request', 'ok', 'running'] as const) {
      expect(idOf({ run, reports: attentionDsr }), run).toBe('look');
    }
  });

  it('Late beats nothing below it: late is late', () => {
    expect(idOf({ run: 'late', live: false })).toBe('late');
  });

  it('the order of the table is the order of SERVICE_STATES words', () => {
    expect(Object.keys(SERVICE_STATES)).toEqual([
      'needs_you',
      'stopped',
      'look',
      'late',
      'ready',
      'paused',
      'on_request',
      'working',
    ]);
  });
});

describe('serviceState: no health word is guessed', () => {
  it('with no server answer and no task or attention report: null, never "Working"', () => {
    expect(serviceState(input({ run: undefined }))).toBeNull();
    expect(
      serviceState(input({ run: undefined, reports: [report('dsr_sales', { status: 'ok' })] })),
    ).toBeNull();
  });

  it('a service the server does not list has no word either', () => {
    expect(serviceState(input({ serviceId: 'brand-new', run: undefined }))).toBeNull();
  });
});

describe('serviceState: reading the reports', () => {
  it("reads the newest report of the service's kinds: an old attention behind a fresh ok is gone", () => {
    const old = report('dsr_variation', {
      status: 'attention',
      sentAt: '2026-11-25T10:00:00.000Z',
    });
    const fresh = report('dsr_sales', { status: 'ok', sentAt: '2026-11-27T10:00:00.000Z' });
    expect(idOf({ reports: [old, fresh] })).toBe('working');
    expect(idOf({ reports: [fresh, old] })).toBe('working');
  });

  it('reads through every kind of the service: the sales sheet or the variation sheet can carry the warning', () => {
    expect(idOf({ reports: [report('dsr_sales', { status: 'attention' })] })).toBe('look');
    expect(idOf({ reports: [report('dsr_variation', { status: 'attention' })] })).toBe('look');
  });

  it('an aged alarm (the server turned it to information) is not "Look at this"', () => {
    expect(
      idOf({
        serviceId: 'ro-supply-status',
        run: 'on_request',
        reports: [report('ro_supply', { status: 'info' })],
      }),
    ).toBe('on_request');
  });

  it('a report of another service does not matter', () => {
    expect(idOf({ reports: [report('water_ingress', { status: 'attention' })] })).toBe('working');
  });

  it('a kind about one order is read report by report: a clean receipt does not hide a shortage', () => {
    const short = report('tt_ack', { status: 'attention', sentAt: '2026-11-25T10:00:00.000Z' });
    const clean = report('tt_ack', { status: 'ok', sentAt: '2026-11-27T10:00:00.000Z' });
    expect(idOf({ serviceId: 'tt-acknowledgement', reports: [short, clean] })).toBe('look');
  });

  it('a service with no report kind (a chat box) is never "Look at this" from reports', () => {
    expect(idOf({ serviceId: 'work-permits', reports: attentionDsr })).toBe('working');
  });
});

describe('the words', () => {
  const ids: ServiceStateId[] = [
    'needs_you',
    'stopped',
    'look',
    'late',
    'ready',
    'paused',
    'on_request',
    'working',
  ];

  it("are the spec's English words", () => {
    expect(ids.map((id) => serviceStateWord(SERVICE_STATES[id], 'en'))).toEqual([
      'Needs you',
      'Stopped, MDG is fixing',
      'Look at this',
      'Late',
      'Getting ready',
      'Paused, ask MDG why',
      'When you ask',
      'Working',
    ]);
  });

  it("are the spec's Hindi words", () => {
    expect(ids.map((id) => serviceStateWord(SERVICE_STATES[id], 'hi'))).toEqual([
      'आपका इंतज़ार',
      'ठप है, MDG देख रहा है',
      'देखिए',
      'देर हो रही है',
      'तैयार हो रही है',
      'अभी बंद है, MDG से पूछें',
      'ज़रूरत पर',
      'चल रही है',
    ]);
  });

  it('have Hinglish with no Devanagari', () => {
    for (const id of ids) {
      const w = serviceStateWord(SERVICE_STATES[id], 'hl');
      expect(w.length).toBeGreaterThan(0);
      expect(/[ऀ-ॿ]/.test(w)).toBe(false);
    }
  });

  it('every state has a shape and a word (never colour alone)', () => {
    for (const id of ids) {
      expect(SERVICE_STATES[id].shape).toBeTruthy();
      expect(translate('en', SERVICE_STATES[id].wordKey)).toBeTruthy();
    }
  });

  it('the octagon is only for Stopped; the clock is only for Needs you', () => {
    expect(ids.filter((id) => SERVICE_STATES[id].shape === 'octagon')).toEqual(['stopped']);
    expect(ids.filter((id) => SERVICE_STATES[id].shape === 'clock')).toEqual(['needs_you']);
  });
});

describe('serviceHealth: "8 of 9 services running. 1 needs you."', () => {
  const s = (id: ServiceStateId) => SERVICE_STATES[id];
  it('counts from the states of the rows', () => {
    const states = [...Array.from({ length: 8 }, () => s('working')), s('needs_you')];
    expect(serviceHealth(states)).toEqual({
      total: 9,
      running: 8,
      needsYou: 1,
      stopped: 0,
      lookAt: 0,
    });
  });

  it('puts Look and Late together as "look at", and Stopped on its own', () => {
    expect(serviceHealth([s('look'), s('late'), s('stopped'), s('paused'), s('working')])).toEqual({
      total: 5,
      running: 1,
      needsYou: 0,
      stopped: 1,
      lookAt: 2,
    });
  });

  it('does not count a row with no word: with no answer there is nothing to count', () => {
    expect(serviceHealth([null, null])).toEqual({
      total: 0,
      running: 0,
      needsYou: 0,
      stopped: 0,
      lookAt: 0,
    });
    expect(serviceHealth([s('working'), null]).total).toBe(1);
  });
});

describe('serviceTimes: "Last ran today 7:05 am, next 7 pm" in the dealer\'s clock', () => {
  const ist = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00.000+05:30`).toISOString();

  it('says last ran and next, in English', () => {
    const t = serviceTimes(
      { lastRanAt: ist('2026-11-27', '07:05'), nextRunAt: ist('2026-11-27', '19:00') },
      'en',
      NOW,
    );
    expect(t.lastRan).toBe('Last ran today 7:05 am');
    expect(t.next).toBe('Next today 7:00 pm');
  });

  it('says yesterday and a dated day', () => {
    const t = serviceTimes(
      { lastRanAt: ist('2026-11-26', '19:00'), nextRunAt: ist('2026-11-29', '07:00') },
      'en',
      NOW,
    );
    expect(t.lastRan).toBe('Last ran yesterday 7:00 pm');
    expect(t.next).toMatch(/^Next Sun 29 Nov 7:00 am$/);
  });

  it("reads the India day, not the phone's: 00:30 on the 27th is today, 18:50 UTC on the 26th", () => {
    const t = serviceTimes({ lastRanAt: '2026-11-26T19:00:00.000Z' }, 'en', NOW);
    expect(t.lastRan).toBe('Last ran today 12:30 am');
  });

  it('flips "today" to "yesterday" at India midnight', () => {
    const lastRanAt = ist('2026-11-27', '19:00');
    expect(serviceTimes({ lastRanAt }, 'en', new Date('2026-11-27T18:29:59.000Z')).lastRan).toBe(
      'Last ran today 7:00 pm',
    );
    expect(serviceTimes({ lastRanAt }, 'en', new Date('2026-11-27T18:30:00.000Z')).lastRan).toBe(
      'Last ran yesterday 7:00 pm',
    );
  });

  it('speaks Hindi and Hinglish', () => {
    const entry = { lastRanAt: ist('2026-11-27', '07:05') };
    expect(serviceTimes(entry, 'hi', NOW).lastRan).toBe('आखिरी बार आज सुबह 7:05 चली');
    const hl = serviceTimes(entry, 'hl', NOW).lastRan!;
    expect(hl).toBe('Aakhri baar Aaj subah 7:05 chali');
    expect(/[ऀ-ॿ]/.test(hl)).toBe(false);
  });

  it('leaves out a time that is not there or cannot be read, never a dash', () => {
    expect(serviceTimes(undefined, 'en', NOW)).toEqual({});
    expect(serviceTimes({}, 'en', NOW)).toEqual({});
    expect(serviceTimes({ lastRanAt: 'not a date', nextRunAt: undefined }, 'en', NOW)).toEqual({});
    expect(
      serviceTimes({ nextRunAt: ist('2026-11-27', '19:00') }, 'en', NOW).lastRan,
    ).toBeUndefined();
  });

  it('is never worded "success"', () => {
    const t = serviceTimes({ lastRanAt: ist('2026-11-27', '07:05') }, 'en', NOW);
    expect(t.lastRan).not.toMatch(/success|good|ok/i);
  });
});
