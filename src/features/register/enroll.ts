/**
 * Registering a new dealer from the app.
 *
 * Nobody can create their own login: MDG makes every dealer's ID and password.
 * So "sign up" in the app is the website's enrolment form, filled in here and
 * sent to the SAME endpoint the website uses (`mdgservices.in/api/enroll`).
 * That endpoint emails the MDG inbox and, when an email was given, sends the
 * dealer a welcome. Nothing is written to our own API and no account exists
 * until the team sets one up after the call.
 *
 * The rules below mirror the endpoint's own schema
 * (`mdg-landing/server/validation.ts`) so the screen never sends a form the
 * endpoint would refuse. Change them together.
 */

export const SITE_TYPES = ['Type A', 'Type B'] as const;
export type SiteType = (typeof SITE_TYPES)[number];

/** A 10-digit Indian mobile number, as the endpoint hands it on. */
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

/** Marks that only space a number out, and are dropped. */
const SEPARATORS = /[\s\-.()]/;

/**
 * The endpoint's own mobile rule (`mdg-landing/src/lib/mobile.ts`, copied):
 * the 10-digit mobile that `raw` names, or null when it names none. Hindi (and
 * other Indian) digits, spaces, dashes, dots, brackets, +91 / 91 and a leading
 * 0 are all fine; a letter or any other mark is a typo and makes it null. The
 * country code or the 0 comes off only when it is extra: "9123456789" is
 * itself a mobile number.
 */
export function toMobile(raw: string): string | null {
  let digits = '';
  for (const ch of raw) {
    const cp = ch.codePointAt(0) ?? 0;
    const zero = ZEROS.find((z) => cp >= z && cp <= z + 9);
    if (zero !== undefined) digits += String(cp - zero);
    else if (ch === '+') digits += ch;
    else if (!SEPARATORS.test(ch)) return null;
  }
  const local = digits.replace(/^(?:\+?91|0)(?=\d{10}$)/, '');
  return MOBILE_RE.test(local) ? local : null;
}

export const LIMITS = { name: 120, email: 200, pumpName: 160, sapCode: 60 } as const;

export interface EnrollmentPayload {
  name: string;
  mobile: string;
  /** Empty means "not given"; the endpoint treats "" the same as absent. */
  email: string;
  siteType: SiteType;
  pumpName: string;
  sapCode: string;
  agree: true;
  /** Tells the MDG inbox the form came from the app, not the website. */
  source: 'app';
}

const ENROLL_URL: string =
  (import.meta.env.VITE_ENROLL_URL as string | undefined) ??
  'https://mdgservices.in/api/enroll';

export class EnrollError extends Error {
  /** HTTP status, or 0 when the request never got an answer. */
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'EnrollError';
    this.status = status;
  }
}

/**
 * Send the form. Resolves once the endpoint says the emails went out; throws
 * an `EnrollError` otherwise.
 *
 * Deliberately not `apiFetch`: that client is bound to our API's base URL and
 * its auth handling, and a 401 there signs the user out — none of which has
 * anything to do with someone who has no account yet.
 */
export async function submitEnrollment(payload: EnrollmentPayload): Promise<void> {
  let res: Response;
  try {
    res = await fetch(ENROLL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    throw new EnrollError(0, err instanceof Error ? err.message : 'Network error');
  }
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) {
    throw new EnrollError(res.status, data.error || `Enrolment failed (${res.status})`);
  }
}
