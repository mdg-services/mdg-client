import { z } from 'zod';

import {
  DECLARATION_FILED_KINDS,
  WASHROOM_EVERY_DAYS_MAX,
  WASHROOM_EVERY_DAYS_MIN,
  WASHROOM_PHOTO_SLOTS,
} from '../types/declarations';

/**
 * Request bodies for Dealer Declarations (ADR 0037). See `types/declarations.ts`.
 *
 * One body for every answer the owner's box can give, told apart by `step`. Each
 * answer returns the outlet's whole view again, so the box never has to work out
 * what comes next.
 */

export const declarationsAnswerSchema = z.discriminatedUnion('step', [
  /** A photo uploaded through `/uploads/sign` scope `declarations`. Replaces what the slot held. */
  z
    .object({
      step: z.literal('photo'),
      slot: z.enum(WASHROOM_PHOTO_SLOTS),
      key: z.string().min(1).max(512),
      filename: z.string().trim().min(1).max(255),
    })
    .strict(),
  /**
   * "Use the same photos as last time": the last filing's two photos go into this week's
   * box (replacing what the slots hold). The owner still presses Send, and still gives
   * their word, so IndianOil is told what the owner said and not more.
   */
  z.object({ step: z.literal('reuse') }).strict(),
  /** Take a photo out of its slot (the owner wants to retake it). */
  z.object({ step: z.literal('remove'), slot: z.enum(WASHROOM_PHOTO_SLOTS) }).strict(),
  /**
   * Both photos are in: send them. `confirmFresh` is the owner's word that the
   * photos were taken today of the outlet's own washroom; the server refuses
   * without it and stores who said it and when.
   */
  z.object({ step: z.literal('send'), confirmFresh: z.literal(true) }).strict(),
]);
export type DeclarationsAnswer = z.infer<typeof declarationsAnswerSchema>;

/** Admin buttons on the pane. */
export const declarationsAdminActionSchema = z.discriminatedUnion('action', [
  /** Read the four pages' state now (signs in on its own); files nothing. */
  z.object({ action: z.literal('check') }).strict(),
  /** The whole daily round, now. */
  z.object({ action: z.literal('sweep') }).strict(),
  /** Post the washroom photo box to the owners (and manager) now. */
  z.object({ action: z.literal('ask_washroom') }).strict(),
  /** File one declaration now. `dryRun` fills and reads back on the portal, never pressing Submit. */
  z
    .object({
      action: z.literal('file'),
      kind: z.enum(DECLARATION_FILED_KINDS),
      dryRun: z.boolean().optional(),
    })
    .strict(),
  /** Retry a washroom filing that failed (the photos are still held). */
  z.object({ action: z.literal('retry_washroom') }).strict(),
  /** Drop this week's washroom photos and start the cycle over. */
  z.object({ action: z.literal('drop_washroom') }).strict(),
  /**
   * An admin has looked at IndianOil's page by hand and says Submit went through
   * (`settle_filed`) or did not (`settle_not_filed`). The only way out of a Submit
   * the robot pressed and never heard back about, when its own reads cannot tell.
   */
  z.object({ action: z.literal('settle_filed'), kind: z.enum(DECLARATION_FILED_KINDS) }).strict(),
  z
    .object({ action: z.literal('settle_not_filed'), kind: z.enum(DECLARATION_FILED_KINDS) })
    .strict(),
  /** Branded Fuels: an admin says they filled it on the portal (`done: false` takes it back). */
  z.object({ action: z.literal('mark_branded_done'), done: z.boolean() }).strict(),
]);
export type DeclarationsAdminAction = z.infer<typeof declarationsAdminActionSchema>;

/** Switches on the service's attachment (the pane edits these without the generic form). */
export const declarationsConfigBodySchema = z
  .object({
    safetyDaily: z.boolean().optional(),
    washroomEveryDays: z
      .number()
      .int()
      .min(WASHROOM_EVERY_DAYS_MIN)
      .max(WASHROOM_EVERY_DAYS_MAX)
      .optional(),
    washroomAuto: z.boolean().optional(),
    standardAuto: z.boolean().optional(),
    feedbackText: z.string().trim().max(500).optional(),
    placeOfDeclaration: z.string().trim().max(80).nullable().optional(),
  })
  .strict();
export type DeclarationsConfigBody = z.infer<typeof declarationsConfigBodySchema>;
