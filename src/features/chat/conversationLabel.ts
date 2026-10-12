import type { TFunction } from '@/lib/i18n';
import type { Lang } from '@/store/lang';
import type { Conversation } from '@dk/shared/types';

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
  // data. Some server paths (the system messages MDG's services post, and
  // pre-group-model docs) set the coarse `unreadByDealer` flag without populating
  // the array — an empty array must fall through to that flag, not read as
  // "nobody is unread" (which would silently drop the badge).
  const ids = conv.unreadDealerUserIds;
  if (ids && ids.length > 0) {
    return myId ? ids.includes(myId) : true;
  }
  return Boolean(conv.unreadByDealer);
}

/**
 * What a chat-list row says about unread: whether to light it (the time turns
 * green) and the number for the pill.
 *
 * The server's `unreadCount` wins whenever it is there — it is counted for this
 * member, and the list socket keeps it current — so a thread read on another
 * device, or whose only unread message belongs to someone else in a group, is
 * not lit by a coarse flag that says otherwise. Without a count (a server that
 * predates the field, or a thread that only ever arrived over the socket) the
 * flags decide, and the row gets a plain dot: `count: null` means "unread, but
 * how many is not known" and must not be drawn as a number.
 */
export function unreadState(
  conv: Conversation,
  myId: string | undefined,
): { unread: boolean; count: number | null } {
  if (conv.unreadCount !== undefined) {
    const n = Math.max(0, Math.floor(conv.unreadCount));
    return { unread: n > 0, count: n > 0 ? n : null };
  }
  return { unread: hasUnread(conv, myId), count: null };
}

/** The line under a row's title: the last message, else who is in the group, else nothing yet. */
export function conversationPreview(
  conv: Conversation,
  myId: string | undefined,
  t: TFunction,
): string {
  return conv.lastMessagePreview || participantSubtitle(conv, myId) || t('chat.noMessagesYet');
}

/** The filter chips under the chat list's bar. */
export type ChatChip = 'all' | 'unread' | 'groups';

/** A group chip is only worth offering when the dealer is actually in a group. */
export function hasGroupThread(list: readonly Conversation[]): boolean {
  return list.some((c) => c.kind === 'manager');
}

/**
 * The rows to draw: the chip first, then the search words.
 *
 * Search looks at the title and the last message — what the row itself shows —
 * and ignores case. A search is the words the dealer typed, not a pattern, so
 * it is a plain substring match.
 */
export function filterConversations(
  list: readonly Conversation[],
  opts: { chip: ChatChip; query: string; myId: string | undefined; t: TFunction },
): Conversation[] {
  const { chip, query, myId, t } = opts;
  const needle = query.trim().toLocaleLowerCase();
  return list.filter((c) => {
    if (chip === 'unread' && !unreadState(c, myId).unread) return false;
    if (chip === 'groups' && c.kind !== 'manager') return false;
    if (!needle) return true;
    const hay = `${conversationTitle(c, t)}\n${conversationPreview(c, myId, t)}`;
    return hay.toLocaleLowerCase().includes(needle);
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * The time on the right of a chat-list row, the way WhatsApp prints it: today as
 * the clock time, yesterday as the word, the last week as the weekday, and
 * anything older as day/month/year.
 *
 * Calendar days, not 24-hour spans — a message from 11 pm last night is
 * "Yesterday" at 7 am, not "8 hours ago". The difference is rounded so a
 * daylight-saving change cannot turn two adjacent days into 0 or 2.
 */
export function formatListTime(
  iso: string | undefined,
  lang: Lang,
  t: TFunction,
  now: Date = new Date(),
): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';

  const daysAgo = Math.round((startOfDay(now) - startOfDay(d)) / DAY_MS);
  if (daysAgo <= 0) {
    const h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h % 12 || 12}:${m} ${h < 12 ? 'am' : 'pm'}`;
  }
  if (daysAgo === 1) return t('chat.yesterday');
  if (daysAgo < 7) {
    return d.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'long' });
  }
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${String(d.getFullYear()).slice(-2)}`;
}
