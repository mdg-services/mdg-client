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

/**
 * What `GET /audit` actually returns: the stored row plus what the read API
 * resolved for it.
 *
 * `GET /dealers/:id/audit` still returns the plain `AuditLog` — every row there
 * is already scoped to one known dealer, so the resolution this adds would be
 * answering a question that screen does not ask.
 *
 * These two fields were previously undeclared, so the admin's Activity page
 * widened `AuditLog` locally to describe them. One local widening is
 * defensible; leaving it there makes an admin page the de facto API contract,
 * with no compiler anywhere in the monorepo able to notice the two drifting
 * apart.
 */
export interface AuditLogView extends AuditLog {
  /**
   * The target's human identity — a dealer CODE, a person's name, an email.
   * `null` when the target has no name or has been deleted; the reader then
   * falls back to the raw id, so "no name" and "gone" must stay distinct.
   */
  entityName: string | null;
  /**
   * The dealer this row is ABOUT, when `entityId` is not itself a dealer id —
   * a DealerService, a ServiceRun. `null` for rows that belong to no single
   * dealer (a bank holiday, the festival band, a login attempt). This is what
   * lets an audit row carry a dealer chip.
   */
  entityDealerId: string | null;
  /**
   * That dealer's CODE, resolved alongside the id.
   *
   * Sent as its own field rather than packed into `entityName` for the reader
   * to split back out: the detail half of a composite name is a serviceId or a
   * business date, so any string-splitting recovery prints one of those in the
   * outlet column the moment the code is missing.
   */
  entityDealerCode: string | null;
}
