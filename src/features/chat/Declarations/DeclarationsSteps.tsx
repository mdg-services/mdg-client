import { Camera, Check, Send } from 'lucide-react';
import * as React from 'react';

import { PhotoThumb } from '@/components/PhotoViewer';
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
  LAST_LABEL_KEY,
  SLOT_LABEL_KEY,
  anyPhotoReused,
  canOfferReuse,
  freshPhotoInSlot,
  istToday,
  lastFiledDay,
  lastPhotoPair,
  photoInSlot,
  photosSignature,
  sendHint,
} from './declarationsView';

/**
 * The one screen where the Declarations box asks the owner for something (ADR 0037):
 * two photos of the washroom and the owner's word that they are today's. Everything
 * is passed in; the box owns the requests, the busy flag and the error words, and
 * the server's reply (the whole fresh view) is what moves the box on.
 *
 * When the outlet has filed before, the owner can put last time's two photos back with one
 * tap instead of taking them again. They still press Send and still give their word; when ANY
 * photo in the box is one put back, the word is that the washroom still looks like they show
 * (true of a photo taken today as well). The tap offers itself only while the box holds no new
 * photo of the owner's own: it replaces both slots, and must not throw a new one away.
 */

export interface CollectProps {
  view: DeclarationsView;
  /** An answer or an upload is on its way: every control is off. */
  busy: boolean;
  /** The slot whose file is on its way, if one is. */
  uploadingSlot: WashroomPhotoSlot | null;
  /** A photo for a slot. A slot that already holds one is a retake: the same call replaces it. */
  onPhoto: (slot: WashroomPhotoSlot, file: File) => void;
  /** Put last time's two photos back ("use the same photos"). */
  onReuse: () => void;
  /** That answer is on its way (the button shows it). */
  reusing: boolean;
  onSend: () => void;
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
  canReuse,
  disabled,
  uploading,
  onPhoto,
}: {
  slot: WashroomPhotoSlot;
  /** The photo the server holds in this slot, whatever its day. */
  photo: WashroomPhotoView | null;
  /** The photo is from an earlier day: it does not count, and must be taken again today. */
  stale: boolean;
  /** The "use the same photos" button is on the screen, so a line may point at it. */
  canReuse: boolean;
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
      <PhotoThumb url={photo?.url} label={label} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-x-1.5 text-[14px] font-medium leading-snug">
          {label}
          {photo && !stale && !uploading ? (
            <span className="flex items-center gap-1 text-[12px] font-normal text-wa-meta">
              <Check width={13} strokeWidth={2.5} className="text-success" aria-hidden />
              {t('chat.declPhotoAdded')}
              {photo.reused ? (
                <span
                  data-photo-reused
                  className="ml-1 rounded-full bg-wa-chip px-1.5 py-0.5 text-[11px] leading-none"
                >
                  {t('chat.declPhotoReused')}
                </span>
              ) : null}
            </span>
          ) : null}
        </p>
        {photo && stale && !uploading ? (
          <p className="text-[13px] font-normal leading-snug text-danger">
            {photo.reused === true && canReuse
              ? // A photo put back on an earlier day: the same-photos button dates it today
                // again, so say that, not only "take it again".
                t('chat.declPhotoOldReused', {
                  date: formatDmy(photo.at) ?? '',
                  button: t('chat.declReuse'),
                })
              : t('chat.declPhotoOld', { date: formatDmy(photo.at) ?? '' })}
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

/**
 * Last time's two photos, with the day they were sent and the one button that puts both back.
 * Each opens full size, so the owner can look before they say the washroom is still like it.
 */
function ReuseCard({
  last,
  day,
  busy,
  reusing,
  onReuse,
}: {
  last: Record<WashroomPhotoSlot, WashroomPhotoView>;
  day: string | null;
  busy: boolean;
  reusing: boolean;
  onReuse: () => void;
}) {
  const t = useT();
  return (
    <div
      data-declarations-reuse
      className="flex flex-col gap-2.5 rounded-md border border-wa-divider bg-wa-in px-3 py-2.5"
    >
      <div>
        <p className="text-[15px] font-medium leading-snug">{t('chat.declLastTitle')}</p>
        {day ? (
          <p className="text-[13px] leading-snug text-wa-meta">
            {t('chat.declLastWhen', { date: day })}
          </p>
        ) : null}
      </div>
      <div className="flex gap-3">
        {WASHROOM_PHOTO_SLOTS.map((slot) => (
          <figure
            key={slot}
            data-last-photo={slot}
            className="flex min-w-0 flex-1 flex-col items-center gap-1"
          >
            <PhotoThumb url={last[slot].url} label={t(LAST_LABEL_KEY[slot])} />
            <figcaption className="text-center text-[13px] leading-snug">
              {t(LAST_LABEL_KEY[slot])}
            </figcaption>
          </figure>
        ))}
      </div>
      <button
        type="button"
        disabled={busy}
        aria-busy={reusing}
        onClick={onReuse}
        className={PRIMARY_BUTTON}
      >
        {reusing ? (
          <Spinner size={16} />
        ) : (
          <Check width={16} strokeWidth={2.5} className="shrink-0" aria-hidden />
        )}
        {t('chat.declReuse')}
      </button>
    </div>
  );
}

/** The two photos, the owner's word, and the one button that sends them. */
export function CollectScreen({
  view,
  busy,
  uploadingSlot,
  onPhoto,
  onReuse,
  reusing,
  onSend,
}: CollectProps) {
  const t = useT();
  // The owner's word that the photos were taken today of their own washroom. It is
  // asked for again whenever a photo changes, so it always covers the pair as it stands.
  const [fresh, setFresh] = React.useState(false);
  const signature = photosSignature(view);
  React.useEffect(() => setFresh(false), [signature]);

  // Today by the phone's clock, read each time the box draws. A photo from an earlier day
  // does not count as added: the word "taken today" must not cover it.
  const today = istToday();
  const hint = sendHint(view, fresh, today);
  const ready = hint === 'ready';
  // Last time's photos are offered on top of the two slots: one tap fills both, and the way to
  // take new ones stays right under it. Not once the box holds a new photo of the owner's own.
  const last = lastPhotoPair(view);
  const offerReuse = last !== null && canOfferReuse(view, today);

  return (
    <div data-declarations-step="collect" className="flex flex-col gap-2">
      <p className="text-[15px] font-medium leading-snug">{t('chat.declCollectLine')}</p>
      {offerReuse ? (
        <>
          <ReuseCard
            last={last}
            day={lastFiledDay(view) ?? formatDmy(last.outside.at)}
            busy={busy}
            reusing={reusing}
            onReuse={onReuse}
          />
          <p className="text-[13px] font-medium leading-snug text-wa-meta">{t('chat.declOrNew')}</p>
        </>
      ) : null}
      <div className="flex flex-col gap-3">
        {WASHROOM_PHOTO_SLOTS.map((slot) => {
          const held = photoInSlot(view, slot);
          return (
            <PhotoSlot
              key={slot}
              slot={slot}
              photo={held}
              stale={held !== null && freshPhotoInSlot(view, slot, today) === null}
              canReuse={offerReuse}
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
        <span className="min-w-0 break-words">
          {t(anyPhotoReused(view) ? 'chat.declFreshSame' : 'chat.declFresh')}
        </span>
      </label>

      <button
        type="button"
        disabled={busy || !ready}
        aria-busy={busy}
        onClick={onSend}
        className={PRIMARY_BUTTON}
      >
        {busy && uploadingSlot === null && !reusing ? (
          <Spinner size={16} />
        ) : (
          <Send width={16} strokeWidth={2} className="shrink-0" aria-hidden />
        )}
        {t('chat.declSend')}
      </button>
      {!busy && hint === 'photos' ? (
        <p className="text-[12px] leading-snug text-wa-meta">{t('chat.declSendNeeds')}</p>
      ) : null}
      {/* Both photos are in and only the box is not ticked: say Send is still to be pressed,
          so a tap on "use the same photos" does not read as if it had sent them. */}
      {!busy && hint === 'tick' ? (
        <p data-send-hint="tick" className="text-[13px] font-medium leading-snug text-wa-meta">
          {t('chat.declSendTick')}
        </p>
      ) : null}
    </div>
  );
}
