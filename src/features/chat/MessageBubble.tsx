import { Camera, Check, CheckCheck, Clock, FileText, Mic, Video, Zap } from 'lucide-react';
import * as React from 'react';

import { Spinner } from '@/components/ui';
import { SetupCard, isRetiredSetupCard, setupCardHasBody } from '@/features/setup/SetupCard';
import { cn } from '@/lib/cn';
import { useLang, useT } from '@/lib/i18n';
import { linkify } from '@/lib/linkify';
import { detectPlatform } from '@/lib/nativeBridge';
import { useLongPress } from '@/lib/useLongPress';
import type { Lang } from '@/store/lang';
import type { Attachment, Message, MessageReaction } from '@dk/shared/types';

import type { AskPhase } from './askView';
import { AttachmentStack, splitAttachments } from './AttachmentPreview';
import { PortalLoginBox } from './PortalLoginBox';
import { replyPreview, replySenderLabel } from './replyContext';
import { ticketLineText, type TicketLineStatus } from './ticketLine';

const TIME_FORMATS = new Map<Lang, Intl.DateTimeFormat>();

/** "12:35 pm" — the clock inside a bubble, in the app's language. */
export function formatTime(iso: string, lang: Lang): string {
  let fmt = TIME_FORMATS.get(lang);
  if (!fmt) {
    // One formatter per language: a long thread draws hundreds of these.
    fmt = new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    TIME_FORMATS.set(lang, fmt);
  }
  return fmt.format(new Date(iso));
}

/** Stable display hue for a group-chat sender, derived from their user id. */
export function senderHue(senderId: string): number {
  let h = 0;
  for (let i = 0; i < senderId.length; i += 1) {
    h = (h * 31 + senderId.charCodeAt(i)) % 360;
  }
  return h;
}

/**
 * WhatsApp-style delivery state for one of the current user's own messages:
 * a clock while it is being sent, ✓ sent, ✓✓ delivered, ✓✓ in the read colour.
 * It takes the colour of the line it sits in, so over a photograph it is white
 * with the rest of the time — only the read colour is its own.
 */
function MessageTicks({ message }: { message: Message }) {
  // Optimistic, not yet acknowledged by the server.
  if (message.id.startsWith('temp-')) {
    return <Clock width={12} strokeWidth={2} className="opacity-80" />;
  }
  const seen = (message.readBy ?? []).some((id) => id !== message.senderId);
  if (seen) {
    return <CheckCheck width={15} strokeWidth={2} className="text-wa-tick-read" />;
  }
  const delivered = (message.deliveredTo ?? []).some(
    (id) => id !== message.senderId,
  );
  if (delivered) {
    return <CheckCheck width={15} strokeWidth={2} />;
  }
  return <Check width={15} strokeWidth={2} />;
}

const QUOTE_ICONS = {
  image: Camera,
  audio: Mic,
  video: Video,
  file: FileText,
} as const;

/** The quoted-original block rendered at the top of a replying bubble. */
function QuoteBlock({
  message,
  currentUserId,
  quoteLoading,
  onJumpTo,
}: {
  message: Message;
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
      className="mb-1 flex w-full items-stretch overflow-hidden rounded-md bg-black/[0.06] text-left active:bg-black/10"
    >
      <span className="w-1 shrink-0 bg-wa-accent" aria-hidden />
      <span className="min-w-0 flex-1 px-2 py-1">
        <span className="block truncate text-[13px] font-medium leading-tight text-wa-accent-strong">
          {replySenderLabel(rc, currentUserId, t)}
        </span>
        <span className="flex items-center gap-1 text-[13px] leading-snug text-wa-meta">
          {Icon ? <Icon width={13} strokeWidth={1.75} className="shrink-0" /> : null}
          <span className="line-clamp-2 break-words">{preview.text}</span>
        </span>
      </span>
      {quoteLoading ? (
        <span className="flex w-10 shrink-0 items-center justify-center">
          <Spinner size={14} />
        </span>
      ) : rc.imageUrl ? (
        <img
          src={rc.imageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className="h-10 w-10 shrink-0 object-cover"
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

/**
 * The little wedge on the first bubble of a run, hanging off its top corner —
 * left for theirs, right for mine. Drawn in the bubble's own colour (`currentColor`),
 * so one shape serves both.
 */
function Tail({ mine }: { mine: boolean }) {
  return (
    <svg
      data-tail=""
      aria-hidden
      viewBox="0 0 8 10"
      width={8}
      height={10}
      className={cn(
        'pointer-events-none absolute top-0 fill-current',
        mine ? '-right-[7px] scale-x-[-1] text-wa-out' : '-left-[7px] text-wa-in',
      )}
    >
      <path d="M8 0H0q5 .5 8 10z" />
    </svg>
  );
}

/**
 * How the dealer answers a request: through the camera, from their files (a photo
 * or a PDF), or from their photos (a picture only).
 */
export type AskAnswerHow = 'camera' | 'files' | 'gallery';

/**
 * What sits under a request MDG posted: the button that answers it, or what has
 * become of the answer.
 *
 * THE BUTTON IS A FULL-WIDTH, 44px BLACK ONE, and it is an ordinary button whose
 * `onClick` is handed straight up. That is deliberate: the camera has to be
 * opened INSIDE this tap (the Android WebView drops a picker opened from an
 * effect or after a state change), so nothing between the tap and the file input
 * may defer it — the chat screen's handler clicks the composer's input in the
 * same call (the composer makes the request the reply target only once a file
 * has actually been chosen).
 *
 * It is drawn only while the request is `open`. Once the dealer has answered it
 * says so in words, and once MDG has it, it says that: a button left on a
 * request that is already with MDG is an invitation to send the same photo twice.
 */
function AskFooter({
  message,
  phase,
  reason,
  onAnswer,
  onRetry,
}: {
  message: Message;
  phase: AskPhase;
  reason?: string;
  onAnswer?: (message: Message, how: AskAnswerHow) => void;
  onRetry?: () => void;
}) {
  const t = useT();
  if (phase === 'none') return null;

  if (phase === 'sent') {
    return (
      <p className="mt-1.5 flex items-center gap-1.5 px-0.5 text-[13px] text-wa-meta">
        <Clock width={14} strokeWidth={2} className="shrink-0" aria-hidden />
        {t('chat.askSent')}
      </p>
    );
  }
  if (phase === 'received') {
    return (
      <p className="mt-1.5 flex items-center gap-1.5 px-0.5 text-[13px] font-medium text-wa-bubble-text">
        <Check width={15} strokeWidth={2.5} className="shrink-0" aria-hidden />
        {t('chat.askReceived')}
      </p>
    );
  }
  if (phase === 'failed') {
    return (
      <div className="mt-1.5 flex items-center justify-between gap-2 px-0.5">
        <span className="text-[13px] text-wa-meta">{t('chat.askStateFailed')}</span>
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-md px-2 py-1 text-[13px] font-medium text-wa-accent-strong active:bg-wa-row-active"
        >
          {t('common.retry')}
        </button>
      </div>
    );
  }

  // `open`
  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      {reason ? (
        <p className="rounded-md bg-wa-notice px-2.5 py-1.5 text-[13px] leading-snug">
          <span className="font-medium">{t('chat.askSentBack')}: </span>
          {reason}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => onAnswer?.(message, 'camera')}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-wa-accent px-3 text-[15px] font-medium text-white active:opacity-90"
      >
        {/* A Lucide glyph and not the 📷 character: an emoji is a colour picture
            on an Android WebView, and its width varies by font. */}
        <Camera width={18} strokeWidth={2} className="shrink-0" aria-hidden />
        {t('chat.askSendPhoto')}
      </button>
      {/* A second way in under the camera, so the dealer who has already taken the
          picture does not have to take it again. A request that takes a paper gets
          the files (a photo or a PDF); one that takes only a photo gets the
          photos. */}
      <button
        type="button"
        onClick={() => onAnswer?.(message, message.ask?.acceptsFile ? 'files' : 'gallery')}
        className="flex h-11 w-full items-center justify-center rounded-lg border border-wa-divider bg-wa-chip px-3 text-[15px] font-medium text-wa-bubble-text active:bg-wa-row-active"
      >
        {message.ask?.acceptsFile
          ? t('chat.askChooseFile')
          : t(detectPlatform() === 'ios' ? 'chat.askChoosePhotos' : 'chat.askChooseGallery')}
      </button>
    </div>
  );
}

// Memoized: message objects are updated immutably in the query cache (see
// useConversationSocket applyReceipt / onNewMessage), so a typing toggle, a
// delivery/read receipt, or a new message re-renders only the changed bubble
// instead of every bubble in the thread. Every callback prop must therefore
// stay referentially stable (created once in MessageList/ChatPage), and the
// ticket line arrives as a status word and a number rather than the ticket, for
// the same reason: one ticket changing must re-render one bubble.
export const MessageBubble = React.memo(function MessageBubble({
  message,
  mine,
  currentUserId,
  showSender,
  first = true,
  quoteLoading,
  highlight,
  onOpenImage,
  onLongPress,
  onOpenReactions,
  onJumpTo,
  ticketStatus,
  ticketNumber,
  askPhase = 'none',
  askReason,
  onAskAnswer,
  onAskRetry,
}: {
  message: Message;
  mine: boolean;
  currentUserId?: string;
  /** Show the sender's name inside the bubble (group threads, others' messages). */
  showSender?: boolean;
  /**
   * First bubble of a run from one sender: it gets the tail and, in a group, the
   * sender's name. MessageList decides; a bubble drawn alone is a run of one.
   */
  first?: boolean;
  /** True while the quote's original is being paged in (spinner on the quote). */
  quoteLoading?: boolean;
  /** Words to paint in the search-hit colour (a search is open). */
  highlight?: string;
  /** Tap on an image → the full-screen viewer. The message comes along: a
   *  fresh presign is authorised through the message that carries the key. */
  onOpenImage?: (attachment: Attachment, message: Message) => void;
  /** Long-press → start (or change) the selection. */
  onLongPress?: (message: Message) => void;
  /** Tap on the reaction chips → the who-reacted sheet. */
  onOpenReactions?: (message: Message) => void;
  /** Tap on the quote block → jump to the original message. */
  onJumpTo?: (targetId: string, fromId: string) => void;
  /**
   * Where the ticket this message raised stands. Set by MessageList only when
   * the message names a ticket AND the conversation still lists it; absent, the
   * line is simply not drawn. Always given together with `ticketNumber`.
   */
  ticketStatus?: TicketLineStatus;
  ticketNumber?: number;
  /**
   * Where the request this message asks for stands (ADR 0019) — set by
   * MessageList only on a message that carries `ask`. A status word, not the
   * request, for the memo's sake: one request changing re-renders one bubble.
   */
  askPhase?: AskPhase;
  /** MDG's words when it sent the dealer's answer back. */
  askReason?: string;
  /** "Send photo" / "Choose file" on a request. Called INSIDE the tap. */
  onAskAnswer?: (message: Message, how: AskAnswerHow) => void;
  /** "Try again" when where the request stands could not be fetched. */
  onAskRetry?: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const pending = message.id.startsWith('temp-');
  // Bound once per render: the attachment's own children only know the
  // attachment, and the viewer needs the message it hangs off.
  const openImage = onOpenImage
    ? (attachment: Attachment) => onOpenImage(attachment, message)
    : undefined;
  const source = React.useMemo(
    () => ({ conversationId: message.conversationId, messageId: message.id }),
    [message.conversationId, message.id],
  );
  // EVERY message is selectable, whoever sent it — a shared report is as much a
  // message as a typed line — except one still on its way out, which the server
  // does not know yet and so cannot be replied to, reacted to or looked up.
  const longPress = useLongPress(() => onLongPress?.(message), {
    disabled: !onLongPress || pending,
  });

  // The retired services question: nothing left to answer, so nothing is drawn.
  // (After the hooks above, so the order they run in never changes.)
  if (isRetiredSetupCard(message)) return null;

  const reactionGroups = groupReactions(message.reactions ?? [], currentUserId);
  const { images, voices, videos, docs } = splitAttachments(message.attachments);
  const hasBody = !!message.body;
  const hasMedia = images.length > 0;
  const hasOther = voices.length > 0 || videos.length > 0 || docs.length > 0;
  // A picture with no caption carries its time ON the picture, on a soft dark
  // gradient — never a bar of its own underneath.
  const timeOnPicture = hasMedia && !hasBody && !hasOther;

  // The only thing that marks a reply as machine-written. There is no `'ai'`
  // sender role and there must not be one: a role this app does not know would
  // be drawn as a person's reply. Everything below is therefore progressive
  // enhancement — an app that predates this field ignores the unknown key and
  // draws an ordinary bubble, which is correct, merely unlabelled.
  const ai = message.ai;
  const showAiBadge = !!ai && ai.kind !== 'handoff';

  // A REQUEST MDG POSTED (`message.ask`): its title and day sit on a light inset
  // above the words, and its button (or what became of the answer) sits under
  // them. Both are drawn from the message itself — an app that predates the
  // field shows the words and nothing more, which is still a request a person
  // can answer by hand.
  const ask = message.ask;
  // A LOGIN BOX MDG POSTED (`message.portalLogin`): the user ID and password
  // form sits under the words, one block per portal. Like a request it is as
  // wide as a picture and carries its time on its own line.
  const portalLogin = message.portalLogin;
  // A SETUP CARD MDG posted (`message.setupCard`): the services picker, the
  // billing form, the bill. Drawn under the words from the outlet's state NOW,
  // never from what was true when the message was posted. Wide, like the login
  // box; a card that is only words (the welcome) leaves the bubble as it was.
  const setupCard = message.setupCard;
  const hasSetupBody = !!setupCard && setupCardHasBody(setupCard.card);
  const wide = hasMedia || videos.length > 0 || !!ask || !!portalLogin || hasSetupBody;

  // WHERE THE TIME GOES. Inside the text's last line when there is text (the
  // spacer below keeps the words from running under it); on the picture when it
  // is a bare picture; on a line of its own when the bubble ends in something
  // that has no last line of text — a voice note, a document — or when the
  // "Instant reply" footnote needs the room beside it.
  //
  // A request always has its time on its own line: its button runs the full
  // width of the bubble, and a time pinned to the bottom-right corner would sit
  // on top of it. So does a login box, for the same reason.
  const metaInFlow =
    !timeOnPicture && (showAiBadge || !hasBody || !!ask || !!portalLogin || hasSetupBody);

  const time = formatTime(message.createdAt, lang);
  const meta = (overlay: boolean) => (
    <span
      className={cn(
        'flex items-center gap-1 whitespace-nowrap text-[11px] leading-none',
        overlay ? 'text-white' : 'text-wa-meta',
      )}
    >
      <span>{time}</span>
      {mine ? <MessageTicks message={message} /> : null}
    </span>
  );

  // A notice (a shared report, a daily line) is MDG's — the bubble says "MDG",
  // as the viewer does, not the name of the account that posted it.
  const senderLabel = message.system ? t('chat.senderMdg') : message.senderName;
  const showName = !!showSender && !mine && first && !!senderLabel;

  return (
    <div className={cn('flex w-full', mine ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'flex flex-col',
          mine ? 'items-end' : 'items-start',
          // A request (or a login box, or a video) is as wide as a picture, so its button is
          // worth pressing.
          wide ? 'w-[min(80%,330px)]' : 'max-w-[80%]',
        )}
      >
        <div
          {...longPress}
          className={cn(
            'relative min-w-0 rounded-md text-wa-bubble-text shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]',
            wide && 'w-full',
            mine ? 'bg-wa-out' : 'bg-wa-in',
            first && (mine ? 'rounded-tr-none' : 'rounded-tl-none'),
            hasMedia || hasOther ? 'p-[3px]' : 'px-[9px] pb-[7px] pt-[6px]',
          )}
        >
          {first ? <Tail mine={mine} /> : null}

          {showName ? (
            <span
              className={cn(
                'block truncate text-[13px] font-medium leading-tight',
                hasMedia || hasOther ? 'px-1.5 pb-1 pt-1' : 'pb-0.5',
              )}
              style={{ color: `hsl(${senderHue(message.senderId)} 55% 40%)` }}
            >
              {senderLabel}
            </span>
          ) : null}

          {message.replyTo ? (
            <QuoteBlock
              message={message}
              currentUserId={currentUserId}
              quoteLoading={quoteLoading}
              onJumpTo={onJumpTo}
            />
          ) : null}

          {ask ? (
            <div
              data-ask-ref={ask.ref}
              className="mb-1 rounded-md bg-wa-row-active px-2.5 py-2"
            >
              <p className="break-words text-[14px] font-medium leading-snug">{ask.title}</p>
              {ask.periodLabel ? (
                <p className="text-[13px] leading-snug text-wa-meta">{ask.periodLabel}</p>
              ) : null}
            </div>
          ) : null}

          {message.attachments.length > 0 ? (
            <div className="flex flex-col gap-1">
              <AttachmentStack
                attachments={message.attachments}
                mine={mine}
                senderName={message.senderName}
                source={source}
                onOpenImage={openImage}
                mediaOverlay={
                  timeOnPicture ? (
                    <>
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-x-0 bottom-0 h-12 rounded-b-md bg-gradient-to-t from-black/45 to-transparent"
                      />
                      <span className="pointer-events-none absolute bottom-1.5 right-2">
                        {meta(true)}
                      </span>
                    </>
                  ) : null
                }
              />
            </div>
          ) : null}

          {hasBody ? (
            <div
              className={cn(
                // NOT selectable: long-press selects the message (Copy lives in
                // the bar above), so the browser's text-selection long-press
                // must not race it.
                'whitespace-pre-wrap break-words text-[15px] leading-[1.35] [&_a]:text-wa-accent-strong',
                hasMedia || hasOther ? 'px-[6px] pb-0.5 pt-1' : '',
              )}
            >
              {linkify(message.body!, { highlight })}
              {/* The trailing spacer: as wide as the time and ticks that sit in
                  the bubble's bottom-right corner, so the last line of words
                  stops short of them — or wraps to a line of its own when it
                  cannot — exactly as WhatsApp's does. */}
              {metaInFlow ? null : (
                <span
                  aria-hidden
                  className={cn(
                    'inline-block h-px align-bottom',
                    mine ? 'w-[72px]' : 'w-[54px]',
                  )}
                />
              )}
            </div>
          ) : null}

          {portalLogin ? <PortalLoginBox portals={portalLogin.portals} /> : null}

          {setupCard ? <SetupCard card={setupCard.card} /> : null}

          {ask ? (
            <AskFooter
              message={message}
              phase={askPhase}
              reason={askReason}
              onAnswer={onAskAnswer}
              onRetry={onAskRetry}
            />
          ) : null}

          {metaInFlow ? (
            <div className="flex items-center justify-between gap-3 px-1.5 pb-0.5 pt-0.5">
              {showAiBadge ? (
                // On the time's own row rather than a line of its own, because a
                // footnote that gets its own row starts reading as a banner. A
                // Lucide glyph and not the ⚡ character: an emoji renders as a
                // colour picture on an Android WebView, which is the opposite of
                // quiet, and its width varies by font.
                //
                // NOT ON A HANDOFF. "Instant reply" under "I've passed this to
                // the MDG team" tells a dealer the machine answered them at the
                // exact moment it is saying it could not — and the handoff line
                // is the one a dealer reads while already unsatisfied, so it is
                // the worst place in the product to look pleased with ourselves.
                <span className="flex items-center gap-0.5 text-[11px] leading-none text-wa-meta">
                  <Zap width={11} strokeWidth={2} className="shrink-0" />
                  {t('chat.aiInstantReply')}
                </span>
              ) : (
                <span />
              )}
              {meta(false)}
            </div>
          ) : null}
          {!metaInFlow && !timeOnPicture ? (
            <span className="absolute bottom-[5px] right-[8px]">{meta(false)}</span>
          ) : null}
        </div>

        {reactionGroups.length > 0 ? (
          <button
            type="button"
            aria-label={t('chat.reactions')}
            onClick={() => onOpenReactions?.(message)}
            className={cn(
              // Hangs off the bubble's bottom edge, half over it, like WhatsApp's.
              'relative z-10 -mt-2.5 mb-1 flex items-center gap-1',
              mine ? 'mr-2' : 'ml-2',
            )}
          >
            {reactionGroups.map((g) => (
              <span
                key={g.emoji}
                className={cn(
                  'flex items-center gap-0.5 rounded-full border bg-wa-in px-1.5 py-0.5 text-[13px] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]',
                  g.mine ? 'border-wa-accent' : 'border-wa-divider',
                )}
              >
                <span>{g.emoji}</span>
                {g.count > 1 ? (
                  <span className="text-[11px] tabular-nums text-wa-meta">
                    {g.count}
                  </span>
                ) : null}
              </span>
            ))}
          </button>
        ) : null}
        {ticketStatus && ticketNumber !== undefined ? (
          // ONE QUIET LINE, NOT A CONTROL. Same size and colour as the time
          // inside the bubble above it, no button, and not green: a ticket
          // closing is not a success to celebrate, it only says a person has
          // dealt with it, and what they wrote is in the thread.
          <p className="mt-0.5 px-1 text-[11px] text-wa-meta">
            {ticketLineText(lang, ticketStatus, ticketNumber)}
          </p>
        ) : null}
      </div>
    </div>
  );
});
