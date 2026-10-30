/**
 * Which screen someone who is not signed in sees first.
 *
 * A phone where nobody has ever signed in opens on Register: most people who
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
  try {
    localStorage.setItem(SIGNED_IN_BEFORE_KEY, '1');
  } catch {
    // Storage off: Sign in stays the first screen anyway.
  }
}

export function firstScreen(): '/login' | '/register' {
  try {
    return localStorage.getItem(SIGNED_IN_BEFORE_KEY) === '1' ? '/login' : '/register';
  } catch {
    return '/login';
  }
}
