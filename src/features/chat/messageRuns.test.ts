import { describe, expect, it } from 'vitest';

import { translate } from '@/lib/i18n';
import { makeMessage } from '@/test/utils';
import type { Attachment } from '@dk/shared/types';

import {
  buildRowMeta,
  buildViewerItems,
  captureUnread,
  dayKey,
  dayLabel,
  orderMessages,
  viewerKey,
} from './messageRuns';

const tEn = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
  translate('en', key, vars);
const tHi = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
  translate('hi', key, vars);

/** Local-time constructor, so the tests mean the same on any machine's timezone. */
const at = (y: number, m: number, d: number, h = 12, min = 0) =>
  new Date(y, m - 1, d, h, min).toISOString();

describe('dayLabel — the date chip ladder', () => {
  const now = new Date(2026, 9, 12, 15, 0); // Monday 12 October 2026

  it('says Today and Yesterday', () => {
    expect(dayLabel(at(2026, 10, 12, 0, 5), tEn, 'en', now)).toBe('Today');
    expect(dayLabel(at(2026, 10, 11, 23, 55), tEn, 'en', now)).toBe('Yesterday');
  });

  it('counts calendar days, not 24-hour blocks', () => {
    // 00:05 yesterday is less than 24 hours before 15:00 today? No — it is 39
    // hours before, and still "Yesterday". And 23:55 two days ago is not.
    expect(dayLabel(at(2026, 10, 11, 0, 5), tEn, 'en', now)).toBe('Yesterday');
    expect(dayLabel(at(2026, 10, 10, 23, 55), tEn, 'en', now)).not.toBe('Yesterday');
  });

  it('names the weekday for the rest of the week', () => {
    expect(dayLabel(at(2026, 10, 9), tEn, 'en', now)).toBe('Friday');
    expect(dayLabel(at(2026, 10, 6), tEn, 'en', now)).toBe('Tuesday');
  });

  it('writes the whole date from a week back, in the language of the app', () => {
    expect(dayLabel(at(2026, 10, 5), tEn, 'en', now)).toBe('5 October 2026');
    expect(dayLabel(at(2025, 3, 1), tEn, 'en', now)).toBe('1 March 2025');
    expect(dayLabel(at(2026, 10, 5), tHi, 'hi', now)).toContain('2026');
    expect(dayLabel(at(2026, 10, 5), tHi, 'hi', now)).not.toBe('5 October 2026');
  });

  it('uses the Hindi words for today and yesterday', () => {
    expect(dayLabel(at(2026, 10, 12), tHi, 'hi', now)).toBe('आज');
    expect(dayLabel(at(2026, 10, 11), tHi, 'hi', now)).toBe('कल');
  });
});

describe('dayKey', () => {
  it('is the same for two times on one local day and different across midnight', () => {
    expect(dayKey(at(2026, 10, 12, 0, 1))).toBe(dayKey(at(2026, 10, 12, 23, 59)));
    expect(dayKey(at(2026, 10, 12, 23, 59))).not.toBe(dayKey(at(2026, 10, 13, 0, 1)));
  });
});

describe('buildRowMeta — runs, days and the unread band', () => {
  const m = (id: string, senderId: string, createdAt: string) =>
    makeMessage({ id, senderId, createdAt });

  it('opens a run on the first message and every change of sender', () => {
    const rows = buildRowMeta([
      m('a1', 'A', at(2026, 10, 12, 9, 0)),
      m('a2', 'A', at(2026, 10, 12, 9, 1)),
      m('b1', 'B', at(2026, 10, 12, 9, 2)),
      m('a3', 'A', at(2026, 10, 12, 9, 3)),
    ]);
    expect(rows.map((r) => r.first)).toEqual([true, false, true, true]);
  });

  it('a new day starts a new run even for the same sender, and asks for a date chip', () => {
    const rows = buildRowMeta([
      m('a1', 'A', at(2026, 10, 11, 23, 58)),
      m('a2', 'A', at(2026, 10, 11, 23, 59)),
      m('a3', 'A', at(2026, 10, 12, 0, 1)),
    ]);
    expect(rows.map((r) => r.showDay)).toEqual([true, false, true]);
    expect(rows.map((r) => r.first)).toEqual([true, false, true]);
  });

  it('puts the unread band above the named message and starts a run there', () => {
    const rows = buildRowMeta(
      [
        m('a1', 'A', at(2026, 10, 12, 9, 0)),
        m('a2', 'A', at(2026, 10, 12, 9, 1)),
        m('a3', 'A', at(2026, 10, 12, 9, 2)),
      ],
      'a2',
    );
    expect(rows.map((r) => r.showUnread)).toEqual([false, true, false]);
    // Same sender throughout, but the band is a full-width break: the bubble
    // under it is the first of a new run and gets a tail.
    expect(rows.map((r) => r.first)).toEqual([true, true, false]);
  });

  it('draws no band for an id that is not in the thread, or for null', () => {
    const list = [m('a1', 'A', at(2026, 10, 12, 9, 0))];
    expect(buildRowMeta(list, 'gone')[0]!.showUnread).toBe(false);
    expect(buildRowMeta(list, null)[0]!.showUnread).toBe(false);
  });
});

describe('captureUnread', () => {
  const me = 'me';

  it('finds the oldest message from someone else that I have not read, and counts them', () => {
    const snap = captureUnread(
      [
        makeMessage({ id: 'mine', senderId: me, readBy: [me], createdAt: at(2026, 10, 12, 9, 0) }),
        makeMessage({ id: 'read', senderId: 'x', readBy: ['x', me], createdAt: at(2026, 10, 12, 9, 1) }),
        makeMessage({ id: 'u2', senderId: 'x', readBy: ['x'], createdAt: at(2026, 10, 12, 9, 3) }),
        makeMessage({ id: 'u1', senderId: 'x', readBy: ['x'], createdAt: at(2026, 10, 12, 9, 2) }),
      ],
      me,
    );
    expect(snap).toEqual({ firstId: 'u1', count: 2 });
  });

  it('ignores my own messages and ones still being sent', () => {
    expect(
      captureUnread(
        [
          makeMessage({ id: 'temp-1', senderId: 'x', readBy: [] }),
          makeMessage({ id: 'm1', senderId: me, readBy: [] }),
        ],
        me,
      ),
    ).toEqual({ firstId: null, count: 0 });
  });

  it('counts only what sits below the line, never a bigger number from elsewhere', () => {
    // Forty were waiting but one page holds two of them: the band says two,
    // because two is what the reader finds by scrolling down from it.
    const snap = captureUnread(
      [
        makeMessage({ id: 'u1', senderId: 'x', readBy: ['x'], createdAt: at(2026, 10, 12, 9, 1) }),
        makeMessage({ id: 'u2', senderId: 'x', readBy: ['x'], createdAt: at(2026, 10, 12, 9, 2) }),
      ],
      me,
    );
    expect(snap).toEqual({ firstId: 'u1', count: 2 });
  });

  it('never invents a count when nothing loaded is unread', () => {
    expect(captureUnread([makeMessage({ senderId: 'x', readBy: ['x', me] })], me)).toEqual({
      firstId: null,
      count: 0,
    });
  });
});

describe('orderMessages', () => {
  it('sorts oldest first and draws a message that landed twice once', () => {
    const a = makeMessage({ id: 'a', createdAt: at(2026, 10, 12, 9, 2) });
    const b = makeMessage({ id: 'b', createdAt: at(2026, 10, 12, 9, 1) });
    expect(orderMessages([a, b, a]).map((x) => x.id)).toEqual(['b', 'a']);
  });

  it('keeps a message still being sent at the bottom, whatever the phone clock says', () => {
    // The phone runs ten minutes slow: its unsent bubble is "older" than MDG's
    // latest message, and must still be drawn under it.
    const mdg = makeMessage({ id: 'mdg', createdAt: at(2026, 10, 12, 9, 30) });
    const sending = makeMessage({ id: 'temp-1', createdAt: at(2026, 10, 12, 9, 20) });
    const earlier = makeMessage({ id: 'old', createdAt: at(2026, 10, 12, 9, 0) });
    expect(orderMessages([sending, mdg, earlier]).map((x) => x.id)).toEqual([
      'old',
      'mdg',
      'temp-1',
    ]);
  });
});

describe('buildViewerItems — every picture in the thread, oldest first', () => {
  const pic = (key: string): Attachment => ({
    storageKey: key,
    filename: `${key}.png`,
    contentType: 'image/png',
    size: 1,
    kind: 'image',
  });
  const doc: Attachment = {
    storageKey: 'd',
    filename: 'd.pdf',
    contentType: 'application/pdf',
    size: 1,
    kind: 'file',
  };

  it('lists the pictures of every message in order, skipping what is not a picture', () => {
    const items = buildViewerItems(
      [
        makeMessage({
          id: 'm1',
          senderId: 'me',
          body: 'two for you',
          attachments: [pic('p1'), doc, pic('p2')],
          createdAt: at(2026, 10, 12, 9, 0),
        }),
        makeMessage({ id: 'm2', senderId: 'x', body: 'no picture', createdAt: at(2026, 10, 12, 9, 1) }),
        makeMessage({
          id: 'm3',
          senderId: 'sys',
          senderRole: 'admin',
          body: undefined,
          attachments: [pic('p3')],
          createdAt: at(2026, 10, 12, 9, 2),
        }),
      ],
      'me',
      tEn,
    );
    expect(items.map((i) => i.key)).toEqual(['m1:p1', 'm1:p2', 'm3:p3']);
    expect(items[0]).toMatchObject({
      senderLabel: 'You',
      caption: 'two for you',
      source: { conversationId: 'c1', messageId: 'm1' },
    });
    // A message with no words carries no caption key at all.
    expect('caption' in items[2]!).toBe(false);
    expect(items[2]!.senderLabel).toBe('MDG');
  });

  it('keeps a picture that has no link yet — the viewer asks for one through the message', () => {
    const items = buildViewerItems(
      [makeMessage({ id: 'm1', attachments: [pic('p1')] })],
      'me',
      tEn,
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.attachment.url).toBeUndefined();
  });

  it('keys a picture the way a tap on it does', () => {
    const m = makeMessage({ id: 'm9' });
    expect(viewerKey(m, 'chat/c1/x.png')).toBe('m9:chat/c1/x.png');
  });

  it('names a group member by name, and falls back to MDG for a sender with none', () => {
    const items = buildViewerItems(
      [
        makeMessage({ id: 'a', senderId: 'raju', senderName: 'Raju', attachments: [pic('1')] }),
        makeMessage({ id: 'b', senderId: 'who', attachments: [pic('2')] }),
      ],
      'me',
      tEn,
    );
    expect(items.map((i) => i.senderLabel)).toEqual(['Raju', 'MDG']);
  });
});
