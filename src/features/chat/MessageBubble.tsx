import { Camera, Check, CheckCheck, Clock, FileText, Mic, Zap } from 'lucide-react';
import * as React from 'react';

import { Spinner } from '@/components/ui';
import { RecordCard } from '@/features/records/RecordCard';
import { useOpenRecord, useRecord } from '@/hooks/api/useRecords';
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
  const openRecord = useOpenRecord();
  const url = recordQuery.data?.attachment.url;
  // A failed lookup used to render as "Preparing…" — a card that looks like it
  // is on its way and is in fact stuck, on a screen with nothing to press.
  const failed = recordQuery.isError;

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
          onOpen={() => openRecord(card.recordId)}
          failed={failed}
          onRetry={() => void recordQuery.refetch()}
          compact
        />
      </div>
      <span className="px-1 text-[11px] text-text-subtle">
        {formatTime(message.createdAt)}
      </span>
    </div>
  );
}

/**
 * An automated notice in the thread — a shared report, a resolution line.
 * Centred, and deliberately not a bubble.
 *
 * A notice DOES carry attachments and this used to render `message.body` and
 * nothing else. Three backend senders post `system: true` messages with image
 * cards on them — dsr-report/share.ts (two PNGs), kavach/share.ts (the score
 * card), creditDod/share.ts (the position card) — so the dealer's DSR notice
 * ended on the line "ऊपर दो तस्वीरें / See the two images above" with nothing
 * above it. The pictures were never lost from the product (they still reach the
 * Media gallery, which only filters `system` off the links tab), but in the
 * thread they were sent into they were invisible.
 *
 * Reactions, delivery ticks, the reply quote and the long-press action sheet
 * all stay off here on purpose: a notice about the thread is not a message you
 * reply to. `actionable` below and MessageList's `interactive` already exclude
 * system messages for the same reason.
 */
function SystemMessage({
  message,
  onOpenImage,
}: {
  message: Message;
  onOpenImage?: (attachment: Attachment) => void;
}) {
  const source = {
    conversationId: message.conversationId,
    messageId: message.id,
  };
  return (
    <div className="flex w-full flex-col items-center gap-1.5 animate-in">
      {message.attachments.length > 0 ? (
        <div className="flex w-full max-w-[85%] flex-col items-center gap-1.5">
          {message.attachments.map((a) => (
            <MessageAttachment
              key={a.storageKey}
              attachment={a}
              source={source}
              onOpenImage={onOpenImage}
            />
          ))}
        </div>
      ) : null}
      {message.body ? (
        // `rounded-lg`, not `rounded-full`: the same reason already recorded in
        // mdg-admin's copy of this component. The pill shape is only right for a
        // one-line note, and a bilingual service notice runs to a dozen lines —
        // a 9999px radius on a box that tall cuts a curve straight through its
        // own first and last lines.
        <p className="max-w-[85%] rounded-lg bg-surface-2 px-3 py-1 text-center text-[12px] text-text-muted">
          {message.body}
        </p>
      ) : null}
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
  onTalkToHuman,
  humanAsked = false,
}: {
  message: Message;
  mine: boolean;
  currentUserId?: string;
  /** Show the sender's name above the bubble (group threads, others' messages). */
  showSender?: boolean;
  /** True while the quote's original is being paged in (spinner on the quote). */
  quoteLoading?: boolean;
  /** Tap on an image → the full-screen viewer. The message comes along: a
   *  fresh presign is authorised through the message that carries the key. */
  onOpenImage?: (attachment: Attachment, message: Message) => void;
  /** Long-press → the message action sheet. */
  onAction?: (message: Message) => void;
  /** Tap on the reaction chips → the who-reacted sheet. */
  onOpenReactions?: (message: Message) => void;
  /** Tap on the quote block → jump to the original message. */
  onJumpTo?: (targetId: string, fromId: string) => void;
  /**
   * Tap on "Talk to a person" under a first-line answer. The chat screen owns
   * it because it sends an ORDINARY message — there is no endpoint behind this.
   */
  onTalkToHuman?: () => void;
  /**
   * A person has already been asked for on this thread.
   *
   * The offer stays VISIBLE and goes quiet rather than disappearing: a control
   * that vanishes under the thumb reads as a misfire, and the dealer needs to
   * see that the thing they pressed did something. Every older answer in the
   * thread carries this button, so without it a dealer who has already asked
   * scrolls up and asks twice.
   */
  humanAsked?: boolean;
}) {
  const t = useT();
  // Bound once per render: the attachment's own children only know the
  // attachment, and the viewer needs the message it hangs off.
  const openImage = onOpenImage
    ? (attachment: Attachment) => onOpenImage(attachment, message)
    : undefined;
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
    return <SystemMessage message={message} onOpenImage={openImage} />;
  }

  const reactionGroups = groupReactions(message.reactions ?? [], currentUserId);

  // The ONLY thing that marks a reply as machine-written. There is no `'ai'`
  // sender role and there must not be one: this bubble picks its side from
  // `senderRole === 'admin'`, so an unrecognised role would draw MDG's own
  // answer as if the dealer had typed it. Everything below is therefore
  // progressive enhancement — an app that predates this field ignores the
  // unknown key and draws an ordinary Support bubble, which is correct, merely
  // unlabelled.
  const ai = message.ai;
  // Offered under an answer, NOT under the handoff line. A handoff message
  // already says a person is coming, so a button asking for one is noise — and
  // tapping it would start a second turn, which costs a model call to reach the
  // conclusion the thread had already reached.
  const offerHuman = !!ai && ai.kind !== 'handoff' && !!onTalkToHuman;

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
                source={{
                  conversationId: message.conversationId,
                  messageId: message.id,
                }}
                onOpenImage={openImage}
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
        {offerHuman ? (
          // 44px is the floor, not the look: this is the escape hatch from a
          // machine that got it wrong, and it is pressed by a thumb on a phone
          // propped on a forecourt counter. It sends an ordinary message — the
          // backend's own handoff rule reads the text and puts the thread back
          // in the unassigned pool — so there is nothing here to fail if the
          // first line is switched off.
          <button
            type="button"
            onClick={onTalkToHuman}
            disabled={humanAsked}
            // A QUIET LINK, NOT A SECOND BUBBLE. Bordered, filled and shadowed,
            // this drew as a box the same weight as the answer above it, so the
            // eye read two messages and the offer competed with the thing the
            // dealer actually asked for. It is an aside; it should look like one.
            // The 44px stays — it is the floor for a thumb on a forecourt, and
            // the padding buys the height without the chrome.
            className={cn(
              'flex min-h-[44px] items-center self-start px-1 text-sm font-medium underline underline-offset-4 active:opacity-60',
              humanAsked ? 'text-text-subtle no-underline' : 'text-brand',
            )}
          >
            {humanAsked ? t('chat.aiHumanComing') : t('chat.aiTalkToHuman')}
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
          {ai && ai.kind !== 'handoff' ? (
            // On the timestamp's line rather than a line of its own, because a
            // footnote that gets its own row starts reading as a banner. A
            // Lucide glyph and not the ⚡ character: an emoji renders as a
            // colour picture on an Android WebView, which is the opposite of
            // quiet, and its width varies by font.
            //
            // NOT ON A HANDOFF. "Instant reply" under "I've passed this to the
            // MDG team" tells a dealer the machine answered them at the exact
            // moment it is saying it could not — and the handoff line is the one
            // a dealer reads while already unsatisfied, so it is the worst place
            // in the product to look pleased with ourselves.
            <span className="flex items-center gap-0.5">
              <Zap width={11} strokeWidth={2} className="shrink-0" />
              {t('chat.aiInstantReply')}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
});
