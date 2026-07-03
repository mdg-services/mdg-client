import { MessageCircleHeart } from 'lucide-react';
import * as React from 'react';

import type { Message } from '@dk/shared/types';

import { MessageBubble } from './MessageBubble';

import { EmptyState, Spinner } from '@/components/ui';
import { useT, type TFunction } from '@/lib/i18n';


function dayLabel(iso: string, t: TFunction): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(d, today)) return t('chat.today');
  if (sameDay(d, yesterday)) return t('chat.yesterday');
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
}

export interface MessageListProps {
  messages: Message[];
  currentUserId: string;
  loading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  loadingMore?: boolean;
  typing?: { active: boolean; userName?: string };
  onQuickAction?: (text: string) => void;
}

export function MessageList({
  messages,
  currentUserId,
  loading,
  hasMore,
  onLoadMore,
  loadingMore,
  typing,
  onQuickAction,
}: MessageListProps) {
  const t = useT();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const lastCount = React.useRef(0);
  const [lightbox, setLightbox] = React.useState<string | null>(null);

  // Auto-scroll to bottom when new messages arrive (only if user is near bottom)
  React.useLayoutEffect(() => {
    if (messages.length === lastCount.current) return;
    const el = containerRef.current;
    if (!el) return;
    const nearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 200 ||
      lastCount.current === 0;
    if (nearBottom) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    lastCount.current = messages.length;
  }, [messages.length]);

  // Display oldest -> newest. Each API page is oldest-first, but pages arrive
  // newest-batch-first and realtime/optimistic messages are prepended, so sort
  // by timestamp for a stable chronological order regardless of insertion point.
  const ordered = React.useMemo(
    () =>
      [...messages].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    [messages],
  );

  // group by day
  const rendered: React.ReactNode[] = [];
  let lastDay = '';
  let lastMine = false;
  ordered.forEach((m, idx) => {
    const dl = dayLabel(m.createdAt, t);
    if (dl !== lastDay) {
      rendered.push(
        <div
          key={`d-${dl}-${idx}`}
          className="my-2 flex items-center justify-center"
        >
          <span className="rounded-full bg-surface-2 px-3 py-0.5 text-[11px] font-medium uppercase tracking-wide text-text-subtle">
            {dl}
          </span>
        </div>,
      );
      lastDay = dl;
    }
    const mine = m.senderId === currentUserId;
    rendered.push(
      <MessageBubble
        key={m.id}
        message={m}
        mine={mine}
        onOpenImage={(url) => setLightbox(url)}
      />,
    );
    lastMine = mine;
  });
  void lastMine;

  if (loading && messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner size={20} />
      </div>
    );
  }

  if (!loading && messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <EmptyState
          icon={<MessageCircleHeart width={28} strokeWidth={1.5} />}
          title={t('chat.emptyTitle')}
          description={t('chat.emptyDesc')}
          cta={
            onQuickAction ? (
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                {[
                  t('chat.quickReportIssue'),
                  t('chat.quickRequestService'),
                  t('chat.quickTalkSupport'),
                ].map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => onQuickAction(label)}
                    className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm text-text hover:bg-surface-2"
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null
          }
        />
      </div>
    );
  }

  return (
    <>
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto px-3 py-4 scrollbar-thin"
      >
        {hasMore ? (
          <div className="mb-3 flex justify-center">
            <button
              type="button"
              onClick={onLoadMore}
              disabled={loadingMore}
              className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-muted hover:bg-surface-2 disabled:opacity-60"
            >
              {loadingMore ? t('common.loading') : t('chat.loadEarlier')}
            </button>
          </div>
        ) : null}
        <div className="flex flex-col gap-2">
          {rendered}
          {typing?.active ? (
            <div className="flex w-full justify-start">
              <div className="flex items-center gap-1.5 rounded-3xl rounded-bl-md border border-border bg-surface px-4 py-2.5 text-sm text-text-muted shadow-sm">
                <span className="sr-only">
                  {t('chat.isTyping', {
                    name: typing.userName ?? t('chat.supportName'),
                  })}
                </span>
                <Dot />
                <Dot delay={150} />
                <Dot delay={300} />
              </div>
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>
      </div>
      {lightbox ? (
        <div
          role="dialog"
          aria-label={t('chat.imagePreview')}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox}
            alt=""
            className="max-h-full max-w-full rounded-xl object-contain"
          />
        </div>
      ) : null}
    </>
  );
}

function Dot({ delay = 0 }: { delay?: number }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-text-subtle"
      style={{ animationDelay: `${delay}ms` }}
    />
  );
}
