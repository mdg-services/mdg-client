/**
 * Where a person lands once they have signed in (spec 4.9): the address they were going to when the
 * app sent them to Sign in (`state.from`, set by `ProtectedLayout`), so a push, a report link or a
 * chat link opened while signed out is not lost. Otherwise Today.
 *
 * `from` arrives as a string, `"/chat/abc?c=xyz"` (the path with its query kept), or as the router's
 * own `{ pathname, search, hash }`. It is only ever followed when it is an address INSIDE the app:
 * one path starting with a single `/`, no scheme, no `//`, and never the sign-in or register
 * screens themselves (that would loop). Anything else is Today.
 */
export type FromState = string | { pathname?: unknown; search?: unknown; hash?: unknown } | null | undefined;

const SCREENS_BEFORE_SIGN_IN = /^\/(login|register)(\/|\?|#|$)/;

function asAddress(from: FromState): string | null {
  if (typeof from === 'string') return from;
  if (from && typeof from === 'object' && typeof from.pathname === 'string') {
    const search = typeof from.search === 'string' ? from.search : '';
    const hash = typeof from.hash === 'string' ? from.hash : '';
    return `${from.pathname}${search}${hash}`;
  }
  return null;
}

/** The address inside the app to go to after sign-in, or `/`. */
export function landingPath(from: FromState): string {
  const address = asAddress(from);
  if (!address) return '/';
  if (!address.startsWith('/') || address.startsWith('//') || address.includes('\\')) return '/';
  if (Array.from(address).some((ch) => ch.charCodeAt(0) < 32)) return '/';
  if (SCREENS_BEFORE_SIGN_IN.test(address)) return '/';
  return address;
}

/** `state.from` out of a router location's state, whatever else it carries. */
export function fromOf(state: unknown): FromState {
  if (!state || typeof state !== 'object') return null;
  const from = (state as { from?: unknown }).from;
  if (typeof from === 'string') return from;
  if (from && typeof from === 'object') return from as FromState;
  return null;
}
