import { fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useLangStore } from '@/store/lang';
import { makeMessage } from '@/test/utils';
import type { MessageReaction } from '@dk/shared/types';

import { MessageBubble } from './MessageBubble';

// Assert against English copy (the store defaults to Hindi).
beforeEach(() => {
  useLangStore.setState({ lang: 'en', explicit: false });
});

function renderBubble(message: ReturnType<typeof makeMessage>, mine = true) {
  return render(<MessageBubble message={message} mine={mine} />);
}
const BLUE = '34b7f1';

function reaction(overrides: Partial<MessageReaction> = {}): MessageReaction {
  return {
    userId: 'u2',
    userName: 'Priya',
    emoji: '👍',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('MessageBubble delivery ticks', () => {
  it('shows a clock for an unconfirmed temp message', () => {
    const { container } = renderBubble(makeMessage({ id: 'temp-1', senderId: 'u1' }));
    expect(container.querySelector('.lucide-clock')).toBeTruthy();
  });

  it('shows a single check when sent but not delivered', () => {
    const { container } = renderBubble(
      makeMessage({ id: 'r1', senderId: 'u1', deliveredTo: [], readBy: [] }),
    );
    expect(container.querySelector('.lucide-check')).toBeTruthy();
    expect(container.querySelector('.lucide-check-check')).toBeFalsy();
  });

  it('shows a plain double check when delivered but not read', () => {
    const { container } = renderBubble(
      makeMessage({ id: 'r1', senderId: 'u1', deliveredTo: ['u2'], readBy: [] }),
    );
    const dbl = container.querySelector('.lucide-check-check');
    expect(dbl).toBeTruthy();
    expect(dbl?.getAttribute('class') ?? '').not.toContain(BLUE);
  });

  it('shows a blue double check when read', () => {
    const { container } = renderBubble(
      makeMessage({ id: 'r1', senderId: 'u1', deliveredTo: ['u2'], readBy: ['u2'] }),
    );
    const dbl = container.querySelector('.lucide-check-check');
    expect(dbl?.getAttribute('class') ?? '').toContain(BLUE);
  });

  it('renders no ticks for the other party’s messages', () => {
    const { container } = renderBubble(makeMessage({ id: 'r1', senderId: 'u2' }), false);
    expect(
      container.querySelector('.lucide-clock, .lucide-check, .lucide-check-check'),
    ).toBeFalsy();
  });

  it('ignores the sender’s own id in deliveredTo/readBy (still a single check)', () => {
    const { container } = renderBubble(
      makeMessage({ id: 'r1', senderId: 'u1', deliveredTo: ['u1'], readBy: ['u1'] }),
    );
    expect(container.querySelector('.lucide-check')).toBeTruthy();
    expect(container.querySelector('.lucide-check-check')).toBeFalsy();
  });

  it('is wrapped in React.memo', () => {
    expect((MessageBubble as unknown as { $$typeof: symbol }).$$typeof).toBe(
      Symbol.for('react.memo'),
    );
  });
});

describe('MessageBubble body', () => {
  it('no longer re-enables text selection (copy lives in the action menu)', () => {
    const { container } = renderBubble(makeMessage({ body: 'hello there' }));
    expect(container.querySelector('.select-text')).toBeFalsy();
  });

  it('linkifies http/https URLs in the body', () => {
    renderBubble(makeMessage({ body: 'see https://example.com/x now' }));
    const a = screen.getByRole('link', { name: 'https://example.com/x' });
    expect(a).toHaveAttribute('href', 'https://example.com/x');
    expect(a).toHaveAttribute('target', '_blank');
    expect(a.getAttribute('rel')).toContain('noopener');
  });
});

describe('MessageBubble reactions', () => {
  it('groups reactions into chips with counts and highlights my own', () => {
    const { container } = render(
      <MessageBubble
        message={makeMessage({
          id: 'r1',
          reactions: [
            reaction({ userId: 'u2', emoji: '👍' }),
            reaction({ userId: 'u3', emoji: '👍' }),
            reaction({ userId: 'me', emoji: '❤️' }),
          ],
        })}
        mine={false}
        currentUserId="me"
      />,
    );
    expect(screen.getByText('👍')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // 👍 count
    expect(screen.getByText('❤️')).toBeInTheDocument();
    // Own reaction chip gets the brand highlight.
    const chips = Array.from(container.querySelectorAll('span.rounded-full'));
    const ownChip = chips.find((c) => c.textContent === '❤️');
    expect(ownChip?.getAttribute('class') ?? '').toContain('border-brand');
  });

  it('opens the who-reacted sheet when the chips are tapped', () => {
    const onOpenReactions = vi.fn();
    const message = makeMessage({ id: 'r1', reactions: [reaction()] });
    render(
      <MessageBubble
        message={message}
        mine={false}
        currentUserId="me"
        onOpenReactions={onOpenReactions}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reactions' }));
    expect(onOpenReactions).toHaveBeenCalledWith(message);
  });

  it('renders no chips row for a message without reactions', () => {
    renderBubble(makeMessage({ body: 'plain' }));
    expect(screen.queryByRole('button', { name: 'Reactions' })).toBeNull();
  });
});

describe('MessageBubble reply quote', () => {
  it('renders the quoted sender and snippet, and jumps on tap', () => {
    const onJumpTo = vi.fn();
    const message = makeMessage({
      id: 'm9',
      body: 'the reply',
      replyTo: {
        messageId: 'orig-1',
        senderId: 'u7',
        senderName: 'Priya',
        body: 'original text',
      },
    });
    render(
      <MessageBubble
        message={message}
        mine={false}
        currentUserId="me"
        onJumpTo={onJumpTo}
      />,
    );
    expect(screen.getByText('Priya')).toBeInTheDocument();
    expect(screen.getByText('original text')).toBeInTheDocument();
    fireEvent.click(screen.getByText('original text'));
    expect(onJumpTo).toHaveBeenCalledWith('orig-1', 'm9');
  });

  it('labels my own quoted message "You" and falls back to MDG Support', () => {
    render(
      <MessageBubble
        message={makeMessage({
          id: 'm1',
          body: 'a',
          replyTo: { messageId: 'o1', senderId: 'me', body: 'mine' },
        })}
        mine={false}
        currentUserId="me"
      />,
    );
    expect(screen.getByText('You')).toBeInTheDocument();

    render(
      <MessageBubble
        message={makeMessage({
          id: 'm2',
          body: 'b',
          replyTo: { messageId: 'o2', senderId: 'admin-1', body: 'from support' },
        })}
        mine={false}
        currentUserId="me"
      />,
    );
    expect(screen.getByText('MDG Support')).toBeInTheDocument();
  });

  it('renders old messages without reply/reactions exactly as before', () => {
    const { container } = renderBubble(makeMessage({ body: 'legacy' }));
    expect(screen.getByText('legacy')).toBeInTheDocument();
    expect(container.querySelectorAll('button').length).toBe(0);
  });
});

describe('MessageBubble sender names (group threads)', () => {
  it('shows the sender name above others’ bubbles when showSender is set', () => {
    render(
      <MessageBubble
        message={makeMessage({ senderId: 'u9', senderName: 'Manager Raju', body: 'hi' })}
        mine={false}
        currentUserId="me"
        showSender
      />,
    );
    expect(screen.getByText('Manager Raju')).toBeInTheDocument();
  });

  it('never shows a name on my own bubbles', () => {
    render(
      <MessageBubble
        message={makeMessage({ senderId: 'me', senderName: 'Me Myself', body: 'hi' })}
        mine
        currentUserId="me"
        showSender
      />,
    );
    expect(screen.queryByText('Me Myself')).toBeNull();
  });
});
