import { z } from 'zod';

/**
 * Zod schemas for the Staff Points subsystem. Enum values are mirrored by hand
 * from types/staff.ts (same convention as schemas/kavach.ts).
 */

/** Mirrors EmployeeStatus in types/staff.ts. */
export const employeeStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);

/** Mirrors STAFF_POINT_DISTRIBUTIONS in types/staff.ts. */
export const staffPointDistributionSchema = z.enum(['FLAT', 'SPLIT', 'EACH', 'PER_UNIT']);

/** Mirrors STAFF_WORK_DOMAINS in types/staff.ts. */
export const staffWorkDomainSchema = z.enum([
  'cleaning',
  'du',
  'equipment',
  'automation',
  'tanker',
  'sales',
  'office',
  'customer',
  'misc',
]);

/** Mirrors STAFF_WORK_UNITS in types/staff.ts. */
export const staffWorkUnitSchema = z.enum([
  'vehicle',
  'rupee-1000',
  'guest',
  'customer',
  'transaction',
  'item',
  'tank',
  'photo',
]);

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
  /** PER_UNIT quantity — fractional allowed (e.g. ₹2500 of HSD → 2.5 units). */
  quantity: z.number().positive().max(1_000_000).optional(),
  /**
   * Raw rupee amount for a `rupee-1000` unit work. When present the server
   * computes `quantity = amountRupees / 1000` and ignores any `quantity`.
   */
  amountRupees: z.number().positive().max(100_000_000).optional(),
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
    quantity: z.number().positive().max(1_000_000).optional(),
    amountRupees: z.number().positive().max(100_000_000).optional(),
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
        : [
            {
              workItemCode: v.workItemCode as string,
              quantity: v.quantity,
              amountRupees: v.amountRupees,
            },
          ],
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

/* ─────────────────────── Draft → Finalize (server-synced) ─────────────────────────────────── */

/** One line of a server-synced draft: worker + work (+ optional PER_UNIT quantity/amount). */
export const staffDraftEntrySchema = z.object({
  employeeId: z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid employee id'),
  workItemCode: z.string().trim().min(1).max(120),
  quantity: z.number().positive().max(1_000_000).optional(),
  amountRupees: z.number().positive().max(100_000_000).optional(),
});
export type StaffDraftEntryInput = z.infer<typeof staffDraftEntrySchema>;

/**
 * Body for PUT /dealers/:dealerId/staff-points/draft — a full replace of the
 * single active draft (autosave). The server merges same-(employee, work)
 * entries and recomputes points; it never trusts client points.
 */
export const updateStaffDraftSchema = z.object({
  entries: z.array(staffDraftEntrySchema).max(500).default([]),
  workDate: staffDateSchema.optional(),
  note: z.string().trim().max(1000).optional(),
});
export type UpdateStaffDraftInput = z.infer<typeof updateStaffDraftSchema>;

/**
 * Body for POST /dealers/:dealerId/staff-points/draft/finalize — commit the
 * stored draft to the ledger. `hardCopyImageKey` is the storageKey returned by
 * the `staff`-scope presign (must look like `staff/<dealerId>/...`).
 */
export const finalizeStaffDraftSchema = z.object({
  hardCopyImageKey: z.string().trim().min(1).max(512),
  workDate: staffDateSchema.optional(),
  note: z.string().trim().max(1000).optional(),
});
export type FinalizeStaffDraftInput = z.infer<typeof finalizeStaffDraftSchema>;

/* ───────────────── Per-dealer work list overlay + global catalog admin ─────────────────────── */

/**
 * A dealer custom work item. `code` is optional on input — the server generates
 * a dealer-unique code when absent (or keeps the provided one on edit).
 */
export const dealerCustomWorkItemSchema = z.object({
  code: z.string().trim().min(1).max(120).optional(),
  labelEn: z.string().trim().min(1).max(200),
  labelHi: z.string().trim().min(1).max(200),
  points: z.number().min(0).max(100_000),
  distribution: staffPointDistributionSchema,
  unit: staffWorkUnitSchema.optional(),
  unitLabelEn: z.string().trim().max(80).optional(),
  unitLabelHi: z.string().trim().max(80).optional(),
  domain: staffWorkDomainSchema,
  active: z.boolean().optional().default(true),
});
export type DealerCustomWorkItemInput = z.infer<typeof dealerCustomWorkItemSchema>;

/** Body for PUT /dealers/:dealerId/staff/work-list — full replace of the overlay. */
export const updateDealerWorkListSchema = z.object({
  hiddenCodes: z.array(z.string().trim().min(1).max(120)).max(500).default([]),
  customItems: z.array(dealerCustomWorkItemSchema).max(200).default([]),
});
export type UpdateDealerWorkListInput = z.infer<typeof updateDealerWorkListSchema>;

/** Body for POST /super-admin/staff-work-items — create a global catalog item. */
export const createStaffWorkItemSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9-]+$/i, 'Code must be a slug (letters, digits, hyphens)')
    // The `custom-` prefix is reserved for per-dealer overlay items; a global
    // `custom-*` code would be shadowed by a dealer custom item in the effective
    // work map, so reject it at the source.
    .refine((c) => !/^custom-/i.test(c), 'Code cannot start with the reserved "custom-" prefix'),
  srNo: z.number().int().min(0).max(100_000).optional(),
  titleEn: z.string().trim().min(1).max(300),
  titleHi: z.string().trim().min(1).max(300),
  labelEn: z.string().trim().min(1).max(200),
  labelHi: z.string().trim().min(1).max(200),
  points: z.number().min(0).max(100_000),
  distribution: staffPointDistributionSchema,
  unit: staffWorkUnitSchema.optional(),
  unitLabelEn: z.string().trim().max(80).optional(),
  unitLabelHi: z.string().trim().max(80).optional(),
  domain: staffWorkDomainSchema,
  requiresApproval: z.boolean().optional().default(false),
  notesEn: z.string().trim().max(500).optional(),
  notesHi: z.string().trim().max(500).optional(),
});
export type CreateStaffWorkItemInput = z.infer<typeof createStaffWorkItemSchema>;

/** Body for PATCH /super-admin/staff-work-items/:code — edit a global catalog item. */
export const updateStaffWorkItemSchema = z
  .object({
    srNo: z.number().int().min(0).max(100_000).optional(),
    titleEn: z.string().trim().min(1).max(300).optional(),
    titleHi: z.string().trim().min(1).max(300).optional(),
    labelEn: z.string().trim().min(1).max(200).optional(),
    labelHi: z.string().trim().min(1).max(200).optional(),
    points: z.number().min(0).max(100_000).optional(),
    distribution: staffPointDistributionSchema.optional(),
    unit: staffWorkUnitSchema.optional(),
    unitLabelEn: z.string().trim().max(80).optional(),
    unitLabelHi: z.string().trim().max(80).optional(),
    domain: staffWorkDomainSchema.optional(),
    requiresApproval: z.boolean().optional(),
    notesEn: z.string().trim().max(500).optional(),
    notesHi: z.string().trim().max(500).optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'Provide at least one field to update',
  });
export type UpdateStaffWorkItemInput = z.infer<typeof updateStaffWorkItemSchema>;
