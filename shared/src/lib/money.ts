/**
 * Rupees on screen, paise everywhere else (types/payment.ts).
 *
 * Indian grouping (₹1,23,456.50), and paise shown only when there are any:
 * ₹4,999 not ₹4,999.00, because a dealer reads the trailing zeros as a
 * different number. Both apps and the server's push text use these, so the
 * same payment never reads two ways.
 */

const INR = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
const INR_PAISE = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

/** `499900` → `₹4,999`; `499950` → `₹4,999.50`; `-100` → `−₹1`. */
export function formatPaise(paise: number): string {
  const sign = paise < 0 ? '−' : '';
  const abs = Math.abs(Math.round(paise));
  const body = abs % 100 === 0 ? INR.format(abs / 100) : INR_PAISE.format(abs / 100);
  return `${sign}₹${body}`;
}

/**
 * What an admin typed in a rupee box, as paise — or null when it is not an
 * amount. Accepts `4999`, `4,999`, `₹ 4,999.5`, `4999.50`. Refuses more than
 * two decimal places (a typo, not a price), negatives, and empty text.
 */
export function parseRupeesToPaise(input: string): number | null {
  const cleaned = input.replace(/[₹,\s]/g, '').replace(/^Rs\.?/i, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ''] = cleaned.split('.');
  const paise = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return Number.isSafeInteger(paise) ? paise : null;
}
