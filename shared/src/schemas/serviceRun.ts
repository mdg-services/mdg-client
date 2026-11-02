import { z } from 'zod';

import { BROWSER_PLACES, SUMMON_PORTALS } from '../types/laptopBridge';

import { objectIdSchema, paginationSchema, serviceRunStatusSchema } from './common';

export const runsListQuerySchema = paginationSchema.extend({
  dealerId: objectIdSchema.optional(),
  serviceId: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]{1,60}$/)
    .optional(),
  status: serviceRunStatusSchema.optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});
export type RunsListQuery = z.infer<typeof runsListQuerySchema>;

/**
 * Where a run an admin starts should open its browser (ADR 0030). Optional on
 * every route that starts a browser run; only a super-admin may send 'laptop',
 * and only while the laptop bridge is up.
 */
export const browserOnSchema = z.enum(BROWSER_PLACES).optional();

/** Summon: open a dealer's portal on the super-admin's laptop, signed in. */
export const summonBodySchema = z.object({ portal: z.enum(SUMMON_PORTALS) });
export type SummonBody = z.infer<typeof summonBodySchema>;
