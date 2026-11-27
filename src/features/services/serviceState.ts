import { ALERT_PER_REPORT_KINDS } from '@/features/today/todayView';
import { fmtDay, fmtTime } from '@/lib/fmt';
import { translate, type MessageKey } from '@/lib/i18n';
import type { Lang } from '@/store/lang';
import type {
  MeServiceEntry,
  MeServiceRun,
  ReportKind,
  TodayReport,
  TodayTask,
} from '@dk/shared/types';

import { kindsOfService, taskKindService } from './serviceMap';

/**
 * The words a service wears on the hub and on its page (spec 4.2, the state table).
 *
 * The state is decided FIRST-MATCH, in the table's order. Two rows need nothing from the server
 * (an open task, an attention report: both are in the Today feed the app already holds), so they
 * still answer when `GET /v1/me/services` is missing or failed. Every other row needs the server's
 * `run`; without it the answer is `null`, and the page says no health word at all. A guessed
 * "Working" never appears.
 *
 * `lastRanAt` is stamped on failed runs too, so the page says "Last ran", never "last success",
 * and only beside a state word.
 */

export type ServiceStateId =
  | 'needs_you'
  | 'stopped'
  | 'look'
  | 'late'
  | 'ready'
  | 'paused'
  | 'on_request'
  | 'working';

/** The five shapes of `StatusBadge`; the state table names the shape beside each word. */
export type ServiceShape = 'clock' | 'octagon' | 'triangle' | 'circle-i' | 'tick';

export interface ServiceState {
  id: ServiceStateId;
  shape: ServiceShape;
  /** What the kit's `StatusPill` is given (`stopped` is the octagon that is not a report problem). */
  status: 'waiting' | 'stopped' | 'attention' | 'info' | 'ok';
  /** The words, in `glance.svcState.*`. */
  wordKey: MessageKey;
}

/** The state table, one row per state. */
export const SERVICE_STATES: Readonly<Record<ServiceStateId, ServiceState>> = {
  needs_you: {
    id: 'needs_you',
    shape: 'clock',
    status: 'waiting',
    wordKey: 'glance.svcState.needsYou',
  },
  stopped: {
    id: 'stopped',
    shape: 'octagon',
    status: 'stopped',
    wordKey: 'glance.svcState.stopped',
  },
  look: { id: 'look', shape: 'triangle', status: 'attention', wordKey: 'glance.svcState.look' },
  late: { id: 'late', shape: 'triangle', status: 'attention', wordKey: 'glance.svcState.late' },
  ready: { id: 'ready', shape: 'circle-i', status: 'info', wordKey: 'glance.svcState.ready' },
  paused: { id: 'paused', shape: 'circle-i', status: 'info', wordKey: 'glance.svcState.paused' },
  on_request: {
    id: 'on_request',
    shape: 'circle-i',
    status: 'info',
    wordKey: 'glance.svcState.onRequest',
  },
  working: { id: 'working', shape: 'tick', status: 'ok', wordKey: 'glance.svcState.working' },
};

export interface ServiceStateInput {
  serviceId: string;
  /** The server's word for how it runs; absent when `/me/services` has not answered. */
  run?: MeServiceRun;
  /** The open tasks of the Today feed. */
  tasks: readonly Pick<TodayTask, 'kind' | 'action'>[];
  /** The reports of the Today feed (or the loaded history); the newest of the service's kinds is read. */
  reports: readonly Pick<TodayReport, 'kind' | 'status' | 'sentAt'>[];
  /** The pump's setup stage is live (`watch` or `live`). Decides whether a held service is "getting ready" or "paused". */
  live: boolean;
}

/**
 * Does the service's newest report say "look"? A message that carries both DSR sheets is tagged
 * `dsr_variation`, so a service is read through all of its kinds, never one. A kind that is about
 * one vehicle or one order (`ALERT_PER_REPORT_KINDS`) is read report by report, as Today does: a
 * shortage on Tuesday's tanker is not hidden by a clean receipt on Wednesday's.
 */
function needsLook(kinds: readonly ReportKind[], reports: ServiceStateInput['reports']): boolean {
  let newest: ServiceStateInput['reports'][number] | undefined;
  for (const r of reports) {
    if (!kinds.includes(r.kind)) continue;
    if (ALERT_PER_REPORT_KINDS.has(r.kind) && r.status === 'attention') return true;
    if (!ALERT_PER_REPORT_KINDS.has(r.kind) && (!newest || r.sentAt > newest.sentAt)) newest = r;
  }
  return newest?.status === 'attention';
}

/**
 * First match wins:
 *  1. Needs you: an open task whose kind belongs to the service.
 *  2. Stopped: the server says `failing`.
 *  3. Look at this: the newest report of its kinds is `attention` (an aged alarm is already `info`).
 *  4. Late: `late`.
 *  5. Getting ready: `held` while the pump is not live, or `new`.
 *  6. Paused: `held` while live (the reason is not served: the line says "Ask MDG why").
 *  7. On request.
 *  8. Working: `ok` or `running`.
 * With no `run` and neither 1 nor 3 true: `null` (no health word).
 */
export function serviceState(input: ServiceStateInput): ServiceState | null {
  const { serviceId, run, tasks, reports, live } = input;

  if (
    tasks.some(
      (t) =>
        taskKindService(t.kind, t.action?.type === 'photo' ? t.action.askRef : undefined) ===
        serviceId,
    )
  ) {
    return SERVICE_STATES.needs_you;
  }
  if (run === 'failing') return SERVICE_STATES.stopped;

  // An aged alarm (the kinds nothing ever clears) is `info` from the server: the status is read, never the frozen snapshot.
  if (needsLook(kindsOfService(serviceId), reports)) return SERVICE_STATES.look;

  switch (run) {
    case 'late':
      return SERVICE_STATES.late;
    case 'new':
      return SERVICE_STATES.ready;
    case 'held':
      return live ? SERVICE_STATES.paused : SERVICE_STATES.ready;
    case 'on_request':
      return SERVICE_STATES.on_request;
    case 'ok':
    case 'running':
      return SERVICE_STATES.working;
    default:
      return null;
  }
}

/** The words for a state, in the reader's language. */
export function serviceStateWord(state: ServiceState, lang: Lang): string {
  return translate(lang, state.wordKey);
}

// ── the health card ─────────────────────────────────────────────────────────

export interface ServiceHealth {
  /** Services counted (the rows that have a state). */
  total: number;
  /** In the state `working`: "8 of 9 services running". */
  running: number;
  needsYou: number;
  stopped: number;
  /** `look`, `late`: something to look at. */
  lookAt: number;
}

/**
 * The counts behind "8 of 9 services running. 1 needs you." from the states of the visible rows.
 * A row with no state (no server answer) is not counted: with no answer the card is not drawn.
 */
export function serviceHealth(states: readonly (ServiceState | null)[]): ServiceHealth {
  const known = states.filter((s): s is ServiceState => s !== null);
  return {
    total: known.length,
    running: known.filter((s) => s.id === 'working').length,
    needsYou: known.filter((s) => s.id === 'needs_you').length,
    stopped: known.filter((s) => s.id === 'stopped').length,
    lookAt: known.filter((s) => s.id === 'look' || s.id === 'late').length,
  };
}

// ── "Last ran 7:05 am, next 7 pm" ───────────────────────────────────────────

export interface ServiceTimes {
  /** "Last ran today 7:05 am": absent when the service has not finished a run. */
  lastRan?: string;
  /** "Next today 7 pm": absent when no next run is known. */
  next?: string;
}

const dayAndTime = (iso: string, lang: Lang, now: Date): string =>
  `${fmtDay(iso, lang, now)} ${fmtTime(iso, lang)}`;

/**
 * The state line of a service, in the dealer's clock and language. Say it only beside a state word
 * (it is the server's own claim). A date that cannot be read is left out, never printed as a dash.
 */
export function serviceTimes(
  entry: Pick<MeServiceEntry, 'lastRanAt' | 'nextRunAt'> | undefined,
  lang: Lang,
  now: Date,
): ServiceTimes {
  const out: ServiceTimes = {};
  if (entry?.lastRanAt && !Number.isNaN(Date.parse(entry.lastRanAt))) {
    out.lastRan = translate(lang, 'glance.svcState.lastRan', {
      time: dayAndTime(entry.lastRanAt, lang, now),
    });
  }
  if (entry?.nextRunAt && !Number.isNaN(Date.parse(entry.nextRunAt))) {
    out.next = translate(lang, 'glance.svcState.next', {
      time: dayAndTime(entry.nextRunAt, lang, now),
    });
  }
  return out;
}
