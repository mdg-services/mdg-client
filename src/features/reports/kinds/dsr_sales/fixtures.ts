import type {
  DsrLedgerRow,
  DsrSalesBlock,
  DsrSalesData,
  DsrVariationBlock,
  DsrVariationData,
  LoadPlanData,
  ReportDetail,
  StockCheckData,
} from '@dk/shared/types';

/**
 * Test fixtures for the four stock-and-sales kinds: realistic snapshots (the numbers of the
 * ADR's own examples) and small builders to bend one field at a time. Not imported by app code.
 */

export const CAPTURED = '2026-11-24T13:35:00.000Z'; // 7:05 pm IST on 24 Nov 2026

export function ledgerRow(over: Partial<DsrLedgerRow> = {}): DsrLedgerRow {
  return {
    day: '2026-11-23',
    open: false,
    dip: 123.4,
    waterDip: 0,
    openingStockL: 26_000,
    receiptL: 8_000,
    receiptSource: 'iras',
    totalStockL: 34_000,
    pumps: [
      { nozzleNo: 1, reading: 120_500 },
      { nozzleNo: 2, reading: 98_200 },
    ],
    testingL: 20,
    soldL: 10_430,
    monthToDateL: 230_000,
    newMonth: false,
    remarks: null,
    ...over,
  };
}

export function salesBlock(over: Partial<DsrSalesBlock> = {}): DsrSalesBlock {
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 10, 10 + i)).toISOString().slice(0, 10);
    return { day: d, soldL: 9_000 + i * 100 };
  });
  return {
    state: 'closed',
    closedDay: '2026-11-23',
    soldL: 10_430,
    receiptL: 8_000,
    receiptSource: 'manual',
    testingL: 20,
    monthToDateL: 230_000,
    stockNowL: 24_330,
    sameWeekdayLastWeek: { day: '2026-11-16', soldL: 9_840 },
    trend: days.map((d) => (d.day === '2026-11-23' ? { ...d, soldL: 10_430 } : d.day === '2026-11-16' ? { ...d, soldL: 9_840 } : d)),
    rows: [
      ledgerRow({ day: '2026-11-22', soldL: 10_100 }),
      ledgerRow({ day: '2026-11-23', receiptSource: 'manual' }),
      ledgerRow({ day: '2026-11-24', open: true, soldL: null, monthToDateL: null }),
    ],
    ...over,
  };
}

export const PENDING_SALES: DsrSalesBlock = salesBlock({
  state: 'pending',
  closedDay: null,
  soldL: null,
  receiptL: null,
  receiptSource: null,
  testingL: null,
  monthToDateL: null,
  stockNowL: null,
  sameWeekdayLastWeek: null,
  trend: [],
  rows: [],
});

export function salesData(over: Partial<DsrSalesData> = {}): DsrSalesData {
  return {
    kind: 'dsr_sales',
    v: 1,
    capturedAt: CAPTURED,
    outletCode: '12E',
    businessDate: '2026-11-23',
    shiftTime: '06:00',
    revised: false,
    products: [
      { key: 'HSD', tankNos: [4, 6, 8], sales: salesBlock() },
      {
        key: 'MS',
        tankNos: [1],
        sales: salesBlock({
          soldL: 4_210,
          receiptL: 4_000,
          receiptSource: 'inferred',
          stockNowL: 9_100,
          sameWeekdayLastWeek: { day: '2026-11-16', soldL: 4_385 },
          rows: [ledgerRow({ day: '2026-11-23', soldL: 4_210, receiptSource: 'inferred' })],
        }),
      },
    ],
    ...over,
  };
}

export function variationBlock(over: Partial<DsrVariationBlock> = {}): DsrVariationBlock {
  return {
    tone: 'ok',
    variationL: -200,
    permissibleL: 420,
    offL: 0,
    lowEdgeL: -420,
    highEdgeL: 310,
    band: { stockPct: 4, stockL: 310, leakPct: 0.5, leakL: 110, leakApplies: true },
    sinceDate: '2026-10-12',
    receiptSinceL: 120_000,
    testSinceL: 640,
    ...over,
  };
}

export const SHORT_BLOCK = variationBlock({ tone: 'low', variationL: -520, offL: -100 });
export const OVER_BLOCK = variationBlock({
  tone: 'high',
  variationL: 380,
  permissibleL: 310,
  offL: 70,
  band: { stockPct: 4, stockL: 310, leakPct: null, leakL: 0, leakApplies: false },
});

export function variationData(over: Partial<DsrVariationData> = {}): DsrVariationData {
  return {
    kind: 'dsr_variation',
    v: 1,
    capturedAt: CAPTURED,
    outletCode: '12E',
    businessDate: '2026-11-23',
    shiftTime: '06:00',
    sheets: ['variation'],
    revised: false,
    products: [
      { key: 'HSD', tankNos: [4, 6, 8], variation: SHORT_BLOCK },
      { key: 'MS', tankNos: [1], variation: variationBlock() },
    ],
    ...over,
  };
}

export function stockData(over: Partial<StockCheckData> = {}): StockCheckData {
  const at = '2026-11-24T04:44:00.000Z'; // 10:14 am IST
  return {
    kind: 'stock_check',
    v: 1,
    capturedAt: at,
    outletCode: '12E',
    readingAt: at,
    stale: false,
    fuels: [
      {
        fuelKey: 'HSD',
        prodCode: '103',
        totalL: 16_200,
        tanksRead: 2,
        tanksNoReading: 1,
        tanks: [
          { tankNo: 4, litres: 6_200, waterL: 0.4, at, gaugeOk: true, capacityL: 10_000, lowLineL: 1_500 },
          { tankNo: 6, litres: 10_000, waterL: 0, at: '2026-11-24T04:14:00.000Z', gaugeOk: true, capacityL: 12_000, lowLineL: 1_500 },
          { tankNo: 8, litres: null, waterL: null, at, gaugeOk: false },
        ],
      },
      {
        fuelKey: 'MS',
        prodCode: '101',
        totalL: 8_130,
        tanksRead: 1,
        tanksNoReading: 0,
        tanks: [{ tankNo: 1, litres: 8_130, waterL: 0, at, gaugeOk: true }],
      },
    ],
    cover: {
      planDay: '2026-11-24',
      fuels: [
        { fuelKey: 'HSD', daysLeft: 3.6, runOutOn: '2026-11-28' },
        { fuelKey: 'MS', daysLeft: 9.2, runOutOn: '2026-12-03' },
      ],
    },
    ...over,
  };
}

export function loadPlanData(over: Partial<LoadPlanData> = {}): LoadPlanData {
  return {
    kind: 'load_plan',
    v: 1,
    capturedAt: CAPTURED,
    outletCode: '12E',
    planDay: '2026-11-24',
    severity: 'order_today',
    verdict: { code: 'ORDER_TODAY', tankers: 1, products: ['HSD'], closedDays: [], nextOrderOn: null, horizonDays: 4 },
    pools: [
      {
        key: 'HSD-4-6',
        product: 'HSD',
        tankNos: [4, 6],
        stockL: 6_000,
        lowLineL: 3_000,
        daysLeft: 2.4,
        runOutOn: '2026-11-26',
        atLine: true,
        tanks: [
          { tankNo: 4, stockL: 3_000, capacityL: 10_000, lowLineL: 1_500, estimated: true },
          { tankNo: 6, stockL: 3_000, capacityL: 12_000, lowLineL: 1_500, estimated: false },
        ],
      },
      {
        key: 'HSD-8',
        product: 'HSD',
        tankNos: [8],
        stockL: 5_000,
        lowLineL: 1_500,
        daysLeft: null,
        runOutOn: null,
        atLine: false,
        tanks: [{ tankNo: 8, stockL: 5_000, capacityL: 10_000, lowLineL: 1_500, estimated: false }],
      },
      {
        key: 'MS-1',
        product: 'MS',
        tankNos: [1],
        stockL: 8_130,
        lowLineL: 2_000,
        daysLeft: 9.2,
        runOutOn: '2026-12-03',
        atLine: false,
        tanks: [{ tankNo: 1, stockL: 8_130, capacityL: 20_000, lowLineL: 2_000, estimated: false }],
      },
    ],
    order: {
      orderOn: '2026-11-24',
      loadOn: '2026-11-25',
      arriveOn: '2026-11-25',
      arriveDate: '2026-11-25',
      arriveTime: '16:00',
      trucks: [
        {
          full: true,
          chambers: [
            { litres: 4_000, product: 'HSD', poolKey: 'HSD-4-6', tankNo: 4 },
            { litres: 4_000, product: 'HSD', poolKey: 'HSD-4-6', tankNo: 6 },
            { litres: 2_000, product: 'MS', poolKey: 'MS-1', tankNo: 1 },
            { litres: 0, product: null, poolKey: null, tankNo: null },
          ],
        },
      ],
    },
    projection: [
      { date: '2026-11-24', depotClosed: false, tankers: 1, litresByProduct: { HSD: 8_000, MS: 2_000 }, cover: [] },
      { date: '2026-11-25', depotClosed: false, tankers: 0, litresByProduct: {}, cover: [] },
      { date: '2026-11-26', depotClosed: true, tankers: 0, litresByProduct: {}, cover: [] },
      { date: '2026-11-27', depotClosed: false, tankers: 1, litresByProduct: { MS: 6_000 }, cover: [] },
    ],
    depotClosed: ['2026-11-26'],
    inTransit: [{ product: 'HSD', litres: 6_000, invoiceDate: '2026-11-22', vehicleNo: 'BR01GA1234', estimated: true }],
    credit: { availableRs: 12_000, shortByRs: 40_000 },
    ...over,
  };
}

/** A minimal `ReportDetail` for an overlay's `report` prop (the four kinds read none of it today). */
export function fakeReport(kind: ReportDetail['kind']): ReportDetail {
  return {
    id: 'r1',
    kind,
    status: 'ok',
    sentAt: CAPTURED,
    headline: '',
    attachments: [],
    conversationId: 'c1',
    messageId: 'm1',
    live: {},
  };
}
