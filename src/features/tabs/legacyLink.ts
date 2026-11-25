/**
 * A conversation id as the server writes it. Checked before an old-style link is
 * trusted, because the id goes straight into a route.
 */
const LEGACY_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * The thread an old-style link names, or null.
 *
 * `/chat?c=<id>` and `/?c=<id>` are the forms older notifications carry (the native
 * shell turns a push that names only a conversation into that link). Both the home
 * route and the chat list send such a link on into the thread, so the check lives
 * in one place.
 */
export function legacyThreadId(params: URLSearchParams): string | null {
  const id = params.get('c');
  return id && LEGACY_ID.test(id) ? id : null;
}
