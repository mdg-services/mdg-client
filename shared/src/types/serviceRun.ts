import type { ServiceRunStatus } from './enums';
import type { RunArtifactKind } from './plugin';

export interface ServiceRunStep {
  name: string;
  status: 'start' | 'ok' | 'error';
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  message?: string;
  meta?: Record<string, unknown>;
  error?: { message: string; stack?: string };
}

export interface ServiceRunArtifact {
  id: string;
  reportCode?: string;
  filename: string;
  size?: number;
  contentType?: string;
  createdAt: string;
  /**
   * `diagnostic` artifacts (failure screenshots, page dumps, raw upstream
   * responses) are serialised for super-admins only, so anything a plain admin
   * receives here is an `output` artifact.
   */
  kind?: RunArtifactKind;
}

/**
 * How a run started. `manual` is an admin pressing Run now / Generate;
 * `scheduled` is the cadence tick; `backfill` is a run one service started on
 * another's behalf — the DSR collecting the IRAS shift data it needs before it
 * can report on a day; `attach` is the one-off run fired the moment a service is
 * added to a dealer, so a self-scheduling plugin can read its real timetable off
 * the upstream portal instead of waiting for a generic cron to fire once
 * (see {@link ServicePlugin.discoverScheduleOnAttach}).
 */
export type ServiceRunTrigger = 'manual' | 'scheduled' | 'backfill' | 'attach';

export interface ServiceRun {
  id: string;
  dealerId: string;
  /**
   * The dealer's CODE ("15E") — the only thing that identifies a dealer in this
   * product. A run row that prints the tail of a Mongo ObjectId identifies
   * nothing to the person reading it.
   *
   * RESOLVED ON READ, never stored on the ServiceRun document. Twelve
   * `ServiceRunModel.create` sites would each have to remember to stamp it, and
   * a dealer whose code is later corrected would leave every historical run
   * showing the old one — which is the authoritative-figure fault this codebase
   * keeps re-learning.
   *
   * `null` when the dealer is archived, deleted, or never existed (several test
   * seeds point a run at an id with no Dealer behind it). Optional so every
   * existing producer still compiles. Render it through `dealerCodeLabel`,
   * which gives an em dash rather than a guess.
   */
  dealerCode?: string | null;
  serviceId: string;
  dealerServiceId: string;
  startedAt: string;
  finishedAt?: string;
  status: ServiceRunStatus;
  durationMs?: number;
  output?: unknown;
  /** Absent on rows written before the field existed. */
  trigger?: ServiceRunTrigger;
  /**
   * The run that drove this one, set on a `backfill`. Lets the admin panel
   * attribute an out-of-band collection to the report that asked for it.
   */
  parentRunId?: string;
  error?: {
    message: string;
    /** Process detail — serialised for super-admins only. */
    stack?: string;
  };
  /**
   * Stable failure category for a FAILED run (e.g. `LOGIN_REJECTED`), resolved
   * server-side from the error step's `meta.code` or a `[CODE]` token in the
   * error message. Plain admins don't receive `steps`, so this is how the admin
   * failure panel keeps its plain-language copy.
   */
  failureCode?: string;
  /** The phase/step the run failed at, e.g. `login`. Companion to `failureCode`. */
  failurePhase?: string;
  /** Process detail — serialised for super-admins only. */
  steps?: ServiceRunStep[];
  artifacts?: ServiceRunArtifact[];
  createdAt: string;
  updatedAt: string;
}

export interface RunsListQuery {
  dealerId?: string;
  serviceId?: string;
  status?: ServiceRunStatus;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}
