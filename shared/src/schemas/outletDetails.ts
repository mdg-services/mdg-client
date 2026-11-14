import { z } from 'zod';

/**
 * Body for `PUT /me/outlet-details` (owner) and `PUT /dealers/:id/outlet-details`
 * (admin). See `types/outletDetails.ts`.
 *
 * Only the SHAPE is checked here. Whether an id is a real question and whether
 * the value fits that question's kind, options and limits is checked on the
 * server against its own question list — the list lives there so it can grow
 * without a release of the apps.
 *
 * A save may carry some questions only; the ones left out keep their answers.
 * `null` clears an answer (the server refuses that for a required question).
 */
export const outletDetailIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,39}$/, 'Not a question id');

export const outletDetailValueSchema = z.union([
  z.string().trim().max(500),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

export const saveOutletDetailsSchema = z
  .object({
    answers: z
      .record(outletDetailIdSchema, outletDetailValueSchema)
      .refine((a) => Object.keys(a).length >= 1, 'Nothing to save')
      .refine((a) => Object.keys(a).length <= 50, 'Too many answers at once'),
  })
  .strict();
export type SaveOutletDetailsInput = z.infer<typeof saveOutletDetailsSchema>;
