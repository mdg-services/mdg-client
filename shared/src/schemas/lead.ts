/**
 * Validation for what an admin does on the Leads page (types/lead.ts).
 */

import { z } from 'zod';

import {
  LEAD_RECORDING_MAX_BYTES,
  LEAD_ADMIN_CLOSE_REASONS,
  LEAD_CLOSING_OUTCOMES,
  LEAD_CONTACT_CHANNELS,
  LEAD_CONTACT_OUTCOMES,
  LEAD_VIEWS,
} from '../types/lead';

import { objectIdSchema } from './common';

/** The longest note on a contact, a close or a plain note. */
export const LEAD_NOTE_MAX = 500;

/** How far ahead a follow-up may be set. */
export const LEAD_FOLLOW_UP_MAX_DAYS = 90;

/** Optional text where "" means "not given". */
const optionalNote = z
  .union([z.string().trim().max(LEAD_NOTE_MAX), z.literal('')])
  .optional()
  .transform((v) => (v ? v : undefined));

/** An ISO date-time with an offset or Z, as `Date#toISOString()` makes. */
const isoDateTime = z.string().datetime({ offset: true });

export const leadsQuerySchema = z.object({
  view: z.enum(LEAD_VIEWS).default('todo'),
  /** Name, number or place. Digits match the number; anything else the name and place. */
  q: z
    .string()
    .trim()
    .max(60)
    .optional()
    .transform((v) => (v ? v : undefined)),
  /** 0 = counts only (the nav badge). */
  limit: z.coerce.number().int().min(0).max(500).default(300),
});
export type LeadsQuery = z.infer<typeof leadsQuerySchema>;

/**
 * Logging a contact. `nextAt` overrides the follow-up the clock would pick; it
 * is refused with an outcome that closes the lead.
 */
export const logLeadContactSchema = z
  .object({
    channel: z.enum(LEAD_CONTACT_CHANNELS),
    outcome: z.enum(LEAD_CONTACT_OUTCOMES),
    note: optionalNote,
    nextAt: isoDateTime.optional(),
  })
  .strict()
  .refine((v) => !(v.nextAt && (LEAD_CLOSING_OUTCOMES as readonly string[]).includes(v.outcome)), {
    message: 'A follow-up time cannot go with an outcome that closes the lead',
    path: ['nextAt'],
  });
export type LogLeadContactInput = z.infer<typeof logLeadContactSchema>;

/** Choosing when to get in touch next. The server refuses a time in the past or too far ahead. */
export const setLeadFollowUpSchema = z
  .object({
    at: isoDateTime,
    note: optionalNote,
  })
  .strict();
export type SetLeadFollowUpInput = z.infer<typeof setLeadFollowUpSchema>;

/** Giving a lead to an admin, or to nobody. */
export const assignLeadSchema = z
  .object({
    ownerId: objectIdSchema.nullable(),
  })
  .strict();
export type AssignLeadInput = z.infer<typeof assignLeadSchema>;

export const leadNoteSchema = z
  .object({
    text: z.string().trim().min(1).max(LEAD_NOTE_MAX),
  })
  .strict();
export type LeadNoteInput = z.infer<typeof leadNoteSchema>;

export const closeLeadSchema = z
  .object({
    reason: z.enum(LEAD_ADMIN_CLOSE_REASONS),
    note: optionalNote,
  })
  .strict();
export type CloseLeadInput = z.infer<typeof closeLeadSchema>;

export const reopenLeadSchema = z
  .object({
    note: optionalNote,
  })
  .strict();
export type ReopenLeadInput = z.infer<typeof reopenLeadSchema>;

/** Giving a share-link lead the number an admin knows for them: an Indian mobile. */
export const addLeadPhoneSchema = z
  .object({
    mobile: z
      .string()
      .trim()
      .regex(/^[0-9+\s-]{10,15}$/),
  })
  .strict();
export type AddLeadPhoneInput = z.infer<typeof addLeadPhoneSchema>;

/** The longest name or place typed on a lead made by hand. */
export const LEAD_NAME_MAX = 80;

/** Optional short text where "" means "not given". */
const optionalShort = z
  .union([z.string().trim().max(LEAD_NAME_MAX), z.literal('')])
  .optional()
  .transform((v) => (v ? v : undefined));

/**
 * Making a lead by hand: somebody the team wants to work who never came in
 * through the film. The number is the person; a number that is already a lead
 * opens that lead instead of making a second one.
 */
export const createLeadSchema = z
  .object({
    mobile: z
      .string()
      .trim()
      .regex(/^[0-9+\s-]{10,15}$/),
    name: optionalShort,
    /** Pump name or town. */
    place: optionalShort,
    note: optionalNote,
  })
  .strict();
export type CreateLeadInput = z.infer<typeof createLeadSchema>;

/** The WhatsApp inbox asking whether a chat is a lead. */
export const leadLookupQuerySchema = z.object({
  person: z.string().trim().min(1).max(260),
});
export type LeadLookupQuery = z.infer<typeof leadLookupQuerySchema>;

/** Asking for a link to upload one call recording to. */
export const presignLeadRecordingSchema = z
  .object({
    filename: z.string().trim().min(1).max(200),
    contentType: z.string().trim().min(1).max(100),
    size: z.number().int().min(1).max(LEAD_RECORDING_MAX_BYTES),
  })
  .strict();
export type PresignLeadRecordingInput = z.infer<typeof presignLeadRecordingSchema>;

/** Telling the server the recording is uploaded, so it can check it and analyse it. */
export const addLeadRecordingSchema = z
  .object({
    key: z.string().trim().min(1).max(400),
    filename: z.string().trim().min(1).max(200),
    contentType: z.string().trim().min(1).max(100),
    size: z.number().int().min(1).max(LEAD_RECORDING_MAX_BYTES),
    /** What the browser measured, when it could. Four hours at most. */
    durationSec: z
      .number()
      .min(0)
      .max(4 * 60 * 60)
      .optional(),
  })
  .strict();
export type AddLeadRecordingInput = z.infer<typeof addLeadRecordingSchema>;
