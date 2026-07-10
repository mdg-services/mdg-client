import type { TFunction } from '@/lib/i18n';
import { formatDuration } from '@/lib/uploadAttachment';
import { replySnippet } from '@dk/shared/schemas';
import type { Message, MessageReplyContext } from '@dk/shared/types';


/**
 * Client-side snapshot of a message being replied to, embedded on the
 * OPTIMISTIC send so the quote renders instantly. Mirrors the server's
 * snapshot rules (body truncation, first attachment, first image) — the echo
 * replaces it with the authoritative version.
 */
export function buildReplyContext(m: Message): MessageReplyContext {
  const first = m.attachments[0];
  const firstImage = m.attachments.find((a) => a.kind === 'image');
  return {
    messageId: m.id,
    senderId: m.senderId,
    ...(m.senderName ? { senderName: m.senderName } : {}),
    ...(m.body ? { body: replySnippet(m.body) } : {}),
    ...(first ? { attachmentKind: first.kind, attachmentName: first.filename } : {}),
    ...(first?.durationMs !== undefined ? { durationMs: first.durationMs } : {}),
    ...(firstImage
      ? { imageStorageKey: firstImage.storageKey, imageUrl: firstImage.url }
      : {}),
    ...(m.card ? { card: true, cardTitle: m.card.title } : {}),
  };
}

export type ReplyPreviewIcon = 'image' | 'audio' | 'file' | 'card' | null;

export interface ReplyPreview {
  /** One-line snippet: the body excerpt or a localized kind label. */
  text: string;
  /** Which glyph to show next to the snippet (null = plain text). */
  icon: ReplyPreviewIcon;
}

/** One-line presentation of a quoted message, shared by the composer strip and the bubble quote block. */
export function replyPreview(rc: MessageReplyContext, t: TFunction): ReplyPreview {
  if (rc.card) return { text: rc.cardTitle ?? t('chat.replyFile'), icon: 'card' };
  if (rc.body) {
    return { text: rc.body, icon: rc.attachmentKind === 'image' ? 'image' : null };
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
  if (rc.attachmentKind === 'file') {
    return { text: rc.attachmentName ?? t('chat.replyFile'), icon: 'file' };
  }
  return { text: rc.body ?? '', icon: null };
}

/** Display name for a quoted sender: "You", the wire name, or the support fallback. */
export function replySenderLabel(
  rc: MessageReplyContext,
  currentUserId: string | undefined,
  t: TFunction,
): string {
  if (currentUserId && rc.senderId === currentUserId) return t('chat.you');
  return rc.senderName ?? t('chat.supportFallbackName');
}
