import { X } from 'lucide-react';
import * as React from 'react';

import { useT } from '@/lib/i18n';
import type { Conversation, Message } from '@dk/shared/types';

/**
 * Who-reacted detail, opened by tapping a message's reaction chips. The
 * caller's own row is tappable to remove the reaction. Same overlay recipe as
 * the other chat sheets — NO useScrollLock (fixed --vvh frame).
 */
export function ReactionsSheet({
  message,
  conversation,
  currentUserId,
  onToggleReaction,
  onClose,
}: {
  message: Message;
  conversation: Conversation | undefined;
  currentUserId: string | undefined;
  onToggleReaction: (message: Message, emoji: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const reactions = message.reactions ?? [];

  const nameFor = (userId: string, wireName?: string): string => {
    if (userId === currentUserId) return t('chat.you');
    if (wireName) return wireName;
    const p = conversation?.participants?.find((x) => x.userId === userId);
    // Unknown ids are the MDG admin pool (never listed as participants).
    return p?.name ?? t('chat.supportFallbackName');
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label={t('common.dismiss')}
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />

      <div className="relative mx-auto flex max-h-[70vh] w-full max-w-md flex-col rounded-t-2xl border border-border bg-surface shadow-lg safe-bottom animate-in">
        <header className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <span className="h-9 w-9" />
          <h2 className="flex-1 text-center text-sm font-semibold text-text">
            {t('chat.reactions')}
          </h2>
          <button
            type="button"
            aria-label={t('common.dismiss')}
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-text-muted hover:bg-surface-2 active:bg-surface-2"
          >
            <X width={18} strokeWidth={1.75} />
          </button>
        </header>

        <ul className="flex-1 overflow-y-auto overscroll-contain py-1">
          {reactions.map((r) => {
            const own = r.userId === currentUserId;
            const row = (
              <>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm text-text">
                    {nameFor(r.userId, r.userName)}
                  </span>
                  {own ? (
                    <span className="block text-[11px] text-text-subtle">
                      {t('chat.tapToRemove')}
                    </span>
                  ) : null}
                </span>
                <span className="text-[20px]">{r.emoji}</span>
              </>
            );
            return (
              <li key={`${r.userId}-${r.emoji}`}>
                {own ? (
                  <button
                    type="button"
                    onClick={() => {
                      onToggleReaction(message, r.emoji);
                      onClose();
                    }}
                    className="flex h-12 w-full items-center gap-3 px-4 hover:bg-surface-2 active:bg-surface-2"
                  >
                    {row}
                  </button>
                ) : (
                  <div className="flex h-12 w-full items-center gap-3 px-4">{row}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
