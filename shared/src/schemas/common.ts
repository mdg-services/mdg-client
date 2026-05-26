import { z } from 'zod';

import {
  CADENCES,
  DEALER_SERVICE_STATUSES,
  DEALER_STATUSES,
  SERVICE_RUN_STATUSES,
  SLA_TIERS,
} from '../types/enums';

/** Mongo ObjectId hex string. */
export const objectIdSchema = z
  .string()
  .regex(/^[a-f0-9]{24}$/i, 'Invalid id');

export const isoDateSchema = z.string().datetime({ offset: true });

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});

export const listQuerySchema = paginationSchema.extend({
  search: z.string().trim().min(1).optional(),
  sort: z.string().trim().min(1).optional(),
});

export const dealerStatusSchema = z.enum(DEALER_STATUSES);
export const slaTierSchema = z.enum(SLA_TIERS);
export const dealerServiceStatusSchema = z.enum(DEALER_SERVICE_STATUSES);
export const serviceRunStatusSchema = z.enum(SERVICE_RUN_STATUSES);
export const cadenceSchema = z.enum(CADENCES);

/**
 * Lenient cron validator. Accepts 5- or 6-field expressions; full
 * validation happens in the backend with a dedicated parser.
 */
export const cronSchema = z
  .string()
  .trim()
  .regex(/^(\S+\s+){4,5}\S+$/, 'Cron must have 5 or 6 space-separated fields');
