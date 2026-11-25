import type { KavachDealerItem, KavachDealerView } from '@dk/shared/types';

/** Test builders for the dealer's Kavach view. Not a test file itself (the runner only picks `*.test.*`). */

export function kItem(over: Partial<KavachDealerItem> = {}): KavachDealerItem {
  return {
    checkId: 'c1',
    code: 'forecourt-photo',
    titleEn: 'Forecourt photo',
    titleHi: 'फोरकोर्ट की फ़ोटो',
    howToEn: 'Stand at the entrance and show the whole forecourt.',
    howToHi: 'गेट पर खड़े होकर पूरा फोरकोर्ट दिखाएँ।',
    how: 'photo',
    sheet: null,
    uploader: 'manager',
    canSend: true,
    acceptsFile: false,
    points: 20,
    everyDays: 1,
    state: 'todo',
    late: false,
    dueAt: '2026-11-25T11:00:00.000Z',
    validUntil: null,
    opensAt: null,
    sentAt: null,
    sentBack: null,
    dataEn: null,
    dataHi: null,
    thumbUrl: null,
    ...over,
  };
}

export function kView(over: Partial<KavachDealerView> = {}): KavachDealerView {
  const now = over.now ?? [kItem()];
  const waiting = over.waiting ?? [];
  const done = over.done ?? [];
  return {
    on: true,
    summary: {
      pct: 62,
      donePoints: 5,
      totalPoints: 8,
      counts: { done: done.length, sent: waiting.length, todo: now.length, late: now.filter((i) => i.late).length, sentBack: 0 },
      computedAt: '2026-11-25T04:00:00.000Z',
    },
    now,
    waiting,
    done,
    upcoming: [],
    events: [],
    ...over,
  };
}
