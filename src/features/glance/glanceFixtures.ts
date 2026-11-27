import type {
  KavachDealerItem,
  KavachDealerView,
  ReportData,
  ReportKind,
  ReportStatus,
  TodayFeed,
  TodayReport,
  TodayTask,
} from '@dk/shared/types';

/**
 * Small builders for the tests of the glance model and its neighbours. A snapshot is built from the
 * fields the model reads and cast to the full type: the model never reads the rest.
 */

/** 27 Nov 2026, 9:40 am India time (a Friday). */
export const NOW = new Date('2026-11-27T04:10:00.000Z');
/** The same minute, as the query's `dataUpdatedAt`. */
export const FETCHED_NOW = NOW.getTime();
export const TODAY = '2026-11-27';
export const YESTERDAY = '2026-11-26';

let counter = 0;

export function report(kind: ReportKind, over: Partial<TodayReport> & { data?: unknown } = {}): TodayReport {
  counter += 1;
  const { data, ...rest } = over;
  return {
    id: `r${counter}`,
    kind,
    status: 'ok' as ReportStatus,
    day: YESTERDAY,
    sentAt: '2026-11-27T01:35:00.000Z',
    headline: `${kind} headline`,
    attachments: [],
    conversationId: 'c1',
    messageId: `m${counter}`,
    ...(data === undefined ? {} : { data: data as ReportData }),
    ...rest,
  };
}

export function task(over: Partial<TodayTask> = {}): TodayTask {
  counter += 1;
  return {
    id: `t${counter}`,
    kind: 'declarations',
    title: 'Send the safety declaration',
    since: '2026-11-27T02:00:00.000Z',
    conversationId: 'c1',
    messageId: `tm${counter}`,
    ...over,
  };
}

export function feed(over: Partial<TodayFeed> = {}): TodayFeed {
  return { day: TODAY, role: 'owner', tasks: [], reports: [], done: [], ...over };
}

/** A DSR sales snapshot of one fuel. */
export function salesData(over: { day?: string; soldL?: number | null; lastWeek?: number | null; month?: number | null; trend?: number[] } = {}) {
  const day = over.day ?? YESTERDAY;
  const soldL = over.soldL === undefined ? 24_000 : over.soldL;
  const trend = over.trend ?? [20_000, 21_000, 22_000, 19_000, 23_000, 22_500, soldL ?? 0];
  return {
    kind: 'dsr_sales',
    v: 1,
    capturedAt: `${day}T20:00:00.000Z`,
    outletCode: '1E',
    businessDate: day,
    shiftTime: null,
    revised: false,
    products: [
      {
        key: 'HSD',
        tankNos: [1],
        sales: {
          state: soldL === null ? 'pending' : 'closed',
          closedDay: day,
          soldL,
          receiptL: null,
          receiptSource: null,
          testingL: null,
          monthToDateL: over.month === undefined ? 410_000 : over.month,
          stockNowL: null,
          sameWeekdayLastWeek: over.lastWeek === null ? null : { day: '2026-11-19', soldL: over.lastWeek ?? 22_000 },
          trend: trend.map((l, i) => ({ day: `2026-11-${String(20 + i).padStart(2, '0')}`, soldL: l })),
          rows: [],
        },
      },
    ],
  };
}

export function variationData(over: { offL?: number; beforeInspection?: boolean } = {}) {
  return {
    kind: 'dsr_variation',
    v: 1,
    capturedAt: `${YESTERDAY}T20:00:00.000Z`,
    outletCode: '1E',
    businessDate: YESTERDAY,
    shiftTime: null,
    sheets: ['variation'],
    revised: false,
    ...(over.beforeInspection ? { beforeInspection: true } : {}),
    products: [
      {
        key: 'HSD',
        tankNos: [1],
        variation: { tone: 'ok', variationL: -170, permissibleL: 480, offL: over.offL ?? 0, lowEdgeL: -480, highEdgeL: 480 },
      },
    ],
  };
}

export function creditData(over: { date?: string | null; amount?: number; verdict?: string; daysLeft?: number; usedPct?: number | null } = {}) {
  return {
    kind: 'credit_dod',
    v: 1,
    outletCode: '1E',
    asOf: YESTERDAY,
    capturedAt: `${YESTERDAY}T20:00:00.000Z`,
    backdated: false,
    festivalKey: null,
    verdict: over.verdict ?? 'due_soon',
    money: {
      amount: over.amount ?? 118_000,
      dueAmount: over.amount ?? 118_000,
      date: over.date === undefined ? '2026-11-30' : over.date,
      daysLeft: over.daysLeft ?? 3,
      dateIsApprox: false,
      daysIsMinimum: false,
      deadlines: 1,
    },
    limit: { form: 'DOD', current: 500_000, availed: 300_000, available: 200_000, usedPct: over.usedPct === undefined ? 60 : over.usedPct },
    review: null,
  };
}

export function waterData(over: { recorded?: number; total?: number; missed?: number } = {}) {
  const total = over.total ?? 12;
  const recorded = over.recorded ?? 10;
  return {
    kind: 'water_ingress',
    v: 1,
    outletCode: '1E',
    businessDate: TODAY,
    capturedAt: '2026-11-27T01:30:00.000Z',
    lastCheckAt: '2026-11-27T01:30:00.000Z',
    dayState: 'running',
    operating: null,
    totalSlots: total,
    recordedSlots: recorded,
    missedSlots: over.missed ?? total - recorded,
    openSlots: 0,
    compliancePercent: 80,
    lastCheckFailed: false,
    slots: [],
  };
}

export function supplyData(over: { blocked?: boolean | null; failing?: number; unknown?: number } = {}) {
  return {
    kind: 'ro_supply',
    v: 1,
    outletCode: '1E',
    capturedAt: '2026-11-27T01:30:00.000Z',
    read: 'ok',
    blocked: over.blocked === undefined ? false : over.blocked,
    failingCount: over.failing ?? 0,
    unknownCount: over.unknown ?? 0,
    lastGoodIsOld: false,
    rows: [],
  };
}

export function paperData(items: Array<{ docType?: string; docLabel?: string; daysLeft: number; validUntil?: string }>) {
  return {
    kind: 'paper_expiry',
    v: 1,
    scope: 'outlet',
    allLapsed: false,
    items: items.map((i) => ({ docType: 'fire-noc', docLabel: 'Fire NOC', ...i })),
    moreCount: 0,
    sentOn: YESTERDAY,
  };
}

export function stockData(over: { readingAt?: string; fuels?: Array<{ fuelKey: string; daysLeft: number | null; runOutOn: string | null }> } = {}) {
  return {
    kind: 'stock_check',
    v: 1,
    capturedAt: over.readingAt ?? '2026-11-27T03:40:00.000Z',
    outletCode: '1E',
    readingAt: over.readingAt ?? '2026-11-27T03:40:00.000Z',
    stale: false,
    fuels: [],
    cover: { planDay: TODAY, fuels: over.fuels ?? [{ fuelKey: 'HSD', daysLeft: 4.2, runOutOn: '2026-12-01' }] },
  };
}

export function planData(over: { code?: string; severity?: string; arriveOn?: string | null; arriveTime?: string | null } = {}) {
  const arriveOn = over.arriveOn === undefined ? '2026-11-29' : over.arriveOn;
  return {
    kind: 'load_plan',
    v: 1,
    capturedAt: '2026-11-27T04:00:00.000Z',
    outletCode: '1E',
    planDay: TODAY,
    severity: over.severity ?? 'calm',
    verdict: { code: over.code ?? 'NEXT_ORDER', tankers: 1, products: ['HSD'], closedDays: [], nextOrderOn: null, horizonDays: 4 },
    pools: [{ key: 'p1', product: 'HSD', tankNos: [1], stockL: 20_000, lowLineL: 5_000, daysLeft: 3.1, runOutOn: '2026-11-30', atLine: false, tanks: [] }],
    order: arriveOn
      ? { orderOn: TODAY, loadOn: null, arriveOn, arriveDate: arriveOn, arriveTime: over.arriveTime === undefined ? '2:00 pm' : over.arriveTime, trucks: [] }
      : null,
    projection: [0, 1, 2, 3].map((n) => ({
      date: `2026-11-${27 + n}`,
      depotClosed: false,
      tankers: 0,
      litresByProduct: {},
      cover: [{ poolKey: 'p1', stockL: 20_000, daysLeft: 3.1 - n }],
    })),
    depotClosed: [],
    inTransit: [],
  };
}

export function declarationData(over: { streak?: number; nextDueDay?: string | null; kind?: 'safety' | 'washroom' } = {}) {
  return {
    kind: 'declaration_filed',
    v: 1,
    declaration: over.kind ?? 'safety',
    how: 'submitted',
    day: YESTERDAY,
    filedAt: '2026-11-27T01:00:00.000Z',
    late: false,
    everyDays: 1,
    nextDueDay: over.nextDueDay === undefined ? '2026-11-28' : over.nextDueDay,
    outletCode: '1E',
    streak: over.streak ?? 23,
    ref: 'd1',
  };
}

// ── Kavach ──────────────────────────────────────────────────────────────────

export function kavachItem(over: Partial<KavachDealerItem> = {}): KavachDealerItem {
  counter += 1;
  return {
    checkId: `chk${counter}`,
    code: `p${counter}`,
    titleEn: 'Fire extinguisher photo',
    titleHi: 'अग्निशामक की फ़ोटो',
    howToEn: '',
    howToHi: '',
    how: 'photo',
    sheet: null,
    uploader: 'any',
    canSend: true,
    acceptsFile: false,
    points: 5,
    everyDays: 1,
    state: 'todo',
    late: false,
    dueAt: '2026-11-27T10:00:00.000Z',
    validUntil: null,
    opensAt: null,
    sentAt: null,
    sentBack: null,
    dataEn: null,
    dataHi: null,
    thumbUrl: null,
    ...over,
  } as KavachDealerItem;
}

export function kavach(over: { now?: KavachDealerItem[]; upcoming?: KavachDealerItem[]; counts?: Partial<{ late: number; sentBack: number; todo: number }>; on?: boolean; pct?: number } = {}): KavachDealerView {
  const now = over.now ?? [];
  return {
    on: over.on ?? true,
    summary: {
      pct: over.pct ?? 62,
      donePoints: 31,
      totalPoints: 50,
      counts: { done: 6, sent: 0, todo: 9, late: 0, sentBack: 0, ...over.counts },
      computedAt: NOW.toISOString(),
    },
    now,
    waiting: [],
    done: [],
    upcoming: over.upcoming ?? [],
    events: [],
  };
}
