import { describe, expect, it } from 'vitest';

import type { TFunction } from '@/lib/i18n';
import type { Conversation } from '@dk/shared/types';

import {
  conversationTitle,
  hasUnread,
  participantSubtitle,
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
