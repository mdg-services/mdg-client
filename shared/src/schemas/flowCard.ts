import { z } from 'zod';

/** A pill tapped (or a number typed) on a living card (ADR 0059). */
export const flowCardAnswerSchema = z.object({
  row: z.string().trim().min(1).max(40),
  value: z.string().trim().min(1).max(40),
});

/** A foot button on a living card. `stamp` is the card's stamp when the button was drawn. */
export const flowCardActionSchema = z.object({
  action: z.string().trim().min(1).max(20),
  stamp: z.string().trim().max(80),
});
