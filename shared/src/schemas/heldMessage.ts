/** Validation for the watch period's review queue (types/heldMessage.ts). */

import { z } from 'zod';

/** Dropping a held message needs a reason the next person can read. Sending takes no body. */
export const dropHeldMessageSchema = z
  .object({ reason: z.string().trim().min(3).max(300) })
  .strict();
export type DropHeldMessageInput = z.infer<typeof dropHeldMessageSchema>;
