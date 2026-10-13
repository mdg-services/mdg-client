import { Navigate } from 'react-router-dom';

import { Spinner } from '@/components/ui';
import { useMyConversations } from '@/hooks/api/useMyConversations';
import { useAuthStore } from '@/store/auth';

import { ownConversation } from './useOpenMyChat';

/**
 * What the old addresses `/asks`, `/documents`, `/density` and `/kavach` show now:
 * nothing of their own — they open the member's own chat with MDG.
 *
 * Those screens are gone. Everything MDG needs from a dealer is asked in the chat,
 * on the message that asks, and a push or a link already on a phone (a
 * `/documents?ask=…` from last week, the native shell's `density` and `kavach`
 * tokens) should still land somewhere that explains itself. The chat is the one
 * place that does: the ask is sitting in it, with its button.
 *
 * `replace`, so Back from the chat does not come back to a route that only
 * redirects. The query string is dropped on purpose — `?ask=<id>` named a card on
 * a screen that no longer exists.
 *
 * It WAITS for the conversation list rather than guessing: `AppShell` loads that
 * list on every route, and a redirect that ran before it arrived could only fall
 * back to the list, one more tap for a dealer who has exactly one chat. If the
 * list could not be loaded (it failed, or the phone is offline) the chat LIST is
 * the answer — it has its own "we could not load your chats" screen with a retry,
 * and a spinner that never ends would be worse.
 */
export function OpenMyChat() {
  const userId = useAuthStore((s) => s.user?.id);
  const q = useMyConversations();

  // The same test the chat list uses for "could not load": an error, OR a request
  // paused because the phone is offline — `isLoading` alone is false for both, and
  // a spinner waiting on a network that is not there never ends.
  const failed = !q.data && (q.isError || (q.status === 'pending' && q.fetchStatus === 'paused'));
  if (failed) return <Navigate to="/chat" replace />;
  if (!q.data) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <Spinner size={22} />
      </div>
    );
  }
  const own = ownConversation(q.data, userId);
  return <Navigate to={own ? `/chat/${own.id}` : '/chat'} replace />;
}
