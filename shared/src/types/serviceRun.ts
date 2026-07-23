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

export interface ServiceRun {
  id: string;
  dealerId: string;
  serviceId: string;
  dealerServiceId: string;
  startedAt: string;
  finishedAt?: string;
  status: ServiceRunStatus;
  durationMs?: number;
  output?: unknown;
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
