/**
 * Naming a product's tanks — one place, so a heading can never name a tank the
 * arithmetic did not use.
 *
 * The DSR reconciles a whole GRADE, and a grade can sit in several tanks. Which
 * tanks is `DsrProductConfig.tankNos`, and that array is what selects the stock
 * rows, the receipts and the dips. The heading printed above those figures used
 * to come from somewhere else entirely — a free-text `tankLabel` an operator
 * typed at setup — and the two drifted apart the moment anyone made a typo. Six
 * of the eight live outlets carry a label that names the wrong tank; 15E's is
 * inverted outright, with the diesel in tank 2 headed `TANK -1` and the petrol in
 * tank 1 headed `TANK -2`.
 *
 * Deriving the words from the numbers removes the possibility. Every renderer —
 * the printable HTML, the two WhatsApp cards, the Excel export and the receipt
 * editor's row labels — asks here.
 */

/**
 * How a product's whole tank set is named, e.g. `TANK -4/6/8` for a grade in
 * three tanks and `TANK -2` for a grade in one.
 *
 * Returns `null` for an empty list, so a caller with nothing to name can fall
 * back to whatever legacy label it holds rather than printing `TANK -`.
 */
export function dsrTankSetLabel(tankNos: readonly number[] | undefined | null): string | null {
  const tanks = (tankNos ?? []).filter((t) => Number.isFinite(t));
  if (tanks.length === 0) return null;
  return `TANK -${tanks.join('/')}`;
}

/** How a SINGLE tank is named in a per-tank column heading, e.g. `TANK 6`. */
export function dsrTankLabel(tankNo: number): string {
  return `TANK ${tankNo}`;
}

/**
 * The tank order a report should print for one product, given the config order
 * and the rows actually being shown.
 *
 * Config order leads, because that is the order the dealer's own sheet reads and
 * the order the engine sums in. A tank that appears only in the rows — a tank
 * added to the forecourt part-way through the window shown, or a row carried
 * from an older config — is appended rather than dropped, because a column
 * missing from the heading is a column of litres nobody can see.
 */
export function dsrTankOrder(
  configTankNos: readonly number[] | undefined | null,
  rowTankNos: readonly (readonly number[])[] = [],
): number[] {
  const order: number[] = [];
  const seen = new Set<number>();
  const add = (t: number): void => {
    if (!Number.isFinite(t) || seen.has(t)) return;
    seen.add(t);
    order.push(t);
  };
  for (const t of configTankNos ?? []) add(t);
  for (const row of rowTankNos) for (const t of row) add(t);
  return order;
}

/**
 * How a product's ledger table lays its tank columns out.
 *
 * `perTank` is the real decision. A grade in ONE tank keeps the report exactly
 * as it has always looked — a DIP and a WATER DIP column under the tank's name —
 * because there is nothing to break out and a per-tank STOCK column would just
 * repeat the OPENING STOCK beside it. A grade in several gets a DIP / WATER DIP /
 * STOCK group per tank, which is the whole point of the change.
 */
export interface DsrTankColumns {
  /** The tanks to print, left to right. Empty only when nothing is known. */
  tankNos: number[];
  /** True when each tank gets its own column group. */
  perTank: boolean;
}

/**
 * The tank columns for one product, given the rows about to be printed.
 *
 * The config's order leads. Rows are consulted only to catch a tank that the
 * config no longer lists but a printed row still carries — dropping such a
 * column would hide litres that are sitting in the row.
 */
export function dsrTankColumns(
  tankNos: readonly number[] | undefined | null,
  rows: readonly { tanks?: readonly DsrTankReadingLike[] }[] = [],
): DsrTankColumns {
  const order = dsrTankOrder(
    tankNos,
    rows.map((r) => (r.tanks ?? []).map((t) => t.tankNo)),
  );
  return { tankNos: order, perTank: order.length > 1 };
}

/** The shape {@link dsrRowTankCells} reads and returns — `DsrTankReading`. */
export interface DsrTankReadingLike {
  tankNo: number;
  dip: number | null;
  waterDip: number | null;
  stock: number | null;
}

/** What one ledger row contributes to each tank column, keyed by tank number. */
export interface DsrRowTankCells {
  cells: DsrTankReadingLike[];
  /**
   * True when this row predates per-tank readings, so its single dip has been
   * placed under the FIRST column and its per-tank stock is unknown. A renderer
   * should say so once rather than let a half-empty row read as a bad day.
   */
  legacy: boolean;
}

/**
 * Line one ledger row up with the tank columns — BY TANK NUMBER, never by array
 * position.
 *
 * Position would reintroduce the original bug at three times the surface area:
 * on a day one tank went unreported, every later tank's reading would slide one
 * column left and print under a heading naming a different tank. Nothing would
 * look wrong.
 */
export function dsrRowTankCells(
  row: { dip: number; waterDip: number; tanks?: readonly DsrTankReadingLike[] },
  tankNos: readonly number[],
): DsrRowTankCells {
  if (row.tanks) {
    const byTank = new Map(row.tanks.map((t) => [t.tankNo, t]));
    return {
      legacy: false,
      cells: tankNos.map(
        (tankNo) => byTank.get(tankNo) ?? { tankNo, dip: null, waterDip: null, stock: null },
      ),
    };
  }
  // A row written before the breakdown existed. Its scalar pair is the first
  // REPORTING tank's dip, which is the first column on all but the days a tank
  // went unreported — the closest honest placement, and exactly where the old
  // report printed it. Per-tank stock is genuinely unknown, so it stays blank
  // rather than being invented from the grade total.
  return {
    legacy: true,
    cells: tankNos.map((tankNo, i) =>
      i === 0
        ? { tankNo, dip: row.dip, waterDip: row.waterDip, stock: null }
        : { tankNo, dip: null, waterDip: null, stock: null },
    ),
  };
}
