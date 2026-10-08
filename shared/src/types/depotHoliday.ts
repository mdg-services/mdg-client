/**
 * Depot holidays — the days the fuel depot (terminal) loads no tankers.
 *
 * Separate from the bank holiday list on purpose. A bank holiday moves the
 * Credit & DOD due date; a depot holiday moves when a tanker can be LOADED, and
 * the two calendars do not match (a depot can load on a bank holiday, and close
 * for a local festival the bank list never names). The Load Planner reads this
 * list so that, before a closure, it tells the dealer to order earlier or take
 * more — the stock has to last until the depot loads again.
 *
 * ONE LIST, NOT ONE PER DEPOT. Every MDG outlet loads from Barauni Terminal
 * today (the PAD ledger's terminal column carries nothing else across all
 * outlets), so a per-depot key would be a field nobody could fill differently.
 *
 * SUNDAYS ARE NOT STORED. The depot is closed every Sunday
 * ({@link DEPOT_WEEKLY_CLOSED_DAYS}); only the extra closed days are rows here.
 */
import type { BankHolidaySource } from './enums';

/** Weekdays the depot never loads (0 = Sunday … 6 = Saturday). */
export const DEPOT_WEEKLY_CLOSED_DAYS: readonly number[] = [0];

/** An extra day the depot is closed. Counts only while `enabled`. */
export interface DepotHoliday {
  id: string;
  /** YYYY-MM-DD (IST calendar date). */
  date: string;
  name: string;
  /** `library` = confirmed from the national-holiday suggestions; `manual` = typed in. */
  source: BankHolidaySource;
  /** Library holiday type (e.g. 'public'), or 'manual'. Informational. */
  type?: string;
  /** Whether the depot is closed on this date. */
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/** One row of the month editor: a stored closure, a library suggestion, or a weekly closed day. */
export interface DepotHolidayMonthRow {
  /** Stored id, or null for an unsaved suggestion or a weekly closed day. */
  id: string | null;
  /** YYYY-MM-DD (IST calendar date). */
  date: string;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  name: string;
  source: BankHolidaySource;
  type?: string;
  enabled: boolean;
  /** True when stored; false for a suggestion not yet confirmed or a weekly closed day. */
  persisted: boolean;
  /** True for a day closed every week (a Sunday). Not editable; always closed. */
  weekly: boolean;
}

/** GET /super-admin/depot-holidays/month response payload. */
export interface DepotHolidayMonthView {
  year: number;
  month: number;
  /** Stored closures, library suggestions and the weekly closed days, sorted by date. */
  rows: DepotHolidayMonthRow[];
  /** {@link DEPOT_WEEKLY_CLOSED_DAYS}, echoed so the screen can say "closed every Sunday". */
  weeklyClosedDays: number[];
}
