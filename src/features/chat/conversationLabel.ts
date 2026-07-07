import type { Conversation } from '@dk/shared/types';

import type { TFunction } from '@/lib/i18n';

/** A human title for a dealer-side conversation row/header. */
export function conversationTitle(conv: Conversation, t: TFunction): string {
  return conv.kind === 'manager' ? t('chat.managerThread') : t('chat.support');
}

/**
 * Participant names (excluding the viewer) for a manager group thread — shown as
 * a subtitle so an owner knows who else is in the manager chat.
 */
export function participantSubtitle(
  conv: Conversation,
  myId: string | undefined,
): string | undefined {
  if (conv.kind !== 'manager') return undefined;
  const names = (conv.participants ?? [])
    .filter((p) => p.userId !== myId)
    .map((p) => p.name)
    .filter((n): n is string => Boolean(n));
  return names.length > 0 ? names.join(', ') : undefined;
}

/** Whether the current viewer has unread messages in this thread. */
export function hasUnread(conv: Conversation, myId: string | undefined): boolean {
  // Prefer per-participant precision, but ONLY when the array actually carries
  // data. Some server paths (record-ready + Kavach-digest system messages, and
  // pre-group-model docs) set the coarse `unreadByDealer` flag without populating
  // the array — an empty array must fall through to that flag, not read as
  // "nobody is unread" (which would silently drop the badge).
  const ids = conv.unreadDealerUserIds;
  if (ids && ids.length > 0) {
    return myId ? ids.includes(myId) : true;
  }
  return Boolean(conv.unreadByDealer);
}
