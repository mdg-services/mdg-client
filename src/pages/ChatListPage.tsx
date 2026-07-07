import { MessageCircle } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';

import { EmptyState, Spinner } from '@/components/ui';
import {
  conversationTitle,
  hasUnread,
  participantSubtitle,
} from '@/features/chat/conversationLabel';
import { useMyConversations } from '@/hooks/api/useMyConversations';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { useAuthStore } from '@/store/auth';

function formatWhen(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  return sameDay
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function ChatListPage() {
  const t = useT();
  const navigate = useNavigate();
  const myId = useAuthStore((s) => s.user?.id);
  const q = useMyConversations();

  if (q.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner size={20} />
      </div>
    );
  }

  const convos = q.data ?? [];

  // A single-thread member (a plain owner, or the manager) skips the list and
  // lands straight in their chat — preserving the WhatsApp-simple experience for
  // the common case. The list only appears once there's genuinely more than one.
  if (convos.length === 1) {
    return <Navigate to={`/chat/${convos[0]!.id}`} replace />;
  }

  if (convos.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <EmptyState
          icon={<MessageCircle width={28} strokeWidth={1.5} />}
          title={t('chat.noConversations')}
          description={t('chat.noConversationsDesc')}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-border bg-surface px-4 py-2.5">
        <p className="text-sm font-semibold text-text">{t('chat.chatsTitle')}</p>
      </div>
      <ul className="flex-1 divide-y divide-border overflow-y-auto">
        {convos.map((c) => {
          const unread = hasUnread(c, myId);
          const subtitle = participantSubtitle(c, myId);
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => navigate(`/chat/${c.id}`)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
                  <MessageCircle width={22} strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        'truncate text-sm text-text',
                        unread ? 'font-semibold' : 'font-medium',
                      )}
                    >
                      {conversationTitle(c, t)}
                    </span>
                    <span className="shrink-0 text-[11px] text-text-subtle">
                      {formatWhen(c.lastMessageAt)}
                    </span>
                  </span>
                  <span className="mt-0.5 flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        'truncate text-xs',
                        unread ? 'text-text-muted' : 'text-text-subtle',
                      )}
                    >
                      {c.lastMessagePreview || subtitle || t('chat.noMessagesYet')}
                    </span>
                    {unread ? (
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand"
                        aria-hidden
                      />
                    ) : null}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
