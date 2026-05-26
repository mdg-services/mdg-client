import { z } from 'zod';

export const attachmentSchema = z.object({
  storageKey: z.string().min(1).max(512),
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(127),
  size: z.number().int().nonnegative().max(25 * 1024 * 1024),
  kind: z.enum(['image', 'file']),
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
  size: z.number().int().positive().max(25 * 1024 * 1024),
  scope: z.enum(['chat', 'avatar']).default('chat'),
  conversationId: z.string().optional(),
});
export type PresignUploadInput = z.infer<typeof presignUploadSchema>;

export const assignConversationSchema = z.object({
  adminId: z.string().optional(),
});
export type AssignConversationInput = z.infer<typeof assignConversationSchema>;

export const createDealerUserSchema = z.object({
  dealerId: z.string().min(1),
  email: z.string().email().toLowerCase(),
  name: z.string().min(1).max(120),
  role: z.enum(['dealer-owner', 'dealer-staff']),
  password: z.string().min(8).max(200),
  phone: z.string().max(40).optional(),
});
export type CreateDealerUserInput = z.infer<typeof createDealerUserSchema>;
