import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import * as React from 'react';

import { invalidateChatAskStates, markAskSentThenRecheck } from '@/hooks/api/useChatAskStates';
import { aliasMessageId, isPendingMessage, messagesQueryKey } from '@/hooks/api/useMessages';
import { invalidatePortalLogins } from '@/hooks/api/usePortalLogins';
import { reactionMutationsPending } from '@/hooks/api/useReactToMessage';
import { getSocket } from '@/lib/socket';
import { onSocketReconnect } from '@/lib/socketReconnect';
import { useAuthStore } from '@/store/auth';
import type {
  Conversation,
  ConversationKind,
  Message,
  MessageReaction,
} from '@dk/shared/types';

export interface TypingState {
  active: boolean;
  userName?: string;
}

/**
 * How long the dots stay up after ONE `typing` event — and why the two numbers
 * are so far apart.
 *
 * A PERSON emits `typing` on every keystroke (the Composer's textarea calls
 * `onTyping` in its `onChange`), so a stream of events keeps refreshing the
 * window and three seconds of silence really does mean they stopped writing.
 *
 * THE MACHINE EMITS EXACTLY ONCE and then thinks. `emitTypingAs` on the server
 * is called at stage 4 of the AI first line and never again. Under v1 the turn
 * was one model call and usually landed inside three seconds, so nobody noticed.
 * v2's turn is TWO calls — a router and then a writer, deliberately serial —
 * under a nine-second wall clock, and its own budget puts the median at about
 * 2.6 s and the worst case at 8.65 s. A three-second window therefore drops the
 * dots while MDG is still composing, and the answer lands into a thread that has
 * been silent for six seconds. That is exactly the "reads as a machine" failure
 * the server-side emit was written to prevent, so the hold has to cover the
 * server's own deadline.
 *
 * WHICH SOURCE IT IS, IS DECIDED BY THE THREAD, NOT BY THE PAYLOAD, and that is
 * sound rather than a guess. The first line stands down on a manager's group
 * thread (`convo.kind === 'manager'` → reason `group_thread`; it posts nothing
 * at all), and mdg-admin never emits `typing` — it only listens. So in a support
 * thread the only thing that can be writing is the machine, and in a group
 * thread the only thing that can be writing is another person at the pump.
 *
 * The long hold is a BACKSTOP and almost never runs to the end: an arriving
 * message clears the dots immediately (see `onNewMessage`). It only plays out in
 * full on the paths where the turn posts nothing after the dot was raised.
 */
const TYPING_HOLD_MS = {
  /** Three seconds after the last keystroke. Unchanged behaviour. */
  person: 3_000,
  /** The server's whole turn deadline (9 s) plus the post. */
  machine: 10_000,
} as const;

/**
 * How often a person who is typing tells the room about it.
 *
 * The textarea calls `onTyping` on EVERY keystroke, and each event is a socket
 * frame up a 2G link plus a `ConversationModel.exists()` on the server (the
 * `typing` handler authorises before it fans out) — so a 60-character message
 * was 60 database round trips to raise a dot that was already up.
 *
 * NOTHING SENDS A "STOPPED TYPING" EVENT, here or on the admin side: the dots
 * come down on a timer after the LAST event, TYPING_HOLD_MS.person = 3 s on both
 * receivers. So the only way a throttle can break them is by letting the gap
 * between two emits reach that hold; 1.5 s leaves a whole event of slack for a
 * frame that arrives late off a bad link. The cost is that the dots now linger
 * up to one interval longer after the real last keystroke — 4.5 s instead of
 * 3 s in the worst case, which nobody can tell from a pause for thought.
 *
 * Leading edge, so the FIRST keystroke still raises the dots instantly; a
 * trailing throttle would read as 1.5 s of lag every time a reply begins.
 */
const TYPING_EMIT_INTERVAL_MS = 1_500;

/**
 * Whether a message from the server is the confirmation of a bubble the phone
 * drew itself: the same words, and no more pictures than it was drawn with (a
 * file that failed to upload is simply missing from the confirmed one).
 */
function confirms(real: Message, placeholder: Message): boolean {
  return (
    (real.body ?? '') === (placeholder.body ?? '') &&
    (real.attachments.length > 0) === (placeholder.attachments.length > 0) &&
    real.attachments.length <= placeholder.attachments.length
  );
}

export function useConversationSocket(
  conversationId: string | undefined,
  currentUserId: string | undefined,
  /**
   * The thread kind, for the typing hold above. Optional and defaulting to the
   * machine's window, because it arrives with `/conversations/mine` and is
   * routinely still undefined when the socket joins — and a support thread is
   * both the common case and the one that needs the long hold.
   */
  conversationKind?: ConversationKind,
) {
  const qc = useQueryClient();
  // Not read below — it is a dependency, and the effect says why.
  const token = useAuthStore((s) => s.token);
  const [typing, setTyping] = React.useState<TypingState>({ active: false });
  const typingTimer = React.useRef<number | null>(null);
  // Read through a ref inside the socket handlers rather than closed over, so
  // that the thread kind resolving a moment after mount never re-runs the effect
  // below — that would leave and re-join the room for a cosmetic timeout.
  const typingHoldMs = React.useRef<number>(TYPING_HOLD_MS.machine);
  typingHoldMs.current =
    conversationKind === 'manager' ? TYPING_HOLD_MS.person : TYPING_HOLD_MS.machine;

  // Merge a delivery/read receipt into the cached messages: append `userId` to
  // the given field (deliveredTo | readBy) for every message in `ids`.
  const applyReceipt = React.useCallback(
    (field: 'deliveredTo' | 'readBy', userId: string, ids: string[]) => {
      if (!conversationId || ids.length === 0) return;
      const idSet = new Set(ids);
      qc.setQueryData<InfiniteData<Message[]>>(
        messagesQueryKey(conversationId),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) =>
              page.map((m) => {
                if (!idSet.has(m.id)) return m;
                const arr = m[field] ?? [];
                if (arr.includes(userId)) return m;
                return { ...m, [field]: [...arr, userId] };
              }),
            ),
          };
        },
      );
    },
    [conversationId, qc],
  );

  React.useEffect(() => {
    if (!conversationId) return;
    const socket = getSocket();
    if (!socket) return;

    // Join the room on every connect (including reconnects).
    const join = () => socket.emit('conversation:join', conversationId);
    if (socket.connected) join();
    socket.on('connect', join);

    // On a RE-connect (socket dropped and came back — common on flaky 2G), the
    // server does not replay history, so refetch the loaded messages to backfill
    // anything missed while we were offline. This is the safety net that lets us
    // keep refetchOnWindowFocus off in the WebView.
    //
    // It no longer waits for a send to finish. It used to, so that the refetch
    // could not drop the bubble that was still on its way out — but a send now
    // includes the upload of a photograph, which can take a minute on exactly the
    // link that just dropped, and a backfill held back that long is a dealer who
    // misses MDG's reply. The refetch itself keeps unsent bubbles (see
    // `useMessages`), so there is nothing left to protect by waiting.
    const offReconnect = onSocketReconnect(socket, () => {
      void qc.invalidateQueries({ queryKey: messagesQueryKey(conversationId) });
      // Where MDG's requests stand can have moved while we were away too (a
      // paper marked received, one sent back) — and the buttons on those
      // messages are drawn from it.
      invalidateChatAskStates(qc, conversationId);
      // And where a login stands (saved by MDG, or refused by the portal) — the
      // box in the thread draws it. Only a box on screen is asking.
      invalidatePortalLogins(qc);
    });

    // Rechecks waiting on the server to finish filing a colleague's answer; they
    // go with the room, like the typing timer below.
    const recheckTimers = new Set<number>();

    const onNewMessage = (payload: { message: Message; conversation: Conversation }) => {
      if (payload.message.conversationId !== conversationId) return;
      const key = messagesQueryKey(conversationId);
      // The server fans a message to BOTH the conversation room and each
      // participant's user room, so a viewer receives it twice. Detect a repeat
      // delivery BEFORE the cache write so the read-ack below fires only once.
      const before = qc.getQueryData<InfiniteData<Message[]>>(key);
      const alreadyPresent =
        before?.pages.some((p) => p.some((m) => m.id === payload.message.id)) ?? false;
      qc.setQueryData<InfiniteData<Message[]>>(key, (old) => {
        if (!old) return { pages: [[payload.message]], pageParams: [undefined] };
        // Dedupe by real id across ALL pages (not just the first page).
        if (old.pages.some((p) => p.some((m) => m.id === payload.message.id))) {
          return old;
        }
        // If this is the sender's own echo, take out the optimistic placeholder it
        // confirms so we don't end up showing the message twice.
        //
        // ONE placeholder, the oldest that says the same thing — not all of them.
        // A photograph that is still uploading is also a `temp-*` bubble, and
        // sweeping every placeholder away because an EARLIER message was just
        // confirmed made the photograph disappear for the rest of its upload.
        // Whatever this does not match is cleaned up by the send's own success.
        //
        // AND THE ONE WITH THE SAME NUMBER OF PICTURES FIRST. Two photo messages
        // in flight with no words both "confirm" a one-picture echo; taking the
        // oldest removed a three-picture album that was still uploading (gone
        // for a minute, so the dealer sent it again) while the one-picture bubble
        // stayed beside its own confirmation. An exact count is the better
        // witness; the oldest is only the fallback, for a file that failed.
        const isOwnEcho = payload.message.senderId === currentUserId;
        let pages = old.pages;
        if (isOwnEcho) {
          const candidates = pages
            .flat()
            .filter((m) => isPendingMessage(m) && confirms(payload.message, m))
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          const exact = candidates.find(
            (m) => m.attachments.length === payload.message.attachments.length,
          );
          const placeholder = exact ?? candidates[0];
          if (placeholder) {
            aliasMessageId(payload.message.id, placeholder.id);
            pages = pages.map((page) => page.filter((m) => m.id !== placeholder.id));
          }
        }
        pages = [...pages];
        pages[0] = [payload.message, ...(pages[0] ?? [])];
        return { ...old, pages };
      });
      // A MESSAGE FROM SOMEONE ELSE MAY HAVE MOVED A REQUEST: MDG's "✓ Received",
      // a photo sent back with its reason, a new ask — or a colleague at the pump
      // answering it. The request buttons are drawn from the server's answer to
      // "where does this stand", so ask again. Not for the dealer's own message —
      // answering sets its own state (`markAskSent`), and asking while the server
      // is still filing the photo would put the button back for a moment.
      //
      // A COLLEAGUE'S ANSWER IS THE SAME CASE AS OURS, seen from the other phone:
      // the server is still filing the photo as the message lands, so asking now
      // says `open` and nothing asks again. Show it as sent and ask once it has
      // had time, exactly as a send from this phone does.
      if (!alreadyPresent && payload.message.senderId !== currentUserId) {
        const answered = payload.message.answersAsk;
        if (answered && payload.message.senderRole !== 'admin') {
          const timer = markAskSentThenRecheck(qc, conversationId, answered);
          recheckTimers.add(timer);
        } else {
          invalidateChatAskStates(qc, conversationId);
        }
      }
      // A LOGIN BOX ARRIVED: its state is read live, so ask again — the answer it
      // was posted against may have moved since the cache last heard (MDG saved
      // the login, or the portal refused it). Cheap when no box is on screen.
      if (!alreadyPresent && payload.message.portalLogin) invalidatePortalLogins(qc);
      // The chat is open, so a message from the other party is read on arrival —
      // but only ack the first delivery (not the duplicate room echo).
      if (!alreadyPresent && payload.message.senderId !== currentUserId) {
        socket.emit('read', { conversationId, messageIds: [payload.message.id] });
      }
      // A MESSAGE IS PROOF THEY HAVE STOPPED WRITING, so the dots come down with
      // it rather than waiting out the hold. Under a three-second window this
      // was invisible; with the machine's ten-second window the dots would
      // otherwise sit under the answer they were announcing for the rest of it.
      // The functional update returns the same object when nothing was showing,
      // so an ordinary message costs no re-render.
      if (payload.message.senderId !== currentUserId) {
        if (typingTimer.current) window.clearTimeout(typingTimer.current);
        typingTimer.current = null;
        setTyping((prev) => (prev.active ? { active: false } : prev));
      }
    };

    const onTyping = (payload: { conversationId: string; userId: string; userName: string }) => {
      if (payload.conversationId !== conversationId) return;
      if (payload.userId === currentUserId) return;
      setTyping({ active: true, userName: payload.userName });
      if (typingTimer.current) window.clearTimeout(typingTimer.current);
      typingTimer.current = window.setTimeout(() => {
        setTyping({ active: false });
      }, typingHoldMs.current);
    };

    const onDelivered = (payload: {
      conversationId: string;
      userId: string;
      messageIds: string[];
    }) => {
      if (payload.conversationId !== conversationId) return;
      applyReceipt('deliveredTo', payload.userId, payload.messageIds);
    };

    const onRead = (payload: {
      conversationId: string;
      userId: string;
      messageIds: string[];
    }) => {
      if (payload.conversationId !== conversationId) return;
      // Reading implies delivery — advance both so ticks settle on blue.
      applyReceipt('deliveredTo', payload.userId, payload.messageIds);
      applyReceipt('readBy', payload.userId, payload.messageIds);
    };

    // A message's reaction set changed. The payload carries the FULL
    // authoritative array, so replacing wholesale is idempotent — safe against
    // duplicate deliveries and it reconciles any optimistic local toggle.
    const onReaction = (payload: {
      conversationId: string;
      messageId: string;
      reactions: MessageReaction[];
    }) => {
      if (payload.conversationId !== conversationId) return;
      // Skip while one of OUR toggles for this message is still in flight —
      // this echo may be the older request's snapshot, and applying it would
      // transiently resurrect state the newer optimistic toggle changed. The
      // last mutation's onSuccess reconciles to server truth.
      if (reactionMutationsPending(qc, payload.messageId) > 0) return;
      qc.setQueryData<InfiniteData<Message[]>>(
        messagesQueryKey(conversationId),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) =>
              page.map((m) =>
                m.id === payload.messageId
                  ? { ...m, reactions: payload.reactions }
                  : m,
              ),
            ),
          };
        },
      );
    };

    socket.on('message:new', onNewMessage);
    socket.on('typing', onTyping);
    socket.on('delivered', onDelivered);
    socket.on('read', onRead);
    socket.on('message:reaction', onReaction);

    return () => {
      socket.emit('conversation:leave', conversationId);
      socket.off('connect', join);
      offReconnect();
      socket.off('message:new', onNewMessage);
      socket.off('typing', onTyping);
      socket.off('delivered', onDelivered);
      socket.off('read', onRead);
      socket.off('message:reaction', onReaction);
      if (typingTimer.current) window.clearTimeout(typingTimer.current);
      typingTimer.current = null;
      for (const timer of recheckTimers) window.clearTimeout(timer);
      recheckTimers.clear();
      // THE DOTS COME DOWN WITH THE ROOM. This used to clear the TIMER and leave
      // the state, so dots raised on the thread you were leaving were still
      // drawn on the thread you opened — and with the timer gone, nothing was
      // ever going to take them away again. Rare while the hold was three
      // seconds; ordinary now that a support thread holds them for ten.
      setTyping((prev) => (prev.active ? { active: false } : prev));
    };
    // `token` earns its place here even though nothing in the effect reads it.
    // `getSocket()` returns whatever instance is current, and a token change is
    // the one event that can replace that instance underneath a subscription —
    // so this is what guarantees the listeners are re-bound to the socket that
    // is actually connected, whatever `socket.ts` decides to do with the old
    // one. Re-running is cheap and idempotent: `conversation:join` is a
    // `socket.join()` server-side, and the cache is untouched.
  }, [conversationId, currentUserId, qc, applyReceipt, token]);

  // Keyed on the conversation as well as the clock, so opening a different
  // thread and typing at once is not swallowed by the previous thread's window.
  const lastTypingEmit = React.useRef<{ id?: string; at: number }>({ at: 0 });
  const emitTyping = React.useCallback(() => {
    if (!conversationId) return;
    const now = Date.now();
    const last = lastTypingEmit.current;
    if (last.id === conversationId && now - last.at < TYPING_EMIT_INTERVAL_MS) return;
    lastTypingEmit.current = { id: conversationId, at: now };
    const socket = getSocket();
    socket?.emit('typing', conversationId);
  }, [conversationId]);

  // Mark the given messages read (called by the chat screen for messages from
  // the other party loaded over HTTP, which never came through message:new).
  const markRead = React.useCallback(
    (messageIds: string[]) => {
      if (!conversationId || messageIds.length === 0) return;
      const socket = getSocket();
      socket?.emit('read', { conversationId, messageIds });
    },
    [conversationId],
  );

  return { typing, emitTyping, markRead };
}
