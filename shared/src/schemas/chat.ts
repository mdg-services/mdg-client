import { z } from 'zod';

/** Hard cap on a single voice note: 10 minutes. */
export const MAX_VOICE_DURATION_MS = 10 * 60 * 1000;

export const attachmentSchema = z.object({
  storageKey: z.string().min(1).max(512),
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(127),
  size: z
    .number()
    .int()
    .nonnegative()
    .max(25 * 1024 * 1024),
  kind: z.enum(['image', 'file', 'audio']),
  /** Voice-note length in ms; only meaningful when kind === 'audio'. */
  durationMs: z.number().int().nonnegative().max(MAX_VOICE_DURATION_MS).optional(),
});
export type AttachmentInput = z.infer<typeof attachmentSchema>;

export const sendMessageSchema = z
  .object({
    body: z.string().trim().max(4000).optional(),
    attachments: z.array(attachmentSchema).max(10).optional().default([]),
  })
  .refine((d) => (d.body && d.body.length > 0) || (d.attachments && d.attachments.length > 0), {
    message: 'Message must have a body or at least one attachment',
  });
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const presignUploadSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(127),
  size: z
    .number()
    .int()
    .positive()
    .max(25 * 1024 * 1024),
  scope: z.enum(['chat', 'avatar']).default('chat'),
  conversationId: z.string().optional(),
});
export type PresignUploadInput = z.infer<typeof presignUploadSchema>;

export const assignConversationSchema = z.object({
  adminId: z.string().optional(),
});
export type AssignConversationInput = z.infer<typeof assignConversationSchema>;

export const recordTypeSchema = z.enum(['dsr', 'invoice', 'compliance', 'statement', 'other']);

export const createRecordSchema = z.object({
  dealerId: z.string().min(1),
  type: recordTypeSchema,
  title: z.string().trim().min(1).max(120),
  periodLabel: z.string().trim().max(60).optional(),
  note: z.string().trim().max(1000).optional(),
  attachment: attachmentSchema,
  /** When true, also post a record card into the dealer's conversation. */
  announceInChat: z.boolean().optional().default(true),
});
export type CreateRecordInput = z.infer<typeof createRecordSchema>;

export const updateTicketSchema = z.object({
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  category: z
    .enum(['general', 'sales', 'compliance', 'billing', 'technical', 'onboarding'])
    .optional(),
});
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

export const createDealerUserSchema = z.object({
  dealerId: z.string().min(1),
  email: z.string().email().toLowerCase(),
  name: z.string().min(1).max(120),
  role: z.enum(['dealer-owner', 'dealer-staff']),
  /** Display label for the member, e.g. "Owner" or "Manager". */
  title: z.string().trim().min(1).max(60).optional(),
  password: z.string().min(8).max(200),
  phone: z.string().max(40).optional(),
});
export type CreateDealerUserInput = z.infer<typeof createDealerUserSchema>;

export const updateDealerUserSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    title: z.string().trim().min(1).max(60).optional(),
    phone: z.string().max(40).optional(),
    status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
    password: z.string().min(8).max(200).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field must be provided',
  });
export type UpdateDealerUserInput = z.infer<typeof updateDealerUserSchema>;
