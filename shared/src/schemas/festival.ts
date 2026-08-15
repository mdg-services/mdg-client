import { z } from 'zod';

import { FESTIVAL_KEYS } from '../types/festival';

/**
 * A YYYY-MM-DD calendar date (IST) — what `<input type="date">` emits. The
 * refine rejects impossible dates the shape regex would let through (2026-02-30),
 * which would otherwise roll silently into the next month and start the festival
 * on a day nobody chose.
 */
export const festivalDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
  .refine((s) => {
    const y = Number(s.slice(0, 4));
    const mo = Number(s.slice(5, 7));
    const d = Number(s.slice(8, 10));
    const dt = new Date(Date.UTC(y, mo - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() + 1 === mo && dt.getUTCDate() === d;
  }, 'Not a real calendar date');

export const festivalKeySchema = z.enum(FESTIVAL_KEYS);

/**
 * Body for PUT /super-admin/festival. The whole setting is replaced every time —
 * there is only ever one festival configured, so a partial update has nothing to
 * merge into.
 *
 * `days` is capped at 30: the band is a greeting, and a greeting that runs for a
 * month is branding nobody chose. The floor of 1 makes a single-day festival
 * expressible without the window collapsing to nothing.
 */
export const updateFestivalSchema = z.object({
  festivalKey: festivalKeySchema,
  enabled: z.boolean(),
  startDate: festivalDateSchema,
  days: z.coerce.number().int().min(1).max(30),
});
export type UpdateFestivalInput = z.infer<typeof updateFestivalSchema>;
