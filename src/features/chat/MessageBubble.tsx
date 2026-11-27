import { Camera, Check, CheckCheck, ChevronRight, Clock, FileText, Mic, Video } from 'lucide-react';
import * as React from 'react';
import { useInRouterContext } from 'react-router-dom';

import { Spinner } from '@/components/ui';
import { OutletDetailsCard } from '@/features/outletDetails/OutletDetailsCard';
import { familyVar } from '@/features/reports/familyVar';
import { kindStyle } from '@/features/reports/kindStyle';
import { ReportModal } from '@/features/reports/lazy';
import { useOpenReport } from '@/features/reports/reportNav';
import { sayWords } from '@/features/reports/types';
import { SetupCard, isRetiredSetupCard, setupCardHasBody } from '@/features/setup/SetupCard';
import { YourVideosCard } from '@/features/yourVideos/YourVideosCard';
import { cn } from '@/lib/cn';
import type { AttachmentSource } from '@/lib/downloadAttachment';
import { isEmbedded } from '@/lib/embedMode';
import { useLang, useT } from '@/lib/i18n';
import { richText } from '@/lib/linkify';
import { detectPlatform } from '@/lib/nativeBridge';
import { useLongPress } from '@/lib/useLongPress';
import type { Lang } from '@/store/lang';
import { sayIn } from '@dk/shared/types';
import { type Attachment, type Message, type MessageReaction } from '@dk/shared/types';

import type { AskPhase } from './askView';
import { AttachmentStack, splitAttachments } from './AttachmentPreview';
import { type ChatSide, chatLook, sideOf } from './chatLook';
import { ComplaintBox } from './Complaints/ComplaintBox';
import { DeclarationsBox } from './Declarations/DeclarationsBox';
import { DuOtpAckBox } from './DuOtpAckBox';
import { FuelOrderCardView } from './FuelOrderCardView';
import { MockDrillBox } from './MockDrill/MockDrillBox';
import { PortalLoginBox } from './PortalLoginBox';
import { readerBody } from './readerLanguage';
import { AnsweredChoice, ReplyChoices } from './ReplyChoices';
import { isSystemSenderName, replyPreview, replySenderLabel } from './replyContext';
import {
  REPORT_SENTENCE_KEY,
  chatAttachments,
  cleanReportCaption,
  isLegacyReportCaption,
  isReportBubble,
  reportKindOf,
  reportRowOf,
} from './reportBubble';
import { SignLetterOpen } from './SignLetterAsk';
import { isSignLetterAsk } from './signLetterView';
import { WemmisLoginBox } from './WemmisLoginBox';
import { WorkPermitBox } from './WorkPermits/WorkPermitBox';

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
  dealerSideIds,
  quoteLoading,
  hideImage,
  onJumpTo,
}: {
  message: Message;
  currentUserId?: string;
  dealerSideIds?: ReadonlySet<string> | undefined;
  quoteLoading?: boolean;
  /** The quoted message is a report: its card is on Today, so no thumbnail of it here. */
  hideImage?: boolean;
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
      className={cn(chatLook.quote, 'active:bg-black/10')}
    >
      <span className="w-1 shrink-0 bg-wa-accent" aria-hidden />
      <span className="min-w-0 flex-1 px-2 py-1">
        <span className={chatLook.quoteName}>
          {replySenderLabel(rc, currentUserId, t, dealerSideIds)}
        </span>
        <span className={chatLook.quoteWords}>
          {Icon ? <Icon width={13} strokeWidth={1.75} className="shrink-0" /> : null}
          <span className="line-clamp-2 break-words">{preview.text}</span>
        </span>
      </span>
      {quoteLoading ? (
        <span className="flex w-10 shrink-0 items-center justify-center">
          <Spinner size={14} />
        </span>
      ) : rc.imageUrl && !hideImage ? (
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
function Tail({ fromMdg, side }: { fromMdg: boolean; side: ChatSide }) {
  return (
    <svg
      data-tail=""
      aria-hidden
      viewBox="0 0 8 10"
      width={8}
      height={10}
      className={chatLook.tail(fromMdg, side)}
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
  source,
  phase,
  reason,
  onAnswer,
  onRetry,
}: {
  message: Message;
  /** The message as an attachment's address: how a letter on it is downloaded. */
  source: AttachmentSource;
  phase: AskPhase;
  reason?: string;
  onAnswer?: (message: Message, how: AskAnswerHow) => void;
  onRetry?: () => void;
}) {
  const t = useT();
  if (phase === 'none') return null;

  if (phase === 'sent') {
    return (
      <p className="mt-1.5 flex items-center gap-1.5 px-0.5 text-meta text-wa-meta">
        <Clock width={14} strokeWidth={2} className="shrink-0" aria-hidden />
        {t('chat.askSent')}
      </p>
    );
  }
  if (phase === 'received') {
    return (
      <p className="mt-1.5 flex items-center gap-1.5 px-0.5 text-meta font-medium text-wa-bubble-text">
        <Check width={15} strokeWidth={2.5} className="shrink-0" aria-hidden />
        {t('chat.askReceived')}
      </p>
    );
  }
  if (phase === 'failed') {
    return (
      <div className="mt-1.5 flex items-center justify-between gap-2 px-0.5">
        <span className="text-meta text-wa-meta">{t('chat.askStateFailed')}</span>
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-md px-2 py-1 text-meta font-medium text-wa-accent-strong active:bg-wa-row-active"
        >
          {t('common.retry')}
        </button>
      </div>
    );
  }

  // `open`
  const sentBack = reason ? (
    <p className="rounded-md bg-wa-notice px-2.5 py-1.5 text-meta leading-snug">
      <span className="font-medium">{t('chat.askSentBack')}: </span>
      {reason}
    </p>
  ) : null;

  // A LETTER TO SIGN: three steps and its own buttons (ADR 0029). It is still the
  // same request — the phases above, and the answer below, are the usual ones.
  if (isSignLetterAsk(message)) {
    return <SignLetterOpen message={message} source={source} lead={sentBack} onAnswer={onAnswer} />;
  }

  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      {sentBack}
      <button
        type="button"
        onClick={() => onAnswer?.(message, 'camera')}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-wa-accent px-3 text-cta text-white active:opacity-90"
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
        className="flex h-11 w-full items-center justify-center rounded-lg border border-wa-divider bg-wa-chip px-3 text-body font-medium text-wa-bubble-text active:bg-wa-row-active"
      >
        {message.ask?.acceptsFile
          ? t('chat.askChooseFile')
          : t(detectPlatform() === 'ios' ? 'chat.askChoosePhotos' : 'chat.askChooseGallery')}
      </button>
    </div>
  );
}

/**
 * The button under a report's words (ADR 0056 §5): it NAMES the report ("See sales report ›"),
 * in the report's own colour and icon, so a dealer who taps without reading knows which one it is.
 *
 * It opens the report's overlay. The overlay draws from the snapshot on this very message, so it
 * is handed the message's own copy as its first frame and opens at once, with no network, even
 * for a report Today no longer lists. A message sent before snapshots has only its picture, and
 * the same button opens the overlay, which shows the picture.
 *
 * In the extension's side panel there is no Today to be over, so the overlay opens as a modal
 * inside the thread (`ReportModal`) and the thread stays where it was.
 *
 * The bubble is memoized, so the click handler lives down here with the router hook rather than
 * being handed in. It is drawn only inside a router (every screen is in one); a bare bubble in a
 * test has nowhere to open a report.
 */
function ReportButton({
  message,
  onJumpTo,
}: {
  message: Message;
  onJumpTo?: ((targetId: string, fromId: string) => void) | undefined;
}) {
  return useInRouterContext() ? <ReportButtonInner message={message} onJumpTo={onJumpTo} /> : null;
}

function ReportButtonInner({
  message,
  onJumpTo,
}: {
  message: Message;
  onJumpTo?: ((targetId: string, fromId: string) => void) | undefined;
}) {
  const lang = useLang();
  const openReport = useOpenReport();
  const [modalOpen, setModalOpen] = React.useState(false);
  const closeModal = React.useCallback(() => setModalOpen(false), []);
  const kind = reportKindOf(message);
  const jump = React.useCallback((id: string) => onJumpTo?.(id, id), [onJumpTo]);
  if (!kind) return null;
  const style = kindStyle(kind);
  const row = reportRowOf(message, readerBody(message, lang, false).text);
  const onTap = () => {
    if (isEmbedded()) {
      setModalOpen(true);
      return;
    }
    openReport({
      conversationId: message.conversationId,
      messageId: message.id,
      ...(row ? { report: row } : {}),
    });
  };
  return (
    <>
      <button
        type="button"
        data-testid="report-button"
        data-kind={kind}
        // A tap on the button must not start a reply swipe or select the message.
        data-no-swipe
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onTap();
        }}
        className="mt-2 flex min-h-12 w-full items-center gap-3 rounded-[10px] border border-border bg-surface px-2.5 py-2 text-left text-cta leading-snug text-text transition-colors duration-150 active:bg-surface-2"
      >
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: familyVar(style.family, 'soft'), color: familyVar(style.family, 'ink') }}
          aria-hidden
        >
          <style.Icon width={18} strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1 break-words">{sayWords(style.button, lang)}</span>
        <ChevronRight width={18} strokeWidth={1.75} className="shrink-0 text-text-subtle rtl:rotate-180" aria-hidden />
      </button>
      {modalOpen ? (
        <React.Suspense fallback={null}>
          <ReportModal
            conversationId={message.conversationId}
            messageId={message.id}
            placeholder={row ?? undefined}
            onClose={closeModal}
            onJumpTo={jump}
          />
        </React.Suspense>
      ) : null}
    </>
  );
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
  dealerSideIds,
  showSender,
  first = true,
  quoteLoading,
  highlight,
  onOpenImage,
  onLongPress,
  onOpenReactions,
  onJumpTo,
  quoteHideImage,
  askPhase = 'none',
  askReason,
  onAskAnswer,
  onAskRetry,
  choicesLive = false,
  onChoice,
  answeredWith,
}: {
  message: Message;
  mine: boolean;
  currentUserId?: string;
  /** Who is on the dealer's side of this thread; any other sender is MDG (see `replySenderLabel`). */
  dealerSideIds?: ReadonlySet<string> | undefined;
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
  /** The message this one quotes is a report: its picture is not shown as a thumbnail in the quote. */
  quoteHideImage?: boolean;
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
  /** This is the newest message in the chat, so its answer buttons (if any) can be tapped. */
  choicesLive?: boolean;
  /** A tap on an answer button: send its words as the dealer's own message. */
  onChoice?: (text: string) => void;
  /** The answer button the reply that followed names (ADR 0059): drawn ticked under the question. */
  answeredWith?: string | null;
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
  // The reader's tap on "See original" under a translated message.
  const [showOriginal, setShowOriginal] = React.useState(false);

  // The retired services question: nothing left to answer, so nothing is drawn.
  // (After the hooks above, so the order they run in never changes.)
  if (isRetiredSetupCard(message)) return null;

  const reactionGroups = groupReactions(message.reactions ?? [], currentUserId);
  // A REPORT (ADR 0055): a card MDG sent to be read. Here it is the team's words and a
  // button to Today, with no picture — `attachments` is what is left of it once the card
  // pictures are taken off, which is nothing for a plain report.
  const reportBubble = isReportBubble(message);
  const attachments = chatAttachments(message);
  const { images, voices, videos, docs } = splitAttachments(attachments);

  // Everyone at MDG is one sender to a dealer, "MDG", whatever the stored name: an AI
  // reply carries "MDG System" because it is not flagged `system`, an admin their own.
  const fromMdg =
    message.system || message.senderRole === 'admin' || isSystemSenderName(message.senderName);
  const senderLabel = fromMdg ? t('chat.senderMdg') : message.senderName;
  // The dealer's own words sit on the right and the team's on the left (the admin shows it the other way round).
  const side = sideOf('dealer', fromMdg);

  // MDG's notices carry every language, and what MDG's team or assistant wrote is
  // translated for each reader: each sees their own (owner and manager may differ).
  const shownBody = readerBody(message, lang, showOriginal);
  // An older card's caption leads with an emoji or a label and a dot; a team member's
  // sentence does not. A report with no words of its own says what it is.
  let body = shownBody.text;
  if (reportBubble) {
    // Only an old caption is cleaned: a tagged message is already the team's own words,
    // and an announcement is what an admin typed.
    body = body ? (isLegacyReportCaption(message) ? cleanReportCaption(body) : body) : undefined;
    const kind = reportKindOf(message);
    if (!body && kind && !message.announcement && !message.fuelCard) {
      body = t(REPORT_SENTENCE_KEY[kind]);
    }
  }
  // "Translated · See original", or "Original · See translation" after the tap. Only on
  // a co-owner's or manager's words: MDG's are never offered as a translation.
  const canSwitch =
    !fromMdg &&
    (shownBody.translated || (showOriginal && !!message.bodyLang && message.bodyLang !== lang));
  const hasBody = !!body;
  const hasMedia = images.length > 0;
  const hasOther = voices.length > 0 || videos.length > 0 || docs.length > 0;
  // A picture with no caption carries its time ON the picture, on a soft dark
  // gradient — never a bar of its own underneath.
  const timeOnPicture = hasMedia && !hasBody && !hasOther;

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
  // THE eMaaptaul LOGIN BOX (`message.wemmisLogin`, ADR 0029): the same idea, for
  // the Bihar weights-and-measures site's login. Wide and timed on its own line,
  // like the box above.
  const wemmisLogin = message.wemmisLogin;
  // THE DU OTP BOX (`message.duOtpAck`, ADR 0033): the step-by-step form that
  // collects what IndianOil's portal needs to acknowledge a dispensing unit that
  // was opened with an OTP. An empty object means "draw it": the box reads the
  // outlet's live view and the message carries nothing else. Wide and timed on its
  // own line, like the boxes above.
  const duOtpAck = message.duOtpAck;
  // THE MOCK DRILL BOX (`message.mockDrill`, ADR 0034): which emergency was
  // practised, two photos and the day. Like the box above, an empty object means
  // "draw it": it reads the outlet's live view. Wide and timed on its own line.
  const mockDrill = message.mockDrill;
  // THE COMPLAINT BOX (`message.complaint`, ADR 0052): drawn live on the one message the
  // complaint's view names, and nothing extra on the others. Wide, timed on its own line.
  const complaint = message.complaint;
  // THE WORK PERMIT BOX (`message.workPermit`, ADR 0053): same rule, live on one message only.
  const workPermit = message.workPermit;
  // THE DECLARATIONS BOX (`message.declarations`, ADR 0037): the two washroom
  // photos IndianOil's weekly declaration needs. Again an empty object means "draw
  // it": it reads the outlet's live view. Wide and timed on its own line.
  const declarations = message.declarations;
  // THE PUMP DETAILS FORM (`message.outletDetails`): the questions MDG asks about the
  // pump (its state first). An empty object means "draw it": the card reads the outlet's
  // live view and the message carries nothing else. Wide and timed on its own line.
  const outletDetails = message.outletDetails;
  // THE "YOUR VIDEOS" LIST (`message.videoList`): a video for each service, the sentences to
  // type to it and a tick on the ones this reader has watched. An empty object means "draw
  // it": the card reads this person's live list. Wide and timed on its own line.
  const videoList = message.videoList;
  // A SETUP CARD MDG posted (`message.setupCard`): the company choice, the
  // billing form, the bill. Drawn under the words from the outlet's state NOW,
  // never from what was true when the message was posted. Wide, like the login
  // box; a card that is only words (the welcome) leaves the bubble as it was.
  const setupCard = message.setupCard;
  // AN ANNOUNCEMENT MDG posted (`message.announcement`, ADR 0039): a bold title, then the
  // words with their `*bold*` marks (the coloured strip it once had is gone, ADR 0055).
  // Wide, timed on its own line; a dealer answers it by writing in the chat. An app that
  // predates the field draws the words as an ordinary bubble, which still reads.
  const announcement = message.announcement;
  // A TANKER MESSAGE MDG posted (`message.fuelCard`, ADR 0041): a strip, the tanker
  // number large, then the order's facts one per line. Drawn INSTEAD of the words
  // (they are its plain copy, for an older app and for search). Wide, timed on its own line.
  const fuelCard = message.fuelCard;
  const hasSetupBody = !!setupCard && setupCardHasBody(setupCard.card);
  const wide =
    hasMedia ||
    videos.length > 0 ||
    !!ask ||
    !!portalLogin ||
    !!wemmisLogin ||
    !!duOtpAck ||
    !!mockDrill ||
    !!complaint ||
    !!workPermit ||
    !!declarations ||
    !!outletDetails ||
    !!videoList ||
    !!announcement ||
    !!fuelCard ||
    hasSetupBody;

  // WHERE THE TIME GOES. Inside the text's last line when there is text (the
  // spacer below keeps the words from running under it); on the picture when it
  // is a bare picture; on a line of its own when the bubble ends in something
  // that has no last line of text — a voice note, a document.
  //
  // A request always has its time on its own line: its button runs the full
  // width of the bubble, and a time pinned to the bottom-right corner would sit
  // on top of it. So does a login box, and a report's button to Today, for the
  // same reason.
  const metaInFlow =
    !timeOnPicture &&
    (reportBubble ||
      !hasBody ||
      !!ask ||
      !!portalLogin ||
      !!wemmisLogin ||
      !!duOtpAck ||
      !!mockDrill ||
      !!complaint ||
      !!workPermit ||
      !!declarations ||
      !!outletDetails ||
      !!videoList ||
      !!announcement ||
      !!fuelCard ||
      hasSetupBody);

  const time = formatTime(message.createdAt, lang);
  const meta = (overlay: boolean) => (
    <span
      className={cn(chatLook.meta, overlay ? 'text-white' : 'text-wa-meta')}
    >
      <span>{time}</span>
      {mine ? <MessageTicks message={message} /> : null}
    </span>
  );

  // An admin's own name is never shown to a dealer: whoever at MDG wrote it, it is "MDG".
  // An announcement or a tanker card used to carry "MDG" in its coloured strip and hid the
  // name; the strip is gone (ADR 0055), so the name shows where any sender's name shows.
  const showName = !!showSender && !mine && first && !!senderLabel;

  return (
    <div className={chatLook.row(side)}>
      {/* A request (or a login box, or a video) is as wide as a picture, so its button is
          worth pressing. */}
      <div className={chatLook.column(side, wide)}>
        <div
          {...longPress}
          className={chatLook.bubble({ fromMdg, side, first, wide, padded: !(hasMedia || hasOther) })}
        >
          {first ? <Tail fromMdg={fromMdg} side={side} /> : null}

          {showName ? (
            <span
              className={cn(chatLook.name, hasMedia || hasOther ? 'px-1.5 pb-1 pt-1' : 'pb-0.5')}
              style={{ color: `hsl(${senderHue(message.senderId)} 55% 40%)` }}
            >
              {senderLabel}
            </span>
          ) : null}

          {announcement ? (
            // A plain card: a bold title, then the words. No coloured strip and no
            // label — a notice from the team reads like the rest of what it writes.
            <div data-testid="announcement-card" className="pb-0.5">
              <p className="break-words text-subheading leading-snug">{announcement.title}</p>
              {hasBody ? (
                <div className="mt-1.5 whitespace-pre-wrap break-words text-body leading-[1.4] [&_a]:text-wa-accent-strong">
                  {richText(body!, { highlight })}
                </div>
              ) : null}
            </div>
          ) : null}

          {fuelCard && !announcement ? <FuelOrderCardView card={fuelCard} lang={lang} /> : null}

          {message.replyTo ? (
            <QuoteBlock
              message={message}
              currentUserId={currentUserId}
              dealerSideIds={dealerSideIds}
              quoteLoading={quoteLoading}
              hideImage={quoteHideImage}
              onJumpTo={onJumpTo}
            />
          ) : null}

          {ask ? (
            <div
              data-ask-ref={ask.ref}
              className="mb-1 rounded-md bg-wa-row-active px-2.5 py-2"
            >
              <p className="break-words text-meta font-medium leading-snug">
                {ask.titleByLang ? sayIn(ask.titleByLang, lang) || ask.title : ask.title}
              </p>
              {ask.periodLabel ? (
                <p className="text-meta leading-snug text-wa-meta">
                  {ask.periodLabelByLang ? sayIn(ask.periodLabelByLang, lang) || ask.periodLabel : ask.periodLabel}
                </p>
              ) : null}
            </div>
          ) : null}

          {attachments.length > 0 ? (
            <div className="flex flex-col gap-1">
              <AttachmentStack
                attachments={attachments}
                mine={mine}
                senderName={senderLabel}
                // A machine's reading of a dealer's voice note is never shown to the dealer.
                showTranscript={fromMdg}
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

          {hasBody && !announcement && !fuelCard ? (
            <div
              className={cn(
                // NOT selectable: long-press selects the message (Copy lives in
                // the bar above), so the browser's text-selection long-press
                // must not race it.
                chatLook.words,
                hasMedia || hasOther ? 'px-[6px] pb-0.5 pt-1' : '',
              )}
            >
              {richText(body!, { highlight })}
              {canSwitch ? (
                <button
                  type="button"
                  data-testid="translated-toggle"
                  // A tap on the label must not start a reply swipe or select the message.
                  data-no-swipe
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowOriginal((v) => !v);
                  }}
                  className="-ml-1 mt-0.5 flex min-h-8 items-center rounded-md px-1 text-meta font-medium text-wa-meta active:bg-black/10"
                >
                  {showOriginal ? t('chat.originalSeeTranslation') : t('chat.translatedSeeOriginal')}
                </button>
              ) : null}
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

          {reportBubble ? <ReportButton message={message} onJumpTo={onJumpTo} /> : null}

          {portalLogin ? (
            <PortalLoginBox
              portals={portalLogin.portals}
              pick={portalLogin.pick === true}
              withWemmis={portalLogin.withWemmis === true}
            />
          ) : null}

          {wemmisLogin ? <WemmisLoginBox /> : null}

          {duOtpAck ? <DuOtpAckBox /> : null}

          {mockDrill ? <MockDrillBox /> : null}
          {complaint ? (
            <ComplaintBox complaintId={complaint.complaintId} messageId={message.id} />
          ) : null}
          {workPermit ? (
            <WorkPermitBox permitId={workPermit.permitId} messageId={message.id} />
          ) : null}

          {declarations ? <DeclarationsBox /> : null}

          {outletDetails ? <OutletDetailsCard /> : null}
          {videoList ? <YourVideosCard /> : null}

          {setupCard ? <SetupCard card={setupCard.card} /> : null}

          {ask ? (
            <AskFooter
              message={message}
              source={source}
              phase={askPhase}
              reason={askReason}
              onAnswer={onAskAnswer}
              onRetry={onAskRetry}
            />
          ) : null}

          {metaInFlow ? (
            <div
              className={cn(
                'flex items-center justify-between gap-3 pb-0.5 pt-0.5',
                'px-1.5',
              )}
            >
              <span />
              {meta(false)}
            </div>
          ) : null}
          {!metaInFlow && !timeOnPicture ? (
            <span className="absolute bottom-[5px] right-[8px]">{meta(false)}</span>
          ) : null}
        </div>

        {message.replyChoices && choicesLive && !mine && onChoice ? (
          <ReplyChoices choices={message.replyChoices} lang={lang} onChoice={onChoice} />
        ) : message.replyChoices && answeredWith && !mine ? (
          <AnsweredChoice words={answeredWith} />
        ) : null}

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
                  chatLook.reaction,
                  g.mine ? 'border-wa-accent' : 'border-wa-divider',
                )}
              >
                <span>{g.emoji}</span>
                {g.count > 1 ? (
                  <span className={chatLook.reactionCount}>
                    {g.count}
                  </span>
                ) : null}
              </span>
            ))}
          </button>
        ) : null}
      </div>
    </div>
  );
});
