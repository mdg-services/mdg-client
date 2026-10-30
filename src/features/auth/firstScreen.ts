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
 * "Has signed in here" is a mark left on the phone at every sign-in, and by any
 * session that was already open when this rule arrived (`store/auth.ts`).
 * With storage switched off nothing can be remembered either way, so it is Sign
 * in, which is what the app showed before.
 */
const SIGNED_IN_BEFORE_KEY = 'mdg.client.signedInBefore';

export function markSignedInHere(): void {
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
