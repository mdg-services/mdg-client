import { z } from 'zod';

import {
  MOCK_DRILL_EVENT_ROWS,
  MOCK_DRILL_LIMITS,
  MOCK_DRILL_PHOTO_COUNT,
  MOCK_DRILL_SCENARIOS,
} from '../types/mockDrill';

/**
 * Request bodies for Mock Drill (ADR 0034). See `types/mockDrill.ts`.
 *
 * One body for every answer the owner's box can give, told apart by `step`. Each
 * answer returns the outlet's whole view again, so the box never has to work out
 * what comes next.
 */

const scenarioIds = MOCK_DRILL_SCENARIOS.map((s) => s.id) as [string, ...string[]];

export const mockDrillAnswerSchema = z.discriminatedUnion('step', [
  /** "Same as last time": starts a submission from the approved setup. */
  z.object({ step: z.literal('start_same') }).strict(),
  /** "A new kind of drill": starts one with nothing carried over. */
  z.object({ step: z.literal('start_new') }).strict(),
  z.object({ step: z.literal('scenario'), scenarioId: z.enum(scenarioIds) }).strict(),
  /** A photo uploaded through `/uploads/sign` scope `mock-drill`. Slot 1 or 2. */
  z
    .object({
      step: z.literal('photo'),
      slot: z.number().int().min(1).max(MOCK_DRILL_PHOTO_COUNT),
      key: z.string().min(1).max(512),
      filename: z.string().trim().min(1).max(255),
    })
    .strict(),
  /**
   * "We did this drill today / yesterday." This is the owner's word that it
   * really happened; the server refuses to file without it.
   */
  z
    .object({
      step: z.literal('when'),
      day: z.enum(['today', 'yesterday']),
      confirmDone: z.literal(true),
    })
    .strict(),
  /** Everything is in: send it (to an admin's check, or straight to filing for a reused setup). */
  z.object({ step: z.literal('submit') }).strict(),
  /** One step back. */
  z.object({ step: z.literal('back') }).strict(),
  /** Drop the open submission. */
  z.object({ step: z.literal('cancel') }).strict(),
]);
export type MockDrillAnswer = z.infer<typeof mockDrillAnswerSchema>;

const observer = z
  .object({
    name: z.string().trim().max(MOCK_DRILL_LIMITS.observerName),
    area: z.string().trim().max(MOCK_DRILL_LIMITS.observerArea),
  })
  .strict();

/** The dependent fields an admin may correct while checking. Everything optional. */
export const mockDrillDependentEditSchema = z
  .object({
    scenarioId: z.enum(scenarioIds).optional(),
    personsPresent: z.number().int().min(1).max(60).optional(),
    headCountShort: z.number().int().min(0).max(10).optional(),
    observers: z.array(observer).max(3).optional(),
    observations: z.string().trim().min(3).max(MOCK_DRILL_LIMITS.observations).optional(),
    recommendations: z.string().trim().min(3).max(MOCK_DRILL_LIMITS.recommendations).optional(),
  })
  .strict();
export type MockDrillDependentEdit = z.infer<typeof mockDrillDependentEditSchema>;

/**
 * The fields the system wrote for the drill (its day and time, the response table,
 * the text), which an admin may also correct while checking. Everything optional;
 * the all-clear time is never sent, it is always the start plus the duration.
 */
const eventEdit = z
  .object({
    expected: z.number().int().min(0).max(3600),
    actual: z.number().int().min(0).max(3600),
    remark: z.string().trim().max(MOCK_DRILL_LIMITS.eventRemark),
  })
  .strict();

export const mockDrillGeneratedEditSchema = z
  .object({
    /** YYYY-MM-DD (IST); not in the future. */
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    /** HH:mm. */
    time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    durationMinutes: z.number().int().min(1).max(240).optional(),
    initiation: z.string().trim().min(3).max(MOCK_DRILL_LIMITS.initiation).optional(),
    description: z.string().trim().min(3).max(MOCK_DRILL_LIMITS.description).optional(),
    /** All nine rows, in the portal's order. */
    events: z.array(eventEdit).length(MOCK_DRILL_EVENT_ROWS.length).optional(),
    headCountAction: z.string().trim().min(1).max(MOCK_DRILL_LIMITS.headCountAction).optional(),
  })
  .strict();
export type MockDrillGeneratedEdit = z.infer<typeof mockDrillGeneratedEditSchema>;

/** An admin's decision on a submission in `review`. */
export const mockDrillReviewSchema = z.discriminatedUnion('decision', [
  /** Approve (with any corrections); it becomes the outlet's reusable setup and is filed. */
  z
    .object({
      decision: z.literal('approve'),
      edits: mockDrillDependentEditSchema.optional(),
      generated: mockDrillGeneratedEditSchema.optional(),
    })
    .strict(),
  /** Send it back to the owner: they are told why and asked again. */
  z
    .object({ decision: z.literal('send_back'), reason: z.string().trim().min(3).max(300) })
    .strict(),
]);
export type MockDrillReview = z.infer<typeof mockDrillReviewSchema>;

/** Admin actions on the pane that are not a review. */
export const mockDrillAdminActionSchema = z.discriminatedUnion('action', [
  /** Read the portal's state now (signs in on its own). */
  z.object({ action: z.literal('check') }).strict(),
  /** File an approved submission now (the same run the owner's Submit starts). */
  z.object({ action: z.literal('submit') }).strict(),
  /** Fill and read back on the portal, never pressing Submit. */
  z.object({ action: z.literal('test_fill') }).strict(),
  /** Retry a failed submission. */
  z.object({ action: z.literal('retry') }).strict(),
  /** Post the box to the owners (and manager) so they can start. */
  z.object({ action: z.literal('ask_owner') }).strict(),
  /** Drop the open submission. */
  z.object({ action: z.literal('cancel') }).strict(),
]);
export type MockDrillAdminAction = z.infer<typeof mockDrillAdminActionSchema>;

/** Switches on the service's attachment. */
export const mockDrillConfigSchema = z
  .object({
    autoSubmit: z.boolean().optional(),
    reviewReused: z.boolean().optional(),
  })
  .strict();
export type MockDrillConfigBody = z.infer<typeof mockDrillConfigSchema>;
