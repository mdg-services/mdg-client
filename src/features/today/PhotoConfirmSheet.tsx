import { FileText } from 'lucide-react';
import * as React from 'react';

import { useT } from '@/lib/i18n';
import { imageAccept } from '@/lib/imageAccept';
import type { OutgoingAttachment } from '@/lib/uploadAttachment';
import { useDialog } from '@/lib/useDialog';

import { ACTION_BUTTON } from './WorkCard';

/** What the sheet holds: the picked file, what it is for, and whether a PDF may stand in for a photo. */
export interface PhotoToConfirm {
  item: OutgoingAttachment;
  /** What the photo answers, in the reader's words: one line under the question. */
  title: string;
  acceptsFile: boolean;
}

/**
 * "Send this photo?": the sheet a photo answer waits on, so a wrong gallery pick or a register
 * page shot too small is seen before it is filed as the answer (the chat's own preview does
 * the same). The photo is shown large; "Send" files it, "Choose another" opens the picker
 * again, and closing (the backdrop, Back, Escape) sends nothing.
 */
export function PhotoConfirmSheet({
  pending,
  onSend,
  onReplace,
  onClose,
}: {
  pending: PhotoToConfirm;
  onSend: () => void;
  onReplace: (file: File) => void;
  onClose: () => void;
}) {
  const t = useT();
  const panelRef = useDialog(onClose);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const { item, title, acceptsFile } = pending;
  const isImage = item.kind === 'image';
  const [url, setUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!isImage || typeof URL.createObjectURL !== 'function') {
      setUrl(null);
      return;
    }
    const made = URL.createObjectURL(item.file);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [item.file, isImage]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label={t('common.dismiss')}
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('today.photo.confirmTitle')}
        tabIndex={-1}
        data-testid="today-photo-confirm"
        className="relative mx-auto flex w-full max-w-md flex-col gap-3 rounded-t-2xl bg-wa-bar p-4 shadow-lg outline-none safe-bottom animate-in"
      >
        <p className="text-heading text-wa-bar-text">{t('today.photo.confirmTitle')}</p>
        <p className="break-words text-body text-wa-meta">{title}</p>
        <div className="flex max-h-[45vh] min-h-24 items-center justify-center overflow-hidden rounded-xl border border-wa-divider bg-wa-in">
          {isImage && url ? (
            <img src={url} alt={t('today.photo.confirmAlt')} className="max-h-[45vh] w-full object-contain" />
          ) : (
            <span className="flex items-center gap-2 p-4 text-body text-wa-bar-text">
              <FileText className="size-6 shrink-0" strokeWidth={1.75} aria-hidden />
              <span className="break-all">{item.file.name}</span>
            </span>
          )}
        </div>
        <button type="button" onClick={onSend} className={ACTION_BUTTON} data-testid="today-photo-confirm-send">
          {t('today.photo.confirmSend')}
        </button>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex min-h-12 w-full items-center justify-center rounded-xl border-2 border-wa-bar-text px-4 py-3 text-cta text-wa-bar-text active:bg-wa-row-active"
        >
          {t('today.photo.confirmAnother')}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={imageAccept(acceptsFile)}
          className="hidden"
          data-testid="today-photo-confirm-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) onReplace(file);
          }}
        />
      </div>
    </div>
  );
}
