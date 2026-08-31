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
   * Whether the DSR engine reads this field under ANY supported configuration —
   * not just the default one. The editor hides everything false behind "Show all
   * portal columns", so the default view contains only cells that can actually
   * change a dealer's report.
   *
   * "Any configuration" is the load-bearing part, and it is written this way
   * because the other reading caused a real fault. `INVOICE_QUANTITY` is read
   * only by dealers whose `receiptBasis` is `INVOICE` — seven of eight — and it
   * sat here marked false, hidden, and labelled as ignored, while it decided
   * their entire receipt. A column that matters to one dealer has to be visible
   * to all of them; a column no configuration reads is the only kind that may be
   * hidden.
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
   * True when nobody may change this cell on a row the portal sent.
   *
   * Reserved for the case where a correction cannot be wrong in a small way,
   * only in a catastrophic one. A stock row's tank number is the whole of it:
   * the report SUMS a product's tanks, so pointing a second row at a tank that
   * already has one does not misplace a figure, it counts that tank's fuel
   * twice. 1E's diesel would jump from 11,410 L to about 17,800 L and report
   * thousands of litres of surplus, which suspends sales.
   *
   * Deliberately narrow. A DELIVERY's tank number stays editable, because a
   * tanker typed against the wrong tank is a real thing that happens and
   * correcting it is the only way to rescue those litres.
   */
  locked?: boolean;
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
  /**
   * True when this column moves no FIGURE but does change the layout notes the
   * report prints — the "nozzle 34 is dispensing but is not in the setup" kind.
   *
   * A third state rather than a flag flip, because `usedByReport` also decides
   * membership of {@link IRAS_ENGINE_FIELDS}, which is a list of the columns the
   * arithmetic reads. Promoting a note-only column into it would make that list
   * mean two different things at once.
   */
  affectsReportNotes?: boolean;
  min?: number;
  max?: number;
  maxDecimals?: number;
}

const LITRES_MAX = 99_999_999;

/**
 * How IRAS writes a date and a time, shared so the cell validator and the
 * engine's `parseIrasInstant` cannot come to disagree about what is readable.
 */
export const IRAS_DATE_RE = /^\d{2}-\d{2}-\d{4}$/;
export const IRAS_TIME_RE = /^\d{1,2}:\d{2}(:\d{2})?$/;

/**
 * Appended to the columns the report's LAYOUT CHECK reads. They move no figure —
 * the arithmetic finds a row's product from its tank — but they decide the notes
 * printed under the report, so "editing this changes nothing" would be false.
 */
const LAYOUT_NOTE =
  ' The report’s layout check reads it, so it changes no figure but it does decide the notes printed at the bottom of the report.';

/** A measured litres/millimetre figure — the common shape. */
function measured(
  field: string,
  opts: {
    usedByReport: boolean;
    hint?: string;
    maxDecimals?: number;
    dropsRowWhenBlank?: boolean;
    /** Override the derived default, for a column whose blank is neither. */
    blankReadsAsZero?: boolean;
    affectsReportNotes?: boolean;
  },
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
 * The fields the DSR actually computes from, stated once so a reader can check
 * this table against `parse.ts` without cross-referencing 70 rows.
 *
 *   TOT.NOZZLE_NO, TOT.TOT_READING          → sales, cumulative sales, testing
 *   STK.TANK_NO, STK.PRODUCT_DIP,
 *   STK.WATER_DIP, STK.NET_QTY              → the printed dip and opening stock
 *   REC.TANK_NO, REC.NET_QTY_DECANTED,
 *   REC.INVOICE_QUANTITY                    → receipts since the last inspection
 *   REC.REC_TXN_ID                          → one tanker reported twice, counted once
 *   REC.DECANT_END_DATE, REC.DECANT_END_TIME → which day a delivery counts on
 *
 * `INVOICE_QUANTITY` is here because a dealer's `receiptBasis` can put their
 * whole receipt on it; the list is what ANY configuration reads, not what the
 * default one does.
 */
export const IRAS_ENGINE_FIELDS: Record<IrasReportCode, readonly string[]> = {
  TOT: ['NOZZLE_NO', 'TOT_READING'],
  STK: ['TANK_NO', 'PRODUCT_DIP', 'WATER_DIP', 'NET_QTY'],
  REC: [
    'TANK_NO',
    'REC_TXN_ID',
    'NET_QTY_DECANTED',
    'INVOICE_QUANTITY',
    'DECANT_END_DATE',
    'DECANT_END_TIME',
  ],
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
    hint: 'The meter total as the portal reports it. The day’s sales come from the change since yesterday’s reading for this nozzle. Some pumps report their totaliser on a different scale, and where that is set up the report converts it — so type the value exactly as the portal shows it and check the preview rather than working back from the sales figure you expect.',
  }),
  {
    field: 'TANK_NO',
    class: 'IDENTITY',
    usedByReport: false,
    affectsReportNotes: true,
    kind: 'number',
    hint: 'Which tank this nozzle draws from. The report matches nozzles by nozzle number, so this does not change any figure.',
  },
  {
    field: 'PRODCODE',
    class: 'IDENTITY',
    usedByReport: false,
    kind: 'text',
    affectsReportNotes: true,
    hint:
      'The portal’s product code. The report decides a row’s product from its tank number, not from this, so changing it moves no figure.' +
      LAYOUT_NOTE,
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
    // Not editable at all — see `locked`. The warning below is what it used to
    // say instead, and it describes an outcome nobody should be able to reach:
    // the guard that stops two rows sharing a tank runs when a row is ADDED and
    // never ran on an edit, so this was the one door left open to it.
    locked: true,
    identityWarning:
      'The report decides which product a tank’s stock belongs to from this number. Changing it moves this whole row’s stock to a different product — and if that product already has a row for the tank, its opening stock is counted twice.',
  },
  measured('PRODUCT_DIP', {
    usedByReport: true,
    hint: 'Type it exactly as the portal shows it. The report divides it by 10 and prints it as THIS tank’s dip — every tank of a product gets its own column.',
  }),
  measured('WATER_DIP', {
    usedByReport: true,
    hint: 'Printed on the report as THIS tank’s water dip.',
  }),
  measured('NET_QTY', {
    usedByReport: true,
    hint: 'The stock the report opens the day with. Printed as this tank’s own stock, and added to the product’s other tanks for the opening stock the variation is measured against.',
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
    affectsReportNotes: true,
    hint:
      'The portal’s product code. The report decides a row’s product from its tank number, not from this.' +
      LAYOUT_NOTE,
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
    // No longer deletes the delivery on its own: the row survives on the invoice
    // figure, which is the whole receipt for the dealers whose book is kept that
    // way. Both blank still drops it — see `parseRec`.
    dropsRowWhenBlank: false,
    blankReadsAsZero: false,
    hint: 'Litres the tank dip measured going in. Whichever of this and Invoice Quantity you set by hand is what the report counts for this delivery; if you set both, the dealer’s configured basis decides. Leaving it empty is not zero — the report falls back to the invoiced litres, and only drops the delivery if both are empty.',
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
    // Blank does NOT read as zero here: `receiptLitres` falls through to the
    // decanted litres, which is the late-invoice case (a delivery entered at the
    // outlet before its invoice figure was to hand).
    blankReadsAsZero: false,
    // Load-bearing since `receiptBasis` arrived: a dealer whose book is kept on
    // invoiced litres has their whole receipt read from HERE. Marking it
    // read-by-nothing hid it behind "show all portal columns" and told the
    // operator the report ignored it, which is how 5E's corrections came to be
    // typed into the other column and silently discarded.
    usedByReport: true,
    hint: 'Litres the tanker was invoiced for. Whichever of this and Net Qty Decanted you set by hand is what the report counts for this delivery; if you set both, the dealer’s configured basis decides. Leaving it empty is not zero — the report falls back to the decanted litres. Type 0 to record the delivery as nothing.',
  }),
  info('TRUCK_NUMBER'),
  info('SUPPLY_POINT'),
  info('TRAN_NAME'),
  {
    field: 'REC_TXN_ID',
    class: 'IDENTITY',
    usedByReport: true,
    kind: 'text',
    identityWarning:
      'The report uses this id to tell two real tankers apart from one tanker the portal reported twice: two deliveries sharing an id are counted once. Changing it can make a single delivery count twice; giving it an id another delivery already has makes a real one vanish.',
  },
  info('DECANT_START_DATE', 'date'),
  info('DECANT_START_TIME', 'time'),
  // These two decide WHICH DAY a delivery counts on. The portal answers the
  // receipt query on when a delivery was entered rather than when it was
  // decanted, and reports one tanker across several days' data, so the engine
  // keeps only the deliveries decanted inside the day it is closing. Move the
  // decant time and the litres move to another day — or off the ledger.
  {
    field: 'DECANT_END_DATE',
    class: 'IDENTITY',
    usedByReport: true,
    kind: 'date',
    hint: 'The decant date exactly as the portal writes it — dd-mm-yyyy.',
    identityWarning:
      'The report counts a delivery on the day it was decanted, in the 24 hours ending at this dealer’s shift close. Moving this date moves the litres to that day’s receipts. A value the report cannot read makes the delivery count on whichever day is being generated, which can count one tanker twice.',
  },
  {
    field: 'DECANT_END_TIME',
    class: 'IDENTITY',
    usedByReport: true,
    kind: 'time',
    hint: 'HH:mm:ss, as the portal writes it.',
    identityWarning:
      'With the decant date, this decides which day’s receipts these litres count in — a delivery that finishes after the shift closes belongs to the next day. A value the report cannot read makes it count on whichever day is being generated.',
  },
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
  // A date or a time the report cannot read is not a harmless typo: the engine
  // decides which day a delivery counts on from the decant stamp, and an
  // unreadable one makes it count on whichever day is being generated. Catch it
  // where it is typed rather than three months later in a variation.
  //
  // Both sentences say what to type and name no portal. This message is the one
  // an operator reads on BOTH surfaces, and 16E — the outlet the shift sheet was
  // built for — has no portal account at all, so “the portal’s format” pointed at
  // something that operator has never seen. They also have to be true of what
  // {@link IRAS_TIME_RE} accepts: seconds are optional there, and demanding a
  // `:00` nobody can check is how an invented figure gets typed into a stamp
  // that, on a day the portal collected, decides which day a tanker’s litres
  // land on. On a hand-typed day it decides nothing — there is no collection
  // window, so `recRowDayVerdict` counts the tanker in the day it was typed into
  // whatever the stamp says — and the shift sheet tells the operator exactly
  // that. Do not restore the unqualified claim: it is what the sheet’s wording
  // was rewritten to stop asserting.
  if (policy.kind === 'date') {
    return IRAS_DATE_RE.test(value)
      ? null
      : 'Type the day and month with two digits and the year with four — like 31-08-2026.';
  }
  if (policy.kind === 'time') {
    return IRAS_TIME_RE.test(value)
      ? null
      : 'Type the time on the 24-hour clock — like 04:20, or 04:20:00 with the seconds.';
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
