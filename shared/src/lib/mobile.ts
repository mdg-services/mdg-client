/**
 * The mobile number a person signs in with: a 10-digit Indian mobile, 6 to 9 first.
 *
 * ONE RULE FOR EVERY DOOR. The dealer app's sign-in and registration screens hold a
 * number to it, and so does the website's registration endpoint
 * (`mdg-landing/src/lib/mobile.ts`, a copy, in another repo). The admin's Add member
 * and the member routes used to take any ten digits, so a login could be made that
 * the app then refused at sign-in (outlet 9999Z, 5 Nov 2026). Now the app, the
 * admin, the member routes and an approved registration all ask this.
 */

/** A 10-digit Indian mobile number. */
const MOBILE_RE = /^[6-9]\d{9}$/;

/**
 * Where zero sits in each script whose digits a phone keyboard in India can
 * type (Latin, Arabic-Indic, Persian, Devanagari, Bengali, Gurmukhi, Gujarati,
 * Odia, Tamil, Telugu, Kannada, Malayalam, full-width). Listed rather than
 * matched with `\p{Nd}`, which older Android WebViews cannot parse.
 */
const ZEROS = [
  0x30, 0x660, 0x6f0, 0x966, 0x9e6, 0xa66, 0xae6, 0xb66, 0xbe6, 0xc66, 0xce6, 0xd66, 0xff10,
];

/**
 * Marks that only space a number out, and are dropped: spaces, dashes, dots, brackets,
 * and the invisible marks a number copied from WhatsApp's contact info carries (the
 * direction marks, zero-width spaces and joiners). Listed by code, not `\p{Cf}`, for the
 * same old WebViews.
 */
const SEPARATORS = /[\s\-.()\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/;

/** What a form says when a number is not one anybody could sign in with. */
export const SIGN_IN_MOBILE_HINT = 'Enter a 10-digit mobile number starting with 6, 7, 8 or 9';

/**
 * Only the digits of `raw`, as plain 0-9 whatever script they were typed in (a
 * Hindi keyboard types "९८७६५"); every other character is dropped. For a box that
 * takes a run of digits and nothing else, such as the code in a message.
 */
export function digitsOf(raw: string): string {
  let out = '';
  for (const ch of raw) {
    const cp = ch.codePointAt(0) ?? 0;
    const zero = ZEROS.find((z) => cp >= z && cp <= z + 9);
    if (zero !== undefined) out += String(cp - zero);
  }
  return out;
}

/**
 * The 10-digit mobile that `raw` names, or null when it names none a person could
 * sign in with. Hindi (and other Indian) digits, spaces, dashes, dots, brackets,
 * +91 / 91 / 0091 and a leading 0 are all fine; a letter or any other mark is a typo
 * and makes it null. The country code or the 0 comes off only when it is extra:
 * "9123456789" is itself a mobile number. The answer is always plain 0-9 digits, which
 * is what a login must store: its sign-in key is read from ASCII digits only.
 */
export function signInMobileOf(raw: string | null | undefined): string | null {
  let digits = '';
  for (const ch of raw ?? '') {
    const cp = ch.codePointAt(0) ?? 0;
    const zero = ZEROS.find((z) => cp >= z && cp <= z + 9);
    if (zero !== undefined) digits += String(cp - zero);
    else if (ch === '+') digits += ch;
    else if (!SEPARATORS.test(ch)) return null;
  }
  const local = digits.replace(/^(?:0091|\+?91|0)(?=\d{10}$)/, '');
  return MOBILE_RE.test(local) ? local : null;
}
