/**
 * What each IRAS product code IS — the table that lets the DSR configure itself.
 *
 * Setting a dealer up used to mean typing thirteen fields per product: a key,
 * two labels, a tank label, the IRAS product codes, the tank numbers, the nozzle
 * numbers, two percentages, and four inspection baselines. Eleven of those
 * thirteen are not decisions at all — they are facts about the outlet that the
 * portal already reports in every shift snapshot, or facts about the grade that
 * are the same at every outlet in the country. Only the inspection baselines are
 * genuinely per-dealer knowledge, because they are a physical measurement taken
 * on a day the portal no longer reports.
 *
 * So the layout comes from the data (see the backend's `dsr-report/layout.ts`)
 * and the grade comes from this table, and the operator is left with the four
 * numbers only they can know.
 *
 * An unknown code is NOT an error. Outlets add grades, and IndianOil adds codes,
 * and a dealer whose new premium nozzle stops their whole report from generating
 * would be a worse failure than one whose report needs a label filled in. So an
 * unrecognised code still produces a complete, working product entry — keyed and
 * labelled by the code itself — and marks itself {@link DsrProductProfile.provisional}
 * so the setup screen can ask a human for the two things this table would have
 * known: what to call it, and how much of it evaporates.
 */

/** Which fuel family a grade belongs to; the evaporation allowance follows it. */
export type DsrProductFamily = 'DIESEL' | 'PETROL' | 'UNKNOWN';

/**
 * The evaporation/leakage allowance for each family, as a percent of throughput.
 *
 * These are the figures the dealers' own workbooks apply (`VR!E27`): petrol
 * evaporates roughly three times as fast as diesel, so the band a petrol tank is
 * judged against is correspondingly wider.
 */
export const DSR_LEAKAGE_PCT_BY_FAMILY: Record<DsrProductFamily, number | null> = {
  DIESEL: 0.25,
  PETROL: 0.75,
  // Deliberately null rather than a middle guess: an evaporation allowance is
  // the difference between "within limit" and a variation the dealer has to act
  // on, and inventing one for a grade nobody has classified would be a silent
  // wrong answer where an empty field is a visible question.
  UNKNOWN: null,
};

/**
 * The permissible variation band, as a percent of current stock (`VR!E29`).
 * The same 4% applies to every grade in every workbook seen so far, so it is a
 * default rather than a per-grade fact — the config still stores it per product
 * so a site with a different band can say so.
 */
export const DSR_DEFAULT_PERMISSIBLE_PCT = 4;

/** What a grade is called and how it behaves. */
export interface DsrProductProfile {
  /** The IRAS product code this profile is for, e.g. `HS`. */
  prodCode: string;
  /** Stable key used in the config and the report, e.g. `HSD`. */
  key: string;
  labelEn: string;
  labelHi: string;
  family: DsrProductFamily;
  /** Evaporation allowance (% of throughput), or null when unclassified. */
  leakagePct: number | null;
  /**
   * True when this profile was invented from an unrecognised code rather than
   * read from the table. Everything in it is a placeholder a human should
   * confirm — above all `leakagePct`, which will be null.
   */
  provisional: boolean;
}

/**
 * The grades this platform has actually seen in IRAS data, keyed by product code.
 *
 * Add a row only with evidence — a snapshot or a dealer workbook that names the
 * grade. A guessed label prints on a report the dealer reads.
 */
const CATALOG: Record<string, Omit<DsrProductProfile, 'prodCode' | 'provisional'>> = {
  HS: {
    key: 'HSD',
    labelEn: 'HIGH SPEED DIESEL',
    labelHi: 'हाई स्पीड डीजल',
    family: 'DIESEL',
    leakagePct: DSR_LEAKAGE_PCT_BY_FAMILY.DIESEL,
  },
  MS: {
    key: 'MS',
    labelEn: 'MOTOR SPIRIT',
    labelHi: 'मोटर स्पिरीट',
    family: 'PETROL',
    leakagePct: DSR_LEAKAGE_PCT_BY_FAMILY.PETROL,
  },
  // IndianOil's branded grades. Both appear in the dealers' own workbooks —
  // X2 at 1E/2E/5E/9E and XG at 9E — where they carry the petrol and diesel
  // allowances respectively (`VR!E27`), which is what fixes their family here.
  // The workbooks spell them "XTRA PREMIEUM" and "EXTRA GREEN"; the brand names
  // are XtraPremium and XtraGreen, and it is the brand that goes on a report the
  // dealer shows other people.
  X2: {
    key: 'XP',
    labelEn: 'XTRAPREMIUM',
    labelHi: 'एक्स्ट्रा प्रीमियम',
    family: 'PETROL',
    leakagePct: DSR_LEAKAGE_PCT_BY_FAMILY.PETROL,
  },
  XG: {
    key: 'XG',
    labelEn: 'XTRAGREEN',
    labelHi: 'एक्स्ट्रा ग्रीन',
    family: 'DIESEL',
    leakagePct: DSR_LEAKAGE_PCT_BY_FAMILY.DIESEL,
  },
};

/** Every product code this table knows, for display and validation. */
export const DSR_KNOWN_PROD_CODES = Object.keys(CATALOG);

/**
 * The profile for an IRAS product code, inventing a provisional one when the
 * code is unknown so discovery always yields a complete product.
 */
export function dsrProductProfile(prodCode: string): DsrProductProfile {
  const code = String(prodCode ?? '')
    .trim()
    .toUpperCase();
  const known = CATALOG[code];
  if (known) return { prodCode: code, provisional: false, ...known };
  return {
    prodCode: code,
    // The code itself is the least surprising placeholder: it is what the portal
    // calls the grade and what the dealer's own staff will recognise on a report.
    key: code || 'UNKNOWN',
    labelEn: code || 'UNKNOWN PRODUCT',
    labelHi: code || 'UNKNOWN PRODUCT',
    family: 'UNKNOWN',
    leakagePct: null,
    provisional: true,
  };
}
