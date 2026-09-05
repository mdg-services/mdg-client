import * as React from 'react';

import { fetchFreshInlineUrl, type AttachmentSource } from '@/lib/downloadAttachment';
import type { Attachment } from '@dk/shared/types';

export interface FreshImage {
  /** What to put in the `src`. */
  src: string | undefined;
  /** A replacement link is being fetched. */
  refreshing: boolean;
  /** The picture will not load and there is nothing left to try on its own. */
  failed: boolean;
  /** Hand this to the `<img onError>`. */
  onError: () => void;
  /** Let the reader ask again after a hard failure. */
  retry: () => void;
}

/**
 * An image link that re-signs itself when it goes stale.
 *
 * WHAT GOES WRONG WITHOUT IT
 * --------------------------
 * The URL that rides in with a message is presigned for 900 seconds. A screen
 * held open longer than that — the ordinary case for a dealer who reads a report
 * and comes back to it — serves a 403 to the next `<img>` request, and
 * `loading="lazy"` puts that request at the moment the picture is scrolled into
 * view, which is exactly when it is furthest past its signature. What the reader
 * saw was a grey broken box where the DSR card had been.
 *
 * ONE fresh presign, guarded by a ref, so a genuinely dead object cannot loop on
 * a 2G connection. After that the caller is told it `failed` and can offer a
 * `retry` — a person asking again is a different thing from a component
 * retrying itself, and is allowed.
 */
export function useFreshImageSrc(
  attachment: Attachment,
  source?: AttachmentSource,
): FreshImage {
  const [src, setSrc] = React.useState(attachment.url);
  const [refreshing, setRefreshing] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const spentRef = React.useRef(false);

  React.useEffect(() => {
    // A refetch — a socket reconnect re-signs every loaded page — hands down a
    // new URL, and that is a fresh start, not a retry.
    setSrc(attachment.url);
    setFailed(false);
    spentRef.current = false;
  }, [attachment.url]);

  const refresh = React.useCallback(async () => {
    if (!source) {
      setFailed(true);
      return;
    }
    setRefreshing(true);
    try {
      setSrc(await fetchFreshInlineUrl(attachment, source));
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setRefreshing(false);
    }
  }, [attachment, source]);

  const onError = React.useCallback(() => {
    if (spentRef.current) {
      setFailed(true);
      return;
    }
    spentRef.current = true;
    void refresh();
  }, [refresh]);

  const retry = React.useCallback(() => {
    spentRef.current = true; // the fresh URL gets one automatic go, not two
    setFailed(false);
    void refresh();
  }, [refresh]);

  return { src, refreshing, failed, onError, retry };
}
