import { z } from 'zod';

import { BANK_HOLIDAY_SOURCES } from '../types/enums';

/**
 * A YYYY-MM-DD calendar date (IST) — matches what `<input type="date">` emits.
 * The `.refine` rejects impossible dates (e.g. 2026-08-32, 2026-02-30, day 00),
 * which the shape regex alone would let through and `Date.UTC` would then
 * silently roll into an adjacent month.
 */
export const bankHolidayDateSchema = z
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

export const bankHolidaySourceSchema = z.enum(BANK_HOLIDAY_SOURCES);

/** Query for GET /super-admin/bank-holidays/month?year=&month= */
export const bankHolidayMonthQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});
export type BankHolidayMonthQuery = z.infer<typeof bankHolidayMonthQuerySchema>;

/** One holiday row inside a confirm-month payload. */
export const bankHolidayInputSchema = z.object({
  date: bankHolidayDateSchema,
  name: z.string().trim().min(1, 'Name is required').max(200),
  source: bankHolidaySourceSchema.default('manual'),
  type: z.string().trim().max(40).optional(),
  enabled: z.boolean(),
});
export type BankHolidayInput = z.infer<typeof bankHolidayInputSchema>;

/**
 * Body for PUT /super-admin/bank-holidays/month — confirm (replace) the whole
 * month at once. The backend upserts every listed date and removes any persisted
 * holiday in that month that is absent from the list. Every date must fall inside
 * the given {year, month}; the backend rejects the payload otherwise.
 */
export const confirmBankHolidayMonthSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  holidays: z.array(bankHolidayInputSchema).max(60),
});
export type ConfirmBankHolidayMonthInput = z.infer<typeof confirmBankHolidayMonthSchema>;
