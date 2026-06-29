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
  'SOS_OK',
  'SOS_FLAGGED',
]);

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
  retailOutletName: z.string().trim().min(1).max(160),
  roSapCode: z.string().trim().min(1).max(40),
  /** "YYYY-MM". */
  monthYear: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}$/, 'monthYear must be YYYY-MM'),
});
export type KavachOutletMetaInput = z.infer<typeof kavachOutletMetaSchema>;

/** Body for POST /dealers/:dealerId/kavach/programme — admin initiates once. */
export const initiateKavachProgrammeSchema = z.object({
  outlet: kavachOutletMetaSchema,
  /** Per-template baseline dates from the first visit; omitted => "fresh clock". */
  baselines: z.record(z.string(), z.string().datetime()).optional(),
  excludeCodes: z.array(z.string().min(1)).max(60).optional(),
});
export type InitiateKavachProgrammeInput = z.infer<typeof initiateKavachProgrammeSchema>;

/** Body for POST /kavach/items/:itemId/mark-done. */
export const markKavachItemDoneSchema = z.object({
  proof: attachmentSchema.optional(),
  note: z.string().trim().max(1000).optional(),
});
export type MarkKavachItemDoneInput = z.infer<typeof markKavachItemDoneSchema>;

/** Body for POST /dealers/:dealerId/kavach/items — admin adds a custom item. */
export const addCustomKavachItemSchema = z
  .object({
    labelEn: z.string().trim().min(1).max(200),
    labelHi: z.string().trim().min(1).max(200),
    points: z.number().int().min(1).max(500),
    cadenceDays: z.number().int().min(1).max(3650).optional(),
    trigger: kavachTriggerSchema,
    domain: kavachDomainSchema.optional(),
    category: ticketCategorySchema.optional(),
    requiresProof: z.boolean().optional().default(false),
    notesEn: z.string().trim().max(1000).optional(),
    notesHi: z.string().trim().max(1000).optional(),
  })
  .refine((v) => v.trigger === 'SOS' || typeof v.cadenceDays === 'number', {
    message: 'cadenceDays is required for TIME items',
    path: ['cadenceDays'],
  });
export type AddCustomKavachItemInput = z.infer<typeof addCustomKavachItemSchema>;

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
