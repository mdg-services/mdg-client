import type { TFunction } from '@/lib/i18n';
import type { Lang } from '@/store/lang';
import type { Message } from '@dk/shared/types';

import type { MediaViewerItem } from './MediaViewer';

/**
 * The thread as WhatsApp lays it out, decided here so it can be tested without
 * a screen: which message opens a new day, which opens a run of bubbles from one
 * sender (and so gets the little tail and the wider gap above it), where the
 * "N unread messages" band goes, and what the full-screen viewer pages through.
 */

const DAY_MS = 86_400_000;

/** The local calendar day of a time, as "2026-10-12" — two times on one day share it. */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * What the date chip says: "Today", "Yesterday", the weekday for the rest of the
 * week, then the whole date — exactly the ladder WhatsApp uses, so a dealer never
 * has to work out which "Oct 9" is meant.
 */
export function dayLabel(iso: string, t: TFunction, lang: Lang, now: Date = new Date()): string {
  const d = new Date(iso);
  // Calendar days apart, not 24-hour blocks: 00:05 yesterday is "Yesterday" at
  // 23:55 today even though it is not 24 hours ago, and a clock change must not
  // turn a Sunday into a Saturday.
  const apart = Math.round((startOfDay(now) - startOfDay(d)) / DAY_MS);
  if (apart <= 0) return t('chat.today');
  if (apart === 1) return t('chat.yesterday');
  const locale = lang === 'hi' ? 'hi-IN' : 'en-IN';
  if (apart < 7) return d.toLocaleDateString(locale, { weekday: 'long' });
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
}

export interface RowMeta {
  dayKey: string;
  /** A date chip goes above this message. */
  showDay: boolean;
  /** The "N unread messages" band goes above this message. */
  showUnread: boolean;
  /**
   * First bubble of a run — the same sender, no day change and no band in
   * between. It gets the tail, the sender's name in a group, and an 8px gap above
   * it instead of the 2px between bubbles inside a run.
   */
  first: boolean;
}

/** `ordered` must already be oldest first. */
export function buildRowMeta(ordered: readonly Message[], unreadFirstId?: string | null): RowMeta[] {
  const out: RowMeta[] = [];
  let lastDay = '';
  let bandPlaced = false;
  ordered.forEach((m, i) => {
    const key = dayKey(m.createdAt);
    const showDay = key !== lastDay;
    lastDay = key;
    const showUnread = !bandPlaced && !!unreadFirstId && m.id === unreadFirstId;
    if (showUnread) bandPlaced = true;
    const prev = i > 0 ? ordered[i - 1] : undefined;
    const first = !prev || showDay || showUnread || prev.senderId !== m.senderId;
    out.push({ dayKey: key, showDay, showUnread, first });
  });
  return out;
}

/** What was waiting for the dealer when the thread opened. */
export interface UnreadOnOpen {
  /** Oldest unread message that is loaded, or null when there are none. */
  firstId: string | null;
  /** The number the band prints. */
  count: number;
}

/**
 * The messages from other people that the viewer has not read yet — captured the
 * moment the thread opens, BEFORE the screen tells the server it has read them.
 *
 * `listCount` is what the chat list showed on its green pill. The thread only
 * holds its newest page, so when more were waiting than fit, the band prints the
 * list's bigger, honest number rather than the 30 that happened to load.
 */
export function captureUnread(messages: readonly Message[], userId: string): UnreadOnOpen {
  const unread = messages
    .filter((m) => !m.id.startsWith('temp-') && m.senderId !== userId && !m.readBy.includes(userId))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  if (unread.length === 0) return { firstId: null, count: 0 };
  // The band says how many messages sit BELOW it, which is what the reader can
  // check by scrolling. The chat list's number can be larger — a week away is
  // more than one page — but printing "40 unread messages" over the 28 that are
  // actually under the line is a count nobody can reconcile.
  return { firstId: unread[0]!.id, count: unread.length };
}

/** Oldest first, one entry per id — a message that landed twice is drawn once. */
export function orderMessages(messages: readonly Message[]): Message[] {
  const seen = new Set<string>();
  const unique: Message[] = [];
  for (const m of messages) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    unique.push(m);
  }
  // A message still on its way out sits at the bottom whatever its time says. Its
  // time is the PHONE's clock, which this app never trusts, and while a photo
  // uploads (a minute on 2G) a phone running slow drew the new bubble above
  // MDG's latest message.
  return unique.sort((a, b) => {
    const pa = a.id.startsWith('temp-');
    const pb = b.id.startsWith('temp-');
    if (pa !== pb) return pa ? 1 : -1;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

/** The viewer's key for one picture. */
export function viewerKey(message: Pick<Message, 'id'>, storageKey: string): string {
  return `${message.id}:${storageKey}`;
}

/**
 * Every picture in the thread, oldest first, for the full-screen viewer. A
 * picture with no link yet (the live copy of a shared report) is still here: the
 * viewer asks for one through the message.
 */
export function buildViewerItems(
  ordered: readonly Message[],
  currentUserId: string,
  t: TFunction,
): MediaViewerItem[] {
  const items: MediaViewerItem[] = [];
  for (const m of ordered) {
    const label =
      m.senderId === currentUserId
        ? t('chat.you')
        : m.senderRole === 'admin'
          ? t('chat.senderMdg')
          : (m.senderName ?? t('chat.senderMdg'));
    for (const a of m.attachments) {
      if (a.kind !== 'image') continue;
      items.push({
        key: viewerKey(m, a.storageKey),
        attachment: a,
        source: { conversationId: m.conversationId, messageId: m.id },
        senderLabel: label,
        createdAt: m.createdAt,
        ...(m.body ? { caption: m.body } : {}),
      });
    }
  }
  return items;
}
