/**
 * GST on what a dealer pays MDG (ADR 0022 §11): the 18% inside a payment, how
 * it splits between the Centre and the State, and the GSTIN check.
 *
 * EVERY PAYMENT AMOUNT INCLUDES GST. ₹3,540 is ₹3,000 for the service and ₹540
 * of tax. The invoice works backwards from the total the dealer paid, so the
 * figure on the invoice is always the figure that left their bank.
 *
 * WHICH TAX: a dealer registered in the same state as us (Haryana, code 06)
 * pays CGST 9% + SGST 9%; anyone else pays IGST 18%. The place of supply is the
 * dealer's state — from their GSTIN, or from the state the admin picked when
 * they have none.
 *
 * ROUNDING: each tax line is rounded to the paisa on its own, as a printed
 * invoice shows it, and whatever is left over (a paisa or two either way) is a
 * "Round off" line, so taxable + taxes + round off always equals the total.
 *
 * Shared because the server issues the invoice and the admin shows the same
 * split while a payment is being raised; two copies of a rounding rule is how
 * an invoice and the form that raised it disagree by a paisa.
 */

export const GST_RATE_PERCENT = 18;

/** The supplier's state. VRUOOM PRIVATE LIMITED is registered in Haryana. */
export const SUPPLIER_STATE_CODE = '06';

/** GST state codes: the first two digits of a GSTIN, and the place of supply. */
export const GST_STATES: Record<string, string> = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  // Daman and Diu before its 2020 merger into 26: GSTINs issued then still carry it.
  '25': 'Daman and Diu',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  // Andhra Pradesh before the 2014 split (37 since): older GSTINs still carry it.
  '28': 'Andhra Pradesh (old)',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '97': 'Other Territory',
  '99': 'Centre Jurisdiction',
};

const GSTIN_SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** `" 06abcde1234f1z5 "` → `"06ABCDE1234F1Z5"`. */
export function cleanGstin(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]/g, '');
}

/** The check character a GSTIN's first fourteen characters call for. */
export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    const v = GSTIN_CHARS.indexOf(first14[i] ?? '');
    const p = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36] ?? '';
}

/**
 * A real GSTIN: the right shape, a known state, and the right check character
 * — so one mistyped letter is caught on the form, not on an invoice the
 * dealer's accountant sends back.
 */
export function isGstin(raw: string): boolean {
  const g = cleanGstin(raw);
  if (!GSTIN_SHAPE.test(g)) return false;
  if (!GST_STATES[g.slice(0, 2)]) return false;
  return gstinCheckChar(g.slice(0, 14)) === g[14];
}

export interface GstSplit {
  /** The service's value before tax. */
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  /** What rounding left over; may be negative. Taxable + taxes + this = total. */
  roundOffPaise: number;
  totalPaise: number;
  /** Same state as the supplier: CGST + SGST. Otherwise IGST. */
  intraState: boolean;
}

/**
 * Split a GST-inclusive total. `placeOfSupply` is the buyer's two-digit state
 * code. ₹3,540 in Haryana → ₹3,000 + CGST ₹270 + SGST ₹270; elsewhere →
 * ₹3,000 + IGST ₹540.
 */
export function splitGstInclusive(totalPaise: number, placeOfSupply: string): GstSplit {
  const intraState = placeOfSupply === SUPPLIER_STATE_CODE;
  const taxablePaise = Math.round((totalPaise * 100) / (100 + GST_RATE_PERCENT));
  const half = Math.round((taxablePaise * GST_RATE_PERCENT) / 2 / 100);
  const full = Math.round((taxablePaise * GST_RATE_PERCENT) / 100);
  const cgstPaise = intraState ? half : 0;
  const sgstPaise = intraState ? half : 0;
  const igstPaise = intraState ? 0 : full;
  const roundOffPaise = totalPaise - taxablePaise - cgstPaise - sgstPaise - igstPaise;
  return {
    taxablePaise,
    cgstPaise,
    sgstPaise,
    igstPaise,
    roundOffPaise,
    totalPaise,
    intraState,
  };
}

/**
 * India's financial year for an instant, as invoice numbers print it:
 * 23 Oct 2026 → `26-27`; 15 Mar 2027 → `26-27`; 1 Apr 2027 → `27-28`. In IST.
 */
export function financialYearLabel(at: Date): string {
  const ist = new Date(at.getTime() + 5.5 * 60 * 60 * 1000);
  const y = ist.getUTCFullYear();
  const start = ist.getUTCMonth() >= 3 ? y : y - 1;
  const two = (n: number) => String(n % 100).padStart(2, '0');
  return `${two(start)}-${two(start + 1)}`;
}
