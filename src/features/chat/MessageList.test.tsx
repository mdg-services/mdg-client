import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { makeMessage } from '@/test/utils';

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

// Lightweight bubble stub that exposes id + the onOpenImage ref it received.
const captured = vi.hoisted(() => ({ openImageRefs: [] as unknown[] }));
vi.mock('./MessageBubble', () => ({
  MessageBubble: ({ message, onOpenImage }: { message: { id: string }; onOpenImage?: unknown }) => {
    captured.openImageRefs.push(onOpenImage);
    return <div data-testid="bubble" data-id={message.id} />;
  },
}));

const iso = (msFromNow: number) => new Date(Date.now() + msFromNow).toISOString();
const DAY = 86_400_000;

afterEach(() => {
  state.lang = 'hi';
  captured.openImageRefs.length = 0;
});

describe('MessageList', () => {
  it('inserts day dividers for today and yesterday', () => {
    render(
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
    render(
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

  it('re-localises the day dividers when the language changes', () => {
    const msgs = [makeMessage({ id: 'a', createdAt: iso(0) })];
    const { rerender } = render(<MessageList currentUserId="u1" messages={msgs} />);
    expect(screen.getByText('आज')).toBeInTheDocument();

    state.lang = 'en';
    rerender(<MessageList currentUserId="u1" messages={[...msgs]} />);
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.queryByText('आज')).not.toBeInTheDocument();
  });

  it('passes a stable onOpenImage reference across re-renders (memo stays effective)', () => {
    const msgs = [makeMessage({ id: 'a', createdAt: iso(0) })];
    const { rerender } = render(
      <MessageList currentUserId="u1" messages={msgs} typing={{ active: false }} />,
    );
    rerender(<MessageList currentUserId="u1" messages={msgs} typing={{ active: true }} />);
    const unique = new Set(captured.openImageRefs);
    expect(unique.size).toBe(1); // same callback identity every render
  });

  it('shows an empty state when there are no messages and not loading', () => {
    render(<MessageList currentUserId="u1" messages={[]} loading={false} />);
    expect(screen.getByText('chat.emptyTitle')).toBeInTheDocument();
  });

  it('shows a spinner while loading with no messages', () => {
    const { container } = render(<MessageList currentUserId="u1" messages={[]} loading />);
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('renders the typing indicator when typing.active', () => {
    const { container } = render(
      <MessageList
        currentUserId="u1"
        messages={[makeMessage({ id: 'a', createdAt: iso(0) })]}
        typing={{ active: true, userName: 'Support' }}
      />,
    );
    expect(container.querySelector('.animate-bounce')).toBeTruthy();
  });

  it('renders a load-earlier control when hasMore', () => {
    render(
      <MessageList
        currentUserId="u1"
        messages={[makeMessage({ id: 'a', createdAt: iso(0) })]}
        hasMore
        onLoadMore={() => {}}
      />,
    );
    expect(screen.getByText('chat.loadEarlier')).toBeInTheDocument();
  });
});
