import { fuelName } from '@/features/reports/kinds/dsr_sales/fmt';
import { dayOf, salesSheetOf, usableData } from '@/features/today/todayView';
import { daysUntil, fmtLitres, fmtWeekday, indiaDay } from '@/lib/fmt';
import { translate } from '@/lib/i18n';
import type { Lang } from '@/store/lang';
import type {
  CreditDodData,
  DeclarationFiledData,
  DsrSalesData,
  DsrVariationData,
  DuOtpData,
  ElectricalAuditData,
  FuelOrderData,
  LoadPlanData,
  MockDrillData,
  PaperExpiryData,
  ReportDataOf,
  ReportKind,
  RoSupplyData,
  StockCheckData,
  TankerDensityData,
  TodayReport,
  TtAckData,
  WaterIngressData,
  CalibrationClaimData,
} from '@dk/shared/types';

const DAY_MS = 86_400_000;

/** `day` moved by `n` calendar days (kept here, not imported, so the door's model and the history's never import each other). */
function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/**
 * What each service page's "Right now" panel says, worked out from the report snapshots the app
 * already holds (the Today feed plus the loaded history), as plain functions (spec 4.3). Every number
 * is read from a field the snapshot carries; nothing is guessed, and a figure that is not there is
 * left out, never drawn as 0. Days left are counted again from their date, never taken frozen.
 */

export interface Snap<K extends ReportKind> {
  report: TodayReport;
  data: ReportDataOf<K>;
}

/** The usable snapshots of one kind, newest first. A manager never gets an owner-only kind. */
export function snapshotsOf<K extends ReportKind>(
  reports: readonly TodayReport[],
  kind: K,
  isOwner: boolean,
): Array<Snap<K>> {
  const out: Array<Snap<K>> = [];
  for (const report of reports) {
    if (report.kind !== kind) continue;
    const data = usableData(report, isOwner);
    if (data && data.kind === kind) out.push({ report, data: data as ReportDataOf<K> });
  }
  return out.sort((a, b) => b.report.sentAt.localeCompare(a.report.sentAt));
}

const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);

// ── Daily sales report ──────────────────────────────────────────────────────

export interface DsrFuelLine {
  key: string;
  fuel: string;
  soldL: number;
  /** The change on the same weekday last week, whole percent; null when last week cannot be told. */
  deltaPct: number | null;
}

export interface DsrSalesModel {
  /** The business day the figures are about. */
  day: string;
  totalL: number;
  deltaPct: number | null;
  /** "Monday": the weekday the change is measured against. */
  weekday: string;
  fuels: DsrFuelLine[];
  monthL: number | null;
  /** Fourteen consecutive days ending on `day`; a day with no number is `null`, never 0. */
  bars: Array<{ day: string; litres: number | null }>;
  corrected: Array<{ fuel: string; fromL: number; toL: number }>;
  sentAt: string;
}

export interface DsrVariationFuel {
  key: string;
  fuel: string;
  /** Signed litres, negative = short. */
  value: number;
  low: number;
  high: number;
  permissibleL: number;
  /** Litres outside the allowed band, 0 inside. */
  beyondL: number;
  inside: boolean;
  /** How much further it could move before leaving the band, litres. */
  roomL: number;
}

export interface DsrModel {
  sales: DsrSalesModel | null;
  /** Yesterday's sales are not worked out yet: never drawn as 0. */
  salesPending: boolean;
  variation: {
    day: string;
    fuels: DsrVariationFuel[];
    beforeInspection: boolean;
    sentAt: string;
  } | null;
  /** "Inside the limit on 12 of the last 14 days": days counted from the history the page holds. */
  insideDays: { n: number; m: number } | null;
}

function salesOf(
  reports: readonly TodayReport[],
  isOwner: boolean,
  lang: Lang,
): { model: DsrSalesModel | null; pending: boolean } {
  const candidates: Array<{ report: TodayReport; data: DsrSalesData }> = snapshotsOf(
    reports,
    'dsr_sales',
    isOwner,
  );
  for (const v of snapshotsOf(reports, 'dsr_variation', isOwner)) {
    // A message with both sheets is tagged as the variation: the sales sheet is read out of it.
    const sheet = salesSheetOf(v.data);
    if (sheet) candidates.push({ report: v.report, data: sheet });
  }
  candidates.sort(
    (a, b) =>
      dayOf(b.report, b.data).localeCompare(dayOf(a.report, a.data)) ||
      b.report.sentAt.localeCompare(a.report.sentAt),
  );
  let pending = false;
  for (const { report, data } of candidates) {
    const closed = data.products.filter(
      (p) => p.sales.state === 'closed' && p.sales.soldL !== null,
    );
    if (closed.length === 0) {
      pending = true;
      continue;
    }
    const day = dayOf(report, data);
    const totalL = sum(closed.map((p) => p.sales.soldL ?? 0));
    const lastWeek = closed.map((p) => p.sales.sameWeekdayLastWeek);
    let deltaPct: number | null = null;
    let weekday = '';
    if (lastWeek.every((w) => w !== null)) {
      const prev = sum(lastWeek.map((w) => w!.soldL));
      if (prev > 0) {
        deltaPct = Math.round(((totalL - prev) / prev) * 100);
        weekday = fmtWeekday(lastWeek[0]!.day, lang);
      }
    }
    const fuels = closed.map((p) => {
      const w = p.sales.sameWeekdayLastWeek;
      return {
        key: p.key,
        fuel: fuelName(p.key, lang),
        soldL: p.sales.soldL ?? 0,
        deltaPct:
          w && w.soldL > 0 ? Math.round((((p.sales.soldL ?? 0) - w.soldL) / w.soldL) * 100) : null,
      };
    });
    const byDay = new Map<string, number>();
    for (const p of closed)
      for (const t of p.sales.trend) byDay.set(t.day, (byDay.get(t.day) ?? 0) + t.soldL);
    const endDay = [...byDay.keys()].sort().pop() ?? day;
    const bars: DsrSalesModel['bars'] = [];
    if (byDay.size > 0) {
      for (let i = 13; i >= 0; i--) {
        const d = addDays(endDay, -i);
        bars.push({ day: d, litres: byDay.get(d) ?? null });
      }
    }
    const mtd = closed.map((p) => p.sales.monthToDateL);
    const corrected =
      data.revised && data.revision
        ? data.revision.changed.map((c) => ({
            fuel: fuelName(c.productKey, lang),
            fromL: c.fromL,
            toL: c.toL,
          }))
        : [];
    return {
      model: {
        day,
        totalL,
        deltaPct,
        weekday,
        fuels,
        monthL: mtd.every((m) => m !== null) ? sum(mtd as number[]) : null,
        bars,
        corrected,
        sentAt: report.sentAt,
      },
      pending: false,
    };
  }
  return { model: null, pending };
}

/** The room a fuel has left before the variation leaves its band. */
export function roomLeft(value: number, low: number, high: number): number {
  return Math.max(0, value >= 0 ? high - value : value - low);
}

export function dsrModel(
  reports: readonly TodayReport[],
  isOwner: boolean,
  lang: Lang,
): DsrModel | null {
  const { model: sales, pending } = salesOf(reports, isOwner, lang);
  const variations = snapshotsOf(reports, 'dsr_variation', isOwner);
  const newest = variations[0];
  let variation: DsrModel['variation'] = null;
  if (newest && newest.data.products.length > 0) {
    const d: DsrVariationData = newest.data;
    variation = {
      day: dayOf(newest.report, d),
      beforeInspection: d.beforeInspection === true,
      sentAt: newest.report.sentAt,
      fuels: d.products.map((p) => ({
        key: p.key,
        fuel: fuelName(p.key, lang),
        value: p.variation.variationL,
        low: p.variation.lowEdgeL,
        high: p.variation.highEdgeL,
        permissibleL: p.variation.permissibleL,
        beyondL: Math.abs(p.variation.offL),
        inside: p.variation.offL === 0,
        roomL: roomLeft(p.variation.variationL, p.variation.lowEdgeL, p.variation.highEdgeL),
      })),
    };
  }

  // Days inside the limit, from every variation sheet held: one per business day (the newest), within
  // 14 days of the newest, none from before the first inspection.
  let insideDays: DsrModel['insideDays'] = null;
  if (variation && !variation.beforeInspection) {
    const from = addDays(variation.day, -13);
    const perDay = new Map<string, boolean>();
    for (const v of variations) {
      if (v.data.beforeInspection || v.data.products.length === 0) continue;
      const day = dayOf(v.report, v.data);
      if (day < from || day > variation.day || perDay.has(day)) continue;
      perDay.set(
        day,
        v.data.products.every((p) => p.variation.offL === 0),
      );
    }
    // One day of history says nothing about a streak: shown from three days up.
    if (perDay.size >= 3)
      insideDays = { n: [...perDay.values()].filter(Boolean).length, m: perDay.size };
  }

  if (!sales && !variation && !pending) return null;
  return { sales, salesPending: pending && !sales, variation, insideDays };
}

/**
 * The door's one line for the daily sales report when a fuel is outside its limit, as a sentence and
 * not as a table row: "Diesel 100 L outside the limit (520 L short)". Null when nothing is outside
 * (the door then says what the sales tile says) or the figures are from before the first inspection.
 */
export function dsrDoorLine(
  reports: readonly TodayReport[],
  isOwner: boolean,
  lang: Lang,
): string | null {
  const v = snapshotsOf(reports, 'dsr_variation', isOwner)[0];
  if (!v || v.data.beforeInspection) return null;
  const out = v.data.products
    .filter((p) => p.variation.offL !== 0)
    .sort((a, b) => Math.abs(b.variation.offL) - Math.abs(a.variation.offL));
  if (out.length === 0) return null;
  return out
    .map((p) =>
      translate(lang, p.variation.variationL < 0 ? 'svc.door.dsr.short' : 'svc.door.dsr.over', {
        fuel: fuelName(p.key, lang),
        beyond: fmtLitres(Math.abs(p.variation.offL), lang),
        value: fmtLitres(Math.abs(p.variation.variationL), lang),
      }),
    )
    .join(' ');
}

/** How many orders are on the way, or null when the page holds no order report at all (the door then says what its tile says). */
export function fuelDoorLine(reports: readonly TodayReport[], isOwner: boolean): number | null {
  if (!reports.some((r) => r.kind === 'fuel_order')) return null;
  return ordersInFlight(reports, isOwner).length;
}

// ── Credit and DOD (owner) ──────────────────────────────────────────────────

export interface CreditModel {
  verdict: CreditDodData['verdict'];
  amount: number;
  date: string | null;
  /** Counted again from the date; null when there is none. Negative = days late. */
  daysLeft: number | null;
  usedPct: number | null;
  available: number;
  review: { on: string; daysUntil: number; lapsed: boolean } | null;
  sentAt: string;
}

export function creditModel(reports: readonly TodayReport[], now: Date): CreditModel | null {
  const s = snapshotsOf(reports, 'credit_dod', true)[0];
  if (!s) return null;
  const { money, limit, review, verdict } = s.data;
  return {
    verdict,
    amount: money.amount,
    date: money.date,
    daysLeft: money.date ? daysUntil(money.date, now) : null,
    usedPct: limit.usedPct,
    available: limit.available,
    review: review
      ? {
          on: review.on,
          daysUntil: daysUntil(review.on, now) ?? review.daysUntil,
          lapsed: review.lapsed,
        }
      : null,
    sentAt: s.report.sentAt,
  };
}

// ── Water checks ────────────────────────────────────────────────────────────

export function waterModel(
  reports: readonly TodayReport[],
  isOwner: boolean,
): { data: WaterIngressData; sentAt: string } | null {
  const s = snapshotsOf(reports, 'water_ingress', isOwner)[0];
  return s && s.data.totalSlots > 0 ? { data: s.data, sentAt: s.report.sentAt } : null;
}

// ── Load planner ────────────────────────────────────────────────────────────

export interface PlanPool {
  key: string;
  fuel: string;
  capacityL: number;
  lowLineL: number;
  /** The tanks that sell through this pool, in order ("4, 6"): two diesel pools are told apart by them. */
  tankNos: number[];
  days: Array<{ date: string; stockL: number; daysLeft: number | null }>;
}

export interface PlanModel {
  data: LoadPlanData;
  pools: PlanPool[];
  /** The order is for today, or stock is running out: the button says "Plan the order". */
  orderNow: boolean;
  sentAt: string;
}

export function planModel(
  reports: readonly TodayReport[],
  isOwner: boolean,
  lang: Lang,
): PlanModel | null {
  const s = snapshotsOf(reports, 'load_plan', isOwner)[0];
  if (!s) return null;
  const d = s.data;
  const pools = d.pools.map((p) => ({
    key: p.key,
    fuel: fuelName(p.product, lang),
    capacityL: sum(p.tanks.map((t) => t.capacityL)),
    lowLineL: p.lowLineL,
    tankNos: [...p.tankNos].sort((a, b) => a - b),
    days: d.projection.flatMap((day) => {
      const c = day.cover.find((x) => x.poolKey === p.key);
      return c ? [{ date: day.date, stockL: c.stockL, daysLeft: c.daysLeft }] : [];
    }),
  }));
  const code = d.verdict.code;
  return {
    data: d,
    pools,
    orderNow:
      code === 'ORDER_NOW_RUNNING_OUT' ||
      code === 'ORDER_NOW_DEPOT_CLOSED' ||
      code === 'ORDER_TODAY',
    sentAt: s.report.sentAt,
  };
}

// ── Fuel orders ─────────────────────────────────────────────────────────────

const IN_FLIGHT: ReadonlySet<FuelOrderData['stage']> = new Set([
  'being_placed',
  'waiting',
  'tanker_assigned',
  'invoiced',
]);

/** The newest report of each order that is still on its way. */
export function ordersInFlight(
  reports: readonly TodayReport[],
  isOwner: boolean,
): Array<Snap<'fuel_order'>> {
  const seen = new Set<string>();
  const out: Array<Snap<'fuel_order'>> = [];
  for (const s of snapshotsOf(reports, 'fuel_order', isOwner)) {
    if (seen.has(s.data.indentId)) continue;
    seen.add(s.data.indentId);
    if (IN_FLIGHT.has(s.data.stage)) out.push(s);
  }
  return out;
}

// ── TT density ──────────────────────────────────────────────────────────────

export interface DensityLine {
  key: string;
  fuel: string;
  /** Copied as printed: never reformatted. */
  density: string;
  /** The invoice day of the tanker it was read from. */
  day: string;
}

/** The latest density per fuel, from the newest tanker that carried that fuel. */
export function densityLines(
  reports: readonly TodayReport[],
  isOwner: boolean,
  lang: Lang,
): DensityLine[] {
  const best = new Map<string, DensityLine & { at: string }>();
  for (const { report, data } of snapshotsOf(reports, 'tanker_density', isOwner) as Array<
    Snap<'tanker_density'>
  >) {
    const d: TankerDensityData = data;
    for (const line of d.lines) {
      const at = `${d.invoiceDate}|${d.invoiceTime ?? ''}|${report.sentAt}`;
      const cur = best.get(line.productKey);
      if (cur && cur.at >= at) continue;
      best.set(line.productKey, {
        key: line.productKey,
        fuel: fuelName(line.productKey, lang),
        density: line.density15Raw,
        day: d.invoiceDate,
        at,
      });
    }
  }
  return [...best.values()].map(({ at: _at, ...rest }) => rest);
}

// ── Tanker papers ───────────────────────────────────────────────────────────

export type PaperItem = PaperExpiryData['items'][number];

/** A paper's days left, counted again from its date; the stored count when it has no date. */
export function paperDays(item: Pick<PaperItem, 'validUntil' | 'daysLeft'>, now: Date): number {
  return (item.validUntil ? daysUntil(item.validUntil, now) : null) ?? item.daysLeft;
}

/** The papers of the newest report, soonest first, each with its recounted days. */
export function papersSorted(
  reports: readonly TodayReport[],
  isOwner: boolean,
  now: Date,
): { items: Array<{ item: PaperItem; days: number }>; moreCount: number; sentAt: string } | null {
  const s = snapshotsOf(reports, 'paper_expiry', isOwner)[0];
  if (!s) return null;
  const items = s.data.items
    .map((item) => ({ item, days: paperDays(item, now) }))
    .sort((a, b) => a.days - b.days);
  return { items, moreCount: s.data.moreCount ?? 0, sentAt: s.report.sentAt };
}

/** Lapsed or last day: a problem; within 15 days: a look; else fine. */
export function paperStatus(days: number): 'problem' | 'attention' | 'ok' {
  return days <= 1 ? 'problem' : days <= 15 ? 'attention' : 'ok';
}

// ── TT acknowledgement ──────────────────────────────────────────────────────

export interface AckModel {
  receipts: number;
  shortReceipts: number;
  shortL: number;
  claimedL: number;
  sentAt: string;
}

/** Litres only: no rupee value exists. Summed over every receipt the page holds. */
export function ackModel(reports: readonly TodayReport[], isOwner: boolean): AckModel | null {
  const all = snapshotsOf(reports, 'tt_ack', isOwner) as Array<Snap<'tt_ack'>>;
  if (all.length === 0) return null;
  let shortL = 0;
  let claimedL = 0;
  for (const { data } of all) {
    const d: TtAckData = data;
    for (const r of d.rows) {
      shortL += r.totalShortL ?? 0;
      claimedL += r.claimShortL ?? 0;
    }
  }
  return {
    receipts: all.length,
    shortReceipts: all.filter((a) => a.data.anyShort).length,
    shortL,
    claimedL,
    sentAt: all[0]!.report.sentAt,
  };
}

// ── DU OTP ──────────────────────────────────────────────────────────────────

export interface DuLine {
  id: string;
  make: string;
  model: string;
  nozzle: string;
  phase: 'pending' | 'submitted';
}

/**
 * The dispensers MDG is waiting on or has filed for: the events of the newest report of each phase
 * (pending, submitted), pending first.
 */
export function duLines(
  reports: readonly TodayReport[],
  isOwner: boolean,
): { lines: DuLine[]; more: number; sentAt: string } | null {
  const all = snapshotsOf(reports, 'du_otp', isOwner) as Array<Snap<'du_otp'>>;
  const pending = all.find((s) => s.data.phase === 'pending');
  const submitted = all.find((s) => s.data.phase === 'submitted');
  const pick = [pending, submitted].filter((s): s is Snap<'du_otp'> => !!s);
  if (pick.length === 0) return null;
  const lines: DuLine[] = [];
  let more = 0;
  for (const { data } of pick) {
    const d: DuOtpData = data;
    more += d.moreCount ?? 0;
    for (const e of d.events) {
      lines.push({
        id: `${d.phase}-${e.otpId}`,
        make: e.duMake,
        model: e.duModel,
        nozzle: e.nozzleNo,
        phase: d.phase,
      });
    }
  }
  const newest = pick.reduce((a, b) => (a.report.sentAt >= b.report.sentAt ? a : b));
  return { lines, more, sentAt: newest.report.sentAt };
}

// ── Declarations ────────────────────────────────────────────────────────────

export interface DeclarationsModel {
  streak: number | null;
  /** Fourteen days ending on the newest safety filing: came / none. */
  strip: Array<{ day: string; state: 'came' | 'none' }>;
  lastSafetyDay: string | null;
  nextWashroomDue: string | null;
  sentAt: string;
}

export function declarationsModel(
  reports: readonly TodayReport[],
  isOwner: boolean,
): DeclarationsModel | null {
  const all = snapshotsOf(reports, 'declaration_filed', isOwner) as Array<
    Snap<'declaration_filed'>
  >;
  const safety = all.find((s) => (s.data as DeclarationFiledData).declaration === 'safety');
  const washroom = all.find((s) => (s.data as DeclarationFiledData).declaration === 'washroom');
  if (!safety && !washroom) return null;
  let strip: DeclarationsModel['strip'] = [];
  if (safety) {
    const filed = new Set(safety.data.recentDays ?? [safety.data.day]);
    strip = Array.from({ length: 14 }, (_, i) => {
      const day = addDays(safety.data.day, i - 13);
      return { day, state: filed.has(day) ? ('came' as const) : ('none' as const) };
    });
  }
  return {
    streak: safety?.data.streak ?? null,
    strip,
    lastSafetyDay: safety?.data.day ?? null,
    nextWashroomDue: washroom?.data.nextDueDay ?? null,
    sentAt: (safety ?? washroom)!.report.sentAt,
  };
}

// ── Mock drill, electrical audit, calibration claim ─────────────────────────

export function mockDrillOf(
  reports: readonly TodayReport[],
  isOwner: boolean,
): { data: MockDrillData; sentAt: string } | null {
  const all = snapshotsOf(reports, 'mock_drill', isOwner);
  const s = all.find((x) => x.data.stage === 'filed') ?? all[0];
  return s ? { data: s.data, sentAt: s.report.sentAt } : null;
}

export function electricalOf(
  reports: readonly TodayReport[],
  isOwner: boolean,
): { data: ElectricalAuditData; report: TodayReport } | null {
  const s = snapshotsOf(reports, 'electrical_audit', isOwner)[0];
  return s ? { data: s.data, report: s.report } : null;
}

export function calibrationOf(
  reports: readonly TodayReport[],
): { data: CalibrationClaimData; sentAt: string } | null {
  const s = snapshotsOf(reports, 'calibration_claim', true)[0];
  return s ? { data: s.data, sentAt: s.report.sentAt } : null;
}

// ── Supply and stock ────────────────────────────────────────────────────────

export type SupplyWord = 'open' | 'stopped' | 'unknown';

export interface SupplyModel {
  data: RoSupplyData;
  word: SupplyWord;
  /** The reading is not from today: shown as information, not as a live fact. */
  old: boolean;
  sentAt: string;
}

export function supplyModel(
  reports: readonly TodayReport[],
  isOwner: boolean,
  now: Date,
): SupplyModel | null {
  const s = snapshotsOf(reports, 'ro_supply', isOwner)[0];
  if (!s) return null;
  const d = s.data;
  return {
    data: d,
    word: d.blocked === true ? 'stopped' : d.blocked === false ? 'open' : 'unknown',
    old:
      d.lastGoodIsOld ||
      (d.capturedAt ? indiaDay(new Date(d.capturedAt)) !== indiaDay(now) : false),
    sentAt: s.report.sentAt,
  };
}

/** A stock reading older than a day is "old". */
export const STOCK_OLD_MS = 24 * 3_600_000;

export function stockModel(
  reports: readonly TodayReport[],
  isOwner: boolean,
  now: Date,
): { data: StockCheckData; old: boolean; sentAt: string } | null {
  const s = snapshotsOf(reports, 'stock_check', isOwner)[0];
  if (!s) return null;
  const at = s.data.readingAt ? Date.parse(s.data.readingAt) : NaN;
  return {
    data: s.data,
    old: s.data.stale || (Number.isFinite(at) && now.getTime() - at > STOCK_OLD_MS),
    sentAt: s.report.sentAt,
  };
}
