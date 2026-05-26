import type { AttachmentInput } from '@dk/shared/schemas';
import * as React from 'react';

import { Spinner, useToast } from '@/components/ui';
import { Composer } from '@/features/chat/Composer';
import { MessageList } from '@/features/chat/MessageList';
import { useConversationSocket } from '@/features/chat/useConversationSocket';
import { useMessages } from '@/hooks/api/useMessages';
import { useMyConversation } from '@/hooks/api/useMyConversation';
import { useSendMessage } from '@/hooks/api/useSendMessage';
import { ApiError } from '@/lib/api';
import { uploadAttachment } from '@/lib/uploadAttachment';
import { useAuthStore } from '@/store/auth';

export function ChatPage() {
  const toast = useToast();
  const user = useAuthStore((s) => s.user);

  const convQuery = useMyConversation();
  const conversationId = convQuery.data?.id;

  const messagesQuery = useMessages(conversationId);
  const sendMutation = useSendMessage();
  const { typing, emitTyping } = useConversationSocket(conversationId, user?.id);

  const [composerSeed, setComposerSeed] = React.useState<string | undefined>(
    undefined,
  );

  const messages = React.useMemo(
    () => (messagesQuery.data?.pages ?? []).flat(),
    [messagesQuery.data],
  );

  const handleSend = async (text: string, files: File[]) => {
    if (!conversationId) {
      toast.error('Chat is not ready yet, please try again.');
      return;
    }
    if (!text && files.length === 0) return;

    try {
      const attachments: AttachmentInput[] = [];
      for (const file of files) {
        try {
          const att = await uploadAttachment(file, conversationId);
          attachments.push(att);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Upload failed';
          toast.error(`Couldn't upload ${file.name}: ${msg}`);
        }
      }
      await sendMutation.mutateAsync({
        conversationId,
        body: text || undefined,
        attachments,
      });
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not send message.';
      toast.error(msg);
    }
  };

  if (convQuery.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner size={20} />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-2.5">
        <div>
          <p className="text-sm font-semibold text-text">Support</p>
          <p className="text-xs text-text-subtle">
            Real people, real fast replies
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: 'var(--color-online)' }}
            aria-hidden
          />
          <span className="text-xs font-medium text-text-muted">Online</span>
        </div>
      </div>

      <MessageList
        messages={messages}
        currentUserId={user?.id ?? ''}
        loading={messagesQuery.isLoading}
        hasMore={!!messagesQuery.hasNextPage}
        loadingMore={messagesQuery.isFetchingNextPage}
        onLoadMore={() => void messagesQuery.fetchNextPage()}
        typing={typing}
        onQuickAction={(t) => setComposerSeed(t)}
      />

      <Composer
        onSend={handleSend}
        onTyping={emitTyping}
        sending={sendMutation.isPending}
        initialText={composerSeed}
        disabled={!conversationId}
      />
    </div>
  );
}
