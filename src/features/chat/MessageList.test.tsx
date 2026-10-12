import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@/components/ui';
import { aliasMessageId } from '@/hooks/api/useMessages';
import { makeMessage } from '@/test/utils';
import type { Attachment, Message, TicketDealerView } from '@dk/shared/types';

import { MessageList } from './MessageList';

// Controllable i18n: Hindi/English day labels driven by a hoisted lang flag, and
// interpolated variables visible so a count can be asserted.
const state = vi.hoisted(() => ({ lang: 'hi' as 'hi' | 'en' }));
vi.mock('@/lib/i18n', () => ({
  useLang: () => state.lang,
  useT: () => (key: string, vars?: Record<string, unknown>) => {
    if (key === 'chat.today') return state.lang === 'hi' ? 'आज' : 'Today';
    if (key === 'chat.yesterday') return state.lang === 'hi' ? 'कल' : 'Yesterday';
    return vars ? `${key}:${JSON.stringify(vars)}` : key;
  },
}));

// Lightweight bubble stub that exposes what MessageList hands a bubble, plus two
// buttons to drive its callbacks (an image tap, a long-press).
const captured = vi.hoisted(() => ({
  openImageRefs: [] as unknown[],
  onJumpTo: null as null | ((targetId: string, fromId: string) => void),
  imageClicks: 0,
}));
vi.mock('./MessageBubble', () => ({
  MessageBubble: ({
    message,
    first,
    highlight,
    onOpenImage,
    onLongPress,
    onJumpTo,
    ticketStatus,
    ticketNumber,
  }: {
    message: Message;
    first?: boolean;
    highlight?: string;
    onOpenImage?: (a: Attachment, m: Message) => void;
    onLongPress?: (m: Message) => void;
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
        data-first={String(first)}
        data-highlight={highlight}
        data-ticket-status={ticketStatus}
        data-ticket-number={ticketNumber}
      >
        <button
          type="button"
          data-testid={`img-${message.id}`}
          onClick={() => {
            captured.imageClicks += 1;
            const a = message.attachments[0];
            if (a) onOpenImage?.(a, message);
          }}
        >
          picture
        </button>
        <button type="button" data-testid={`lp-${message.id}`} onClick={() => onLongPress?.(message)}>
          hold
        </button>
      </div>
    );
  },
}));

// The viewer is another builder's component: what matters here is what the list
// gives it.
const viewer = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }));
vi.mock('./MediaViewer', () => ({
  MediaViewer: (props: Record<string, unknown>) => {
    viewer.props = props;
    return <div data-testid="viewer" />;
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

const scroller = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[data-scroller]')!;
const bubbles = () => screen.getAllByTestId('bubble');
const bubble = (id: string) => bubbles().find((el) => el.getAttribute('data-id') === id)!;
const row = (container: HTMLElement, id: string) =>
  container.querySelector<HTMLElement>(`[data-mid="${id}"]`)!;

const picture = (key: string): Attachment => ({
  storageKey: key,
  filename: `${key}.png`,
  contentType: 'image/png',
  size: 10,
  kind: 'image',
  url: `https://files.test/${key}.png`,
});

/**
 * jsdom does no layout, so every scroll fact has to be supplied. These make the
 * scroller 600px tall over `layout.height` px of content, and let `scrollTop`
 * hold what is written to it.
 */
const layout = { height: 3000, client: 600 };
function stubLayout() {
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get: () => layout.height,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => layout.client,
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
    configurable: true,
    get(this: { __st?: number }) {
      return this.__st ?? 0;
    },
    set(this: { __st?: number }, v: number) {
      this.__st = v;
    },
  });
}
function unstubLayout() {
  for (const prop of ['scrollHeight', 'clientHeight', 'scrollTop', 'offsetTop', 'offsetHeight']) {
    delete (HTMLElement.prototype as unknown as Record<string, unknown>)[prop];
  }
  layout.height = 3000;
  layout.client = 600;
}

beforeEach(() => {
  captured.imageClicks = 0;
  viewer.props = null;
});

afterEach(() => {
  state.lang = 'hi';
  captured.openImageRefs.length = 0;
  captured.onJumpTo = null;
  unstubLayout();
  vi.restoreAllMocks();
  vi.useRealTimers();
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
    const ids = bubbles().map((el) => el.getAttribute('data-id'));
    expect(ids).toEqual(['oldest', 'middle', 'newest']);
  });

  it('draws a message that arrived twice only once', () => {
    const a = makeMessage({ id: 'a', createdAt: iso(-2000) });
    renderList(<MessageList currentUserId="u1" messages={[a, { ...a }]} />);
    expect(bubbles()).toHaveLength(1);
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

  it('keeps the same row when a sent message is confirmed (the picture must not blink)', () => {
    const temp = makeMessage({ id: 'temp-1-1', senderId: 'u1', createdAt: iso(-1000) });
    const { container, rerenderList } = renderList(
      <MessageList currentUserId="u1" messages={[temp]} />,
    );
    const before = row(container, 'temp-1-1');
    aliasMessageId('real-1', 'temp-1-1');
    rerenderList(
      <MessageList
        currentUserId="u1"
        messages={[makeMessage({ id: 'real-1', senderId: 'u1', createdAt: iso(-1000) })]}
      />,
    );
    // The row for the real message IS the row that was drawn for the temp one.
    expect(row(container, 'real-1')).toBe(before);
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

  it('a thread that FAILED to load is not drawn as a new thread', () => {
    const onRetry = vi.fn();
    renderList(<MessageList currentUserId="u1" messages={[]} failed onRetry={onRetry} />);
    expect(screen.getByText('chat.historyLoadFailed')).toBeInTheDocument();
    expect(screen.queryByText('chat.emptyTitle')).toBeNull();
    fireEvent.click(screen.getByText('common.retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
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

  it('paints a wallpaper behind the thread', () => {
    const { container } = renderList(
      <MessageList currentUserId="u1" messages={[makeMessage({ id: 'a', createdAt: iso(0) })]} />,
    );
    expect(container.querySelector('.bg-wa-wallpaper')).toBeTruthy();
    expect(container.querySelector('pattern')).toBeTruthy();
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

describe('MessageList — runs of bubbles', () => {
  it('tells the first bubble of each run from the rest', () => {
    renderList(
      <MessageList
        currentUserId="me"
        messages={[
          makeMessage({ id: 'a1', senderId: 'A', createdAt: iso(-4000) }),
          makeMessage({ id: 'a2', senderId: 'A', createdAt: iso(-3000) }),
          makeMessage({ id: 'b1', senderId: 'B', createdAt: iso(-2000) }),
          makeMessage({ id: 'a3', senderId: 'A', createdAt: iso(-1000) }),
        ]}
      />,
    );
    expect(bubbles().map((b) => b.getAttribute('data-first'))).toEqual([
      'true',
      'false',
      'true',
      'true',
    ]);
  });

  it('gives the first of a run an 8px gap above it and a bubble inside a run 2px', () => {
    const { container } = renderList(
      <MessageList
        currentUserId="me"
        messages={[
          makeMessage({ id: 'a1', senderId: 'A', createdAt: iso(-3000) }),
          makeMessage({ id: 'a2', senderId: 'A', createdAt: iso(-2000) }),
          makeMessage({ id: 'b1', senderId: 'B', createdAt: iso(-1000) }),
        ]}
      />,
    );
    expect(row(container, 'a1').className).toContain('pt-2');
    expect(row(container, 'a2').className).toContain('pt-0.5');
    expect(row(container, 'b1').className).toContain('pt-2');
  });

  it('a new day starts a new run even when the same person is writing', () => {
    renderList(
      <MessageList
        currentUserId="me"
        messages={[
          makeMessage({ id: 'a1', senderId: 'A', createdAt: iso(-DAY - 2000) }),
          makeMessage({ id: 'a2', senderId: 'A', createdAt: iso(-1000) }),
        ]}
      />,
    );
    expect(bubble('a2').getAttribute('data-first')).toBe('true');
  });

  it('puts the words of an open search into the bubbles that hold them, and only those', () => {
    renderList(
      <MessageList
        currentUserId="me"
        highlight="Rate"
        messages={[
          makeMessage({ id: 'hit', body: 'Dal rate is up', createdAt: iso(-2000) }),
          makeMessage({ id: 'miss', body: 'nothing here', createdAt: iso(-1000) }),
        ]}
      />,
    );
    expect(bubble('hit').getAttribute('data-highlight')).toBe('Rate');
    expect(bubble('miss').hasAttribute('data-highlight')).toBe(false);
  });
});

describe('MessageList — the unread band', () => {
  const thread = () => [
    makeMessage({ id: 'old', senderId: 'x', readBy: ['x', 'me'], createdAt: iso(-5000) }),
    makeMessage({ id: 'u1', senderId: 'x', readBy: ['x'], createdAt: iso(-4000) }),
    makeMessage({ id: 'u2', senderId: 'x', readBy: ['x'], createdAt: iso(-3000) }),
    makeMessage({ id: 'u3', senderId: 'x', readBy: ['x'], createdAt: iso(-2000) }),
  ];

  it('sits directly above the first unread message, and counts what is waiting', () => {
    const { container } = renderList(
      <MessageList currentUserId="me" messages={thread()} unread={{ firstId: 'u1', count: 3 }} />,
    );
    const band = container.querySelector<HTMLElement>('[data-unread-band]')!;
    expect(band).toBeTruthy();
    expect(band.textContent).toBe('chat.unreadMany:{"n":3}');
    expect(band.nextElementSibling).toBe(row(container, 'u1'));
    expect(band.previousElementSibling).toBe(row(container, 'old'));
    // A full-width band in the chip colour, not a pill.
    expect(band.className).toContain('bg-wa-chip');
    expect(band.className).toContain('w-full');
  });

  it('says it in the singular for one', () => {
    const { container } = renderList(
      <MessageList currentUserId="me" messages={thread()} unread={{ firstId: 'u3', count: 1 }} />,
    );
    expect(container.querySelector('[data-unread-band]')!.textContent).toBe('chat.unreadOne');
  });

  it.each([
    ['nothing was waiting', { firstId: null, count: 0 }],
    ['it is not known yet', null],
    ['nobody is tracking it', undefined],
  ])('draws no band when %s', (_label, unread) => {
    const { container } = renderList(
      <MessageList currentUserId="me" messages={thread()} unread={unread} />,
    );
    expect(container.querySelector('[data-unread-band]')).toBeNull();
  });

  it('opens scrolled to the band, not to the bottom', () => {
    stubLayout();
    Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
      configurable: true,
      get(this: HTMLElement) {
        return this.hasAttribute('data-unread-band') ? 1200 : 0;
      },
    });
    const { container } = renderList(
      <MessageList currentUserId="me" messages={thread()} unread={{ firstId: 'u1', count: 3 }} />,
    );
    // The band, with a little of the thread above it still showing.
    expect(scroller(container).scrollTop).toBe(1200 - 56);
  });

  it('opens at the bottom when there is no band', () => {
    stubLayout();
    const { container } = renderList(
      <MessageList currentUserId="me" messages={thread()} unread={{ firstId: null, count: 0 }} />,
    );
    expect(scroller(container).scrollTop).toBe(layout.height);
  });

  it('moves to the band once it is known, when the thread first opened from the cache', () => {
    stubLayout();
    Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
      configurable: true,
      get(this: HTMLElement) {
        return this.hasAttribute('data-unread-band') ? 900 : 0;
      },
    });
    const { container, rerenderList } = renderList(
      <MessageList currentUserId="me" messages={thread()} unread={null} />,
    );
    expect(scroller(container).scrollTop).toBe(layout.height); // provisional: bottom
    rerenderList(
      <MessageList currentUserId="me" messages={thread()} unread={{ firstId: 'u2', count: 2 }} />,
    );
    expect(scroller(container).scrollTop).toBe(900 - 56);
  });

  it('leaves a reader who has already scrolled where they are', () => {
    stubLayout();
    const { container, rerenderList } = renderList(
      <MessageList currentUserId="me" messages={thread()} unread={null} />,
    );
    fireEvent.touchStart(scroller(container));
    scroller(container).scrollTop = 777;
    rerenderList(
      <MessageList currentUserId="me" messages={thread()} unread={{ firstId: 'u2', count: 2 }} />,
    );
    expect(scroller(container).scrollTop).toBe(777);
  });

  it('opens with the round button already counting what is waiting below', () => {
    stubLayout();
    Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
      configurable: true,
      get(this: HTMLElement) {
        return this.hasAttribute('data-unread-band') ? 100 : 0;
      },
    });
    // The band is well above the bottom (3000 tall, 600 visible, parked near 44).
    renderList(
      <MessageList currentUserId="me" messages={thread()} unread={{ firstId: 'u1', count: 3 }} />,
    );
    expect(screen.getByRole('button', { name: 'chat.newMessages:{"n":3}' })).toBeInTheDocument();
  });
});

describe('MessageList — older history', () => {
  const few = [
    makeMessage({ id: 'm2', createdAt: iso(-2000) }),
    makeMessage({ id: 'm3', createdAt: iso(-1000) }),
  ];

  it('loads by itself as the reader nears the top, with no "Load earlier" button', () => {
    stubLayout();
    const onLoadMore = vi.fn();
    const { container } = renderList(
      <MessageList currentUserId="me" messages={few} hasMore onLoadMore={onLoadMore} />,
    );
    expect(screen.queryByText('chat.loadEarlier')).toBeNull();
    onLoadMore.mockClear();

    const el = scroller(container);
    el.scrollTop = 1500;
    fireEvent.scroll(el);
    expect(onLoadMore).not.toHaveBeenCalled(); // far from the top

    el.scrollTop = 120;
    fireEvent.scroll(el);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('does not ask again while one page is already on its way', () => {
    stubLayout();
    const onLoadMore = vi.fn();
    const { container } = renderList(
      <MessageList currentUserId="me" messages={few} hasMore loadingMore onLoadMore={onLoadMore} />,
    );
    const el = scroller(container);
    el.scrollTop = 50;
    fireEvent.scroll(el);
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('does not hammer a failing link: it shows a retry chip and waits to be tapped', () => {
    stubLayout();
    const onLoadMore = vi.fn();
    const { container } = renderList(
      <MessageList currentUserId="me" messages={few} hasMore loadMoreFailed onLoadMore={onLoadMore} />,
    );
    const el = scroller(container);
    el.scrollTop = 50;
    fireEvent.scroll(el);
    expect(onLoadMore).not.toHaveBeenCalled();

    // Not silence, and not an empty thread: the messages are all still there.
    expect(screen.getAllByTestId('bubble')).toHaveLength(2);
    fireEvent.click(screen.getByText('chat.olderFailed'));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('keeps what the reader is looking at where it was when the older page lands above it', () => {
    stubLayout();
    layout.height = 1000;
    const onLoadMore = vi.fn();
    const { container, rerenderList } = renderList(
      <MessageList currentUserId="me" messages={few} hasMore onLoadMore={onLoadMore} />,
    );
    const el = scroller(container);
    el.scrollTop = 50;
    fireEvent.scroll(el);
    expect(onLoadMore).toHaveBeenCalled();

    // The older page arrives and pushes everything down by 400px.
    layout.height = 1400;
    rerenderList(
      <MessageList
        currentUserId="me"
        messages={[makeMessage({ id: 'm1', createdAt: iso(-3000) }), ...few]}
        hasMore
        onLoadMore={onLoadMore}
      />,
    );
    expect(el.scrollTop).toBe(450);
  });

  it('does not put the reader a page too far when the browser has already moved them', () => {
    // Scroll anchoring (Chrome, and so the Android WebView) corrects the position
    // by itself when content appears above what is being read. Adding the page's
    // height to a position that is already corrected would overshoot.
    stubLayout();
    layout.height = 1000;
    const onLoadMore = vi.fn();
    const { container, rerenderList } = renderList(
      <MessageList currentUserId="me" messages={few} hasMore onLoadMore={onLoadMore} />,
    );
    const el = scroller(container);
    el.scrollTop = 50;
    fireEvent.scroll(el);
    layout.height = 1400;
    el.scrollTop = 450; // the browser got there first
    rerenderList(
      <MessageList
        currentUserId="me"
        messages={[makeMessage({ id: 'm1', createdAt: iso(-3000) }), ...few]}
        hasMore
        onLoadMore={onLoadMore}
      />,
    );
    expect(el.scrollTop).toBe(450);
  });

  it('asks for one older page at a time, however many scroll events arrive', () => {
    stubLayout();
    const onLoadMore = vi.fn();
    const { container, rerenderList } = renderList(
      <MessageList currentUserId="me" messages={few} hasMore onLoadMore={onLoadMore} />,
    );
    onLoadMore.mockClear();
    const el = scroller(container);
    for (const top of [90, 80, 60, 30]) {
      el.scrollTop = top;
      fireEvent.scroll(el);
    }
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    // The page is on its way, and then it has landed.
    rerenderList(
      <MessageList currentUserId="me" messages={few} hasMore loadingMore onLoadMore={onLoadMore} />,
    );
    rerenderList(
      <MessageList
        currentUserId="me"
        messages={[makeMessage({ id: 'm1', createdAt: iso(-3000) }), ...few]}
        hasMore
        onLoadMore={onLoadMore}
      />,
    );
    el.scrollTop = 40;
    fireEvent.scroll(el);
    expect(onLoadMore).toHaveBeenCalledTimes(2);
  });

  it('fills a screen that is too short to scroll', () => {
    // Everything fits, so no scroll event can ever ask for more.
    stubLayout();
    layout.height = 300;
    const onLoadMore = vi.fn();
    renderList(<MessageList currentUserId="me" messages={few} hasMore onLoadMore={onLoadMore} />);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });
});

describe('MessageList — the round button and the floating date', () => {
  it('counts what arrives while the reader is up in the history, and clears at the bottom', () => {
    stubLayout();
    const older = makeMessage({ id: 'a', senderId: 'x', createdAt: iso(-5000) });
    const { container, rerenderList } = renderList(
      <MessageList currentUserId="me" messages={[older]} unread={{ firstId: null, count: 0 }} />,
    );
    const el = scroller(container);
    fireEvent.touchStart(el);
    el.scrollTop = 200; // 3000 - 200 - 600 = 2200px above the bottom
    fireEvent.scroll(el);

    rerenderList(
      <MessageList
        currentUserId="me"
        messages={[older, makeMessage({ id: 'b', senderId: 'x', createdAt: iso(-1000) })]}
        unread={{ firstId: null, count: 0 }}
      />,
    );
    const fab = screen.getByRole('button', { name: 'chat.newMessages:{"n":1}' });
    expect(fab.querySelector('.bg-wa-badge')?.textContent).toBe('1');

    // Back at the bottom: the count goes.
    el.scrollTop = layout.height - layout.client;
    fireEvent.scroll(el);
    expect(screen.queryByRole('button', { name: /chat\.newMessages/ })).toBeNull();
  });

  it('a message the reader just sent brings them to the bottom wherever they were', () => {
    stubLayout();
    const scrollIntoView = vi
      .spyOn(Element.prototype, 'scrollIntoView')
      .mockImplementation(() => {});
    const older = makeMessage({ id: 'a', senderId: 'x', createdAt: iso(-5000) });
    const { container, rerenderList } = renderList(
      <MessageList currentUserId="me" messages={[older]} unread={{ firstId: null, count: 0 }} />,
    );
    const el = scroller(container);
    fireEvent.touchStart(el);
    el.scrollTop = 200;
    fireEvent.scroll(el);
    scrollIntoView.mockClear();

    rerenderList(
      <MessageList
        currentUserId="me"
        messages={[older, makeMessage({ id: 'temp-9', senderId: 'me', createdAt: iso(-100) })]}
        unread={{ firstId: null, count: 0 }}
      />,
    );
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('floats the date of the message at the top while scrolling, and lets it fade after a second', async () => {
    stubLayout();
    // Rows 100px tall, stacked.
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get: () => 100,
    });
    Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
      configurable: true,
      get(this: HTMLElement) {
        const id = this.getAttribute('data-mid');
        if (!id) return 0;
        return Number(id.replace('r', '')) * 100;
      },
    });
    const { container } = renderList(
      <MessageList
        currentUserId="me"
        messages={[
          makeMessage({ id: 'r0', createdAt: iso(-3 * DAY) }),
          makeMessage({ id: 'r1', createdAt: iso(-2 * DAY) }),
          makeMessage({ id: 'r2', createdAt: iso(0) }),
        ]}
        unread={{ firstId: null, count: 0 }}
      />,
    );
    const el = scroller(container);
    fireEvent.touchStart(el);
    el.scrollTop = 120; // the top edge is inside row r1
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fireEvent.scroll(el);
    // The label is worked out on the next animation frame.
    await act(async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });
    const chip = container.querySelector<HTMLElement>('[aria-hidden].pointer-events-none.top-2');
    expect(chip).toBeTruthy();
    // Two days ago is a weekday name, not "today".
    expect(chip!.textContent).not.toBe('आज');
    expect(chip!.textContent).not.toBe('');
    expect(chip!.className).toContain('opacity-100');

    act(() => {
      vi.advanceTimersByTime(1100);
    });
    expect(chip!.className).toContain('opacity-0');
  });
});

describe('MessageList — selecting messages', () => {
  const thread = [
    makeMessage({ id: 'a', senderId: 'x', createdAt: iso(-3000), attachments: [picture('p1')] }),
    makeMessage({ id: 'b', senderId: 'me', createdAt: iso(-2000) }),
    makeMessage({ id: 'c', senderId: 'x', createdAt: iso(-1000) }),
  ];

  it('tints the selected rows', () => {
    const { container } = renderList(
      <MessageList
        currentUserId="me"
        messages={thread}
        selectedIds={new Set(['b'])}
        onToggleSelect={() => {}}
      />,
    );
    expect(row(container, 'b').className).toContain('bg-wa-select');
    expect(row(container, 'a').className).not.toContain('bg-wa-select');
  });

  it('long-press on a bubble goes to the screen as a selection request', () => {
    const onToggleSelect = vi.fn();
    renderList(
      <MessageList currentUserId="me" messages={thread} onToggleSelect={onToggleSelect} />,
    );
    fireEvent.click(screen.getByTestId('lp-c'));
    expect(onToggleSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'c' }));
  });

  it('while selecting, a tap anywhere on a row toggles it and nothing inside it reacts', () => {
    const onToggleSelect = vi.fn();
    renderList(
      <MessageList
        currentUserId="me"
        messages={thread}
        selectedIds={new Set(['b'])}
        onToggleSelect={onToggleSelect}
      />,
    );
    // The picture on row `a` would open the viewer on an ordinary tap.
    fireEvent.click(screen.getByTestId('img-a'));
    expect(onToggleSelect).toHaveBeenCalledTimes(1);
    expect(onToggleSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
    expect(captured.imageClicks).toBe(0);
    expect(screen.queryByTestId('viewer')).toBeNull();
  });

  it('a tap with nothing selected opens the picture as usual', () => {
    renderList(
      <MessageList currentUserId="me" messages={thread} onToggleSelect={() => {}} />,
    );
    fireEvent.click(screen.getByTestId('img-a'));
    expect(captured.imageClicks).toBe(1);
    expect(screen.getByTestId('viewer')).toBeInTheDocument();
  });

  it('floats the six reactions over a lone selected message', () => {
    const onReact = vi.fn();
    const { container } = renderList(
      <MessageList
        currentUserId="me"
        messages={thread}
        selectedIds={new Set(['c'])}
        onToggleSelect={() => {}}
        onReact={onReact}
      />,
    );
    const strip = within(row(container, 'c')).getByRole('group');
    expect(within(strip).getAllByRole('button')).toHaveLength(6);
    fireEvent.click(within(strip).getByRole('button', { name: '🙏' }));
    expect(onReact).toHaveBeenCalledWith(expect.objectContaining({ id: 'c' }), '🙏');
  });

  it('shows no reaction strip for two selected messages, or for none', () => {
    const { container, rerenderList } = renderList(
      <MessageList
        currentUserId="me"
        messages={thread}
        selectedIds={new Set(['b', 'c'])}
        onToggleSelect={() => {}}
        onReact={() => {}}
      />,
    );
    expect(container.querySelector('[role="group"]')).toBeNull();
    rerenderList(
      <MessageList
        currentUserId="me"
        messages={thread}
        selectedIds={new Set()}
        onToggleSelect={() => {}}
        onReact={() => {}}
      />,
    );
    expect(container.querySelector('[role="group"]')).toBeNull();
  });
});

describe('MessageList — swipe to reply', () => {
  function swipe(target: HTMLElement) {
    fireEvent.pointerDown(target, { pointerType: 'touch', pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(target, { pointerType: 'touch', pointerId: 1, clientX: 90, clientY: 2 });
    fireEvent.pointerUp(target, { pointerType: 'touch', pointerId: 1, clientX: 90, clientY: 2 });
  }

  it('works on a report MDG shared (a system message) like on any other', () => {
    const onReply = vi.fn();
    const { container } = renderList(
      <MessageList
        currentUserId="me"
        onReply={onReply}
        messages={[
          makeMessage({
            id: 'sys',
            senderId: 'mdg-system',
            senderRole: 'admin',
            system: true,
            attachments: [picture('card')],
            createdAt: iso(-1000),
          }),
        ]}
      />,
    );
    swipe(row(container, 'sys'));
    expect(onReply).toHaveBeenCalledWith(expect.objectContaining({ id: 'sys' }));
  });

  it('does not start a reply to a message that is still being sent', () => {
    const onReply = vi.fn();
    const { container } = renderList(
      <MessageList
        currentUserId="me"
        onReply={onReply}
        messages={[makeMessage({ id: 'temp-1-1', senderId: 'me', createdAt: iso(-1000) })]}
      />,
    );
    swipe(row(container, 'temp-1-1'));
    expect(onReply).not.toHaveBeenCalled();
  });

  it('does not start a reply while messages are selected', () => {
    const onReply = vi.fn();
    const { container } = renderList(
      <MessageList
        currentUserId="me"
        onReply={onReply}
        selectedIds={new Set(['m'])}
        onToggleSelect={() => {}}
        messages={[makeMessage({ id: 'm', senderId: 'x', createdAt: iso(-1000) })]}
      />,
    );
    swipe(row(container, 'm'));
    expect(onReply).not.toHaveBeenCalled();
  });
});

describe('MessageList — the viewer', () => {
  const thread = [
    makeMessage({
      id: 'm1',
      senderId: 'x',
      body: 'first',
      attachments: [picture('p1'), picture('p2')],
      createdAt: iso(-4000),
    }),
    makeMessage({ id: 'm2', senderId: 'me', body: 'no picture', createdAt: iso(-3000) }),
    makeMessage({
      id: 'm3',
      senderId: 'sys',
      senderRole: 'admin',
      system: true,
      attachments: [picture('p3')],
      createdAt: iso(-2000),
    }),
  ];

  it('opens on the tapped picture and pages through EVERY picture in the thread, oldest first', () => {
    renderList(<MessageList currentUserId="me" messages={thread} />);
    fireEvent.click(screen.getByTestId('img-m3'));
    expect(screen.getByTestId('viewer')).toBeInTheDocument();
    const items = viewer.props!.items as { key: string; senderLabel: string }[];
    expect(items.map((i) => i.key)).toEqual(['m1:p1', 'm1:p2', 'm3:p3']);
    expect(viewer.props!.initialKey).toBe('m3:p3');
    expect(items.map((i) => i.senderLabel)).toEqual([
      'chat.senderMdg',
      'chat.senderMdg',
      'chat.senderMdg',
    ]);
  });

  it('lets the viewer fetch older pictures: hasOlder, loadingOlder and onNeedOlder reach the thread', () => {
    const onLoadMore = vi.fn();
    stubLayout();
    layout.height = 3000;
    renderList(
      <MessageList
        currentUserId="me"
        messages={thread}
        hasMore
        loadingMore
        onLoadMore={onLoadMore}
      />,
    );
    fireEvent.click(screen.getByTestId('img-m3'));
    expect(viewer.props!.hasOlder).toBe(true);
    expect(viewer.props!.loadingOlder).toBe(true);
    onLoadMore.mockClear();
    act(() => (viewer.props!.onNeedOlder as () => void)());
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('closes, and "Show in chat" scrolls the thread to that message and flashes it', () => {
    const calls: Element[] = [];
    vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(function (this: Element) {
      calls.push(this);
    });
    const { container } = renderList(<MessageList currentUserId="me" messages={thread} />);
    fireEvent.click(screen.getByTestId('img-m1'));
    const items = viewer.props!.items as { source: { messageId: string } }[];
    act(() => (viewer.props!.onShowInChat as (i: unknown) => void)(items[0]));
    expect(screen.queryByTestId('viewer')).toBeNull();
    const target = row(container, 'm1');
    expect(calls).toContain(target);
    expect(target.classList.contains('flash-highlight')).toBe(true);
  });

  it('closes on its own onClose', () => {
    renderList(<MessageList currentUserId="me" messages={thread} />);
    fireEvent.click(screen.getByTestId('img-m1'));
    act(() => (viewer.props!.onClose as () => void)());
    expect(screen.queryByTestId('viewer')).toBeNull();
  });
});

describe('MessageList — jumping from outside', () => {
  const thread = [
    makeMessage({ id: 'a', createdAt: iso(-3000) }),
    makeMessage({ id: 'b', createdAt: iso(-2000) }),
  ];

  it('scrolls to the message asked for, and flashes it', () => {
    const calls: Element[] = [];
    vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(function (this: Element) {
      calls.push(this);
    });
    const { container, rerenderList } = renderList(
      <MessageList currentUserId="me" messages={thread} jumpTo={null} />,
    );
    calls.length = 0;
    rerenderList(<MessageList currentUserId="me" messages={thread} jumpTo={{ id: 'a', n: 1 }} />);
    expect(calls).toContain(row(container, 'a'));
    expect(row(container, 'a').classList.contains('flash-highlight')).toBe(true);
  });

  it('goes again when asked again for the same message', () => {
    const calls: Element[] = [];
    vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(function (this: Element) {
      calls.push(this);
    });
    const { container, rerenderList } = renderList(
      <MessageList currentUserId="me" messages={thread} jumpTo={{ id: 'a', n: 1 }} />,
    );
    const before = calls.filter((c) => c === row(container, 'a')).length;
    rerenderList(<MessageList currentUserId="me" messages={thread} jumpTo={{ id: 'a', n: 2 }} />);
    expect(calls.filter((c) => c === row(container, 'a')).length).toBe(before + 1);
  });

  it('pages older messages in when the one asked for is not loaded yet', async () => {
    const onFetchOlder = vi.fn(async () => ({ hasNextPage: false }));
    renderList(
      <MessageList
        currentUserId="me"
        conversationId="c1"
        messages={thread}
        hasMore
        onFetchOlder={onFetchOlder}
        jumpTo={{ id: 'far-away', n: 1 }}
      />,
    );
    await waitFor(() => expect(onFetchOlder).toHaveBeenCalledTimes(1));
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
