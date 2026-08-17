/**
 * What each IRAS column MEANS — the one table the editor and the engine share.
 *
 * The DSR reads exactly eight of the ~70 fields the portal sends. An operator
 * correcting a figure has no way to know which eight, and the failure mode is
 * silent and expensive: they retype a number, see it saved, regenerate, and the
 * report is unchanged because the column they fixed is one nothing reads.
 *
 * So the classification is data, not UI copy, and it lives here rather than in a
 * React component — the admin, the write-side validation and the engine's own
 * regression test all read this table. `dsr-report/fields.test.ts` pins it
 * against `parse.ts`: teach the parser a new field and the test fails until this
 * table admits it, which is what stops a tooltip quietly lying about money.
 *
 * `class` is what the value IS; `usedByReport` is whether the report reads it.
 * They are separate on purpose. `STK.PRODUCT_QTY` is a genuine measured
 * quantity that today's report ignores, and `TOT.TANK_NO` genuinely identifies
 * the row even though the engine selects nozzles by number alone. Collapsing
 * either into a single "safe to edit" flag is how the table starts lying.
 */
import type { IrasReportCode } from '../types/irasData';

/** Where a column sits in a row's meaning. */
export type IrasFieldClass =
  /** Identifies the row — which tank, which nozzle, which product. */
  | 'IDENTITY'
  /** A measured quantity: a reading, a dip, a volume. */
  | 'MEASURED'
  /** Descriptive: timestamps, flags, invoice and truck references, statuses. */
  | 'INFO'
  /** A column the portal added that this table has never seen. */
  | 'UNKNOWN';

/** How a cell's text is validated and displayed. */
export type IrasFieldKind = 'number' | 'text' | 'date' | 'time' | 'datetime';

export interface IrasFieldPolicy {
  field: string;
  class: IrasFieldClass;
  /**
   * Whether the DSR engine reads this field. The editor hides everything false
   * behind "Show all portal columns", so the default view contains only cells
   * that can actually change a dealer's report.
   */
  usedByReport: boolean;
  kind: IrasFieldKind;
  /** Shown under the cell while editing. Plain language, no field names. */
  hint?: string;
  /**
   * The consequence of changing an IDENTITY cell, in the operator's terms. Not
   * a warning about being careful — a statement of what will move where.
   */
  identityWarning?: string;
  /**
   * True when `parse.ts` DROPS the whole row if this field is blank. Clearing
   * one of these silently removes a nozzle or a tank from the report, so the
   * editor says so before the commit rather than after the regeneration.
   */
  dropsRowWhenBlank?: boolean;
  /**
   * True when `parse.ts` reads a blank as ZERO and keeps the row.
   *
   * A separate flag because "removes the row" and "counts as nothing" are
   * different outcomes and the operator needs the right one: an emptied
   * `NET_QTY` does not mean "not counted", it means the tank is recorded as
   * holding nothing — which still supplies the printed dip and still suppresses
   * the "no stock row" warning. One warning for both cases would be wrong half
   * the time, which is how a warning stops being read.
   */
  blankReadsAsZero?: boolean;
  min?: number;
  max?: number;
  maxDecimals?: number;
}

const LITRES_MAX = 99_999_999;

/** A measured litres/millimetre figure — the common shape. */
function measured(
  field: string,
  opts: { usedByReport: boolean; hint?: string; maxDecimals?: number; dropsRowWhenBlank?: boolean },
): IrasFieldPolicy {
  return {
    field,
    class: 'MEASURED',
    kind: 'number',
    min: 0,
    max: LITRES_MAX,
    maxDecimals: opts.maxDecimals ?? 3,
    // `parse.ts` coerces a blank measured value with `?? 0`, EXCEPT on the
    // fields it keys the row off — those drop the row instead.
    blankReadsAsZero: !opts.dropsRowWhenBlank,
    ...opts,
  };
}

/** A descriptive column: stored verbatim, read by nothing. */
function info(field: string, kind: IrasFieldKind = 'text'): IrasFieldPolicy {
  return { field, class: 'INFO', usedByReport: false, kind };
}

/**
 * The eight fields the DSR actually computes from, stated once so a reader can
 * check this table against `parse.ts` without cross-referencing 70 rows.
 *
 *   TOT.NOZZLE_NO, TOT.TOT_READING          → sales, cumulative sales, testing
 *   STK.TANK_NO, STK.PRODUCT_DIP,
 *   STK.WATER_DIP, STK.NET_QTY              → the printed dip and opening stock
 *   REC.TANK_NO, REC.NET_QTY_DECANTED       → receipts since the last inspection
 */
export const IRAS_ENGINE_FIELDS: Record<IrasReportCode, readonly string[]> = {
  TOT: ['NOZZLE_NO', 'TOT_READING'],
  STK: ['TANK_NO', 'PRODUCT_DIP', 'WATER_DIP', 'NET_QTY'],
  REC: ['TANK_NO', 'NET_QTY_DECANTED'],
};

const TOT_FIELDS: IrasFieldPolicy[] = [
  {
    field: 'NOZZLE_NO',
    class: 'IDENTITY',
    usedByReport: true,
    kind: 'number',
    dropsRowWhenBlank: true,
    identityWarning:
      'The report finds each nozzle by this number. Changing it makes this reading count as a different nozzle — and leaves the original one with no reading at all, which stops the previous day’s sales from being closed.',
  },
  measured('TOT_READING', {
    usedByReport: true,
    dropsRowWhenBlank: true,
    hint: 'The meter total. The day’s sales are the difference between this and yesterday’s reading for the same nozzle.',
  }),
  {
    field: 'TANK_NO',
    class: 'IDENTITY',
    usedByReport: false,
    kind: 'number',
    hint: 'Which tank this nozzle draws from. The report matches nozzles by nozzle number, so this does not change any figure.',
  },
  {
    field: 'PRODCODE',
    class: 'IDENTITY',
    usedByReport: false,
    kind: 'text',
    hint: 'The portal’s product code. The report decides a row’s product from its tank number, not from this, so changing it does not change any figure.',
  },
  info('PUMP_NO', 'number'),
  info('PARENT_DU_NO', 'number'),
  info('NOZZLE_STATUS'),
  info('SHIFT_DATE', 'date'),
  info('SHIFT_TIME', 'time'),
  info('SHIFT_TYPE'),
  info('FCC_TXN_ID'),
  info('UPDATED_BY'),
  info('UPDATE_FLAG'),
  info('DATE_CREATED', 'datetime'),
  info('DATE_UPDATED', 'datetime'),
  info('XFR_DATETIME', 'datetime'),
  info('SDATE_UPDATED', 'datetime'),
];

const STK_FIELDS: IrasFieldPolicy[] = [
  {
    field: 'TANK_NO',
    class: 'IDENTITY',
    usedByReport: true,
    kind: 'number',
    dropsRowWhenBlank: true,
    identityWarning:
      'The report decides which product a tank’s stock belongs to from this number. Changing it moves this whole row’s stock to a different product — and if that product already has a row for the tank, its opening stock is counted twice.',
  },
  measured('PRODUCT_DIP', {
    usedByReport: true,
    hint: 'Type it exactly as the portal shows it. The report divides it by 10 to print the dip.',
  }),
  measured('WATER_DIP', { usedByReport: true, hint: 'Printed on the report as the water dip.' }),
  measured('NET_QTY', {
    usedByReport: true,
    hint: 'The stock the report opens the day with. Where a product has more than one tank, the tanks are added together.',
  }),
  measured('PRODUCT_QTY', {
    usedByReport: false,
    hint: 'Stored, but today’s report does not use this number — it opens the day on Net Qty.',
  }),
  measured('WATER_QTY', {
    usedByReport: false,
    hint: 'Stored, but today’s report does not use this number.',
  }),
  {
    field: 'PRODCODE',
    class: 'IDENTITY',
    usedByReport: false,
    kind: 'text',
    hint: 'The portal’s product code. The report decides a row’s product from its tank number, not from this.',
  },
  info('TANK_STATUS'),
  info('TRAN_NAME'),
  info('STK_TXN_ID'),
  info('STK_DATE', 'date'),
  info('STK_TIME', 'time'),
  info('UOM'),
  info('DIP_UOM'),
  info('TEMP', 'number'),
  info('DENSITY', 'number'),
  info('DENSITY_15C', 'number'),
  info('XFR_DATETIME', 'datetime'),
  info('SDATE_UPDATED', 'datetime'),
];

const REC_FIELDS: IrasFieldPolicy[] = [
  {
    field: 'TANK_NO',
    class: 'IDENTITY',
    usedByReport: true,
    kind: 'number',
    identityWarning:
      'The report decides which product a delivery belongs to from this tank number. Changing it moves these litres to a different product’s stock-versus-sales variation.',
    // Blanking it does NOT drop the row — `parse.ts` reads it as tank 0, which
    // no product's tank list contains, so the row survives and its litres
    // quietly stop counting. Worth its own sentence for that reason.
    hint: 'Which tank took the delivery. Leaving it empty keeps the row but no product will pick up its litres.',
  },
  measured('NET_QTY_DECANTED', {
    usedByReport: true,
    dropsRowWhenBlank: true,
    hint: 'Litres actually decanted into the tank. This is what the report counts as the day’s receipt.',
  }),
  {
    field: 'PRODCODE',
    class: 'IDENTITY',
    usedByReport: false,
    kind: 'text',
    hint: 'The portal’s product code. The report decides a delivery’s product from its tank number, not from this.',
  },
  info('INVOICE_NUMBER'),
  info('INVOICE_DATE', 'date'),
  measured('INVOICE_QUANTITY', {
    usedByReport: false,
    hint: 'The quantity on the invoice. Stored for the paper trail; the report counts the decanted litres.',
  }),
  info('TRUCK_NUMBER'),
  info('SUPPLY_POINT'),
  info('TRAN_NAME'),
  info('REC_TXN_ID'),
  info('DECANT_START_DATE', 'date'),
  info('DECANT_START_TIME', 'time'),
  info('DECANT_END_DATE', 'date'),
  info('DECANT_END_TIME', 'time'),
  measured('PROD_DIP_START', { usedByReport: false }),
  measured('PROD_DIP_END', { usedByReport: false }),
  measured('PROD_QTY_START', { usedByReport: false }),
  measured('PROD_QTY_END', { usedByReport: false }),
  measured('NET_SALE_DURING_DECANT', { usedByReport: false }),
  measured('SHORTAGE', { usedByReport: false }),
  info('NO_OF_CHAMBERS', 'number'),
  info('QTY_CHAMBER1', 'number'),
  info('QTY_CHAMBER2', 'number'),
  info('QTY_CHAMBER3', 'number'),
  info('QTY_CHAMBER4', 'number'),
  info('QTY_CHAMBER5', 'number'),
  info('QTY_CHAMBER6', 'number'),
  info('PRE_DENSITY', 'number'),
  info('POST_DENSITY', 'number'),
  info('SERIAL_NUMBER_OF_SAFETY_CHECK_LIST'),
  info('RECEIPT_DATAENTRY_DATE', 'date'),
  info('RECEIPT_DATAENTRY_TIME', 'time'),
  info('RECEIPT_DATAENTRY_TYPE'),
  info('UOM'),
  info('XFR_DATETIME', 'datetime'),
  info('SDATE_UPDATED', 'datetime'),
];

const BY_CODE: Record<IrasReportCode, IrasFieldPolicy[]> = {
  TOT: TOT_FIELDS,
  STK: STK_FIELDS,
  REC: REC_FIELDS,
};

const INDEX: Record<IrasReportCode, Map<string, IrasFieldPolicy>> = {
  TOT: new Map(TOT_FIELDS.map((f) => [f.field, f])),
  STK: new Map(STK_FIELDS.map((f) => [f.field, f])),
  REC: new Map(REC_FIELDS.map((f) => [f.field, f])),
};

/**
 * A column the table has never seen — the portal added it since this was
 * written. Defaults to UNKNOWN and `usedByReport: false`, i.e. hidden and
 * described as read-by-nothing, which is the truth: the engine cannot consume a
 * field it does not name. Defaulting the other way would invite an operator to
 * "fix" a number that goes nowhere.
 */
function unknownField(field: string): IrasFieldPolicy {
  return {
    field,
    class: 'UNKNOWN',
    usedByReport: false,
    kind: 'text',
    hint: 'The portal started sending this column after this screen was built. It is stored, but no calculation reads it.',
  };
}

/** The policy for one column, never undefined. */
export function irasFieldPolicy(code: IrasReportCode, field: string): IrasFieldPolicy {
  return INDEX[code].get(field) ?? unknownField(field);
}

/** Every column this table knows for a report, in a stable order. */
export function irasFieldPolicies(code: IrasReportCode): readonly IrasFieldPolicy[] {
  return BY_CODE[code];
}

/** Whether the DSR reads this column — the "used in the report" filter. */
export function irasFieldUsedByReport(code: IrasReportCode, field: string): boolean {
  return irasFieldPolicy(code, field).usedByReport;
}

/** One cell's validation, as a message or null. Shared by the grid and the API. */
export function validateIrasCell(code: IrasReportCode, field: string, raw: string): string | null {
  const policy = irasFieldPolicy(code, field);
  const value = raw.trim();

  if (value === '') {
    // Blank is legal — the portal itself sends blanks — but on a field the
    // parser keys on it silently deletes the row from the report.
    return null;
  }
  if (policy.kind !== 'number') return null;

  if (/,/.test(value)) return 'Enter a number without commas.';
  const n = Number(value);
  if (!Number.isFinite(n)) return 'Enter a number. No units, no commas.';
  if (policy.min !== undefined && n < policy.min) {
    return policy.min === 0 ? 'This cannot be negative.' : `This cannot be below ${policy.min}.`;
  }
  if (policy.max !== undefined && n > policy.max) {
    return `This looks too large — the most this can be is ${policy.max.toLocaleString('en-IN')}.`;
  }
  if (policy.maxDecimals !== undefined) {
    const decimals = value.includes('.') ? value.split('.')[1]!.length : 0;
    if (decimals > policy.maxDecimals) {
      return `At most ${policy.maxDecimals} decimal place${policy.maxDecimals === 1 ? '' : 's'}.`;
    }
  }
  return null;
}
