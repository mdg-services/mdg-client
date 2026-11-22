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

/**
 * Types that carry a date but never run out, so they are never reminded about and never drawn
 * as expired. A tanker's date of manufacture is a fact about the vehicle, not a licence.
 */
export const NON_EXPIRING_TANKER_DOC_TYPES: readonly string[] = ['date-of-manufacture'];

/** True when the document is a licence or certificate that runs out. */
export function tankerDocExpires(docType: string): boolean {
  return !NON_EXPIRING_TANKER_DOC_TYPES.includes(docType);
}

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

/** The same names for a Hindi reader (the dealer's reminder). Unknown slugs fall back to the portal's own words. */
export const TANKER_DOC_LABELS_HI: Record<KnownTankerDocType, string> = {
  'date-of-manufacture': 'निर्माण की तारीख़',
  'road-permit': 'रोड परमिट',
  'explosive-license': 'विस्फोटक लाइसेंस',
  'vehicle-insurance': 'गाड़ी का बीमा',
  'fitness-license': 'फ़िटनेस सर्टिफ़िकेट',
  'pollution-under-control': 'प्रदूषण (PUC) सर्टिफ़िकेट',
  'calibration-certificate': 'कैलिब्रेशन सर्टिफ़िकेट',
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
  /** Whole days until it runs out (negative once gone); null when undated or not a licence that expires. */
  daysLeft: number | null;
  /** `expired`, `expiring` (inside the reminder window), `valid`; undefined = no verdict. */
  state: 'expired' | 'expiring' | 'valid' | undefined;
  /** How many reminders the dealer has been told about this date (sent, not written off). */
  remindersSent: number;
  /** When the dealer was last told (ISO), or null. */
  lastRemindedAt: string | null;
  /** True once the one-time "this has run out" notice went out. */
  lapsedNoticeSent: boolean;
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

/** One row of the team's "tanker papers running out" list: a document and the outlet it belongs to. */
export interface TankerExpiringRow extends TankerDocumentView {
  dealerId: string;
  dealerCode: string | null;
  dealerName: string | null;
}

/** `GET /tanker-documents/expiring` (admin): every dated tanker paper that is expired or inside the window. */
export interface TankerExpiringView {
  rows: TankerExpiringRow[];
  /** Days ahead that count as "running out" (the first step of the reminder ladder). */
  windowDays: number;
  /** Outlets that hold at least one tanker document. */
  outlets: number;
  /** When any document was last read (ISO), or null if none was. */
  lastFetchedAt: string | null;
}
