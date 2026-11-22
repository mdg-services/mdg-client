import { z } from 'zod';

/**
 * The dealer's answer from the work-permit box (ADR 0053). An answer to a question that
 * is no longer open is refused with 409, so a double tap never moves two steps.
 */
export const workPermitAnswerSchema = z.discriminatedUnion('step', [
  z.object({
    step: z.literal('option'),
    permitId: z.string().min(1),
    questionId: z.string().min(1),
    optionId: z.string().min(1),
  }),
  z.object({
    step: z.literal('text'),
    permitId: z.string().min(1),
    questionId: z.string().min(1),
    text: z.string().trim().min(1).max(1000),
  }),
  z.object({
    step: z.literal('photo'),
    permitId: z.string().min(1),
    questionId: z.string().min(1),
    /** A photo uploaded through `/uploads/sign` scope `work-permit`. */
    key: z.string().min(1).max(400),
  }),
  z.object({ step: z.literal('confirm'), permitId: z.string().min(1) }),
  z.object({ step: z.literal('change'), permitId: z.string().min(1) }),
  z.object({ step: z.literal('cancel'), permitId: z.string().min(1) }),
  /** The work is done (close it) or needs more time (extend it). */
  z.object({ step: z.literal('done'), permitId: z.string().min(1), done: z.boolean() }),
]);
export type WorkPermitAnswerInput = z.infer<typeof workPermitAnswerSchema>;

/** An admin recording what a person saw on the portal. */
export const workPermitSettleSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('issued'), number: z.string().trim().min(1).max(40), note: z.string().max(500).optional() }),
  z.object({ outcome: z.literal('not_issued'), note: z.string().max(500).optional() }),
  z.object({ outcome: z.literal('closed'), note: z.string().max(500).optional() }),
  z.object({ outcome: z.literal('close_now'), note: z.string().max(500).optional() }),
  z.object({ outcome: z.literal('clear_attention'), note: z.string().max(500).optional() }),
]);
export type WorkPermitSettleInput = z.infer<typeof workPermitSettleSchema>;

export const workPermitsListQuerySchema = z.object({
  view: z.enum(['active', 'attention', 'all']).default('active'),
  dealerId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
export type WorkPermitsListQuery = z.infer<typeof workPermitsListQuerySchema>;
