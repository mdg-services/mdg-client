import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { KindAlert } from '@/features/reports/types';
import type { ReportData, ReportKind, TodayFeed, TodayReport } from '@dk/shared/types';

/** What each kind says, set per test. The real kinds are tested in their own files. */
const h = vi.hoisted(() => ({
  alert: vi.fn(),
  headline: vi.fn(),
}));

vi.mock('@/features/reports/registry', () => ({
  getKindView: (kind: string) => ({
    kind,
    alert: (data: unknown, lang: string) => h.alert(kind, data, lang),
    headline: (data: unknown, lang: string) => h.headline(kind, data, lang),
  }),
}));

const { buildAlerts, buildAlertsAndCovered, headlineOf } = await import('./todayModel');

const snap = (kind: string, extra: Record<string, unknown> = {}): ReportData =>
  ({ kind, v: 1, ...extra }) as unknown as ReportData;

function report(kind: ReportKind, over: Partial<TodayReport> = {}): TodayReport {
  return {
    id: over.messageId ?? `m-${kind}`,
    kind,
    status: 'ok',
    day: '2026-11-24',
    sentAt: '2026-11-24T06:00:00.000Z',
    headline: `${kind} words`,
    attachments: [],
    conversationId: 'c1',
    messageId: `m-${kind}`,
    data: snap(kind),
    ...over,
  };
}

function feed(over: Partial<TodayFeed> = {}): TodayFeed {
  return { day: '2026-11-24', role: 'owner', tasks: [], reports: [], done: [], ...over };
}

beforeEach(() => {
  h.alert.mockReset().mockReturnValue(null);
  h.headline.mockReset().mockReturnValue('');
});

const kindName = (k: ReportKind) => `name:${k}`;

describe('buildAlerts', () => {
  const alert = (headline: string, severity: KindAlert['severity'] = 'attention'): KindAlert => ({
    headline,
    line: `${headline} line`,
    severity,
  });

  it('is empty when no kind has anything to flag', () => {
    expect(buildAlerts(feed({ reports: [report('stock_check')] }), 'en', true, kindName)).toEqual([]);
  });

  it('puts a problem before an attention card, newest first inside each', () => {
    h.alert.mockImplementation((kind: string): KindAlert | null => {
      if (kind === 'dsr_variation') return alert('Diesel 310 L short', 'problem');
      if (kind === 'water_ingress') return alert('2 checks missed');
      if (kind === 'stock_check') return alert('Stock is old');
      return null;
    });
    const f = feed({
      reports: [
        report('water_ingress', { sentAt: '2026-11-24T09:00:00.000Z' }),
        report('stock_check', { sentAt: '2026-11-24T05:00:00.000Z' }),
        report('dsr_variation', { sentAt: '2026-11-24T01:00:00.000Z' }),
      ],
    });
    const items = buildAlerts(f, 'en', true, kindName);
    expect(items.map((i) => i.headline)).toEqual(['Diesel 310 L short', '2 checks missed', 'Stock is old']);
    expect(items.map((i) => i.severity)).toEqual(['problem', 'attention', 'attention']);
    expect(items[0]).toMatchObject({ line: 'Diesel 310 L short line', fromWords: false });
  });

  it('asks only the newest report of a kind, so an older warning cannot outlive the newer all-clear', () => {
    h.alert.mockImplementation((_k: string, data: { marker?: string }) =>
      data.marker === 'old' ? alert('old warning') : null,
    );
    const f = feed({
      reports: [
        report('water_ingress', { messageId: 'old', sentAt: '2026-11-23T09:00:00.000Z', data: snap('water_ingress', { marker: 'old' }) }),
        report('water_ingress', { messageId: 'new', sentAt: '2026-11-24T09:00:00.000Z', data: snap('water_ingress', { marker: 'new' }) }),
      ],
    });
    expect(buildAlerts(f, 'en', true, kindName)).toEqual([]);
  });

  it('ranks by the kind\'s own weight inside one severity (an excess before a shortage), then newest first', () => {
    h.alert.mockImplementation((kind: string): KindAlert | null => {
      if (kind === 'dsr_variation') return { headline: 'Diesel 520 L short', line: 'l', severity: 'problem', weight: 0 };
      if (kind === 'stock_check') return { headline: 'Petrol 380 L over', line: 'l', severity: 'problem', weight: 1 };
      return null;
    });
    const f = feed({
      reports: [
        report('dsr_variation', { sentAt: '2026-11-24T09:00:00.000Z' }),
        report('stock_check', { sentAt: '2026-11-24T01:00:00.000Z' }),
      ],
    });
    expect(buildAlerts(f, 'en', true, kindName).map((i) => i.headline)).toEqual(['Petrol 380 L over', 'Diesel 520 L short']);
  });

  it('lists every tanker receipt and order, so an older shortage is not hidden by a newer clean one', () => {
    h.alert.mockImplementation((_k: string, data: { marker?: string }) =>
      data.marker === 'short' ? alert('Tanker came short by 120 L', 'problem') : null,
    );
    const f = feed({
      reports: [
        report('tt_ack', { messageId: 'fine', sentAt: '2026-11-24T09:00:00.000Z', data: snap('tt_ack', { marker: 'fine' }) }),
        report('tt_ack', { messageId: 'short', sentAt: '2026-11-22T09:00:00.000Z', data: snap('tt_ack', { marker: 'short' }) }),
      ],
    });
    const items = buildAlerts(f, 'en', true, kindName);
    expect(items.map((i) => i.report.messageId)).toEqual(['short']);
    expect(items[0]).toMatchObject({ headline: 'Tanker came short by 120 L', severity: 'problem' });
  });

  it('lists a refused order and a later different order separately (fuel orders are keyed by order)', () => {
    h.alert.mockImplementation((_k: string, data: { marker?: string }) =>
      data.marker === 'refused' ? alert('Order refused') : null,
    );
    const f = feed({
      reports: [
        report('fuel_order', { messageId: 'next', sentAt: '2026-11-24T09:00:00.000Z', data: snap('fuel_order', { marker: 'ok' }) }),
        report('fuel_order', { messageId: 'old', sentAt: '2026-11-24T01:00:00.000Z', data: snap('fuel_order', { marker: 'refused' }) }),
      ],
    });
    expect(buildAlerts(f, 'en', true, kindName).map((i) => i.report.messageId)).toEqual(['old']);
  });

  describe('an old alarm the server has aged out (status "info" on an aging kind)', () => {
    const stopped = (status: TodayReport['status']) =>
      report('ro_supply', { status, day: '2026-11-21', sentAt: '2026-11-21T09:00:00.000Z', data: snap('ro_supply', { blocked: true }) });

    it('raises no card, though the frozen snapshot still says "cannot lift fuel"', () => {
      h.alert.mockReturnValue(alert('Your outlet cannot lift fuel right now', 'problem'));
      expect(buildAlerts(feed({ reports: [stopped('info')] }), 'en', true, kindName)).toEqual([]);
    });

    it('still raises the card while the status is "needs a look"', () => {
      h.alert.mockReturnValue(alert('Your outlet cannot lift fuel right now', 'problem'));
      expect(buildAlerts(feed({ reports: [stopped('attention')] }), 'en', true, kindName)).toHaveLength(1);
    });

    it.each(['ro_supply', 'water_ingress', 'stock_check', 'fuel_order', 'load_plan'] as const)(
      'ages out %s',
      (kind) => {
        h.alert.mockReturnValue(alert('old'));
        expect(buildAlerts(feed({ reports: [report(kind, { status: 'info' })] }), 'en', true, kindName)).toEqual([]);
      },
    );

    it('does not age out a kind that never ages: an important announcement still raises its card', () => {
      h.alert.mockReturnValue(alert('Important notice'));
      expect(buildAlerts(feed({ reports: [report('announcement', { status: 'info' })] }), 'en', true, kindName)).toHaveLength(1);
    });
  });

  it('keeps an old report that was marked "needs a look" as a card in the team\'s words', () => {
    const f = feed({ reports: [report('credit_dod', { data: undefined, status: 'attention', headline: 'Credit is over the limit.' })] });
    const items = buildAlerts(f, 'en', true, kindName);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      headline: 'name:credit_dod',
      line: 'Credit is over the limit.',
      severity: 'attention',
      fromWords: true,
    });
  });

  it('does not flag an older report that is merely for information', () => {
    const f = feed({ reports: [report('water_ingress', { data: undefined, status: 'info' })] });
    expect(buildAlerts(f, 'en', true, kindName)).toEqual([]);
  });

  it('never raises an owner-only alert for a manager', () => {
    h.alert.mockReturnValue(alert('Rs 2,30,000 overdue', 'problem'));
    const f = feed({ reports: [report('credit_dod')] });
    expect(buildAlerts(f, 'en', false, kindName)).toEqual([]);
    expect(buildAlerts(f, 'en', true, kindName)).toHaveLength(1);
  });

  it('does not let one kind that throws hide the others', () => {
    h.alert.mockImplementation((kind: string) => {
      if (kind === 'stock_check') throw new Error('bad snapshot');
      return alert('Water');
    });
    const f = feed({ reports: [report('stock_check'), report('water_ingress')] });
    expect(buildAlerts(f, 'en', true, kindName).map((i) => i.headline)).toEqual(['Water']);
  });
});

describe('a thing is shown once: a task under "Needs you" replaces the same kind\'s alert', () => {
  const alert = (headline: string): KindAlert => ({ headline, line: `${headline} line`, severity: 'attention' });
  const task = (over: Partial<TodayFeed['tasks'][number]>): TodayFeed['tasks'][number] => ({
    id: 't1',
    kind: 'du_otp',
    title: 'x',
    since: '2026-11-24T05:00:00.000Z',
    conversationId: 'c1',
    messageId: 'box',
    ...over,
  });

  it('drops the DU OTP alert while the DU OTP steps are an open task', () => {
    h.alert.mockReturnValue(alert('DU OTP waiting'));
    const f = feed({ reports: [report('du_otp'), report('water_ingress')], tasks: [task({ kind: 'du_otp' })] });
    const { items, covered } = buildAlertsAndCovered(f, 'en', true, kindName);
    expect(items.map((i) => i.report.kind)).toEqual(['water_ingress']);
    expect([...covered]).toEqual(['m-du_otp']);
  });

  it('keeps the alert when no such task is open', () => {
    h.alert.mockReturnValue(alert('DU OTP waiting'));
    const f = feed({ reports: [report('du_otp')], tasks: [task({ kind: 'mock_drill' })] });
    expect(buildAlertsAndCovered(f, 'en', true, kindName).items.map((i) => i.report.kind)).toEqual(['du_otp']);
    expect(buildAlertsAndCovered(f, 'en', true, kindName).covered.size).toBe(0);
  });

  it('does the same for a mock drill and for a declaration', () => {
    h.alert.mockReturnValue(alert('needs you'));
    const f = feed({
      reports: [report('mock_drill'), report('declaration_filed')],
      tasks: [task({ id: 'a', kind: 'mock_drill' }), task({ id: 'b', kind: 'declarations' })],
    });
    expect(buildAlertsAndCovered(f, 'en', true, kindName).items).toEqual([]);
  });

  it('covers an old words-only warning of that kind too, and reports it as covered so it is not listed as an earlier report', () => {
    const f = feed({
      reports: [report('du_otp', { data: undefined, status: 'attention', headline: 'A paper is due.' })],
      tasks: [task({ kind: 'du_otp' })],
    });
    const { items, covered } = buildAlertsAndCovered(f, 'en', true, kindName);
    expect(items).toEqual([]);
    expect([...covered]).toEqual(['m-du_otp']);
  });

  it('does not count a quiet report of that kind as covered: it is an ordinary row', () => {
    h.alert.mockReturnValue(null);
    const f = feed({ reports: [report('du_otp', { data: undefined, status: 'ok' })], tasks: [task({ kind: 'du_otp' })] });
    expect(buildAlertsAndCovered(f, 'en', true, kindName).covered.size).toBe(0);
  });

  it('leaves every other kind alone, whatever tasks are open', () => {
    h.alert.mockReturnValue(alert('Water'));
    const f = feed({ reports: [report('water_ingress')], tasks: [task({ kind: 'du_otp' }), task({ id: 'x', kind: 'mock_drill' })] });
    expect(buildAlerts(f, 'en', true, kindName)).toHaveLength(1);
  });
});

describe('headlineOf', () => {
  it("is the kind's own line when it has one", () => {
    h.headline.mockReturnValue('Safety declaration filed');
    const r = report('declaration_filed');
    expect(headlineOf(r, r.data, 'en')).toBe('Safety declaration filed');
  });

  it("falls back to the team's words when there is no snapshot, an empty line, or the kind throws", () => {
    const r = report('declaration_filed', { data: undefined, headline: 'The team wrote this.' });
    expect(headlineOf(r, undefined, 'en')).toBe('The team wrote this.');
    const r2 = report('declaration_filed', { headline: 'Team words' });
    expect(headlineOf(r2, r2.data, 'en')).toBe('Team words');
    h.headline.mockImplementation(() => {
      throw new Error('x');
    });
    expect(headlineOf(r2, r2.data, 'en')).toBe('Team words');
  });
});
