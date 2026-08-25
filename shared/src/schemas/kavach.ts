import { z } from 'zod';

import { attachmentSchema } from './chat';

/** Mirrors KavachTrigger in types/kavach.ts. */
export const kavachTriggerSchema = z.enum(['TIME', 'SOS']);

export const kavachCadenceBucketSchema = z.enum([
  'DAILY',
  'WEEKLY',
  'FORTNIGHTLY',
  'MONTHLY',
  'QUARTERLY',
  'HALF_YEARLY',
  'YEARLY',
  'BIENNIAL',
  'SOS',
]);

export const kavachItemStatusSchema = z.enum([
  'VALID',
  'EXPIRING_SOON',
  'EXPIRED',
  'PAUSED',
  'NOT_YET_VERIFIED',
  'HELD',
  'SOS_OK',
  'SOS_FLAGGED',
]);

/** Mirrors KavachVerificationMode. Who may certify a task. */
export const kavachVerificationModeSchema = z.enum([
  'ADMIN',
  'AUTOMATION',
  'DEALER_EVIDENCE_THEN_ADMIN',
]);

/** Mirrors KavachEvidenceMode. What the certifying admin must attach. */
export const kavachEvidenceModeSchema = z.enum(['NONE', 'PHOTO', 'NOTE', 'PHOTO_OR_NOTE']);

/** An IST calendar date, YYYY-MM-DD. Not a timestamp — these are business days. */
const istDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an IST date as YYYY-MM-DD');

export const kavachDomainSchema = z.enum([
  'daily-ops',
  'cleanliness',
  'safety',
  'statutory-license',
  'sdms-filing',
  'documentation-display',
  'equipment',
]);

/** Reuses the CRM ticket-category enum verbatim (escalation maps onto it). */
const ticketCategorySchema = z.enum([
  'general',
  'sales',
  'compliance',
  'billing',
  'technical',
  'onboarding',
]);

/** Parses a query-string boolean ("true"/"false") without z.coerce's truthiness trap. */
const queryBoolean = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();

/** Outlet metadata captured at initiation (sheet header). */
export const kavachOutletMetaSchema = z.object({
  /** "YYYY-MM". */
  monthYear: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}$/, 'monthYear must be YYYY-MM'),
});
export type KavachOutletMetaInput = z.infer<typeof kavachOutletMetaSchema>;

/** Hour-of-day (0–23, IST) at which the dealer's daily digest fires. */
export const kavachReminderHourSchema = z.number().int().min(0).max(23);

/** Body for POST /dealers/:dealerId/kavach/programme — admin initiates once. */
export const initiateKavachProgrammeSchema = z.object({
  outlet: kavachOutletMetaSchema,
  /** Per-template baseline dates from the first visit; omitted => "fresh clock". */
  baselines: z.record(z.string(), z.string().datetime()).optional(),
  excludeCodes: z.array(z.string().min(1)).max(60).optional(),
  /** Optional per-dealer digest hour; omitted => global env default. */
  reminderHour: kavachReminderHourSchema.optional(),
});
export type InitiateKavachProgrammeInput = z.infer<typeof initiateKavachProgrammeSchema>;

/** Body for PATCH /dealers/:dealerId/kavach/programme — admin updates programme settings. */
export const updateKavachProgrammeSchema = z
  .object({
    status: z.enum(['ACTIVE', 'PAUSED']).optional(),
    reminderHour: kavachReminderHourSchema.optional(),
    /**
     * The switch that lets anything reach the dealer. Off until an admin has
     * actually been marking this dealer's tasks; turning it on is a deliberate
     * act, which is why it is a field an admin sets rather than a side effect of
     * initiating the programme.
     */
    dealerFacingEnabled: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.status !== undefined || v.reminderHour !== undefined || v.dealerFacingEnabled !== undefined,
    { message: 'Provide at least one of status, reminderHour or dealerFacingEnabled' },
  );
export type UpdateKavachProgrammeInput = z.infer<typeof updateKavachProgrammeSchema>;

/** Body for POST /kavach/items/:itemId/verify — an admin certifies a task. */
export const verifyKavachItemSchema = z.object({
  /** The IST business date being certified. Defaults to today; bounds checked server-side. */
  doneOn: istDateSchema.optional(),
  proof: attachmentSchema.optional(),
  note: z.string().trim().max(1000).optional(),
  /**
   * Closing without the evidence the definition demands. Long enough to be a
   * real sentence, because it is printed in the item's history and audited.
   */
  overrideEvidenceReason: z.string().trim().min(4).max(500).optional(),
});
export type VerifyKavachItemInput = z.infer<typeof verifyKavachItemSchema>;

/** Body for POST /kavach/items/:itemId/request-evidence — admin asks the dealer. */
export const requestKavachEvidenceSchema = z.object({
  message: z.string().trim().max(500).optional(),
});
export type RequestKavachEvidenceInput = z.infer<typeof requestKavachEvidenceSchema>;

/**
 * Body for POST /kavach/items/:itemId/evidence — the dealer sends something.
 * Empty is legal: that is the unprompted "I've done this" claim, which queues
 * the task for review and moves neither the score nor the clock.
 */
export const submitKavachEvidenceSchema = z.object({
  proof: attachmentSchema.optional(),
  note: z.string().trim().max(1000).optional(),
});
export type SubmitKavachEvidenceInput = z.infer<typeof submitKavachEvidenceSchema>;

/** Body for POST /kavach/items/:itemId/reject-evidence — shown to the dealer verbatim. */
export const rejectKavachEvidenceSchema = z.object({
  reason: z.string().trim().min(4).max(500),
});
export type RejectKavachEvidenceInput = z.infer<typeof rejectKavachEvidenceSchema>;

/**
 * The definition fields an admin may set on a task, shared by the global catalog
 * schemas and the per-dealer custom-task schema so the three can never drift.
 */
const kavachDefinitionShape = {
  labelEn: z.string().trim().min(1).max(200),
  /**
   * REQUIRED, not optional. Every dealer-facing surface is Hindi-first; a task
   * with no Hindi label renders as an English-only line in the middle of a Hindi
   * list, which is exactly where a non-technical reader stops reading.
   */
  labelHi: z.string().trim().min(1).max(200),
  points: z.number().int().min(1).max(500),
  cadenceDays: z.number().int().min(1).max(3650).optional(),
  trigger: kavachTriggerSchema,
  domain: kavachDomainSchema.optional(),
  category: ticketCategorySchema.optional(),
  verification: kavachVerificationModeSchema.optional(),
  evidence: kavachEvidenceModeSchema.optional(),
  notesEn: z.string().trim().max(1000).optional(),
  notesHi: z.string().trim().max(1000).optional(),
};

/** A TIME task must say how long it stays valid; an SOS task has no clock at all. */
const refineCadence = (v: { trigger: 'TIME' | 'SOS'; cadenceDays?: number | null }): boolean =>
  v.trigger === 'SOS' || typeof v.cadenceDays === 'number';
const cadenceIssue = {
  message: 'cadenceDays is required for TIME items',
  path: ['cadenceDays'],
};

/** Body for POST /dealers/:dealerId/kavach/items — admin adds a per-dealer custom task. */
export const addCustomKavachItemSchema = z
  .object(kavachDefinitionShape)
  .refine(refineCadence, cadenceIssue);
export type AddCustomKavachItemInput = z.infer<typeof addCustomKavachItemSchema>;

/* ────────────────── Global catalog CRUD (super-admin) — requirement 4 ─────────────────────── */

/**
 * Body for POST /super-admin/kavach-items — create a global task.
 *
 * The `custom-` prefix is reserved for per-dealer overlay tasks. A global code
 * carrying it would be shadowed by any dealer custom of the same code in the
 * effective map, and the symptom would be a silently wrong score rather than an
 * error — so it is rejected at the source, exactly as the staff catalog does.
 */
export const createKavachTemplateItemSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[a-z0-9-]+$/i, 'Code must be a slug (letters, digits, hyphens)')
      .refine((c) => !/^custom-/i.test(c), 'Code cannot start with the reserved "custom-" prefix'),
    srNo: z.number().int().min(0).max(100_000).optional(),
    titleEn: z.string().trim().min(1).max(300),
    titleHi: z.string().trim().min(1).max(300),
    signalId: z.string().trim().max(120).optional(),
    ...kavachDefinitionShape,
  })
  .refine(refineCadence, cadenceIssue);
export type CreateKavachTemplateItemInput = z.infer<typeof createKavachTemplateItemSchema>;

/**
 * Body for PATCH /super-admin/kavach-items/:code — edit a global task.
 *
 * Every field optional, and `code` is absent on purpose: renaming a code would
 * orphan every dealer's state for that task. Retire it (`active: false`) and add
 * a new one instead.
 */
export const updateKavachTemplateItemSchema = z
  .object({
    srNo: z.number().int().min(0).max(100_000).optional(),
    titleEn: z.string().trim().min(1).max(300).optional(),
    titleHi: z.string().trim().min(1).max(300).optional(),
    labelEn: z.string().trim().min(1).max(200).optional(),
    labelHi: z.string().trim().min(1).max(200).optional(),
    points: z.number().int().min(1).max(500).optional(),
    cadenceDays: z.number().int().min(1).max(3650).nullable().optional(),
    trigger: kavachTriggerSchema.optional(),
    domain: kavachDomainSchema.optional(),
    category: ticketCategorySchema.optional(),
    verification: kavachVerificationModeSchema.optional(),
    evidence: kavachEvidenceModeSchema.optional(),
    signalId: z.string().trim().max(120).nullable().optional(),
    notesEn: z.string().trim().max(1000).optional(),
    notesHi: z.string().trim().max(1000).optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export type UpdateKavachTemplateItemInput = z.infer<typeof updateKavachTemplateItemSchema>;

/* ─────────────────── Per-dealer overlay (mirrors the staff work list) ─────────────────────── */

/** One dealer-only task inside the overlay. `code` is server-generated when absent. */
export const dealerCustomKavachItemSchema = z
  .object({
    code: z.string().trim().min(1).max(120).optional(),
    active: z.boolean().optional().default(true),
    ...kavachDefinitionShape,
  })
  .refine(refineCadence, cadenceIssue);
export type DealerCustomKavachItemInput = z.infer<typeof dealerCustomKavachItemSchema>;

/** A per-dealer amendment to a global task. Only the named fields differ. */
export const dealerKavachOverrideSchema = z
  .object({
    code: z.string().trim().min(1).max(120),
    points: z.number().int().min(1).max(500).optional(),
    cadenceDays: z.number().int().min(1).max(3650).nullable().optional(),
    verification: kavachVerificationModeSchema.optional(),
    evidence: kavachEvidenceModeSchema.optional(),
    notesEn: z.string().trim().max(1000).optional(),
    notesHi: z.string().trim().max(1000).optional(),
  })
  .refine((v) => Object.keys(v).length > 1, {
    message: 'An override must change at least one field',
  });
export type DealerKavachOverrideInput = z.infer<typeof dealerKavachOverrideSchema>;

/** Body for PUT /dealers/:dealerId/kavach/work-list — full replace of the overlay. */
export const updateDealerKavachListSchema = z.object({
  hiddenCodes: z.array(z.string().trim().min(1).max(120)).max(500).default([]),
  customItems: z.array(dealerCustomKavachItemSchema).max(200).default([]),
  overrides: z.array(dealerKavachOverrideSchema).max(500).default([]),
});
export type UpdateDealerKavachListInput = z.infer<typeof updateDealerKavachListSchema>;

/** Body for PATCH /kavach/items/:itemId/paused. */
export const setKavachItemPausedSchema = z.object({
  paused: z.boolean(),
  reason: z.string().trim().max(500).optional(),
});
export type SetKavachItemPausedInput = z.infer<typeof setKavachItemPausedSchema>;

/** Body for PATCH /kavach/items/:itemId/sos — admin/field-agent only. */
export const setKavachSosComplianceSchema = z.object({
  compliant: z.boolean(),
  note: z.string().trim().max(500).optional(),
});
export type SetKavachSosComplianceInput = z.infer<typeof setKavachSosComplianceSchema>;

/** Query for GET /dealers/:dealerId/kavach/items. */
export const kavachItemsQuerySchema = z.object({
  dueOnly: queryBoolean,
  bucket: kavachCadenceBucketSchema.optional(),
  status: kavachItemStatusSchema.optional(),
});
export type KavachItemsQuery = z.infer<typeof kavachItemsQuerySchema>;

/**
 * Query for GET /kavach/work-queue — the cross-dealer admin queue.
 *
 * Keyset paginated on (expiresAt, _id), never offset: the queue is sorted by how
 * overdue a task is, and rows are being closed while an admin pages through it,
 * so an offset would silently skip work as the list shifts under them.
 */
export const kavachWorkQueueQuerySchema = z.object({
  dealerId: z.string().trim().length(24).optional(),
  /** One task across every dealer — the "one task, one pass" throughput mode. */
  code: z.string().trim().min(1).max(120).optional(),
  status: kavachItemStatusSchema.optional(),
  verification: kavachVerificationModeSchema.optional(),
  /** Only rows where the dealer has sent something and nobody has ruled on it. */
  awaitingReview: queryBoolean,
  cursor: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
export type KavachWorkQueueQuery = z.infer<typeof kavachWorkQueueQuerySchema>;
