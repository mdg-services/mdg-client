
import { isMine, isNeed, kavachRoleOf } from '@/features/kavach/kavachView';
import { KAVACH_ROW, serviceOfKind, taskKindService } from '@/features/services/serviceMap';
import type { AlertItem } from '@/features/today/todayModel';
import { ALERT_PER_REPORT_KINDS, newestFirst, taskCoversReport } from '@/features/today/todayView';
import { daysUntil } from '@/lib/fmt';
import { translate } from '@/lib/i18n';
import type { Lang } from '@/store/lang';
import { AGING_REPORT_KINDS, OWNER_ONLY_REPORT_KINDS } from '@dk/shared';
import type {
  KavachDealerItem,
  KavachDealerView,
  TodayFeed,
  TodayReport,
  TodayTask,
} from '@dk/shared/types';

/**
 * "Needs you": the one merged list of what waits for the dealer (spec 3.2 and 4.1), and the small
 * rules behind it that the tab bar's badge also needs.
 *
 * Pure, with no React and no report-kind drawing code: the alerts a kind raises are passed IN (Today
 * asks `buildAlertsAndCovered` for them), so this file is cheap enough for the bar to load.
 *
 * What goes in the list: the open tasks, the Kavach points that were sent back or are late (when no
 * task already asks for the same point), and the alerts of the reports. The order is the spec's:
 * late first, then problems, then attention, then the newest.
 */

export type Role = 'owner' | 'manager';

// ── shared rules (also read by `countsOf` in glanceModel.ts) ────────────────

/**
 * An old alarm the server has already let go (ADR 0055 section 5): for the kinds nothing ever clears,
 * the server turns the status from "needs a look" to plain information once the day has passed.
 * The same test as `isAgedOut` in `todayModel.ts`, written here because that file loads every
 * kind's drawing code and the tab bar must not.
 */
export function isAgedAlarm(report: Pick<TodayReport, 'kind' | 'status'>): boolean {
  return AGING_REPORT_KINDS.has(report.kind) && report.status === 'info';
}

/** The id under which a report competes to be the newest: its kind, or kind plus message for the per-order kinds. */
function slotOf(r: Pick<TodayReport, 'kind' | 'messageId'>): string {
  return ALERT_PER_REPORT_KINDS.has(r.kind) ? `${r.kind}|${r.messageId}` : r.kind;
}

/**
 * The reports Today reads for alerts: the newest of each kind (each report, for the kinds that are
 * about one vehicle or order), never an owner-only one for a manager. Same choice as `buildAlerts`.
 */
export function newestOfEachKind(reports: readonly TodayReport[], role: Role): TodayReport[] {
  const seen = new Map<string, TodayReport>();
  for (const r of newestFirst(reports)) {
    if (role !== 'owner' && OWNER_ONLY_REPORT_KINDS.has(r.kind)) continue;
    const id = slotOf(r);
    if (!seen.has(id)) seen.set(id, r);
  }
  return [...seen.values()];
}

/**
 * The reports that say "have a look": attention, not aged out, and not the same work as an open task
 * (a DU OTP, declarations or mock drill report that the box already asks for).
 */
export function attentionReports(feed: TodayFeed, role: Role): TodayReport[] {
  return newestOfEachKind(feed.reports, role).filter(
    (r) => !isAgedAlarm(r) && !taskCoversReport(feed.tasks, r.kind) && r.status === 'attention',
  );
}

/** The ask a task answers, when it is a photo ask (`doc:`, `reg:`, `kv:` plus an id). */
function askRefOf(task: Pick<TodayTask, 'action'>): string | undefined {
  return task.action?.type === 'photo' ? task.action.askRef : undefined;
}

/**
 * The Kavach points that need this reader: sent back, or late, and HIS job. It is the very list the Kavach
 * page draws under "Needs you" (`isMine` and `isNeed` from `kavachView`, the same two tests `sectionsOf`
 * uses), so Today, the verdict and the page can never count a point another does not. An owner is not asked
 * for his manager's daily work, a manager not for what only the owner can send, and nobody for MDG's own data
 * points. Skipped when an open task already asks for the same point.
 *
 * Read from the points themselves, not from `summary.counts`: the server counts a sent-back point that
 * is also late in BOTH `sentBack` and `late`, so adding the two numbers would count it twice.
 */
export function kavachNeeds(
  kavach: KavachDealerView | null | undefined,
  role: Role,
  tasks: readonly Pick<TodayTask, 'action'>[],
): KavachDealerItem[] {
  if (!kavach?.on) return [];
  const asked = new Set(tasks.map(askRefOf).filter((x): x is string => !!x));
  const mine = kavachRoleOf(role);
  const seen = new Set<string>();
  const out: KavachDealerItem[] = [];
  for (const item of kavach.now ?? []) {
    if (!isNeed(item) || !isMine(item, mine) || seen.has(item.code)) continue;
    if (asked.has(`kv:${item.code}`) || (item.checkId && asked.has(`kv:${item.checkId}`))) continue;
    seen.add(item.code);
    out.push(item);
  }
  return out;
}

/**
 * How many Kavach points need the reader. From the points when the view carries them; from the two
 * summary numbers (the larger, since a point can sit in both) when only the summary is there.
 */
export function kavachNeedCount(
  kavach: KavachDealerView | null | undefined,
  role: Role,
  tasks: readonly Pick<TodayTask, 'action'>[],
): number {
  if (!kavach?.on) return 0;
  if (Array.isArray(kavach.now)) return kavachNeeds(kavach, role, tasks).length;
  const c = kavach.summary?.counts;
  return c ? Math.max(c.sentBack, c.late) : 0;
}

// ── the list ────────────────────────────────────────────────────────────────

export type NeedsMeSource = 'task' | 'alert' | 'kavach';

export interface NeedsMeItem {
  id: string;
  source: NeedsMeSource;
  /** The shape the row wears: octagon, triangle or clock (a thing waiting for the dealer). */
  status: 'problem' | 'attention' | 'waiting';
  /** Waiting longer than it should: listed first. */
  late: boolean;
  /** What it is, in the reader's language, as one plain line. */
  text: string;
  /** The service it belongs to ("Daily sales report"), or `KAVACH_ROW`, or null when it belongs to none. */
  serviceId: string | null;
  /** ISO time it began waiting (a task, a Kavach point sent back); the report's send time for an alert. */
  since: string;
  /** Whole days it has waited, in India time: 0 on the day it came. Absent for an alert. */
  waitingDays?: number;
  task?: TodayTask;
  report?: TodayReport;
  kavach?: KavachDealerItem;
}

const rankOf = (i: Pick<NeedsMeItem, 'late' | 'status'>): number =>
  i.late ? 0 : i.status === 'problem' ? 1 : i.status === 'attention' ? 2 : 3;

/** The order of the list: late first, then problems, then attention, then the newest; stable inside. */
export function sortNeedsMe(items: readonly NeedsMeItem[]): NeedsMeItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        rankOf(a.item) - rankOf(b.item) || b.item.since.localeCompare(a.item.since) || a.index - b.index,
    )
    .map((x) => x.item);
}

export interface NeedsMeInput {
  feed: TodayFeed;
  /** The alerts of the reports, from `buildAlertsAndCovered(...).items` (already without aged alarms and without work a task covers). */
  alerts: readonly Pick<AlertItem, 'report' | 'headline' | 'severity'>[];
  kavach?: KavachDealerView | null;
  role: Role;
  lang: Lang;
  now: Date;
  /** The setup block already carries the feed's `setup` task with its own button: not listed twice. */
  setupShown?: boolean;
}

function waitedDays(since: string, now: Date): number {
  const d = daysUntil(since, now);
  return d === null ? 0 : Math.max(0, -d);
}

/** The merged "Needs you" list, in order. */
export function buildNeedsMe({ feed, alerts, kavach, role, lang, now, setupShown = false }: NeedsMeInput): NeedsMeItem[] {
  const items: NeedsMeItem[] = [];

  for (const task of feed.tasks) {
    if (setupShown && task.kind === 'setup') continue;
    items.push({
      id: `task:${task.id}`,
      source: 'task',
      status: 'waiting',
      late: task.late === true,
      text: task.title,
      serviceId: taskKindService(task.kind, askRefOf(task)),
      since: task.since,
      waitingDays: waitedDays(task.since, now),
      task,
    });
  }

  for (const item of kavachNeeds(kavach, role, feed.tasks)) {
    const title = lang === 'hi' ? item.titleHi : item.titleEn;
    const sentBack = item.state === 'sent_back';
    const since = item.sentBack?.at ?? item.dueAt ?? '';
    items.push({
      id: `kavach:${item.code}`,
      source: 'kavach',
      status: 'waiting',
      late: item.late,
      text: translate(lang, sentBack ? 'glance.needs.kavachBack' : 'glance.needs.kavachLate', { title }),
      serviceId: KAVACH_ROW,
      since,
      ...(since ? { waitingDays: waitedDays(since, now) } : {}),
      kavach: item,
    });
  }

  for (const a of alerts) {
    items.push({
      id: `alert:${a.report.messageId}`,
      source: 'alert',
      status: a.severity,
      late: false,
      text: a.headline,
      serviceId: serviceOfKind(a.report.kind),
      since: a.report.sentAt,
      report: a.report,
    });
  }

  return sortNeedsMe(items);
}
