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
 * This module carries the SHAPE of that day forward, and it carries yesterday's
 * MEASUREMENTS into the boxes with a block sitting on every one of them until
 * somebody changes it. The distinction is the whole design and it is not a
 * matter of taste:
 *
 *   - Which nozzles and which tanks the outlet has, which grade each holds, and
 *     the three identity columns a hand-added row is refused without — those are
 *     plumbing. They were true yesterday and they are true today.
 *   - A totaliser is a lifetime odometer, and yesterday's reading left where it
 *     stands reports ZERO litres sold on that nozzle. It also drops that
 *     nozzle's test draw, because the engine charges testing only to a nozzle
 *     whose reading moved: the variation then swings negative by the missing
 *     litres and the dealer is advised to draw fuel back into a tank that is not
 *     short.
 *
 *     That hazard is not a reason to leave the box empty, and this module used
 *     to. On a totaliser the operator is changing the last few digits, so having
 *     49,059 in the box to edit is fewer keystrokes on a phone than reading
 *     49,059 off a caption and typing 49,412 from nothing. So the reading, the
 *     stock and the product dip are all pre-filled with the previous day's
 *     figure — and a pre-filled figure NOBODY HAS TOUCHED refuses to save. That
 *     block is the whole safety of the pre-fill: a day where every box still
 *     holds yesterday's number is a day nobody has done, and it must not be
 *     savable.
 *
 *     Two different situations, two different sentences, because they are two
 *     different problems with two different fixes. `CARRIED_UNTOUCHED` is "you
 *     have not done this box yet" — the system put the figure there — and it is
 *     said quietly, in the carried style, because a freshly opened day would
 *     otherwise show ten red alarms before anybody had done anything wrong. It
 *     BLOCKS, and typing the figure is what clears it. `METER_UNCHANGED` is "the
 *     number you have typed means zero litres sold on this nozzle", and it only
 *     WARNS. Once a person has typed the figure the keystroke IS the deliberate
 *     act, and a pump that genuinely did not turn is a real morning that has to
 *     be savable. Only ONE of the two is ever raised on one box, and on an
 *     untouched box it is the carried one: "you have not done this yet" comes
 *     before "what you have typed means nothing was sold".
 *
 *     There used to be a third thing here — a confirmed "This pump did not run
 *     today" on the row's three-dots menu, the one way past either block. It is
 *     gone. It restored no figure: `compute.ts` charges a nozzle its 5 litre
 *     test draw purely on whether the meter moved, so the statement moved
 *     nothing on any report. And the record it wrote into the audit row was read
 *     back by nothing. All it bought was a confirm dialog between an operator
 *     and a figure they had already typed on purpose.
 *   - The water dip is the one carried measurement that does NOT block, because
 *     it is the one the engine never calculates with: every read of it is
 *     display. A stale water dip can make a printed line stale; it cannot move a
 *     figure.
 *
 * None of that leaves the browser. The sheet's record of which boxes it filled
 * in and nobody has touched lives in a React component and is never sent, so on
 * the wire a whole morning of yesterday's figures is indistinguishable from a
 * morning somebody typed — where a blank box used to be refused by the server
 * outright. {@link irasUntouchedMorning} is the net underneath that, asked where
 * a bug in that component cannot reach it: a hand-typed day in which EVERY
 * figure the commit carries — every meter reading, every stock, every product
 * dip — is still the previous day's is a morning nobody did, and the commit
 * itself refuses it. One dead pump among five live ones passes, because one
 * moved meter is a person at work. It needs no product layout and no browser.
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
  /**
   * The previous day's figure for this box — the value it was pre-filled with —
   * or `''` when the previous day has none.
   *
   * Here so that {@link irasDayProgress} can tell a figure a PERSON supplied
   * from the one the system carried in, using the very same test the block runs
   * on. Counting a carried figure as typed would announce a freshly opened day
   * as "All 10 figures typed" before anybody had touched it, and that is the
   * single largest way the pre-fill can go wrong.
   */
  previous: string;
}

export interface IrasPlannedRow {
  code: IrasPlannedRowCode;
  /** `TOT:4` | `STK:3` — stable across a re-plan, so the sheet can key on it. */
  planKey: string;
  /** The DSR product this row belongs to, e.g. `HSD`. */
  productKey: string;
  /**
   * The row itself: the identity columns, and every measurement the previous day
   * has a figure for — the reading, the stock, the product dip and the water
   * dip. A box the previous day has nothing for is left out, so a gap still
   * reads as a gap.
   */
  row: IrasRow;
  /**
   * Figures the system put in the row, so the field can say it did — and so the
   * ruleset can tell them from figures a person typed.
   *
   * This is the seam the whole pre-fill turns on. The sheet holds this list per
   * row and strikes a field off it the moment somebody edits that box; what is
   * left is what nobody has touched. It is handed back on
   * {@link IrasDayRowInForce.carried}, and `CARRIED_UNTOUCHED` is raised on
   * exactly those fields — see {@link irasCarriedUntouched}.
   */
  carried: Array<{ field: string; from: string }>;
  /**
   * Fields a person must supply before this day can be saved. Unchanged by the
   * pre-fill, and now enforced by it: a carried figure does not answer an ask,
   * it blocks until somebody changes it.
   */
  asks: string[];
  /**
   * Yesterday's figure for each asked field — which is the figure `row` was
   * pre-filled with, for every field that had one.
   *
   * Kept beside the row rather than read back off it, because the two answer
   * different questions once the operator starts typing: `row.TOT_READING` is
   * what is in the box now, and this is what was carried into it, which the
   * sheet still prints as the figure to check against.
   */
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
 * printed on the report beside it.
 *
 * Both are pre-filled and neither may be LEFT carried: a carried stock is a day
 * of sales that never happened, and a carried dip is a witness agreeing with a
 * figure it never saw. That is why `CARRIED_UNTOUCHED` is raised on these two
 * and not on the water dip beside them — the sheet asks for these, so a carried
 * one is work outstanding, and the water dip is not asked for at all.
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

      figuresNeeded.push({
        code: 'TOT',
        identity,
        field: 'TOT_READING',
        previous: previousReading,
      });
      if (takenNozzles.has(identity)) continue;

      const row: IrasRow = { NOZZLE_NO: identity };
      if (tankForNozzle) row.TANK_NO = tankForNozzle;
      if (prodCode) row.PRODCODE = prodCode;

      // Only when there is one, here and on every carried figure below. A box
      // the previous day has nothing for is left empty, because a gap has to
      // read as a gap — filling it with nothing and calling it carried would
      // say the system knew something it does not.
      const carried: IrasPlannedRow['carried'] = [];
      if (previousReading) {
        row.TOT_READING = previousReading;
        carried.push({ field: 'TOT_READING', from: carriedFrom });
      }

      rows.push({
        code: 'TOT',
        planKey: `TOT:${identity}`,
        productKey: product.key,
        row,
        carried,
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
        { code: 'STK', identity, field: 'NET_QTY', previous: previousNetQty },
        { code: 'STK', identity, field: 'PRODUCT_DIP', previous: previousProductDip },
      );
      if (takenTanks.has(identity)) continue;

      const row: IrasRow = { TANK_NO: identity };
      if (prodCode) row.PRODCODE = prodCode;

      // In the order the sheet draws them: the two figures the day is owed
      // first, then the water dip, which is carried and is not owed.
      const carried: IrasPlannedRow['carried'] = [];
      if (previousNetQty) {
        row.NET_QTY = previousNetQty;
        carried.push({ field: 'NET_QTY', from: carriedFrom });
      }
      if (previousProductDip) {
        row.PRODUCT_DIP = previousProductDip;
        carried.push({ field: 'PRODUCT_DIP', from: carriedFrom });
      }
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
  /**
   * The fields on this row that the SYSTEM put there when the day was laid out
   * and that nobody has touched since — {@link IrasPlannedRow.carried}, with
   * every field the operator has since edited struck off.
   *
   * A separate question from `onRecord`, and it has to be, which is why it is a
   * second field rather than something derived from the first. `onRecord` is
   * about what the SERVER holds; this is about who put the figure on the screen.
   * On a freshly opened day there is no server row at all — every one of these
   * rows is being added — so `onRecord` cannot tell a figure the plan carried in
   * from a figure the operator typed, and those are the two situations the
   * quiet block and the red one have to be told apart by.
   *
   * The sheet owns this list because the sheet is where a keystroke happens. It
   * is seeded from the plan, kept in the pending set beside the rows, and a
   * field comes off it the moment that box is edited. Left off entirely — the
   * backend's after-save pass, or any caller that is not the sheet — nothing is
   * carried, no `CARRIED_UNTOUCHED` is raised, and every rule reads exactly as
   * it read before the pre-fill existed.
   */
  carried?: readonly string[];
  /**
   * The boxes on this row whose figure was READ OFF THE OUTLET'S SLIP and
   * accepted by a named person, rather than typed digit by digit — each one
   * holding THE FIGURE THE SLIP SUPPLIED, so the claim can be checked rather
   * than believed.
   *
   * A third answer to the question the other two fields already ask about a box
   * — who put this figure here — and it exists because the first two could only
   * say "the system carried it in" or "somebody typed it", and a slip figure is
   * neither. Counting one as typed would put a sentence on screen that is not
   * true: "All 10 figures typed" on a morning where six of them came off a
   * photograph. That is the whole reason this field exists. It is honesty, and
   * it is not a block.
   *
   * The value is carried WITH the mark for the same reason `carried` is checked
   * against the previous day's figure rather than trusted: a mark that cannot
   * falsify itself is a mark that goes on claiming after it has stopped being
   * true. A bare list of field names survived the operator retyping the box —
   * on the Full grid, on a second screen, anywhere the one surface that strikes
   * the list is not the surface taking the keystroke — and the readout and the
   * audit reason then said the slip supplied a figure the operator had overruled.
   * With the figure here, {@link irasFigureReadOffSlip} answers the question by
   * comparing, every rule agrees no matter which surface did the typing, and no
   * second place to strike the mark is ever needed.
   *
   * It does NOT block the save, and that is a decision rather than an omission.
   * The figure was accepted by a named admin on a screen showing the slip, the
   * transcript and the arithmetic; a second confirmation on the sheet, where
   * none of that is visible, would teach an operator to dismiss blocks — and
   * `CARRIED_UNTOUCHED` is only worth anything for as long as a block still
   * means something.
   *
   * ONLY `TOT_READING` on a `TOT` row can ever be in this list. The slip has no
   * tanks and no tankers on it, so that is the entire blast radius on the sheet.
   *
   * Optional and default-off, like `carried` beside it, and for a harder reason:
   * the eight dealers whose figures the portal collects must read EXACTLY as
   * they read today. A caller that passes no map — the backend's after-save
   * pass, every portal day, every existing test — gets the count, the sentence
   * and every finding it got before this field existed.
   */
  read?: Readonly<Record<string, IrasFigureReadOffSlip>>;
}

/**
 * How one figure read off the slip earned its place in the box.
 *
 * `PROVED` — the rupee counter printed on the same block turned the money into
 * the same litres the meter says, so the dealer's own paper proved the reading
 * before anybody pressed anything. `CHECKED` — nothing on the slip could prove
 * it, so a named person read it against the paper and accepted it on its own
 * card. Both were read off the slip; only one of them was checked by arithmetic,
 * and the save note says which.
 */
export type IrasReadKind = 'PROVED' | 'CHECKED';

/** One box a slip filled: the figure it supplied, and how that figure was earned. */
export interface IrasFigureReadOffSlip {
  /**
   * The digits the slip supplied, exactly as they were written into the box.
   *
   * This is what makes the mark checkable. The box holding something else means
   * somebody typed over it, whoever they are and whichever screen they did it
   * on, and the mark is then simply not true any more.
   */
  value: string;
  /** Whether the slip's own money proved it, or a person checked it by eye. */
  kind?: IrasReadKind;
}

/**
 * Whether one box is still holding the figure the SLIP put in it.
 *
 * The one implementation of "this figure came off the outlet's slip", asked the
 * same way {@link irasCarriedUntouched} asks its own question: by comparing, not
 * by trusting a list. Three rules read this — the count in
 * {@link irasDayProgress}, the carried block, and which sentence
 * `METER_UNCHANGED` prints — and a second hand-written copy of the test is how a
 * screen comes to tint a box as read while the audit reason calls it typed.
 *
 * Two things have to hold:
 *
 *   - the row lists this field as filled from the slip, with the figure the slip
 *     supplied. Only the surface that accepted the reading can say that;
 *   - the box still reads exactly that figure. A box holding anything else —
 *     retyped, corrected, cleared — is a person's work, and it says so here even
 *     if nobody remembered to strike the mark. That is the point: the honest
 *     answer must not depend on which screen took the keystroke.
 */
export function irasFigureReadOffSlip(
  entry: Pick<IrasDayRowInForce, 'row' | 'read'> | undefined,
  field: string,
): boolean {
  if (!entry || !field) return false;
  const mark = entry.read?.[field];
  if (!mark || typeof mark !== 'object') return false;
  const fromTheSlip = trimmed(mark.value);
  if (!fromTheSlip) return false;
  return sameStoredValue(entry.row?.[field], fromTheSlip);
}

/**
 * Whether one box is still holding the figure the system carried into it.
 *
 * The one implementation of "nobody has done this box yet". The block in
 * {@link irasDayFindings} and the count in {@link irasDayProgress} are the same
 * question asked twice — "is this figure a person's work" — and a second
 * hand-written copy of the test is how a screen comes to block on a box it is
 * also counting as typed.
 *
 * Three things have to hold, and each closes a different way of being wrong:
 *
 *   - the sheet lists the field as carried and untouched. This is the primary
 *     answer, and only the sheet can give it: a keystroke is the only evidence
 *     that a person has been in the box.
 *   - the box still reads exactly what the previous day read. Belt and braces
 *     over a `carried` list that has gone stale — a figure that differs from the
 *     one carried in was typed by somebody, whatever the list says, and it then
 *     falls through to the ordinary rules.
 *   - the figure is not one the server already holds. A day saved at 07:00 and
 *     reopened at 09:00 was answered for on the visit that saved it; re-blocking
 *     it is the exact trap the unmoved-meter warning beside it had to be scoped
 *     out of too, and 16E's two dead pumps live in it every morning.
 *
 * Exported so the sheet styles a box off the same answer that blocks it, and
 * meant for the asked figures — the reading, the stock and the product dip. The
 * water dip is carried too and is never asked for, so nothing calls this with
 * it.
 */
export function irasCarriedUntouched(
  entry: Pick<IrasDayRowInForce, 'row' | 'onRecord' | 'carried' | 'read'> | undefined,
  field: string,
  previousValue: unknown,
): boolean {
  if (!entry || !field) return false;
  // A figure read off the slip is not one the system carried in: a named person
  // accepted it against the paper. Asked through the one function that answers
  // it, so a box the operator has since typed over stops counting as read here
  // at the same instant it stops counting as read everywhere else — and then
  // falls through to the ordinary rules below, which is right.
  if (irasFigureReadOffSlip(entry, field)) return false;
  if (!(entry.carried ?? []).includes(field)) return false;
  const carriedIn = trimmed(previousValue);
  if (!carriedIn) return false;
  if (!sameStoredValue(entry.row?.[field], carriedIn)) return false;
  return figureIsFreshWork(entry, field);
}

/* ──────── a whole morning that is still yesterday’s, on the wire ──────── */

/** One figure a change set is putting on the day. */
export interface IrasFigureInHand {
  /** `TOT` for a meter reading, `STK` for a stock figure. */
  code: IrasPlannedRowCode;
  /** The nozzle number on a meter reading, the tank number on a stock figure. */
  identity: unknown;
  /** The column: `TOT_READING`, `NET_QTY` or `PRODUCT_DIP`. */
  field: string;
  /** The figure this change set is putting in that box, exactly as it was typed. */
  value: unknown;
}

/** One box a change set is filling with the figure the previous day already had. */
export interface IrasFigureStillYesterdays {
  code: IrasPlannedRowCode;
  /** The nozzle or tank, normalised the way the report reads it. */
  identity: string;
  field: string;
  /** The figure in hand, exactly as it was typed. */
  value: string;
  /** The previous day’s own figure it matches. */
  previous: string;
}

/** A change set that carries a morning and does not move one figure of it. */
export interface IrasUntouchedMorning {
  /**
   * Every figure it carries, in the order handed in, each with the previous
   * day’s own beside it — so the refusal can read the operator their own numbers
   * back rather than quote a rule at them.
   */
  figures: IrasFigureStillYesterdays[];
  /** How many of them are meter readings. The rest are stock figures. */
  meterReadings: number;
  /** The tanks among them, deduped, so a sentence can say “2 tanks”. */
  tanks: string[];
}

/**
 * Whether this change set is a morning nobody has actually done.
 *
 * The server’s own refusal, and the only thing left standing between an
 * untouched day and the database. The shift sheet opens every box with the
 * previous day’s figure already in it — fewer keystrokes on a phone — and
 * refuses to save while a box is still holding what the system put there. But
 * that refusal lives in a React component: the sheet’s record of which boxes it
 * filled in is never sent, so on the wire a whole morning of yesterday’s figures
 * looks exactly like a morning somebody typed. Before the pre-fill those boxes
 * arrived EMPTY and `requiredForAddedRow` threw them out, a refusal that really
 * did fire in production. This puts it back somewhere a stale tab, a replayed
 * request or a bug in our own screen cannot reach.
 *
 * ONE question, asked of the whole change set rather than of each figure in it,
 * and that is the whole difference between this rule and the one it replaces.
 * The old rule refused ANY single meter reading equal to the previous day’s
 * unless somebody had tapped “This pump did not run today” on that row. With
 * that statement gone, the old rule would refuse every commit 16E ever makes:
 * nozzles 5 and 6 have not turned since the inspection and stand at 13,205 and
 * 2,638 every morning of the year. So the question is now the one the net was
 * really written for, and the only one the server can answer on its own — is
 * EVERY figure this commit carries still the previous day’s? Six readings and
 * two tanks’ worth of stock, not one of them moved, is a morning nobody did.
 * Six readings of which four moved is a person at work with two dead pumps, and
 * it saves.
 *
 * “Every figure” means every figure a morning is ASKED for and this change set
 * is putting somewhere: `TOT_READING` on a meter row, `NET_QTY` and
 * `PRODUCT_DIP` on a stock row — the same three columns `TOT_ASKS` and
 * `STK_ASKS` name above. The water dip is deliberately not among them. The
 * engine never calculates with it, so a morning where somebody measured the
 * water and left every meter and every stock at yesterday’s is still a morning
 * nobody did, and letting one water dip exonerate it would be a hole rather than
 * a kindness. Anything else handed in — a tanker, a truck number, an identity
 * column — is ignored here and judged by the rules that own it.
 *
 * And the change set must carry BOTH KINDS before it can be refused: at least
 * one meter reading AND at least one stock figure. That floor is what keeps a
 * net meant for a morning from catching a correction. An admin who reopens a
 * saved day to put nozzle 5 back to 13,205 after mistyping it is handing over
 * one figure that equals the previous day’s, and they are right, and refusing it
 * would be the very dead end this change exists to remove. A morning is meters
 * AND tanks — 16E’s is six readings and two tanks — so asking for both costs a
 * real morning nothing and costs a correction everything. Stock on its own is
 * left alone for a second reason as well: a tank that neither sold nor received
 * honestly reads the same two mornings running, and so does a dip read to the
 * same centimetre.
 *
 * A figure the previous day has NOTHING for is not a figure standing still, and
 * that settles the empty case honestly: `null`, no refusal. A box with no
 * yesterday to match cannot have been carried in from one, so it is new
 * information, and a change set carrying any of it is not an untouched morning.
 * A dealer’s very first hand-typed day, where there is no previous day at all,
 * therefore passes — which is right, because there is nothing there it could
 * have failed to change.
 *
 * Deliberately NOT given the dealer’s product layout, and that is not a
 * shortcut. A nozzle’s meter scale multiplies both mornings’ readings before
 * anything is subtracted, and any positive factor times two equal numbers is
 * still a difference of nothing — so the scale cannot change this answer, and
 * the refusal holds even for a dealer whose report configuration cannot be read
 * at all.
 *
 * Only the figures the change set in hand is PUTTING there are handed in — a row
 * it adds, or a box it alters. A figure already on record that this commit does
 * not touch was answered for on the visit that saved it, and 16E’s two dead
 * pumps sit at 13,205 and 2,638 every single morning: judging those again would
 * make a day that was saved correctly impossible to reopen. That is the same
 * scoping {@link irasCarriedUntouched} needed, for the same reason.
 *
 * `null` on every ordinary commit, and otherwise the figures themselves.
 */
export function irasUntouchedMorning(input: {
  figures: ReadonlyArray<IrasFigureInHand>;
  previousTot: Record<string, string>;
  previousStk: Record<string, IrasPreviousStkRow>;
}): IrasUntouchedMorning | null {
  const previousTot = input.previousTot ?? {};
  const previousStk = input.previousStk ?? {};

  const figures: IrasFigureStillYesterdays[] = [];
  const tanks: string[] = [];
  let meterReadings = 0;
  // One answer per BOX. A commit that adds a row and then edits a cell on it
  // hands the same figure over twice, and counting it twice would have the
  // sentence name one nozzle two times.
  const seen = new Set<string>();

  for (const figure of input.figures ?? []) {
    const code = figure?.code;
    if (code !== 'TOT' && code !== 'STK') continue;
    const field = trimmed(figure?.field);
    if (!(code === 'TOT' ? TOT_ASKS : STK_ASKS).includes(field)) continue;
    const identity = irasRowIdentity(figure?.identity);
    if (!identity) continue;
    const box = `${code}|${identity}|${field}`;
    if (seen.has(box)) continue;
    seen.add(box);

    const previous = previousFigureOf(code, identity, field, previousTot, previousStk);
    // A box with NO previous figure behind it is skipped, not answered with.
    //
    // It cannot have been carried in from a day that has nothing in it, so it is
    // new information either way and it says nothing about the rest. Bailing on
    // the whole commit here — which is what `return null` used to do — let a
    // single gap in yesterday's data disarm this over every other figure on the
    // day, which is exactly the morning most likely to be got wrong.
    if (trimmed(previous) === '') continue;
    // One figure that has MOVED, and this is not an untouched morning. Answered
    // on the spot rather than tallied: the verdict cannot come back once a
    // single figure has gone.
    if (!stillYesterdays(code, figure?.value, previous)) return null;

    figures.push({
      code,
      identity,
      field,
      value: trimmed(figure?.value),
      previous: trimmed(previous),
    });
    if (code === 'TOT') meterReadings += 1;
    else if (!tanks.includes(identity)) tanks.push(identity);
  }

  // A morning is meters AND tanks. Either one on its own is a correction, and a
  // correction is not this rule’s business — see the walkthrough above.
  if (meterReadings === 0 || tanks.length === 0) return null;
  return { figures, meterReadings, tanks };
}

/* ───────────────────────────── the findings ─────────────────────────────── */

export type IrasDayFindingKind =
  | 'MISSING_FIGURE'
  | 'MISSING_ROW'
  | 'METER_BACKWARDS'
  | 'METER_UNCHANGED'
  | 'CARRIED_UNTOUCHED'
  | 'UNREADABLE_VALUE'
  | 'DUPLICATE_IDENTITY'
  | 'STOCK_UNCHANGED_BUT_SOLD'
  | 'STOCK_DIP_UNCHANGED'
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
   *
   * Each row may also carry `carried` — the boxes the plan pre-filled that
   * nobody has touched yet. Left off, nothing is carried and no
   * `CARRIED_UNTOUCHED` is raised.
   *
   * And it may carry `read` — the boxes filled from the outlet's own slip. That
   * one changes no verdict anywhere: it only chooses which wording
   * `METER_UNCHANGED` uses, because a reading that came off a photograph sends
   * the operator back to the photograph rather than to the register. Left off,
   * every finding is worded exactly as it was before slips existed.
   */
  rows: ReadonlyArray<IrasDayRowInForce>;
  previousTot: Record<string, string>;
  previousStk: Record<string, IrasPreviousStkRow>;
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
  const previousLabel = irasDayDateLabel(input.previousDate ?? '', 'long') || 'the previous day';
  // The short spelling, and only for the carried sentences: they are printed
  // under a box on a phone, one per unfinished figure, where "30 Aug" earns its
  // place and "30 August" does not. Both come out of the one date helper, so a
  // day cannot be named two different things on one screen.
  const carriedFrom = irasDayDateLabel(input.previousDate ?? '') || 'the previous day';

  /* Configured identities, deduped, in config order. */
  const nozzles = configuredNozzlesOf(products);
  const tanks = configuredTanksOf(products);
  const seenNozzles = new Set(nozzles.map((n) => n.identity));
  const seenTanks = new Set(tanks.map((t) => t.identity));

  /* The rows in force, indexed the way the engine reads them. */
  type FoundRow = {
    row: IrasRow;
    rowIndex: number;
    onRecord?: IrasRow | null;
    carried?: readonly string[];
    read?: Readonly<Record<string, IrasFigureReadOffSlip>>;
  };
  const totByNozzle = new Map<string, FoundRow[]>();
  const stkByTank = new Map<string, FoundRow[]>();
  const recRows: FoundRow[] = [];
  inputRows.forEach((entry, rowIndex) => {
    const row = entry?.row ?? {};
    // Carried through the index rather than looked up again later, because the
    // one rule that reads it has to read it off the SAME row it is measuring —
    // the first meter row on a nozzle, not the second one a duplicate put there.
    const found: FoundRow = {
      row,
      rowIndex,
      onRecord: entry?.onRecord,
      carried: entry?.carried,
      read: entry?.read,
    };
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
  const unchanged: Array<{
    identity: string;
    previous: number;
    rowIndex: number;
    /** True when this reading came off the outlet's slip rather than a keyboard. */
    fromSlip: boolean;
  }> = [];
  /** Boxes still holding the figure the plan carried into them. */
  const carriedUntouched: Array<{
    code: IrasPlannedRowCode;
    identity: string;
    field: string;
    label: string;
    message: string;
    rowIndex: number;
  }> = [];
  for (const { identity, configNo, product } of nozzles) {
    const found = totByNozzle.get(identity)?.[0];
    if (!found) continue;

    /*
     * The box the plan pre-filled and nobody has touched — said quietly, and
     * said INSTEAD of every other thing that could be said about it.
     *
     * This is the ordering trap the pre-fill brings with it. A carried reading
     * equals yesterday's by construction, so METER_UNCHANGED fires on it too,
     * and a freshly opened day would come up with ten boxes telling the operator
     * they had reported zero litres sold before they had typed a character.
     * Only one finding may be raised per field, and on an untouched carried box
     * it is this one: "you have not done this yet" and "the number you typed
     * means zero sales" are different problems with different fixes.
     *
     * This is now the FIRST question asked about a nozzle. A third one used to
     * come ahead of it — whether somebody had stated the pump did not run — and
     * it had to, because that statement was the only way past this block and
     * 16E's two dead pumps are carried AND unmoved every single morning. The
     * statement is gone, and this block is no longer a dead end: typing the
     * figure clears it, and a typed figure that turns out to equal yesterday's
     * now saves with a warning under it. So carried has to keep winning over
     * unchanged here, and the `continue` below is what keeps a freshly opened
     * day saying "you have not done this one yet".
     *
     * Asked BEFORE the figure is parsed, which is the half that was missing. A
     * previous day recorded with a comma — "1,53,269" — carries a value this
     * validator cannot read, so the parse below used to `continue` past this
     * check and the only thing left to say about the box was a red "Enter a
     * number without commas", on a figure the operator never typed. The stock
     * and the dip already resolved that pairing this way; the meter did not.
     * Both are still a BLOCK, so nothing is saved either way — but the sentence
     * that survives is the one naming what to do about it.
     */
    if (irasCarriedUntouched(found, 'TOT_READING', byIdentity(previousTot, identity))) {
      carriedUntouched.push({
        code: 'TOT',
        identity,
        field: 'TOT_READING',
        label: `nozzle ${identity}`,
        message: `Carried from ${carriedFrom} — change it to this morning’s meter reading.`,
        rowIndex: found.rowIndex,
      });
      continue;
    }

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
    if (sold !== 0) continue;

    /*
     * A nozzle that sold nothing. By here the box is not one the system filled
     * in — the carried check above took those — so a person typed this figure,
     * and typing it is the deliberate act. All that is left to do is say plainly
     * what it means, which is a WARN and never a block.
     *
     * Said only about a reading THIS change set is putting there — and 16E is
     * why.
     *
     * That outlet has two dead pumps. Nozzles 5 and 6 have not moved since the
     * inspection; their readings are still the inspection's own figures, 13,205
     * and 2,638, and the operator retypes them every morning. Once a day is
     * saved those two figures are simply what that outlet reads, and repeating
     * the warning on every later visit would teach the operator to look past it
     * — which is the one way a warning can do harm. A reading already on record
     * that this change set does not alter was answered for on the visit that
     * saved it.
     *
     * A caller that says nothing about what the server holds still has every
     * reading read as fresh work, so the backend's after-save pass — which hands
     * over a day's hand-added rows with nothing to compare them against — goes
     * on saying exactly what it said before this scoping existed.
     */
    if (figureIsFreshWork(found, 'TOT_READING')) {
      unchanged.push({
        identity,
        previous,
        rowIndex: found.rowIndex,
        // Gated on the row's own read map, so this wording is unreachable on a
        // portal day and unreachable from the backend's after-save pass —
        // neither of those callers passes one. It is also unreachable once the
        // operator has typed over the box: sending them back to a photograph
        // for a figure they typed themselves would be the same lie the count
        // used to tell. A day where NO reading moved is caught a step earlier,
        // in the review, before anything is filled in.
        fromSlip: irasFigureReadOffSlip(found, 'TOT_READING'),
      });
    }
  }

  // The same question on the two figures a stock row is asked for, and here it
  // is only ever the carried one: a tank has a stock and a dip this morning
  // whatever the pumps did, so a box the system filled in is work outstanding
  // and the one way out is to measure the tank.
  for (const { identity } of tanks) {
    const found = stkByTank.get(identity)?.[0];
    if (!found) continue;
    const previous = byIdentity(previousStk, identity);
    for (const field of STK_ASKS) {
      const previousValue = field === 'NET_QTY' ? previous?.netQty : previous?.productDip;
      if (!irasCarriedUntouched(found, field, previousValue)) continue;
      carriedUntouched.push({
        code: 'STK',
        identity,
        field,
        label: `tank ${identity}`,
        message:
          field === 'NET_QTY'
            ? `Carried from ${carriedFrom} — change it to this morning’s stock.`
            : `Carried from ${carriedFrom} — change it to this morning’s product dip.`,
        rowIndex: found.rowIndex,
      });
    }
  }
  const carriedKeys = new Set(carriedUntouched.map((c) => `${c.code}|${c.identity}|${c.field}`));

  /*
   * The product dip that is still the previous day's.
   *
   * The dip is the dealer's own independent witness to the stock printed beside
   * it, and it was the one pre-filled figure with nothing watching it anywhere:
   * a day saved with tank 3's dip still reading 29 August's 1,275 raised not one
   * finding, and the dealer's report then printed a dip measured two days before
   * the stock standing next to it.
   *
   * A WARN and never a block, which is where it parts company with the meter
   * above it. A dip really can repeat — the same reading to the centimetre two
   * mornings running is ordinary on a tank that barely moved — so refusing it
   * would stop real work, and only the person holding the tape can say whether
   * it went in the tank this morning. Saying so is the whole of the job.
   */
  const stockDipUnchanged: Array<{ identity: string; dip: number; rowIndex: number }> = [];
  for (const { identity } of tanks) {
    const found = stkByTank.get(identity)?.[0];
    if (!found) continue;
    // Scoped to a dip THIS change set puts there, on the meter's own rule: one
    // already on record and untouched by this commit was answered for on the
    // visit that saved it, so a day reopened to add a tanker must not come back
    // talking about it.
    if (!figureIsFreshWork(found, 'PRODUCT_DIP')) continue;
    const typed = asNumber(found.row.PRODUCT_DIP);
    const previous = asNumber(byIdentity(previousStk, identity)?.productDip);
    if (typed === null || previous === null || typed !== previous) continue;
    // One finding per box, exactly as the stock beside it. A dip still holding
    // the carried figure is already blocked with "you have not done this one
    // yet", and a second sentence would only describe the same box again.
    if (carriedKeys.has(`STK|${identity}|PRODUCT_DIP`)) continue;
    stockDipUnchanged.push({ identity, dip: previous, rowIndex: found.rowIndex });
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
      // One finding per box. A stock still holding the carried figure is
      // already blocked with "you have not done this one yet", and telling the
      // operator in a second sentence that the tank has not moved while its
      // pumps sold is describing the box they have just been told to fill in.
      // The moment they type a figure — even yesterday's — this warning is
      // exactly as it was.
      if (carriedKeys.has(`STK|${identity}|NET_QTY`)) continue;
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

  // One finding per box, and this is where two of them met. A previous day's
  // figure that cannot be read — `1,275` or `1,53,269` with the comma left in
  // it — is carried into the box AND fails the value check, so one box was told
  // both that its value cannot be read and that nobody has done it yet. Only the
  // second says what to do: the operator did not type that figure, the system
  // put it there, and this morning's figure typed over it settles both.
  //
  // Holds for all three carried figures — the meter reading as much as the stock
  // and the dip. It did not always: the meter's carried check used to sit AFTER
  // the numeric parse, so an unreadable carried reading never reached
  // `carriedKeys` and this filter had nothing to match. Keep that check ahead of
  // the parse.
  const unreadableShown = unreadable.filter(
    (item) => !carriedKeys.has(`${item.code}|${irasRowIdentity(item.identity)}|${item.field}`),
  );
  const unreadableReason =
    unreadableShown.length === 1
      ? 'One value cannot be read. Fix the highlighted field to save.'
      : `${unreadableShown.length} values cannot be read. Fix the highlighted fields to save.`;
  for (const item of unreadableShown) {
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

  // Never a block, and never silent. Once a person has typed the figure the
  // keystroke is the deliberate act — a pump that genuinely did not turn is a
  // real morning and has to be savable — so all that is left is to say what the
  // figure means, under the box, where the row's own "Sold 0 L" readout is
  // saying it in the same breath. It keeps its place in this order because the
  // sentence is about a meter and it belongs beside the other two.
  for (const item of unchanged) {
    findings.push({
      severity: 'WARN',
      kind: 'METER_UNCHANGED',
      code: 'TOT',
      identity: item.identity,
      field: 'TOT_READING',
      rowIndex: item.rowIndex,
      // The same warning, said two ways, because the operator's next move is not
      // the same. A figure they typed sends them back to the register; a figure
      // read off the slip sends them back to the slip, and the first thing to
      // check there is whether it is this morning's paper at all.
      message: item.fromSlip
        ? `Same as yesterday. This reading came off the slip and it matches ${carriedFrom}’s, so it reports zero litres sold on nozzle ${item.identity} and drops that nozzle’s 5 litre test draw. Check the slip is this morning’s. If the pump really did not run, leave it as it is — the day will save.`
        : `Same as yesterday. This reports zero litres sold on nozzle ${item.identity}, and it also drops that nozzle’s 5 litre test draw. If the pump really did not run, leave it as it is — the day will save.`,
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

  // After the blank boxes, and in the same shape as their sentence: the two are
  // one family — work nobody has done — and a blank box is the one the eye goes
  // to first, so it gets to speak first when a day has both.
  //
  // The `message` is kept to the one quiet line the sheet prints under the box,
  // because on a freshly opened day it is printed ten times. There is one route
  // out of this block and it is the same for every box, dead pump or not: type
  // the figure. A reading that turns out to equal yesterday's saves, carrying
  // the unmoved-meter warning under it.
  //
  // Named row by row up to three of them, and counted after that — which is the
  // one place this sentence parts company with the blank-figure one above it.
  // That one names them all because a day with blanks on it is an exception. A
  // day where everything is still carried is not an exception: it is how every
  // morning starts, so the sentence an operator reads every day of their life
  // must not be "Nozzle 2, nozzle 4, nozzle 5, nozzle 1, nozzle 3, nozzle 6,
  // tank 3 and tank 1 still hold figures carried from 30 Aug". The naming earns
  // its place at the other end, where one or two boxes are left and the
  // operator has to be told which.
  const carriedLabels = uniqueInOrder(carriedUntouched.map((c) => c.label));
  const carriedCount = carriedUntouched.length;
  const carriedReason = `${
    carriedLabels.length <= 3
      ? // The verb agrees with the rows named and the noun with the boxes
        // counted, because one tank can be owed two of them: "Tank 1 still
        // holds figures", never "holds a figure" over two boxes.
        `${sentenceStart(joinList(carriedLabels))} still ${
          carriedLabels.length === 1 ? 'holds' : 'hold'
        } ${carriedCount === 1 ? 'a figure' : 'figures'} carried from ${carriedFrom}`
      : `${carriedCount} figures on this day are still ${carriedFrom}’s`
  }. Type this morning’s ${carriedCount === 1 ? 'figure over it' : 'figures over them'}.`;
  for (const item of carriedUntouched) {
    findings.push({
      severity: 'BLOCK',
      kind: 'CARRIED_UNTOUCHED',
      code: item.code,
      identity: item.identity,
      field: item.field,
      rowIndex: item.rowIndex,
      message: item.message,
      blockReason: carriedReason,
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

  for (const item of stockDipUnchanged) {
    findings.push({
      severity: 'WARN',
      kind: 'STOCK_DIP_UNCHANGED',
      code: 'STK',
      identity: item.identity,
      field: 'PRODUCT_DIP',
      rowIndex: item.rowIndex,
      message: `Tank ${item.identity}’s product dip is still ${previousLabel}’s ${grouped(
        item.dip,
      )}. The report prints it beside this morning’s stock as the dealer’s own witness to it, so check the tank was dipped today.`,
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
 * A figure the system carried in is not one somebody typed, and this is where
 * that matters most: the day is laid out with the previous day's figures
 * already in the boxes, so counting a full box would announce a morning nobody
 * had started as finished. See {@link irasCarriedUntouched}, which is the same
 * test the block runs on.
 *
 * But a tanker is still somebody's typing, and both guards over a half-typed
 * shift used to read `entered` alone. Type the litres of a delivery before any
 * meter reading, then close the tab or press reset, and the count was zero: no
 * prompt, no confirm, the litres gone. `anythingTyped` is the question those two
 * guards are really asking — has a person put a figure into this day — and it is
 * answered here so the unload guard and the reset button cannot answer it
 * differently.
 *
 * `read` is the third count, and it is here for honesty rather than for
 * arithmetic. A figure read off the outlet's slip and accepted by a named person
 * is a figure the day HAS — it is work in progress, it survives a reset prompt,
 * and it counts towards a complete day — but it is not a figure somebody typed,
 * and a readout that called it one would say "All 10 figures typed" on a morning
 * where six of them came off a photograph. It is counted separately and named
 * separately, everywhere it is shown.
 *
 * On a day whose rows carry no read list — every portal dealer, the backend's
 * after-save pass, and every caller that existed before the slip did — `read` is
 * 0 and `entered`, `needed`, `tankersTyped` and `anythingTyped` are exactly the
 * numbers this function returned before it could count one.
 */
export function irasDayProgress(
  plan: IrasDayPlan,
  rows: ReadonlyArray<IrasDayRowInForce>,
): {
  entered: number;
  read: number;
  needed: number;
  tankersTyped: number;
  anythingTyped: boolean;
} {
  const totByNozzle = new Map<string, IrasDayRowInForce>();
  const stkByTank = new Map<string, IrasDayRowInForce>();
  let tankersTyped = 0;
  for (const entry of rows ?? []) {
    const row = entry?.row ?? {};
    if (entry?.code === 'TOT') {
      const identity = irasRowIdentity(row.NOZZLE_NO);
      if (identity && !totByNozzle.has(identity)) totByNozzle.set(identity, entry);
    } else if (entry?.code === 'STK') {
      const identity = irasRowIdentity(row.TANK_NO);
      if (identity && !stkByTank.has(identity)) stkByTank.set(identity, entry);
    } else if (entry?.code === 'REC' && TANKER_FIGURES.some((field) => trimmed(row[field]))) {
      tankersTyped += 1;
    }
  }

  const needed = plan?.figuresNeeded ?? [];
  let entered = 0;
  let read = 0;
  for (const figure of needed) {
    const entry =
      figure.code === 'TOT' ? totByNozzle.get(figure.identity) : stkByTank.get(figure.identity);
    if (!entry || !trimmed(entry.row?.[figure.field])) continue;
    // Asked before the carried test rather than after it, so a box can only ever
    // be counted once. A slip figure that happens to equal the previous day's is
    // still a slip figure — it is warned about by METER_UNCHANGED, which is a
    // different question and has its own sentence.
    if (irasFigureReadOffSlip(entry, figure.field)) {
      read += 1;
      continue;
    }
    // A box is not typed just because it has something in it. Since the day is
    // laid out with the previous day's figures already in place, counting a
    // full box would report a freshly opened morning as "All 10 figures typed"
    // with nobody having touched it — and both guards over a half-typed shift,
    // the browser's unsaved-work prompt and the reset button's confirm, read
    // `anythingTyped` off this count. Asked through the very function the block
    // is raised on, so the readout and the block cannot disagree about whether
    // a figure is a person's.
    if (irasCarriedUntouched(entry, figure.field, figure.previous)) continue;
    entered += 1;
  }
  return {
    entered,
    read,
    needed: needed.length,
    tankersTyped,
    anythingTyped: entered > 0 || read > 0 || tankersTyped > 0,
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
 *
 * `read` is that same call's `read` — the figures a named person accepted off
 * the outlet's slip — and it is named in its own words rather than folded into
 * the typed count:
 *   partly    "4 of 10 figures typed. 6 more read off the slip."
 *   all in    "All 10 figures in — 4 typed, 6 read off the slip."
 *
 * The day is complete when `entered + read` covers what it needs, and on such a
 * morning this sentence must never say "All 10 figures typed" — six of them were
 * not. It defaults to 0, so a caller that has no slip on this day (every portal
 * dealer, and every caller that existed before the slip did) gets the three
 * sentences above, word for word.
 */
export function irasDayFiguresSentence(plan: IrasDayPlan, entered: number, read = 0): string {
  const needed = plan?.figuresNeeded ?? [];
  const total = needed.length;
  if (total === 0) {
    return 'This dealer’s report layout does not name any nozzles or tanks, so there is nothing to type here.';
  }

  const typed = Math.max(0, Math.min(Number.isFinite(entered) ? Math.trunc(entered) : 0, total));
  const offTheSlip = Math.max(
    0,
    Math.min(Number.isFinite(read) ? Math.trunc(read) : 0, total - typed),
  );
  if (typed + offTheSlip >= total) {
    if (offTheSlip === 0) {
      return total === 1
        ? 'The one figure this day needs is typed.'
        : `All ${total} figures typed.`;
    }
    if (typed === 0) {
      return total === 1
        ? 'The one figure this day needs is read off the slip.'
        : `All ${total} figures in, read off the slip.`;
    }
    return `All ${total} figures in — ${typed} typed, ${offTheSlip} read off the slip.`;
  }
  if (typed > 0) {
    return offTheSlip > 0
      ? `${typed} of ${total} figures typed. ${offTheSlip} more read off the slip.`
      : `${typed} of ${total} figures typed.`;
  }
  if (offTheSlip > 0) return `${offTheSlip} of ${total} figures read off the slip.`;

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
 * Whether ONE figure on this row is one the change set in hand puts there.
 *
 * True when the caller said nothing about what the server holds (`undefined`),
 * so a caller that does not supply it reads exactly as this module read before
 * the field existed; true when the change set is adding the row (`null`); and
 * true when the figure itself differs from the one on record.
 *
 * One named field and no other column, which is the whole reason `onRecord` is a
 * row rather than a flag: correcting the tank a nozzle draws from does not
 * re-open the question of whether that nozzle ran.
 */
function figureIsFreshWork(
  entry: { row?: IrasRow; onRecord?: IrasRow | null },
  field: string,
): boolean {
  if (!entry.onRecord) return true;
  return !sameStoredValue(entry.row?.[field], entry.onRecord[field]);
}

/**
 * The previous day’s own figure for one box.
 *
 * Looked up through {@link byIdentity} rather than by a plain key, because the
 * portal writes a nozzle `02` one morning and `2` the next and the report reads
 * both as nozzle 2. A lookup that missed would say the previous day has nothing
 * for a box it has a figure for, and {@link irasUntouchedMorning} turns on
 * telling those two apart: “nothing to compare against” is the answer that lets
 * a commit through.
 */
function previousFigureOf(
  code: IrasPlannedRowCode,
  identity: string,
  field: string,
  previousTot: Record<string, string>,
  previousStk: Record<string, IrasPreviousStkRow>,
): unknown {
  if (code === 'TOT') return byIdentity(previousTot, identity);
  const row = byIdentity(previousStk, identity);
  if (!row) return undefined;
  return field === 'NET_QTY' ? row.netQty : row.productDip;
}

/**
 * Whether one box is still holding the figure the previous day had in it.
 *
 * The meter goes through the one litres rule rather than a subtraction of its
 * own, so `452180.0` and `452180` are the one reading here exactly as they are
 * on the report — a string test would wave the commonest retyped figure of all
 * straight through. No meter scale is passed and none is needed: any positive
 * factor times two equal numbers is still a difference of nothing.
 *
 * A stock and a product dip are plain measurements rather than odometers, so
 * they are compared as the numbers they are, which settles `5000.00` against
 * `5000` the same way.
 *
 * Either side unreadable is NOT a match, and that is deliberate. A figure
 * nothing can read is not a figure standing still, and the rules that refuse an
 * unreadable value own that box.
 */
function stillYesterdays(code: IrasPlannedRowCode, value: unknown, previous: unknown): boolean {
  if (code === 'TOT') return irasNozzleSold(value, previous) === 0;
  const today = asNumber(value);
  const before = asNumber(previous);
  return today !== null && before !== null && today === before;
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
