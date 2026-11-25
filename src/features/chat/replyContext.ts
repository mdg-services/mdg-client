import type { TFunction } from '@/lib/i18n';
import { formatDuration } from '@/lib/uploadAttachment';
import { replySnippet } from '@dk/shared/schemas';
import type { Message, MessageReplyContext } from '@dk/shared/types';

import { chatAttachments, cleanReportCaption, isLegacyReportCaption, isReportBubble } from './reportBubble';

/**
 * Client-side snapshot of a message being replied to, embedded on the
 * OPTIMISTIC send so the quote renders instantly. Mirrors the server's
 * snapshot rules (body truncation, first attachment, first image) — the echo
 * replaces it with the authoritative version.
 */
export function buildReplyContext(m: Message): MessageReplyContext {
  // A report's card is on Today: quoting the message quotes its words, not a thumbnail.
  const shown = chatAttachments(m);
  const first = shown[0];
  const firstImage = shown.find((a) => a.kind === 'image');
  return {
    messageId: m.id,
    senderId: m.senderId,
    ...(m.senderName ? { senderName: m.senderName } : {}),
    // An old report's caption is quoted as the chat shows it, not in its robot style.
    ...(m.body
      ? { body: replySnippet(isReportBubble(m) && isLegacyReportCaption(m) ? cleanReportCaption(m.body) : m.body) }
      : {}),
    ...(first ? { attachmentKind: first.kind, attachmentName: first.filename } : {}),
    ...(first?.durationMs !== undefined ? { durationMs: first.durationMs } : {}),
    ...(firstImage
      ? { imageStorageKey: firstImage.storageKey, imageUrl: firstImage.url }
      : {}),
  };
}

export type ReplyPreviewIcon = 'image' | 'audio' | 'video' | 'file' | null;

export interface ReplyPreview {
  /** One-line snippet: the body excerpt or a localized kind label. */
  text: string;
  /** Which glyph to show next to the snippet (null = plain text). */
  icon: ReplyPreviewIcon;
}

/**
 * A quoted video. The quote carries the attachment's kind and name but not its
 * content type, and a video is a `file` by kind — so the name's ending says it.
 */
function isVideoName(rc: MessageReplyContext): boolean {
  return (
    rc.attachmentKind === 'file' &&
    !!rc.attachmentName &&
    /\.(mp4|m4v|mov|webm)$/i.test(rc.attachmentName)
  );
}

/** One-line presentation of a quoted message, shared by the composer strip and the bubble quote block. */
export function replyPreview(rc: MessageReplyContext, t: TFunction): ReplyPreview {
  if (rc.body) {
    return {
      text: rc.body,
      icon: rc.attachmentKind === 'image' ? 'image' : isVideoName(rc) ? 'video' : null,
    };
  }
  if (rc.attachmentKind === 'image') return { text: t('chat.replyPhoto'), icon: 'image' };
  if (rc.attachmentKind === 'audio') {
    return {
      text:
        rc.durationMs !== undefined
          ? `${t('chat.replyVoice')} · ${formatDuration(rc.durationMs)}`
          : t('chat.replyVoice'),
      icon: 'audio',
    };
  }
  if (isVideoName(rc)) return { text: t('chat.replyVideo'), icon: 'video' };
  if (rc.attachmentKind === 'file') {
    return { text: rc.attachmentName ?? t('chat.replyFile'), icon: 'file' };
  }
  return { text: rc.body ?? '', icon: null };
}

/**
 * The server's own sender identity for asks, cards and notices
 * (`mdg-backend/src/seed/kavachTemplate.ts`). An admin reads it as "MDG System";
 * a dealer quoting one of those messages should see MDG, in their language.
 */
const SYSTEM_SENDER_NAME = 'MDG System';

/** Is this the server's own sender identity? Its name is never shown to a dealer. */
export const isSystemSenderName = (name: string | null | undefined): boolean => name === SYSTEM_SENDER_NAME;

/**
 * Display name for whoever sent a message, wherever a name is shown out of the
 * message itself: "You", the wire name, or the support fallback. The server's
 * own identity ("MDG System") is never shown to a dealer.
 */
export function senderDisplayName(
  sender: { senderId: string; senderName?: string | undefined; senderRole?: string | undefined },
  currentUserId: string | undefined,
  t: TFunction,
  dealerSideIds?: ReadonlySet<string>,
): string {
  if (currentUserId && sender.senderId === currentUserId) return t('chat.you');
  // Everyone at MDG is one sender to a dealer: "MDG". An admin's own name is never
  // shown — by role when the message is in hand, and by elimination otherwise (a
  // quote carries only an id: anyone who is not on the dealer's side of this thread
  // is the admin pool, the same rule the reactions and delivery sheets follow).
  if (sender.senderRole === 'admin') return t('chat.senderMdg');
  if (dealerSideIds && !dealerSideIds.has(sender.senderId)) return t('chat.senderMdg');
  // The same word the bubble itself carries, so a quote of a message says what the message did.
  if (isSystemSenderName(sender.senderName)) return t('chat.senderMdg');
  if (!sender.senderName) return t('chat.supportFallbackName');
  return sender.senderName;
}

/** Display name for a quoted sender: "You", the wire name, or the support fallback. */
export function replySenderLabel(
  rc: MessageReplyContext,
  currentUserId: string | undefined,
  t: TFunction,
  dealerSideIds?: ReadonlySet<string>,
): string {
  return senderDisplayName(rc, currentUserId, t, dealerSideIds);
}

/**
 * The people on the dealer's side of a thread: its primary member and every other
 * participant. The MDG admin pool is implicit and never listed, so anyone else is MDG.
 */
export function dealerSideIdsOf(
  conversation:
    | { userId?: string; participantUserIds?: string[]; participants?: { userId: string }[] }
    | undefined,
): ReadonlySet<string> | undefined {
  if (!conversation?.userId) return undefined;
  return new Set([
    conversation.userId,
    ...(conversation.participantUserIds ?? []),
    ...(conversation.participants ?? []).map((p) => p.userId),
  ]);
}
