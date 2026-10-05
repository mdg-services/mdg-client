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

/** The endpoint's own mobile rule: 10–15 of digits, spaces, `+` and `-`. */
export const MOBILE_PATTERN = /^[0-9+\s-]{10,15}$/;

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
