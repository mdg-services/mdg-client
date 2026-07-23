import type { BankHolidaySource } from './enums';

/**
 * A confirmed bank/national holiday. When `enabled`, its date is treated as a
 * non-working day by the Credit & DOD due-date engine (the DOD deadline rolls
 * forward off it, exactly like a Sunday or a 2nd/4th Saturday).
 */
export interface BankHoliday {
  id: string;
  /** YYYY-MM-DD (IST calendar date). */
  date: string;
  name: string;
  source: BankHolidaySource;
  /** Library holiday type (e.g. 'public'|'bank'), or 'manual'. Informational. */
  type?: string;
  /** Whether this date counts as a holiday for DOD roll-forward. */
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * A single row in the month editor: either a persisted holiday or an unsaved
 * suggestion pulled from the holiday library.
 */
export interface BankHolidayMonthRow {
  /** Persisted holiday id, or null for a fresh (unsaved) library suggestion. */
  id: string | null;
  /** YYYY-MM-DD (IST calendar date). */
  date: string;
  /** Day of week, 0 = Sunday … 6 = Saturday. */
  weekday: number;
  name: string;
  source: BankHolidaySource;
  type?: string;
  enabled: boolean;
  /** True when already stored; false for a library suggestion not yet confirmed. */
  persisted: boolean;
}

/** GET /super-admin/bank-holidays/month response payload. */
export interface BankHolidayMonthView {
  year: number;
  month: number;
  /** Persisted rows merged with library suggestions, sorted by date. */
  rows: BankHolidayMonthRow[];
}

/** A month that has library-suggested holidays the admin hasn't confirmed yet. */
export interface BankHolidayPendingMonth {
  year: number;
  month: number;
  /** Human label, e.g. "August 2026". */
  label: string;
  /** How many library suggestions in this month are not yet confirmed (saved). */
  count: number;
}

/**
 * GET /super-admin/bank-holidays/pending response — drives the in-app badge /
 * banner that nudges an admin to confirm the library's national holidays.
 */
export interface BankHolidayPendingConfirmation {
  /** Total unconfirmed suggestions across the checked months. */
  totalCount: number;
  months: BankHolidayPendingMonth[];
}
