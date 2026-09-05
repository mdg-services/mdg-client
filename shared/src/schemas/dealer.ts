import { z } from 'zod';

import {
  DEALER_CUSTOM_FIELDS_MAX,
  DEALER_CUSTOM_FIELD_LABEL_MAX,
  DEALER_CUSTOM_FIELD_VALUE_MAX,
  DEALER_PROFILE_FIELD_KEYS,
  dealerProfileField,
  isDealerProfileFieldKey,
} from '../dealer/profile';

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

/**
 * A dealer code, e.g. `15E` — digits then letters, no separator.
 *
 * The order matters and is not arbitrary: every code in use reads as a number
 * followed by a region letter (`1E`, `3E`, `15E`), which is how both sides say
 * it out loud. The schema used to demand the opposite (`E01`) while real codes
 * went in through other doors, so no real code could pass it.
 */
export const dealerCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  // Tolerate a typed-in space or dot ("12 E", "12.E") rather than rejecting it —
  // the same code arrived in three different spellings through the old free-text
  // service-config fields.
  .transform((v) => v.replace(/[\s.]+/g, ''))
  .refine((v) => /^\d{1,4}[A-Z]{1,3}$/.test(v), 'Invalid dealer code (e.g. 15E)');

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
 * Initial dealer creation payload (POST /dealers).
 *
 * The code is the one required field: it is the dealer's whole identity, so a
 * record opened without one could not be found again. Everything else accrues
 * as the onboarding workflow advances. A phone number supplied here completes
 * onboarding step 1 up front; without one, `collect-phone` stays the current
 * step and captures it later.
 */
export const dealerCreateSchema = z.object({
  code: dealerCodeSchema,
  phone: blankToUndefined(phoneSchema),
});
export type DealerCreateInput = z.infer<typeof dealerCreateSchema>;

/* ────────────────────────────────────────────────────────────────────────
 * The outlet profile — validation BUILT FROM the catalog
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * A `YYYY-MM-DD` calendar day, with impossible dates rejected.
 *
 * The `.refine` is not decoration: the shape regex alone admits `2026-02-30`,
 * and `Date.UTC` then rolls it silently into March — so a licence would show an
 * expiry a day nobody typed. Same guard `bankHolidayDateSchema` and
 * `ttBusinessDateSchema` already carry, kept local for the same reason they are:
 * each schema module owns its own dates.
 */
const profileDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
  .refine((s) => {
    const y = Number(s.slice(0, 4));
    const mo = Number(s.slice(5, 7));
    const d = Number(s.slice(8, 10));
    const dt = new Date(Date.UTC(y, mo - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() + 1 === mo && dt.getUTCDate() === d;
  }, 'Not a real calendar date');

/**
 * Check one submitted value against its catalog row.
 *
 * THE CATALOG IS THE SCHEMA. Every rule below reads a property of the field
 * definition rather than naming a field, so adding a row to
 * `DEALER_PROFILE_FIELDS` extends this validator with no edit here at all — and,
 * more to the point, an admin cannot be shown an input the server will refuse.
 */
function checkAgainstCatalog(
  entry: { key: string; value: string; expiresOn?: string },
  ctx: z.RefinementCtx,
): void {
  const def = dealerProfileField(entry.key);
  if (!def) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['key'],
      message: `Unknown outlet field "${entry.key}"`,
    });
    return;
  }
  /**
   * A catalog row whose value lives on a canonical field must NOT arrive in this
   * array. GST and PAN have their own PATCH keys, their own format checks and,
   * in GST's case, a unique index; accepting a copy here would store a second
   * answer to the same question that nothing validates and nothing reads.
   */
  if (def.source !== 'profile') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['key'],
      message: `"${def.label}" is set through the "${def.source}" field, not the outlet profile`,
    });
    return;
  }
  if (entry.value.length > def.maxLength) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['value'],
      message: `${def.label} must be ${def.maxLength} characters or fewer`,
    });
  }
  if (entry.expiresOn !== undefined && !def.expiryLabel) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['expiresOn'],
      message: `${def.label} does not carry an expiry date`,
    });
  }
  const check = (schema: z.ZodTypeAny, message: string) => {
    if (!schema.safeParse(entry.value).success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message });
    }
  };
  switch (def.kind) {
    case 'phone':
      check(phoneSchema, `${def.label} must be a phone number`);
      break;
    case 'email':
      check(z.string().email(), `${def.label} must be an email address`);
      break;
    case 'date':
      check(profileDateSchema, `${def.label} must be a date`);
      break;
    case 'choice':
      if (def.choices && !def.choices.includes(entry.value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['value'],
          message: `${def.label} must be one of: ${def.choices.join(', ')}`,
        });
      }
      break;
    case 'text':
    case 'code':
      break;
  }
}

/**
 * One stored outlet-profile row.
 *
 * `value` is `.min(1)` on purpose: a row with nothing in it is a row that should
 * not have been sent. The editor drops emptied fields rather than submitting
 * blanks, so an empty value can only be a bug, and storing one would leave the
 * resolver unable to tell "never filled in" from "cleared".
 */
export const dealerProfileEntrySchema = z
  .object({
    key: z.string().trim().min(1).max(80),
    value: z.string().trim().min(1),
    expiresOn: blankToUndefined(profileDateSchema),
  })
  .superRefine(checkAgainstCatalog);

export const dealerOutletProfileSchema = z
  .array(dealerProfileEntrySchema)
  .max(DEALER_PROFILE_FIELD_KEYS.length)
  .superRefine((rows, ctx) => {
    const seen = new Set<string>();
    rows.forEach((row, i) => {
      if (seen.has(row.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [i, 'key'],
          message: `"${row.key}" appears twice`,
        });
      }
      seen.add(row.key);
    });
  });

/**
 * One admin-authored pair.
 *
 * `dealerVisible` has no default here and is required on the wire. A default of
 * `false` would be the safe value, but it would also let a client that forgot
 * the field silently overwrite a deliberate "yes, the dealer may ask about this"
 * on every subsequent save — the whole array is replaced, so an omitted flag is
 * a lost decision, not an unchanged one.
 */
export const dealerCustomFieldSchema = z
  .object({
    /**
     * Every message here is written for the ADMIN who typed the box, because
     * that is who reads it: the editor maps each issue back on to the field that
     * caused it. Zod's own English ("String must contain at most 60
     * character(s)") names a constraint rather than a fix, and it names the KEY,
     * which is derived and which nobody typed.
     */
    key: z
      .string()
      .trim()
      .min(1, 'Give this detail a name with a letter or a number in it')
      .max(DEALER_CUSTOM_FIELD_LABEL_MAX, 'That name is too long')
      .regex(/^[a-z0-9-]+$/, 'Give this detail a name with a letter or a number in it'),
    label: z
      .string()
      .trim()
      .min(1, 'Give this detail a name')
      .max(DEALER_CUSTOM_FIELD_LABEL_MAX, `Keep the name under ${DEALER_CUSTOM_FIELD_LABEL_MAX} characters`),
    value: z
      .string()
      .trim()
      .min(1, 'Fill this in, or remove the row')
      .max(DEALER_CUSTOM_FIELD_VALUE_MAX, `Keep this under ${DEALER_CUSTOM_FIELD_VALUE_MAX} characters`),
    expiresOn: blankToUndefined(profileDateSchema),
    dealerVisible: z.boolean(),
  })
  .superRefine((row, ctx) => {
    // A custom pair may not shadow a catalog field: two rows with the same key
    // would render twice on the Info tab and answer the same question twice in
    // chat, with nothing to say which one is authoritative.
    if (isDealerProfileFieldKey(row.key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['label'],
        message: `"${row.label}" is already an outlet field — edit it above instead`,
      });
    }
  });

export const dealerCustomFieldsSchema = z
  .array(dealerCustomFieldSchema)
  .max(DEALER_CUSTOM_FIELDS_MAX)
  .superRefine((rows, ctx) => {
    const seen = new Set<string>();
    rows.forEach((row, i) => {
      if (seen.has(row.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [i, 'label'],
          message: `"${row.label}" is already used — give it a different name`,
        });
      }
      seen.add(row.key);
    });
  });

/**
 * Ad-hoc PATCH payload for correcting any field on a dealer. Every field is
 * optional but at least one must be provided.
 */
export const dealerUpdateSchema = z
  .object({
    /**
     * Correcting a mistyped code. This is the only way to change one: the
     * `assign-code` onboarding step is append-only and not reopenable, so
     * without this a typo at creation would identify the dealer wrongly for
     * good. Uniqueness is still the index's call — a clash surfaces as a 409.
     */
    code: dealerCodeSchema.optional(),
    phone: phoneSchema.optional(),
    ownerContact: ownerContactSchema.partial().optional(),
    pumpLocation: pumpLocationSchema.partial().optional(),
    /**
     * `null` CLEARS the field; `undefined` (absent) leaves it alone.
     *
     * The outlet-profile editor draws GST and PAN alongside the other
     * twenty-three, so emptying one of those two boxes has to mean the same
     * thing emptying any other box means. Without an explicit null there is no
     * way to say it: a blank string fails the format check, and omitting the key
     * is indistinguishable from not touching it. Both partial-unique indexes
     * exclude an absent value (`{ $type: 'string' }`), so clearing releases the
     * GSTIN for another outlet rather than colliding with it.
     */
    gst: gstSchema.nullable().optional(),
    pan: panSchema.nullable().optional(),
    status: dealerStatusSchema.optional(),
    bankDetails: bankDetailsSchema.optional(),
    complianceDocs: z.array(complianceDocSchema).max(50).optional(),
    /**
     * The whole outlet-profile array, replaced. Not a patch of one row:
     * the editor holds every field on screen at once and saves what it
     * shows, so a row that is gone from the payload is a row the admin
     * cleared. Same shape `complianceDocs` above already uses.
     */
    outletProfile: dealerOutletProfileSchema.optional(),
    customFields: dealerCustomFieldsSchema.optional(),
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
