import { z } from 'zod';

/**
 * Request bodies for the admin "action needed" queue (ADR 0043). The list, claim, release,
 * retry and done routes take no body; only a picture-code answer carries one.
 */

/** `POST /admin-actions/:id/answer` — the characters an admin read off a picture code. */
export const answerAdminActionSchema = z
  .object({
    answer: z.string().trim().min(1).max(40),
  })
  .strict();
export type AnswerAdminActionInput = z.infer<typeof answerAdminActionSchema>;
