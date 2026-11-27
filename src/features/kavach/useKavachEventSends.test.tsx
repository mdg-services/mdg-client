import { act, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderHookWithProviders, resetStores, signIn } from '@/test/utils';
import type { KavachDealerCheck } from '@dk/shared/types';

import { kItem } from './kavachFixtures';

const h = vi.hoisted(() => ({
  data: {} as Record<string, unknown>,
  asked: [] as string[][],
}));

vi.mock('@/hooks/api/useKavach', () => ({
  kavachKey: ['kavach', 'me'],
  useKavachChecks: (ids: readonly string[]) => {
    h.asked.push([...ids]);
    return ids.map((id) => ({ data: h.data[id], dataUpdatedAt: h.data[id] ? 1 : 0 }));
  },
}));

const { EVENT_SENDS_KEY, eventRowOf, readEventSends, useKavachEventSends } = await import('./useKavachEventSends');

// 25 Nov 2026, 10:00 in India.
const NOW = new Date('2026-11-25T04:30:00.000Z');
const sentEvent = (over = {}) =>
  kItem({ checkId: 'ev1', code: 'decantation', titleEn: 'Tanker decantation', everyDays: null, state: 'sent', dueAt: null, sentAt: '2026-11-25T04:12:00.000Z', ...over });
const check = (item: ReturnType<typeof kItem>, over: Partial<KavachDealerCheck> = {}): KavachDealerCheck => ({
  item,
  submission: {
    files: [{ storageKey: 'k', filename: 'a.jpg', contentType: 'image/jpeg', size: 1, kind: 'image', url: 'https://s3.test/a.jpg' }],
    note: null,
    at: '2026-11-25T04:12:00.000Z',
    by: { userId: 'u1', name: 'Ramesh', role: 'dealer-staff' },
  } as KavachDealerCheck['submission'],
  lastApproved: null,
  history: [],
  ...over,
});

beforeEach(() => {
  signIn({ id: 'u1', role: 'dealer-staff', dealerId: 'd1' });
  h.data = {};
  h.asked = [];
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  resetStores();
});

describe('eventRowOf: one remembered send as a row', () => {
  const rec = { dealerId: 'd1', checkId: 'ev1', at: '2026-11-25T04:12:00.000Z', item: sentEvent() };

  it('is With MDG while the server says sent, with a fresh photo link and who sent it', () => {
    const row = eventRowOf(rec, check(sentEvent()), NOW)!;
    expect(row.state).toBe('sent');
    expect(row.thumbUrl).toBe('https://s3.test/a.jpg');
    expect((row as { sentByName?: string }).sentByName).toBe('Ramesh');
  });

  it('falls back to what the send answered when the check cannot be read', () => {
    expect(eventRowOf(rec, undefined, NOW)).toMatchObject({ checkId: 'ev1', state: 'sent', thumbUrl: null });
  });

  it('keeps a sent-back one with its reason, always', () => {
    const back = sentEvent({ state: 'sent_back', sentBack: { reason: 'not_clear', note: null, at: '2026-11-25T05:00:00.000Z' } });
    const row = eventRowOf({ ...rec, at: '2026-11-20T04:12:00.000Z' }, check(back), NOW)!;
    expect(row.state).toBe('sent_back');
    expect(row.sentBack?.reason).toBe('not_clear');
  });

  it('keeps an accepted one only on the day it was sent, so Done does not collect them', () => {
    expect(eventRowOf(rec, check(sentEvent({ state: 'done' })), NOW)?.state).toBe('done');
    expect(eventRowOf(rec, check(sentEvent({ state: 'done', sentAt: '2026-11-24T04:12:00.000Z' })), NOW)).toBeNull();
  });

  it('drops a check that is no longer waiting on anyone', () => {
    expect(eventRowOf(rec, check(sentEvent({ state: 'missed' })), NOW)).toBeNull();
    expect(eventRowOf(rec, check(sentEvent({ state: 'excused' })), NOW)).toBeNull();
  });
});

describe('useKavachEventSends', () => {
  it('remembers a send in the browser, asks the server for that check, and hands back the row', () => {
    h.data.ev1 = check(sentEvent());
    const { result } = renderHookWithProviders(() => useKavachEventSends(), { route: '/' });
    expect(result.current.items).toEqual([]);
    act(() => result.current.remember(sentEvent()));
    expect(result.current.items.map((i) => [i.checkId, i.state])).toEqual([['ev1', 'sent']]);
    expect(h.asked.at(-1)).toEqual(['ev1']);
    expect(readEventSends().map((r) => r.checkId)).toEqual(['ev1']);
  });

  it('keeps the photo in view after the page is opened again (it used to vanish after 3 seconds)', () => {
    window.localStorage.setItem(
      EVENT_SENDS_KEY,
      JSON.stringify([{ dealerId: 'd1', checkId: 'ev1', at: new Date().toISOString(), item: sentEvent({ sentAt: new Date().toISOString() }) }]),
    );
    const { result } = renderHookWithProviders(() => useKavachEventSends(), { route: '/' });
    expect(result.current.items.map((i) => i.state)).toEqual(['sent']);
  });

  it('does not show another pump\'s photo, nor one older than a week', () => {
    window.localStorage.setItem(
      EVENT_SENDS_KEY,
      JSON.stringify([
        { dealerId: 'other', checkId: 'x1', at: new Date().toISOString(), item: sentEvent({ checkId: 'x1' }) },
        { dealerId: 'd1', checkId: 'x2', at: '2020-01-01T00:00:00.000Z', item: sentEvent({ checkId: 'x2' }) },
      ]),
    );
    const { result } = renderHookWithProviders(() => useKavachEventSends(), { route: '/' });
    expect(result.current.items).toEqual([]);
    expect(h.asked.at(-1)).toEqual([]);
  });

  it('remembers a check once, newest first, and ignores a point with no check', () => {
    const { result } = renderHookWithProviders(() => useKavachEventSends(), { route: '/' });
    act(() => {
      result.current.remember(sentEvent());
      result.current.remember(sentEvent({ checkId: 'ev2' }));
      result.current.remember(sentEvent());
      result.current.remember(kItem({ checkId: null }));
    });
    expect(readEventSends().map((r) => r.checkId)).toEqual(['ev1', 'ev2']);
  });

  it('works with the browser\'s storage blocked: the page keeps the photo while it lives', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { result } = renderHookWithProviders(() => useKavachEventSends(), { route: '/' });
    act(() => result.current.remember(sentEvent()));
    expect(result.current.items.map((i) => i.checkId)).toEqual(['ev1']);
  });

  it('ignores damaged storage', () => {
    window.localStorage.setItem(EVENT_SENDS_KEY, '{not json');
    const { result } = renderHookWithProviders(() => useKavachEventSends(), { route: '/' });
    expect(result.current.items).toEqual([]);
    window.localStorage.setItem(EVENT_SENDS_KEY, JSON.stringify([{ nonsense: true }, 7]));
    expect(readEventSends()).toEqual([]);
  });
});
