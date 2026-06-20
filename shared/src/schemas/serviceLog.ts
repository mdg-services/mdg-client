import { z } from 'zod';

import { attachmentSchema } from './chat';

/**
 * The core "what service did we provide" payload. `serviceId` is a catalog id
 * from the service registry, or `'other'` for an ad-hoc service described by
 * `serviceName`. `notes` is always required so the history is meaningful.
 */
export const serviceLogCoreSchema = z
  .object({
    serviceId: z.string().trim().min(1).max(80),
    serviceName: z.string().trim().min(1).max(160).optional(),
    notes: z.string().trim().min(1).max(2000),
    attachments: z.array(attachmentSchema).max(10).optional(),
  })
  .refine((v) => v.serviceId !== 'other' || (v.serviceName && v.serviceName.length > 0), {
    message: 'serviceName is required when serviceId is "other"',
    path: ['serviceName'],
  });

/** Body for resolving a conversation — requires the service that was provided. */
export const resolveConversationSchema = serviceLogCoreSchema;
export type ResolveConversationInput = z.infer<typeof resolveConversationSchema>;

/** Body for creating a standalone service-log entry (admin). */
export const createServiceLogSchema = z
  .object({
    dealerId: z.string().min(1),
    conversationId: z.string().optional(),
    memberUserId: z.string().optional(),
    serviceId: z.string().trim().min(1).max(80),
    serviceName: z.string().trim().min(1).max(160).optional(),
    notes: z.string().trim().min(1).max(2000),
    attachments: z.array(attachmentSchema).max(10).optional(),
  })
  .refine((v) => v.serviceId !== 'other' || (v.serviceName && v.serviceName.length > 0), {
    message: 'serviceName is required when serviceId is "other"',
    path: ['serviceName'],
  });
export type CreateServiceLogInput = z.infer<typeof createServiceLogSchema>;
