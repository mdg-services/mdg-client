/**
 * The shape of a shift somebody has to type, and every reason it is not ready
 * to save.
 *
 * 16E has no IndianOil portal account, so nothing collects its figures: an admin
 * types the whole morning into the shift data editor — six meter readings and,
 * for two tanks, the stock and the two dips. The forecourt has not changed shape
 * since the outlet was set up, so eight of the clicks that costs are the operator
 * building the same eight rows again, one at a time, before a single figure is
 * on screen.
 *
 * This module carries the SHAPE of that day forward and refuses to carry the
 * MEASUREMENTS. The distinction is the whole design and it is not a matter of
 * taste:
 *
 *   - Which nozzles and which tanks the outlet has, which grade each holds, and
 *     the three identity columns a hand-added row is refused without — those are
 *     plumbing. They were true yesterday and they are true today.
 *   - A totaliser is a lifetime odometer. Carrying yesterday's reading and
 *     leaving it untouched reports ZERO litres sold on that nozzle, and it also
 *     drops that nozzle's test draw, because the engine charges testing only to a
 *     nozzle whose reading moved. The variation then swings negative by the
 *     missing litres and the dealer is advised to draw fuel back into a tank that
 *     is not short. So a reading is never pre-filled; yesterday's is printed
 *     beside the empty box as something to check against, and the ruleset below
 *     refuses to save a day where one is blank, below yesterday's, or exactly
 *     equal to yesterday's without somebody saying the pump did not run.
 *   - The water dip is the one measurement carried, because it is the one the
 *     engine never calculates with: every read of it is display. A stale water
 *     dip can make a printed line stale; it cannot move a figure.
 *
 * It lives in `@dk/shared` rather than in the admin because `mdg-admin` has no
 * test runner at all, and none of this may be decided in a React component that
 * nothing can pin. The backend's Jest reaches this file, so the rules are pinned
 * where they are written.
 *
 * Everything here is pure: no dates, no clock, no IO. A day resolves the same way
 * on the phone, in the review dialog and in a test.
 */
import { IRAS_ROW_LEVEL_FIELD } from '../types/irasData';
import type { IrasReportCode, IrasRow } from '../types/irasData';

import { validateIrasCell } from './fields';

/* ─────────────────────────────── the plan ──────────────────────────────── */

/**
 * One grade as the DSR is configured for it — structurally the shape
 * `IrasDayEditorView['dsr']['products'][number]` already ships, so a day payload
 * drops straight in.
 */
export interface IrasDayPlanProduct {
  key: string;
  labelEn: string;
  tankLabel: string;
  tankNos: number[];
  nozzleNos: number[];
  prodCodes: string[];
  /**
   * Nozzle number → the factor its totaliser has to be multiplied by. 14E's
   * nozzles 6 and 9 report at 0.1, so a litres figure computed without this
   * reads ten times the report's own.
   *
   * The key is the nozzle number exactly as `nozzleNos` above lists it — `6`,
   * never `06`. The engine looks it up as `meterScale[String(nozzleNo)]` and
   * finds nothing else, so a key spelled any other way is a factor no report
   * applies; see {@link irasMeterScale}.
   */
  meterScale?: Record<string, number>;
}

/** The previous day's stock row for one tank, as the day payload carries it. */
export interface IrasPreviousStkRow {
  productDip: string;
  waterDip: string;
  netQty: string;
}

export interface IrasDayPlanInput {
  products: readonly IrasDayPlanProduct[];
  /** Nozzle number → the previous day's meter reading. */
  previousTot: Record<string, string>;
  /** Tank number → the previous day's stock row. */
  previousStk: Record<string, IrasPreviousStkRow>;
  /** The previous business date, `YYYY-MM-DD`, for the "Carried from 29 Aug" caption. */
  previousDate: string;
  /**
   * Nozzle and tank numbers the day ALREADY has a row for, from any source —
   * portal rows, committed hand rows, and rows sitting unsaved in the pending
   * set.
   *
   * Load-bearing rather than tidy. The server's identity-collision guard refuses
   * a second meter row for a nozzle or a second stock row for a tank, and it is
   * all-or-nothing at Apply — so a plan that proposed a row the day already has
   * would 400 the whole commit after every figure had been retyped.
   */
  taken: { NOZZLE_NO: readonly string[]; TANK_NO: readonly string[] };
}

/** The two reports a plan proposes rows for. Deliveries are never planned. */
export type IrasPlannedRowCode = 'TOT' | 'STK';

/** One figure a person has to supply, wherever its row came from. */
export interface IrasPlannedFigure {
  code: IrasPlannedRowCode;
  /** Nozzle number for `TOT`, tank number for `STK`. */
  identity: string;
  field: string;
}

export interface IrasPlannedRow {
  code: IrasPlannedRowCode;
  /** `TOT:4` | `STK:3` — stable across a re-plan, so the sheet can key on it. */
  planKey: string;
  /** The DSR product this row belongs to, e.g. `HSD`. */
  productKey: string;
  /**
   * The row itself: identity columns, and `WATER_DIP` when there is one to
   * carry. Never `TOT_READING`, `NET_QTY` or `PRODUCT_DIP` — see the header.
   */
  row: IrasRow;
  /** Figures the system put in the row, so the field can say it did. */
  carried: Array<{ field: string; from: string }>;
  /** Fields a person must supply before this day can be saved. */
  asks: string[];
  /** Yesterday's figure for each asked field, to print beside the empty box. */
  previous: Record<string, string>;
}

export interface IrasDayPlan {
  /** The rows to add to the pending set — the gaps only. */
  rows: IrasPlannedRow[];
  /**
   * Every figure a complete day needs, INCLUDING the ones whose row is already
   * there.
   *
   * Separate from `rows` because the two answer different questions. `rows` is
   * "what still has to be built"; this is "what the day is". Counting the
   * readout off `rows` would say a day reopened after a partial save needs zero
   * figures — its eight rows already exist, so the plan proposes none — and the
   * operator would be told a half-typed morning was complete.
   */
  figuresNeeded: IrasPlannedFigure[];
  /**
   * Nozzles and tanks the previous day had figures for that this dealer's report
   * layout does not name. Not laid out, and said so — silently dropping them is
   * how an operator comes to believe a nozzle is being reported when it is not.
   */
  droppedFromPreviousDay: Array<{
    code: IrasPlannedRowCode;
    identity: string;
    message: string;
  }>;
  /**
   * True when the previous day gives this plan nothing to check against: not one
   * configured nozzle has a reading on it. Every yesterday-keyed rule below is
   * silent on such a day, so the screen has to say so rather than simply showing
   * no warnings.
   *
   * A flag for laying the screen out — never the source of the sentence. The
   * sentence lives on the `NO_PREVIOUS_DAY` finding, which is raised on this same
   * condition through the same helper, and the screen must print that finding's
   * `message` rather than wording it again. A second copy behind a second trigger
   * is how a screen comes to say "no previous day" on a day that has one.
   */
  previousDayEmpty: boolean;
}

/** The one figure a meter row asks for. */
const TOT_ASKS: readonly string[] = ['TOT_READING'];

/**
 * The two a stock row asks for. `NET_QTY` is the stock the whole variation is
 * measured against; `PRODUCT_DIP` is the dealer's own independent witness to it,
 * printed on the report beside it. Neither can be carried: a carried stock is a
 * day of sales that never happened, and a carried dip is a witness agreeing with
 * a figure it never saw.
 */
const STK_ASKS: readonly string[] = ['NET_QTY', 'PRODUCT_DIP'];

/**
 * Build the day.
 *
 * Which rows comes from the DSR config, never from yesterday's rows. That is the
 * authority the engine itself uses — `computeProduct` walks `p.nozzleNos` and
 * selects stock by `p.tankNos` membership — so a row built from the config can
 * never be one the report ignores, and a configured nozzle can never be silently
 * missed. Yesterday's rows supply the reference figures only, and anything they
 * hold that the config does not name is reported rather than laid out.
 */
export function irasDayPlan(input: IrasDayPlanInput): IrasDayPlan {
  const products = input.products ?? [];
  const previousTot = input.previousTot ?? {};
  const previousStk = input.previousStk ?? {};
  const takenNozzles = new Set((input.taken?.NOZZLE_NO ?? []).map(irasRowIdentity));
  const takenTanks = new Set((input.taken?.TANK_NO ?? []).map(irasRowIdentity));
  const carriedFrom = irasDayDateLabel(input.previousDate) || 'the previous day';

  const rows: IrasPlannedRow[] = [];
  const figuresNeeded: IrasPlannedFigure[] = [];
  const configuredNozzles = new Set<string>();
  const configuredTanks = new Set<string>();

  for (const product of products) {
    // Which grade code to stamp on the row. On a day nobody collected, this is
    // the only thing that tells the report which product a tank holds: without
    // it the layout discovery finds no products at all and the dealer's report
    // carries "Tank 3 has no product code in this snapshot; skipped" forever.
    const prodCode = firstNonBlank(product.prodCodes ?? []);
    const tankForNozzle = tankForNozzleOf(product);

    for (const nozzleNo of product.nozzleNos ?? []) {
      const identity = irasRowIdentity(nozzleNo);
      // A nozzle listed under two grades is one nozzle. Two rows for it would be
      // refused by the server's collision guard, taking the whole commit down.
      if (!identity || configuredNozzles.has(identity)) continue;
      configuredNozzles.add(identity);

      const previousReading = trimmed(byIdentity(previousTot, identity));

      figuresNeeded.push({ code: 'TOT', identity, field: 'TOT_READING' });
      if (takenNozzles.has(identity)) continue;

      const row: IrasRow = { NOZZLE_NO: identity };
      if (tankForNozzle) row.TANK_NO = tankForNozzle;
      if (prodCode) row.PRODCODE = prodCode;

      rows.push({
        code: 'TOT',
        planKey: `TOT:${identity}`,
        productKey: product.key,
        row,
        carried: [],
        asks: [...TOT_ASKS],
        previous: previousReading ? { TOT_READING: previousReading } : {},
      });
    }

    for (const tankNo of product.tankNos ?? []) {
      const identity = irasRowIdentity(tankNo);
      // Same rule, and it bites harder here: the report SUMS a product's tanks,
      // so a tank that got two rows would have its fuel counted twice.
      if (!identity || configuredTanks.has(identity)) continue;
      configuredTanks.add(identity);

      const previous = byIdentity(previousStk, identity);
      const previousNetQty = trimmed(previous?.netQty);
      const previousProductDip = trimmed(previous?.productDip);
      const previousWaterDip = trimmed(previous?.waterDip);

      figuresNeeded.push(
        { code: 'STK', identity, field: 'NET_QTY' },
        { code: 'STK', identity, field: 'PRODUCT_DIP' },
      );
      if (takenTanks.has(identity)) continue;

      const row: IrasRow = { TANK_NO: identity };
      if (prodCode) row.PRODCODE = prodCode;

      const carried: IrasPlannedRow['carried'] = [];
      // Only when there is one. A tank whose previous day had no water dip gets
      // an empty box, because a gap has to read as a gap — filling it with
      // nothing and calling it carried would say the system knew something it
      // does not.
      if (previousWaterDip) {
        row.WATER_DIP = previousWaterDip;
        carried.push({ field: 'WATER_DIP', from: carriedFrom });
      }

      const previousFigures: Record<string, string> = {};
      if (previousNetQty) previousFigures.NET_QTY = previousNetQty;
      if (previousProductDip) previousFigures.PRODUCT_DIP = previousProductDip;

      rows.push({
        code: 'STK',
        planKey: `STK:${identity}`,
        productKey: product.key,
        row,
        carried,
        asks: [...STK_ASKS],
        previous: previousFigures,
      });
    }
  }

  const droppedFromPreviousDay = collectDropped(
    previousTot,
    previousStk,
    configuredNozzles,
    configuredTanks,
    input.previousDate,
  );

  return {
    rows,
    figuresNeeded,
    droppedFromPreviousDay,
    // The same test the NO_PREVIOUS_DAY finding is raised on, through the same
    // helper. Two implementations of "is there a previous day" would let the
    // plan and the findings disagree, and the screen would then either warn
    // about a day it can check or stay quiet about one it cannot.
    previousDayEmpty: noPreviousReadings([...configuredNozzles], previousTot),
  };
}

/* ─────────────────────────── litres sold, once ──────────────────────────── */

/**
 * What one nozzle sold between two mornings, in LITRES — the only place this
 * platform works it out.
 *
 * It is three lines of arithmetic and it had three implementations: the engine's
 * own, this module's, and a third in the React component that prints "Sold 412
 * L" beside the box as the operator types. That is this area's founding fault
 * rather than an untidiness: a screen that says 412 L while the report says 41 L
 * teaches the operator to distrust whichever one is right, and nothing in the
 * admin has a test runner to catch the drift.
 *
 * The scale is why it is not a subtraction. Some dispensing units report their
 * totaliser in a different decimal scale and the portal passes it through
 * unchanged — 14E's nozzles 6 and 9 read ten times their true litres. Each
 * reading is scaled and then subtracted, in that order, exactly as
 * `pumpsFromInputs` does it before `compute.ts` closes a day's sales, so the two
 * cannot part company on a rounding edge either.
 *
 * `null` — never 0 — when either morning's figure is blank or unreadable. A
 * missing reading is not a nozzle that sold nothing, and the caller has to be
 * made to say which it is showing.
 */
export function irasNozzleSold(
  todayReading: unknown,
  previousReading: unknown,
  meterScale?: number,
): number | null {
  const today = asNumber(todayReading);
  const previous = asNumber(previousReading);
  if (today === null || previous === null) return null;
  const scale = usableScale(meterScale);
  return today * scale - previous * scale;
}

/* ──────────────────── one nozzle, one tank, one identity ────────────────── */

/**
 * A nozzle or tank number reduced to the one form the REPORT compares them in.
 *
 * The portal writes a nozzle number however it pleases — `02` one morning and
 * `2` the next — a hand-typed row can carry `2.0`, and the config always yields
 * `2`. Compared as strings those are three different nozzles; compared the way
 * the engine compares them they are one. A module that compares them any other
 * way is the worst of both: the dedupe, the `taken` skip and the duplicate-row
 * block see two nozzles where the engine sees one, so the row the operator typed
 * into is quietly the wrong one and its reading is dropped without a word.
 *
 * The engine's rule is not "read it as a number". It is "read it as a number and
 * throw the fraction away", and `dsr-report/parse.ts` is the one place a row's
 * identity is derived — every reading of one goes through these lines:
 *
 *     function intVal(v: string | undefined): number | undefined {
 *       const n = num(v);                        // Number(v), or undefined
 *       return n === undefined ? undefined : Math.trunc(n);
 *     }
 *     const nozzleNo = intVal(r.NOZZLE_NO);      // TOT rows
 *     const tankNo = intVal(r.TANK_NO);          // TOT, STK and REC rows
 *
 * So `2.7` IS nozzle 2 to the report, and reading it here as a nozzle of its own
 * would wave through the exact row this rule exists to stop: a stock row typed
 * `3.5` looks like a tank nothing else on the day names, while `computeProduct`
 * sums it into tank 3 alongside tank 3's own row and counts that tank's stock
 * twice. It is a rare thing to type — nothing pre-fills a fraction — and the
 * figure it moves when it happens is a whole tank of fuel, which is why the two
 * readings of a number have to be the same one reading.
 *
 * Exported because it is not only this module's rule. The server's
 * identity-collision guard in `irasData/corrections.ts` has to refuse exactly the
 * rows this refuses, and a second hand-written copy of these lines there, with
 * nothing pinning the two together, is precisely the split this whole area exists
 * to close. One rule, imported.
 *
 * Anything that is not a number is left exactly as it was typed rather than
 * mangled — a nonsense identity is the server's refusal to make, not this
 * function's to invent.
 */
export function irasRowIdentity(value: unknown): string {
  const raw = trimmed(value);
  if (!raw) return '';
  const n = Number(raw);
  return Number.isFinite(n) ? String(Math.trunc(n)) : raw;
}

/**
 * The factor one nozzle's totaliser has to be multiplied by before anybody
 * subtracts anything from it, or 1.
 *
 * Looked up on the CONFIG's own nozzle number, spelled exactly as the engine
 * spells it. `pumpsFromInputs` reads
 *
 *     const scale = p.meterScale?.[String(nozzleNo)];
 *
 * with `nozzleNo` taken straight out of `p.nozzleNos`, and that lookup is exact.
 * A key written `06` for nozzle 6 is therefore not found by the report, and that
 * nozzle is printed unscaled. This used to be looked up loosely, normalising both
 * sides, so the shift sheet found an `06` the report never would and printed
 * 41 L beside a box the report would go on to print 412 L for — a screen naming
 * one figure while the calculation reads another, which is this area's founding
 * fault. Agreeing with the engine is the point even where the engine is the
 * fragile side: a config key that misses is a config to correct, not a difference
 * for a screen to paper over.
 *
 * Only a positive finite factor may touch a reading — the engine's own rule
 * again. A 0 or a typo'd string would silently zero the pump's throughput, which
 * reads on the report as a pump that sold nothing all day.
 *
 * Exported so the shift sheet — which prints litres sold beside every box as the
 * operator types, and so has to name the same figure the report will — reads this
 * key rather than keeping a lookup of its own.
 */
export function irasMeterScale(
  product: Pick<IrasDayPlanProduct, 'meterScale'> | undefined,
  nozzleNo: number,
): number {
  return usableScale(product?.meterScale?.[String(nozzleNo)]);
}

/* ───────────────── a row on the day, and what it was before ─────────────── */

/**
 * One row in force on the day and — when the caller can say — the same row as
 * the SERVER is holding it at this moment.
 *
 * `onRecord` is the only thing that separates work somebody is doing right now
 * from work that was already answered for on the visit that saved it, and it is
 * carried as the whole row rather than as a bare "this row changed" flag on
 * purpose. A flag cannot say which FIGURE moved. Correcting the tank number on a
 * meter row would then re-open the reading's own question, and re-asking about a
 * reading nobody touched is exactly the trap this field exists to close.
 *
 * Three states, and the difference between the first two is load-bearing:
 *
 *   - `undefined` — the caller is not saying. Every rule then reads the row as
 *     fresh work, which is precisely how this module behaved before the field
 *     existed. A caller that does not pass it cannot quietly change meaning.
 *   - `null` — this change set is ADDING the row. There is nothing on record to
 *     compare against, so every figure on it is fresh work.
 *   - a row — what the server holds. A cell equal to it is a figure this change
 *     set does not touch; a cell that differs is one it does.
 */
export interface IrasDayRowInForce {
  code: IrasReportCode;
  /** The row as it stands now, every pending change already folded in. */
  row: IrasRow;
  /** The same row as the server holds it, `null` when this change set adds it. */
  onRecord?: IrasRow | null;
}

/* ───────────────── "this pump did not run", still true or not ───────────── */

export interface IrasAcknowledgementsInput {
  /** Every row in force on the day, in the order the findings index into. */
  rows: ReadonlyArray<IrasDayRowInForce>;
  /** Nozzle number → the previous day's meter reading. */
  previousTot: Record<string, string>;
  products: readonly IrasDayPlanProduct[];
  /** Every nozzle somebody has tapped "This pump did not run today" on. */
  acknowledged: readonly string[];
}

/**
 * Which of those statements the typed figures still bear out.
 *
 * "This pump did not run today" is a claim a named admin makes, and it goes on
 * the wire and into the AuditLog as a durable, machine-readable one — the whole
 * reason it is a field rather than a note is that something can be asked to
 * count unexplained unmoved meters later without re-deriving anything. So it has
 * to be true of the day as SAVED, not of the day as it stood at the moment the
 * button was pressed.
 *
 * The failure this closes came out of an operator walkthrough. Nozzle 5 read
 * 1,27,640 yesterday. The operator misreads the register, taps the action,
 * confirms it — which fills the box with 1,27,640 — then finds the real figure
 * and types 1,28,360. The block clears, because the nozzle now sold 720 L. But
 * nothing took the statement back: the save dialog still printed "Nozzle 5 is
 * recorded as not having run today" on a day where it sold 720 litres, and that
 * is the sentence that was written down.
 *
 * Derived rather than stored, and derived HERE rather than in three places. The
 * sentence in the save dialog, the {@link IrasDayFindingKind} block that is
 * suppressed, and the field on the wire are three readings of one question, and
 * this platform's founding fault in this area is a rule with two implementations
 * that can disagree. {@link irasDayFindings} calls this function for its own
 * suppression, so there is no third answer to find.
 *
 * A statement is in force when all three hold:
 *   - the nozzle is one this dealer's report layout names — the block only ever
 *     fires on those, and a statement about a nozzle no report prints is a claim
 *     about nothing;
 *   - the day holds a meter row for it, with a reading that can be read;
 *   - that reading, put through the one litres rule, still says the nozzle sold
 *     exactly nothing.
 *
 * Blanking the reading therefore drops it too, which is right: a nozzle with no
 * figure on it is not a nozzle somebody watched stand still. Type yesterday's
 * reading back in and the statement is in force again, because the stored set is
 * left alone and only this answer moves.
 *
 * Returns the nozzles normalised the way every comparison in this module
 * normalises them, deduped, in the dealer's configured order — so "Nozzles 2 and
 * 5" reads in forecourt order rather than in the order somebody happened to tap.
 */
export function irasAcknowledgementsInForce(input: IrasAcknowledgementsInput): string[] {
  const claimed = new Set((input.acknowledged ?? []).map(irasRowIdentity));
  claimed.delete('');
  if (claimed.size === 0) return [];

  const previousTot = input.previousTot ?? {};

  // The FIRST meter row on a nozzle, which is the row `irasDayFindings` measures
  // against. A second row on one nozzle is a DUPLICATE_IDENTITY block in its own
  // right; letting it decide whether a statement stands would mean the block and
  // the wire disagreed on exactly the day that is already wrong.
  const readingByNozzle = new Map<string, unknown>();
  for (const entry of input.rows ?? []) {
    if (entry?.code !== 'TOT') continue;
    const identity = irasRowIdentity(entry.row?.NOZZLE_NO);
    if (!identity || readingByNozzle.has(identity)) continue;
    readingByNozzle.set(identity, entry.row?.TOT_READING);
  }

  const inForce: string[] = [];
  for (const { identity, configNo, product } of configuredNozzlesOf(input.products ?? [])) {
    if (!claimed.has(identity) || !readingByNozzle.has(identity)) continue;
    const sold = irasNozzleSold(
      readingByNozzle.get(identity),
      byIdentity(previousTot, identity),
      irasMeterScale(product, configNo),
    );
    if (sold === 0) inForce.push(identity);
  }
  return inForce;
}

/* ───────────────────────────── the findings ─────────────────────────────── */

export type IrasDayFindingKind =
  | 'MISSING_FIGURE'
  | 'MISSING_ROW'
  | 'METER_BACKWARDS'
  | 'METER_UNCHANGED'
  | 'UNREADABLE_VALUE'
  | 'DUPLICATE_IDENTITY'
  | 'STOCK_UNCHANGED_BUT_SOLD'
  | 'ROW_NOT_IN_LAYOUT'
  | 'NO_PREVIOUS_DAY';

export interface IrasDayFinding {
  severity: 'BLOCK' | 'WARN';
  kind: IrasDayFindingKind;
  code?: IrasReportCode;
  /** `'4'` for a nozzle, `'3'` for a tank. */
  identity?: string;
  field?: string;
  /** Shown under the field. */
  message: string;
  /**
   * Shown beside the disabled save button, and phrased to stand on its own —
   * the screen shows one of these, not a list, and `title` does not fire on
   * touch so it has to be visible text. Present on every `BLOCK`.
   */
  blockReason?: string;
  /**
   * Index into the `rows` array that was passed in, so a caller can attach the
   * finding to the exact row it came from. A delivery has no unique identity —
   * one tank can take two tankers in a day — so the tank number alone cannot
   * point at the right card.
   */
  rowIndex?: number;
}

/**
 * The one wording of "this day has nothing to check against", carried on the
 * `NO_PREVIOUS_DAY` finding and nowhere else.
 */
const NO_PREVIOUS_DAY_MESSAGE =
  'There is no previous day on record, so this shift cannot show sales or a variation yet. Type today’s figures — tomorrow’s day will use them.';

export interface IrasDayFindingsInput {
  products: readonly IrasDayPlanProduct[];
  /**
   * Every row in force on the day. On the surface this module was written for —
   * a day with no snapshot or a `MANUAL` one — every row is hand-added.
   *
   * Each row may carry `onRecord`, the same row as the server holds it. It is
   * what scopes the equal-to-yesterday block to the readings this change set is
   * actually putting there; see that block for the walkthrough. A caller that
   * leaves it off gets the whole day treated as fresh work, which is what this
   * function did before the field existed.
   */
  rows: ReadonlyArray<IrasDayRowInForce>;
  previousTot: Record<string, string>;
  previousStk: Record<string, IrasPreviousStkRow>;
  /** Nozzles somebody has stated did not run today, so a zero sale is deliberate. */
  acknowledgedUnchangedNozzles: readonly string[];
  /**
   * The previous business date, `YYYY-MM-DD`. Optional only so a caller that has
   * not got it still gets every finding; without it the stock-did-not-move
   * warning says "the previous day" where it would otherwise name the date.
   */
  previousDate?: string;
}

/**
 * Every reason this day is not ready, in triage order.
 *
 * The whole set, every time — not the cell being edited. A commit is
 * all-or-nothing, so one unreadable value 400s a morning's typing with a single
 * sentence and no cell highlighted; checking the whole day turns that into a
 * one-field fix before the operator ever presses save.
 */
export function irasDayFindings(input: IrasDayFindingsInput): IrasDayFinding[] {
  const products = input.products ?? [];
  const previousTot = input.previousTot ?? {};
  const previousStk = input.previousStk ?? {};
  const inputRows = input.rows ?? [];
  // Consulted, never re-decided. The set that suppresses METER_UNCHANGED below
  // has to be the same set that goes on the wire and into the sentence the save
  // dialog prints — otherwise a nozzle can be blocked here while the dialog says
  // it did not run, or the other way about. See
  // {@link irasAcknowledgementsInForce} for the walkthrough that made this a bug.
  const acknowledged = new Set(
    irasAcknowledgementsInForce({
      rows: inputRows,
      previousTot,
      products,
      acknowledged: input.acknowledgedUnchangedNozzles ?? [],
    }),
  );
  const previousLabel = irasDayDateLabel(input.previousDate ?? '', 'long') || 'the previous day';

  /* Configured identities, deduped, in config order. */
  const nozzles = configuredNozzlesOf(products);
  const tanks = configuredTanksOf(products);
  const seenNozzles = new Set(nozzles.map((n) => n.identity));
  const seenTanks = new Set(tanks.map((t) => t.identity));

  /* The rows in force, indexed the way the engine reads them. */
  type FoundRow = { row: IrasRow; rowIndex: number; onRecord?: IrasRow | null };
  const totByNozzle = new Map<string, FoundRow[]>();
  const stkByTank = new Map<string, FoundRow[]>();
  const recRows: FoundRow[] = [];
  inputRows.forEach((entry, rowIndex) => {
    const row = entry?.row ?? {};
    // Carried through the index rather than looked up again later, because the
    // one rule that reads it has to read it off the SAME row it is measuring —
    // the first meter row on a nozzle, not the second one a duplicate put there.
    const found: FoundRow = { row, rowIndex, onRecord: entry?.onRecord };
    if (entry?.code === 'TOT') indexRow(totByNozzle, irasRowIdentity(row.NOZZLE_NO), found);
    else if (entry?.code === 'STK') indexRow(stkByTank, irasRowIdentity(row.TANK_NO), found);
    else if (entry?.code === 'REC') recRows.push(found);
  });

  /* ── every row that has to answer for itself ───────────────────────────────
   *
   * The configured identities, and then the ones only a row in force names.
   *
   * A day can hold a row for a nozzle or a tank this dealer's report layout does
   * not name — typed on the Full grid, or left behind when the layout changed.
   * Checking only the configured ones leaves that row unchecked AND undrawn: it
   * passes every rule here, the sheet enables save, and the server refuses the
   * whole morning because a hand-added row is required to carry its figure. The
   * blank-figure rule below therefore runs over every row in force, which is
   * exactly the set the server's own refusal runs over.
   *
   * The yesterday-keyed meter rules deliberately do not. A backwards or unmoved
   * reading on a nozzle the layout does not name cannot reach a report figure —
   * the engine walks the configured nozzles and never sees it — so blocking on it
   * would lock an operator out of saving real work over a sentence about a
   * nozzle no report will print.
   */
  type RowCheck = { identity: string; product?: IrasDayPlanProduct; inLayout: boolean };
  const nozzleChecks: RowCheck[] = nozzles.map((n) => ({
    identity: n.identity,
    product: n.product,
    inLayout: true,
  }));
  for (const identity of totByNozzle.keys()) {
    if (!seenNozzles.has(identity)) nozzleChecks.push({ identity, inLayout: false });
  }
  const tankChecks: RowCheck[] = tanks.map((t) => ({ ...t, inLayout: true }));
  for (const identity of stkByTank.keys()) {
    if (!seenTanks.has(identity)) tankChecks.push({ identity, inLayout: false });
  }

  /* ── gather, then phrase ───────────────────────────────────────────────────
   *
   * Two passes rather than one, because the sentence beside the disabled button
   * has to know how many of its kind there are: "1 row is missing" must not be
   * printed on a day that is missing two.
   */

  const missingRows: Array<{
    code: IrasPlannedRowCode;
    identity: string;
    product: IrasDayPlanProduct;
  }> = [];
  for (const { identity, product } of nozzles) {
    if (!totByNozzle.get(identity)?.length) missingRows.push({ code: 'TOT', identity, product });
  }
  for (const { identity, product } of tanks) {
    if (!stkByTank.get(identity)?.length) missingRows.push({ code: 'STK', identity, product });
  }

  const duplicates: Array<{ code: IrasPlannedRowCode; identity: string; rowIndex: number }> = [];
  for (const [identity, found] of totByNozzle) {
    if (found.length > 1) duplicates.push({ code: 'TOT', identity, rowIndex: found[1]!.rowIndex });
  }
  for (const [identity, found] of stkByTank) {
    if (found.length > 1) duplicates.push({ code: 'STK', identity, rowIndex: found[1]!.rowIndex });
  }

  const unreadable: Array<{
    code: IrasReportCode;
    identity: string;
    field: string;
    problem: string;
    rowIndex: number;
  }> = [];
  inputRows.forEach((entry, rowIndex) => {
    const code = entry?.code;
    const row = entry?.row ?? {};
    if (!code) return;
    const identity = code === 'TOT' ? trimmed(row.NOZZLE_NO) : trimmed(row.TANK_NO);
    for (const [field, raw] of Object.entries(row)) {
      const problem = validateIrasCell(code, field, String(raw ?? ''));
      if (problem) unreadable.push({ code, identity, field, problem, rowIndex });
    }
  });

  const backwards: Array<{
    identity: string;
    typed: number;
    previous: number;
    litres: number;
    rowIndex: number;
  }> = [];
  const unchanged: Array<{ identity: string; previous: number; rowIndex: number }> = [];
  for (const { identity, configNo, product } of nozzles) {
    const found = totByNozzle.get(identity)?.[0];
    if (!found) continue;
    const typed = asNumber(found.row.TOT_READING);
    const previous = asNumber(byIdentity(previousTot, identity));
    if (typed === null || previous === null) continue;
    // Through the one litres rule, so the sentence under the box is the figure
    // the report will print. 14E's nozzles 6 and 9 run at 0.1: a raw difference
    // of 280 there is 28 litres on the report, and a screen that says 280 while
    // the report reads 28 is the exact fault this platform keeps having.
    //
    // It also settles the equality case on NUMBERS rather than strings, which is
    // what a pre-built day needs: "452180.0" against "452180" is the same meter
    // and a string test would let that zero-sales nozzle straight through.
    const sold = irasNozzleSold(typed, previous, irasMeterScale(product, configNo));
    if (sold === null) continue;
    // Backwards blocks on every day, saved or not, and that is not the same
    // judgement as the one below it. A meter cannot run backwards, so the figure
    // on record is wrong whoever typed it and whenever; the fix is to correct
    // that very reading, which is the box the finding already points at. Blocking
    // costs the operator nothing they were not going to have to do anyway.
    if (sold < 0) {
      backwards.push({ identity, typed, previous, litres: -sold, rowIndex: found.rowIndex });
      continue;
    }
    /*
     * Equal to yesterday blocks only on a reading THIS change set is putting
     * there — and 16E is why.
     *
     * That outlet has two dead pumps. Nozzles 5 and 6 have not moved since the
     * inspection; their readings are still the inspection's own figures, 13,205
     * and 2,638, and the operator retypes them every morning. The only honest
     * way to save a nozzle that sold nothing is "This pump did not run today",
     * and that statement is made in the change set: it goes with the commit and
     * is not held on the day afterwards.
     *
     * So on the old rule a correctly saved morning was unopenable. Save at 07:00
     * with both statements made; reopen at 09:00 to add a forgotten tanker, and
     * nozzles 5 and 6 blocked again on figures nobody had touched, with only two
     * ways out: swear the statement a second time, or type a reading that did not
     * happen. The block was written to stop somebody leaving a carried figure
     * untouched AS THEY ENTER IT. A reading that is already on record and that
     * this change set does not alter was answered for on the visit that saved it,
     * and asking again adds nothing.
     *
     * A caller that says nothing about what the server holds still has every
     * reading read as fresh work, so the backend's after-save pass — which hands
     * over a day's hand-added rows with nothing to compare them against — goes
     * on saying exactly what it said before this scoping existed.
     */
    if (sold === 0 && !acknowledged.has(identity) && readingIsFreshWork(found)) {
      unchanged.push({ identity, previous, rowIndex: found.rowIndex });
    }
  }

  const missingFigures: Array<{
    code: IrasReportCode;
    identity: string;
    field: string;
    label: string;
    message: string;
    /**
     * Set only on a row the sheet cannot draw, whose operator's next move is a
     * different screen. Left unset, the row joins the one shared sentence that
     * names every drawn row still owed something.
     */
    blockReason?: string;
    rowIndex: number;
  }> = [];
  /** The sentence that tells an operator where a row they cannot see lives. */
  const notDrawnHere = (what: string) =>
    ` ${sentenceStart(what)} is not in this dealer’s report layout, so the shift sheet does not draw it — fill this in on the Full grid, or remove the row there.`;
  const strandedReason = (label: string) =>
    `${sentenceStart(
      label,
    )} still needs a figure, and it is not in this dealer’s report layout, so the shift sheet does not draw it. Fill it in on the Full grid, or remove the row there.`;
  for (const { identity, inLayout } of nozzleChecks) {
    const found = totByNozzle.get(identity)?.[0];
    if (!found || trimmed(found.row.TOT_READING)) continue;
    missingFigures.push({
      code: 'TOT',
      identity,
      field: 'TOT_READING',
      label: `nozzle ${identity}`,
      message: `Nozzle ${identity} still needs this morning’s meter reading.${
        inLayout ? '' : notDrawnHere(`nozzle ${identity}`)
      }`,
      blockReason: inLayout ? undefined : strandedReason(`nozzle ${identity}`),
      rowIndex: found.rowIndex,
    });
  }
  for (const { identity, inLayout } of tankChecks) {
    const found = stkByTank.get(identity)?.[0];
    if (!found) continue;
    if (!trimmed(found.row.NET_QTY)) {
      missingFigures.push({
        code: 'STK',
        identity,
        field: 'NET_QTY',
        label: `tank ${identity}`,
        message: `Tank ${identity} still needs its stock in litres.${
          inLayout ? '' : notDrawnHere(`tank ${identity}`)
        }`,
        blockReason: inLayout ? undefined : strandedReason(`tank ${identity}`),
        rowIndex: found.rowIndex,
      });
    }
    if (!trimmed(found.row.PRODUCT_DIP)) {
      missingFigures.push({
        code: 'STK',
        identity,
        field: 'PRODUCT_DIP',
        label: `tank ${identity}`,
        message: `Tank ${identity} still needs its product dip.${
          inLayout ? '' : notDrawnHere(`tank ${identity}`)
        }`,
        blockReason: inLayout ? undefined : strandedReason(`tank ${identity}`),
        rowIndex: found.rowIndex,
      });
    }
  }
  for (const { row, rowIndex } of recRows) {
    // A delivery survives on EITHER quantity — seven of the eight dealers are
    // kept on the invoiced figure — but with neither, `parse.ts` drops the row
    // and the server refuses the whole commit. Catching it here is the
    // difference between a one-field fix and a rejected morning.
    if (trimmed(row.NET_QTY_DECANTED) || trimmed(row.INVOICE_QUANTITY)) continue;
    const identity = trimmed(row.TANK_NO);
    missingFigures.push({
      code: 'REC',
      identity,
      field: 'INVOICE_QUANTITY',
      label: identity ? `the tanker into tank ${identity}` : 'the tanker',
      message:
        'This tanker still needs its litres. Type either the invoiced quantity or the litres decanted — with neither, the delivery is dropped.',
      rowIndex,
    });
  }
  // The last row nothing above can see: one with no nozzle or tank number on it
  // at all. It belongs to no identity, so every index in this function skips it,
  // and the server refuses it — `requiredForAddedRow` demands `NOZZLE_NO` on a
  // meter row and `TANK_NO` on a stock row. Left out, it is the same failure as
  // the rest of this pass: the sheet enables save and the whole morning comes
  // back a 400 naming a column that has no box on screen.
  inputRows.forEach((entry, rowIndex) => {
    const row = entry?.row ?? {};
    const missingIdentity =
      entry?.code === 'TOT'
        ? !irasRowIdentity(row.NOZZLE_NO) && {
            field: 'NOZZLE_NO',
            what: 'nozzle',
            row: 'meter reading',
          }
        : entry?.code === 'STK'
          ? !irasRowIdentity(row.TANK_NO) && { field: 'TANK_NO', what: 'tank', row: 'stock' }
          : false;
    if (!missingIdentity) return;
    const label = `one ${missingIdentity.row} row`;
    missingFigures.push({
      code: entry!.code,
      identity: '',
      field: missingIdentity.field,
      label,
      message: `This ${missingIdentity.row} row has no ${missingIdentity.what} number, so nothing can be checked against it and the report would not know where it came from. Fill the ${missingIdentity.what} number in on the Full grid, or remove the row there.`,
      blockReason: `${sentenceStart(label)} has no ${
        missingIdentity.what
      } number. Fill it in on the Full grid, or remove the row there.`,
      rowIndex,
    });
  });

  const stockUnchanged: Array<{
    identity: string;
    product: IrasDayPlanProduct;
    sold: number;
    stock: number;
    rowIndex: number;
  }> = [];
  const stockUnchangedSeen = new Set<string>();
  for (const product of products) {
    // What this grade's pumps say was sold. Only nozzles with a reading on both
    // days count; a nozzle still blank is a MISSING_FIGURE and its silence must
    // not be read as "sold nothing".
    let sold = 0;
    for (const nozzleNo of product.nozzleNos ?? []) {
      const identity = irasRowIdentity(nozzleNo);
      const found = totByNozzle.get(identity)?.[0];
      if (!found) continue;
      const nozzleSold = irasNozzleSold(
        found.row.TOT_READING,
        byIdentity(previousTot, identity),
        irasMeterScale(product, nozzleNo),
      );
      if (nozzleSold === null || nozzleSold <= 0) continue;
      sold += nozzleSold;
    }
    if (sold <= 0) continue;

    // Per TANK, not per grade. Firing only when EVERY tank of a grade is
    // untouched disarms the check the moment one of two tanks is updated and
    // the other forgotten — which is the commonest shape of this mistake, and
    // diesel sits in two or three tanks at these outlets.
    for (const tankNo of product.tankNos ?? []) {
      const identity = irasRowIdentity(tankNo);
      if (!identity || stockUnchangedSeen.has(identity)) continue;
      const found = stkByTank.get(identity)?.[0];
      if (!found) continue;
      const typed = asNumber(found.row.NET_QTY);
      const previous = asNumber(byIdentity(previousStk, identity)?.netQty);
      if (typed === null || previous === null || typed !== previous) continue;
      stockUnchangedSeen.add(identity);
      stockUnchanged.push({
        identity,
        product,
        sold,
        stock: previous,
        rowIndex: found.rowIndex,
      });
    }
  }

  /* ── phrase ──────────────────────────────────────────────────────────────── */

  const findings: IrasDayFinding[] = [];

  const missingRowReason = (product: IrasDayPlanProduct, code: IrasPlannedRowCode, id: string) =>
    `${
      missingRows.length === 1 ? '1 row is missing' : `${missingRows.length} rows are missing`
    }. ${product.labelEn} needs ${code === 'TOT' ? 'nozzle' : 'tank'} ${id}; it is not here.`;

  for (const { code, identity, product } of missingRows) {
    findings.push({
      severity: 'BLOCK',
      kind: 'MISSING_ROW',
      code,
      identity,
      message:
        code === 'STK'
          ? `Tank ${identity} has no stock row. Its stock is then read as nothing, and ${product.labelEn}’s variation is overstated by whatever is in it.`
          : `Nozzle ${identity} has no meter reading row. The report needs every ${product.labelEn} nozzle to close a day’s sales, so the previous day’s sales would stay blank.`,
      blockReason: missingRowReason(product, code, identity),
    });
  }

  for (const { code, identity, rowIndex } of duplicates) {
    findings.push({
      severity: 'BLOCK',
      kind: 'DUPLICATE_IDENTITY',
      code,
      identity,
      rowIndex,
      message:
        code === 'STK'
          ? `Tank ${identity} already has a stock row on this day. Two rows on one tank double that grade’s opening stock.`
          : `Nozzle ${identity} already has a meter reading row on this day. The second row is ignored, so one of these readings would never reach the report.`,
      blockReason:
        code === 'STK'
          ? `Tank ${identity} has two stock rows. Remove one to save.`
          : `Nozzle ${identity} has two meter reading rows. Remove one to save.`,
    });
  }

  const unreadableReason =
    unreadable.length === 1
      ? 'One value cannot be read. Fix the highlighted field to save.'
      : `${unreadable.length} values cannot be read. Fix the highlighted fields to save.`;
  for (const item of unreadable) {
    findings.push({
      severity: 'BLOCK',
      kind: 'UNREADABLE_VALUE',
      code: item.code,
      identity: item.identity || undefined,
      field: item.field,
      rowIndex: item.rowIndex,
      // `validateIrasCell`'s own sentence, verbatim. The editor and the server
      // must not offer two different explanations of one rejected value.
      message: item.problem,
      blockReason: unreadableReason,
    });
  }

  const backwardsReason = `${
    backwards.length === 1
      ? 'One meter reading is below yesterday’s'
      : `${backwards.length} meter readings are below yesterday’s`
  }. Fix ${nozzleList(backwards.map((b) => b.identity))}, or the report will show a negative sale.`;
  for (const item of backwards) {
    findings.push({
      severity: 'BLOCK',
      kind: 'METER_BACKWARDS',
      code: 'TOT',
      identity: item.identity,
      field: 'TOT_READING',
      rowIndex: item.rowIndex,
      message: `Meters do not run backwards. Yesterday nozzle ${item.identity} read ${grouped(
        item.previous,
        3,
      )} and you have typed ${grouped(item.typed, 3)} — that is ${grouped(
        item.litres,
      )} litres less.`,
      blockReason: backwardsReason,
    });
  }

  for (const item of unchanged) {
    findings.push({
      severity: 'BLOCK',
      kind: 'METER_UNCHANGED',
      code: 'TOT',
      identity: item.identity,
      field: 'TOT_READING',
      rowIndex: item.rowIndex,
      message: `Same as yesterday. This reports zero litres sold on nozzle ${item.identity}, and it also drops that nozzle’s 5 litre test draw. If the pump really did not run, say so on the row menu.`,
      blockReason: `Nozzle ${item.identity} reads exactly the same as yesterday. Either correct it, or choose 'This pump did not run today' on that row.`,
    });
  }

  // The rows the sheet actually draws share one sentence, because the screen
  // shows one sentence and it has to name every row still owed something. A row
  // the layout does not name is not in it: that operator's next move is a
  // different screen, so it carries its own instruction.
  const drawnMissing = missingFigures.filter((f) => !f.blockReason);
  const missingLabels = uniqueInOrder(drawnMissing.map((f) => f.label));
  const missingReason = `${sentenceStart(joinList(missingLabels))} still ${
    missingLabels.length === 1 ? 'needs' : 'need'
  } ${drawnMissing.length === 1 ? 'a figure' : 'figures'}.`;
  for (const item of missingFigures) {
    findings.push({
      severity: 'BLOCK',
      kind: 'MISSING_FIGURE',
      code: item.code,
      identity: item.identity || undefined,
      field: item.field,
      rowIndex: item.rowIndex,
      message: item.message,
      blockReason: item.blockReason ?? missingReason,
    });
  }

  // Said whether or not the row is complete, and only ever a WARN. A complete
  // row for a nozzle the layout does not name is not wrong — the layout may
  // simply be behind the forecourt — but its figures reach no report, and an
  // operator who typed them is entitled to know that before tomorrow.
  for (const { identity, inLayout } of nozzleChecks) {
    if (inLayout) continue;
    findings.push({
      severity: 'WARN',
      kind: 'ROW_NOT_IN_LAYOUT',
      code: 'TOT',
      identity,
      rowIndex: totByNozzle.get(identity)?.[0]?.rowIndex,
      message: `Nozzle ${identity} has a meter reading row on this day but is not in this dealer’s report layout, so the shift sheet does not draw it and nothing it holds reaches the report. Remove the row on the Full grid, or add nozzle ${identity} to the layout on the dealer’s Services tab.`,
    });
  }
  for (const { identity, inLayout } of tankChecks) {
    if (inLayout) continue;
    findings.push({
      severity: 'WARN',
      kind: 'ROW_NOT_IN_LAYOUT',
      code: 'STK',
      identity,
      rowIndex: stkByTank.get(identity)?.[0]?.rowIndex,
      message: `Tank ${identity} has a stock row on this day but is not in this dealer’s report layout, so the shift sheet does not draw it and nothing it holds reaches the report. Remove the row on the Full grid, or add tank ${identity} to the layout on the dealer’s Services tab.`,
    });
  }

  for (const item of stockUnchanged) {
    findings.push({
      severity: 'WARN',
      kind: 'STOCK_UNCHANGED_BUT_SOLD',
      code: 'STK',
      identity: item.identity,
      field: 'NET_QTY',
      rowIndex: item.rowIndex,
      message: `${item.product.labelEn} sold ${grouped(item.sold)} L but tank ${
        item.identity
      } still shows ${previousLabel}’s stock of ${grouped(item.stock)} L.`,
    });
  }

  // Last, and only when there is genuinely nothing to compare against. Every
  // rule above is keyed on yesterday, so on such a day they are all silent —
  // and silence looks exactly like a clean day unless something says otherwise.
  //
  // This finding's `message` is the ONE copy of that sentence. The screen prints
  // it from here rather than holding its own, because a second copy behind a
  // second trigger is how a screen comes to say "there is no previous day" on a
  // morning that has one, or stay quiet on a morning that has none.
  if (
    noPreviousReadings(
      nozzles.map((n) => n.identity),
      previousTot,
    )
  ) {
    findings.push({
      severity: 'WARN',
      kind: 'NO_PREVIOUS_DAY',
      message: NO_PREVIOUS_DAY_MESSAGE,
    });
  }

  return findings;
}

/** True when the day may be saved: nothing is blocking. */
export function irasDayCanSave(findings: readonly IrasDayFinding[]): boolean {
  return !(findings ?? []).some((f) => f.severity === 'BLOCK');
}

/**
 * True when the variation preview may be called.
 *
 * The preview runs the real engine, and the projection it runs on does not
 * sanitise: `parse.ts` drops any meter row whose reading is blank. So a
 * half-typed day comes back with a variation computed from two of six meters — a
 * confident, precise, wrong number, which is worse than none.
 *
 * Every BLOCK, not just the blank and the unreadable. Naming two of the six was
 * the hole: a MISSING_ROW and a DUPLICATE_IDENTITY produce neither, and those
 * two are the ones that change HOW MANY ROWS the engine sees, which is the
 * largest way a preview can lie. On one real fixture day the complete morning
 * previews a variation of 1,780 L against a permissible 236 L; delete the tank's
 * stock row and the same morning previews −4,120 L against 4.7 L, because
 * `openingStock` is the sum of the stock rows and there is now nothing to sum.
 * A duplicate row is the same lie pointing the other way — one tank counted
 * twice doubles that grade's stock.
 *
 * That makes this the same test as {@link irasDayCanSave} today, and it is
 * delegated to it rather than restated, so the two cannot drift into disagreeing
 * about whether a day is complete. They stay separately named because they answer
 * different questions and one of them may yet loosen.
 */
export function irasDayReadyForPreview(findings: readonly IrasDayFinding[]): boolean {
  return irasDayCanSave(findings);
}

/* ─────────────────── what this change set really overwrites ─────────────── */

/** One figure on record that this change set would leave holding something else. */
export interface IrasOverwrittenFigure {
  code: IrasReportCode;
  /** Nozzle number on a meter row, tank number on a stock or tanker row. */
  identity: string;
  field: string;
  /** What the server holds. Empty when the server holds nothing for this box. */
  from: string;
  /** What would be there after the save. Empty when the figure is rubbed out. */
  to: string;
}

/**
 * The figures already on the server that this change set genuinely moves.
 *
 * The question it answers is "is this commit a correction", and that decides
 * whether the save dialog opens its reason box blank and mandatory. It used to
 * be answered by COUNTING TOUCHES — how many cells the pending set held — and a
 * touch is not a change. Tap into nozzle 4, retype the reading that is already
 * there, and the pending set holds one cell; the dialog then said "Changing 1
 * figure that is already saved" over a figure standing exactly where it stood,
 * and demanded a written reason for it. There is nothing honest to write.
 *
 * So it compares values. A row this change set is adding has nothing on record
 * to overwrite and never appears here, however much is typed into it — which is
 * the same rule the dialog already applies to a tanker remembered at 09:00.
 *
 * Text, trimmed, rather than numbers — see {@link sameStoredValue} for why the
 * one module that compares meter readings as numbers compares this as text.
 *
 * A row whose `onRecord` the caller did not supply is skipped rather than
 * guessed at: this function says what it can prove is being overwritten, and a
 * caller that cannot say what the server holds must not have a correction
 * invented for it.
 */
export function irasFiguresOverwritten(
  rows: ReadonlyArray<IrasDayRowInForce>,
): IrasOverwrittenFigure[] {
  const out: IrasOverwrittenFigure[] = [];
  for (const entry of rows ?? []) {
    const onRecord = entry?.onRecord;
    if (!onRecord || !entry.code) continue;
    const row = entry.row ?? {};
    const identity =
      entry.code === 'TOT'
        ? trimmed(row.NOZZLE_NO) || trimmed(onRecord.NOZZLE_NO)
        : trimmed(row.TANK_NO) || trimmed(onRecord.TANK_NO);
    // Both sides' columns, because a change set can put a figure in a box the
    // server holds nothing for at all — a stock row saved without its product
    // dip, filled in on the next visit. That still writes to a row on record.
    for (const field of uniqueInOrder([...Object.keys(onRecord), ...Object.keys(row)])) {
      const from = trimmed(onRecord[field]);
      const to = trimmed(row[field]);
      if (sameStoredValue(from, to)) continue;
      out.push({ code: entry.code, identity, field, from, to });
    }
  }
  return out;
}

/**
 * "4 of 10 figures typed", counted in the operator's units rather than the
 * pending model's — a row with three fields on it is not three figures typed.
 *
 * `entered` and `needed` are the PLAN's figures and nothing else: the meter
 * readings and the stock and product dip this dealer's layout asks for. A tanker
 * is not one of them — a morning with no delivery is a complete morning — so
 * counting one into `needed` would tell an operator their finished day was one
 * figure short.
 *
 * But a tanker is still somebody's typing, and both guards over a half-typed
 * shift used to read `entered` alone. Type the litres of a delivery before any
 * meter reading, then close the tab or press reset, and the count was zero: no
 * prompt, no confirm, the litres gone. `anythingTyped` is the question those two
 * guards are really asking — has a person put a figure into this day — and it is
 * answered here so the unload guard and the reset button cannot answer it
 * differently.
 */
export function irasDayProgress(
  plan: IrasDayPlan,
  rows: ReadonlyArray<IrasDayRowInForce>,
): { entered: number; needed: number; tankersTyped: number; anythingTyped: boolean } {
  const totByNozzle = new Map<string, IrasRow>();
  const stkByTank = new Map<string, IrasRow>();
  let tankersTyped = 0;
  for (const entry of rows ?? []) {
    const row = entry?.row ?? {};
    if (entry?.code === 'TOT') {
      const identity = irasRowIdentity(row.NOZZLE_NO);
      if (identity && !totByNozzle.has(identity)) totByNozzle.set(identity, row);
    } else if (entry?.code === 'STK') {
      const identity = irasRowIdentity(row.TANK_NO);
      if (identity && !stkByTank.has(identity)) stkByTank.set(identity, row);
    } else if (entry?.code === 'REC' && TANKER_FIGURES.some((field) => trimmed(row[field]))) {
      tankersTyped += 1;
    }
  }

  const needed = plan?.figuresNeeded ?? [];
  let entered = 0;
  for (const figure of needed) {
    const row =
      figure.code === 'TOT' ? totByNozzle.get(figure.identity) : stkByTank.get(figure.identity);
    if (row && trimmed(row[figure.field])) entered += 1;
  }
  return {
    entered,
    needed: needed.length,
    tankersTyped,
    anythingTyped: entered > 0 || tankersTyped > 0,
  };
}

/**
 * The line at the top of the sheet that says how much of the day is on record.
 *
 * Here rather than on the screen because it is the one place the day is counted
 * in words, and a screen that words it itself gets it wrong in the way screens
 * do: an outlet with one nozzle and one tank was being told it needed "1 meter
 * readings" and "the stock and dip for 1 tanks". Wording it once also settles the
 * names — a meter reading, a stock, a product dip — so the readout, the findings
 * and the save dialog cannot each call the same row something different.
 *
 * Three sentences, by how much is typed:
 *   nothing   "Nothing typed yet. This day needs 10 figures: 6 meter readings,
 *              and the stock and product dip for 2 tanks."
 *   partly    "4 of 10 figures typed."
 *   all in    "All 10 figures typed."
 *
 * `entered` is `irasDayProgress(...).entered`; passing it in rather than
 * recomputing it keeps one count of a typed figure.
 */
export function irasDayFiguresSentence(plan: IrasDayPlan, entered: number): string {
  const needed = plan?.figuresNeeded ?? [];
  const total = needed.length;
  if (total === 0) {
    return 'This dealer’s report layout does not name any nozzles or tanks, so there is nothing to type here.';
  }

  const typed = Math.max(0, Math.min(Number.isFinite(entered) ? Math.trunc(entered) : 0, total));
  if (typed >= total) {
    return total === 1 ? 'The one figure this day needs is typed.' : `All ${total} figures typed.`;
  }
  if (typed > 0) return `${typed} of ${total} figures typed.`;

  const readings = needed.filter((f) => f.code === 'TOT').length;
  // Tanks, not stock figures: a tank is asked for two figures and the operator
  // reads one tank, so "2 tanks" is the honest unit even though it is 4 figures.
  const tanks = new Set(needed.filter((f) => f.code === 'STK').map((f) => f.identity)).size;
  const parts: string[] = [];
  if (readings > 0) {
    parts.push(`${readings} meter ${readings === 1 ? 'reading' : 'readings'}`);
  }
  if (tanks > 0) {
    parts.push(`the stock and product dip for ${tanks} ${tanks === 1 ? 'tank' : 'tanks'}`);
  }
  const breakdown = parts.length > 0 ? `: ${parts.join(', and ')}` : '';
  return `Nothing typed yet. This day needs ${total} ${
    total === 1 ? 'figure' : 'figures'
  }${breakdown}.`;
}

/**
 * `2026-08-29` → `29 Aug`, or `29 August`.
 *
 * Written off the string rather than through `Date`, deliberately. A business
 * date is an IST calendar day, and putting it through a Date on a machine that
 * is not in IST moves it — which would caption a carried water dip with the
 * wrong day, on a screen whose entire job is to say where a figure came from.
 * Returns `''` for anything that is not a `YYYY-MM-DD`, so a caller can fall
 * back rather than print a mangled date.
 */
export function irasDayDateLabel(businessDate: string, style: 'short' | 'long' = 'short'): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(businessDate ?? '').trim());
  if (!match) return '';
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!(month >= 1 && month <= 12) || !(day >= 1 && day <= 31)) return '';
  const name = (style === 'long' ? MONTHS_LONG : MONTHS_SHORT)[month - 1]!;
  return `${day} ${name}`;
}

/* ─────────────── what each box is called, once ────────────── */

/**
 * The columns every one of the three reports carries, named once so a change of
 * wording cannot land on the stock report and miss the receipt one.
 */
const SHARED_FIELD_LABELS: Record<string, string> = {
  TANK_NO: 'Tank',
  PRODCODE: 'Product code',
  TRAN_NAME: 'Portal transaction name',
  UOM: 'Unit of measure',
  XFR_DATETIME: 'Sent by the portal at',
  SDATE_UPDATED: 'Portal last changed it at',
};

/**
 * The plain name of every column the two editor surfaces can put in front of a
 * person, per report, in the operator's words.
 *
 * Per report rather than one flat table because one column name is two different
 * things. `TANK_NO` on a stock row IS the tank; on a meter row it is only the
 * tank that nozzle draws from, which moves no figure — and a screen that calls
 * both of them "Tank" invites somebody to fix a reading by editing the wrong one.
 *
 * One name per thing, and the names are the shared ruleset's: a meter row's
 * figure is the reading this morning, a stock row's two figures are the stock and
 * the product dip. Every sentence on the shift sheet, in the findings, and in
 * the save dialog uses those and no synonym.
 */
const FIELD_LABELS: Record<IrasReportCode, Record<string, string>> = {
  TOT: {
    NOZZLE_NO: 'Nozzle',
    TOT_READING: 'Reading this morning',
    TANK_NO: 'Tank this nozzle draws from',
    PUMP_NO: 'Pump',
    PARENT_DU_NO: 'Dispensing unit',
    NOZZLE_STATUS: 'Nozzle status',
    SHIFT_DATE: 'Shift date',
    SHIFT_TIME: 'Shift time',
    SHIFT_TYPE: 'Shift type',
    FCC_TXN_ID: 'Portal reading id',
    UPDATED_BY: 'Changed by',
    UPDATE_FLAG: 'Changed flag',
    DATE_CREATED: 'Created at',
    DATE_UPDATED: 'Changed at',
  },
  STK: {
    NET_QTY: 'Stock (litres)',
    PRODUCT_DIP: 'Product dip',
    WATER_DIP: 'Water dip',
    PRODUCT_QTY: 'Product quantity (litres)',
    WATER_QTY: 'Water quantity (litres)',
    TANK_STATUS: 'Tank status',
    STK_TXN_ID: 'Portal stock id',
    STK_DATE: 'Stock date',
    STK_TIME: 'Stock time',
    DIP_UOM: 'Dip unit of measure',
    TEMP: 'Temperature',
    DENSITY: 'Density',
    DENSITY_15C: 'Density at 15°C',
  },
  REC: {
    INVOICE_QUANTITY: 'Invoiced quantity (litres)',
    NET_QTY_DECANTED: 'Litres decanted',
    INVOICE_NUMBER: 'Invoice number',
    INVOICE_DATE: 'Invoice date',
    TRUCK_NUMBER: 'Truck number',
    SUPPLY_POINT: 'Supply point',
    REC_TXN_ID: 'Portal delivery id',
    DECANT_START_DATE: 'Decanting started on',
    DECANT_START_TIME: 'Decanting started at',
    DECANT_END_DATE: 'Decanting finished on',
    DECANT_END_TIME: 'Decanting finished at',
    PROD_DIP_START: 'Product dip before decanting',
    PROD_DIP_END: 'Product dip after decanting',
    PROD_QTY_START: 'Stock before decanting (litres)',
    PROD_QTY_END: 'Stock after decanting (litres)',
    NET_SALE_DURING_DECANT: 'Sold while decanting (litres)',
    SHORTAGE: 'Shortage (litres)',
    NO_OF_CHAMBERS: 'Number of chambers',
    QTY_CHAMBER1: 'Chamber 1 (litres)',
    QTY_CHAMBER2: 'Chamber 2 (litres)',
    QTY_CHAMBER3: 'Chamber 3 (litres)',
    QTY_CHAMBER4: 'Chamber 4 (litres)',
    QTY_CHAMBER5: 'Chamber 5 (litres)',
    QTY_CHAMBER6: 'Chamber 6 (litres)',
    PRE_DENSITY: 'Density before decanting',
    POST_DENSITY: 'Density after decanting',
    SERIAL_NUMBER_OF_SAFETY_CHECK_LIST: 'Safety checklist serial number',
    RECEIPT_DATAENTRY_DATE: 'Entered on the portal on',
    RECEIPT_DATAENTRY_TIME: 'Entered on the portal at',
    RECEIPT_DATAENTRY_TYPE: 'How it was entered',
  },
};

/**
 * What to call one field where a person has to read it.
 *
 * It lives in `@dk/shared` because three surfaces show the same box and they had
 * two answers between them. The shift sheet held its own table and labelled the
 * meter box "Reading this morning"; the save dialog resolved a name out of
 * `snapshot.datasets[code].columns`, and a hand-typed day has no datasets at all
 * — `createManualSnapshotDay` writes `datasets: []`. So the one surface built for
 * somebody who is not technical printed the database column back at them:
 * "TOT · Nozzle 4 · TOT_READING · 452592 → 452692", and "Show every figure" was
 * worse. A name that only exists inside a React component cannot be reused by the
 * dialog that has to agree with it, and nothing in `mdg-admin` can test it.
 *
 * A collected day still has the portal's own header on its columns, and that
 * stays the authority there — the eight portal dealers' correction job must read
 * exactly as it does today. This is the answer for a day that has no columns to
 * ask, and the fallback for a column the portal never sent a header for.
 *
 * A column this table does not name is made readable rather than left raw:
 * `SOME_NEW_COLUMN` reads as "Some new column". The portal adds columns without
 * warning, and an operator should never be shown a database name, not even for a
 * column nothing calculates with.
 */
export function irasFieldLabel(code: IrasReportCode, field: string): string {
  const name = String(field ?? '').trim();
  if (!name) return '';
  // The grid marks a whole-row change — excluded, restored, reverted — with this
  // instead of a column. It is not a box anybody types in, and calling it "*"
  // would be the very thing this function exists to stop.
  if (name === IRAS_ROW_LEVEL_FIELD) return 'the whole row';
  return FIELD_LABELS[code]?.[name] ?? SHARED_FIELD_LABELS[name] ?? humanColumn(name);
}

/* ─────────────────────────────── internals ─────────────────────────────── */

const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * The boxes a person actually fills in on a tanker card: the invoiced quantity,
 * the litres decanted, and the invoice number.
 *
 * Named here rather than read off "any column with something in it", because a
 * tanker row is not born empty. Tapping "A tanker came" writes the tank number,
 * the product code and the decanting stamp into it before the operator has typed
 * a character, and a work-in-progress test that counted those would prompt about
 * unsaved work on a card nobody has touched. Prompting somebody who has typed
 * nothing is how they learn to dismiss the prompt that matters.
 */
const TANKER_FIGURES: readonly string[] = [
  'INVOICE_QUANTITY',
  'NET_QTY_DECANTED',
  'INVOICE_NUMBER',
];

/**
 * Whether two spellings of one cell are the same thing ON RECORD.
 *
 * Trimmed text, and deliberately not numbers, though everything else in this
 * module compares a reading as a number. The two are different questions. "Did
 * this nozzle sell anything" is about a meter, where `452180.0` and `452180` are
 * one reading and the report reads them as one. This question is "would saving
 * this change what the server holds", and there `0012345` and `12345` are the
 * same number but two different invoice numbers. A numeric test here would tell
 * an operator that a figure they really are rewriting is untouched, which is the
 * opposite of the fault it was written to fix.
 */
function sameStoredValue(a: unknown, b: unknown): boolean {
  return trimmed(a) === trimmed(b);
}

/**
 * Whether the meter reading on this row is one the change set in hand puts
 * there.
 *
 * True when the caller said nothing about what the server holds (`undefined`),
 * so a caller that does not supply it reads exactly as this module read before
 * the field existed; true when the change set is adding the row (`null`); and
 * true when the reading itself differs from the one on record.
 *
 * The reading and no other column, which is the whole reason `onRecord` is a row
 * rather than a flag: correcting the tank a nozzle draws from does not re-open
 * the question of whether that nozzle ran.
 */
function readingIsFreshWork(entry: { row: IrasRow; onRecord?: IrasRow | null }): boolean {
  if (!entry.onRecord) return true;
  return !sameStoredValue(entry.row?.TOT_READING, entry.onRecord.TOT_READING);
}

function trimmed(value: unknown): string {
  return String(value ?? '').trim();
}

/**
 * A column name nobody wrote a plain name for, made readable.
 *
 * `DATE_UPDATED` → "Date updated", `QTY_CHAMBER1` → "Qty chamber 1". Not a
 * translation and not pretending to be one — it is the last line of defence for
 * a column the portal started sending after this table was written, and its only
 * job is that a raw database name never reaches an operator's eyes.
 */
function humanColumn(field: string): string {
  const words = field
    .split('_')
    .filter(Boolean)
    .map((word) => word.replace(/(\d+)$/, ' $1').toLowerCase())
    .join(' ')
    .trim();
  if (!words) return field;
  return sentenceStart(words);
}

function firstNonBlank(values: readonly string[]): string {
  for (const value of values) {
    const v = trimmed(value);
    if (v) return v;
  }
  return '';
}

/** A cell as a number, or null when it is blank or not a number. */
function asNumber(value: unknown): number | null {
  const raw = trimmed(value);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Which tank a nozzle draws from.
 *
 * A hand-added meter row on a `MANUAL` day is refused without `TANK_NO`, and the
 * config does not say which of a grade's tanks a nozzle is plumbed to — only
 * that the grade lives in this set of tanks. Where the grade has one tank the
 * answer is certain, which is 16E's whole forecourt. Where it has more, the
 * first is used, and that is safe: the report matches a nozzle by its number and
 * decides a row's product from the tank's own stock row, so no figure moves. The
 * one reader that can tell is the warning that names the nozzles drawing on a
 * tank reporting 0 L — it would name the right grade's nozzles against the wrong
 * tank of that grade, in a sentence on a day that is already wrong.
 */
function tankForNozzleOf(product: IrasDayPlanProduct): string {
  return firstNonBlank((product.tankNos ?? []).map((t) => String(t)));
}

/**
 * The nozzles this dealer's report layout names, deduped, in the order the
 * config lists them.
 *
 * One walk, because three callers ask the same question and a nozzle listed
 * under two grades is one nozzle in all three of them. The engine matches a
 * nozzle by its number, so a second entry is not a second pump — it is the same
 * pump named twice, and a caller that kept both would block a clean day on a
 * DUPLICATE_IDENTITY the forecourt does not have.
 *
 * Two spellings of the number come back, and both are needed. `identity` is the
 * form every comparison on this day uses; `configNo` is the number as the config
 * itself lists it, because {@link irasMeterScale} has to look its key up on that
 * exact spelling — the engine does, and a normalised key would find a factor the
 * report will not.
 */
function configuredNozzlesOf(
  products: readonly IrasDayPlanProduct[],
): Array<{ identity: string; configNo: number; product: IrasDayPlanProduct }> {
  const out: Array<{ identity: string; configNo: number; product: IrasDayPlanProduct }> = [];
  const seen = new Set<string>();
  for (const product of products ?? []) {
    for (const nozzleNo of product.nozzleNos ?? []) {
      const identity = irasRowIdentity(nozzleNo);
      if (!identity || seen.has(identity)) continue;
      seen.add(identity);
      out.push({ identity, configNo: nozzleNo, product });
    }
  }
  return out;
}

/**
 * The same for tanks, where a duplicate bites harder: the report SUMS a
 * product's tanks, so one tank counted twice doubles that grade's opening stock.
 */
function configuredTanksOf(
  products: readonly IrasDayPlanProduct[],
): Array<{ identity: string; product: IrasDayPlanProduct }> {
  const out: Array<{ identity: string; product: IrasDayPlanProduct }> = [];
  const seen = new Set<string>();
  for (const product of products ?? []) {
    for (const tankNo of product.tankNos ?? []) {
      const identity = irasRowIdentity(tankNo);
      if (!identity || seen.has(identity)) continue;
      seen.add(identity);
      out.push({ identity, product });
    }
  }
  return out;
}

function usableScale(scale: unknown): number {
  return typeof scale === 'number' && Number.isFinite(scale) && scale > 0 ? scale : 1;
}

/**
 * One entry out of a map keyed by nozzle or tank number.
 *
 * The exact key first, then {@link irasRowIdentity} on both sides, because a missed
 * lookup here does not fail loudly: it silently disarms every yesterday-keyed
 * check on that nozzle, which is the entire value of this module.
 */
function byIdentity<T>(map: Record<string, T> | undefined, identity: string): T | undefined {
  if (!map) return undefined;
  const exact = map[identity];
  if (exact !== undefined) return exact;
  const wanted = irasRowIdentity(identity);
  if (!wanted) return undefined;
  for (const [key, value] of Object.entries(map)) {
    if (irasRowIdentity(key) === wanted) return value;
  }
  return undefined;
}

/**
 * True when the previous day leaves this one nothing to check against.
 *
 * Read off the METER readings and nothing else, because they are what every
 * yesterday-keyed rule in this module needs: litres sold, the backwards block,
 * the unchanged block and the stock-did-not-move warning all subtract yesterday's
 * reading from today's. A previous day holding stock rows but no readings is
 * still a day this one cannot show a sale for.
 *
 * One implementation, called by both `irasDayPlan` (for `previousDayEmpty`) and
 * `irasDayFindings` (for `NO_PREVIOUS_DAY`), so the flag and the sentence cannot
 * disagree. An outlet with no configured nozzles is not "no previous day" — it
 * is a dealer with no report layout, which is a different sentence on a
 * different screen.
 */
function noPreviousReadings(
  nozzleIdentities: readonly string[],
  previousTot: Record<string, string>,
): boolean {
  if (nozzleIdentities.length === 0) return false;
  return nozzleIdentities.every((identity) => asNumber(byIdentity(previousTot, identity)) === null);
}

function indexRow<T>(index: Map<string, T[]>, identity: string, entry: T): void {
  if (!identity) return;
  const found = index.get(identity);
  if (found) found.push(entry);
  else index.set(identity, [entry]);
}

function collectDropped(
  previousTot: Record<string, string>,
  previousStk: Record<string, IrasPreviousStkRow>,
  configuredNozzles: ReadonlySet<string>,
  configuredTanks: ReadonlySet<string>,
  previousDate: string,
): IrasDayPlan['droppedFromPreviousDay'] {
  const day = irasDayDateLabel(previousDate, 'long') || 'the previous day';
  const out: IrasDayPlan['droppedFromPreviousDay'] = [];

  for (const identity of sortedIdentities(Object.keys(previousTot))) {
    if (configuredNozzles.has(identity)) continue;
    if (!trimmed(byIdentity(previousTot, identity))) continue;
    out.push({
      code: 'TOT',
      identity,
      message: `Nozzle ${identity} had a reading on ${day} but is not in this dealer’s report layout, so it was not laid out here. Its sales would not reach the report anyway.`,
    });
  }

  for (const identity of sortedIdentities(Object.keys(previousStk))) {
    if (configuredTanks.has(identity)) continue;
    const row = byIdentity(previousStk, identity);
    if (!trimmed(row?.netQty) && !trimmed(row?.productDip) && !trimmed(row?.waterDip)) continue;
    out.push({
      code: 'STK',
      identity,
      message: `Tank ${identity} had a stock row on ${day} but is not in this dealer’s report layout, so it was not laid out here. Its stock would not reach the report anyway.`,
    });
  }

  return out;
}

/**
 * The identities a map is keyed by, normalised, deduped and in a human order.
 *
 * Normalised first so `02` and `2` collapse to the one nozzle they are, and
 * sorted numerically where it can be, so tank 10 sorts after tank 9 rather than
 * before it.
 */
function sortedIdentities(keys: readonly string[]): string[] {
  return uniqueInOrder(
    keys
      .map((k) => irasRowIdentity(k))
      .filter((k) => k !== '')
      .sort((a, b) => {
        const na = Number(a);
        const nb = Number(b);
        if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
        return a.localeCompare(b);
      }),
  );
}

/** A figure the way this platform prints figures: Indian grouping, no units. */
function grouped(value: number, maximumFractionDigits = 2): string {
  return value.toLocaleString('en-IN', { maximumFractionDigits });
}

function uniqueInOrder(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function joinList(parts: readonly string[]): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function nozzleList(identities: readonly string[]): string {
  const unique = uniqueInOrder(identities);
  if (unique.length === 0) return 'the reading';
  return unique.length === 1 ? `nozzle ${unique[0]}` : `nozzles ${joinList(unique)}`;
}

function sentenceStart(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
