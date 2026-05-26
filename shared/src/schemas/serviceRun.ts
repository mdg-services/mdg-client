import { z } from 'zod';

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
