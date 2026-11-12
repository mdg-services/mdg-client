import { z } from 'zod';

import { ANNOUNCEMENT_LIMITS, ANNOUNCEMENT_TONES } from '../types/announcement';
import { SHARE_AUDIENCES } from '../types/share';

/** An outlet code as typed: `15E`. Case does not matter; the server upper-cases it. */
const dealerCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(12)
  .regex(/^[A-Za-z0-9]+$/, 'A dealer code is letters and digits only');

export const announcementTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('all') }),
  z.object({ kind: z.literal('service'), serviceId: z.string().trim().min(1).max(64) }),
  z.object({
    kind: z.literal('dealers'),
    codes: z.array(dealerCodeSchema).min(1, 'Pick at least one outlet').max(300),
  }),
]);

/** Who gets it, without the words: the preview asks only this. */
export const previewAnnouncementSchema = z.object({
  audience: z.enum(SHARE_AUDIENCES),
  target: announcementTargetSchema,
});
export type PreviewAnnouncementInput = z.infer<typeof previewAnnouncementSchema>;

/**
 * Body for POST /admin/announcements. `sendKey` is made once by the page when it
 * opens the form: a double press, or a retry after a dropped connection, carries
 * the same key and the server answers with the announcement it already sent
 * instead of posting it into every chat a second time (a posted message cannot
 * be taken back).
 */
export const createAnnouncementSchema = previewAnnouncementSchema.extend({
  title: z.string().trim().min(3, 'Write a title').max(ANNOUNCEMENT_LIMITS.title),
  body: z.string().trim().min(5, 'Write the message').max(ANNOUNCEMENT_LIMITS.body),
  tone: z.enum(ANNOUNCEMENT_TONES),
  pushText: z.string().trim().max(ANNOUNCEMENT_LIMITS.pushText).optional().default(''),
  sendKey: z
    .string()
    .trim()
    .min(8)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/),
});
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;
