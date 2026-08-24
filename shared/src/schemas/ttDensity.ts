import { z } from 'zod';

/**
 * Wire shapes for the TT Density routes.
 *
 * The date rules are the interesting part. A bare `YYYY-MM-DD` regex accepts
 * `2026-06-31`, which `Date.UTC` silently rolls over to 1 July — so every
 * business date is round-tripped through IST midday and compared with itself,
 * the same guard `dsrReport` and `irasData` already use. And every date is an
 * IST calendar day, never an instant: the production box runs UTC, and "today"
 * on a UTC box is yesterday for five and a half hours of every Indian evening.
 */

/** Minutes east of UTC. Fixed: India has never observed DST since 1945. */
const IST_OFFSET_MS = 330 * 60 * 1000;

/** The IST calendar date of an instant, `YYYY-MM-DD`. Duplicated from the backend's
 *  `utils/ist.ts` because `shared` may not import from a sub-app. */
function istDateKeyUtc(instant: Date): string {
  return new Date(instant.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function isRealCalendarDate(v: string): boolean {
  const [y, m, d] = v.split('-').map(Number);
  if (!y || !m || !d) return false;
  const probe = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

export const ttBusinessDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
  .refine(isRealCalendarDate, 'Not a real calendar date')
  .refine((v) => v <= istDateKeyUtc(new Date()), 'Cannot mark a day that has not happened yet');

/** A photo that marks one day's density register as done. */
export const ttRegisterPhotoSchema = z.object({
  /** The key returned by `POST /uploads/sign` with `scope: 'tt-density'`. */
  storageKey: z.string().min(1).max(512),
  filename: z.string().min(1).max(255),
  contentType: z
    .string()
    .min(1)
    .max(127)
    .refine((v) => v.startsWith('image/'), 'The register page must be a photo'),
  size: z
    .number()
    .int()
    .positive()
    .max(25 * 1024 * 1024),
  note: z.string().trim().max(500).optional(),
});
export type TtRegisterPhotoInput = z.infer<typeof ttRegisterPhotoSchema>;

export const ttInvoiceListQuerySchema = z.object({
  /** Inclusive IST bounds on `invoiceDate`. */
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(isRealCalendarDate, 'Not a real calendar date')
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(isRealCalendarDate, 'Not a real calendar date')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type TtInvoiceListQuery = z.infer<typeof ttInvoiceListQuerySchema>;

/**
 * How the admin asks for a stretch of register days.
 *
 * Two shapes in one schema, because the pane asks two different questions with
 * the same endpoint. `limit` alone answers "the last N days", which is what the
 * pane's first render wants. `from`+`to` answers "August", which is what the
 * month calendar wants the moment an operator presses the ‹ arrow — and without
 * it there is no way to see September's gaps in October, which is precisely the
 * month-end audit the calendar exists for.
 *
 * `from`/`to` win when both are supplied; the range is inclusive and capped at
 * 120 days so a mis-typed year cannot ask for a decade.
 */
export const ttRegisterDaysQuerySchema = z
  .object({
    from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(isRealCalendarDate, 'Not a real calendar date')
      .optional(),
    to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(isRealCalendarDate, 'Not a real calendar date')
      .optional(),
    limit: z.coerce.number().int().min(1).max(120).default(30),
  })
  .refine((q) => !(q.from && q.to) || q.from <= q.to, 'from must not be after to')
  .refine(
    (q) => !(q.from && q.to) || daysBetweenInclusive(q.from, q.to) <= 120,
    'That range is longer than 120 days',
  );
export type TtRegisterDaysQuery = z.infer<typeof ttRegisterDaysQuerySchema>;

/** Inclusive day count between two `YYYY-MM-DD` dates. Local to this module. */
function daysBetweenInclusive(from: string, to: string): number {
  const a = Date.parse(`${from}T12:00:00Z`);
  const b = Date.parse(`${to}T12:00:00Z`);
  return Math.round((b - a) / 86_400_000) + 1;
}

/**
 * Body of the admin's "collect now". `lookbackDays` is a ONE-RUN override, not a
 * config change: it is merged over the stored config for this run only, which is
 * how a dealer new to the service gets a month fetched once without leaving a
 * month-wide window running every morning for ever.
 */
export const ttDensityCollectSchema = z
  .object({
    lookbackDays: z.number().int().min(1).max(31).optional(),
  })
  .default({});
export type TtDensityCollectInput = z.infer<typeof ttDensityCollectSchema>;
