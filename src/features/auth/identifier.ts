import { z } from 'zod';

import { toMobile } from '@/features/register/enroll';

/**
 * What the sign-in box and the "forgot password" sheet accept: a mobile number
 * OR an email, in one field.
 *
 * A dealer's mobile is their sign-in name (it is required when they register),
 * so the number is the common case and is sent as ten plain digits, however it
 * was typed: spaces, +91, a leading 0 and Hindi digits are all dropped here
 * (`toMobile`, the same rule the registration form uses). An email is trimmed
 * and lower-cased, as the server stores it. Anything that is neither is a typo
 * and is caught on the screen, not by a round trip.
 */
export type LoginIdentifier = { kind: 'mobile' | 'email'; value: string };

const emailShape = z.string().email();

export function parseIdentifier(raw: string): LoginIdentifier | null {
  const typed = raw.trim();
  if (!typed) return null;
  if (typed.includes('@')) {
    const email = typed.toLowerCase();
    return emailShape.safeParse(email).success ? { kind: 'email', value: email } : null;
  }
  const mobile = toMobile(typed);
  return mobile ? { kind: 'mobile', value: mobile } : null;
}
