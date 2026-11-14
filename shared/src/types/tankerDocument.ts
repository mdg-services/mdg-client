/**
 * Tanker (TT) documents read from the IndianOil Partners PWA's "TT Info" screen (ADR 0044):
 * per vehicle, per document type, with a validity window. They feed the dealer's document
 * vault and the 15/3/2/1 reminder ladder, the same as dealership papers.
 *
 * `docType` is a slug derived from the portal's "License Type - <name>" label; `docLabel`
 * keeps the portal's own words. The portal may list types we have not catalogued, so the
 * slug is a free string, with a known set for nice display and reminder defaults.
 */

/** The document types seen on TT Info so far. The portal may show more; the slug is open. */
export const KNOWN_TANKER_DOC_TYPES = [
  'date-of-manufacture',
  'road-permit',
  'explosive-license',
  'vehicle-insurance',
  'fitness-license',
  'pollution-under-control',
  'calibration-certificate',
] as const;
export type KnownTankerDocType = (typeof KNOWN_TANKER_DOC_TYPES)[number];

/** Nice labels for the known types (admin-side display). Unknown slugs fall back to `docLabel`. */
export const TANKER_DOC_LABELS: Record<KnownTankerDocType, string> = {
  'date-of-manufacture': 'Date of Manufacture',
  'road-permit': 'Road Permit',
  'explosive-license': 'Explosive License',
  'vehicle-insurance': 'Vehicle Insurance',
  'fitness-license': 'Fitness License',
  'pollution-under-control': 'Pollution Under Control',
  'calibration-certificate': 'Calibration Certificate',
};

/**
 * Turn a portal "License Type - <name>" label into a stable slug. "License Type -
 * Pollution Under Control" → "pollution-under-control"; the prefix and punctuation go, the
 * rest is lower-kebab. A stable slug is what the idempotent upsert keys on.
 */
export function tankerDocSlug(label: string): string {
  return label
    .replace(/^\s*license type\s*[-:]\s*/i, '')
    .replace(/\(.*?\)/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** One tanker document, as the vault and admin views read it. Dates are `YYYY-MM-DD`. */
export interface TankerDocumentView {
  id: string;
  vehicleReg: string;
  docType: string;
  docLabel: string;
  /** `YYYY-MM-DD`, or null when the portal showed no start. */
  validFrom: string | null;
  /** `YYYY-MM-DD`; the date the reminder ladder counts down to. Null when the portal showed none. */
  validUntil: string | null;
  /** When MDG last read it off the portal (ISO). */
  fetchedAt: string;
}

/** A vehicle and all its documents, for the vault's per-vehicle grouping. */
export interface TankerVehicleDocuments {
  vehicleReg: string;
  documents: TankerDocumentView[];
  /** The soonest `validUntil` across its documents, or null — for sorting "most urgent first". */
  soonestValidUntil: string | null;
}

/** `GET /dealers/:id/tanker-documents` (admin) and the dealer's vault read. */
export interface TankerDocumentsView {
  vehicles: TankerVehicleDocuments[];
  /** When any document was last fetched (ISO), or null if never. */
  lastFetchedAt: string | null;
}
