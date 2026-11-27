import { useQueryClient } from '@tanstack/react-query';
import { MessageCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { ownConversation } from '@/features/chat/useOpenMyChat';
import { myConversationsKey } from '@/hooks/api/useMyConversations';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { useAuthStore } from '@/store/auth';
import type { Conversation } from '@dk/shared/types';

export interface AskMdgButtonProps {
  /** The question, typed into the message box and NOT sent: the dealer reads it and taps send. */
  draft: string;
  /** What the button says. Default "Ask MDG"; a screen that knows the topic says "Ask MDG about this". */
  label?: string;
  /** For a screen reader when the visible label alone is not enough ("Ask MDG, Calibration claim"). */
  ariaLabel?: string;
  /** `primary` is the one filled button of a screen; the default is the quiet outlined one. */
  variant?: 'primary' | 'secondary';
  className?: string;
}

/**
 * "Ask MDG": opens the dealer's own chat with the question already written in the message box, as
 * `draftText` router state (the chat reads it; nothing is sent by this button). The chat list is
 * read from the cache at the tap, like every "Message us" button. Nothing loaded: the list is the
 * answer, without the draft.
 */
export function AskMdgButton({
  draft,
  label,
  ariaLabel,
  variant = 'secondary',
  className,
}: AskMdgButtonProps) {
  const t = useT();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const open = () => {
    const userId = useAuthStore.getState().user?.id;
    const own = ownConversation(qc.getQueryData<Conversation[]>(myConversationsKey), userId);
    if (own) navigate(`/chat/${own.id}`, { state: { draftText: draft } });
    else navigate('/chat');
  };
  return (
    <button
      type="button"
      onClick={open}
      {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}
      className={cn(
        'inline-flex min-h-11 items-center gap-2 rounded-md px-3 py-1 text-left text-cta shadow-sm',
        variant === 'primary'
          ? 'bg-brand text-text-inverse active:bg-brand-hover'
          : 'border border-border bg-surface text-text active:bg-surface-2',
        className,
      )}
    >
      <MessageCircle aria-hidden className="h-5 w-5 shrink-0" strokeWidth={1.75} />
      <span className="min-w-0 break-words">{label ?? t('kit.ask.mdg')}</span>
    </button>
  );
}
