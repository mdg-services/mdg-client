import { z } from 'zod';

import { dealerStatusSchema, listQuerySchema, slaTierSchema } from './common';

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9\-\s]{7,20}$/, 'Invalid phone');

/**
 * Treat a blank / whitespace-only submission as "not provided".
 *
 * An HTML form posts `''` for an untouched input, and a bare `.optional()` on a
 * `.regex()` schema REJECTS `''` — it only admits `undefined`. Without this an
 * "optional" text field is unsubmittable when left blank.
 */
export const blankToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    schema.optional(),
  );

export const gstSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GST format');

export const panSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'Invalid PAN format');

const ifscSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC');

export const dealerCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{1,4}\d{1,5}$/, 'Invalid dealer code (e.g. E01)');

export const ownerContactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: phoneSchema,
  email: z.string().email().toLowerCase(),
});

export const pumpLocationSchema = z.object({
  address: z.string().trim().min(3).max(500),
  city: z.string().trim().min(1).max(120).optional(),
  state: z.string().trim().min(1).max(120).optional(),
  pincode: z
    .string()
    .trim()
    .regex(/^[0-9]{4,10}$/)
    .optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const bankDetailsSchema = z.object({
  accountHolder: z.string().trim().min(2).max(120),
  accountNumber: z
    .string()
    .trim()
    .regex(/^[0-9]{6,20}$/, 'Invalid account number'),
  ifsc: ifscSchema,
  bankName: z.string().trim().min(2).max(120),
  branch: z.string().trim().min(2).max(120).optional(),
});

export const complianceDocSchema = z.object({
  label: z.string().trim().min(1).max(120),
  url: z.string().url(),
});

/**
 * Initial dealer creation payload (POST /dealers). Nothing is required — the
 * record can be opened with just a working name, or with neither, and every
 * field accrues as the onboarding workflow advances. A phone number supplied
 * here completes onboarding step 1 up front; without one, `collect-phone`
 * stays the current step and captures it later.
 */
export const dealerCreateSchema = z.object({
  phone: blankToUndefined(phoneSchema),
  name: z.string().trim().min(2).max(200).optional(),
});
export type DealerCreateInput = z.infer<typeof dealerCreateSchema>;

/**
 * Ad-hoc PATCH payload for correcting any field on a dealer. Every field is
 * optional but at least one must be provided.
 */
export const dealerUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(200).optional(),
    phone: phoneSchema.optional(),
    ownerContact: ownerContactSchema.partial().optional(),
    pumpLocation: pumpLocationSchema.partial().optional(),
    gst: gstSchema.optional(),
    pan: panSchema.optional(),
    status: dealerStatusSchema.optional(),
    bankDetails: bankDetailsSchema.optional(),
    complianceDocs: z.array(complianceDocSchema).max(50).optional(),
    slaTier: slaTierSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field must be provided',
  });
export type DealerUpdateInput = z.infer<typeof dealerUpdateSchema>;

export const dealerListQuerySchema = listQuerySchema.extend({
  status: dealerStatusSchema.optional(),
  /**
   * Include archived (soft-deleted) dealers in the roster. Off by default;
   * honoured only for super-admins, so a plain admin can never surface one.
   *
   * Parsed explicitly rather than with `z.coerce.boolean()` — that coerces via
   * JS truthiness, so the query string `?includeArchived=false` would arrive as
   * `true`.
   */
  includeArchived: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .transform((v) => v === true || v === 'true' || v === '1')
    .optional(),
});
export type DealerListQuery = z.infer<typeof dealerListQuerySchema>;
