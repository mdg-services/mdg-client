import { plannerSignUpEnabled } from '@/features/planner/enabled';
import { isEmbedded } from '@/lib/embedMode';

/**
 * Which screen someone who is not signed in sees first.
 *
 * A phone where nobody has ever signed in opens on the way to Register: most people who
 * install the app have no account yet, and an account opens the moment they
 * register. A phone where someone has signed in opens on Sign in, as it always
 * did — a dealer whose session ended, or who signed out, is never sent to a form
 * they have already filled in. Register itself starts with "Already registered?
 * Sign in", one tap for anybody this guesses wrong for.
 *
 * "Has an account here" is a mark left on the phone at every sign-in, by any
 * session that was already open when this rule arrived (`store/auth.ts`), and by
 * every registration this phone sent that went through (`RegisterPage`) — even
 * one a person at MDG still has to look at, so its sender comes back to Sign in
 * and not to a second form (30 Oct 2026: an owner registered twice that way).
 * With storage switched off nothing can be remembered either way, so it is Sign
 * in, which is what the app showed before.
 */
// The name it had when only a sign-in set it; kept, because phones already carry it.
const SIGNED_IN_BEFORE_KEY = 'mdg.client.signedInBefore';

export function markAccountHere(): void {
  // The extension's side panel writes nothing to this browser's storage (ADR 0032 §6).
  if (isEmbedded()) return;
  try {
    localStorage.setItem(SIGNED_IN_BEFORE_KEY, '1');
  } catch {
    // Storage off: Sign in stays the first screen anyway.
  }
}

/**
 * A phone with no account mark now opens on the choice screen, `/welcome` (ADR 0058
 * §3.1): "I run a petrol pump" goes on to Register, "I want to open one" to the New
 * Pump Guide form. With New Pump Guide's sign-up switched off there is nothing to
 * choose between, so it is Register, as before.
 */
export function firstScreen(): '/login' | '/register' | '/welcome' {
  try {
    if (localStorage.getItem(SIGNED_IN_BEFORE_KEY) === '1') return '/login';
    return plannerSignUpEnabled() ? '/welcome' : '/register';
  } catch {
    return '/login';
  }
}

/**
 * Is this the address the website's funnel link opens in the app (ADR 0059 §5)?
 * `/welcome?for=new-pump&from=<page>`, or the same query on `/`. Someone signed out
 * goes straight to the Kavach Shuruaat form whatever this phone remembers (they came
 * for it); someone signed in goes to their own home. Every other arrival keeps
 * `firstScreen` above.
 */
export function isNewPumpLink(search: string): boolean {
  return new URLSearchParams(search).get('for') === 'new-pump';
}
