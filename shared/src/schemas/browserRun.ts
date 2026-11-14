import { z } from 'zod';

import { ingestTankerDocumentsSchema } from './tankerDocument';

/** Bodies for the browser-worker protocol (ADR 0044). The worker is the admin's extension. */

/** `POST /browser-worker/:id/phase` — the worker reports where it is in a run. */
export const browserRunPhaseSchema = z
  .object({
    state: z.enum(['claimed', 'awaiting_tick', 'fetching']),
    message: z.string().trim().max(160).optional(),
  })
  .strict();
export type BrowserRunPhaseInput = z.infer<typeof browserRunPhaseSchema>;

/** `POST /browser-worker/:id/result` — the scraped TT Info data for the run's outlet. */
export const browserRunResultSchema = ingestTankerDocumentsSchema;
export type BrowserRunResultInput = z.infer<typeof browserRunResultSchema>;

/** `POST /browser-worker/:id/fail` — the worker could not finish. */
export const browserRunFailSchema = z
  .object({
    reason: z.string().trim().min(1).max(200),
  })
  .strict();
export type BrowserRunFailInput = z.infer<typeof browserRunFailSchema>;
