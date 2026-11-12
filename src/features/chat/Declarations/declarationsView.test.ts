import { describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/api';
import { translate, type TFunction } from '@/lib/i18n';
import { ImageRejected } from '@/lib/squeezeImage';
import {
  makeCollect,
  makeDeclarationsView,
  makeWashroomCycle,
  makeWashroomPhoto,
} from '@/test/declarationsFixtures';

import {
  canSend,
  declarationsErrorText,
  freshPhotoInSlot,
  istDay,
  istToday,
  lastFiledDay,
  nextDueDay,
  photoInSlot,
  photoIsFromToday,
  photosSignature,
} from './declarationsView';

describe('photoInSlot', () => {
  it('finds a photo by the slot it names, whatever order the list came in', () => {
    const view = makeDeclarationsView({
      washroom: makeWashroomCycle({
        photos: [makeWashroomPhoto('inside'), makeWashroomPhoto('outside')],
      }),
    });
    expect(photoInSlot(view, 'outside')?.slot).toBe('outside');
    expect(photoInSlot(view, 'inside')?.slot).toBe('inside');
  });

  it('is null for a slot with nothing in it', () => {
    expect(photoInSlot(makeCollect(1), 'inside')).toBeNull();
    expect(photoInSlot(makeCollect(0), 'outside')).toBeNull();
  });
});

describe('canSend', () => {
  it("needs both photos and the owner's word, and nothing less", () => {
    expect(canSend(makeCollect(2), true)).toBe(true);
    expect(canSend(makeCollect(2), false)).toBe(false);
    expect(canSend(makeCollect(1), true)).toBe(false);
    expect(canSend(makeCollect(0), true)).toBe(false);
  });

  it('does not count a photo added on an earlier day, however many ticks cover it', () => {
    // Thursday: the outside photo is Monday's, the inside one was just taken.
    const view = makeDeclarationsView({
      washroom: makeWashroomCycle({
        photos: [
          makeWashroomPhoto('outside', { at: '2026-11-09T05:00:00.000Z' }),
          makeWashroomPhoto('inside', { at: '2026-11-12T05:00:00.000Z' }),
        ],
      }),
    });
    expect(canSend(view, true, '2026-11-12')).toBe(false);
    // The same pair on the day it was taken is fine.
    expect(canSend(view, true, '2026-11-09')).toBe(true);
  });

  it('is not fooled by two photos for the same slot', () => {
    const view = makeDeclarationsView({
      washroom: makeWashroomCycle({
        photos: [makeWashroomPhoto('outside'), makeWashroomPhoto('outside', { key: 'k2' })],
      }),
    });
    expect(canSend(view, true)).toBe(false);
  });
});

describe('which day a photo counts for', () => {
  it('reads the Indian calendar day, not the phone zone or UTC', () => {
    // 18:45 UTC on the 11th is 00:15 on the 12th in India.
    expect(istDay('2026-11-11T18:45:00.000Z')).toBe('2026-11-12');
    expect(istDay('2026-11-11T18:15:00.000Z')).toBe('2026-11-11');
    expect(istDay('not a date')).toBeNull();
    expect(istToday(Date.parse('2026-11-12T20:00:00.000Z'))).toBe('2026-11-13');
  });

  it('counts a photo from today, and not one from before today', () => {
    const today = '2026-11-12';
    expect(photoIsFromToday({ at: '2026-11-12T00:30:00.000Z' }, today)).toBe(true);
    expect(photoIsFromToday({ at: '2026-11-11T17:00:00.000Z' }, today)).toBe(false);
    expect(photoIsFromToday({ at: '2026-11-09T05:00:00.000Z' }, today)).toBe(false);
  });

  it('leaves a day it cannot read for the server to judge', () => {
    expect(photoIsFromToday({ at: 'garbage' }, '2026-11-12')).toBe(true);
  });

  it("keeps an old photo as the slot's photo, but not as present", () => {
    const view = makeDeclarationsView({
      washroom: makeWashroomCycle({
        photos: [makeWashroomPhoto('outside', { at: '2026-11-09T05:00:00.000Z' })],
      }),
    });
    expect(photoInSlot(view, 'outside')?.slot).toBe('outside');
    expect(freshPhotoInSlot(view, 'outside', '2026-11-12')).toBeNull();
    expect(freshPhotoInSlot(view, 'outside', '2026-11-09')?.slot).toBe('outside');
  });

  it("leaves the photos' signature alone, so an old photo changes nothing about the tick", () => {
    const old = makeDeclarationsView({
      washroom: makeWashroomCycle({
        photos: [makeWashroomPhoto('outside', { at: '2026-11-09T05:00:00.000Z' })],
      }),
    });
    const fresh = makeDeclarationsView({
      washroom: makeWashroomCycle({ photos: [makeWashroomPhoto('outside')] }),
    });
    expect(photosSignature(old)).toBe(photosSignature(fresh));
  });
});

describe('photosSignature', () => {
  it('changes when a photo is replaced, and not otherwise', () => {
    const a = makeCollect(2);
    const same = makeCollect(2);
    const retaken = makeDeclarationsView({
      washroom: makeWashroomCycle({
        photos: [makeWashroomPhoto('outside', { key: 'new-key' }), makeWashroomPhoto('inside')],
      }),
    });
    expect(photosSignature(a)).toBe(photosSignature(same));
    expect(photosSignature(a)).not.toBe(photosSignature(retaken));
    expect(photosSignature(makeCollect(0))).toBe('');
  });
});

describe('the dates', () => {
  it('reads the last filing and the next due day as dd-mm-yyyy', () => {
    const view = makeDeclarationsView({
      lastWashroomFiledDay: '2026-11-05',
      nextWashroomDueDay: '2026-11-12',
    });
    expect(lastFiledDay(view)).toBe('05-11-2026');
    expect(nextDueDay(view)).toBe('12-11-2026');
  });

  it('is null when there is no day', () => {
    expect(lastFiledDay(makeDeclarationsView())).toBeNull();
    expect(nextDueDay(makeDeclarationsView())).toBeNull();
  });
});

describe('declarationsErrorText', () => {
  const t: TFunction = (key, vars) => translate('en', key, vars);

  it('says what to do about a photo turned away on the phone', () => {
    expect(declarationsErrorText(new ImageRejected('size'), t, 'photo')).toBe(
      'This photo is too big. Take it again from a little further away.',
    );
    expect(declarationsErrorText(new ImageRejected('heic'), t, 'photo')).toBe(
      'This kind of photo cannot be opened here. Take a new photo with the camera.',
    );
    expect(declarationsErrorText(new ImageRejected('type'), t, 'photo')).toBe(
      'That is not a photo. Take a new one, or choose one from your gallery.',
    );
    expect(declarationsErrorText(new ImageRejected('unreadable'), t, 'photo')).toBe(
      'This photo could not be read. Take it again, or choose another one.',
    );
  });

  it("swaps each known server refusal, which the server writes in English only, for the box's own words", () => {
    const refuse = (status: number, words: string, what: 'answer' | 'photo' = 'answer') =>
      declarationsErrorText(new ApiError(status, 'X', words), t, what);

    expect(
      refuse(400, 'Send both photos first, one from outside and one from inside the washroom.'),
    ).toBe('Send both photos first, one from outside and one from inside the washroom.');
    expect(refuse(409, 'That just changed. Try again.')).toBe(
      'Something just changed. Look at the box again, then try once more.',
    );
    expect(
      refuse(
        400,
        'Please confirm that the photos were taken today of your own washroom, then send them.',
      ),
    ).toBe('Tick the box to say the photos were taken today of your own washroom, then send.');
    expect(refuse(409, 'The photos have already been sent. MDG is filing the declaration.')).toBe(
      'The photos are already sent. MDG is filing it.',
    );
    expect(refuse(409, 'MDG is not waiting for washroom photos from this outlet right now.')).toBe(
      'MDG is not asking for washroom photos right now.',
    );
    expect(
      refuse(
        409,
        'MDG could not file the last declaration and the team is looking into it. Nothing is needed from you yet.',
      ),
    ).toBe('MDG could not file it. Our team is looking into it.');
    expect(refuse(409, 'The declarations service is not switched on for this outlet.')).toBe(
      'Washroom photos are not switched on for your pump.',
    );
  });

  it('gives every known refusal a Hindi line too, and none of them is the English', () => {
    const hi: TFunction = (key, vars) => translate('hi', key, vars);
    for (const [status, words] of [
      [400, 'Send both photos first, one from outside and one from inside the washroom.'],
      [409, 'That just changed. Try again.'],
      [
        400,
        'Please confirm that the photos were taken today of your own washroom, then send them.',
      ],
      [409, 'The photos have already been sent. MDG is filing the declaration.'],
      [409, 'MDG is not waiting for washroom photos from this outlet right now.'],
    ] as const) {
      const text = declarationsErrorText(new ApiError(status, 'X', words), hi, 'answer');
      expect(text).toMatch(/[\u0900-\u097F]/);
      expect(text).not.toBe(words);
    }
  });

  it('ignores a different spacing of a known refusal', () => {
    expect(
      declarationsErrorText(
        new ApiError(409, 'X', '  That just  changed.\nTry again. '),
        t,
        'answer',
      ),
    ).toBe('Something just changed. Look at the box again, then try once more.');
  });

  it("shows the server's photo refusals as they are: they already come in Hindi with the English after", () => {
    const words = 'फ़ोटो पहुँची नहीं। इसे दोबारा भेजिए। (The photo did not arrive. Send it again.)';
    expect(declarationsErrorText(new ApiError(400, 'BAD', words), t, 'photo')).toBe(words);
  });

  it('says an unknown 409 means the cycle moved, and keeps the plain line for any other unknown refusal', () => {
    expect(
      declarationsErrorText(new ApiError(409, 'CONFLICT', 'Something else.'), t, 'answer'),
    ).toBe('Something just changed. Look at the box again, then try once more.');
    // A bare 403, a missing outlet and an unknown 400 never print their English.
    expect(declarationsErrorText(new ApiError(403, 'FORBIDDEN', 'Forbidden'), t, 'answer')).toBe(
      "Couldn't save — try again",
    );
    expect(
      declarationsErrorText(new ApiError(400, 'BAD_REQUEST', 'User has no dealerId'), t, 'answer'),
    ).toBe("Couldn't save — try again");
    expect(declarationsErrorText(new ApiError(400, 'BAD', 'Send an image.'), t, 'photo')).toBe(
      'The upload did not go through. Check your network and try again.',
    );
  });

  it('says a rate limit, a fault and a dropped network its own way', () => {
    expect(declarationsErrorText(new ApiError(429, 'RATE', 'slow down'), t, 'answer')).toBe(
      'Try again in a little while',
    );
    expect(declarationsErrorText(new ApiError(500, 'X', 'stack trace'), t, 'answer')).toBe(
      "Couldn't save — try again",
    );
    expect(declarationsErrorText(new Error('network'), t, 'photo')).toBe(
      'The upload did not go through. Check your network and try again.',
    );
    // An empty refusal has no words to show.
    expect(declarationsErrorText(new ApiError(400, 'BAD', '  '), t, 'answer')).toBe(
      "Couldn't save — try again",
    );
  });
});
