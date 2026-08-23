/**
 * Request validation for the landing-page assistant (ADR 0009).
 *
 * Every one of these bodies arrives from an ANONYMOUS visitor on a public
 * website, which makes this the most exposed input surface in the product. The
 * limits below are therefore tighter than they look like they need to be: a
 * question longer than 600 characters is not a question, and a name longer than
 * 80 is not a name. Anything that would otherwise be "generous" is instead a
 * budget somebody else pays for.
 */

import { z } from 'zod';

import { ASSIST_CHANNELS, ASSIST_LANGS , ASSIST_FOLLOWUP_STATUSES } from '../types/assist';

export const assistLangSchema = z.enum(ASSIST_LANGS);
export const assistChannelSchema = z.enum(ASSIST_CHANNELS);

/**
 * An Indian mobile number, ten digits starting 6-9.
 *
 * Deliberately strict. The number exists so somebody can ring it back; a value
 * that cannot be rung is not worth storing, and accepting one only produces a
 * lead the team wastes time on.
 */
export const assistMobileSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, '').replace(/^(\+?91)/, ''))
  .pipe(z.string().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit mobile number'));

export const createAssistSessionSchema = z.object({
  channel: assistChannelSchema.default('chat'),
  /** What the widget's language toggle was set to. Voice may override it from what was actually heard. */
  lang: assistLangSchema.default('en'),
  /** Where on the site they were. Free text, kept short, used only to see which section drives questions. */
  page: z.string().trim().max(120).optional(),
});
export type CreateAssistSessionInput = z.infer<typeof createAssistSessionSchema>;

export const assistMessageSchema = z.object({
  text: z.string().trim().min(1, 'Type a question').max(600),
  lang: assistLangSchema.optional(),
});
export type AssistMessageInput = z.infer<typeof assistMessageSchema>;

/**
 * The lead form, and the same fields the call collects by voice.
 *
 * Every field is optional because the visitor gives them one at a time, in
 * whatever order the conversation takes, and a partial answer must still be
 * saved — a name captured at minute two should survive the visitor hanging up at
 * minute three.
 */
export const assistLeadSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    place: z.string().trim().min(1).max(80).optional(),
    mobile: assistMobileSchema.optional(),
    mobileConfirmed: z.boolean().optional(),
  })
  .refine((v) => v.name !== undefined || v.place !== undefined || v.mobile !== undefined, {
    message: 'Nothing to save',
  });
export type AssistLeadInput = z.infer<typeof assistLeadSchema>;

/**
 * Asking for a person to call back.
 *
 * The mobile is required here even though it is optional on the lead: an
 * escalation is a promise that somebody will ring, and we will not make that
 * promise without a number to ring.
 */
export const assistEscalateSchema = z.object({
  mobile: assistMobileSchema,
  name: z.string().trim().min(1).max(80).optional(),
  place: z.string().trim().min(1).max(80).optional(),
  reason: z.string().trim().max(300).optional(),
});
export type AssistEscalateInput = z.infer<typeof assistEscalateSchema>;

// ---------------------------------------------------------------------------
// Super-admin surfaces
// ---------------------------------------------------------------------------

/**
 * A boolean that arrived as a query-string word.
 *
 * NOT `z.coerce.boolean()`. That is `Boolean(value)`, so every non-empty string
 * is true — `?flagged=false` parses to `true`, and a "show everything" request
 * silently becomes "show only the flagged ones". Verified against zod 3.23.
 * Only the two literal words are accepted; anything else is a validation error
 * the caller can see, rather than a filter quietly inverting itself.
 */
const queryBoolean = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();

export const assistSessionListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  channel: assistChannelSchema.optional(),
  status: z.enum(['active', 'ended', 'escalated']).optional(),
  followupStatus: z.enum(ASSIST_FOLLOWUP_STATUSES).optional(),
  /** Only sessions the spam pass flagged. */
  flagged: queryBoolean,
  /** Only sessions that captured a mobile — the Leads tab is this filter. */
  hasLead: queryBoolean,
  /** Free-text over name, place, mobile and the opening line. */
  q: z.string().trim().max(80).optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export type AssistSessionListQuery = z.infer<typeof assistSessionListQuerySchema>;

export const updateAssistFollowupSchema = z.object({
  followupStatus: z.enum(ASSIST_FOLLOWUP_STATUSES),
  note: z.string().trim().max(1000).optional(),
});
export type UpdateAssistFollowupInput = z.infer<typeof updateAssistFollowupSchema>;

/**
 * Blocking somebody.
 *
 * The block is placed on a session, not on a raw number, so the super-admin
 * never has to type a phone number to block one and we never have to accept one
 * over the wire. The server reads the fingerprint off that session.
 */
export const createAssistBlockSchema = z.object({
  sessionId: z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id'),
  reason: z.string().trim().min(1, 'Say why').max(300),
  /** Absent means indefinite. */
  expiresInDays: z.coerce.number().int().min(1).max(365).optional(),
});
export type CreateAssistBlockInput = z.infer<typeof createAssistBlockSchema>;

export const assistUsageQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
});
export type AssistUsageQuery = z.infer<typeof assistUsageQuerySchema>;
