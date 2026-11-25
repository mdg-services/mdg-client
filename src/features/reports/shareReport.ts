import { copyText } from '@/lib/clipboard';

/**
 * Share a report's plain-text summary (ADR 0056 §6).
 *
 * The phone's own share sheet when it has one (`navigator.share`: an iPhone, Chrome on
 * Android), so the dealer picks WhatsApp and the inspector's number as they would for any
 * message. A phone whose app view has no share sheet (many Android WebViews) gets the same text
 * on the clipboard and is told so, because "nothing happened" is the worst answer a share button
 * can give. No picture is made.
 *
 * Returns what happened, so the caller can say it in words:
 *  - `shared`     the share sheet took it (it says the rest itself)
 *  - `cancelled`  the dealer closed the share sheet: say nothing
 *  - `copied`     no sheet; the text is on the clipboard
 *  - `failed`     neither worked
 */
export type ShareOutcome = 'shared' | 'cancelled' | 'copied' | 'failed';

export async function shareReportText(text: string, title?: string): Promise<ShareOutcome> {
  const body = text.trim();
  if (!body) return 'failed';
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ text: body, ...(title ? { title } : {}) });
      return 'shared';
    } catch (err) {
      // The dealer backing out of the sheet is an answer, not a fault.
      if (err instanceof Error && err.name === 'AbortError') return 'cancelled';
      // Any other refusal (a WebView that has the function but not the permission): copy instead.
    }
  }
  return (await copyText(body)) ? 'copied' : 'failed';
}
