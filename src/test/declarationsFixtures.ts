import { WASHROOM_PHOTO_MAX_BYTES } from '@dk/shared/types';
import type {
  DeclarationsView,
  WashroomCycleView,
  WashroomPhotoSlot,
  WashroomPhotoView,
} from '@dk/shared/types';

/** Builders for the Declarations view (ADR 0037), as `GET /me/declarations` answers it. */

export function makeWashroomPhoto(
  slot: WashroomPhotoSlot,
  over: Partial<WashroomPhotoView> = {},
): WashroomPhotoView {
  return {
    slot,
    key: `declarations/d1/uploads/${slot}.jpg`,
    filename: `washroom-${slot}.jpg`,
    size: 300_000,
    mime: 'image/jpeg',
    // Taken just now: the box counts only today's photos, so a fixed day would turn old
    // the day after it was written. A test that wants an old photo says so with `at`.
    at: new Date().toISOString(),
    url: `https://files.example.test/${slot}.jpg`,
    ...over,
  };
}

export function makeWashroomCycle(over: Partial<WashroomCycleView> = {}): WashroomCycleView {
  return {
    state: 'idle',
    askedAt: null,
    remindersSent: 0,
    photos: [],
    confirmedDay: null,
    sentAt: null,
    failure: null,
    ...over,
  };
}

export function makeDeclarationsView(over: Partial<DeclarationsView> = {}): DeclarationsView {
  return {
    dealerId: 'd1',
    active: true,
    screen: 'idle',
    washroom: makeWashroomCycle(),
    lastWashroomFiledDay: null,
    nextWashroomDueDay: null,
    maxPhotoBytes: WASHROOM_PHOTO_MAX_BYTES,
    lastPhotos: [],
    ...over,
  };
}

/** The last filing's two photos (outside, inside), as the view offers them for "use the same photos". */
export function makeLastPhotos(over: Partial<WashroomPhotoView> = {}): WashroomPhotoView[] {
  return (['outside', 'inside'] as const).map((slot) =>
    makeWashroomPhoto(slot, {
      key: `declarations/d1/files/last-${slot}.jpg`,
      filename: `last-${slot}.jpg`,
      at: '2026-11-05T05:00:00.000Z',
      url: `https://files.example.test/last-${slot}.jpg`,
      ...over,
    }),
  );
}

/** A view on the owner's own screen: `collect`, with 0, 1 (outside) or 2 photos in. */
export function makeCollect(
  photos: 0 | 1 | 2 = 0,
  over: Partial<DeclarationsView> = {},
): DeclarationsView {
  return makeDeclarationsView({
    screen: 'collect',
    washroom: makeWashroomCycle({
      state: 'collecting',
      askedAt: '2026-11-12T04:30:00.000Z',
      photos: [makeWashroomPhoto('outside'), makeWashroomPhoto('inside')].slice(0, photos),
    }),
    ...over,
  });
}
