import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';

import { ownConversation } from '@/features/chat/useOpenMyChat';
import { myConversationsKey } from '@/hooks/api/useMyConversations';
import { useAuthStore } from '@/store/auth';
import type { Conversation } from '@dk/shared/types';

/**
 * Into the planner's own chat, where every answer comes. With a question, it is
 * typed in the message box and NOT sent (the chat's `draftText`), so the planner
 * can change it first. With nothing loaded yet, the chat list is the answer, as
 * for every "Message us" button.
 */
export function useAskInChat(): (draft?: string) => void {
  const navigate = useNavigate();
  const qc = useQueryClient();
  return React.useCallback(
    (draft?: string) => {
      const userId = useAuthStore.getState().user?.id;
      const own = ownConversation(qc.getQueryData<Conversation[]>(myConversationsKey), userId);
      if (!own) {
        navigate('/chat');
        return;
      }
      navigate(`/chat/${encodeURIComponent(own.id)}`, draft ? { state: { draftText: draft } } : undefined);
    },
    [navigate, qc],
  );
}
