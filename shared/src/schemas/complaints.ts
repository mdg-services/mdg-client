import { z } from 'zod';

/**
 * The dealer's answer from the complaint box (ADR 0052). Each answer names the
 * complaint and, where it answers a question, the question it answers: an answer
 * to a question that is no longer open is refused with 409 (a double tap never
 * moves two steps).
 */
export const complaintAnswerSchema = z.discriminatedUnion('step', [
  z.object({
    step: z.literal('option'),
    complaintId: z.string().min(1),
    questionId: z.string().min(1),
    optionId: z.string().min(1),
  }),
  z.object({
    step: z.literal('options'),
    complaintId: z.string().min(1),
    questionId: z.string().min(1),
    optionIds: z.array(z.string().min(1)).min(1).max(20),
  }),
  z.object({
    step: z.literal('text'),
    complaintId: z.string().min(1),
    questionId: z.string().min(1),
    text: z.string().trim().min(1).max(1000),
  }),
  z.object({ step: z.literal('confirm'), complaintId: z.string().min(1) }),
  z.object({ step: z.literal('change'), complaintId: z.string().min(1) }),
  z.object({ step: z.literal('cancel'), complaintId: z.string().min(1) }),
  z.object({ step: z.literal('ack'), complaintId: z.string().min(1), fixed: z.boolean() }),
  z.object({ step: z.literal('check_now'), complaintId: z.string().min(1) }),
]);
export type ComplaintAnswerInput = z.infer<typeof complaintAnswerSchema>;

/** An admin recording what a person saw on the portal, or asking the dealer. */
export const complaintSettleSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('filed'), number: z.string().trim().min(1).max(40), note: z.string().max(500).optional() }),
  z.object({ outcome: z.literal('not_filed'), note: z.string().max(500).optional() }),
  z.object({ outcome: z.literal('acknowledged'), note: z.string().max(500).optional() }),
  z.object({ outcome: z.literal('not_acknowledged'), note: z.string().max(500).optional() }),
  z.object({ outcome: z.literal('ask_dealer'), note: z.string().max(500).optional() }),
  z.object({ outcome: z.literal('clear_attention'), note: z.string().max(500).optional() }),
]);
export type ComplaintSettleInput = z.infer<typeof complaintSettleSchema>;

export const complaintsListQuerySchema = z.object({
  view: z.enum(['open', 'needs_ack', 'attention', 'portal', 'all']).default('open'),
  route: z.enum(['eicts', 'eracts', 'du_stp', 'efms']).optional(),
  dealerId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
export type ComplaintsListQuery = z.infer<typeof complaintsListQuerySchema>;
