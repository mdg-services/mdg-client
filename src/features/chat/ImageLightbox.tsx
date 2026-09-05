import { Download, X } from 'lucide-react';
import * as React from 'react';

import { Spinner } from '@/components/ui';
import { ZoomableImage } from '@/components/ZoomableImage';
import { type AttachmentSource } from '@/lib/downloadAttachment';
import { useT } from '@/lib/i18n';
import { useBackToClose } from '@/lib/useBackToClose';
import { useFreshImageSrc } from '@/lib/useFreshImageSrc';
import type { Attachment } from '@dk/shared/types';

/**
 * Full-screen image viewer shared by the chat thread and the media gallery.
 *
 * The picture pinches, pans and double-taps — see `ZoomableImage`, which owns
 * the gestures and is shared with the density-register and staff-hardcopy
 * viewers. This owns what is particular to a chat attachment: the download
 * button, and saying something while a big PNG crawls down a 2G link.
 *
 * SAYING SOMETHING. A DSR card is a few hundred kilobytes and the screen behind
 * it is black, so with no spinner the reader could not tell a slow download from
 * a mis-tap, and a picture that never arrived left them looking at nothing at
 * all with no way to ask again. Both states are on screen now, in words, with a
 * button. `useFreshImageSrc` does the one automatic re-signing; the button is
 * for the person.
 *
 * The backdrop and the ✕ dismiss it. A tap on the picture does not: that is half
 * of a double-tap now, and `ZoomableImage` is the only thing that knows whether
 * a touch was a tap or the end of a drag.
 *
 * Deliberately NO useScrollLock: /chat/:id lives in the fixed --vvh frame.
 */
export function ImageLightbox({
  attachment,
  source,
  onClose,
  onDownload,
}: {
  attachment: Attachment;
  /** The message carrying it — how a fresh URL gets presigned. */
  source: AttachmentSource;
  onClose: () => void;
  onDownload?: (attachment: Attachment, source: AttachmentSource) => void;
}) {
  const t = useT();
  // The phone's Back button closes the picture, not the chat behind it.
  useBackToClose(onClose);
  const { src, refreshing, failed, onError, retry } = useFreshImageSrc(attachment, source);
  // Reset per picture: the gallery swaps the attachment without remounting.
  const [loaded, setLoaded] = React.useState(false);
  React.useEffect(() => setLoaded(false), [src]);

  return (
    <div
      role="dialog"
      aria-label={t('chat.imagePreview')}
      data-no-swipe
      className="fixed inset-0 z-50 flex flex-col bg-black/90"
    >
      <ZoomableImage
        src={src}
        alt={attachment.filename}
        onError={onError}
        onLoad={() => setLoaded(true)}
        onDismiss={onClose}
        testId="lightbox-frame"
      />

      <div className="safe-top absolute right-4 top-4 z-10 flex items-center gap-2">
        {onDownload ? (
          <button
            type="button"
            aria-label={t('chat.download')}
            onClick={() => onDownload(attachment, source)}
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

      {failed ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8">
          <p className="text-center text-sm text-white/85">{t('chat.imageFailed')}</p>
          <button
            type="button"
            onClick={retry}
            className="rounded-full bg-white/15 px-5 py-2.5 text-sm font-medium text-white active:bg-white/25"
          >
            {t('common.retry')}
          </button>
        </div>
      ) : !loaded || refreshing ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-white">
          <Spinner size={24} />
        </div>
      ) : null}
    </div>
  );
}
