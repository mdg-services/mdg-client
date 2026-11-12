import { ApiError } from '@/lib/api';
import type { MessageKey, TFunction } from '@/lib/i18n';
import { ImageRejected } from '@/lib/squeezeImage';
import {
  WASHROOM_PHOTO_SLOTS,
  type DeclarationsView,
  type WashroomPhotoSlot,
  type WashroomPhotoView,
} from '@dk/shared/types';

import { formatDmy } from '../duOtpView';

/**
 * The small decisions behind the Declarations box (ADR 0037), kept apart from the
 * drawing so they can be tested without a screen.
 */

/** The photo in a slot, or null. Found by the slot it names, never by its place in the list. */
export function photoInSlot(
  view: Pick<DeclarationsView, 'washroom'>,
  slot: WashroomPhotoSlot,
): WashroomPhotoView | null {
  return view.washroom.photos.find((p) => p.slot === slot) ?? null;
}

/**
 * A moment as the calendar day it was in India, `YYYY-MM-DD`, or null when it is not a
 * date. India has no daylight saving, and IndianOil's "today" is the Indian one, so the
 * owner's phone zone never decides it.
 */
export function istDay(at: Date | string | number): string | null {
  const when = new Date(at);
  if (Number.isNaN(when.getTime())) return null;
  const dmy = /^(\d{2})-(\d{2})-(\d{4})$/.exec(formatDmy(when.toISOString()) ?? '');
  return dmy ? `${dmy[3]}-${dmy[2]}-${dmy[1]}` : null;
}

/** Today in India, `YYYY-MM-DD`, by the phone's clock. */
export function istToday(now: Date | number = Date.now()): string {
  return istDay(now) ?? '';
}

/**
 * Was this photo taken today (India), as far as the box can tell from the day it was added.
 *
 * The owner's tick says "these photos were taken today", and it must never cover a photo
 * that was added on an earlier day and is still held (the box was left open over days, or
 * an admin reopened a failed round with the photos kept). A photo whose day is before today
 * is NOT today's. A day the box cannot read is left for the server to judge: it turns away
 * an old photo too.
 */
export function photoIsFromToday(photo: Pick<WashroomPhotoView, 'at'>, today: string): boolean {
  const day = istDay(photo.at);
  return day === null || day >= today;
}

/**
 * The photo in a slot that counts as present: there, and from today. An older one is still
 * shown (it is what the server holds) but must be taken again before the owner can send.
 */
export function freshPhotoInSlot(
  view: Pick<DeclarationsView, 'washroom'>,
  slot: WashroomPhotoSlot,
  today: string = istToday(),
): WashroomPhotoView | null {
  const photo = photoInSlot(view, slot);
  return photo && photoIsFromToday(photo, today) ? photo : null;
}

/**
 * Whether Send may be pressed: both photos are in and from today, and the owner has said
 * they are today's, of their own washroom. The server asks for the same, and refuses without it.
 */
export function canSend(
  view: Pick<DeclarationsView, 'washroom'>,
  fresh: boolean,
  today: string = istToday(),
): boolean {
  return (
    fresh && WASHROOM_PHOTO_SLOTS.every((slot) => freshPhotoInSlot(view, slot, today) !== null)
  );
}

/**
 * A short fingerprint of the photos held now. When it changes the owner's tick is
 * taken back: the word "these photos were taken today" covers the photos as they
 * stood when it was given, not a retake made after. Whether a photo is one put back from
 * last time is part of it: the owner says a different sentence for those.
 */
export function photosSignature(view: Pick<DeclarationsView, 'washroom'>): string {
  return view.washroom.photos.map((p) => `${p.slot}:${p.key}${p.reused ? ':same' : ''}`).join('|');
}

/**
 * Is ANY photo in the box one put back from last time ("use the same photos")? An empty box
 * is not, and neither is a box of only new photos. The owner's tick says a different sentence
 * for this case: that the washroom still looks like it does in these photos, not that the
 * photos were taken today. It is "any", not "every": a box with one put-back photo and one new
 * one (the owner put both back, then retook only the outside photo) must not say "taken
 * today" about the put-back one. The "still looks like it does" sentence is true of a photo
 * taken today as well, so it is safe for the mixed box.
 */
export function anyPhotoReused(view: Pick<DeclarationsView, 'washroom'>): boolean {
  return view.washroom.photos.some((p) => p.reused === true);
}

/**
 * Is there a photo in the box that is NEW (not put back from last time)? A photo the server
 * did not mark as put back counts as new, whatever its day.
 */
export function boxHoldsNewPhoto(view: Pick<DeclarationsView, 'washroom'>): boolean {
  return view.washroom.photos.some((p) => p.reused !== true);
}

/** Last time's two photos, by slot, when both are there; null when there are none or only one. */
export function lastPhotoPair(
  view: Pick<DeclarationsView, 'lastPhotos'>,
): Record<WashroomPhotoSlot, WashroomPhotoView> | null {
  const find = (slot: WashroomPhotoSlot) => (view.lastPhotos ?? []).find((p) => p.slot === slot);
  const outside = find('outside');
  const inside = find('inside');
  return outside && inside ? { outside, inside } : null;
}

/**
 * Whether to offer "use the same photos": both of last time's photos are there, the box holds
 * NO new photo (it is empty, or every photo in it was put back from last time), and it does not
 * already hold them as of today.
 *
 * The tap replaces BOTH slots, with no way back. So the offer goes away the moment the owner
 * takes a photo of their own: one careless tap on a big green button would otherwise throw
 * that new photo away for the old one. It also keeps the screen to one big button (Send) once
 * the owner is choosing photos themselves. Photos put back on an earlier day are still all
 * "put back", so the offer stays for them: the tap is how they are dated today again.
 */
export function canOfferReuse(
  view: Pick<DeclarationsView, 'washroom' | 'lastPhotos'>,
  today: string = istToday(),
): boolean {
  if (!lastPhotoPair(view)) return false;
  if (boxHoldsNewPhoto(view)) return false;
  const putBackToday = WASHROOM_PHOTO_SLOTS.every(
    (slot) => freshPhotoInSlot(view, slot, today)?.reused === true,
  );
  return !putBackToday;
}

/** What the grey line under Send says: nothing, "tick the box", or "add both photos first". */
export type SendHint = 'ready' | 'tick' | 'photos';

/**
 * Which line goes under the Send button. Both photos in (and from today) but the box not
 * ticked is its own state: the photos are done, so the line must not say "add both photos" (it
 * did, right after "use the same photos" put both in, and read as if the tap had failed). It
 * tells the owner that the tap only filled the slots and that Send is still theirs to press.
 */
export function sendHint(
  view: Pick<DeclarationsView, 'washroom'>,
  fresh: boolean,
  today: string = istToday(),
): SendHint {
  if (!canSend(view, true, today)) return 'photos';
  return fresh ? 'ready' : 'tick';
}

/** The label of each slot, as the owner's own slot names it ("1. From outside"). */
export const SLOT_LABEL_KEY = {
  outside: 'chat.declSlotOutside',
  inside: 'chat.declSlotInside',
} as const satisfies Record<WashroomPhotoSlot, MessageKey>;

/** The short word under each of last time's photos. */
export const LAST_LABEL_KEY = {
  outside: 'chat.declLastOutside',
  inside: 'chat.declLastInside',
} as const satisfies Record<WashroomPhotoSlot, MessageKey>;

/** dd-mm-yyyy of the day the washroom declaration was last filed. */
export function lastFiledDay(view: DeclarationsView): string | null {
  return formatDmy(view.lastWashroomFiledDay);
}

/** dd-mm-yyyy of the day the next one is due. */
export function nextDueDay(view: DeclarationsView): string | null {
  return formatDmy(view.nextWashroomDueDay);
}

/**
 * What the server says, word for word, when it turns an owner's answer away, mapped to
 * the box's own words. The server answers these in English only; the box speaks Hindi
 * first, so each one has a line in both languages (`chat.decl*`). Matched on the
 * server's sentence with its spacing tidied, not on its status, because several quite
 * different refusals share one status.
 */
const KNOWN_REFUSALS: ReadonlyArray<readonly [string, MessageKey]> = [
  ['MDG is not waiting for washroom photos from this outlet right now.', 'chat.declNotWanted'],
  ['The photos have already been sent. MDG is filing the declaration.', 'chat.declAlreadySent'],
  [
    'MDG could not file the last declaration and the team is looking into it. Nothing is needed from you yet.',
    'chat.declFailed',
  ],
  [
    'Send both photos first, one from outside and one from inside the washroom.',
    'chat.declSendBoth',
  ],
  [
    'Please confirm that the photos were taken today of your own washroom, then send them.',
    'chat.declSayFresh',
  ],
  ['The declarations service is not switched on for this outlet.', 'chat.declOff'],
  ['That just changed. Try again.', 'chat.declChanged'],
];

const tidy = (words: string) => words.replace(/\s+/g, ' ').trim();

/** Words the server already wrote for this box's reader: Hindi first, with the English after. */
const hasHindi = (words: string) => /[\u0900-\u097F]/.test(words);

/**
 * The words under an answer or an upload that did not go through.
 *
 * A photo turned away on the phone says why in a sentence the owner can act on. A refusal
 * from the server (4xx) is shown in the box's own words: the server's photo refusals
 * already come in Hindi with the English in brackets and are shown as they are; its other
 * refusals are English only, so each known one is swapped for the box's own Hindi-first
 * line, and the rest (a bare "Forbidden", "User has no dealerId") become the plain
 * "couldn't save" line. A 409 whose sentence is not known still means "the cycle moved
 * under you", so it says that. A rate limit, a dropped connection or a server fault says it
 * its own way, because what the server says there is for engineers.
 */
export function declarationsErrorText(
  err: unknown,
  t: TFunction,
  what: 'answer' | 'photo',
): string {
  if (err instanceof ImageRejected) {
    switch (err.reason) {
      case 'size':
        return t('chat.declTooBig');
      case 'heic':
        return t('chat.declHeic');
      case 'type':
        return t('chat.declBadType');
      case 'unreadable':
        return t('chat.declUnreadable');
    }
  }
  if (err instanceof ApiError) {
    if (err.status === 429) return t('chat.portalRateLimited');
    if (err.status >= 400 && err.status < 500) {
      const words = tidy(err.message);
      if (words && hasHindi(words)) return words;
      const known = KNOWN_REFUSALS.find(([english]) => english === words);
      if (known) return t(known[1]);
      if (err.status === 409) return t('chat.declChanged');
    }
  }
  return what === 'photo' ? t('chat.duOtpFileFailed') : t('chat.portalSaveFailed');
}
