import { z } from 'zod';

import { attachmentSchema } from './chat';

/** Request bodies for Kavach v2 (ADR 0057). Mirrors types/kavach.ts. */

export const kavachHowSchema = z.enum(['photo', 'sheet', 'data']);
export const kavachUploaderSchema = z.enum(['manager', 'owner', 'either']);
export const kavachSourceSchema = z.enum([
  'dsr-variation-ok',
  'density-register',
  'licence-dto',
  'licence-wm',
  'licence-peso',
  'mock-drill-filed',
  'safety-declaration',
]);
export const kavachSheetSchema = z.enum(['dsr-book', 'toilet-inspection', 'toilet-display', 'emergency-numbers']);
export const kavachPanelSchema = z.enum(['dsr', 'stock', 'density', 'credit-dod', 'papers', 'staff']);
export const kavachGroupSchema = z.enum(['daily', 'cleanliness', 'safety', 'licences', 'displays', 'sdms', 'equipment']);
export const kavachCheckStateSchema = z.enum(['todo', 'sent', 'sent_back', 'done', 'missed', 'excused']);
export const kavachSendBackReasonSchema = z.enum(['not_clear', 'wrong_page', 'numbers_differ', 'not_updated', 'other']);

const dueTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM')
  .nullable();
const words = (max: number) => z.string().trim().min(1).max(max);
const everyDays = z.number().int().min(1).max(3650).nullable();
const points = z.number().int().min(0).max(5000);

/** The editable body of a point (global or an outlet's own). */
export const kavachTaskBodySchema = z
  .object({
    titleEn: words(120),
    titleHi: words(120),
    howToEn: z.string().trim().max(600).default(''),
    howToHi: z.string().trim().max(600).default(''),
    points,
    everyDays,
    dueTime: dueTime.default(null),
    how: kavachHowSchema,
    uploader: kavachUploaderSchema.default('manager'),
    source: kavachSourceSchema.nullable().default(null),
    sheet: kavachSheetSchema.nullable().default(null),
    panels: z.array(kavachPanelSchema).max(6).default([]),
    group: kavachGroupSchema,
    iocOnly: z.boolean().default(false),
    acceptsFile: z.boolean().default(false),
    sort: z.number().int().min(0).max(10000).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.how === 'data' && !v.source) ctx.addIssue({ code: 'custom', path: ['source'], message: 'Pick where the data comes from' });
    if (v.how === 'sheet' && !v.sheet) ctx.addIssue({ code: 'custom', path: ['sheet'], message: 'Pick which sheet MDG makes' });
    if (v.dueTime && v.everyDays !== 1) ctx.addIssue({ code: 'custom', path: ['dueTime'], message: 'A due time is only for daily points' });
  });
export type KavachTaskBody = z.infer<typeof kavachTaskBodySchema>;

export const createKavachTaskSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]{2,60}$/, 'Lower-case letters, digits and dashes')
    .refine((c) => !c.startsWith('own-'), 'own- is kept for outlet points'),
  task: kavachTaskBodySchema,
});

/** PATCH a global point: any field of the body, plus `active`. */
export const updateKavachTaskSchema = z.object({
  titleEn: words(120).optional(),
  titleHi: words(120).optional(),
  howToEn: z.string().trim().max(600).optional(),
  howToHi: z.string().trim().max(600).optional(),
  points: points.optional(),
  everyDays: everyDays.optional(),
  dueTime: dueTime.optional(),
  how: kavachHowSchema.optional(),
  uploader: kavachUploaderSchema.optional(),
  source: kavachSourceSchema.nullable().optional(),
  sheet: kavachSheetSchema.nullable().optional(),
  panels: z.array(kavachPanelSchema).max(6).optional(),
  group: kavachGroupSchema.optional(),
  iocOnly: z.boolean().optional(),
  acceptsFile: z.boolean().optional(),
  sort: z.number().int().min(0).max(10000).optional(),
  active: z.boolean().optional(),
});

export const kavachTaskOverrideSchema = z.object({
  code: z.string().min(1).max(80),
  points: points.optional(),
  everyDays: everyDays.optional(),
  dueTime: dueTime.optional(),
  how: kavachHowSchema.optional(),
  uploader: kavachUploaderSchema.optional(),
  source: kavachSourceSchema.nullable().optional(),
  sheet: kavachSheetSchema.nullable().optional(),
  panels: z.array(kavachPanelSchema).max(6).optional(),
  howToEn: z.string().trim().max(600).optional(),
  howToHi: z.string().trim().max(600).optional(),
  acceptsFile: z.boolean().optional(),
});

/** An outlet's own point: the body plus a code (server makes one when missing). */
export const kavachOwnTaskSchema = z.object({
  code: z
    .string()
    .regex(/^own-[a-z0-9-]{1,70}$/, 'An own point code is own- then small letters, digits and dashes')
    .optional(),
}).and(kavachTaskBodySchema);

export const updateKavachOutletListSchema = z.object({
  hiddenCodes: z.array(z.string().min(1).max(80)).max(200),
  customTasks: z.array(kavachOwnTaskSchema).max(60),
  overrides: z.array(kavachTaskOverrideSchema).max(200),
});

export const setKavachOutletOnSchema = z.object({ on: z.boolean() });
export const switchKavachOutletsSchema = z.object({
  dealerIds: z.array(z.string().min(1)).min(1).max(500),
  on: z.boolean(),
});

export const kavachReviewGroupsQuerySchema = z.object({ by: z.enum(['task', 'outlet']).default('task') });
export const kavachReviewChecksQuerySchema = z.object({
  code: z.string().max(80).optional(),
  dealerId: z.string().max(40).optional(),
  state: kavachCheckStateSchema.optional(),
  day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

/** `submittedAt` = the submission the admin is looking at; a newer upload → 409. */
export const approveKavachCheckSchema = z.object({ submittedAt: z.string().datetime().nullable() });
export const sendBackKavachCheckSchema = z
  .object({
    reason: kavachSendBackReasonSchema,
    note: z.string().trim().max(300).nullable().default(null),
    submittedAt: z.string().datetime().nullable(),
  })
  .refine((v) => v.reason !== 'other' || (v.note && v.note.length >= 4), {
    path: ['note'],
    message: 'Say what is wrong',
  });
export const tellOwnerKavachCheckSchema = z.object({
  note: z.string().trim().min(4).max(600),
  withPhoto: z.boolean().default(true),
  /** The submission the admin was looking at; when given, a newer upload → 409. */
  submittedAt: z.string().datetime().nullable().optional(),
});
export const kavachNoteSchema = z.object({ note: z.string().trim().min(4).max(300) });
export const excuseKavachCheckSchema = z.object({
  reason: z.string().trim().min(4).max(300),
  /** The submission the admin was looking at; when given, a newer upload → 409. */
  submittedAt: z.string().datetime().nullable().optional(),
});

/** Dealer: send files for a check, or for a when-it-happens point. */
export const submitKavachCheckSchema = z.object({
  files: z.array(attachmentSchema).min(1).max(5),
  note: z.string().trim().max(300).nullable().default(null),
});
