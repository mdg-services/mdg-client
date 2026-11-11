/**
 * MDG guideline 5.1.11 — "STOCK VARIATION OF MS/HSD (Beyond Permissible
 * limits)" — expressed as the two things every rendering of the report has to
 * say about a variation: what the permissible band is MADE OF, and what happens
 * if the variation sits outside it.
 *
 * Pure, and in `shared` on purpose. The dealer sees the same reconciliation
 * three times — the WhatsApp card, the printable HTML, and the admin's Vault
 * view when they field the phone call about it — and if those ever disagreed
 * about why a band is 1,145 L or about whether sales get suspended, the report
 * would stop being something anyone acts on. One implementation, three readers.
 *
 * The clause, condensed to what the report needs:
 *
 *   - a normal operational variation of 4% of tank stock is allowed;
 *   - plus evaporation/handling losses on the quantity SOLD — MS 0.75% (0.60%
 *     beyond a 600 KL annual average), HSD 0.25% (0.20% beyond) — with shrinkage
 *     and temperature-variation allowances where applicable;
 *   - POSITIVE variation beyond the limit: samples drawn and sent for lab
 *     testing, and sales & supplies of all products suspended IMMEDIATELY;
 *   - NEGATIVE variation beyond the limit: samples drawn and sent for testing,
 *     sales & supplies continue during the investigation, the dealer's
 *     explanation is called for, and supply is suspended only if that
 *     explanation is not found satisfactory.
 *
 * The engine (see `compute.ts`) applies the rates the dealer's config carries,
 * and adds the evaporation allowance to the band only when the variation is
 * negative — an excess cannot be explained away by evaporation. A product on
 * `lossTiers` (BPCL outlets) gets both tiers of the clause, the first rate up to
 * the 600 KL yearly figure spread over the days since the inspection and the
 * second beyond it; every other product keeps the one flat rate.
 */
import type { DsrVariationSummary } from '../types/dsrReport';

/** The clause every message here is quoting. */
export const GUIDELINE_REF = '5.1.11';

/** The permissible band, split into the allowances the guideline grants. */
export interface BandParts {
  /** Normal operational variation, as a percent of tank stock (typically 4). */
  stockPct: number | null;
  /** That allowance in litres. */
  stockLitres: number;
  /** Evaporation/handling rate as a percent of throughput (e.g. 0.25 for HSD). */
  leakagePct: number | null;
  /** That allowance in litres — granted on a shortage only. */
  leakageLitres: number;
  /**
   * Whether the evaporation allowance is part of THIS band. False for a positive
   * variation, which is the single most-asked question about the report: the
   * allowed band legitimately shrinks when stock is over rather than short.
   */
  leakageApplies: boolean;
  /**
   * Present only when the product's allowance was worked out in two tiers (its
   * breakdown carries `lossTiers`). `leakagePct` above is then a BLENDED rate —
   * the whole allowance over all the litres, say 0.22% — that matches neither of
   * the clause's two rates, so a screen that wants to say where the litres came
   * from reads these instead. Absent for every flat-rate product.
   */
  tiers?: BandTiers;
}

/** The two tiers of the loss allowance, as the report's own figures recover them. */
export interface BandTiers {
  /** Percent on the litres up to the threshold, e.g. 0.25. */
  firstPct: number;
  /** Percent on the litres beyond it, e.g. 0.20. */
  restPct: number;
  /** The litres the first rate covers over this span: the yearly figure ÷ 365 × days. */
  thresholdLitres: number;
  /** Days of sales the threshold was scaled by (at least 1). */
  days: number;
  /** The litres the first rate was applied to — the sales, up to the threshold. */
  tier1Litres: number;
  /** The litres the second rate was applied to — the sales beyond the threshold, else 0. */
  tier2Litres: number;
  /** The first tier's allowance, in litres. */
  leakageTier1: number;
  /** The second tier's allowance, in litres. */
  leakageTier2: number;
}

/**
 * Recover the band's parts from a computed variation.
 *
 * The rates are derived from the figures rather than read back out of the
 * dealer's config so this stays a pure function of the report: a report
 * regenerated months later still explains itself with the rates it was actually
 * computed with, not with whatever the config says today. `null` percentages
 * mean the base was zero and no rate can be recovered — the litres are still
 * exact, so callers fall back to showing just those.
 */
export function bandParts(v: DsrVariationSummary): BandParts {
  const b = v.breakdown;
  const parts: BandParts = {
    stockPct: b.actualDipStock ? (b.permissible / b.actualDipStock) * 100 : null,
    stockLitres: b.permissible,
    leakagePct: b.afterTesting ? (b.leakage / b.afterTesting) * 100 : null,
    leakageLitres: b.leakage,
    leakageApplies: v.variation < 0,
  };
  const t = b.lossTiers;
  if (t) {
    // The litres each rate saw, recovered from the sales and the threshold the
    // engine stored: the first rate takes the sales up to the threshold, the
    // second takes what is beyond it. A zero or negative base has nothing to
    // split — the engine charges all of it at the first rate — and so does this.
    const sold = b.afterTesting;
    parts.tiers = {
      firstPct: t.firstPct,
      restPct: t.restPct,
      thresholdLitres: t.thresholdLitres,
      days: t.days,
      tier1Litres: sold > 0 ? Math.min(sold, t.thresholdLitres) : sold,
      tier2Litres: sold > 0 ? Math.max(sold - t.thresholdLitres, 0) : 0,
      leakageTier1: t.leakageTier1,
      leakageTier2: t.leakageTier2,
    };
  }
  return parts;
}

/** What the guideline does about a variation outside the band. */
export interface Consequence {
  hi: string;
  en: string;
}

/**
 * The consequence for an out-of-limit variation, keyed by which side it fell on.
 *
 * The two are deliberately NOT interchangeable. Reporting the positive case's
 * immediate suspension for a shortage would cry wolf; reporting the negative
 * case's "explanation will be called for" against an excess would badly
 * understate a stop-selling event.
 */
export const CONSEQUENCE: Record<'LOW' | 'HIGH', Consequence> = {
  HIGH: {
    hi: 'सीमा से ज़्यादा (+) वेरिएशन पर सैंपल लैब भेजा जाता है और सभी उत्पादों की बिक्री व सप्लाई तुरंत रोक दी जाती है।',
    en: 'A positive variation beyond the limit: samples are drawn for lab testing and sales & supplies of all products are suspended immediately.',
  },
  LOW: {
    hi: 'सीमा से ज़्यादा (−) वेरिएशन पर सैंपल जाँच के लिए भेजा जाता है और डीलर से लिखित स्पष्टीकरण माँगा जाता है; जवाब संतोषजनक न होने पर सप्लाई रोक दी जाती है।',
    en: 'A negative variation beyond the limit: samples are drawn for testing and the dealer’s explanation is called for; supply is suspended if it is not found satisfactory.',
  },
};

/** The consequence for a variation summary, or `null` when it is within limit. */
export function consequenceFor(v: DsrVariationSummary): Consequence | null {
  if (v.variationNotWithinLimit === 0) return null;
  return v.variationNotWithinLimit > 0 ? CONSEQUENCE.HIGH : CONSEQUENCE.LOW;
}
