import { countsOf } from '@/features/glance/glanceModel';
import { viewOfData } from '@/features/reports/registry';
import { usableData } from '@/features/today/todayView';
import { indiaDay } from '@/lib/fmt';
import { translate } from '@/lib/i18n';
import { tnIn } from '@/lib/messages/_plural';
import type { Lang } from '@/store/lang';
import { OWNER_ONLY_REPORT_KINDS } from '@dk/shared';
import {
  STANDARD_PACKAGE_SERVICE_IDS,
  type KavachDealerView,
  type ReportKind,
  type TodayFeed,
  type TodayReport,
  type TodayTask,
} from '@dk/shared/types';

import { dsrDoorLine, fuelDoorLine } from './panels/panelModels';
import { runTimes } from './runTimes';
import { serviceAboutOf, serviceNameOf } from './serviceCopy';
import {
  HUB_GROUPS,
  KAVACH_ROW,
  hasServicePage,
  isServiceVisible,
  kindsOfService,
  serviceOfKind,
  serviceSpec,
  servicesInGroup,
  taskKindService,
  type ServiceGroup,
} from './serviceMap';
import {
  serviceHealth,
  serviceState,
  type ServiceHealth,
  type ServiceState,
  type ServiceTimes,
} from './serviceState';
import type { MeServicesRead } from './useMeServices';

/**
 * Everything the Services door decides, as plain functions (spec 4.2): which services are listed and
 * in which group, what each row says, how they are counted into "8 of 9 services running", which open
 * tasks are shown against a service, which services could be added. No React, no network, no clock
 * except the `now` it is given.
 *
 * Two sources are never mixed up. The Today feed (which the app already holds) tells what MDG SENT:
 * the newest report of each service and the open tasks. `GET /v1/me/services` tells how each service
 * RUNS. Without the second there is no health word: `serviceState` answers `null` and the door says so
 * (spec 4.2.3), instead of guessing "Working".
 */

export type HubGroup = Exclude<ServiceGroup, 'hidden' | 'button'>;

export interface HubInput {
  feed?: TodayFeed | null;
  /** The answer of `GET /v1/me/services`; absent while it is loading, missing or failed. */
  me?: MeServicesRead | null;
  /** The service ids the older route lists, used only to know what is attached when `me` is absent. */
  attachedIds?: readonly string[] | null;
  isOwner: boolean;
  /** The pump is live: a held service is "paused" and not "getting ready". */
  live: boolean;
  kavach?: KavachDealerView | null;
  lang: Lang;
  now: Date;
}

export interface HubRow {
  id: string;
  name: string;
  group: HubGroup;
  /** The state's words, or null when nothing but the server can say (then no health word is drawn). */
  state: ServiceState | null;
  /** The newest report's own words ("24,330 L"), or null when MDG has sent none yet. */
  result: string | null;
  /** When the newest report was sent, for "Last checked" while the server's run times are not known. */
  lastSeenAt: string | null;
  times: ServiceTimes;
  /** The service's page exists: the row opens it. */
  tappable: boolean;
  about: string;
  /** The server's word, kept for the feeds line and for tests. */
  run?: MeServicesRead['services'][number]['run'];
}

export interface NeedsRow {
  task: TodayTask;
  /** The service's id, or `papers` / `pump` for a task that belongs to My pump and not to a service. */
  serviceId: string;
  serviceName: string;
  /** Whole days it has waited, India time. 0 on the day it came. */
  waitingDays: number;
}

export interface FeedsLine {
  /** How many data feeds are attached. */
  n: number;
  /** The server answered and every feed is running. */
  allRunning: boolean;
  stopped: number;
}

export interface Hub {
  /** Kavach's own row, first, when Kavach is on: the score. */
  kavach: { pct: number } | null;
  groups: Array<{ group: HubGroup; rows: HubRow[] }>;
  feeds: FeedsLine | null;
  needs: NeedsRow[];
  /** Health words, only when `/me/services` answered and at least one service runs. */
  health:
    | (ServiceHealth & {
        status: 'ok' | 'waiting' | 'attention' | 'problem' | 'info';
        first: HubRow | null;
        /** "Getting ready" and "Paused": counted in `total`, running nothing yet. */
        notYet: number;
        /** "When you ask": NOT in `total` (they are not meant to run on their own), but named, so the counts add up. */
        onRequest: number;
      })
    | null;
  /** The neutral line when there is no health card: reports that came today, from the feed. */
  cameToday: number;
  /** MDG's things done this week (`week.total`), when the server said. */
  week: number | null;
  /** The services in the standard package that are not attached (greyed rows), when attachment is known. */
  addable: Array<{ id: string; name: string; about: string }>;
  /** Reports needing a look, for the Reports pill's count. */
  look: number;
  /** When the picture was made: the server's own time, else the newest report's. */
  asOf: string | null;
  /** The door has nothing to list at all. */
  empty: boolean;
}

// ── reports ─────────────────────────────────────────────────────────────────

/** The feed's reports and what MDG finished today, each once. */
export function feedReports(feed: TodayFeed | null | undefined): TodayReport[] {
  const seen = new Set<string>();
  const out: TodayReport[] = [];
  for (const r of [...(feed?.reports ?? []), ...(feed?.done ?? [])]) {
    if (seen.has(r.messageId)) continue;
    seen.add(r.messageId);
    out.push(r);
  }
  return out;
}

/** Reports a manager may never read are dropped here whatever the server sent. */
export function readable(reports: readonly TodayReport[], isOwner: boolean): TodayReport[] {
  return reports.filter((r) => isOwner || !OWNER_ONLY_REPORT_KINDS.has(r.kind));
}

/** The newest report of any of `kinds` (by send time). */
export function newestOf(
  reports: readonly TodayReport[],
  kinds: readonly ReportKind[],
): TodayReport | undefined {
  let best: TodayReport | undefined;
  for (const r of reports) {
    if (!kinds.includes(r.kind)) continue;
    if (!best || r.sentAt > best.sentAt) best = r;
  }
  return best;
}

/**
 * The one line a row says about its newest report: the kind's own tile text ("24,330 L, up 6%"),
 * else its history headline, else the words the message carried. Read through the kind's view, so
 * the app says it exactly as Today does and no new contract is needed (spec 4.2.6).
 */
export function resultLine(report: TodayReport, isOwner: boolean, lang: Lang): string | null {
  const data = usableData(report, isOwner);
  if (data) {
    const view = viewOfData(data);
    const tile = view.tile(data as never, lang);
    if (tile?.value) return tile.sub ? `${tile.value}, ${tile.sub}` : tile.value;
    const line = view.headline(data as never, lang);
    if (line) return line;
  }
  return report.headline?.trim() || null;
}

/**
 * The one line a row says. The two services whose own tile reads like a table row or carries a plate
 * number get a sentence written for the door: the stock variation ("Diesel 100 L outside the limit,
 * 520 L short") and the orders on the way ("1 order on the way"; the plate stays on the order's page).
 * Every other service says what its newest report's tile says.
 */
export function doorLineOf(
  serviceId: string,
  reports: readonly TodayReport[],
  newest: TodayReport | undefined,
  isOwner: boolean,
  lang: Lang,
): string | null {
  if (serviceId === 'dsr-report') {
    const line = dsrDoorLine(reports, isOwner, lang);
    if (line) return line;
  }
  if (serviceId === 'fuel-indent') {
    const orders = fuelDoorLine(reports, isOwner);
    if (orders !== null) {
      return orders > 0 ? tnIn(lang, 'svc.door.fuel.on', orders) : translate(lang, 'svc.fuel.none');
    }
  }
  return newest ? resultLine(newest, isOwner, lang) : null;
}

// ── tasks ───────────────────────────────────────────────────────────────────

/** The photo ask a task answers, for the task-to-service map. */
export function askRefOf(task: Pick<TodayTask, 'action'>): string | undefined {
  return task.action?.type === 'photo' ? task.action.askRef : undefined;
}

/** The service an open task belongs to, or null. */
export function serviceOfTask(task: Pick<TodayTask, 'kind' | 'action'>): string | null {
  return taskKindService(task.kind, askRefOf(task));
}

/** The names of the two homes for a task that belongs to no service (spec 4.2.5 lists it with the rest). */
export const NEEDS_PAPERS = 'papers';
export const NEEDS_PUMP = 'pump';

/**
 * Where an open task is listed on the door. A task of a service goes under that service. A photo ask
 * for a paper (`doc:`) is "Your papers", and a login or details box is "Your pump": the owner has to do
 * them just the same, so the door lists them and does not pretend nothing waits. The setup box is the
 * setup card's, never listed here.
 */
export function needsHomeOf(task: Pick<TodayTask, 'kind' | 'action'>): string | null {
  const id = serviceOfTask(task);
  if (id) return id;
  switch (task.kind) {
    case 'setup':
      return null;
    case 'ask':
      return askRefOf(task)?.startsWith('doc:') ? NEEDS_PAPERS : NEEDS_PUMP;
    case 'portal_login':
    case 'outlet_details':
    case 'password_pick':
      return NEEDS_PUMP;
    default:
      return null;
  }
}

/** The open tasks of one service. */
export function tasksOfService(tasks: readonly TodayTask[], serviceId: string): TodayTask[] {
  return tasks.filter((t) => serviceOfTask(t) === serviceId);
}

/** Whole days a task has waited, counted on the India calendar. */
export function waitingDaysOf(since: string, now: Date): number {
  const from = Date.parse(indiaDay(new Date(since)) + 'T00:00:00Z');
  const to = Date.parse(indiaDay(now) + 'T00:00:00Z');
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

/** Late first, then the longest waiting, so the oldest thing is the first row. */
function byUrgency(a: NeedsRow, b: NeedsRow): number {
  return (
    (b.task.late ? 1 : 0) - (a.task.late ? 1 : 0) ||
    b.waitingDays - a.waitingDays ||
    a.task.since.localeCompare(b.task.since)
  );
}

// ── the hub ─────────────────────────────────────────────────────────────────

/**
 * Which services are attached to this pump, and how sure that is. From the server's list when it
 * answered; else the older route's; else only what the feed proves (a report or a task of the
 * service). `known` is false for the last, and then "You could add" is not drawn: an unknown set is
 * not a reason to offer everything.
 */
export function attachedOf(input: Pick<HubInput, 'me' | 'attachedIds' | 'feed'>): {
  ids: Set<string>;
  known: boolean;
} {
  if (input.me) return { ids: new Set(input.me.services.map((s) => s.serviceId)), known: true };
  if (input.attachedIds) return { ids: new Set(input.attachedIds), known: true };
  const ids = new Set<string>();
  for (const r of feedReports(input.feed)) {
    const id = serviceOfKind(r.kind);
    if (id) ids.add(id);
  }
  for (const t of input.feed?.tasks ?? []) {
    const id = serviceOfTask(t);
    if (id) ids.add(id);
  }
  return { ids, known: false };
}

const FIRST_PRIORITY: Record<string, number> = { stopped: 0, needs_you: 1, look: 2, late: 3 };

export function buildHub(input: HubInput): Hub {
  const { feed, me, isOwner, live, kavach, lang, now } = input;
  const tasks = feed?.tasks ?? [];
  const reports = readable(feedReports(feed), isOwner);
  const attached = attachedOf(input);
  const entryOf = new Map((me?.services ?? []).map((e) => [e.serviceId, e] as const));
  const kavachOn = !!kavach?.on;

  const rows: HubRow[] = [];
  for (const group of HUB_GROUPS) {
    for (const id of servicesInGroup(group, isOwner)) {
      if (!attached.ids.has(id)) continue;
      const entry = entryOf.get(id);
      const kinds = kindsOfService(id);
      const newest = newestOf(reports, kinds);
      const state = serviceState({ serviceId: id, run: entry?.run, tasks, reports, live });
      const times = state && entry ? runTimes(entry, lang, now) : {};
      rows.push({
        id,
        name: serviceNameOf(id, lang),
        group,
        state,
        result: doorLineOf(id, reports, newest, isOwner, lang),
        lastSeenAt: newest?.sentAt ?? null,
        times,
        tappable: hasServicePage(id, isOwner),
        about: serviceAboutOf(id, lang),
        ...(entry ? { run: entry.run } : {}),
      });
    }
  }

  const named = rows.filter((r) => r.name);
  const groups = HUB_GROUPS.filter((g) => g !== 'feeds').map((group) => ({
    group,
    rows: named.filter((r) => r.group === group),
  }));
  const feedRows = named.filter((r) => r.group === 'feeds');
  const feeds: FeedsLine | null =
    feedRows.length === 0
      ? null
      : {
          n: feedRows.length,
          allRunning: !!me && feedRows.every((r) => r.state?.id === 'working'),
          stopped: feedRows.filter((r) => r.state?.id === 'stopped').length,
        };

  // Needs you: the tasks that belong to a service this reader sees, oldest and latest first.
  const needs: NeedsRow[] = [];
  for (const task of tasks) {
    const id = needsHomeOf(task);
    if (!id) continue;
    const own = id === NEEDS_PAPERS || id === NEEDS_PUMP;
    if (!own && (id === KAVACH_ROW ? !kavachOn : !isServiceVisible(id, isOwner))) continue;
    const name = own
      ? translate(lang, id === NEEDS_PAPERS ? 'svc.needs.papers' : 'svc.needs.pump')
      : serviceNameOf(id, lang);
    if (!name) continue;
    needs.push({
      task,
      serviceId: id,
      serviceName: name,
      waitingDays: waitingDaysOf(task.since, now),
    });
  }
  needs.sort(byUrgency);

  // Health: only the server can say a service runs. "When you ask" services are not "running", but they
  // are counted by name so the numbers under the headline add up to what is listed.
  let health: Hub['health'] = null;
  if (me) {
    const counted = named.filter(
      (r) => r.state && !(r.state.id === 'on_request' && r.run === 'on_request'),
    );
    const h = serviceHealth(counted.map((r) => r.state));
    if (h.total > 0) {
      const status =
        h.stopped > 0
          ? 'problem'
          : h.needsYou > 0
            ? 'waiting'
            : h.lookAt > 0
              ? 'attention'
              : h.running === h.total
                ? 'ok'
                : 'info';
      const first =
        [...counted]
          .filter((r) => r.state && r.state.id in FIRST_PRIORITY)
          .sort((a, b) => FIRST_PRIORITY[a.state!.id]! - FIRST_PRIORITY[b.state!.id]!)[0] ?? null;
      health = {
        ...h,
        status,
        first,
        notYet: counted.filter((r) => r.state?.id === 'ready' || r.state?.id === 'paused').length,
        onRequest: named.filter((r) => r.state?.id === 'on_request' && r.run === 'on_request')
          .length,
      };
    }
  }

  const today = indiaDay(now);
  const cameToday = reports.filter(
    (r) => r.kind !== 'announcement' && indiaDay(new Date(r.sentAt)) === today,
  ).length;

  // You could add: the standard package minus what is attached, only when the attached set is real.
  const addable = attached.known
    ? STANDARD_PACKAGE_SERVICE_IDS.filter((id) => {
        const spec = serviceSpec(id);
        return (
          !attached.ids.has(id) &&
          !!spec &&
          ['daily', 'filed', 'ask'].includes(spec.group) &&
          isServiceVisible(id, isOwner)
        );
      })
        .map((id) => ({ id, name: serviceNameOf(id, lang), about: serviceAboutOf(id, lang) }))
        .filter((a) => a.name)
    : [];

  const newestSent = reports.reduce<string | null>(
    (acc, r) => (!acc || r.sentAt > acc ? r.sentAt : acc),
    null,
  );

  return {
    kavach: kavachOn && kavach?.summary ? { pct: kavach.summary.pct } : null,
    groups,
    feeds,
    needs,
    health,
    cameToday,
    week: me?.week ? me.week.total : null,
    addable,
    look: feed
      ? countsOf({ feed, kavach: kavach ?? null, role: isOwner ? 'owner' : 'manager', now }).look
      : 0,
    asOf: me?.asOf ?? newestSent,
    empty: named.length === 0 && !(kavachOn && kavach?.summary),
  };
}
