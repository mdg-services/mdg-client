import { z } from 'zod';

import { cadenceSchema, cronSchema, dealerServiceStatusSchema } from './common';

export const attachServiceSchema = z.object({
  serviceId: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]{1,60}$/, 'Invalid service id'),
  config: z.record(z.string(), z.unknown()).default({}),
  cadence: cadenceSchema.optional(),
  customCron: cronSchema.optional(),
});
export type AttachServiceInput = z.infer<typeof attachServiceSchema>;

export const updateDealerServiceSchema = z
  .object({
    config: z.record(z.string(), z.unknown()).optional(),
    cadence: cadenceSchema.optional(),
    /**
     * `''` means "remove the custom cron and go back to the plain cadence";
     * omitting the key still means "leave it as it is".
     *
     * Only PATCH can express that — there is nothing to clear on an attach — so
     * `cronSchema` itself stays strict for every other caller. Without this an
     * admin who wanted a cron gone had no route but detach + re-attach, and
     * detach hard-deletes the row along with its whole plugin config.
     */
    customCron: z.union([cronSchema, z.literal('')]).optional(),
    status: dealerServiceStatusSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field must be provided',
  });
export type UpdateDealerServiceInput = z.infer<typeof updateDealerServiceSchema>;

/** POST /dealer-services/:id/run-now */
export const runNowSchema = z
  .object({
    /** Optional one-off config override; merged on top of the stored config. */
    configOverride: z.record(z.string(), z.unknown()).optional(),
  })
  .default({});
export type RunNowInput = z.infer<typeof runNowSchema>;
