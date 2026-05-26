import type { Message } from '@dk/shared/types';
import { MessageCircleHeart } from 'lucide-react';
import * as React from 'react';

import { EmptyState, Spinner } from '@/components/ui';

import { MessageBubble } from './MessageBubble';

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(d, today)) return 'Today';
  if (sameDay(d, yesterday)) return 'Yesterday';
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

  // Display oldest -> newest. API returns newest-first; reverse for render.
  const ordered = React.useMemo(() => [...messages].reverse(), [messages]);

  // group by day
  const rendered: React.ReactNode[] = [];
  let lastDay = '';
  let lastMine = false;
  ordered.forEach((m, idx) => {
    const dl = dayLabel(m.createdAt);
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
    // last bubble from current user gets read indicator
    const isLastMine =
      mine &&
      ordered.slice(idx + 1).every((later) => later.senderId !== currentUserId);
    rendered.push(
      <MessageBubble
        key={m.id}
        message={m}
        mine={mine}
        showReadIndicator={isLastMine}
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
          title="How can we help?"
          description="Send a message and a real person from our support team will reply."
          cta={
            onQuickAction ? (
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                {[
                  'Report an issue',
                  'Request a service',
                  'Talk to support',
                ].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onQuickAction(t)}
                    className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm text-text hover:bg-surface-2"
                  >
                    {t}
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
              {loadingMore ? 'Loading…' : 'Load earlier messages'}
            </button>
          </div>
        ) : null}
        <div className="flex flex-col gap-2">
          {rendered}
          {typing?.active ? (
            <div className="flex w-full justify-start">
              <div className="flex items-center gap-1.5 rounded-3xl rounded-bl-md border border-border bg-surface px-4 py-2.5 text-sm text-text-muted shadow-sm">
                <span className="sr-only">
                  {typing.userName ?? 'Admin'} is typing
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
          aria-label="Image preview"
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
