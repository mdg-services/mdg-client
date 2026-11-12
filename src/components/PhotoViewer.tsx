import { Image as ImageIcon, X } from 'lucide-react';
import * as React from 'react';
import { createPortal } from 'react-dom';

import { ZoomableImage } from '@/components/ZoomableImage';
import { useT } from '@/lib/i18n';
import { useBackToClose } from '@/lib/useBackToClose';

/**
 * One photo, full screen and zoomable, over the app — closed by the ✕, a tap
 * beside the picture, or the phone's Back button.
 *
 * WHY A PHOTO NEVER OPENS AS A LINK
 * ---------------------------------
 * A photo the dealer gave us lives at a short-lived storage address, not on the
 * app's own address. Inside the phone app, the shell hands every outside address
 * to the phone's browser (that is how a web link in chat opens), so an
 * `<a href={photo.url} target="_blank">` threw the owner out of the app into
 * Chrome or Safari to look at their own drill photo — and on the web it opened a
 * stray tab. Show it here instead. `lib/leavingTheApp.guard.test.ts` keeps it that way.
 *
 * Mounted on `document.body`: a chat bubble may sit inside a transformed parent
 * (swipe-to-reply), and a `fixed` overlay inside one is pinned to the bubble,
 * not the screen. `data-no-swipe` keeps that swipe from reading the pinch.
 */
export function PhotoViewer({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  const t = useT();
  useBackToClose(onClose);
  return createPortal(
    <div
      role="dialog"
      aria-label={alt}
      data-no-swipe
      className="fixed inset-0 z-50 flex flex-col bg-black/85"
    >
      <button
        type="button"
        aria-label={t('common.cancel')}
        onClick={onClose}
        className="safe-top absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white active:bg-white/20"
      >
        <X width={22} strokeWidth={2} />
      </button>
      <ZoomableImage src={src} alt={alt} onDismiss={onClose} />
    </div>,
    document.body,
  );
}

/**
 * A small square photo that opens full size in `PhotoViewer` when tapped, or a
 * grey placeholder while there is no photo. The step boxes in chat (Mock Drill,
 * washroom declaration) show what the owner has added with it.
 */
export function PhotoThumb({ url, label }: { url: string | null | undefined; label: string }) {
  const [open, setOpen] = React.useState(false);
  const box =
    'flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-wa-chip';
  if (!url) {
    return (
      <span className={box} role="img" aria-label={label}>
        <ImageIcon width={22} strokeWidth={1.5} className="text-wa-meta" aria-hidden />
      </span>
    );
  }
  return (
    <>
      <button
        type="button"
        aria-label={label}
        onClick={() => setOpen(true)}
        className={`${box} active:opacity-80`}
      >
        <img
          src={url}
          alt={label}
          loading="lazy"
          draggable={false}
          className="h-full w-full object-cover"
        />
      </button>
      {open ? <PhotoViewer src={url} alt={label} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
