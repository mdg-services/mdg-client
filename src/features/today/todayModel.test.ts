import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { KindAlert, KindTile } from '@/features/reports/types';
import type { ReportData, ReportKind, TodayFeed, TodayReport } from '@dk/shared/types';

/** What each kind says, set per test. The real kinds are tested in their own files. */
const h = vi.hoisted(() => ({
  tile: vi.fn(),
  alert: vi.fn(),
  headline: vi.fn(),
}));

vi.mock('@/features/reports/registry', () => ({
  getKindView: (kind: string) => ({
    kind,
    tile: (data: unknown, lang: string) => h.tile(kind, data, lang),
    alert: (data: unknown, lang: string) => h.alert(kind, data, lang),
    headline: (data: unknown, lang: string) => h.headline(kind, data, lang),
  }),
}));

const { buildAlerts, buildAlertsAndCovered, buildTiles, headlineOf } = await import('./todayModel');

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

const tileFor = (value: string, extra: Partial<KindTile> = {}): KindTile => ({ value, ...extra });

beforeEach(() => {
  h.tile.mockReset().mockImplementation((kind: string): KindTile | null => tileFor(`${kind} value`));
  h.alert.mockReset().mockReturnValue(null);
  h.headline.mockReset().mockReturnValue('');
});

const kindName = (k: ReportKind) => `name:${k}`;

describe('buildTiles', () => {
  it('puts the tiles in the one fixed order, whatever order the feed is in', () => {
    const f = feed({
      reports: [
        report('kavach'),
        report('water_ingress'),
        report('credit_dod'),
        report('dsr_variation'),
        report('stock_check'),
        report('dsr_sales'),
        report('load_plan'),
      ],
    });
    expect(buildTiles(f, 'en', true).map((x) => x.slot.id)).toEqual([
      'sales',
      'stock',
      'variation',
      'dues',
      'water',
      'tanker',
      'kavach',
    ]);
  });

  it('only the sales tile spans the width', () => {
    const f = feed({ reports: [report('dsr_sales'), report('stock_check')] });
    expect(buildTiles(f, 'en', true).map((x) => !!x.slot.wide)).toEqual([true, false]);
  });

  it('makes a tile only for a report that has a snapshot', () => {
    const f = feed({ reports: [report('stock_check', { data: undefined }), report('water_ingress')] });
    expect(buildTiles(f, 'en', true).map((x) => x.slot.id)).toEqual(['water']);
  });

  it('leaves out a tile when the kind says it has none to draw', () => {
    h.tile.mockImplementation((kind: string) => (kind === 'kavach' ? null : tileFor('x')));
    const f = feed({ reports: [report('kavach'), report('stock_check')] });
    expect(buildTiles(f, 'en', true).map((x) => x.slot.id)).toEqual(['stock']);
  });

  it('draws kinds that have no tile slot nowhere (supply, ledger, notices)', () => {
    const f = feed({ reports: [report('ro_supply'), report('ledger_watch'), report('announcement'), report('stock_check')] });
    expect(buildTiles(f, 'en', true).map((x) => x.slot.id)).toEqual(['stock']);
  });

  it("gives a manager no dues tile, even if the server's feed carried one", () => {
    const f = feed({ role: 'manager', reports: [report('credit_dod'), report('stock_check')] });
    expect(buildTiles(f, 'en', false).map((x) => x.slot.id)).toEqual(['stock']);
  });

  it('asks the kind with the snapshot and the reader\'s language', () => {
    const data = snap('stock_check', { marker: 1 });
    buildTiles(feed({ reports: [report('stock_check', { data })] }), 'hl', true);
    expect(h.tile).toHaveBeenCalledWith('stock_check', data, 'hl');
  });

  it('the next-tanker tile takes the newest of the plan and the order', () => {
    const f = feed({
      reports: [
        report('load_plan', { sentAt: '2026-11-24T05:00:00.000Z', messageId: 'plan' }),
        report('fuel_order', { sentAt: '2026-11-24T09:00:00.000Z', messageId: 'order' }),
      ],
    });
    const tiles = buildTiles(f, 'en', true);
    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toMatchObject({ kind: 'fuel_order' });
    expect(tiles[0]!.report.messageId).toBe('order');
  });

  it('the next-tanker tile falls back to the other when the newest has nothing to show', () => {
    h.tile.mockImplementation((kind: string) => (kind === 'fuel_order' ? null : tileFor('plan')));
    const f = feed({
      reports: [
        report('load_plan', { sentAt: '2026-11-24T05:00:00.000Z' }),
        report('fuel_order', { sentAt: '2026-11-24T09:00:00.000Z' }),
      ],
    });
    expect(buildTiles(f, 'en', true)[0]).toMatchObject({ kind: 'load_plan' });
  });

  it('prefers the newer business day over the newer message', () => {
    const f = feed({
      reports: [
        // Sent later, but about an earlier day (the dealer asked for it again).
        report('stock_check', { messageId: 'again', day: '2026-11-22', sentAt: '2026-11-24T09:00:00.000Z', data: snap('stock_check') }),
        report('stock_check', { messageId: 'today', day: '2026-11-24', sentAt: '2026-11-24T06:00:00.000Z', data: snap('stock_check') }),
      ],
    });
    expect(buildTiles(f, 'en', true)[0]!.report.messageId).toBe('today');
  });

  it('finds a report among the receipts too', () => {
    const f = feed({ done: [report('kavach')] });
    expect(buildTiles(f, 'en', true).map((x) => x.slot.id)).toEqual(['kavach']);
  });

  it('does not let one kind that throws take the page down', () => {
    h.tile.mockImplementation((kind: string) => {
      if (kind === 'stock_check') throw new Error('bad snapshot');
      return tileFor('ok');
    });
    const f = feed({ reports: [report('stock_check'), report('water_ingress')] });
    expect(buildTiles(f, 'en', true).map((x) => x.slot.id)).toEqual(['water']);
  });

  describe('a message that holds both DSR sheets', () => {
    const both = () =>
      report('dsr_variation', {
        messageId: 'm-both',
        data: snap('dsr_variation', {
          sheets: ['variation', 'sales'],
          capturedAt: '2026-11-24T05:00:00.000Z',
          outletCode: '12E',
          businessDate: '2026-11-23',
          shiftTime: null,
          revised: false,
          products: [{ key: 'diesel', tankNos: [1], variation: {}, sales: { total: 1 } }],
        }),
      });

    it('fills the sales tile from the sales sheet and the variation tile from the variation', () => {
      const tiles = buildTiles(feed({ reports: [both()] }), 'en', true);
      expect(tiles.map((x) => x.slot.id)).toEqual(['sales', 'variation']);
      // Both open the one message.
      expect(tiles.map((x) => x.report.messageId)).toEqual(['m-both', 'm-both']);
      const salesCall = h.tile.mock.calls.find((c) => c[0] === 'dsr_sales');
      expect(salesCall?.[1]).toMatchObject({ kind: 'dsr_sales', businessDate: '2026-11-23' });
      expect(salesCall?.[1]).not.toHaveProperty('sheets');
    });

    it('draws no sales tile from a message that holds only the variation', () => {
      const only = report('dsr_variation', { data: snap('dsr_variation', { sheets: ['variation'], products: [] }) });
      expect(buildTiles(feed({ reports: [only] }), 'en', true).map((x) => x.slot.id)).toEqual(['variation']);
    });

    it('takes a newer sales-only report over the older combined message', () => {
      const newer = report('dsr_sales', { messageId: 'm-new', day: '2026-11-24', data: snap('dsr_sales', { businessDate: '2026-11-24' }) });
      const tiles = buildTiles(feed({ reports: [both(), newer] }), 'en', true);
      expect(tiles[0]!.report.messageId).toBe('m-new');
    });
  });
});

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

    it.each(['ro_supply', 'water_ingress', 'stock_check', 'kavach', 'fuel_order', 'load_plan'] as const)(
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

    it('is not "covered" by an open task either: it is an ordinary row', () => {
      h.alert.mockReturnValue(alert('Kavach photo'));
      const kavachAsk: TodayFeed['tasks'][number] = {
        id: 'ask:kv:9',
        kind: 'ask',
        title: 'x',
        since: '2026-11-24T05:00:00.000Z',
        conversationId: 'c1',
        messageId: 'box',
        action: { type: 'photo', askRef: 'kv:9', acceptsFile: false },
      };
      const f = feed({ reports: [report('kavach', { status: 'info' })], tasks: [kavachAsk] });
      expect(buildAlertsAndCovered(f, 'en', true, kindName).covered.size).toBe(0);
    });

    it('keeps the tile and its figure but takes the warning off it', () => {
      h.tile.mockReturnValue(tileFor('10 / 12 done', { status: 'attention' }));
      const aged = buildTiles(feed({ reports: [report('water_ingress', { status: 'info', day: '2026-11-20' })] }), 'en', true);
      expect(aged[0]!.tile).toMatchObject({ value: '10 / 12 done', status: 'ok' });
      const live = buildTiles(feed({ reports: [report('water_ingress', { status: 'attention' })] }), 'en', true);
      expect(live[0]!.tile.status).toBe('attention');
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

describe('a thing is shown once: a task under "Your work" replaces the same kind\'s alert', () => {
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

  it('drops a Kavach alert while one of its photo asks is open, but not for a different ask', () => {
    h.alert.mockReturnValue(alert('Kavach photo'));
    const kavachAsk = task({ id: 'ask:kv:9', kind: 'ask', action: { type: 'photo', askRef: 'kv:9', acceptsFile: false } });
    const otherAsk = task({ id: 'ask:doc:1', kind: 'ask', action: { type: 'photo', askRef: 'doc:1', acceptsFile: true } });
    expect(buildAlerts(feed({ reports: [report('kavach')], tasks: [kavachAsk] }), 'en', true, kindName)).toEqual([]);
    expect(buildAlerts(feed({ reports: [report('kavach')], tasks: [otherAsk] }), 'en', true, kindName)).toHaveLength(1);
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

describe('tile day', () => {
  it('carries the business day the figures are about, for the tile to say when it is not today', () => {
    const items = buildTiles(feed({ reports: [report('dsr_variation', { day: '2026-11-21' })] }), 'en', true);
    expect(items[0]!.day).toBe('2026-11-21');
  });
});
