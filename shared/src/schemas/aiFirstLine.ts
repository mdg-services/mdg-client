/**
 * Validation for the AI first line on dealer support.
 *
 * Three different kinds of input arrive here and only one of them comes from a
 * person:
 *
 *  - {@link aiPlanSchema} validates what the MODEL returned. It is the boundary
 *    that keeps the "the model cannot write" guarantee true at runtime, so it is
 *    the strictest thing in this file.
 *  - {@link aiTurnReviewSchema} and {@link setDealerFirstLineModeSchema} are
 *    admin actions.
 *  - {@link aiTurnListQuerySchema} is a query string, where everything arrives
 *    as text and the coercions have to be spelled out.
 */

import { z } from 'zod';

import {
  AI_FIRSTLINE_INTENTS,
  AI_FIRSTLINE_LANGS,
  AI_HANDOFF_REASONS,
  AI_PRODUCT_HINTS,
  AI_TURN_OUTCOMES,
  AI_TURN_VERDICTS,
  DEALER_FIRSTLINE_MODES,
  type AiPlan,
} from '../types/aiFirstLine';

import { paginationSchema } from './common';

export const aiFirstLineLangSchema = z.enum(AI_FIRSTLINE_LANGS);
export const aiFirstLineIntentSchema = z.enum(AI_FIRSTLINE_INTENTS);
export const aiHandoffReasonSchema = z.enum(AI_HANDOFF_REASONS);
export const aiTurnOutcomeSchema = z.enum(AI_TURN_OUTCOMES);
export const aiTurnVerdictSchema = z.enum(AI_TURN_VERDICTS);
export const dealerFirstLineModeSchema = z.enum(DEALER_FIRSTLINE_MODES);

/** An IST calendar day. Days are strings in this codebase and stay strings. */
const istDaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
/** An IST calendar month. */
const istMonthSchema = z.string().regex(/^\d{4}-\d{2}$/, 'Use YYYY-MM');

/**
 * A person's name and nothing else: letters (any script — most of these are
 * Devanagari), the marks that go with them, and the few separators a real name
 * uses. No digits, no punctuation a sentence needs, no line breaks, forty
 * characters.
 *
 * This is the guard on the ONE string field the model may emit, and it is
 * deliberately tight. `personName` is a lookup key matched against the dealer's
 * own employee list and never echoed back — what the dealer reads is the name
 * stored on the employee record — but a value shaped like prose is evidence the
 * model is trying to write, and the right response to that is to reject the plan
 * and hand the thread to a person.
 */
const personNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u, 'Not a name');

/**
 * The model's entire output.
 *
 * `.strict()` IS THE POINT OF THIS SCHEMA. An unknown key is not tolerated and
 * not stripped — it fails, and a failed plan is a `bad_router_output` handoff to
 * a person. If a model ever returns `{ intent: 'dsr_status', answer: "Your DSR
 * is ready, sir" }`, the extra field must stop the turn dead rather than ride
 * along ignored until somebody later finds it convenient to use. Zod's default
 * is to strip unknown keys silently, which would make that field invisible
 * instead of fatal.
 *
 * Typed as `z.ZodType<AiPlan>` rather than left to inference so the schema and
 * the interface cannot drift: add a required field to `AiPlan` and this line
 * stops compiling.
 */
export const aiPlanSchema: z.ZodType<AiPlan> = z
  .object({
    intent: aiFirstLineIntentSchema,
    lang: aiFirstLineLangSchema,
    date: istDaySchema.optional(),
    month: istMonthSchema.optional(),
    personName: personNameSchema.optional(),
    productHint: z.enum(AI_PRODUCT_HINTS).optional(),
  })
  .strict();

/**
 * An admin's verdict on one turn.
 *
 * Only the verdict crosses the wire. Who reviewed it and when are the server's
 * to record — a review is evidence about the machine, and evidence somebody can
 * post a timestamp for is not evidence.
 */
export const aiTurnReviewSchema = z
  .object({
    verdict: aiTurnVerdictSchema,
  })
  .strict();
export type AiTurnReviewInput = z.infer<typeof aiTurnReviewSchema>;

/** Switching one dealer between off, shadow and live. */
export const setDealerFirstLineModeSchema = z
  .object({
    mode: dealerFirstLineModeSchema,
  })
  .strict();
export type SetDealerFirstLineModeInput = z.infer<typeof setDealerFirstLineModeSchema>;

/**
 * A boolean that arrived as a query-string word.
 *
 * NOT `z.coerce.boolean()`, for the reason written out at length in
 * `schemas/assist.ts`: that is `Boolean(value)`, so every non-empty string is
 * true and `?reviewed=false` parses to `true` — a "show me the unreviewed ones"
 * request silently becomes its opposite. Only the two literal words are
 * accepted.
 */
const queryBoolean = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();

/**
 * The admin turn log's filters.
 *
 * `from` and `to` are IST CALENDAR DAYS, not instants, because the field they
 * bound is `AiTurn.istDate` — the day the money was spent. Asking for an ISO
 * timestamp here would invite a UTC boundary to move a turn into the wrong day,
 * which is precisely the bug the `istDate` field exists to prevent.
 */
export const aiTurnListQuerySchema = paginationSchema.extend({
  dealerId: z.string().trim().min(1).optional(),
  conversationId: z.string().trim().min(1).optional(),
  outcome: aiTurnOutcomeSchema.optional(),
  reason: aiHandoffReasonSchema.optional(),
  intent: aiFirstLineIntentSchema.optional(),
  verdict: aiTurnVerdictSchema.optional(),
  /** `false` is the review queue: everything a person has not yet judged. */
  reviewed: queryBoolean,
  from: istDaySchema.optional(),
  to: istDaySchema.optional(),
});
export type AiTurnListQuery = z.infer<typeof aiTurnListQuerySchema>;
