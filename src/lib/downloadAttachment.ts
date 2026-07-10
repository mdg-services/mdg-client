import * as React from 'react';

import { useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { isNativeShell, requestNativeDownload } from '@/lib/nativeBridge';
import type { Attachment } from '@dk/shared/types';

/** How the download was ultimately delivered to the user. */
export type DownloadMode = 'gallery' | 'browser';

/**
 * Presign a FRESH attachment-disposition URL for a stored object. The signed
 * `attachment.url` that rode in on the message expires in 900s, so a download
 * tapped on an older message would 403 — always fetch a new one.
 */
export async function fetchFreshDownloadUrl(attachment: Attachment): Promise<string> {
  const data = await api.get<{ url: string }>('/v1/uploads/download-url', {
    key: attachment.storageKey,
    disposition: 'attachment',
    filename: attachment.filename,
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
export async function downloadAttachment(attachment: Attachment): Promise<DownloadMode> {
  const url = await fetchFreshDownloadUrl(attachment);
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
export function useAttachmentDownload(): (attachment: Attachment) => Promise<void> {
  const t = useT();
  const toast = useToast();
  return React.useCallback(
    async (attachment: Attachment) => {
      const savingId = toast.info(t('chat.saving'), { duration: 0 });
      try {
        const mode = await downloadAttachment(attachment);
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
