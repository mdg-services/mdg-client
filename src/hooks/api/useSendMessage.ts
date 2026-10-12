import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { uploadAttachment, type OutgoingAttachment } from '@/lib/uploadAttachment';
import { useAuthStore } from '@/store/auth';
import type { AttachmentInput } from '@dk/shared/schemas';
import type { Attachment, Message, MessageReplyContext } from '@dk/shared/types';

import { aliasMessageId, messagesQueryKey } from './useMessages';

interface SendVars {
  conversationId: string;
  body?: string;
  /** Already uploaded. */
  attachments?: AttachmentInput[];
  /**
   * Still to upload. The bubble is drawn from these AT ONCE — with the phone's
   * own copy of each picture or voice note, so it looks like what was sent from
   * the first moment — and the upload happens behind it, the way WhatsApp does.
   */
  files?: OutgoingAttachment[];
  /** Told about each file that could not be uploaded; the rest are still sent. */
  onFileFailed?: (item: OutgoingAttachment) => void;
  /** Message being replied to (server embeds the authoritative snapshot). */
  replyToMessageId?: string;
  /** Client-built snapshot so the optimistic bubble renders its quote instantly. */
  replyTo?: MessageReplyContext;
}

/**
 * Every file failed to upload and there is no text to send either, so there is
 * no message to post. The failures were already reported one by one, so the
 * screen must not add a second "didn't go through" for the same thing.
 */
export class NothingToSendError extends Error {
  constructor() {
    super('nothing to send');
    this.name = 'NothingToSendError';
  }
}

interface SendContext {
  tempId: string;
  /** The phone's own copies of the pictures and voice notes in the bubble. */
  localUrls: string[];
}

let tempSeq = 0;

/** How long a confirmed bubble keeps its local copy while the real picture loads. */
const LOCAL_URL_GRACE_MS = 15_000;

function canMakeLocalUrl(): boolean {
  return typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';
}

/** What the optimistic bubble shows for one file. */
function localAttachment(
  item: OutgoingAttachment,
  tempId: string,
  index: number,
  localUrls: string[],
): Attachment {
  let url: string | undefined;
  if ((item.kind === 'image' || item.kind === 'audio') && canMakeLocalUrl()) {
    url = URL.createObjectURL(item.file);
    localUrls.push(url);
  }
  return {
    // Not a real key: nothing has been stored yet. It only has to be unique and
    // stable inside the bubble.
    storageKey: `local:${tempId}:${index}`,
    filename: item.file.name,
    contentType: item.contentType || item.file.type || 'application/octet-stream',
    size: item.file.size,
    kind: item.kind,
    ...(item.durationMs !== undefined ? { durationMs: item.durationMs } : {}),
    ...(url ? { url } : {}),
  };
}

function revokeAll(urls: string[]): void {
  if (typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') return;
  for (const u of urls) URL.revokeObjectURL(u);
}

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation<Message, Error, SendVars, SendContext>({
    // Tagged so anything that cares whether a send is in flight can ask.
    mutationKey: ['sendMessage'],
    mutationFn: async ({
      conversationId,
      body,
      attachments,
      files,
      onFileFailed,
      replyToMessageId,
    }) => {
      const sending: AttachmentInput[] = [...(attachments ?? [])];
      for (const item of files ?? []) {
        try {
          sending.push(await uploadAttachment(item, conversationId));
        } catch {
          onFileFailed?.(item);
        }
      }
      // NOTHING SURVIVED THE UPLOAD, and there is no text either — so there is no
      // message to post. Posting the empty one anyway is what produced two red
      // toasts for one failure ("We couldn't send your voice message…" and a
      // moment later "Your message didn't go through…"). Throwing rather than
      // returning is also what puts the recording back in the composer: it clears
      // itself optimistically and restores on a rejection.
      if (!body && sending.length === 0) throw new NothingToSendError();
      return api.post<Message>(`/v1/conversations/${conversationId}/messages`, {
        body,
        attachments: sending,
        ...(replyToMessageId ? { replyToMessageId } : {}),
      });
    },
    onMutate: async (vars) => {
      const key = messagesQueryKey(vars.conversationId);
      // NO `cancelQueries` HERE. Opening a chat always refetches it, and a dealer
      // who taps a quick reply the moment the thread appears sends while that
      // refetch is still on its way over 2G. Cancelling it threw away the answer
      // carrying MDG's newest messages and nothing asked again, so they stayed
      // missing until the chat was reopened — and on a cold cache the history
      // never loaded at all. Letting it land is safe: the newest page's fetch
      // folds in every still-pending bubble when it answers (`useMessages`).
      tempSeq += 1;
      const tempId = `temp-${Date.now()}-${tempSeq}`;
      const localUrls: string[] = [];
      const me = useAuthStore.getState().user;
      const optimistic: Message = {
        id: tempId,
        conversationId: vars.conversationId,
        // Use the real sender id so the bubble renders as "mine" (right-aligned
        // with a pending clock) before the server echo arrives.
        senderId: me?.id ?? 'me',
        senderRole: me?.role ?? 'dealer-owner',
        body: vars.body,
        attachments: [
          ...(vars.attachments ?? []).map((a) => ({ ...a })),
          ...(vars.files ?? []).map((f, i) => localAttachment(f, tempId, i, localUrls)),
        ],
        deliveredTo: [],
        readBy: [],
        ...(vars.replyTo ? { replyTo: vars.replyTo } : {}),
        createdAt: new Date().toISOString(),
      };
      qc.setQueryData<InfiniteData<Message[]>>(key, (old) => {
        if (!old) return { pages: [[optimistic]], pageParams: [undefined] };
        const pages = [...old.pages];
        // newest-first list → prepend
        pages[0] = [optimistic, ...(pages[0] ?? [])];
        return { ...old, pages };
      });
      return { tempId, localUrls };
    },
    onError: (_e, vars, ctx) => {
      if (!ctx) return;
      // Take out THIS bubble and nothing else. The old rollback put back the
      // whole thread as it was before the send — which also threw away every
      // message that arrived while the request was out, and a request that
      // includes an upload is out for a long time.
      qc.setQueryData<InfiniteData<Message[]>>(messagesQueryKey(vars.conversationId), (old) =>
        old
          ? {
              ...old,
              pages: old.pages.map((page) => page.filter((m) => m.id !== ctx.tempId)),
            }
          : old,
      );
      // The composer keeps its own copy of what it restores, so ours can go now.
      revokeAll(ctx.localUrls);
    },
    onSuccess: (msg, vars, ctx) => {
      const key = messagesQueryKey(vars.conversationId);
      if (ctx) aliasMessageId(msg.id, ctx.tempId);
      qc.setQueryData<InfiniteData<Message[]>>(key, (old) => {
        if (!old) return { pages: [[msg]], pageParams: [undefined] };
        // If the socket already pushed the real message, just drop the temp.
        const alreadyHasReal = old.pages.some((p) => p.some((m) => m.id === msg.id));
        if (alreadyHasReal) {
          return {
            ...old,
            pages: old.pages.map((page) => page.filter((m) => m.id !== ctx?.tempId)),
          };
        }
        // Replace the temp with the real one in-place if it is still there.
        const hasTemp = old.pages.some((p) => p.some((m) => m.id === ctx?.tempId));
        if (hasTemp) {
          return {
            ...old,
            pages: old.pages.map((page) =>
              page.map((m) => (m.id === ctx?.tempId ? msg : m)),
            ),
          };
        }
        // The temp is gone — a refetch (e.g. the socket reconnect backfill) can
        // replace the pages mid-send on a flaky link. Prepend the confirmed
        // message so it appears immediately instead of waiting on the socket
        // echo; onNewMessage dedupes by real id, so no double-insert.
        const pages = [...old.pages];
        pages[0] = [msg, ...(pages[0] ?? [])];
        return { ...old, pages };
      });
      // The gallery lists every picture and document in the thread; a stale copy
      // would miss the one just sent.
      if (msg.attachments.length > 0) {
        void qc.invalidateQueries({
          queryKey: ['conversation', vars.conversationId, 'media'],
        });
      }
      // Keep the local copy a little longer: the bubble swaps to the real link
      // underneath it, and the picture the dealer is looking at must not blank
      // while that downloads.
      if (ctx && ctx.localUrls.length > 0) {
        window.setTimeout(() => revokeAll(ctx.localUrls), LOCAL_URL_GRACE_MS);
      }
    },
  });
}
