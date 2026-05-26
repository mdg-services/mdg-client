import type { AuditAction } from './enums';

export interface AuditLog {
  id: string;
  entity: string;
  entityId: string;
  actorId: string;
  action: AuditAction | string;
  before?: unknown;
  after?: unknown;
  at: string;
}
