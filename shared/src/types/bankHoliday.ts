import type { BankHolidaySource } from './enums';

/**
 * A bank holiday in ONE state. When `enabled`, its date is a non-working day for
 * the Credit & DOD due-date engine of every outlet in that state (the DOD deadline
 * rolls forward off it, exactly like a Sunday or a 2nd/4th Saturday). An outlet in
 * another state is not affected: Chhath closes banks in Bihar, not in Gujarat.
 */
export interface BankHoliday {
  id: string;
  /** GST state code of the state the holiday applies in, e.g. '10' = Bihar. */
  state: string;
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

/** A single row in one state's month editor. */
export interface BankHolidayMonthRow {
  /** Persisted holiday id, or null for a row the admin has added but not saved. */
  id: string | null;
  /** YYYY-MM-DD (IST calendar date). */
  date: string;
  /** Day of week, 0 = Sunday … 6 = Saturday. */
  weekday: number;
  name: string;
  source: BankHolidaySource;
  type?: string;
  enabled: boolean;
  /** True when already stored. */
  persisted: boolean;
}

/** GET /super-admin/bank-holidays/month response payload. */
export interface BankHolidayMonthView {
  /** GST state code the rows belong to. */
  state: string;
  year: number;
  month: number;
  /** The state's holidays in the month, sorted by date. */
  rows: BankHolidayMonthRow[];
}

/** One state that has outlets, and how fresh its holiday list from RBI is. */
export interface BankHolidayStateSummary {
  /** GST state code, e.g. '10'. */
  state: string;
  /** "Bihar". */
  name: string;
  /** Outlet codes in this state (not archived), e.g. ['5E', '9E']. */
  outlets: string[];
  /** The RBI regional office whose list this state follows ("Patna"), or null when RBI has none we know of. */
  rbiOffice: string | null;
  /** When RBI's list was last downloaded successfully (ISO), or null if never. */
  lastSyncedAt: string | null;
  /** The last download's error in plain words, when the latest try failed. */
  lastError: string | null;
  /** How many holidays this state has saved for the current year. */
  holidaysThisYear: number;
}

/** GET /super-admin/bank-holidays/states response payload. */
export interface BankHolidayStatesView {
  states: BankHolidayStateSummary[];
  /** Outlets (not archived) with no state recorded: they get no extra holidays at all. */
  outletsWithoutState: string[];
}
