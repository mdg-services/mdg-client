import { act, render, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@/components/ui';
import { makeMessage } from '@/test/utils';
import type { TicketDealerView } from '@dk/shared/types';

import { MessageList } from './MessageList';

// Controllable i18n: Hindi/English day labels driven by a hoisted lang flag.
const state = vi.hoisted(() => ({ lang: 'hi' as 'hi' | 'en' }));
vi.mock('@/lib/i18n', () => ({
  useT: () => (key: string) => {
    if (key === 'chat.today') return state.lang === 'hi' ? 'आज' : 'Today';
    if (key === 'chat.yesterday') return state.lang === 'hi' ? 'कल' : 'Yesterday';
    return key;
  },
}));

// Lightweight bubble stub that exposes id + the handler refs it received.
const captured = vi.hoisted(() => ({
  openImageRefs: [] as unknown[],
  onJumpTo: null as null | ((targetId: string, fromId: string) => void),
}));
vi.mock('./MessageBubble', () => ({
  MessageBubble: ({
    message,
    onOpenImage,
    onJumpTo,
    ticketStatus,
    ticketNumber,
  }: {
    message: { id: string };
    onOpenImage?: unknown;
    onJumpTo?: (targetId: string, fromId: string) => void;
    ticketStatus?: string;
    ticketNumber?: number;
  }) => {
    captured.openImageRefs.push(onOpenImage);
    captured.onJumpTo = onJumpTo ?? null;
    return (
      <div
        data-testid="bubble"
        data-id={message.id}
        data-ticket-status={ticketStatus}
        data-ticket-number={ticketNumber}
      />
    );
  },
}));

const iso = (msFromNow: number) => new Date(Date.now() + msFromNow).toISOString();
const DAY = 86_400_000;

// MessageList uses useToast (downloads, jump-not-found) → needs the provider.
function renderList(ui: React.ReactElement) {
  const view = render(<ToastProvider>{ui}</ToastProvider>);
  return {
    ...view,
    rerenderList: (next: React.ReactElement) =>
      view.rerender(<ToastProvider>{next}</ToastProvider>),
  };
}

afterEach(() => {
  state.lang = 'hi';
  captured.openImageRefs.length = 0;
  captured.onJumpTo = null;
});

describe('MessageList', () => {
  it('inserts day dividers for today and yesterday', () => {
    renderList(
      <MessageList
        currentUserId="u1"
        messages={[
          makeMessage({ id: 'a', createdAt: iso(-DAY) }), // yesterday
          makeMessage({ id: 'b', createdAt: iso(0) }), // today
        ]}
      />,
    );
    expect(screen.getByText('आज')).toBeInTheDocument();
    expect(screen.getByText('कल')).toBeInTheDocument();
  });

  it('renders messages in chronological order regardless of input order', () => {
    renderList(
      <MessageList
        currentUserId="u1"
        messages={[
          makeMessage({ id: 'newest', createdAt: iso(-1000) }),
          makeMessage({ id: 'oldest', createdAt: iso(-5000) }),
          makeMessage({ id: 'middle', createdAt: iso(-3000) }),
        ]}
      />,
    );
    const ids = screen.getAllByTestId('bubble').map((el) => el.getAttribute('data-id'));
    expect(ids).toEqual(['oldest', 'middle', 'newest']);
  });

  it('wraps each bubble row in a jump anchor carrying the message id', () => {
    const { container } = renderList(
      <MessageList
        currentUserId="u1"
        messages={[makeMessage({ id: 'm-abc', createdAt: iso(0) })]}
      />,
    );
    expect(container.querySelector('[data-mid="m-abc"]')).toBeTruthy();
  });

  it('re-localises the day dividers when the language changes', () => {
    const msgs = [makeMessage({ id: 'a', createdAt: iso(0) })];
    const { rerenderList } = renderList(
      <MessageList currentUserId="u1" messages={msgs} />,
    );
    expect(screen.getByText('आज')).toBeInTheDocument();

    state.lang = 'en';
    rerenderList(<MessageList currentUserId="u1" messages={[...msgs]} />);
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.queryByText('आज')).not.toBeInTheDocument();
  });

  it('passes a stable onOpenImage reference across re-renders (memo stays effective)', () => {
    const msgs = [makeMessage({ id: 'a', createdAt: iso(0) })];
    const { rerenderList } = renderList(
      <MessageList currentUserId="u1" messages={msgs} typing={{ active: false }} />,
    );
    rerenderList(
      <MessageList currentUserId="u1" messages={msgs} typing={{ active: true }} />,
    );
    const unique = new Set(captured.openImageRefs);
    expect(unique.size).toBe(1); // same callback identity every render
  });

  it('shows an empty state when there are no messages and not loading', () => {
    renderList(<MessageList currentUserId="u1" messages={[]} loading={false} />);
    expect(screen.getByText('chat.emptyTitle')).toBeInTheDocument();
  });

  it('offers two starter chips on an empty thread, and none that asks for a person', () => {
    renderList(
      <MessageList
        currentUserId="u1"
        messages={[]}
        loading={false}
        onQuickAction={() => {}}
      />,
    );
    expect(screen.getByText('chat.quickReportIssue')).toBeInTheDocument();
    expect(screen.getByText('chat.quickRequestService')).toBeInTheDocument();
    expect(screen.queryByText('chat.quickTalkSupport')).toBeNull();
  });

  it('shows a spinner while loading with no messages', () => {
    const { container } = renderList(
      <MessageList currentUserId="u1" messages={[]} loading />,
    );
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('renders the typing indicator when typing.active', () => {
    const { container } = renderList(
      <MessageList
        currentUserId="u1"
        messages={[makeMessage({ id: 'a', createdAt: iso(0) })]}
        typing={{ active: true, userName: 'Support' }}
      />,
    );
    expect(container.querySelector('.animate-bounce')).toBeTruthy();
  });

  it('renders a load-earlier control when hasMore', () => {
    renderList(
      <MessageList
        currentUserId="u1"
        messages={[makeMessage({ id: 'a', createdAt: iso(0) })]}
        hasMore
        onLoadMore={() => {}}
      />,
    );
    expect(screen.getByText('chat.loadEarlier')).toBeInTheDocument();
  });

  it('aborts the jump-to-quote page loop when the list unmounts', async () => {
    let resolveFetch: ((r: { data?: undefined; hasNextPage?: boolean }) => void) | null =
      null;
    const onFetchOlder = vi.fn(
      () =>
        new Promise<{ data?: undefined; hasNextPage?: boolean }>((res) => {
          resolveFetch = res;
        }),
    );
    const { unmount } = renderList(
      <MessageList
        currentUserId="u1"
        conversationId="c1"
        messages={[makeMessage({ id: 'a', createdAt: iso(0) })]}
        hasMore
        onFetchOlder={onFetchOlder}
      />,
    );
    // Jump to a message that is not loaded → the loop starts fetching.
    act(() => {
      captured.onJumpTo!('not-loaded-id', 'a');
    });
    expect(onFetchOlder).toHaveBeenCalledTimes(1);

    // The user leaves the screen while the page fetch is still in flight.
    unmount();
    await act(async () => {
      resolveFetch!({ hasNextPage: true });
    });

    // The loop must stop after the in-flight await — no further page fetches
    // (up to 10 × 30 messages on 2G) and no stray not-found toast.
    expect(onFetchOlder).toHaveBeenCalledTimes(1);
  });
});

/**
 * Which bubble gets a ticket line, and what it is told.
 *
 * The bubble is stubbed, so what is asserted is the hand-off: a status word and
 * a number for the one message that names a ticket the conversation still
 * lists, and nothing for every other bubble.
 */
describe('MessageList — ticket status lines', () => {
  const aiBlock = { turnId: 'turn-1', kind: 'handoff', intent: 'talk_to_human', templateId: 'h' };

  function ticket(over: Partial<TicketDealerView> = {}): TicketDealerView {
    return {
      id: 't-42',
      number: 42,
      state: 'OPEN',
      seen: false,
      raisedAt: iso(-60_000),
      ...over,
    };
  }

  const raising = makeMessage({
    id: 'raising',
    createdAt: iso(-5000),
    ai: { ...aiBlock, ticketId: 't-42' } as never,
  });
  const plain = makeMessage({ id: 'plain', createdAt: iso(-9000) });
  const noTicket = makeMessage({
    id: 'no-ticket',
    createdAt: iso(-1000),
    ai: { ...aiBlock, kind: 'answer' } as never,
  });

  const bubble = (id: string) =>
    screen.getAllByTestId('bubble').find((el) => el.getAttribute('data-id') === id)!;

  it.each([
    ['not seen yet', { state: 'OPEN', seen: false }, 'raised'],
    ['seen by an admin', { state: 'OPEN', seen: true }, 'looking'],
    ['resolved', { state: 'RESOLVED', seen: true, resolvedAt: iso(-1000) }, 'resolved'],
  ] as const)('hands the bubble "%s" as its status word', (_label, over, status) => {
    renderList(
      <MessageList
        currentUserId="u1"
        messages={[plain, raising, noTicket]}
        tickets={[ticket(over)]}
      />,
    );
    expect(bubble('raising').getAttribute('data-ticket-status')).toBe(status);
    expect(bubble('raising').getAttribute('data-ticket-number')).toBe('42');
  });

  it('gives nothing to a message that names no ticket', () => {
    renderList(
      <MessageList
        currentUserId="u1"
        messages={[plain, raising, noTicket]}
        tickets={[ticket()]}
      />,
    );
    expect(bubble('plain').hasAttribute('data-ticket-status')).toBe(false);
    expect(bubble('no-ticket').hasAttribute('data-ticket-status')).toBe(false);
  });

  it('gives nothing when the conversation no longer lists the ticket', () => {
    // A resolved ticket older than the server's seven-day window drops out of
    // `tickets`; the message that raised it stays in the thread.
    renderList(
      <MessageList
        currentUserId="u1"
        messages={[raising]}
        tickets={[ticket({ id: 't-other', number: 9 })]}
      />,
    );
    expect(bubble('raising').hasAttribute('data-ticket-status')).toBe(false);
    expect(bubble('raising').hasAttribute('data-ticket-number')).toBe(false);
  });

  it('gives nothing when the conversation carries no tickets at all', () => {
    // An older server, or a thread that never raised one.
    renderList(<MessageList currentUserId="u1" messages={[raising]} />);
    expect(bubble('raising').hasAttribute('data-ticket-status')).toBe(false);
  });

  it('follows the ticket as the conversation is replaced with a new state', () => {
    const msgs = [raising];
    const { rerenderList } = renderList(
      <MessageList currentUserId="u1" messages={msgs} tickets={[ticket()]} />,
    );
    expect(bubble('raising').getAttribute('data-ticket-status')).toBe('raised');

    rerenderList(
      <MessageList currentUserId="u1" messages={msgs} tickets={[ticket({ seen: true })]} />,
    );
    expect(bubble('raising').getAttribute('data-ticket-status')).toBe('looking');

    rerenderList(
      <MessageList
        currentUserId="u1"
        messages={msgs}
        tickets={[ticket({ seen: true, state: 'RESOLVED', resolvedAt: iso(0) })]}
      />,
    );
    expect(bubble('raising').getAttribute('data-ticket-status')).toBe('resolved');
  });

  it('reads two tickets on one thread independently', () => {
    const second = makeMessage({
      id: 'second',
      createdAt: iso(-2000),
      ai: { ...aiBlock, ticketId: 't-43' } as never,
    });
    renderList(
      <MessageList
        currentUserId="u1"
        messages={[raising, second]}
        tickets={[
          ticket({ state: 'RESOLVED', seen: true }),
          ticket({ id: 't-43', number: 43 }),
        ]}
      />,
    );
    expect(bubble('raising').getAttribute('data-ticket-status')).toBe('resolved');
    expect(bubble('second').getAttribute('data-ticket-status')).toBe('raised');
    expect(bubble('second').getAttribute('data-ticket-number')).toBe('43');
  });
});
