import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';

import { myConversationsKey } from '@/hooks/api/useMyConversations';
import { useAuthStore } from '@/store/auth';
import type { Conversation } from '@dk/shared/types';

/**
 * The member's OWN thread out of their conversation list: the one whose primary
 * member they are (an owner's support chat; a manager's group chat), else
 * whatever the list opens with. Shared by the "Message us" buttons and by the
 * redirect the removed screens' old addresses now run (`OpenMyChat`).
 */
export function ownConversation(
  list: Conversation[] | undefined,
  userId: string | undefined,
): Conversation | undefined {
  return list?.find((c) => c.userId === userId) ?? list?.[0];
}

/**
 * Where every "Message us" button goes: straight into the member's OWN chat
 * with MDG, not the chat list.
 *
 * With the list as the app's first screen, `navigate('/chat')` turned "Message
 * us" into "pick a chat" — one more tap, and one more Back to undo, for a dealer
 * who has exactly one chat and a problem. The member's own thread is the one
 * whose primary member they are (an owner's support chat; a manager's group
 * chat).
 *
 * Read from the cache at the moment of the tap rather than subscribed to: the
 * app frame loads the list on every route and the list socket keeps it live
 * (`AppShell`), and a button deep inside a sheet has no business starting a
 * request of its own. Nothing loaded yet — the list is the answer.
 */
export function useOpenMyChat(): () => void {
  const navigate = useNavigate();
  const qc = useQueryClient();
  return React.useCallback(() => {
    const userId = useAuthStore.getState().user?.id;
    const own = ownConversation(qc.getQueryData<Conversation[]>(myConversationsKey), userId);
    navigate(own ? `/chat/${own.id}` : '/chat');
  }, [navigate, qc]);
}
