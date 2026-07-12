/**
 * Reading the name off a thrown thing, without trusting `instanceof`.
 *
 * `getUserMedia` rejects with a **DOMException**, and `DOMException instanceof
 * Error` is not reliably true: WebIDL only made DOMException inherit from Error in
 * 2017, and older Android WebViews — precisely the devices this app runs on — still
 * ship engines where it does not. jsdom gets it wrong too.
 *
 * So `err instanceof Error` silently throws away `NotAllowedError` /
 * `NotReadableError` / `NotFoundError` on exactly the phones we most need to hear
 * from. Duck-type instead: anything carrying a string `name` is close enough, and
 * the name is the whole story.
 */

/** True for Errors, DOMExceptions, and anything else shaped like one. */
export function isErrorLike(e: unknown): e is Error {
  if (e instanceof Error) return true;
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as { name?: unknown }).name === 'string' &&
    typeof (e as { message?: unknown }).message === 'string'
  );
}

/** The exception name (`NotReadableError`, `TypeError`, …), or a stable fallback. */
export function errorName(e: unknown): string {
  if (isErrorLike(e)) return e.name || 'UnknownError';
  return 'UnknownError';
}

/** The message, if there is one. */
export function errorMessage(e: unknown): string | undefined {
  return isErrorLike(e) ? e.message : undefined;
}
