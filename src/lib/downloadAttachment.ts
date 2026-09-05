import * as React from 'react';

import { useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { isNativeShell, requestNativeDownload } from '@/lib/nativeBridge';
import type { Attachment } from '@dk/shared/types';

/** How the download was ultimately delivered to the user. */
export type DownloadMode = 'gallery' | 'browser';

/**
 * The message an attachment was found on.
 *
 * Presigning goes THROUGH the message rather than straight at the key, and this
 * is why. The old call was `GET /uploads/download-url?key=…`, which authorises
 * by key prefix and knows four of them: `avatars/`, `chat/`, `staff/`,
 * `kavach/`. Everything a service sends a dealer — both DSR cards, the Credit &
 * DOD card, the water-ingress card — is written by the run that produced it,
 * under `dealers/<dealerId>/…`, which is on no list. So the picture rendered
 * (the thread's read path presigns for display without asking) and the Download
 * button under it answered 403 for every report MDG has ever shared. The same
 * 403 broke the viewer's refresh-on-expiry, so a card left open past the URL's
 * 15 minutes became a broken image with no way back.
 *
 * The server cannot fix that by widening the list: `dealers/` also holds raw
 * portal capture. It fixes it by asking the ROW instead — this caller is a
 * participant of this conversation, this message is in it, and this key is one
 * the message carries — which needs the message, so the message comes along.
 */
export interface AttachmentSource {
  conversationId: string;
  messageId: string;
}

/**
 * A message the server has not acknowledged yet: the optimistic bubble the
 * composer put in the thread, whose id is a local `temp-…` stamp.
 */
function isPending(source: AttachmentSource): boolean {
  return source.messageId.startsWith('temp-');
}

/**
 * Where to ask for a fresh URL, and the one case where the message cannot
 * answer.
 *
 * A dealer who taps their own photograph the instant they send it is looking at
 * a bubble that exists only on this phone — there is no message row to authorise
 * through, and the message route would refuse the temporary id. What they are
 * downloading in that moment is always their OWN chat upload, under
 * `chat/<conversationId>/…`, which is exactly what the generic route authorises.
 * So that one case keeps the old path; everything else goes through the message.
 */
function downloadUrlPath(source: AttachmentSource): string {
  return isPending(source)
    ? '/v1/uploads/download-url'
    : `/v1/conversations/${source.conversationId}/messages/${source.messageId}/download-url`;
}

/**
 * Presign a FRESH inline URL. The signed `attachment.url` that rode in on the
 * message expires in 900s, so a thread left open serves a 403 to a new <img>;
 * this is what the viewer swaps in when one fails to load.
 */
export async function fetchFreshInlineUrl(
  attachment: Attachment,
  source: AttachmentSource,
): Promise<string> {
  const data = await api.get<{ url: string }>(downloadUrlPath(source), {
    key: attachment.storageKey,
  });
  return data.url;
}

/**
 * Presign a FRESH attachment-disposition URL, so navigating to it saves the file
 * under its own name instead of rendering it.
 */
export async function fetchFreshDownloadUrl(
  attachment: Attachment,
  source: AttachmentSource,
): Promise<string> {
  const data = await api.get<{ url: string }>(downloadUrlPath(source), {
    key: attachment.storageKey,
    disposition: 'attachment',
    // The generic route takes the name from the caller; the message route reads
    // it off the stored attachment and ignores this.
    ...(isPending(source) ? { filename: attachment.filename } : {}),
  });
  return data.url;
}

/**
 * Download an attachment. In the native shell, images go through the
 * 'media:download' bridge (gallery save when the module exists; the shell
 * falls back to the browser otherwise); an old shell that never answers gets
 * the window.open fallback — its nav gate hands the URL to Chrome, which
 * downloads it thanks to the attachment disposition. A plain browser just
 * navigates (no CORS involved). Throws when every path failed.
 */
export async function downloadAttachment(
  attachment: Attachment,
  source: AttachmentSource,
): Promise<DownloadMode> {
  const url = await fetchFreshDownloadUrl(attachment, source);
  if (isNativeShell()) {
    const result = await requestNativeDownload({
      id: `dl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url,
      filename: attachment.filename,
      contentType: attachment.contentType,
      kind: attachment.kind,
    });
    if (result.ok) return result.mode ?? 'browser';
    if (!result.timedOut) throw new Error(result.error || 'Download failed');
    // Old shell without the handler — fall through to the browser path.
  }
  window.open(url, '_blank', 'noopener');
  return 'browser';
}

/**
 * The download action with its user feedback: a sticky "Saving…" toast while
 * the presign + bridge round-trip runs, then saved-to-gallery / started-in-
 * browser / failed. Returns a stable callback (safe as a memoized-child prop).
 */
export function useAttachmentDownload(): (
  attachment: Attachment,
  source: AttachmentSource,
) => Promise<void> {
  const t = useT();
  const toast = useToast();
  return React.useCallback(
    async (attachment: Attachment, source: AttachmentSource) => {
      const savingId = toast.info(t('chat.saving'), { duration: 0 });
      try {
        const mode = await downloadAttachment(attachment, source);
        toast.dismiss(savingId);
        if (mode === 'gallery') toast.success(t('chat.savedToGallery'));
        else toast.info(t('chat.downloadingInBrowser'));
      } catch {
        toast.dismiss(savingId);
        toast.error(t('chat.downloadFailed'));
      }
    },
    [t, toast],
  );
}
