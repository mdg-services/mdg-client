/**
 * The dealer app's Services page (`GET /v1/me/services`).
 *
 * One entry per service MDG runs for the outlet the token is signed in to, with a
 * plain run state the app can say in a word, and the count of reports MDG sent in the
 * last seven days. It never carries `config`, error text, a stack, artifacts or run
 * ids. A manager's list leaves out the owner-only services (`OWNER_ONLY_SERVICE_IDS`).
 */
import type { Cadence } from './enums';
import type { ReportKind } from './conversation';

/**
 * Where a service stands, in the order the server decides it:
 * `held` (paused), `failing` (the latest finished run failed), `late` (its next run is
 * more than 30 minutes past and nothing is running), `new` (attached, nothing has run
 * yet), `on_request` (runs only when asked), else `running` or `ok`.
 */
export type MeServiceRun = 'ok' | 'running' | 'failing' | 'late' | 'held' | 'new' | 'on_request';

export interface MeServiceEntry {
  serviceId: string;
  run: MeServiceRun;
  cadence: Cadence;
  /** Newest FINISHED run, any outcome. The app says "Last ran", never "success". */
  lastRanAt?: string;
  /** Newest run that SUCCEEDED. */
  lastGoodAt?: string;
  nextRunAt?: string;
}

export interface MeServicesView {
  asOf: string;
  services: MeServiceEntry[];
  /** MDG's tagged report messages in the last 7 days, readable by this viewer. */
  week: { since: string; total: number; byKind: Partial<Record<ReportKind, number>> };
}

/**
 * `GET /v1/me/reports/summary?days=30`: what MDG sent in the window, per report kind,
 * counted from the message tags alone. `days` are business days (`YYYY-MM-DD`, oldest
 * first) that had a report of that kind; `needLook` is how many of the `count` still
 * carry an alarm (old alarms of the ageing kinds no longer count). Kinds with nothing in
 * the window, and the kinds a manager may not read, are absent.
 */
export interface ReportSummary {
  since: string;
  byKind: Partial<Record<ReportKind, { count: number; needLook: number; days: string[] }>>;
}
