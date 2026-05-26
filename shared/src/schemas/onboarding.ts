import { z } from 'zod';

import type { OnboardingStepId } from '../types/enums';

import { dealerCodeSchema, gstSchema, phoneSchema } from './dealer';

const noteSchema = z.string().trim().max(500).optional();

export const collectPhoneStepSchema = z.object({
  phone: phoneSchema,
  name: z.string().trim().min(2).max(200).optional(),
  note: noteSchema,
});

export const sendWelcomeStepSchema = z.object({
  note: noteSchema,
});

export const sendTermsLinkStepSchema = z.object({
  note: noteSchema,
});

export const sendPdfStepSchema = z.object({
  note: noteSchema,
});

export const receivePaymentAndGstStepSchema = z.object({
  gst: gstSchema,
  paymentNote: z.string().trim().min(1).max(500),
  note: noteSchema,
});

export const assignCodeStepSchema = z.object({
  code: dealerCodeSchema,
  note: noteSchema,
});

export const createAdminGroupStepSchema = z.object({
  groupName: z.string().trim().min(1).max(120),
  inviteLink: z
    .string()
    .url('Group invite link must be a valid URL'),
  username: z.string().trim().min(3).max(120),
  password: z.string().min(8).max(200),
  note: noteSchema,
});

export const createDealerGroupStepSchema = z.object({
  groupName: z.string().trim().min(1).max(120),
  inviteLink: z
    .string()
    .url('Group invite link must be a valid URL'),
  note: noteSchema,
});

export const stepReopenSchema = z.object({
  force: z.boolean().optional(),
  note: noteSchema,
});
export type StepReopenInput = z.infer<typeof stepReopenSchema>;

export const STEP_PAYLOAD_SCHEMAS = {
  'collect-phone': collectPhoneStepSchema,
  'send-welcome': sendWelcomeStepSchema,
  'send-terms-link': sendTermsLinkStepSchema,
  'send-pdf': sendPdfStepSchema,
  'receive-payment-and-gst': receivePaymentAndGstStepSchema,
  'assign-code': assignCodeStepSchema,
  'create-admin-group': createAdminGroupStepSchema,
  'create-dealer-group': createDealerGroupStepSchema,
} as const satisfies Record<OnboardingStepId, z.ZodTypeAny>;

export type StepPayload<S extends OnboardingStepId> = z.infer<(typeof STEP_PAYLOAD_SCHEMAS)[S]>;
