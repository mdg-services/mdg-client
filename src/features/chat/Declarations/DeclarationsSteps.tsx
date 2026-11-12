import { Camera, Check, Image as ImageIcon, Send } from 'lucide-react';
import * as React from 'react';

import { Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import {
  WASHROOM_PHOTO_SLOTS,
  type DeclarationsView,
  type WashroomPhotoSlot,
  type WashroomPhotoView,
} from '@dk/shared/types';

import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../DuOtpSteps';
import { formatDmy } from '../duOtpView';

import {
  canSend,
  freshPhotoInSlot,
  istToday,
  photoInSlot,
  photosSignature,
} from './declarationsView';

/**
 * The one screen where the Declarations box asks the owner for something (ADR 0037):
 * two photos of the washroom and the owner's word that they are today's. Everything
 * is passed in; the box owns the requests, the busy flag and the error words, and
 * the server's reply (the whole fresh view) is what moves the box on.
 */

export interface CollectProps {
  view: DeclarationsView;
  /** An answer or an upload is on its way: every control is off. */
  busy: boolean;
  /** The slot whose file is on its way, if one is. */
  uploadingSlot: WashroomPhotoSlot | null;
  /** A photo for a slot. A slot that already holds one is a retake: the same call replaces it. */
  onPhoto: (slot: WashroomPhotoSlot, file: File) => void;
  onSend: () => void;
}

const SLOT_LABEL_KEY = {
  outside: 'chat.declSlotOutside',
  inside: 'chat.declSlotInside',
} as const satisfies Record<WashroomPhotoSlot, string>;

/** A photo's thumbnail, openable full size through its short-lived link. */
function PhotoThumb({ photo, label }: { photo: WashroomPhotoView | null; label: string }) {
  const box =
    'flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-wa-chip';
  if (photo?.url) {
    return (
      <a href={photo.url} target="_blank" rel="noopener noreferrer" className={box}>
        <img src={photo.url} alt={label} loading="lazy" className="h-full w-full object-cover" />
      </a>
    );
  }
  return (
    <span className={box} role="img" aria-label={label}>
      <ImageIcon width={22} strokeWidth={1.5} className="text-wa-meta" aria-hidden />
    </span>
  );
}

/**
 * One photo slot. The file input sits inside its label, so the phone's own chooser
 * (camera, gallery) opens from the owner's tap on the label, which an Android
 * WebView allows; it is cleared after each pick so the same file can be chosen
 * again after a refusal.
 */
function PhotoSlot({
  slot,
  photo,
  stale,
  disabled,
  uploading,
  onPhoto,
}: {
  slot: WashroomPhotoSlot;
  /** The photo the server holds in this slot, whatever its day. */
  photo: WashroomPhotoView | null;
  /** The photo is from an earlier day: it does not count, and must be taken again today. */
  stale: boolean;
  disabled: boolean;
  uploading: boolean;
  onPhoto: (slot: WashroomPhotoSlot, file: File) => void;
}) {
  const t = useT();
  const label = t(SLOT_LABEL_KEY[slot]);
  return (
    <div
      data-photo-slot={slot}
      data-photo-stale={stale ? '' : undefined}
      className="flex items-center gap-2.5"
    >
      <PhotoThumb photo={photo} label={label} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-x-1.5 text-[14px] font-medium leading-snug">
          {label}
          {photo && !stale && !uploading ? (
            <span className="flex items-center gap-1 text-[12px] font-normal text-wa-meta">
              <Check width={13} strokeWidth={2.5} className="text-success" aria-hidden />
              {t('chat.declPhotoAdded')}
            </span>
          ) : null}
        </p>
        {photo && stale && !uploading ? (
          <p className="text-[13px] font-normal leading-snug text-danger">
            {t('chat.declPhotoOld', { date: formatDmy(photo.at) ?? '' })}
          </p>
        ) : null}
        <label
          className={cn(
            SECONDARY_BUTTON,
            'cursor-pointer focus-within:ring-2 focus-within:ring-focus-ring',
            disabled && 'pointer-events-none opacity-60',
          )}
        >
          {uploading ? (
            <Spinner size={16} />
          ) : (
            <Camera width={16} strokeWidth={2} className="shrink-0" aria-hidden />
          )}
          <span className="min-w-0 break-words">
            {uploading
              ? t('chat.declUploading')
              : photo
                ? t('chat.declPhotoRetake')
                : t('chat.declPhotoTake')}
          </span>
          <input
            type="file"
            accept="image/*"
            disabled={disabled}
            onChange={(e) => {
              const file = e.target.files?.[0];
              // So choosing the same file again (after a refusal) fires a change.
              e.target.value = '';
              if (file) onPhoto(slot, file);
            }}
            className="sr-only"
          />
        </label>
      </div>
    </div>
  );
}

/** The two photos, the owner's word, and the one button that sends them. */
export function CollectScreen({ view, busy, uploadingSlot, onPhoto, onSend }: CollectProps) {
  const t = useT();
  // The owner's word that the photos were taken today of their own washroom. It is
  // asked for again whenever a photo changes, so it always covers the pair as it stands.
  const [fresh, setFresh] = React.useState(false);
  const signature = photosSignature(view);
  React.useEffect(() => setFresh(false), [signature]);

  // Today by the phone's clock, read each time the box draws. A photo from an earlier day
  // does not count as added: the word "taken today" must not cover it.
  const today = istToday();
  const ready = canSend(view, fresh, today);

  return (
    <div data-declarations-step="collect" className="flex flex-col gap-2">
      <p className="text-[15px] font-medium leading-snug">{t('chat.declCollectLine')}</p>
      <div className="flex flex-col gap-3">
        {WASHROOM_PHOTO_SLOTS.map((slot) => {
          const held = photoInSlot(view, slot);
          return (
            <PhotoSlot
              key={slot}
              slot={slot}
              photo={held}
              stale={held !== null && freshPhotoInSlot(view, slot, today) === null}
              disabled={busy}
              uploading={uploadingSlot === slot}
              onPhoto={onPhoto}
            />
          );
        })}
      </div>

      <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-wa-divider bg-wa-in px-3 py-1.5 text-[15px] leading-snug">
        <input
          type="checkbox"
          checked={fresh}
          disabled={busy}
          onChange={(e) => setFresh(e.target.checked)}
          className="h-5 w-5 shrink-0 accent-wa-accent"
        />
        <span className="min-w-0 break-words">{t('chat.declFresh')}</span>
      </label>

      <button
        type="button"
        disabled={busy || !ready}
        aria-busy={busy}
        onClick={onSend}
        className={PRIMARY_BUTTON}
      >
        {busy && uploadingSlot === null ? (
          <Spinner size={16} />
        ) : (
          <Send width={16} strokeWidth={2} className="shrink-0" aria-hidden />
        )}
        {t('chat.declSend')}
      </button>
      {!ready && !busy ? (
        <p className="text-[12px] leading-snug text-wa-meta">{t('chat.declSendNeeds')}</p>
      ) : null}
    </div>
  );
}
