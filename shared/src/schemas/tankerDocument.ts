import { z } from 'zod';

/**
 * What the browser worker POSTs after reading TT Info for one outlet (ADR 0044). One entry
 * per vehicle, each with its document cards. Dates are the portal's text (e.g. "09 Jun
 * 2027") or `YYYY-MM-DD`; the server normalises and keeps only valid ones.
 */

const tankerDocEntrySchema = z
  .object({
    /** The portal's "License Type - <name>" text. */
    label: z.string().trim().min(1).max(160),
    /** Validity start, as shown or `YYYY-MM-DD`. */
    validFrom: z.string().trim().max(40).optional(),
    /** Validity end — what the reminder counts down to. */
    validUntil: z.string().trim().max(40).optional(),
  })
  .strict();

const tankerVehicleSchema = z
  .object({
    reg: z.string().trim().min(3).max(24),
    documents: z.array(tankerDocEntrySchema).max(60),
  })
  .strict();

/** `POST /dealers/:id/tanker-documents` (the worker's upload for one outlet). */
export const ingestTankerDocumentsSchema = z
  .object({
    vehicles: z.array(tankerVehicleSchema).max(200),
  })
  .strict();
export type IngestTankerDocumentsInput = z.infer<typeof ingestTankerDocumentsSchema>;
