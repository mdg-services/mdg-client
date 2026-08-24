/**
 * TT Density — the tanker invoices an outlet received, and the density each load
 * was certified at.
 *
 * Every tanker that reaches a pump arrives with a tax invoice, and printed on
 * that invoice, under each product line, is the figure the load was measured at:
 * `Density@15: 820.500`. That figure is what a dealer copies into their own
 * density register on the day the tanker lands, and it is the only reason this
 * service exists. Everything else on the invoice is carried along because it
 * identifies which tanker the figure came from.
 *
 * Two shapes, because two different things write them. {@link TtInvoice} is
 * written by a robot at half past seven in the morning and keyed by the invoice
 * number; {@link TtDensityDayLog} is written by a person with a camera and keyed
 * by the calendar day. The service fetches a SEVEN-day window every day, so any
 * one invoice is seen about seven times — which is why the invoice number, and
 * not the sighting, is the identity. See ADR 0010 §4.
 */
import type { DsrProductFamily } from '../dsr/products';

/** What a single run did about the window it fetched. */
export const TT_DENSITY_OUTCOMES = [
  /** The window was read and every listed invoice is now stored with its PDF. */
  'COLLECTED',
  /** The portal listed nothing for those days. A week without a tanker is an ordinary week. */
  'NO_INVOICES',
  /** Some invoices stored; at least one row failed or was left for the next run. */
  'PARTIAL',
  /** A rehearsal: everything resolved and read, nothing downloaded. */
  'DRY_RUN',
  /** The run could not complete; see the run's failure code. */
  'FAILED',
] as const;
export type TtDensityOutcome = (typeof TT_DENSITY_OUTCOMES)[number];

/** Whether we hold the bytes IndianOil issued for this invoice. */
export const TT_INVOICE_PDF_STATUSES = [
  /** Seen on the portal; the PDF has not been fetched yet, or the last attempt failed. */
  'PENDING',
  /** The bytes are in the bucket at `pdfKey` and will never be fetched again. */
  'STORED',
  /** Fetching failed `TT_PDF_MAX_ATTEMPTS` times; this one needs an engineer. */
  'FAILED',
] as const;
export type TtInvoicePdfStatus = (typeof TT_INVOICE_PDF_STATUSES)[number];

/** How much of the invoice's text we could read. */
export const TT_INVOICE_PARSE_STATUSES = [
  /** No PDF yet, so nothing has been read. */
  'PENDING',
  /** Every product line yielded a density. */
  'READ',
  /** At least one product line yielded a density and at least one did not. */
  'PARTIAL',
  /** Text was extracted but no product line yielded a density, or there was no text layer. */
  'UNREADABLE',
] as const;
export type TtInvoiceParseStatus = (typeof TT_INVOICE_PARSE_STATUSES)[number];

/** Whether the day's density-register page has been photographed. */
export const TT_REGISTER_DAY_STATUSES = [
  /** A photo is on file; the day is done. */
  'MARKED',
  /** No photo. The day is not done. */
  'MISSING',
] as const;
export type TtRegisterDayStatus = (typeof TT_REGISTER_DAY_STATUSES)[number];

/**
 * How many invoices back `getLatestDensities` looks for each product.
 *
 * A busy outlet takes one to three tankers a day, so forty invoices is two to
 * six weeks of deliveries — long enough that every grade the outlet actually
 * stocks has appeared at least once, short enough that the read is a single
 * bounded index scan rather than an aggregation over a dealer's whole history
 * (roughly 400–1,000 invoices a year each). A grade absent from the last forty
 * deliveries drops out of the headline, which is the right answer: printing a
 * months-old figure in large type beside today's is how a stale number gets
 * copied into a register.
 */
export const TT_LATEST_DENSITY_SCAN_LIMIT = 40;

/**
 * How many times a single invoice's PDF is chased before it is given up on.
 *
 * Three, not one, because the two likeliest causes — a portal hiccup and a run
 * that ran out of its seven minutes — both clear by themselves on tomorrow's
 * run. Not ten, because a fourth attempt on a row that has failed on three
 * different days is not a retry, it is a daily tax on every run for an invoice
 * that needs an engineer.
 */
export const TT_PDF_MAX_ATTEMPTS = 3;

/**
 * How many days a DEALER may still mark from the app, counting today.
 *
 * SEVEN, INCLUSIVE OF TODAY — today plus the six days before it. The oldest
 * date a dealer may mark is therefore `today - 6`, and
 * `TtDensityMeView.earliestMarkableDate` is computed exactly that way. Read the
 * constant as "how many days are open", never as "how many days back", or the
 * client's `<input min>` and the server's refusal will be one day apart and a
 * dealer will be told a day is too old by a screen that just offered it.
 *
 * Seven because it is the same seven as the portal's own filter and our fetch
 * window: one number in the whole service means one number to explain and no
 * place for two to drift. It is also what a person can honestly reconstruct
 * from a paper register they are holding.
 */
export const TT_REGISTER_DEALER_BACKDATE_DAYS = 7;

/**
 * How many days an ADMIN may mark on a dealer's behalf, counting today.
 *
 * Sixty, inclusive, so the oldest admin-markable date is `today - 59`. An
 * account manager clearing a backlog after a dealer's phone broke is the case;
 * a year of back-filled days from one photograph is not.
 */
export const TT_REGISTER_ADMIN_BACKDATE_DAYS = 60;

/** How many days of register history the DEALER's own `/me` payload carries. */
export const TT_REGISTER_RECENT_DAYS = 14;

/**
 * When a headline figure stops being "current" and starts being "old".
 *
 * Seven days is the portal's own filter and our fetch window, so anything
 * inside it is current by construction. Twenty-one days without a tanker of a
 * grade the outlet stocks is abnormal enough that somebody should ask about it —
 * so 8–20 days is `ageing` and 21+ is `stale`.
 *
 * Both surfaces read these two numbers. They are in `shared` and not in a
 * component precisely so the admin pane and the dealer's app cannot decide
 * "old" means different things about the same figure.
 */
export const TT_DENSITY_AGEING_AFTER_DAYS = 8;
export const TT_DENSITY_STALE_AFTER_DAYS = 21;

/** The three-state ladder a screen renders a headline figure in. */
export type TtDensityFreshness = 'FRESH' | 'AGEING' | 'STALE';

/** Which of the three states an age in whole IST days falls in. */
export function ttDensityFreshness(ageDays: number): TtDensityFreshness {
  if (ageDays >= TT_DENSITY_STALE_AFTER_DAYS) return 'STALE';
  if (ageDays >= TT_DENSITY_AGEING_AFTER_DAYS) return 'AGEING';
  return 'FRESH';
}

/** One product line of an invoice, as stored — the invoice's own words only. */
export interface TtInvoiceItem {
  /** SAP line-item number: 10, 20, 30… */
  itemNo: number | null;
  /** SAP material code, verbatim: `16730`. */
  materialCode: string;
  /** The invoice's short description, verbatim: `HSD-BSVI`. */
  description: string;
  /** Quantity as printed. Not converted — see `unit`. */
  quantity: number | null;
  /** The unit as printed, normally `KL`. */
  unit: string | null;
  /** The outlet tank the load went into, verbatim: `T018`. */
  tankNo: string | null;
  /** Tanker compartments, verbatim: `["3","4"]`. */
  compartments: string[];
  /** The parsed figure. Null when the line printed none we could read. */
  density15: number | null;
  /**
   * The figure exactly as printed: `"820.500"`. This is what the UI renders.
   * The invoice states no unit — kg/m³ at 15 °C is our reading of the
   * magnitude, not IndianOil's statement — so the digits are never reformatted.
   */
  density15Raw: string | null;
  /** The sample reference, verbatim: `HSD/PL/IOCTBR/18/24`. */
  sampleNo: string | null;
  /** Why a figure is missing or doubtful. Present only when something is wrong. */
  extractionNote?: string | null;
}

/** One product line as a screen sees it: the invoice's words plus our labels. */
export interface TtInvoiceProduct extends TtInvoiceItem {
  /** Platform product key — joins to `DsrProductProfile.key`. */
  productKey: string;
  labelEn: string;
  labelHi: string;
  family: DsrProductFamily;
  /** True when neither the material code nor the description was recognised. */
  provisional: boolean;
}

/** Why an invoice's PDF could not be fetched or read. */
export interface TtInvoiceFailure {
  at: string;
  code: string;
  reason: string;
  runId?: string | null;
}

/** One tanker invoice for one dealer. Identity is `(dealerId, sapInvoiceNo)`. */
export interface TtInvoice {
  id: string;
  dealerId: string;
  dealerCode?: string | null;
  /** The portal's SAP Invoice #, verbatim: `7010045406`. */
  sapInvoiceNo: string;
  /** IST calendar day, `YYYY-MM-DD`, normalised from the portal's table. */
  invoiceDate: string;
  /** The portal's own date text, verbatim: `22-08-2026`. */
  invoiceDateRaw?: string | null;
  /** `HH:mm` from the PDF. Null until the PDF is read. */
  invoiceTime?: string | null;
  /** The portal table's Vehicle #, verbatim: `BR09GC8009`. */
  vehicleNo?: string | null;
  /** The PDF's own TT number. Recorded separately; a mismatch is a warning, not an error. */
  ttNo?: string | null;

  /** When this invoice was first listed by the portal, and most recently re-listed. */
  firstSeenAt: string;
  lastSeenAt: string;
  /** How many runs have listed it. Seven-ish for an invoice a week old. */
  sightings: number;

  pdfStatus: TtInvoicePdfStatus;
  /** Never serialised to a client. Present here only so the store's own callers can sign it. */
  pdfSize?: number | null;
  /** SHA-256 of the stored bytes: what settles a dispute about whether we altered the invoice. */
  pdfSha256?: string | null;
  pdfCapturedAt?: string | null;
  pdfAttempts: number;
  pdfFailure?: TtInvoiceFailure | null;

  parseStatus: TtInvoiceParseStatus;
  /** The density printed in the invoice header. Recorded, never relied on. */
  headerDensity15?: number | null;
  docNumber?: string | null;
  invoiceTotal?: number | null;
  /** Verbatim, e.g. `0573542169 / Sales Order 0913183557`. */
  deliveryNoRaw?: string | null;
  deliveryNo?: string | null;
  salesOrderNo?: string | null;
  /** The date the PDF itself printed, normalised. */
  pdfInvoiceDate?: string | null;
  /** True when the PDF's date and the portal table's date disagree. */
  dateMismatch: boolean;

  products: TtInvoiceProduct[];
  /** Everything the parser wanted to say but could not fix. */
  parseWarnings: string[];

  createdAt: string;
  updatedAt: string;
}

/** The row shape of the invoice table under the headline. */
export interface TtInvoiceSummary {
  id: string;
  sapInvoiceNo: string;
  invoiceDate: string;
  invoiceTime?: string | null;
  vehicleNo?: string | null;
  pdfStatus: TtInvoicePdfStatus;
  parseStatus: TtInvoiceParseStatus;
  /**
   * One entry per product line, in invoice order.
   *
   * `quantity` and `unit` are here because the admin list renders
   * `[MS] 727.300 · 6 KL` on one line — a row that had to fetch the full
   * invoice to print its own quantity would be a request per row.
   */
  densities: {
    productKey: string;
    labelEn: string;
    labelHi: string;
    density15: number | null;
    density15Raw: string | null;
    tankNo: string | null;
    quantity: number | null;
    unit: string | null;
  }[];
}

/**
 * The headline: the most recent density this outlet received for one product.
 *
 * ORDER IS PART OF THE CONTRACT. `getLatestDensities` returns these already
 * sorted — `DIESEL` family first, then `PETROL`, then everything else, and
 * within a family by product key — and both surfaces render them in the order
 * they arrive. Sorting in each screen instead would mean the admin pane and the
 * dealer's app could disagree about which figure is the important one, which is
 * exactly the thing a dealer copying a number off a phone must never encounter.
 * Diesel leads because it is the higher-volume product at almost every outlet.
 *
 * There is no entry for a product that has never been delivered. This service
 * has no idea which grades an outlet stocks — only which grades have arrived —
 * so an "expected but never seen" tile is a fact we do not hold and must not
 * invent.
 */
export interface TtLatestDensity {
  productKey: string;
  labelEn: string;
  labelHi: string;
  family: DsrProductFamily;
  provisional: boolean;
  /** The SAP material code the invoice printed, e.g. `16730`. */
  materialCode: string;
  /** The invoice's own short description, verbatim, e.g. `EBMS`. */
  description: string;
  density15: number;
  /** As printed. Render this, not the number. */
  density15Raw: string;
  /** Which invoice it came from — always shown beside the figure. */
  invoiceId: string;
  sapInvoiceNo: string;
  invoiceDate: string;
  vehicleNo?: string | null;
  tankNo?: string | null;
  /** Whole IST days between that invoice's date and today. */
  ageDays: number;
}

/** One photograph of the density-register page. Nothing here is ever deleted. */
export interface TtRegisterPhoto {
  storageKey: string;
  filename: string;
  contentType: string;
  size: number;
  uploadedAt: string;
  /**
   * Who sent it. `name` is denormalised at write time on purpose: the admin's
   * day panel prints "Added by Priya (MDG)", and resolving a user id to a name
   * per day would be a second request per calendar cell.
   */
  uploadedBy: { kind: 'dealer' | 'admin'; userId: string | null; name: string | null };
  note?: string | null;
  /** Set when a later upload replaced this one for the same day. */
  supersededAt?: string | null;
}

/** One dealer's density-register day. Unique per `(dealerId, businessDate)`. */
export interface TtDensityDayLog {
  id: string;
  dealerId: string;
  dealerCode?: string | null;
  /** IST calendar day, `YYYY-MM-DD`. */
  businessDate: string;
  status: TtRegisterDayStatus;
  /** The photo that currently marks the day. */
  photo: TtRegisterPhoto | null;
  /** Earlier photos for the same day, newest first. A blurry photo is a real thing. */
  superseded: TtRegisterPhoto[];
  markedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A day reduced to the one fact a strip of days needs to show. */
export interface TtRegisterDaySummary {
  businessDate: string;
  status: TtRegisterDayStatus;
  markedAt: string | null;
  uploadedBy: { kind: 'dealer' | 'admin'; userId: string | null; name: string | null } | null;
  /** How many photos exist for the day, current plus superseded. */
  photoCount: number;
}

/**
 * The admin Vault pane's payload for one dealer. Never 404s: a dealer that has
 * never been collected returns an empty summary so the pane renders a clean
 * empty state rather than an error.
 */
export interface TtDensitySummary {
  dealerId: string;
  dealerCode?: string | null;
  /** Today in IST, so no screen has to work it out. */
  today: string;
  /** The big figures. Empty until the first invoice is read. */
  latest: TtLatestDensity[];
  invoiceCount: number;
  /** Invoices we have seen but whose PDF we do not yet hold. */
  pdfPendingCount: number;
  /** Invoices whose PDF was given up on. Non-zero means an engineer is needed. */
  pdfFailedCount: number;
  /** The most recent invoices, newest first. */
  recent: TtInvoiceSummary[];
  /** The last 14 IST days of register photos, newest first. */
  register: TtRegisterDaySummary[];
  /** Read from the most recent ServiceRun for this dealer and `tt-density`. */
  lastRunAt: string | null;
  lastOutcome: TtDensityOutcome | null;
  lastFailure: { at: string; reason: string; code: string; runId?: string | null } | null;
}

/**
 * What the dealer's own app sees: their densities and their days. Never an
 * invoice, never a PDF, never a rupee figure — the tax invoice is a financial
 * document and stays admin-only (ADR 0010 §13).
 *
 * The dealer DOES see the figures. That is the owner's stated requirement —
 * *"these extracted values … need to be shown at the top in big fonts"* — and it
 * is the whole reason a dealer opens this screen at all rather than the portal.
 * What they never see is our words for it: no "Density@15", no "kg/m³", no
 * "acknowledgement". Just DIESEL, the number, and which tanker it came off.
 */
export interface TtDensityMeView {
  dealerId: string;
  today: string;
  /**
   * False when this dealer does not have `tt-density` attached. The route
   * answers 200 with an otherwise-empty view rather than 404, so the app can
   * render its calm "not on for your pump yet" state instead of an error — the
   * same posture `GET /kavach/me` takes.
   */
  attached: boolean;
  /** Sorted diesel-first by the store; render in the order given. */
  latest: TtLatestDensity[];
  /** Newest first, `TT_REGISTER_RECENT_DAYS` long. */
  days: TtRegisterDaySummary[];
  /** How many of those days carry a photo. */
  markedDays: number;
  /**
   * The oldest date this dealer may still mark, `YYYY-MM-DD` IST —
   * `today - (TT_REGISTER_DEALER_BACKDATE_DAYS - 1)`. The client feeds this
   * straight into `<input type="date" min>` so the screen and the server refuse
   * exactly the same set of days.
   */
  earliestMarkableDate: string;
}

/** Two short-lived signed URLs for one stored object. */
export interface TtSignedFileUrls {
  /** `inline` disposition — for an `<iframe>` or an `<img>`. */
  viewUrl: string;
  /** `attachment` disposition — for a save. */
  downloadUrl: string;
  filename: string;
  contentType: string;
  expiresIn: number;
}
