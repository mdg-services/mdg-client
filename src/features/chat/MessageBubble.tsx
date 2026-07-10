import { Camera, Check, CheckCheck, Clock, FileText, Mic } from 'lucide-react';
import * as React from 'react';

import { Spinner } from '@/components/ui';
import { RecordCard } from '@/features/records/RecordCard';
import { useRecord } from '@/hooks/api/useRecords';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { linkify } from '@/lib/linkify';
import { useLongPress } from '@/lib/useLongPress';
import type { Attachment, Message, MessageReaction } from '@dk/shared/types';

import { MessageAttachment } from './AttachmentPreview';
import { replyPreview, replySenderLabel } from './replyContext';

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Stable display hue for a group-chat sender, derived from their user id. */
export function senderHue(senderId: string): number {
  let h = 0;
  for (let i = 0; i < senderId.length; i += 1) {
    h = (h * 31 + senderId.charCodeAt(i)) % 360;
  }
  return h;
}

function CardMessage({ message }: { message: Message }) {
  const card = message.card!;
  // Resolve the signed file URL so the card is tappable.
  const recordQuery = useRecord(card.recordId);
  const url = recordQuery.data?.attachment.url;

  return (
    <div className="flex w-full flex-col items-center gap-1.5 animate-in">
      {message.body ? (
        <p className="max-w-[80%] text-center text-xs text-text-muted">
          {message.body}
        </p>
      ) : null}
      <div className="w-full max-w-[88%]">
        <RecordCard
          record={{
            recordType: card.recordType,
            title: card.title,
            periodLabel: card.periodLabel,
          }}
          url={url}
          compact
        />
      </div>
      <span className="px-1 text-[11px] text-text-subtle">
        {formatTime(message.createdAt)}
      </span>
    </div>
  );
}

function SystemMessage({ message }: { message: Message }) {
  return (
    <div className="flex w-full justify-center animate-in">
      <p className="max-w-[85%] rounded-full bg-surface-2 px-3 py-1 text-center text-[12px] text-text-muted">
        {message.body}
      </p>
    </div>
  );
}

/** WhatsApp-style delivery state for one of the current user's own messages. */
function MessageTicks({ message }: { message: Message }) {
  // Optimistic, not yet acknowledged by the server.
  if (message.id.startsWith('temp-')) {
    return <Clock width={12} strokeWidth={2} className="opacity-70" />;
  }
  const seen = (message.readBy ?? []).some((id) => id !== message.senderId);
  if (seen) {
    return <CheckCheck width={14} strokeWidth={2} className="text-[#34b7f1]" />;
  }
  const delivered = (message.deliveredTo ?? []).some(
    (id) => id !== message.senderId,
  );
  if (delivered) {
    return <CheckCheck width={14} strokeWidth={2} />;
  }
  return <Check width={14} strokeWidth={2} />;
}

const QUOTE_ICONS = {
  image: Camera,
  audio: Mic,
  file: FileText,
  card: FileText,
} as const;

/** The quoted-original block rendered at the top of a replying bubble. */
function QuoteBlock({
  message,
  mine,
  currentUserId,
  quoteLoading,
  onJumpTo,
}: {
  message: Message;
  mine: boolean;
  currentUserId?: string;
  quoteLoading?: boolean;
  onJumpTo?: (targetId: string, fromId: string) => void;
}) {
  const t = useT();
  const rc = message.replyTo!;
  const preview = replyPreview(rc, t);
  const Icon = preview.icon ? QUOTE_ICONS[preview.icon] : null;
  return (
    <button
      type="button"
      onClick={() => onJumpTo?.(rc.messageId, message.id)}
      className={cn(
        'flex w-full items-center gap-2 overflow-hidden rounded-lg border-l-[3px] px-2 py-1.5 text-left',
        mine ? 'border-white/70 bg-white/15' : 'border-brand bg-surface-2',
      )}
    >
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate text-xs font-semibold',
            mine ? 'text-text-inverse' : 'text-text',
          )}
        >
          {replySenderLabel(rc, currentUserId, t)}
        </span>
        <span
          className={cn(
            'flex items-center gap-1 text-xs',
            mine ? 'text-text-inverse/80' : 'text-text-muted',
          )}
        >
          {Icon ? <Icon width={12} strokeWidth={1.75} className="shrink-0" /> : null}
          <span className="truncate">{preview.text}</span>
        </span>
      </span>
      {quoteLoading ? (
        <Spinner size={14} />
      ) : rc.imageUrl ? (
        <img
          src={rc.imageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className="h-9 w-9 shrink-0 rounded-md object-cover"
        />
      ) : null}
    </button>
  );
}

interface ReactionGroup {
  emoji: string;
  count: number;
  mine: boolean;
}

function groupReactions(
  reactions: MessageReaction[],
  currentUserId: string | undefined,
): ReactionGroup[] {
  const groups: ReactionGroup[] = [];
  const index = new Map<string, number>();
  for (const r of reactions) {
    let i = index.get(r.emoji);
    if (i === undefined) {
      i = groups.length;
      index.set(r.emoji, i);
      groups.push({ emoji: r.emoji, count: 0, mine: false });
    }
    groups[i]!.count += 1;
    if (currentUserId && r.userId === currentUserId) groups[i]!.mine = true;
  }
  return groups;
}

// Memoized: message objects are updated immutably in the query cache (see
// useConversationSocket applyReceipt / onNewMessage), so a typing toggle, a
// delivery/read receipt, or a new message re-renders only the changed bubble
// instead of every bubble in the thread. Every callback prop must therefore
// stay referentially stable (created once in MessageList/ChatPage).
export const MessageBubble = React.memo(function MessageBubble({
  message,
  mine,
  currentUserId,
  showSender,
  quoteLoading,
  onOpenImage,
  onAction,
  onOpenReactions,
  onJumpTo,
}: {
  message: Message;
  mine: boolean;
  currentUserId?: string;
  /** Show the sender's name above the bubble (group threads, others' messages). */
  showSender?: boolean;
  /** True while the quote's original is being paged in (spinner on the quote). */
  quoteLoading?: boolean;
  onOpenImage?: (attachment: Attachment) => void;
  /** Long-press → the message action sheet. */
  onAction?: (message: Message) => void;
  /** Tap on the reaction chips → the who-reacted sheet. */
  onOpenReactions?: (message: Message) => void;
  /** Tap on the quote block → jump to the original message. */
  onJumpTo?: (targetId: string, fromId: string) => void;
}) {
  const t = useT();
  const actionable =
    !!onAction &&
    !message.system &&
    !message.card &&
    !message.id.startsWith('temp-');
  const longPress = useLongPress(() => onAction?.(message), {
    disabled: !actionable,
  });

  if (message.card) {
    return <CardMessage message={message} />;
  }
  if (message.system) {
    return <SystemMessage message={message} />;
  }

  const reactionGroups = groupReactions(message.reactions ?? [], currentUserId);

  return (
    <div
      className={cn(
        'flex w-full animate-in',
        mine ? 'justify-end' : 'justify-start',
      )}
    >
      <div
        className={cn(
          'flex max-w-[78%] flex-col gap-1.5',
          mine ? 'items-end' : 'items-start',
        )}
        {...longPress}
      >
        {showSender && !mine && message.senderName ? (
          <span
            className="px-1 text-xs font-medium leading-none"
            style={{ color: `hsl(${senderHue(message.senderId)} 55% 45%)` }}
          >
            {message.senderName}
          </span>
        ) : null}
        {message.replyTo ? (
          <QuoteBlock
            message={message}
            mine={mine}
            currentUserId={currentUserId}
            quoteLoading={quoteLoading}
            onJumpTo={onJumpTo}
          />
        ) : null}
        {message.attachments.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {message.attachments.map((a) => (
              <MessageAttachment
                key={a.storageKey}
                attachment={a}
                mine={mine}
                onOpenImage={onOpenImage}
              />
            ))}
          </div>
        ) : null}
        {message.body ? (
          <div
            className={cn(
              // NOT selectable: long-press opens the action menu (Copy lives
              // there), so the browser's text-selection long-press must not race it.
              'whitespace-pre-wrap break-words rounded-3xl px-4 py-2.5 text-[15px] leading-snug shadow-sm',
              mine
                ? 'bg-brand text-text-inverse rounded-br-md'
                : 'bg-surface text-text border border-border rounded-bl-md',
            )}
          >
            {linkify(message.body)}
          </div>
        ) : null}
        {reactionGroups.length > 0 ? (
          <button
            type="button"
            aria-label={t('chat.reactions')}
            onClick={() => onOpenReactions?.(message)}
            className={cn(
              'relative z-10 -mt-2 flex items-center gap-1',
              mine ? 'mr-1.5' : 'ml-1.5',
            )}
          >
            {reactionGroups.map((g) => (
              <span
                key={g.emoji}
                className={cn(
                  'flex items-center gap-0.5 rounded-full border bg-surface px-1.5 py-0.5 text-[13px] shadow-sm',
                  g.mine ? 'border-brand bg-brand-soft' : 'border-border',
                )}
              >
                <span>{g.emoji}</span>
                {g.count > 1 ? (
                  <span className="text-[11px] tabular-nums text-text-muted">
                    {g.count}
                  </span>
                ) : null}
              </span>
            ))}
          </button>
        ) : null}
        <div
          className={cn(
            'flex items-center gap-1 px-1 text-[11px] text-text-subtle',
            mine ? 'flex-row-reverse' : 'flex-row',
          )}
        >
          <span>{formatTime(message.createdAt)}</span>
          {mine ? <MessageTicks message={message} /> : null}
        </div>
      </div>
    </div>
  );
});
