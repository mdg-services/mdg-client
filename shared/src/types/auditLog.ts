import type { AuditAction } from './enums';

export interface AuditLog {
  id: string;
  entity: string;
  entityId: string;
  actorId: string;
  action: AuditAction | string;

  /**
   * Actor context captured at write time so an audit row is self-describing even
   * if the acting user is later renamed or deleted. `actorRole`/`actorEmail` are
   * snapshotted from the auth token; `actorName` is resolved best-effort by the
   * read API (may be absent for system/sentinel actors or deleted users).
   */
  actorRole?: string | null;
  actorEmail?: string | null;
  actorName?: string | null;

  /**
   * Request/network context (personal data — see docs). Captured for HTTP-driven
   * actions; absent for background/scheduler actions (sweeps, cron).
   */
  ip?: string | null;
  userAgent?: string | null;
  method?: string | null;
  path?: string | null;

  before?: unknown;
  after?: unknown;
  at: string;
}

/**
 * A distinct actor appearing in the audit trail, with an activity count. Powers
 * the actor filter on the Activity page (GET /audit/actors).
 */
export interface AuditActor {
  actorId: string;
  actorName?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  count: number;
  lastAt?: string | null;
}
