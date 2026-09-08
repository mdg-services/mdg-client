/**
 * A tank's dip-to-litres chart, learned from the readings it has already given.
 *
 * WHY THIS EXISTS. A stock row carries two figures: `PRODUCT_DIP`, the depth a
 * dipstick reads, and `NET_QTY`, the litres that depth corresponds to. The depth
 * is the measurement; the litres are that depth read off the tank's calibration
 * chart, which is a physical property of the vessel — a steel cylinder lying on
 * its side holds far more litres per centimetre at its middle than at its ends.
 *
 * Sometimes the litres do not arrive and the depth does. Before this, the engine
 * read the absent figure as ZERO (`num(r.NET_QTY) ?? 0`) and computed a whole
 * day's variation against a tank it believed was empty.
 *
 * WHY DERIVING FROM THE DIP IS SOUND, AND DERIVING FROM THE METERS IS NOT. The
 * report exists to compare two INDEPENDENT measurements of the same fuel: what
 * the pump meters say was sold, and what the tank depth says was sold. The gap
 * between them is the entire product — it is what catches a leak, a theft or a
 * drifting meter.
 *
 * Filling the litres from the DIP keeps that independence perfectly: the number
 * still originates in the dipstick, and this only converts its units. Filling it
 * from the METERS destroys the product: dip sales would then equal meter sales by
 * construction and the variation would come out as exactly zero, every day,
 * forever — a figure that looks measured and carries no information. That is
 * strictly worse than a gap, because a gap is visible and a false zero is not.
 *
 * WHAT IT REFUSES. It never extrapolates. A depth outside anything the tank has
 * been seen at is a depth we have no chart for, and a straight-line guess past
 * the end of the observations is exactly where a cylinder's geometry stops being
 * straight. Replayed against production, 62 of 723 readings (8.6%) fell outside
 * their tank's observed range and are refused rather than guessed at.
 *
 * HOW ACCURATE IT IS, measured by hiding each real reading and predicting it from
 * the others across all 36 tanks and 723 readings:
 *
 *     median   0.3 L        p90   5.6 L
 *     p99    109 L          max 271 L (6.6%)
 *
 * The tail is entirely tanks with few readings and wide gaps between them, which
 * is why {@link litresForDip} returns the gap it interpolated across and lets the
 * caller refuse a bracket it does not like. Accuracy improves on its own as more
 * days land — the chart is the tank's own history.
 *
 * PURE. No clock, no database. `tankCalibration.test.ts` is where the numbers
 * above are asserted against a fixture drawn from real readings.
 */

/** One observation: a depth this tank was dipped at, and the litres it held. */
export interface TankReading {
  /** `PRODUCT_DIP` exactly as the portal reports it. Units are irrelevant so long as they are consistent. */
  dip: number;
  /** `NET_QTY` in litres. */
  litres: number;
}

/** A tank's learned chart: its observations, cleaned, sorted and monotonic. */
export interface TankCurve {
  points: readonly TankReading[];
  /** Readings dropped because they contradicted a deeper dip holding less fuel. */
  droppedInversions: number;
  /** The shallowest and deepest dip this tank has ever been seen at. */
  minDip: number;
  maxDip: number;
}

export interface DipConversion {
  litres: number;
  /**
   * The distance between the two observations interpolated across.
   *
   * The one number that says how much to trust the answer. A dip landing between
   * two readings 2 units apart is all but measured; one landing in a 300-unit gap
   * is a straight line drawn across a curve.
   */
  gap: number;
  /** True when the dip matched an observation outright, so nothing was interpolated. */
  exact: boolean;
}

/** Two readings at the same depth disagreeing by more than this are noise, not a chart. */
const SAME_DIP_TOLERANCE = 1e-9;

/**
 * Learn a tank's chart from its readings.
 *
 * Three cleanings, in order, and each earns its place against real data:
 *
 *  1. **Same depth, several answers.** A tank dipped at the same depth on twenty
 *     days yields twenty readings that should agree and occasionally will not.
 *     The MEDIAN is taken, not the mean and not the latest: one mistyped figure
 *     moves a mean and cannot move a median.
 *  2. **Deeper holding less.** Physically impossible, so one of the two readings
 *     is wrong. The later point is dropped and counted rather than the curve
 *     being bent to accommodate it — a chart that is not monotonic is not a
 *     chart, and silently smoothing an impossibility hides a data fault worth
 *     seeing. All 36 production tanks are clean, so this counter should stay at
 *     zero; if it starts rising, something upstream is wrong.
 *  3. **Nonsense.** Non-finite or non-positive figures never enter.
 */
export function buildTankCurve(readings: readonly TankReading[]): TankCurve {
  const usable = readings.filter(
    (r) => Number.isFinite(r.dip) && Number.isFinite(r.litres) && r.dip > 0 && r.litres > 0,
  );

  const byDip = new Map<number, number[]>();
  for (const r of usable) {
    const bucket = byDip.get(r.dip);
    if (bucket) bucket.push(r.litres);
    else byDip.set(r.dip, [r.litres]);
  }

  const collapsed: TankReading[] = [...byDip.entries()]
    .map(([dip, litres]) => {
      const sorted = [...litres].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
      return { dip, litres: median };
    })
    .sort((a, b) => a.dip - b.dip);

  const points: TankReading[] = [];
  let droppedInversions = 0;
  let highest = -Infinity;
  for (const p of collapsed) {
    if (p.litres < highest - SAME_DIP_TOLERANCE) {
      droppedInversions += 1;
      continue;
    }
    points.push(p);
    highest = p.litres;
  }

  return {
    points,
    droppedInversions,
    minDip: points[0]?.dip ?? Number.NaN,
    maxDip: points[points.length - 1]?.dip ?? Number.NaN,
  };
}

/**
 * The litres a depth corresponds to, or `null` when this tank cannot say.
 *
 * `null` for three reasons, and all three are the honest answer rather than a
 * failure: the tank has fewer than two readings and therefore no chart at all;
 * the dip is shallower than anything ever seen; the dip is deeper than anything
 * ever seen. Nothing here extrapolates, because the shape of a tank past the last
 * observation is exactly what is not known.
 *
 * Linear between the two nearest observations. A cylinder's true curve is not a
 * straight line, but between two readings a few centimetres apart the difference
 * is far below anything that matters — which the leave-one-out replay confirms at
 * a median of 0.3 L. {@link DipConversion.gap} is returned so a caller can refuse
 * a bracket wide enough for the curvature to bite.
 */
export function litresForDip(curve: TankCurve, dip: number): DipConversion | null {
  if (!Number.isFinite(dip) || dip <= 0) return null;
  const p = curve.points;
  if (p.length < 2) return null;
  if (dip < curve.minDip || dip > curve.maxDip) return null;

  for (let i = 0; i < p.length; i += 1) {
    if (Math.abs(p[i]!.dip - dip) <= SAME_DIP_TOLERANCE) {
      return { litres: p[i]!.litres, gap: 0, exact: true };
    }
  }

  for (let i = 1; i < p.length; i += 1) {
    const hi = p[i]!;
    if (dip > hi.dip) continue;
    const lo = p[i - 1]!;
    const span = hi.dip - lo.dip;
    if (span <= 0) return { litres: hi.litres, gap: 0, exact: true };
    const litres = lo.litres + ((hi.litres - lo.litres) * (dip - lo.dip)) / span;
    return { litres, gap: span, exact: false };
  }

  return null;
}

/**
 * The reverse: the depth a quantity of litres would stand at.
 *
 * Deliberately NOT used to fill a missing dip. It exists for the admin's shift
 * sheet, where showing the depth a typed figure implies lets somebody notice they
 * have entered litres against the wrong tank before they save. A derived depth
 * must never reach the engine — the depth is the measurement, and a measurement
 * we computed is not one.
 */
export function dipForLitres(curve: TankCurve, litres: number): number | null {
  if (!Number.isFinite(litres) || litres <= 0) return null;
  const p = curve.points;
  if (p.length < 2) return null;
  const lowest = p[0]!.litres;
  const highest = p[p.length - 1]!.litres;
  if (litres < lowest || litres > highest) return null;

  for (let i = 1; i < p.length; i += 1) {
    const hi = p[i]!;
    if (litres > hi.litres) continue;
    const lo = p[i - 1]!;
    const span = hi.litres - lo.litres;
    if (span <= 0) return hi.dip;
    return lo.dip + ((hi.dip - lo.dip) * (litres - lo.litres)) / span;
  }
  return null;
}
