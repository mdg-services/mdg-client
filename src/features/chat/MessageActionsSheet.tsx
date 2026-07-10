import { Copy, Download, Info, Reply } from 'lucide-react';
import * as React from 'react';

import { useToast } from '@/components/ui';
import { copyText } from '@/lib/clipboard';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { QUICK_REACTIONS, type Attachment, type Message } from '@dk/shared/types';

/**
 * Long-press action sheet for a message. Same overlay recipe as
 * FinalizeSubmitSheet (fixed inset-0 z-50, backdrop button, rounded-t panel) —
 * but deliberately NO useScrollLock: /chat/:id runs inside the fixed --vvh
 * frame and must never body-lock.
 */
export function MessageActionsSheet({
  message,
  mine,
  currentUserId,
  onClose,
  onReply,
  onToggleReaction,
  onDownload,
  onInfo,
}: {
  message: Message;
  mine: boolean;
  currentUserId: string | undefined;
  onClose: () => void;
  onReply: (message: Message) => void;
  onToggleReaction: (message: Message, emoji: string) => void;
  onDownload: (attachment: Attachment) => void;
  onInfo: (message: Message) => void;
}) {
  const t = useT();
  const toast = useToast();

  const myReaction = message.reactions?.find((r) => r.userId === currentUserId)?.emoji;
  const isTemp = message.id.startsWith('temp-');

  const handleCopy = async () => {
    onClose();
    if (!message.body) return;
    const ok = await copyText(message.body);
    if (ok) toast.success(t('chat.copied'));
    else toast.error(t('chat.copyFailed'));
  };

  const rowClass =
    'flex h-12 w-full items-center gap-3 px-4 text-sm text-text hover:bg-surface-2 active:bg-surface-2';

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label={t('common.dismiss')}
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />

      <div className="relative mx-auto flex w-full max-w-md flex-col rounded-t-2xl border border-border bg-surface pb-2 shadow-lg safe-bottom animate-in">
        {/* Quick reactions */}
        <div className="flex items-center justify-around px-4 py-3">
          {QUICK_REACTIONS.map((emoji) => {
            const own = myReaction === emoji;
            return (
              <button
                key={emoji}
                type="button"
                aria-label={emoji}
                aria-pressed={own}
                onClick={() => {
                  onToggleReaction(message, emoji);
                  onClose();
                }}
                className={cn(
                  'flex h-11 w-11 items-center justify-center rounded-full text-[22px]',
                  'hover:bg-surface-2 active:bg-surface-2',
                  own && 'bg-brand-soft ring-1 ring-brand',
                )}
              >
                {emoji}
              </button>
            );
          })}
        </div>
        <div className="border-t border-border" />

        <button
          type="button"
          onClick={() => {
            onClose();
            onReply(message);
          }}
          className={rowClass}
        >
          <Reply width={20} strokeWidth={1.75} className="text-text-muted" />
          {t('chat.reply')}
        </button>

        {message.body ? (
          <button type="button" onClick={() => void handleCopy()} className={rowClass}>
            <Copy width={20} strokeWidth={1.75} className="text-text-muted" />
            {t('chat.copy')}
          </button>
        ) : null}

        {message.attachments.map((a) => (
          <button
            key={a.storageKey}
            type="button"
            onClick={() => {
              onClose();
              onDownload(a);
            }}
            className={rowClass}
          >
            <Download width={20} strokeWidth={1.75} className="shrink-0 text-text-muted" />
            <span className="truncate">
              {message.attachments.length > 1
                ? t('chat.downloadFile', {
                    name:
                      a.kind === 'audio'
                        ? t('chat.voiceMessage')
                        : a.kind === 'image'
                          ? t('chat.replyPhoto')
                          : a.filename,
                  })
                : t('chat.download')}
            </span>
          </button>
        ))}

        {mine && !isTemp ? (
          <button
            type="button"
            onClick={() => {
              onClose();
              onInfo(message);
            }}
            className={rowClass}
          >
            <Info width={20} strokeWidth={1.75} className="text-text-muted" />
            {t('chat.messageInfo')}
          </button>
        ) : null}
      </div>
    </div>
  );
}
