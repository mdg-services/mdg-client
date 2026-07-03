import { z } from 'zod';

/**
 * Zod schemas for the Staff Points subsystem. Enum values are mirrored by hand
 * from types/staff.ts (same convention as schemas/kavach.ts).
 */

/** Mirrors EmployeeStatus in types/staff.ts. */
export const employeeStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);

/** A YYYY-MM-DD calendar date (IST). */
export const staffDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

/** Body for POST /dealers/:dealerId/employees. */
export const createEmployeeSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  phone: z
    .string()
    .trim()
    .max(20)
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  designation: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
});
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

/** Body for PATCH /dealers/:dealerId/employees/:id. */
export const updateEmployeeSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    phone: z.string().trim().max(20).optional(),
    designation: z.string().trim().max(80).optional(),
    status: employeeStatusSchema.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'Provide at least one field to update',
  });
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

/** One work inside an award action: a catalog code plus optional PER_UNIT quantity. */
export const awardWorkSelectionSchema = z.object({
  workItemCode: z.string().trim().min(1).max(120),
  quantity: z.number().positive().max(100000).optional(),
});

/**
 * Body for POST /dealers/:dealerId/staff-points — award points for one or more
 * works done by the same set of workers.
 *
 * The canonical shape is `{ employeeIds, items[] }`. The legacy single-work
 * fields (`workItemCode` + `quantity`) are still accepted and normalised into
 * `items`, so a cached older client keeps working through a rollout.
 */
export const awardStaffPointsSchema = z
  .object({
    employeeIds: z
      .array(z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid employee id'))
      .min(1, 'Select at least one worker')
      .max(50),
    items: z.array(awardWorkSelectionSchema).min(1).max(30).optional(),
    // Legacy single-work fields (pre-multi-work clients).
    workItemCode: z.string().trim().min(1).max(120).optional(),
    quantity: z.number().positive().max(100000).optional(),
    workDate: staffDateSchema.optional(),
    note: z.string().trim().max(1000).optional(),
  })
  .refine((v) => (v.items?.length ?? 0) > 0 || Boolean(v.workItemCode), {
    message: 'Select at least one work',
    path: ['items'],
  })
  .transform((v) => ({
    employeeIds: v.employeeIds,
    items:
      v.items && v.items.length > 0
        ? v.items
        : [{ workItemCode: v.workItemCode as string, quantity: v.quantity }],
    workDate: v.workDate,
    note: v.note,
  }));
export type AwardStaffPointsInput = z.infer<typeof awardStaffPointsSchema>;

/** Parses a query-string boolean ("true"/"false"), matching schemas/kavach.ts. */
const queryBoolean = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();

/** Query for GET /dealers/:dealerId/staff-points. */
export const staffPointsQuerySchema = z.object({
  employeeId: z
    .string()
    .regex(/^[a-f0-9]{24}$/i, 'Invalid employee id')
    .optional(),
  from: staffDateSchema.optional(),
  to: staffDateSchema.optional(),
});
export type StaffPointsQuery = z.infer<typeof staffPointsQuerySchema>;

/** Query for GET /dealers/:dealerId/staff-points/summary and the employee list window. */
export const staffPointsSummaryQuerySchema = z.object({
  from: staffDateSchema.optional(),
  to: staffDateSchema.optional(),
  /** Include INACTIVE employees in the leaderboard. Defaults to false. */
  includeInactive: queryBoolean,
});
export type StaffPointsSummaryQuery = z.infer<typeof staffPointsSummaryQuerySchema>;

/** Body for PATCH /me — a member setting their own UI language preference. */
export const updateMyPreferencesSchema = z
  .object({
    lang: z.enum(['en', 'hi']).optional(),
  })
  .refine((v) => v.lang !== undefined, { message: 'Provide lang' });
export type UpdateMyPreferencesInput = z.infer<typeof updateMyPreferencesSchema>;
