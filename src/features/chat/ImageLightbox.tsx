import { Download, X } from 'lucide-react';
import * as React from 'react';

import { Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import type { Attachment } from '@dk/shared/types';

/**
 * Full-screen image viewer shared by the chat thread and the media gallery.
 * Backdrop tap / close button dismiss; the download button presigns a FRESH
 * URL via the handler the caller provides (the embedded one expires).
 * Deliberately NO useScrollLock: /chat/:id lives in the fixed --vvh frame.
 */
export function ImageLightbox({
  attachment,
  onClose,
  onDownload,
}: {
  attachment: Attachment;
  onClose: () => void;
  onDownload?: (attachment: Attachment) => void;
}) {
  const t = useT();
  // The embedded presigned URL expires in ~15 min, so a session parked on the
  // gallery/thread serves a 403 to a fresh <img>. On error, presign ONE fresh
  // inline URL (no disposition param) and swap it in; the one-shot guard keeps
  // a genuinely dead key from refetching forever.
  const [src, setSrc] = React.useState(attachment.url);
  const [refreshing, setRefreshing] = React.useState(false);
  const retriedRef = React.useRef(false);
  React.useEffect(() => {
    setSrc(attachment.url);
    retriedRef.current = false;
  }, [attachment]);
  const onImageError = React.useCallback(async () => {
    if (retriedRef.current) return;
    retriedRef.current = true;
    setRefreshing(true);
    try {
      const data = await api.get<{ url: string }>('/v1/uploads/download-url', {
        key: attachment.storageKey,
      });
      setSrc(data.url);
    } catch {
      // Dead key / offline — keep the broken image; download still errors clearly.
    } finally {
      setRefreshing(false);
    }
  }, [attachment.storageKey]);
  return (
    <div
      role="dialog"
      aria-label={t('chat.imagePreview')}
      data-no-swipe
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
      onClick={onClose}
    >
      <div
        className="absolute right-4 top-4 flex items-center gap-2 safe-top"
        onClick={(e) => e.stopPropagation()}
      >
        {onDownload ? (
          <button
            type="button"
            aria-label={t('chat.download')}
            onClick={() => onDownload(attachment)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 active:bg-white/25"
          >
            <Download width={20} strokeWidth={1.75} />
          </button>
        ) : null}
        <button
          type="button"
          aria-label={t('chat.closePreview')}
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 active:bg-white/25"
        >
          <X width={22} strokeWidth={2} />
        </button>
      </div>
      {refreshing ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-white">
          <Spinner size={24} />
        </div>
      ) : null}
      {/* Stop taps on the image itself from bubbling to the backdrop's
          close handler — only the backdrop / close button should dismiss. */}
      <img
        src={src}
        alt={attachment.filename}
        decoding="async"
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        onClick={(e) => e.stopPropagation()}
        onError={() => void onImageError()}
        className="max-h-full max-w-full rounded-xl object-contain"
      />
    </div>
  );
}
