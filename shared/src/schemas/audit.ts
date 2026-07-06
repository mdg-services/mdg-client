import { z } from 'zod';

import { paginationSchema } from './common';

/**
 * Query params for the global audit feed (GET /audit). All filters are optional
 * and AND-combined. `from`/`to` bound the `at` timestamp (inclusive). `action`
 * and `entity` are free strings (not enum-locked) so historical rows written
 * before an action/entity was formalised remain queryable.
 */
export const auditQuerySchema = paginationSchema.extend({
  actorId: z.string().trim().min(1).optional(),
  entity: z.string().trim().min(1).optional(),
  entityId: z.string().trim().min(1).optional(),
  action: z.string().trim().min(1).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

export type AuditQueryInput = z.infer<typeof auditQuerySchema>;
