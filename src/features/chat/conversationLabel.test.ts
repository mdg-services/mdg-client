import { describe, expect, it } from 'vitest';

import type { TFunction } from '@/lib/i18n';
import type { Conversation } from '@dk/shared/types';

import {
  conversationPreview,
  conversationTitle,
  filterConversations,
  formatListTime,
  hasGroupThread,
  hasUnread,
  participantSubtitle,
  unreadState,
} from './conversationLabel';

// A stub translator that echoes the key, so assertions read against key names.
const t = ((k: string) => k) as unknown as TFunction;

function conv(over: Partial<Conversation> = {}): Conversation {
  return {
    id: 'c1',
    dealerId: 'd1',
    userId: 'owner',
    kind: 'support',
    participantUserIds: ['owner'],
    status: 'OPEN',
    unreadByAdmin: false,
    unreadByDealer: false,
    unreadDealerUserIds: [],
    createdAt: '',
    updatedAt: '',
    ...over,
  } as Conversation;
}

describe('conversationTitle', () => {
  it('labels a support thread and a manager thread distinctly', () => {
    expect(conversationTitle(conv({ kind: 'support' }), t)).toBe('chat.support');
    expect(conversationTitle(conv({ kind: 'manager' }), t)).toBe('chat.managerThread');
  });
});

describe('participantSubtitle', () => {
  it('is undefined for a support thread', () => {
    expect(participantSubtitle(conv({ kind: 'support' }), 'owner')).toBeUndefined();
  });

  it('lists the OTHER participants of a manager thread (excludes the viewer)', () => {
    const c = conv({
      kind: 'manager',
      userId: 'manager',
      participants: [
        { userId: 'manager', name: 'Pump Manager' },
        { userId: 'owner', name: 'Ramesh' },
      ],
    });
    // Viewer = the owner → sees the manager (not themselves).
    expect(participantSubtitle(c, 'owner')).toBe('Pump Manager');
    // Viewer = the manager → sees the owner.
    expect(participantSubtitle(c, 'manager')).toBe('Ramesh');
  });
});

describe('hasUnread', () => {
  it('uses per-participant unread when present', () => {
    expect(hasUnread(conv({ unreadDealerUserIds: ['owner'] }), 'owner')).toBe(true);
    expect(hasUnread(conv({ unreadDealerUserIds: ['manager'] }), 'owner')).toBe(false);
  });

  it('falls back to the coarse flag when per-participant data is absent', () => {
    const legacy = conv({ unreadDealerUserIds: undefined, unreadByDealer: true });
    expect(hasUnread(legacy, 'owner')).toBe(true);
  });

  it('falls back to the coarse flag when the array is EMPTY but unreadByDealer is set', () => {
    // record-ready / Kavach-digest system messages set unreadByDealer without
    // populating the per-participant array — an empty array must not hide the badge.
    const systemMsg = conv({ unreadDealerUserIds: [], unreadByDealer: true });
    expect(hasUnread(systemMsg, 'owner')).toBe(true);
  });

  it('shows no badge when both the array is empty AND unreadByDealer is false', () => {
    expect(
      hasUnread(conv({ unreadDealerUserIds: [], unreadByDealer: false }), 'owner'),
    ).toBe(false);
  });
});

describe('unreadState', () => {
  it('trusts the server count over a coarse flag that says otherwise', () => {
    // Read on another phone: the flags have not caught up, the count has.
    const c = conv({ unreadCount: 0, unreadByDealer: true, unreadDealerUserIds: ['owner'] });
    expect(unreadState(c, 'owner')).toEqual({ unread: false, count: null });
  });

  it('gives the number for the pill when there is one', () => {
    expect(unreadState(conv({ unreadCount: 12 }), 'owner')).toEqual({ unread: true, count: 12 });
  });

  it('falls back to the flags, with no number, when no count was sent', () => {
    expect(unreadState(conv({ unreadDealerUserIds: ['owner'] }), 'owner')).toEqual({
      unread: true,
      count: null,
    });
    expect(unreadState(conv(), 'owner')).toEqual({ unread: false, count: null });
  });
});

describe('conversationPreview', () => {
  it('prefers the last message, then the group members, then "no messages yet"', () => {
    expect(conversationPreview(conv({ lastMessagePreview: 'hello' }), 'owner', t)).toBe('hello');
    const group = conv({
      kind: 'manager',
      participants: [
        { userId: 'manager', name: 'Pump Manager' },
        { userId: 'owner', name: 'Ramesh' },
      ],
    });
    expect(conversationPreview(group, 'owner', t)).toBe('Pump Manager');
    expect(conversationPreview(conv(), 'owner', t)).toBe('chat.noMessagesYet');
  });
});

describe('hasGroupThread', () => {
  it('is true only when a manager group thread is in the list', () => {
    expect(hasGroupThread([conv()])).toBe(false);
    expect(hasGroupThread([conv(), conv({ id: 'c2', kind: 'manager' })])).toBe(true);
  });
});

describe('filterConversations', () => {
  const support = conv({ id: 's', lastMessagePreview: 'Your report is ready', unreadCount: 2 });
  const group = conv({
    id: 'g',
    kind: 'manager',
    lastMessagePreview: 'Tanker came at 6',
    unreadCount: 0,
  });
  const all = [support, group];
  const run = (chip: 'all' | 'unread' | 'groups', query = '') =>
    filterConversations(all, { chip, query, myId: 'owner', t }).map((c) => c.id);

  it('keeps everything on "All" with no search words', () => {
    expect(run('all')).toEqual(['s', 'g']);
  });

  it('keeps only threads with something unread on "Unread"', () => {
    expect(run('unread')).toEqual(['s']);
  });

  it('keeps only the group on "Groups"', () => {
    expect(run('groups')).toEqual(['g']);
  });

  it('searches the last message, ignoring case', () => {
    expect(run('all', 'TANKER')).toEqual(['g']);
    expect(run('all', '  report ')).toEqual(['s']);
  });

  it('searches the title the row shows', () => {
    expect(run('all', 'chat.managerThread')).toEqual(['g']);
  });

  it('applies the chip and the search together', () => {
    expect(run('unread', 'tanker')).toEqual([]);
  });

  it('treats search words as plain text, not a pattern', () => {
    expect(run('all', '.*')).toEqual([]);
  });
});

describe('formatListTime', () => {
  // A Wednesday afternoon, local time — the helper works in the phone's own day.
  const now = new Date(2026, 9, 14, 15, 30); // Wed 14 Oct 2026
  const at = (y: number, mo: number, d: number, h = 9, mi = 5) =>
    new Date(y, mo, d, h, mi).toISOString();

  it('prints today as the clock time with am/pm', () => {
    expect(formatListTime(at(2026, 9, 14, 9, 5), 'en', t, now)).toBe('9:05 am');
    expect(formatListTime(at(2026, 9, 14, 0, 7), 'en', t, now)).toBe('12:07 am');
    expect(formatListTime(at(2026, 9, 14, 12, 0), 'en', t, now)).toBe('12:00 pm');
    expect(formatListTime(at(2026, 9, 14, 23, 59), 'en', t, now)).toBe('11:59 pm');
  });

  it('prints yesterday as the word, even for a message from late last night', () => {
    expect(formatListTime(at(2026, 9, 13, 23, 50), 'en', t, now)).toBe('chat.yesterday');
    // …and a message from 7 hours ago that crossed midnight is still "yesterday".
    const earlyMorning = new Date(2026, 9, 14, 6, 0);
    expect(formatListTime(at(2026, 9, 13, 23, 50), 'en', t, earlyMorning)).toBe('chat.yesterday');
  });

  it('prints the last week as the weekday', () => {
    expect(formatListTime(at(2026, 9, 12), 'en', t, now)).toBe('Monday');
    expect(formatListTime(at(2026, 9, 8), 'en', t, now)).toBe('Thursday');
  });

  it('prints anything a week or older as day/month/year', () => {
    expect(formatListTime(at(2026, 9, 7), 'en', t, now)).toBe('07/10/26');
    expect(formatListTime(at(2025, 11, 25), 'en', t, now)).toBe('25/12/25');
  });

  it('writes the weekday in Hindi for a Hindi reader', () => {
    const hindi = formatListTime(at(2026, 9, 12), 'hi', t, now);
    expect(hindi).not.toBe('Monday');
    expect(hindi).toMatch(/[\u0900-\u097F]/);
  });

  it('says nothing for a missing or broken time', () => {
    expect(formatListTime(undefined, 'en', t, now)).toBe('');
    expect(formatListTime('not a date', 'en', t, now)).toBe('');
  });
});
