import type { Status } from '@/components/kit/types';
import type { LoginRow } from '@/features/logins/types';
import { splitPayments } from '@/features/payments/paymentView';
import { serviceNameOf } from '@/features/today/serviceName';
import { daysUntil, fmtDate } from '@/lib/fmt';
import type { MessageKey, TFunction } from '@/lib/i18n';
import type { Lang } from '@/store/lang';
import { BACKGROUND_SERVICE_IDS, DEALER_PROFILE_EXPIRY_SOON_DAYS, OWNER_ONLY_SERVICE_IDS } from '@dk/shared';
import type { ResolvedDealerProfileField } from '@dk/shared';
import type {
  DealerDocumentAskRow,
  DealerPayment,
  MeServicesView,
  User,
} from '@dk/shared/types';

/**
 * What the My pump page and its Papers page decide, kept apart from how they draw it, so every rule
 * is a plain function a test can read (spec 4.5). Nothing here reads the phone's clock except
 * through `now`, and every "N days" is counted again from the DATE in India time (`daysUntil`),
 * never taken from a number the server froze when it answered.
 */

// ── the pump's identity ────────────────────────────────────────────────────

/** One value of the outlet file, looked up by KEY. A missing key is `undefined`: the line is hidden. */
export function outletValue(
  fields: readonly ResolvedDealerProfileField[] | undefined,
  key: string,
): string | undefined {
  const hit = fields?.find((f) => f.key === key);
  const value = hit?.value?.trim();
  return value ? value : undefined;
}

export interface PumpIdentity {
  name?: string;
  oilCompany?: string;
  sapCode?: string;
}

/** The three lines of the identity card. The screen never assumes any of them exists. */
export function pumpIdentity(fields: readonly ResolvedDealerProfileField[] | undefined): PumpIdentity {
  const name = outletValue(fields, 'pumpName');
  const oilCompany = outletValue(fields, 'oilCompanyName');
  const sapCode = outletValue(fields, 'pumpSapCode');
  return {
    ...(name ? { name } : {}),
    ...(oilCompany ? { oilCompany } : {}),
    ...(sapCode ? { sapCode } : {}),
  };
}

/** The oil companies a pump board shows, by the short word a pump owner uses. */
const OIL_COMPANY_KEYS: ReadonlyArray<[RegExp, MessageKey]> = [
  [/\b(iocl?|indian\s*oil|indianoil)\b/i, 'pump.oil.iocl'],
  [/\b(bpcl|bharat)\b/i, 'pump.oil.bpcl'],
  [/\b(hpcl|hindustan)\b/i, 'pump.oil.hpcl'],
  [/\bnayara\b/i, 'pump.oil.nayara'],
  [/\bshell\b/i, 'pump.oil.shell'],
  [/\breliance\b/i, 'pump.oil.reliance'],
];

/**
 * The oil company in the reader's language ("इंडियन ऑयल"). The outlet file holds whatever was typed
 * ("IOCL", "Indian Oil"); a company this list does not know is shown exactly as typed, never hidden.
 */
export function oilCompanyLabel(value: string, t: TFunction): string {
  for (const [pattern, key] of OIL_COMPANY_KEYS) if (pattern.test(value)) return t(key);
  return value;
}

/** "IRAS", "IRAS and SDMS", "A, B and C": names joined the way the reader's language joins them. */
export function joinNames(names: readonly string[], t: TFunction): string {
  const list = names.filter(Boolean);
  if (list.length <= 1) return list[0] ?? '';
  const and = t('pump.join.and');
  return `${list.slice(0, -1).join(', ')} ${and} ${list[list.length - 1]}`;
}

// ── papers and licences ────────────────────────────────────────────────────

export type PaperState = 'expired' | 'expiring' | 'valid' | 'onFile';

export interface PaperItem {
  id: string;
  source: 'licence' | 'filed';
  /** A catalog sentence for a known licence (it has Hinglish); otherwise the two titles below. */
  titleKey?: MessageKey;
  titleEn: string;
  titleHi: string;
  /** Whole days left, counted from the date in India time. Negative once gone. Null: not dated. */
  days: number | null;
  state: PaperState;
  /** The last good day, `YYYY-MM-DD`. */
  until?: string;
  /** For a filed paper without a date: the period it covers, in words. */
  period?: string;
  /** The catalog kind of a filed paper (`wm-licence`): what two sources are matched on. */
  kindCode?: string;
  /** The outlet-file field of a licence (`wmLicenceNo`): the other half of that match. */
  field?: string;
  /** MDG has this paper on file (a licence the owner also sent, or any filed paper). */
  accepted?: boolean;
}

/**
 * ONE NAME PER PAPER KIND, for both sources. The outlet file calls a licence by its field
 * (`wmLicenceNo`) and the papers MDG accepted call it by its catalog code (`wm-licence`); both reach
 * the same message key here, so one licence never has two names on one screen, and the field and the
 * code are how the two lists are matched into one row.
 */
const KINDS: Record<string, { titleKey: MessageKey; field?: string }> = {
  'explosive-licence': { titleKey: 'pump.licence.explosive', field: 'explosiveLicenceNo' },
  'dto-trade-licence': { titleKey: 'pump.licence.trade', field: 'dtoTradeLicenceNo' },
  'wm-licence': { titleKey: 'pump.licence.wm', field: 'wmLicenceNo' },
  'fire-noc': { titleKey: 'pump.licence.fire' },
};
const KIND_OF_FIELD: Record<string, string> = Object.fromEntries(
  Object.entries(KINDS).flatMap(([code, k]) => (k.field ? [[k.field, code]] : [])),
);

const RANK: Record<PaperState, number> = { expired: 0, expiring: 1, valid: 2, onFile: 3 };

/** The stricter of two verdicts: a paper is never called fine because one of two sources said so. */
function stricter(a: PaperState, b: PaperState): PaperState {
  return RANK[a] <= RANK[b] ? a : b;
}

/**
 * The licences of the outlet file that carry a date. The server also says `expired`, `expiring` or
 * `valid` (against its own India day); the app counts again from the date, and the stricter word wins.
 */
export function licencePapers(
  fields: readonly ResolvedDealerProfileField[] | undefined,
  now: Date = new Date(),
): PaperItem[] {
  const items: PaperItem[] = [];
  for (const f of fields ?? []) {
    if (!f.expiresOn) continue;
    const days = daysUntil(f.expiresOn, now);
    const own: PaperState | null =
      days === null ? null : days < 0 ? 'expired' : days <= DEALER_PROFILE_EXPIRY_SOON_DAYS ? 'expiring' : 'valid';
    const server: PaperState | null = f.expiryState ?? null;
    // No verdict from either side fails closed: an unreadable date is "on file", never "valid".
    const state = own && server ? stricter(own, server) : (own ?? server ?? 'onFile');
    const kindCode = KIND_OF_FIELD[f.key];
    const titleKey = kindCode ? KINDS[kindCode]!.titleKey : undefined;
    items.push({
      id: `licence:${f.key}`,
      source: 'licence',
      ...(titleKey ? { titleKey } : {}),
      titleEn: f.label,
      titleHi: f.label,
      days,
      state,
      until: f.expiresOn,
      field: f.key,
      ...(kindCode ? { kindCode } : {}),
    });
  }
  return sortPapers(items);
}

/** The papers MDG has accepted. A dated one has days left; an undated one is simply on file. */
export function filedPapers(
  rows: readonly DealerDocumentAskRow[] | undefined,
  now: Date = new Date(),
): PaperItem[] {
  const items: PaperItem[] = [];
  for (const r of rows ?? []) {
    const days = r.validUntil ? (daysUntil(r.validUntil, now) ?? r.daysToExpiry ?? null) : null;
    let state: PaperState = 'onFile';
    if (r.validUntil) {
      const server: PaperState | null = r.validityState ?? null;
      // The server's window for "ending soon" is the server's to decide (it differs by paper kind), so
      // the app only adds "expired" itself; with no word from the server at all it counts the shared window.
      const own: PaperState | null =
        days === null
          ? null
          : days < 0
            ? 'expired'
            : server
              ? null
              : days <= DEALER_PROFILE_EXPIRY_SOON_DAYS
                ? 'expiring'
                : 'valid';
      state = own && server ? stricter(own, server) : (own ?? server ?? 'onFile');
    }
    const known = r.kindCode ? KINDS[r.kindCode] : undefined;
    items.push({
      id: `filed:${r.id}`,
      source: 'filed',
      accepted: true,
      ...(known && r.kindCode ? { titleKey: known.titleKey, kindCode: r.kindCode } : {}),
      titleEn: r.titleEn,
      titleHi: r.titleHi || r.titleEn,
      days,
      state,
      ...(r.validUntil ? { until: r.validUntil } : {}),
      ...(r.periodLabel ? { period: r.periodLabel } : {}),
    });
  }
  return sortPapers(items);
}

/** The later of two end dates; a paper with no date never beats one that has one. */
function laterUntil(a: PaperItem, b: PaperItem): PaperItem {
  if (!a.until) return b;
  if (!b.until) return a;
  return b.until > a.until ? b : a;
}

export interface MergedPapers {
  /** The licences of the outlet file, each marked when MDG also holds that paper. */
  licences: PaperItem[];
  /** Every other paper MDG has accepted (a Fire NOC, a register page), each kind once if it is a licence kind. */
  other: PaperItem[];
  /** Both, for a verdict over everything. */
  all: PaperItem[];
}

/**
 * ONE ROW PER PAPER. The outlet file and the papers MDG accepted both carry the licences, so a plain
 * join showed "Weights and Measures licence" twice. They are matched on kind (the field of one, the
 * catalog code of the other): the LATER end date wins (a renewal MDG accepted beats the older date in
 * the outlet file), and the row is marked as one MDG has. Of several accepted papers of one licence
 * kind (an old Fire NOC and a renewal) only the latest is kept. Papers of other kinds (a density
 * register page for each month) are different papers and are all kept.
 */
export function mergePapers(
  licences: readonly PaperItem[],
  filed: readonly PaperItem[],
): MergedPapers {
  const latestOfKind = new Map<string, PaperItem>();
  const other: PaperItem[] = [];
  for (const f of filed) {
    if (!f.kindCode) {
      other.push(f);
      continue;
    }
    const seen = latestOfKind.get(f.kindCode);
    latestOfKind.set(f.kindCode, seen ? laterUntil(seen, f) : f);
  }
  const used = new Set<string>();
  const out: PaperItem[] = [];
  for (const lic of licences) {
    const match = lic.kindCode ? latestOfKind.get(lic.kindCode) : undefined;
    if (!match || !lic.kindCode) {
      out.push(lic);
      continue;
    }
    used.add(lic.kindCode);
    const winner = laterUntil(lic, match);
    out.push(
      winner === lic
        ? { ...lic, accepted: true }
        : { ...lic, days: winner.days, state: winner.state, ...(winner.until ? { until: winner.until } : {}), accepted: true },
    );
  }
  // A filed paper of a kind the outlet file has no row for (a Fire NOC) is just another accepted paper.
  for (const [code, f] of latestOfKind) if (!used.has(code)) other.push(f);
  const sortedLicences = sortPapers(out);
  const sortedOther = sortPapers(other);
  return { licences: sortedLicences, other: sortedOther, all: sortPapers([...sortedLicences, ...sortedOther]) };
}

export interface PaperCounts {
  expired: number;
  expiring: number;
  valid: number;
}

/** How many papers are in each state (undated papers are not counted: nothing is known about them). */
export function paperCounts(items: readonly PaperItem[]): PaperCounts {
  return {
    expired: items.filter((i) => i.state === 'expired').length,
    expiring: items.filter((i) => i.state === 'expiring').length,
    valid: items.filter((i) => i.state === 'valid').length,
  };
}

/** A paper's name in the reader's language: the catalog sentence when there is one, else the title in its language. */
export function paperName(item: PaperItem, lang: Lang, t: TFunction): string {
  if (item.titleKey) return t(item.titleKey);
  return lang === 'hi' ? item.titleHi : item.titleEn;
}

/** Expired first, then ending soon, then valid, then the undated; the soonest first inside each. */
export function sortPapers(items: readonly PaperItem[]): PaperItem[] {
  return [...items].sort((a, b) => {
    const r = RANK[a.state] - RANK[b.state];
    if (r !== 0) return r;
    return (a.days ?? Number.MAX_SAFE_INTEGER) - (b.days ?? Number.MAX_SAFE_INTEGER);
  });
}

export type PapersHealth =
  | { kind: 'expired'; status: 'problem'; item: PaperItem }
  | { kind: 'today'; status: 'attention'; item: PaperItem }
  | { kind: 'days'; status: 'attention'; item: PaperItem; days: number }
  | { kind: 'valid'; status: 'ok' }
  | { kind: 'none'; status: 'info' };

/**
 * One line for My pump: the worst paper, in the words the spec gives ("Fire NOC in 9 days"), or "All
 * valid". Undated papers are never counted as valid: with no dated paper at all the line says so
 * calmly instead of "All valid".
 */
export function papersHealth(items: readonly PaperItem[]): PapersHealth {
  const dated = sortPapers(items.filter((i) => i.state !== 'onFile'));
  const first = dated[0];
  if (!first) return { kind: 'none', status: 'info' };
  if (first.state === 'expired') return { kind: 'expired', status: 'problem', item: first };
  if (first.state === 'expiring') {
    if (first.days === 0) return { kind: 'today', status: 'attention', item: first };
    return { kind: 'days', status: 'attention', item: first, days: first.days ?? 0 };
  }
  return { kind: 'valid', status: 'ok' };
}

// ── logins ─────────────────────────────────────────────────────────────────

export type LoginsHealth =
  | { kind: 'empty'; status: 'info' }
  | { kind: 'refused'; status: 'problem'; names: string[]; working: number; total: number }
  | { kind: 'missing'; status: 'attention'; names: string[]; working: number; total: number }
  | { kind: 'ok'; status: 'ok'; working: number; total: number };

/**
 * The health of the portal logins. A login counts when it is saved or when the services need it; one
 * that is neither saved nor needed is not a fault. A refused password is a problem (it stops the daily
 * reports), a needed login that is missing needs a look, and anything else is "N of N working".
 */
export function loginsHealth(rows: readonly LoginRow[]): LoginsHealth {
  const counted = rows.filter((r) => r.status !== 'missing' || r.needed);
  if (counted.length === 0) return { kind: 'empty', status: 'info' };
  const working = counted.filter((r) => r.status === 'saved').length;
  const total = counted.length;
  const refused = counted.filter((r) => r.status === 'refused');
  if (refused.length > 0) return { kind: 'refused', status: 'problem', names: refused.map((r) => r.name), working, total };
  const missing = counted.filter((r) => r.status === 'missing');
  if (missing.length > 0) return { kind: 'missing', status: 'attention', names: missing.map((r) => r.name), working, total };
  return { kind: 'ok', status: 'ok', working, total };
}

// ── team ───────────────────────────────────────────────────────────────────

export type TeamState = 'active' | 'paused' | 'notYet';

/** One word for a member: paused beats everything, then never-signed-in, else active. */
export function teamState(u: Pick<User, 'status' | 'lastLoginAt'>): TeamState {
  if (u.status !== 'ACTIVE') return 'paused';
  return u.lastLoginAt ? 'active' : 'notYet';
}

export interface TeamHealth {
  /** The people other than the signed-in owner. */
  others: number;
  managers: number;
  partners: number;
  notYet: number;
  status: Status;
}

export function teamHealth(users: readonly User[], selfId: string | undefined): TeamHealth {
  const others = users.filter((u) => u.id !== selfId);
  const managers = others.filter((u) => u.role === 'dealer-staff').length;
  const partners = others.filter((u) => u.role === 'dealer-owner').length;
  const notYet = others.filter((u) => teamState(u) === 'notYet').length;
  return {
    others: others.length,
    managers,
    partners,
    notYet,
    status: others.length === 0 || notYet > 0 ? 'info' : 'ok',
  };
}

// ── services ───────────────────────────────────────────────────────────────

export interface ServicesHealth {
  running: number;
  look: number;
  getting: number;
  total: number;
  /** The ids of the services that need a look, for naming them. */
  lookIds: string[];
  kind: 'none' | 'ready' | 'ok' | 'look';
  status: Status;
}

/**
 * "9 services running". Background services never count, and a manager never counts the owner-only
 * ones (the server already leaves both out; this keeps an older server honest). A service that failed
 * or is late or paused "needs a look"; one that has not run yet is "getting ready".
 */
export function servicesHealth(view: MeServicesView, role: User['role'] | undefined): ServicesHealth {
  const entries = view.services.filter(
    (s) =>
      !BACKGROUND_SERVICE_IDS.includes(s.serviceId) &&
      (role === 'dealer-owner' || !OWNER_ONLY_SERVICE_IDS.includes(s.serviceId)),
  );
  const running = entries.filter((s) => s.run === 'ok' || s.run === 'running' || s.run === 'on_request').length;
  const lookEntries = entries.filter((s) => s.run === 'failing' || s.run === 'late' || s.run === 'held');
  const look = lookEntries.length;
  const getting = entries.filter((s) => s.run === 'new').length;
  const kind = entries.length === 0 ? 'none' : look > 0 ? 'look' : running > 0 ? 'ok' : 'ready';
  return {
    running,
    look,
    getting,
    total: entries.length,
    lookIds: lookEntries.map((s) => s.serviceId),
    kind,
    status: kind === 'look' ? 'attention' : kind === 'ok' ? 'ok' : 'info',
  };
}

// ── the bill, as days only ─────────────────────────────────────────────────

export type BillHealth =
  | { kind: 'none'; status: 'ok' }
  | { kind: 'open'; status: 'info' }
  | { kind: 'due'; status: Status; days: number; date: string }
  | { kind: 'today'; status: 'attention' }
  | { kind: 'late'; status: 'attention'; days: number; date: string };

/** How near the bill is, from the soonest open one: the days and the date. NO amount leaves the Bill and plan page. */
export function billHealth(items: readonly DealerPayment[], now: Date = new Date()): BillHealth {
  const first = splitPayments(items).due[0];
  if (!first) return { kind: 'none', status: 'ok' };
  const days = first.dueDate ? daysUntil(first.dueDate, now) : null;
  if (days === null) return { kind: 'open', status: 'info' };
  const date = first.dueDate ?? '';
  if (days < 0) return { kind: 'late', status: 'attention', days: -days, date };
  if (days === 0) return { kind: 'today', status: 'attention' };
  return { kind: 'due', status: days <= 3 ? 'attention' : 'ok', days, date };
}

// ── help videos, merged ────────────────────────────────────────────────────

export type HelpGroupId = 'mine' | 'general' | 'more' | 'all';

export interface HelpRow<V> {
  video: V;
  watched: boolean;
  /** The server keeps a tick for this video (it is on the person's own list), so "not watched" is a fact. */
  tracked: boolean;
}

export interface HelpGroup<V> {
  id: HelpGroupId;
  rows: HelpRow<V>[];
}

interface VideoLike {
  id: string;
  service?: string | null;
}

/** What the person's own list (`/me/your-videos`) says: which videos are for their services, which are watched. */
export interface HelpKnown {
  mine: ReadonlySet<string>;
  more: ReadonlySet<string>;
  watched: ReadonlySet<string>;
}

/**
 * The Help list: the videos for the services the pump has first, then how the app works, then the
 * other services' videos. `known` comes from the person's own list (`/me/your-videos`). With no such
 * list (an older server, a failed call) nothing can be said about services or ticks, so every video
 * goes in one plain group instead of being sorted on a guess. `skipIds` keeps a video out of the list
 * when another row already plays it ("What is new").
 */
export function helpGroups<V extends VideoLike>(
  videos: readonly V[],
  known: HelpKnown | null,
  skipIds: readonly string[] = [],
): HelpGroup<V>[] {
  const rows: Record<HelpGroupId, HelpRow<V>[]> = { mine: [], general: [], more: [], all: [] };
  for (const v of videos) {
    if (skipIds.includes(v.id)) continue;
    if (!known) {
      rows.all.push({ video: v, watched: false, tracked: false });
      continue;
    }
    const tracked = known.mine.has(v.id) || known.more.has(v.id);
    const id: HelpGroupId = known.mine.has(v.id) ? 'mine' : tracked || v.service ? 'more' : 'general';
    rows[id].push({ video: v, watched: known.watched.has(v.id), tracked });
  }
  const order: HelpGroupId[] = ['mine', 'general', 'more', 'all'];
  return order.filter((id) => rows[id].length > 0).map((id) => ({ id, rows: rows[id] }));
}

/**
 * "6 of 13 watched, next: ...": counted over the videos the server keeps a tick for (a general video
 * has none, so it could never be "watched" and must not sit in the total), and the first of those not
 * watched yet.
 */
export function helpProgress<V>(groups: readonly HelpGroup<V>[]): { done: number; total: number; next: V | null } {
  const tracked = groups.flatMap((g) => g.rows).filter((r) => r.tracked);
  const next = tracked.find((r) => !r.watched)?.video ?? null;
  return { done: tracked.filter((r) => r.watched).length, total: tracked.length, next };
}

// ── dates ──────────────────────────────────────────────────────────────────

/** A calendar day with its year ("9 Dec 2026", "9 दिसंबर 2026"): a licence good until December is never read as this year's. */
export function longDay(isoDay: string, lang: Lang): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDay);
  if (!m) return isoDay;
  const day = fmtDate(`${m[1]}-${m[2]}-${m[3]}`, lang);
  return /^\d/.test(day) ? `${day} ${m[1]}` : isoDay;
}

/** The names of the services that need a look, in the reader's language, first three, never a raw id. */
export function lookNames(ids: readonly string[], lang: Lang): string[] {
  const names = ids.map((id) => serviceNameOf(id, lang)).filter((n): n is string => !!n);
  return [...new Set(names)].slice(0, 3);
}
