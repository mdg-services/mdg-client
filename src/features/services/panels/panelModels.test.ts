import { describe, expect, it } from 'vitest';

import {
  NOW,
  creditData,
  declarationData,
  paperData,
  planData,
  report,
  salesData,
  stockData,
  supplyData,
  variationData,
  waterData,
} from '@/features/glance/glanceFixtures';
import type { ComplaintDealerView, WorkPermitDealerView } from '@dk/shared/types';

import { splitComplaints, splitPermits } from './boxPanels';
import {
  ackModel,
  creditModel,
  declarationsModel,
  densityLines,
  dsrDoorLine,
  dsrModel,
  duLines,
  fuelDoorLine,
  mockDrillOf,
  ordersInFlight,
  papersSorted,
  paperStatus,
  planModel,
  roomLeft,
  stockModel,
  supplyModel,
  waterModel,
} from './panelModels';

const snap = <T extends object>(over: T) => over;

describe('Daily sales report panel', () => {
  it('reads the litres, the change on the same weekday, the month and 14 consecutive days (a gap is null, never 0)', () => {
    const data = salesData({ soldL: 24_330, lastWeek: 22_000, trend: [20_000, 21_000, 24_330] });
    const m = dsrModel([report('dsr_sales', { data })], true, 'en')!;
    expect(m.sales!.totalL).toBe(24_330);
    expect(m.sales!.deltaPct).toBe(11);
    expect(m.sales!.weekday).toBe('Thursday');
    expect(m.sales!.monthL).toBe(410_000);
    expect(m.sales!.fuels).toEqual([{ key: 'HSD', fuel: 'Diesel', soldL: 24_330, deltaPct: 11 }]);
    expect(m.sales!.bars).toHaveLength(14);
    expect(m.sales!.bars.at(-1)).toEqual({ day: '2026-11-22', litres: 24_330 });
    expect(m.sales!.bars.filter((b) => b.litres === null)).toHaveLength(11);
  });

  it('draws no change when last week cannot be told, and never draws pending sales as 0', () => {
    const noWeek = dsrModel(
      [report('dsr_sales', { data: salesData({ lastWeek: null }) })],
      true,
      'en',
    )!;
    expect(noWeek.sales!.deltaPct).toBeNull();
    const pending = dsrModel(
      [report('dsr_sales', { data: salesData({ soldL: null }) })],
      true,
      'en',
    )!;
    expect(pending.sales).toBeNull();
    expect(pending.salesPending).toBe(true);
  });

  it('lists what was corrected after the report was first shared', () => {
    const data = {
      ...salesData(),
      revised: true,
      revision: {
        changed: [
          { productKey: 'HSD', fromL: 12_000, toL: 12_100, wasWithin: true, isWithin: true },
        ],
      },
    };
    expect(dsrModel([report('dsr_sales', { data })], true, 'en')!.sales!.corrected).toEqual([
      { fuel: 'Diesel', fromL: 12_000, toL: 12_100 },
    ]);
  });

  it('reads the sales out of a message that carries both sheets', () => {
    const both = {
      ...variationData(),
      sheets: ['variation', 'sales'],
      products: [{ ...variationData().products[0]!, sales: salesData().products[0]!.sales }],
    };
    const m = dsrModel([report('dsr_variation', { data: both })], true, 'en')!;
    expect(m.sales!.totalL).toBe(24_000);
    expect(m.variation!.fuels).toHaveLength(1);
  });

  it('works out the room left in the band from the value and its edges', () => {
    expect(roomLeft(-170, -480, 480)).toBe(310);
    expect(roomLeft(100, -480, 380)).toBe(280);
    expect(roomLeft(-500, -480, 480)).toBe(0);
    const m = dsrModel([report('dsr_variation', { data: variationData() })], true, 'en')!;
    expect(m.variation!.fuels[0]).toMatchObject({
      fuel: 'Diesel',
      inside: true,
      beyondL: 0,
      roomL: 310,
      permissibleL: 480,
    });
  });

  it('says "beyond" for a fuel outside its band', () => {
    const m = dsrModel(
      [report('dsr_variation', { data: variationData({ offL: -90 }) })],
      true,
      'en',
    )!;
    expect(m.variation!.fuels[0]).toMatchObject({ inside: false, beyondL: 90 });
  });

  it('counts the days inside the limit only from three days up, skipping days before the first inspection', () => {
    const day = (d: number, off = 0, before = false) => {
      const date = `2026-11-${String(d).padStart(2, '0')}`;
      return report('dsr_variation', {
        day: date,
        sentAt: `${date}T20:00:00.000Z`,
        data: { ...variationData({ offL: off, beforeInspection: before }), businessDate: date },
      });
    };
    expect(dsrModel([day(26), day(25)], true, 'en')!.insideDays).toBeNull();
    const m = dsrModel([day(26), day(25, 40), day(24), day(23, 0, true)], true, 'en')!;
    expect(m.insideDays).toEqual({ n: 2, m: 3 });
  });

  it('says nothing when there is no DSR report at all', () => {
    expect(dsrModel([], true, 'en')).toBeNull();
  });
});

describe('Credit and DOD panel', () => {
  it('counts the days left again from the date, and takes the review date the same way', () => {
    const data = {
      ...creditData({ date: '2026-11-30', daysLeft: 3 }),
      review: { on: '2026-12-10', daysUntil: 99, lapsed: false },
    };
    const m = creditModel([report('credit_dod', { data })], NOW)!;
    expect(m.daysLeft).toBe(3);
    expect(m.review).toEqual({ on: '2026-12-10', daysUntil: 13, lapsed: false });
    expect(
      creditModel(
        [report('credit_dod', { data: creditData({ date: '2026-11-25', daysLeft: 3 }) })],
        NOW,
      )!.daysLeft,
    ).toBe(-2);
  });
  it("is the owner's alone: a manager gets nothing from the same report", () => {
    expect(creditModel([], NOW)).toBeNull();
  });
});

describe('Water, plan, papers, density', () => {
  it('reads the water checks of the newest report', () => {
    expect(
      waterModel([report('water_ingress', { data: waterData() })], true)!.data.recordedSlots,
    ).toBe(10);
    expect(
      waterModel([report('water_ingress', { data: waterData({ total: 0, recorded: 0 }) })], true),
    ).toBeNull();
  });

  it('builds four days of cover per pool and knows when the order is for now', () => {
    const m = planModel(
      [report('load_plan', { data: planData({ code: 'ORDER_TODAY' }) })],
      true,
      'en',
    )!;
    expect(m.orderNow).toBe(true);
    expect(m.pools[0]!.fuel).toBe('Diesel');
    expect(m.pools[0]!.days).toHaveLength(4);
    expect(m.pools[0]!.tankNos).toEqual([1]);
    expect(
      planModel([report('load_plan', { data: planData({ code: 'NEXT_ORDER' }) })], true, 'en')!
        .orderNow,
    ).toBe(false);
  });

  it('sorts papers by days left counted again from the date, soonest first, with their status', () => {
    const data = paperData([
      { docType: 'fire-noc', daysLeft: 99, validUntil: '2026-12-06' },
      { docType: 'explosive-license', daysLeft: 99, validUntil: '2026-11-26' },
      { docType: 'vehicle-insurance', daysLeft: 5 },
    ]);
    const m = papersSorted([report('paper_expiry', { data })], true, NOW)!;
    expect(m.items.map((i) => i.days)).toEqual([-1, 5, 9]);
    expect([-1, 1, 5, 15, 16].map(paperStatus)).toEqual([
      'problem',
      'problem',
      'attention',
      'attention',
      'ok',
    ]);
  });

  it('shows the latest density of each fuel, as printed', () => {
    const lineOf = (key: string, d: string) => ({
      family: 'DIESEL',
      productKey: key,
      density15Raw: d,
      quantity: 12,
      unit: 'KL',
      tankNo: '1',
    });
    const tanker = (day: string, d: string) =>
      report('tanker_density', {
        sentAt: `${day}T05:00:00.000Z`,
        data: {
          kind: 'tanker_density',
          v: 1,
          capturedAt: `${day}T05:00:00.000Z`,
          outletCode: '1E',
          invoiceNo: day,
          vehicleNo: null,
          vehicleKey: null,
          invoiceDate: day,
          invoiceTime: null,
          lines: [lineOf('HSD', d)],
          droppedLines: 0,
        },
      });
    const out = densityLines(
      [tanker('2026-11-25', '0.8310'), tanker('2026-11-26', '0.8321')],
      true,
      'en',
    );
    expect(out).toEqual([{ key: 'HSD', fuel: 'Diesel', density: '0.8321', day: '2026-11-26' }]);
  });
});

describe('Filing panels', () => {
  const ack = (
    day: string,
    rows: Array<{ s: number | null; c: number | null }>,
    anyShort: boolean,
  ) =>
    report('tt_ack', {
      sentAt: `${day}T05:00:00.000Z`,
      data: {
        kind: 'tt_ack',
        v: 1,
        capturedAt: `${day}T05:00:00.000Z`,
        outletCode: '1E',
        vehicleNo: null,
        vehicleKey: null,
        ackedAt: `${day}T05:00:00.000Z`,
        condition: 'Excellent',
        anyShort,
        rows: rows.map((r, i) => ({
          invoiceNo: `${i}`,
          invoiceDate: day,
          short: r.s ? 'short' : 'none',
          totalShortL: r.s,
          claimShortL: r.c,
          products: [],
        })),
      },
    });

  it('sums the litres short and claimed over every receipt it holds, and says nothing about money', () => {
    const m = ackModel(
      [
        ack('2026-11-26', [{ s: 40, c: 40 }], true),
        ack(
          '2026-11-25',
          [
            { s: null, c: null },
            { s: 10, c: 0 },
          ],
          true,
        ),
        ack('2026-11-24', [{ s: 0, c: 0 }], false),
      ],
      true,
    )!;
    expect(m).toMatchObject({ receipts: 3, shortReceipts: 2, shortL: 50, claimedL: 40 });
    expect(ackModel([], true)).toBeNull();
  });

  const du = (phase: 'pending' | 'submitted', at: string, ids: string[]) =>
    report('du_otp', {
      sentAt: at,
      data: {
        kind: 'du_otp',
        v: 1,
        outletCode: '1E',
        phase,
        events: ids.map((id) => ({
          otpId: id,
          duMake: 'Gilbarco',
          duModel: 'G1',
          duSerial: 's',
          nozzleNo: '3',
          transactionDate: null,
          transactionDateText: '',
          groupKey: id,
        })),
        moreCount: 0,
      },
    });

  it('lists the dispensers waiting and those filed: the newest report of each phase, pending first', () => {
    const m = duLines(
      [
        du('submitted', '2026-11-25T05:00:00.000Z', ['a']),
        du('pending', '2026-11-26T05:00:00.000Z', ['b', 'c']),
        du('pending', '2026-11-20T05:00:00.000Z', ['old']),
      ],
      true,
    )!;
    expect(m.lines.map((l) => l.id)).toEqual(['pending-b', 'pending-c', 'submitted-a']);
    expect(duLines([], true)).toBeNull();
  });

  it('draws the safety streak with 14 ticks and the next washroom day', () => {
    const safety = report('declaration_filed', {
      data: {
        ...declarationData({ streak: 23 }),
        recentDays: ['2026-11-26', '2026-11-25', '2026-11-24'],
      },
    });
    const washroom = report('declaration_filed', {
      sentAt: '2026-11-26T01:00:00.000Z',
      data: declarationData({ kind: 'washroom', nextDueDay: '2026-12-03' }),
    });
    const m = declarationsModel([safety, washroom], true)!;
    expect(m.streak).toBe(23);
    expect(m.strip).toHaveLength(14);
    expect(m.strip.filter((d) => d.state === 'came').map((d) => d.day)).toEqual([
      '2026-11-24',
      '2026-11-25',
      '2026-11-26',
    ]);
    expect(m.nextWashroomDue).toBe('2026-12-03');
  });

  it('prefers a filed mock drill over one only received', () => {
    const drill = (stage: 'received' | 'filed', at: string) =>
      report('mock_drill', {
        sentAt: at,
        data: {
          kind: 'mock_drill',
          v: 1,
          outletCode: '1E',
          stage,
          submissionId: at,
          mode: 'new',
          scenario: { id: 's', family: 'fire', label: 'Fire' },
          drillDay: '2026-11-20',
          startTime: null,
          durationMinutes: 25,
          level: '1',
          photos: [],
          portalState: 'none',
        },
      });
    expect(
      mockDrillOf(
        [drill('filed', '2026-11-20T05:00:00.000Z'), drill('received', '2026-11-21T05:00:00.000Z')],
        true,
      )!.data.stage,
    ).toBe('filed');
  });

  it('keeps only the orders still on their way, the newest report of each', () => {
    const order = (id: string, stage: string, at: string) =>
      report('fuel_order', {
        sentAt: at,
        data: {
          kind: 'fuel_order',
          v: 1,
          event: 'placed',
          indentId: id,
          orderNo: null,
          source: 'chat',
          stage,
          asOf: at,
          deliveryDay: null,
          lines: [],
          totalKl: 12,
          ttNo: null,
          shipmentAt: null,
        },
      });
    const out = ordersInFlight(
      [
        order('a', 'waiting', '2026-11-26T05:00:00.000Z'),
        order('a', 'closed', '2026-11-27T05:00:00.000Z'),
        order('b', 'tanker_assigned', '2026-11-26T06:00:00.000Z'),
      ],
      true,
    );
    expect(out.map((o) => o.data.indentId)).toEqual(['b']);
  });
});

describe('Supply and stock', () => {
  it("says open, stopped or not known from the portal's own sentence", () => {
    expect(
      supplyModel([report('ro_supply', { data: supplyData({ blocked: false }) })], true, NOW)!.word,
    ).toBe('open');
    expect(
      supplyModel(
        [report('ro_supply', { data: supplyData({ blocked: true, failing: 2 }) })],
        true,
        NOW,
      )!.word,
    ).toBe('stopped');
    expect(
      supplyModel([report('ro_supply', { data: supplyData({ blocked: null }) })], true, NOW)!.word,
    ).toBe('unknown');
  });
  it('shows a reading from an earlier day as information, not as live', () => {
    const old = { ...supplyData(), capturedAt: '2026-11-25T01:30:00.000Z' };
    expect(supplyModel([report('ro_supply', { data: old })], true, NOW)!.old).toBe(true);
    expect(supplyModel([report('ro_supply', { data: supplyData() })], true, NOW)!.old).toBe(false);
  });
  it('calls a stock reading older than a day old', () => {
    expect(stockModel([report('stock_check', { data: stockData() })], true, NOW)!.old).toBe(false);
    expect(
      stockModel(
        [report('stock_check', { data: stockData({ readingAt: '2026-11-25T03:40:00.000Z' }) })],
        true,
        NOW,
      )!.old,
    ).toBe(true);
  });
});

describe('The two chat-box services', () => {
  const complaint = (id: string, stage: ComplaintDealerView['stage'], updatedAt: string) =>
    snap({
      id,
      stage,
      updatedAt,
      route: 'eicts',
      routeLabel: { en: 'Card machine' },
      title: { en: id },
      screen: 'tracking',
      steps: [],
      statusLine: { en: 'x' },
      canCancel: false,
      canCheckNow: false,
    }) as unknown as ComplaintDealerView;
  it('separates open complaints from those closed in the last 30 days', () => {
    const { open, closed } = splitComplaints(
      [
        complaint('a', 'assigned', '2026-11-26T05:00:00.000Z'),
        complaint('b', 'closed', '2026-11-10T05:00:00.000Z'),
        complaint('c', 'closed', '2026-09-01T05:00:00.000Z'),
        complaint('d', 'cancelled', '2026-11-26T05:00:00.000Z'),
      ],
      NOW,
    );
    expect(open.map((c) => c.id)).toEqual(['a']);
    expect(closed.map((c) => c.id)).toEqual(['b']);
  });
  const permit = (id: string, stage: WorkPermitDealerView['stage']) =>
    snap({
      id,
      stage,
      updatedAt: '2026-11-26T05:00:00.000Z',
      title: { en: id },
      screen: 'x',
      statusLine: { en: 'y' },
      hasPdf: false,
      hasLetter: false,
      canCancel: false,
      canFinish: false,
    }) as unknown as WorkPermitDealerView;
  it('puts the permit in force first and leaves closed ones out', () => {
    const { active, others } = splitPermits([
      permit('a', 'issued'),
      permit('b', 'closed'),
      permit('c', 'confirming'),
      permit('d', 'lapsed'),
    ]);
    expect(active.map((p) => p.id)).toEqual(['a']);
    expect(others.map((p) => p.id)).toEqual(['c']);
  });
});

describe("the door's own lines", () => {
  it('says a fuel outside its limit as a sentence, not as a table row', () => {
    const v = (offL: number) => [report('dsr_variation', { data: variationData({ offL }) })];
    expect(dsrDoorLine(v(90), true, 'en')).toBe('Diesel 90 L outside the limit (170 L short)');
    expect(dsrDoorLine(v(90), true, 'hi')).toBe('डीज़ल 90 लीटर सीमा से बाहर (170 लीटर कम)');
    expect(dsrDoorLine(v(90), true, 'hl')).toBe('Diesel 90 L seema se bahar (170 L kam)');
    // No hyphen or minus in the line: the sign is said in a word.
    expect(dsrDoorLine(v(90), true, 'en')).not.toMatch(/[-\u2212\u2013]/);
  });

  it('has no line when every fuel is inside, or the figures are from before the first inspection', () => {
    expect(
      dsrDoorLine([report('dsr_variation', { data: variationData({ offL: 0 }) })], true, 'en'),
    ).toBeNull();
    expect(
      dsrDoorLine(
        [report('dsr_variation', { data: variationData({ offL: 90, beforeInspection: true }) })],
        true,
        'en',
      ),
    ).toBeNull();
    expect(dsrDoorLine([], true, 'en')).toBeNull();
  });

  it('counts the orders on the way and says nothing about a tanker plate', () => {
    const order = (id: string, stage: string) =>
      report('fuel_order', {
        sentAt: '2026-11-26T05:00:00.000Z',
        data: {
          kind: 'fuel_order',
          v: 1,
          event: 'placed',
          indentId: id,
          orderNo: null,
          source: 'chat',
          stage,
          asOf: '2026-11-26T05:00:00.000Z',
          deliveryDay: null,
          lines: [],
          totalKl: 12,
          ttNo: 'BR01GA1234',
          shipmentAt: null,
        },
      });
    expect(
      fuelDoorLine(
        [order('a', 'waiting'), order('b', 'tanker_assigned'), order('c', 'closed')],
        true,
      ),
    ).toBe(2);
    expect(fuelDoorLine([order('c', 'closed')], true)).toBe(0);
    expect(fuelDoorLine([], true)).toBeNull();
  });
});
