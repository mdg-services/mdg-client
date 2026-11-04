/**
 * Registering a new dealer from the app.
 *
 * "Sign up" in the app is the website's enrolment form, filled in here and sent
 * to the SAME endpoint the website uses (`mdgservices.in/api/enroll`). That
 * endpoint emails the MDG inbox, sends the dealer a welcome when an email was
 * given, and hands the registration to our own API, which opens the account at
 * once unless a person needs to look at it first. The dealer chooses their own
 * password on this form; it travels in that one request and is stored only as a
 * one-way hash, never emailed or shown to anyone. They sign in with their mobile
 * number and that password — straight away, when the account is ready.
 *
 * The rules below mirror the endpoint's own schema
 * (`mdg-landing/server/validation.ts`) so the screen never sends a form the
 * endpoint would refuse. Change them together.
 */

export const SITE_TYPES = ['Type A', 'Type B'] as const;
export type SiteType = (typeof SITE_TYPES)[number];

/**
 * The endpoint's own mobile rule (`mdg-landing/src/lib/mobile.ts`), now kept once in
 * `@dk/shared` (`lib/mobile.ts`) so the admin's Add member and the server hold a login
 * to the same rule as this screen and the sign-in. `toMobile` is the 10-digit mobile
 * that `raw` names, or null; `digitsOf` is only the digits, in any Indian script.
 */
export { digitsOf, signInMobileOf as toMobile } from '@dk/shared';

export const LIMITS = { name: 120, email: 200, pumpName: 160, sapCode: 60 } as const;

/** The password rule: at least 8 characters (the endpoint's, and the sign-in screen's) and at most 200. */
export const PASSWORD_LIMITS = { min: 8, max: 200 } as const;

/**
 * The film link's share code, when the registration screen was opened from one
 * (`?r=<code>`). The endpoint's own rule (`[A-Za-z0-9_-]`, 1 to 32); anything
 * else is left out rather than sent to be dropped.
 */
export function refFromSearch(search: string): string | undefined {
  const raw = new URLSearchParams(search).get('r')?.trim();
  return raw && /^[A-Za-z0-9_-]{1,32}$/.test(raw) ? raw : undefined;
}

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
  /** The password they chose. Goes to the endpoint and nowhere else; never logged. */
  password: string;
  /** The one tick also agrees to WhatsApp messages about the account. */
  consentWhatsApp: true;
  /** The screen's language: which Terms text the tick is recorded against. */
  lang: 'hi' | 'en';
  /** The film link's share code, when the screen was opened from one. */
  ref?: string;
  /** One id per filled-in form, so a send pressed twice is one registration. */
  submissionId: string;
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
 * Where the dealer stands once the form is in, as the endpoint answers it
 * (`mdg-landing/src/lib/enrollAccount.ts`): `ready` — the account is open, sign
 * in; `existing` — this mobile already signs in to an account; `waiting` — MDG's
 * team looks at it first. An endpoint from before the answer existed says
 * nothing, which is `waiting`: what this screen always said.
 */
export type EnrollAccount = 'ready' | 'existing' | 'waiting';

export function enrollAccountOf(value: unknown): EnrollAccount {
  return value === 'ready' || value === 'existing' ? value : 'waiting';
}

/**
 * Send the form. Resolves, with where the dealer now stands, once the endpoint
 * says the emails went out; throws an `EnrollError` otherwise.
 *
 * Deliberately not `apiFetch`: that client is bound to our API's base URL and
 * its auth handling, and a 401 there signs the user out — none of which has
 * anything to do with someone who has no account yet.
 */
export async function submitEnrollment(payload: EnrollmentPayload): Promise<EnrollAccount> {
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
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; account?: unknown };
  if (!res.ok || !data.ok) {
    throw new EnrollError(res.status, data.error || `Enrolment failed (${res.status})`);
  }
  return enrollAccountOf(data.account);
}
