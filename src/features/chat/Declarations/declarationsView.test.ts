import { describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/api';
import { translate, type TFunction } from '@/lib/i18n';
import { ImageRejected } from '@/lib/squeezeImage';
import {
  makeCollect,
  makeDeclarationsView,
  makeLastPhotos,
  makeWashroomCycle,
  makeWashroomPhoto,
} from '@/test/declarationsFixtures';

import {
  anyPhotoReused,
  boxHoldsNewPhoto,
  canOfferReuse,
  canSend,
  declarationsErrorText,
  freshPhotoInSlot,
  istDay,
  istToday,
  lastFiledDay,
  lastPhotoPair,
  nextDueDay,
  photoInSlot,
  photoIsFromToday,
  photosSignature,
  sendHint,
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

/** The box holds these photos, each put back from last time unless `over` says otherwise. */
const holding = (
  slots: Array<'outside' | 'inside'>,
  over: Parameters<typeof makeWashroomPhoto>[1] = {},
) =>
  makeCollect(0, {
    lastPhotos: makeLastPhotos(),
    washroom: makeWashroomCycle({
      state: 'collecting',
      photos: slots.map((slot) => makeWashroomPhoto(slot, { reused: true, ...over })),
    }),
  });

/** One put-back photo and one new one, the new one in `fresh`'s slot. */
const mixed = (fresh: 'outside' | 'inside') =>
  makeDeclarationsView({
    washroom: makeWashroomCycle({
      photos: [
        makeWashroomPhoto('outside', { reused: fresh === 'outside' ? undefined : true }),
        makeWashroomPhoto('inside', { reused: fresh === 'inside' ? undefined : true }),
      ],
    }),
  });

describe('anyPhotoReused', () => {
  it('is true when every photo in the box was put back from last time', () => {
    expect(anyPhotoReused(holding(['outside', 'inside']))).toBe(true);
    expect(anyPhotoReused(holding(['inside']))).toBe(true);
  });

  it('is STILL true when only one photo was put back and the other is new, in either slot', () => {
    // The owner put both back, then retook only the outside photo (or only the inside one):
    // the box still holds a put-back photo, so "taken today" would be false of it.
    expect(anyPhotoReused(mixed('outside'))).toBe(true);
    expect(anyPhotoReused(mixed('inside'))).toBe(true);
  });

  it('is false for new photos only, and for an empty box', () => {
    expect(anyPhotoReused(makeCollect(2))).toBe(false);
    expect(anyPhotoReused(makeCollect(1))).toBe(false);
    expect(anyPhotoReused(makeCollect(0))).toBe(false);
  });

  it('takes `reused: false` for a new photo', () => {
    expect(anyPhotoReused(holding(['outside', 'inside'], { reused: false }))).toBe(false);
  });
});

describe('boxHoldsNewPhoto', () => {
  it('is true for any photo that was not put back, however many are put back beside it', () => {
    expect(boxHoldsNewPhoto(makeCollect(1))).toBe(true);
    expect(boxHoldsNewPhoto(makeCollect(2))).toBe(true);
    expect(boxHoldsNewPhoto(mixed('outside'))).toBe(true);
    expect(boxHoldsNewPhoto(mixed('inside'))).toBe(true);
    expect(boxHoldsNewPhoto(holding(['outside', 'inside'], { reused: false }))).toBe(true);
  });

  it('is false for an empty box and for a box of put-back photos only', () => {
    expect(boxHoldsNewPhoto(makeCollect(0))).toBe(false);
    expect(boxHoldsNewPhoto(holding(['outside', 'inside']))).toBe(false);
    expect(boxHoldsNewPhoto(holding(['inside']))).toBe(false);
  });
});

describe('a photo put back from last time', () => {
  it('counts as present for Send (it is dated the day it was put back), and an old put-back does not', () => {
    const view = holding(['outside', 'inside']);
    expect(canSend(view, true)).toBe(true);
    expect(canSend(view, false)).toBe(false);
    const yesterday = holding(['outside', 'inside'], { at: '2026-11-11T05:00:00.000Z' });
    expect(canSend(yesterday, true, '2026-11-12')).toBe(false);
  });

  it('changes the photos’ signature, so the owner’s tick is asked for again', () => {
    expect(photosSignature(holding(['outside', 'inside']))).not.toBe(
      photosSignature(makeCollect(2)),
    );
    const sameKeysNew = makeCollect(2);
    const sameKeysReused = holding(['outside', 'inside']);
    // Same keys, only the mark differs: still a different word to give.
    expect(photosSignature(sameKeysNew)).not.toBe(photosSignature(sameKeysReused));
  });
});

describe('lastPhotoPair and canOfferReuse', () => {
  it('is the two photos by slot, whatever order they came in', () => {
    const view = makeCollect(0, { lastPhotos: makeLastPhotos().reverse() });
    expect(lastPhotoPair(view)).toMatchObject({
      outside: { slot: 'outside' },
      inside: { slot: 'inside' },
    });
  });

  it('is null with none, with one, or with two for the same slot', () => {
    expect(lastPhotoPair(makeCollect(0))).toBeNull();
    expect(lastPhotoPair(makeCollect(0, { lastPhotos: makeLastPhotos().slice(0, 1) }))).toBeNull();
    const [outside] = makeLastPhotos();
    expect(lastPhotoPair(makeCollect(0, { lastPhotos: [outside!, { ...outside! }] }))).toBeNull();
  });

  it('offers the same photos only when both of last time’s are there', () => {
    expect(canOfferReuse(makeCollect(0))).toBe(false);
    expect(canOfferReuse(makeCollect(0, { lastPhotos: makeLastPhotos().slice(1) }))).toBe(false);
    expect(canOfferReuse(makeCollect(0, { lastPhotos: makeLastPhotos() }))).toBe(true);
  });

  it('stops offering them the moment the box holds a new photo: the tap would throw it away', () => {
    expect(canOfferReuse(makeCollect(1, { lastPhotos: makeLastPhotos() }))).toBe(false);
    expect(canOfferReuse(makeCollect(2, { lastPhotos: makeLastPhotos() }))).toBe(false);
  });

  it('stops offering them when one slot was put back and the other retaken', () => {
    for (const fresh of ['outside', 'inside'] as const) {
      expect(canOfferReuse({ ...mixed(fresh), lastPhotos: makeLastPhotos() })).toBe(false);
    }
  });

  it('stops offering them once both slots hold them, put back today', () => {
    expect(canOfferReuse(holding(['outside', 'inside']))).toBe(false);
  });

  it('keeps offering them when the put-back photos are from an earlier day: the tap dates them today again', () => {
    const yesterday = holding(['outside', 'inside'], { at: '2026-11-11T05:00:00.000Z' });
    expect(canOfferReuse(yesterday, '2026-11-12')).toBe(true);
  });

  it('keeps offering them when only one slot holds a put-back photo', () => {
    expect(canOfferReuse(holding(['outside']))).toBe(true);
  });
});

describe('sendHint', () => {
  it('asks for both photos until both are in and from today', () => {
    expect(sendHint(makeCollect(0), false)).toBe('photos');
    expect(sendHint(makeCollect(1), true)).toBe('photos');
    // Monday's photo in one slot is not a photo that is in.
    const old = makeDeclarationsView({
      washroom: makeWashroomCycle({
        photos: [
          makeWashroomPhoto('outside', { at: '2026-11-09T05:00:00.000Z' }),
          makeWashroomPhoto('inside', { at: '2026-11-12T05:00:00.000Z' }),
        ],
      }),
    });
    expect(sendHint(old, true, '2026-11-12')).toBe('photos');
  });

  it('says "tick the box" once both photos are in and the box is not ticked', () => {
    expect(sendHint(makeCollect(2), false)).toBe('tick');
    // Right after the same-photos tap fills both slots.
    expect(sendHint(holding(['outside', 'inside']), false)).toBe('tick');
  });

  it('says nothing once both photos are in and the box is ticked', () => {
    expect(sendHint(makeCollect(2), true)).toBe('ready');
    expect(sendHint(holding(['outside', 'inside']), true)).toBe('ready');
  });

  it('agrees with canSend, so the button and the line never disagree', () => {
    for (const view of [makeCollect(0), makeCollect(1), makeCollect(2), mixed('inside')]) {
      for (const fresh of [true, false]) {
        expect(sendHint(view, fresh) === 'ready').toBe(canSend(view, fresh));
      }
    }
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

  it("shows the server's refusal of the same photos as it is, Hindi first, and never the English alone", () => {
    const gone =
      'पिछली बार की फ़ोटो अब हमारे पास नहीं हैं। कृपया नई फ़ोटो भेजिए। (The photos from last time are gone. Please send new photos.)';
    expect(declarationsErrorText(new ApiError(400, 'BAD', gone), t, 'answer')).toBe(gone);
    // An English-only 409 the box does not know still means the cycle moved.
    expect(declarationsErrorText(new ApiError(409, 'X', 'Not now.'), t, 'answer')).toBe(
      'Something just changed. Look at the box again, then try once more.',
    );
    expect(declarationsErrorText(new Error('network'), t, 'answer')).toBe(
      "Couldn't save — try again",
    );
  });

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
