import { Check, CheckCheck, X } from 'lucide-react';
import * as React from 'react';

import { useT, type TFunction } from '@/lib/i18n';
import type { Conversation, Message } from '@dk/shared/types';

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })}, ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

/**
 * Resolve display rows for a set of recipient ids: dealer-side participants by
 * name, and ALL unknown ids (the MDG admin pool, never in the participant
 * list) collapsed into one localized "MDG Support" row.
 */
function recipientRows(
  ids: string[],
  conversation: Conversation | undefined,
  t: TFunction,
): string[] {
  const rows: string[] = [];
  let unknowns = 0;
  for (const id of ids) {
    const p = conversation?.participants?.find((x) => x.userId === id);
    if (p) rows.push(p.name ?? t('chat.supportFallbackName'));
    else unknowns += 1;
  }
  if (unknowns > 0) rows.push(t('chat.supportFallbackName'));
  return rows;
}

/**
 * Delivery detail for one of the caller's own messages: who has read it and
 * who it only reached so far (read wins over delivered). Same overlay recipe
 * as the other chat sheets — NO useScrollLock (fixed --vvh frame).
 */
export function MessageInfoSheet({
  message,
  conversation,
  onClose,
}: {
  message: Message;
  conversation: Conversation | undefined;
  onClose: () => void;
}) {
  const t = useT();

  const readIds = (message.readBy ?? []).filter((id) => id !== message.senderId);
  const readSet = new Set(readIds);
  const deliveredIds = (message.deliveredTo ?? []).filter(
    (id) => id !== message.senderId && !readSet.has(id),
  );
  const readRows = recipientRows(readIds, conversation, t);
  const deliveredRows = recipientRows(deliveredIds, conversation, t);

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
            {t('chat.messageInfo')}
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

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          <p className="pb-2 text-xs text-text-subtle">
            {t('chat.sentLabel')} · {formatWhen(message.createdAt)}
          </p>

          {readRows.length > 0 ? (
            <section className="pb-2">
              <p className="flex items-center gap-1.5 py-1.5 text-xs font-semibold text-text-muted">
                <CheckCheck width={14} strokeWidth={2} className="text-[#34b7f1]" />
                {t('chat.readBy')}
              </p>
              {readRows.map((name, i) => (
                <p key={`r-${i}`} className="py-1.5 text-sm text-text">
                  {name}
                </p>
              ))}
            </section>
          ) : null}

          {deliveredRows.length > 0 ? (
            <section className="pb-2">
              <p className="flex items-center gap-1.5 py-1.5 text-xs font-semibold text-text-muted">
                <CheckCheck width={14} strokeWidth={2} />
                {t('chat.deliveredTo')}
              </p>
              {deliveredRows.map((name, i) => (
                <p key={`d-${i}`} className="py-1.5 text-sm text-text">
                  {name}
                </p>
              ))}
            </section>
          ) : null}

          {readRows.length === 0 && deliveredRows.length === 0 ? (
            <p className="flex items-center gap-1.5 py-1.5 text-sm text-text-muted">
              <Check width={14} strokeWidth={2} />
              {t('chat.sentLabel')}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
