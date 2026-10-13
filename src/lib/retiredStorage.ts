/**
 * Browser storage that an older version of the app filled and this one never
 * reads.
 *
 * THE OFFLINE ASK QUEUE. Before asks moved into the chat, a photograph a dealer
 * was sending to MDG waited in `localStorage` (up to three of them, each up to
 * ~1.4 MB of base64) until the phone had signal. Nothing reads that key any more,
 * and a phone that updated with a photo still queued would carry megabytes of a
 * dealer's paperwork around forever — in the one place a later app version has
 * no reason to look. It is dropped, once, on start.
 *
 * What was in it is not lost in any way that matters: the request it answered is
 * asked again in the chat, and the dealer answers there.
 *
 * Wrapped in try/catch because a WebView with storage switched off throws on
 * ACCESS, not just on write, and the app must still start.
 */
export const RETIRED_STORAGE_KEYS = ['mdg.client.askQueue'] as const;

export function clearRetiredStorage(): void {
  for (const key of RETIRED_STORAGE_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* storage unavailable: nothing to clear, and nothing to report */
    }
  }
}
