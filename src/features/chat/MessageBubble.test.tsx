import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useLangStore } from '@/store/lang';
import { makeMessage } from '@/test/utils';
import type { Attachment, MessageReaction } from '@dk/shared/types';

import type { AskPhase } from './askView';
import { MessageBubble } from './MessageBubble';

// Downloads and fresh links go through the message; here they are doubles.
const h = vi.hoisted(() => ({
  download: vi.fn(),
  fresh: vi.fn(),
}));
vi.mock('@/lib/downloadAttachment', () => ({
  useAttachmentDownload: () => h.download,
  fetchFreshInlineUrl: (...args: unknown[]) => h.fresh(...args),
}));

// Assert against English copy (the store defaults to Hindi).
beforeEach(() => {
  useLangStore.setState({ lang: 'en', explicit: false });
  h.download.mockReset();
  h.fresh.mockReset();
});

// Spies are restored by the config (`restoreMocks`) before the NEXT test, which
// is after Testing Library has unmounted this one — a note that was playing
// pauses itself on unmount, and that has to reach the stub, not jsdom's own.
afterEach(() => {
  vi.useRealTimers();
});

function renderBubble(message: ReturnType<typeof makeMessage>, mine = true) {
  return render(<MessageBubble message={message} mine={mine} />);
}
// What a read tick is drawn in (a token, not a hex — see the wa-* palette).
const READ = 'text-wa-tick-read';

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
    expect(dbl?.getAttribute('class') ?? '').not.toContain(READ);
  });

  it('shows a blue double check when read', () => {
    const { container } = renderBubble(
      makeMessage({ id: 'r1', senderId: 'u1', deliveredTo: ['u2'], readBy: ['u2'] }),
    );
    const dbl = container.querySelector('.lucide-check-check');
    expect(dbl?.getAttribute('class') ?? '').toContain(READ);
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
    // Own reaction chip gets the accent outline.
    const chips = Array.from(container.querySelectorAll('span.rounded-full'));
    const ownChip = chips.find((c) => c.textContent === '❤️');
    expect(ownChip?.getAttribute('class') ?? '').toContain('border-wa-accent');
    const otherChip = chips.find((c) => c.textContent?.startsWith('👍'));
    expect(otherChip?.getAttribute('class') ?? '').not.toContain('border-wa-accent');
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

/**
 * A shared report is a message like any other.
 *
 * `system: true` used to draw a message centred, with no time, no reactions and
 * no way to reply to it — "a picture in the middle with grey text under it". The
 * flag is still written by every sender (the admin app keeps its own drawing of
 * it), but on the dealer's screen it now means nothing: the message is an
 * ordinary incoming bubble from MDG.
 */
describe('MessageBubble — a message MDG shared (system: true)', () => {
  // Exactly the shape dsr-report/share.ts posts: a `system: true` message whose
  // body is the one-line caption, carrying the cards as attachments.
  const card: Attachment = {
    storageKey: 'dsr/15E/2026-08-13/variation.png',
    filename: 'dsr-variation-2026-08-13.png',
    contentType: 'image/png',
    size: 48_000,
    kind: 'image',
    url: 'https://files.example.test/dsr-variation.png',
  };
  const shared = (over: Parameters<typeof makeMessage>[0] = {}) =>
    makeMessage({
      id: 'sys-1',
      senderId: 'mdg-system',
      senderRole: 'admin',
      senderName: 'MDG',
      system: true,
      body: 'DSR · 13 Aug — stock variation within limit',
      attachments: [card],
      ...over,
    });

  it('is an ordinary incoming bubble: white, on the left, never centred', () => {
    const { container } = render(
      <MessageBubble message={shared()} mine={false} currentUserId="me" />,
    );
    const bubble = container.querySelector('.bg-wa-in');
    expect(bubble).toBeTruthy();
    expect(bubble!.className).toContain('rounded-md');
    // Left: the row pushes to the start, and nothing is centred.
    expect(container.firstElementChild!.className).toContain('justify-start');
    expect(container.querySelector('.items-center.text-center, p.text-center')).toBeNull();
    // The grey chip the notice used to be is gone.
    expect(container.querySelector('p.rounded-lg, .bg-surface-2')).toBeNull();
  });

  it('shows the picture and its caption in the SAME bubble', () => {
    const { container } = render(
      <MessageBubble message={shared()} mine={false} currentUserId="me" />,
    );
    const img = screen.getByAltText(card.filename);
    expect(img).toHaveAttribute('src', card.url);
    const bubbles = container.querySelectorAll('.bg-wa-in');
    expect(bubbles).toHaveLength(1);
    expect(bubbles[0]!.contains(img)).toBe(true);
    expect(
      bubbles[0]!.contains(screen.getByText('DSR · 13 Aug — stock variation within limit')),
    ).toBe(true);
  });

  it('carries its time, inside the bubble', () => {
    const { container } = render(
      <MessageBubble message={shared()} mine={false} currentUserId="me" />,
    );
    const time = screen.getByText(/^12:00/);
    expect(container.querySelector('.bg-wa-in')!.contains(time)).toBe(true);
  });

  it('opens the viewer when its picture is tapped, with the message riding along', () => {
    const onOpenImage = vi.fn();
    render(
      <MessageBubble
        message={shared({ id: 'sys-2' })}
        mine={false}
        currentUserId="me"
        onOpenImage={onOpenImage}
      />,
    );
    fireEvent.click(screen.getByAltText(card.filename));
    // The MESSAGE rides along with the picture: presigning a fresh URL for a
    // service card is authorised through the message that carries the key.
    expect(onOpenImage).toHaveBeenCalledWith(
      card,
      expect.objectContaining({ id: 'sys-2', conversationId: 'c1' }),
    );
  });

  it('can be selected: a long-press fires, like on any incoming message', () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const message = shared();
    const { container } = render(
      <MessageBubble
        message={message}
        mine={false}
        currentUserId="me"
        onLongPress={onLongPress}
      />,
    );
    const bubble = container.querySelector('.bg-wa-in')!;
    fireEvent.pointerDown(bubble, { pointerId: 1, clientX: 5, clientY: 5 });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onLongPress).toHaveBeenCalledWith(message);
  });

  it('a message still being sent cannot be selected — the server does not know it yet', () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const { container } = render(
      <MessageBubble
        message={makeMessage({ id: 'temp-1-1', senderId: 'me' })}
        mine
        currentUserId="me"
        onLongPress={onLongPress}
      />,
    );
    fireEvent.pointerDown(container.querySelector('.bg-wa-out')!, { pointerId: 1 });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('takes reactions, and they hang off the bubble, tappable', () => {
    const onOpenReactions = vi.fn();
    const message = shared({ reactions: [reaction({ userId: 'me', emoji: '❤️' })] });
    render(
      <MessageBubble
        message={message}
        mine={false}
        currentUserId="me"
        onOpenReactions={onOpenReactions}
      />,
    );
    expect(screen.getByText('❤️')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reactions' }));
    expect(onOpenReactions).toHaveBeenCalledWith(message);
  });

  it('a text-only notice ("Resolved — …", the Kavach line) is an ordinary bubble too', () => {
    const { container } = render(
      <MessageBubble
        message={makeMessage({
          id: 'sys-3',
          senderId: 'admin-1',
          senderRole: 'admin',
          system: true,
          body: 'Resolved — DSR',
          attachments: [],
        })}
        mine={false}
        currentUserId="me"
      />,
    );
    expect(container.querySelector('.bg-wa-in')!.textContent).toContain('Resolved — DSR');
    expect(container.querySelector('[data-tail]')).toBeTruthy();
  });

  it('a long mixed Hindi/English notice with no picture is drawn whole', () => {
    const body = 'क्रेडिट & DOD — आज की स्थिति\nOpening: ₹1,20,000\nClosing: ₹98,400\nजमा करें';
    const { container } = render(
      <MessageBubble
        message={makeMessage({ senderId: 'sys', senderRole: 'admin', system: true, body })}
        mine={false}
        currentUserId="me"
      />,
    );
    const text = container.querySelector('.whitespace-pre-wrap')!;
    expect(text.textContent).toBe(body);
    expect(text.className).not.toMatch(/line-clamp|truncate/);
  });
});

describe('MessageBubble — the bubble itself', () => {
  it('is white on the left for theirs and green on the right for mine', () => {
    const theirs = renderBubble(makeMessage({ senderId: 'x' }), false);
    expect(theirs.container.querySelector('.bg-wa-in')).toBeTruthy();
    expect(theirs.container.firstElementChild!.className).toContain('justify-start');
    theirs.unmount();
    const mine = renderBubble(makeMessage({ senderId: 'me' }), true);
    expect(mine.container.querySelector('.bg-wa-out')).toBeTruthy();
    expect(mine.container.firstElementChild!.className).toContain('justify-end');
  });

  it('draws the tail on the first bubble of a run only: top-left for theirs, top-right for mine', () => {
    const first = render(<MessageBubble message={makeMessage()} mine={false} first />);
    expect(first.container.querySelector('[data-tail]')).toBeTruthy();
    expect(first.container.querySelector('.bg-wa-in')!.className).toContain('rounded-tl-none');
    first.unmount();

    const inside = render(<MessageBubble message={makeMessage()} mine={false} first={false} />);
    expect(inside.container.querySelector('[data-tail]')).toBeNull();
    expect(inside.container.querySelector('.bg-wa-in')!.className).not.toContain('rounded-tl-none');
    inside.unmount();

    const mine = render(<MessageBubble message={makeMessage()} mine first />);
    expect(mine.container.querySelector('.bg-wa-out')!.className).toContain('rounded-tr-none');
    const tail = mine.container.querySelector('[data-tail]')!;
    expect(tail.getAttribute('class')).toContain('text-wa-out');
    expect(tail.getAttribute('class')).toContain('-right-[7px]');
  });

  it('a bubble drawn on its own counts as a run of one and gets a tail', () => {
    const { container } = renderBubble(makeMessage());
    expect(container.querySelector('[data-tail]')).toBeTruthy();
  });

  it('carries its time inside the bubble, at the bottom-right', () => {
    const { container } = renderBubble(makeMessage({ senderId: 'x' }), false);
    const time = screen.getByText(/^12:00/);
    const bubble = container.querySelector('.bg-wa-in')!;
    expect(bubble.contains(time)).toBe(true);
    // Absolutely placed in the corner, not a row of its own below the bubble.
    expect(time.closest('.absolute')?.className).toContain('right-');
    expect(time.closest('.absolute')?.className).toContain('bottom-');
  });

  it('keeps the words clear of the time with a trailing spacer, wider for mine (it holds ticks)', () => {
    const theirs = renderBubble(makeMessage({ body: 'ok' }), false);
    expect(theirs.container.querySelector('span[aria-hidden].inline-block')!.className).toContain(
      'w-[54px]',
    );
    theirs.unmount();
    const mine = renderBubble(makeMessage({ body: 'ok' }), true);
    expect(mine.container.querySelector('span[aria-hidden].inline-block')!.className).toContain(
      'w-[72px]',
    );
  });

  it('puts ticks beside the time on mine, and none on theirs', () => {
    const mine = renderBubble(makeMessage({ id: 'r1', senderId: 'u1' }), true);
    const timeBox = screen.getByText(/^12:00/).parentElement!;
    expect(timeBox.querySelector('.lucide-check')).toBeTruthy();
    mine.unmount();
    const theirs = renderBubble(makeMessage({ senderId: 'x' }), false);
    expect(theirs.container.querySelector('.lucide-check, .lucide-clock')).toBeFalsy();
  });

  it('shows the time in the app language, lower-case am/pm', () => {
    renderBubble(makeMessage({ createdAt: new Date(2026, 0, 1, 15, 5).toISOString() }));
    expect(screen.getByText('3:05 pm')).toBeInTheDocument();
  });

  it('shows the sender name in a group, on the first bubble of a run only', () => {
    const first = render(
      <MessageBubble
        message={makeMessage({ senderId: 'u9', senderName: 'Manager Raju' })}
        mine={false}
        showSender
        first
      />,
    );
    expect(first.getByText('Manager Raju')).toBeInTheDocument();
    first.unmount();
    render(
      <MessageBubble
        message={makeMessage({ senderId: 'u9', senderName: 'Manager Raju' })}
        mine={false}
        showSender
        first={false}
      />,
    );
    expect(screen.queryByText('Manager Raju')).toBeNull();
  });

  it('paints the words of a search in the search-hit colour, and only those', () => {
    const { container } = render(
      <MessageBubble
        message={makeMessage({ body: 'Dal rate is up, rate again' })}
        mine={false}
        highlight="rate"
      />,
    );
    const marks = container.querySelectorAll('mark');
    expect(marks).toHaveLength(2);
    expect(marks[0]!.textContent).toBe('rate');
    expect(marks[0]!.className).toContain('bg-wa-search-hit');
    expect(container.textContent).toContain('Dal rate is up, rate again');
  });

  it('turns links the accent colour and keeps them tappable', () => {
    const { container } = renderBubble(makeMessage({ body: 'see https://example.com/x' }));
    expect(container.querySelector('.whitespace-pre-wrap')!.className).toContain(
      '[&_a]:text-wa-accent-strong',
    );
  });

  it('hangs the reply quote inside the top of the bubble', () => {
    const { container } = render(
      <MessageBubble
        message={makeMessage({
          body: 'the reply',
          replyTo: { messageId: 'o', senderId: 'u7', senderName: 'Priya', body: 'original text' },
        })}
        mine={false}
      />,
    );
    const bubble = container.querySelector('.bg-wa-in')!;
    const quote = screen.getByText('original text').closest('button')!;
    expect(bubble.contains(quote)).toBe(true);
    // The quote comes before the words.
    expect(
      quote.compareDocumentPosition(screen.getByText('the reply')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe('MessageBubble — pictures', () => {
  const pic = (key: string, over: Partial<Attachment> = {}): Attachment => ({
    storageKey: key,
    filename: `${key}.jpg`,
    contentType: 'image/jpeg',
    size: 2000,
    kind: 'image',
    url: `https://files.test/${key}.jpg`,
    ...over,
  });

  function loadWith(img: HTMLElement, w: number, hgt: number) {
    Object.defineProperty(img, 'naturalWidth', { configurable: true, value: w });
    Object.defineProperty(img, 'naturalHeight', { configurable: true, value: hgt });
    fireEvent.load(img);
  }

  it('puts the caption in the same bubble as the picture', () => {
    const { container } = render(
      <MessageBubble
        message={makeMessage({ senderId: 'x', body: 'Look at this', attachments: [pic('a')] })}
        mine={false}
      />,
    );
    const bubbles = container.querySelectorAll('.bg-wa-in');
    expect(bubbles).toHaveLength(1);
    expect(bubbles[0]!.contains(screen.getByAltText('a.jpg'))).toBe(true);
    expect(bubbles[0]!.contains(screen.getByText('Look at this'))).toBe(true);
  });

  it('with no caption, the time sits ON the picture over a soft dark gradient', () => {
    const { container } = render(
      <MessageBubble
        message={makeMessage({ senderId: 'x', body: undefined, attachments: [pic('a')] })}
        mine={false}
      />,
    );
    const media = screen.getByAltText('a.jpg').closest('.relative')!.parentElement!;
    const time = screen.getByText(/^12:00/);
    expect(media.contains(time)).toBe(true);
    expect(media.querySelector('.bg-gradient-to-t')).toBeTruthy();
    expect(time.parentElement!.className).toContain('text-white');
    // No bar of its own under the picture.
    expect(container.querySelector('.justify-between')).toBeNull();
  });

  it('with a caption, the time moves down to the caption and the picture carries none', () => {
    const { container } = render(
      <MessageBubble
        message={makeMessage({ senderId: 'x', body: 'caption', attachments: [pic('a')] })}
        mine={false}
      />,
    );
    expect(container.querySelector('.bg-gradient-to-t')).toBeNull();
    const media = screen.getByAltText('a.jpg').closest('.relative')!.parentElement!;
    expect(media.contains(screen.getByText(/^12:00/))).toBe(false);
  });

  it('sizes a single picture by its real shape once it has loaded', () => {
    const { container } = render(
      <MessageBubble
        message={makeMessage({ senderId: 'x', body: undefined, attachments: [pic('wide')] })}
        mine={false}
      />,
    );
    const tile = () => screen.getByAltText('wide.jpg').closest('button')!;
    // Before it says what shape it is, a box is reserved.
    expect(tile().style.aspectRatio).toBe('1');
    loadWith(screen.getByAltText('wide.jpg'), 1200, 800);
    expect(tile().style.aspectRatio).toBe('1.5');
    expect(tile().style.maxHeight).toBe('330px');
    void container;
  });

  it('crops a very tall or very wide picture to a sane shape', () => {
    render(
      <MessageBubble
        message={makeMessage({
          senderId: 'x',
          body: undefined,
          attachments: [pic('tall'), pic('flat')].slice(0, 1),
        })}
        mine={false}
      />,
    );
    loadWith(screen.getByAltText('tall.jpg'), 400, 4000);
    expect(screen.getByAltText('tall.jpg').closest('button')!.style.aspectRatio).toBe('0.6');
  });

  it('opens the tapped picture, handing over the message', () => {
    const onOpenImage = vi.fn();
    const attachment = pic('a');
    const message = makeMessage({ attachments: [attachment] });
    render(<MessageBubble message={message} mine={false} onOpenImage={onOpenImage} />);
    fireEvent.click(screen.getByAltText('a.jpg'));
    expect(onOpenImage).toHaveBeenCalledWith(attachment, message);
  });

  describe('an album', () => {
    const album = (n: number) =>
      makeMessage({
        senderId: 'x',
        body: undefined,
        attachments: Array.from({ length: n }, (_, i) => pic(`p${i + 1}`)),
      });

    it('two pictures sit side by side', () => {
      const { container } = render(<MessageBubble message={album(2)} mine={false} />);
      const grid = container.querySelector<HTMLElement>('[data-testid="album"]')!;
      expect(grid.getAttribute('data-count')).toBe('2');
      expect(grid.querySelectorAll('img')).toHaveLength(2);
      expect(grid.className).toContain('grid-cols-2');
      expect(grid.className).toContain('grid-rows-1');
    });

    it('three pictures: one tall on the left, two stacked on the right', () => {
      const { container } = render(<MessageBubble message={album(3)} mine={false} />);
      const grid = container.querySelector<HTMLElement>('[data-testid="album"]')!;
      const cells = Array.from(grid.children) as HTMLElement[];
      expect(cells).toHaveLength(3);
      expect(cells[0]!.className).toContain('row-span-2');
      expect(cells[1]!.className).not.toContain('row-span-2');
      expect(grid.className).toContain('grid-rows-2');
    });

    it('four pictures make a 2×2 and show no "+N"', () => {
      const { container } = render(<MessageBubble message={album(4)} mine={false} />);
      const grid = container.querySelector<HTMLElement>('[data-testid="album"]')!;
      expect(grid.querySelectorAll('img')).toHaveLength(4);
      expect(container.textContent).not.toMatch(/\+\d/);
    });

    it('more than four show four, with "+N" over the fourth for the rest', () => {
      const { container } = render(<MessageBubble message={album(7)} mine={false} />);
      const grid = container.querySelector<HTMLElement>('[data-testid="album"]')!;
      expect(grid.querySelectorAll('img')).toHaveLength(4);
      const cells = Array.from(grid.children) as HTMLElement[];
      expect(cells[3]!.textContent).toBe('+3');
      expect(cells[2]!.textContent).toBe('');
    });

    it('tapping any tile opens the viewer at THAT picture', () => {
      const onOpenImage = vi.fn();
      const message = album(4);
      render(<MessageBubble message={message} mine={false} onOpenImage={onOpenImage} />);
      fireEvent.click(screen.getByAltText('p3.jpg'));
      expect(onOpenImage).toHaveBeenCalledWith(
        expect.objectContaining({ storageKey: 'p3' }),
        message,
      );
    });

    it('tapping the "+N" tile opens the fourth picture', () => {
      const onOpenImage = vi.fn();
      render(<MessageBubble message={album(6)} mine={false} onOpenImage={onOpenImage} />);
      fireEvent.click(screen.getByText('+2'));
      expect(onOpenImage).toHaveBeenCalledWith(
        expect.objectContaining({ storageKey: 'p4' }),
        expect.anything(),
      );
    });

    it('with no caption the time rides on the album, bottom-right', () => {
      const { container } = render(<MessageBubble message={album(2)} mine={false} />);
      const grid = container.querySelector('[data-testid="album"]')!;
      expect(grid.parentElement!.contains(screen.getByText(/^12:00/))).toBe(true);
    });

    it('with a caption the album and the caption are one bubble', () => {
      const m = album(3);
      m.body = 'three photos';
      const { container } = render(<MessageBubble message={m} mine={false} />);
      expect(container.querySelectorAll('.bg-wa-in')).toHaveLength(1);
      expect(
        container.querySelector('.bg-wa-in')!.contains(screen.getByText('three photos')),
      ).toBe(true);
    });
  });

  describe('a picture that arrives with no link (the live copy of a shared report)', () => {
    it('is drawn as a picture — it asks for a link through the message, never a file row', async () => {
      h.fresh.mockResolvedValue('https://fresh.test/card.png');
      const message = makeMessage({
        id: 'm-live',
        senderId: 'mdg',
        senderRole: 'admin',
        system: true,
        body: undefined,
        attachments: [pic('card', { url: undefined })],
      });
      const { container } = render(<MessageBubble message={message} mine={false} />);
      // Never a document row, not even for a moment.
      expect(container.querySelector('.lucide-file-text')).toBeNull();
      const img = await screen.findByAltText('card.jpg');
      await waitFor(() => expect(img).toHaveAttribute('src', 'https://fresh.test/card.png'));
      expect(h.fresh).toHaveBeenCalledTimes(1);
      expect(h.fresh).toHaveBeenCalledWith(
        expect.objectContaining({ storageKey: 'card' }),
        { conversationId: 'c1', messageId: 'm-live' },
      );
    });

    it('says so, in words, with a retry, when no link can be had', async () => {
      h.fresh.mockRejectedValue(new Error('403'));
      render(
        <MessageBubble
          message={makeMessage({
            id: 'm-live',
            senderId: 'mdg',
            body: undefined,
            attachments: [pic('card', { url: undefined })],
          })}
          mine={false}
        />,
      );
      const retry = await screen.findByRole('button', {
        name: "Couldn't load. Tap to try again",
      });
      h.fresh.mockResolvedValue('https://fresh.test/again.png');
      fireEvent.click(retry);
      await waitFor(() =>
        expect(screen.getByAltText('card.jpg')).toHaveAttribute('src', 'https://fresh.test/again.png'),
      );
    });

    it('replaces a stale link once, like the viewer does', async () => {
      h.fresh.mockResolvedValue('https://fresh.test/new.jpg');
      render(<MessageBubble message={makeMessage({ attachments: [pic('a')] })} mine={false} />);
      fireEvent.error(screen.getByAltText('a.jpg'));
      await waitFor(() =>
        expect(screen.getByAltText('a.jpg')).toHaveAttribute('src', 'https://fresh.test/new.jpg'),
      );
    });
  });

  describe('a photo that has only just been sent', () => {
    it('is drawn as the photo, from the phone\'s own copy, with a spinner on it — not as a file row', () => {
      const message = makeMessage({
        id: 'temp-1-1',
        senderId: 'me',
        body: undefined,
        attachments: [
          pic('local:temp-1-1:0', { url: 'blob:local-photo', filename: 'IMG_0001.jpg' }),
        ],
      });
      const { container } = render(<MessageBubble message={message} mine currentUserId="me" />);
      const img = screen.getByAltText('IMG_0001.jpg');
      expect(img).toHaveAttribute('src', 'blob:local-photo');
      expect(container.querySelector('.lucide-file-text')).toBeNull();
      expect(container.querySelector('.animate-spin')).toBeTruthy();
      // Not yet the server's: the clock, and no attempt to ask it for a link.
      expect(container.querySelector('.lucide-clock')).toBeTruthy();
      expect(h.fresh).not.toHaveBeenCalled();
    });

    it('sheds the spinner and the clock once the server has it', () => {
      const real = makeMessage({
        id: 'real-1',
        senderId: 'me',
        body: undefined,
        attachments: [pic('chat/c1/real.jpg')],
      });
      const { container } = render(<MessageBubble message={real} mine currentUserId="me" />);
      expect(container.querySelector('.animate-spin')).toBeNull();
      expect(container.querySelector('.lucide-clock')).toBeNull();
    });
  });
});

describe('MessageBubble — voice notes', () => {
  const note = (key: string, over: Partial<Attachment> = {}): Attachment => ({
    storageKey: key,
    filename: `${key}.webm`,
    contentType: 'audio/webm',
    size: 4000,
    kind: 'audio',
    durationMs: 10_000,
    url: `https://files.test/${key}.webm`,
    ...over,
  });

  // jsdom cannot play media; give it a play/pause that behaves.
  beforeEach(() => {
    Object.defineProperty(HTMLMediaElement.prototype, 'paused', {
      configurable: true,
      get(this: { __paused?: boolean }) {
        return this.__paused ?? true;
      },
    });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
      this: HTMLMediaElement & { __paused?: boolean },
    ) {
      this.__paused = false;
      this.dispatchEvent(new Event('play'));
      return Promise.resolve();
    });
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (
      this: HTMLMediaElement & { __paused?: boolean },
    ) {
      this.__paused = true;
      this.dispatchEvent(new Event('pause'));
    });
  });
  afterEach(() => {
    delete (HTMLMediaElement.prototype as unknown as Record<string, unknown>).paused;
  });

  const voiceMsg = (id: string, key: string, mine = false) =>
    makeMessage({
      id,
      senderId: mine ? 'me' : 'x',
      senderName: mine ? 'Ramesh' : 'MDG',
      body: undefined,
      attachments: [note(key)],
    });

  it('is a voice note, not a document, even with no link yet', () => {
    const { container } = render(
      <MessageBubble
        message={makeMessage({ body: undefined, attachments: [note('n0', { url: undefined })] })}
        mine={false}
      />,
    );
    expect(screen.getByRole('button', { name: 'Play voice message' })).toBeInTheDocument();
    expect(container.querySelector('.lucide-file-text')).toBeNull();
  });

  it('plays and pauses, and shows the length under the waveform', () => {
    const { container } = render(<MessageBubble message={voiceMsg('v1', 'n1')} mine={false} />);
    expect(screen.getByText('0:10')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Play voice message' }));
    expect(screen.getByRole('button', { name: 'Pause voice message' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pause voice message' }));
    expect(screen.getByRole('button', { name: 'Play voice message' })).toBeInTheDocument();
    void container;
  });

  it('only one plays at a time: starting a second silences the first', () => {
    render(
      <>
        <MessageBubble message={voiceMsg('va', 'na')} mine={false} />
        <MessageBubble message={voiceMsg('vb', 'nb')} mine={false} />
      </>,
    );
    const [first, second] = screen.getAllByRole('button', { name: 'Play voice message' });
    fireEvent.click(first!);
    expect(screen.getAllByRole('button', { name: 'Pause voice message' })).toHaveLength(1);
    fireEvent.click(second!);
    // The first went back to "play" by itself; exactly one is playing.
    expect(screen.getAllByRole('button', { name: 'Pause voice message' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Play voice message' })).toHaveLength(1);
    expect(
      screen.getAllByRole('button', { name: 'Pause voice message' })[0]!.parentElement!
        .querySelector('audio')!.getAttribute('src'),
    ).toBe('https://files.test/nb.webm');
  });

  it('offers a 1× / 1.5× / 2× speed pill only while it plays, and applies the speed', () => {
    const { container } = render(<MessageBubble message={voiceMsg('v2', 'n2')} mine={false} />);
    expect(screen.queryByRole('button', { name: /^Speed/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Play voice message' }));
    const audio = container.querySelector('audio')!;
    const pill = () => screen.getByRole('button', { name: /^Speed/ });
    expect(pill().textContent).toBe('1×');
    fireEvent.click(pill());
    expect(pill().textContent).toBe('1.5×');
    expect(audio.playbackRate).toBe(1.5);
    fireEvent.click(pill());
    expect(pill().textContent).toBe('2×');
    expect(audio.playbackRate).toBe(2);
    fireEvent.click(pill());
    expect(pill().textContent).toBe('1×');
    expect(audio.playbackRate).toBe(1);
  });

  it('turns the mic blue on a received note once it has been played, and not on mine', () => {
    const theirs = render(<MessageBubble message={voiceMsg('v3', 'n3')} mine={false} />);
    const mic = () => theirs.container.querySelector<HTMLElement>('[data-testid="voice-mic"]')!;
    expect(mic().getAttribute('data-played')).toBe('false');
    expect(mic().className).not.toContain('text-wa-tick-read');
    fireEvent.click(screen.getByRole('button', { name: 'Play voice message' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pause voice message' }));
    expect(mic().getAttribute('data-played')).toBe('true');
    expect(mic().className).toContain('text-wa-tick-read');
    theirs.unmount();

    const mine = render(<MessageBubble message={voiceMsg('v4', 'n4', true)} mine />);
    fireEvent.click(screen.getByRole('button', { name: 'Play voice message' }));
    // While it plays the speed pill takes the avatar's place.
    fireEvent.click(screen.getByRole('button', { name: 'Pause voice message' }));
    const myMic = mine.container.querySelector<HTMLElement>('[data-testid="voice-mic"]')!;
    expect(myMic.className).not.toContain('text-wa-tick-read');
  });

  it('remembers a played note across a re-draw this session', () => {
    const first = render(<MessageBubble message={voiceMsg('v5', 'n5')} mine={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play voice message' }));
    first.unmount();
    const again = render(<MessageBubble message={voiceMsg('v5', 'n5')} mine={false} />);
    expect(
      again.container.querySelector('[data-testid="voice-mic"]')!.getAttribute('data-played'),
    ).toBe('true');
  });

  it('scrubs by dragging along the waveform, and carries on playing from there', () => {
    const { container } = render(<MessageBubble message={voiceMsg('v6', 'n6')} mine={false} />);
    const audio = container.querySelector('audio')!;
    const wave = container.querySelector<HTMLElement>('[data-no-swipe] > div[aria-hidden]')!;
    wave.getBoundingClientRect = () =>
      ({ left: 100, width: 200, top: 0, right: 300, bottom: 20, height: 20, x: 100, y: 0 }) as DOMRect;

    fireEvent.click(screen.getByRole('button', { name: 'Play voice message' }));
    fireEvent.pointerDown(wave, { pointerId: 1, clientX: 200 }); // halfway
    expect(audio.currentTime).toBe(5);
    fireEvent.pointerMove(wave, { pointerId: 1, clientX: 280 }); // 90%
    expect(audio.currentTime).toBe(9);
    fireEvent.pointerMove(wave, { pointerId: 1, clientX: 50 }); // dragged off the left end
    expect(audio.currentTime).toBe(0);
    fireEvent.pointerUp(wave, { pointerId: 1, clientX: 150 });
    expect(audio.currentTime).toBe(2.5);
    // It was playing when the finger went down, so it plays on.
    expect(screen.getByRole('button', { name: 'Pause voice message' })).toBeInTheDocument();
  });

  describe('what the note says', () => {
    const spoken = (transcript?: string, mine = false) =>
      makeMessage({
        id: 'vt',
        senderId: mine ? 'me' : 'x',
        senderName: mine ? 'Ramesh' : 'MDG',
        body: undefined,
        attachments: [note('nt', { transcript })],
      });
    const LONG =
      'Bhai diesel ka tanker kal subah aana tha lekin abhi tak nahi aaya, tanki mein sirf ' +
      'do hazaar litre bacha hai aur aaj ki bikri ke liye bhi kam padega, kripya jaldi bataiye ' +
      'ki tanker kab tak pahunchega.';

    it('shows it under the player with a small label, once MDG has written it down', () => {
      render(<MessageBubble message={spoken('tanki mein diesel kam hai', true)} mine />);
      const block = screen.getByTestId('voice-transcript');
      expect(within(block).getByText('Transcript')).toBeInTheDocument();
      expect(within(block).getByText('tanki mein diesel kam hai')).toBeInTheDocument();
      // Under the player, not inside it.
      const player = screen.getByRole('button', { name: 'Play voice message' });
      expect(
        player.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      // Small and muted, never the bubble's own text size or colour.
      expect(block.className).toContain('text-wa-meta');
      // A short one has nothing to open.
      expect(within(block).queryByRole('button')).toBeNull();
    });

    it('is labelled in Hindi on the Hindi screen', () => {
      useLangStore.setState({ lang: 'hi', explicit: false });
      render(<MessageBubble message={spoken('diesel kam hai')} mine={false} />);
      expect(within(screen.getByTestId('voice-transcript')).getByText('लिखा हुआ')).toBeInTheDocument();
      useLangStore.setState({ lang: 'en', explicit: false });
    });

    it('is not there before the words are saved, or when they are empty', () => {
      const first = render(<MessageBubble message={spoken(undefined)} mine={false} />);
      expect(screen.queryByTestId('voice-transcript')).toBeNull();
      first.unmount();
      render(<MessageBubble message={spoken('   ')} mine={false} />);
      expect(screen.queryByTestId('voice-transcript')).toBeNull();
    });

    it('draws the words as plain text, never as markup', () => {
      render(<MessageBubble message={spoken('<b>bold</b> & <script>x()</script>')} mine={false} />);
      const block = screen.getByTestId('voice-transcript');
      expect(block.querySelector('b, script')).toBeNull();
      expect(block).toHaveTextContent('<b>bold</b> & <script>x()</script>');
    });

    it('a long one shows its first lines and opens and closes with a tap', () => {
      render(<MessageBubble message={spoken(LONG)} mine={false} />);
      const block = screen.getByTestId('voice-transcript');
      const words = within(block).getByText(LONG);
      expect(words.className).toContain('line-clamp-3');
      const more = within(block).getByRole('button', { name: 'Show more' });
      expect(more).toHaveAttribute('aria-expanded', 'false');
      fireEvent.click(more);
      expect(words.className).not.toContain('line-clamp-3');
      const less = within(block).getByRole('button', { name: 'Show less' });
      expect(less).toHaveAttribute('aria-expanded', 'true');
      fireEvent.click(less);
      expect(words.className).toContain('line-clamp-3');
    });

    it('its link keeps the swipe-to-reply gesture and the long press off', () => {
      const onLongPress = vi.fn();
      render(<MessageBubble message={spoken(LONG)} mine={false} onLongPress={onLongPress} />);
      const more = screen.getByRole('button', { name: 'Show more' });
      expect(more).toHaveAttribute('data-no-swipe');
    });

    it('sits under each voice note of a message that has two', () => {
      render(
        <MessageBubble
          message={makeMessage({
            id: 'two',
            senderId: 'x',
            body: undefined,
            attachments: [note('a', { transcript: 'pehla' }), note('b'), note('c', { transcript: 'teesra' })],
          })}
          mine={false}
        />,
      );
      expect(screen.getAllByTestId('voice-transcript').map((e) => e.textContent)).toEqual([
        'Transcriptpehla',
        'Transcriptteesra',
      ]);
      expect(screen.getAllByRole('button', { name: 'Play voice message' })).toHaveLength(3);
    });
  });

  it('keeps the swipe-to-reply gesture off the scrubber', () => {
    const { container } = render(<MessageBubble message={voiceMsg('v7', 'n7')} mine={false} />);
    expect(container.querySelector('[data-no-swipe] > div[aria-hidden]')).toBeTruthy();
  });

  /**
   * A NOTE THIS PHONE CANNOT PLAY IS NOT A STALE LINK. An older iPhone has no
   * player for the WebM an Android phone records. "Tap to try again" fetched a
   * fresh link, failed the same way, and offered to do it again — forever, on 2G.
   */
  describe('a recording this phone has no player for', () => {
    const PHONE_CANNOT = "This phone can't play this voice note.";
    let canPlay: string;

    beforeEach(() => {
      canPlay = '';
      vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation(() => canPlay);
    });

    const real = (key = 'u1') =>
      makeMessage({
        id: 'm-real',
        conversationId: 'c1',
        senderId: 'x',
        senderName: 'MDG',
        body: undefined,
        attachments: [note(key)],
      });

    it('says so, in words, the moment the player errors — and does not fetch a fresh link', () => {
      const { container } = render(<MessageBubble message={real()} mine={false} />);
      fireEvent.error(container.querySelector('audio')!);
      expect(screen.getByText(PHONE_CANNOT)).toBeInTheDocument();
      expect(screen.queryByText("Couldn't play. Tap to try again")).toBeNull();
      expect(h.fresh).not.toHaveBeenCalled();
    });

    it('does not loop: tapping play again changes nothing and asks for no link', () => {
      const play = vi.mocked(HTMLMediaElement.prototype.play);
      const { container } = render(<MessageBubble message={real()} mine={false} />);
      fireEvent.error(container.querySelector('audio')!);
      play.mockClear();
      fireEvent.click(screen.getByRole('button', { name: 'Play voice message' }));
      fireEvent.click(screen.getByRole('button', { name: 'Play voice message' }));
      expect(h.fresh).not.toHaveBeenCalled();
      expect(play).not.toHaveBeenCalled();
      expect(screen.getByText(PHONE_CANNOT)).toBeInTheDocument();
    });

    it('also reads a refused play() that way', async () => {
      vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(
        new DOMException('not supported', 'NotSupportedError'),
      );
      render(<MessageBubble message={real()} mine={false} />);
      fireEvent.click(screen.getByRole('button', { name: 'Play voice message' }));
      expect(await screen.findByText(PHONE_CANNOT)).toBeInTheDocument();
      expect(h.fresh).not.toHaveBeenCalled();
    });

    it('leaves the transcript under the bubble, which is all the dealer can use', () => {
      const msg = makeMessage({
        id: 'm-real',
        conversationId: 'c1',
        senderId: 'x',
        body: undefined,
        attachments: [note('u2', { transcript: 'tanki mein diesel kam hai' })],
      });
      const { container } = render(<MessageBubble message={msg} mine={false} />);
      fireEvent.error(container.querySelector('audio')!);
      expect(screen.getByText(PHONE_CANNOT)).toBeInTheDocument();
      expect(screen.getByText('tanki mein diesel kam hai')).toBeInTheDocument();
    });

    it('says it in Hindi', () => {
      useLangStore.setState({ lang: 'hi', explicit: false });
      const { container } = render(<MessageBubble message={real()} mine={false} />);
      fireEvent.error(container.querySelector('audio')!);
      expect(screen.getByText('यह फ़ोन यह वॉइस मैसेज नहीं चला सकता।')).toBeInTheDocument();
    });

    // The ordinary stale link is unchanged: one fresh link, then the old words.
    it('a phone that CAN play it still gets one fresh link, and then the old "try again"', async () => {
      canPlay = 'maybe';
      h.fresh.mockResolvedValue('https://files.test/fresh.webm');
      const { container } = render(<MessageBubble message={real()} mine={false} />);
      fireEvent.error(container.querySelector('audio')!);
      await waitFor(() => expect(h.fresh).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(container.querySelector('audio')).toHaveAttribute('src', 'https://files.test/fresh.webm'),
      );

      fireEvent.error(container.querySelector('audio')!);
      expect(await screen.findByText("Couldn't play. Tap to try again")).toBeInTheDocument();
      expect(screen.queryByText(PHONE_CANNOT)).toBeNull();
      expect(h.fresh).toHaveBeenCalledTimes(1);
    });

    it('never calls a note unplayable that merely has no type on it', () => {
      const msg = makeMessage({
        id: 'm-real',
        conversationId: 'c1',
        senderId: 'x',
        body: undefined,
        attachments: [note('u3', { contentType: '' })],
      });
      h.fresh.mockResolvedValue('https://files.test/fresh.webm');
      const { container } = render(<MessageBubble message={msg} mine={false} />);
      fireEvent.error(container.querySelector('audio')!);
      expect(screen.queryByText(PHONE_CANNOT)).toBeNull();
    });
  });

  it('a note just recorded plays from the phone\'s own copy straight away', () => {
    const { container } = render(
      <MessageBubble
        message={makeMessage({
          id: 'temp-2-2',
          senderId: 'me',
          body: undefined,
          attachments: [note('local:temp-2-2:0', { url: 'blob:local-note' })],
        })}
        mine
        currentUserId="me"
      />,
    );
    expect(container.querySelector('audio')).toHaveAttribute('src', 'blob:local-note');
    expect(container.querySelector('.lucide-file-text')).toBeNull();
  });
});

describe('MessageBubble — documents', () => {
  const doc = (name: string, type: string, over: Partial<Attachment> = {}): Attachment => ({
    storageKey: `k-${name}`,
    filename: name,
    contentType: type,
    size: 1_258_291,
    kind: 'file',
    url: `https://files.test/${name}`,
    ...over,
  });

  it.each([
    ['rate-list.pdf', 'application/pdf', 'PDF', 'bg-danger'],
    ['letter.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'DOC', 'bg-info'],
    ['stock.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'XLS', 'bg-success'],
    ['notes.txt', 'text/plain', 'TXT', 'bg-neutral'],
  ])('%s gets a %s badge', (name, type, label, tone) => {
    const { container } = render(
      <MessageBubble
        message={makeMessage({ senderId: 'x', body: undefined, attachments: [doc(name, type)] })}
        mine={false}
      />,
    );
    const badge = container.querySelector('span[aria-hidden].rounded-lg')!;
    expect(badge.textContent).toBe(label);
    expect(badge.className).toContain(tone);
    expect(screen.getByText(name)).toBeInTheDocument();
  });

  it('names the type and the size under the filename', () => {
    renderBubble(
      makeMessage({ body: undefined, attachments: [doc('rate-list.pdf', 'application/pdf')] }),
    );
    expect(screen.getByText(/PDF · 1\.2 MB/)).toBeInTheDocument();
  });

  it('shows a long filename over at most two lines', () => {
    renderBubble(
      makeMessage({
        body: undefined,
        attachments: [doc('a-very-long-file-name-that-keeps-going.pdf', 'application/pdf')],
      }),
    );
    expect(screen.getByText('a-very-long-file-name-that-keeps-going.pdf').className).toContain(
      'line-clamp-2',
    );
  });

  it('downloads on tap, through the message', () => {
    const attachment = doc('rate-list.pdf', 'application/pdf');
    renderBubble(makeMessage({ id: 'm-doc', body: undefined, attachments: [attachment] }));
    fireEvent.click(screen.getByRole('button', { name: /rate-list\.pdf/ }));
    expect(h.download).toHaveBeenCalledWith(attachment, {
      conversationId: 'c1',
      messageId: 'm-doc',
    });
  });

  it('cannot be downloaded while it is still being sent', () => {
    renderBubble(
      makeMessage({
        id: 'temp-3-3',
        body: undefined,
        attachments: [doc('rate-list.pdf', 'application/pdf', { url: undefined })],
      }),
    );
    expect(screen.getByRole('button', { name: /rate-list\.pdf/ })).toBeDisabled();
  });

  it('puts the time on its own line under the document when there is no caption', () => {
    const { container } = renderBubble(
      makeMessage({ body: undefined, attachments: [doc('rate-list.pdf', 'application/pdf')] }),
    );
    expect(container.querySelector('.justify-between')).toBeTruthy();
  });
});

/**
 * The AI first line, from the dealer's side.
 *
 * Everything asserted here is progressive enhancement over one optional field.
 * The backend can ship, and run a whole shadow week, before any dealer's app is
 * updated — an app that has never heard of `ai` ignores the key and draws an
 * ordinary Support bubble, which is correct and merely unlabelled. So the tests
 * that matter most are the two negative ones: no field, no footnote, no button,
 * and nothing else moved.
 */
describe('MessageBubble — a reply the first line wrote', () => {
  /** Exactly the block run.ts attaches to an answer it posted. */
  const aiAnswer = {
    turnId: 'turn-1',
    kind: 'answer' as const,
    intent: 'dsr_status' as const,
    templateId: 'dsr.shared',
  };

  interface AiBlock {
    turnId: string;
    /** `'written'` is v2's: prose the writer composed and the fence passed. */
    kind: 'answer' | 'written' | 'handoff' | 'reshare';
    intent: string;
    templateId: string;
    ticketId?: string;
  }

  /** An AI message is an ADMIN message: same sender role, same side, same colour. */
  function aiMessage(ai: AiBlock = aiAnswer) {
    return makeMessage({
      id: 'ai-1',
      senderId: 'system-user',
      senderRole: 'admin',
      senderName: 'MDG',
      body: 'Aaj ki DSR bhej di gayi hai.',
      ai,
    });
  }

  it('marks the reply as instant, and leaves the bubble itself alone', () => {
    const { container } = render(
      <MessageBubble message={aiMessage()} mine={false} currentUserId="me" />,
    );
    expect(screen.getByText('Instant reply')).toBeInTheDocument();
    // Not a badge, not a colour change: the bubble is the same incoming bubble a
    // person's reply gets, because a dealer should not have to care which desk
    // answered.
    expect(container.querySelector('.bg-wa-in')).toBeTruthy();
    expect(container.querySelector('.bg-wa-out')).toBeFalsy();
  });

  it('says nothing at all on an ordinary Support reply', () => {
    render(
      <MessageBubble
        message={makeMessage({
          id: 'human-1',
          senderId: 'admin-7',
          senderRole: 'admin',
          body: 'Ji, dekh kar batata hoon.',
        })}
        mine={false}
        currentUserId="me"
      />,
    );
    expect(screen.queryByText('Instant reply')).toBeNull();
  });

  it('puts no button under the answer — there is no way to ask for a person', () => {
    // The only way a thread reaches a person is a ticket the first line raises
    // itself, so nothing under an answer may offer one.
    const { container } = render(
      <MessageBubble message={aiMessage()} mine={false} currentUserId="me" />,
    );
    expect(container.querySelectorAll('button').length).toBe(0);
    expect(screen.queryByText(/talk to a person/i)).toBeNull();
    expect(screen.queryByText(/someone from mdg is coming/i)).toBeNull();
  });

  it('puts no button under the handoff line either', () => {
    const { container } = render(
      <MessageBubble
        message={aiMessage({ ...aiAnswer, kind: 'handoff' })}
        mine={false}
        currentUserId="me"
      />,
    );
    // AND NO "Instant reply" FOOTNOTE. This assertion used to require the
    // opposite, and the owner caught it in production: the handoff bubble read
    // "I've passed it to the MDG team" with a lightning bolt under it saying the
    // machine had answered instantly. It is the one line a dealer reads while
    // already unsatisfied, and it was the one place the product looked pleased
    // with itself. The old expectation was the bug, written down.
    expect(screen.queryByText('Instant reply')).toBeNull();
    expect(container.querySelectorAll('button').length).toBe(0);
  });

  it('labels a re-sent report too — it is still the machine that answered', () => {
    render(
      <MessageBubble
        message={aiMessage({ ...aiAnswer, kind: 'reshare' })}
        mine={false}
        currentUserId="me"
      />,
    );
    expect(screen.getByText('Instant reply')).toBeInTheDocument();
  });

  /**
   * v2: the reply is written, not chosen from a list of about thirty sentences.
   *
   * Three things changed underneath this bubble and none of them may change the
   * bubble: it is longer (two or three sentences, and Hindi runs about 35%
   * longer than English again), it can carry ONE newline — the `partial` line
   * code appends after the prose — and it arrives under a new `kind`. The
   * bubble has no fixed height, no line clamp and `whitespace-pre-wrap`, so all
   * three are already handled; these tests are here to keep it that way.
   */
  it('labels prose the writer composed', () => {
    render(
      <MessageBubble
        message={aiMessage({ ...aiAnswer, kind: 'written' })}
        mine={false}
        currentUserId="me"
      />,
    );
    expect(screen.getByText('Instant reply')).toBeInTheDocument();
  });

  it('draws a long Hindi reply whole, and keeps the appended line', () => {
    // 300 characters is the fence's Hindi ceiling, and the last line is
    // `partial.rest_to_team` — appended by the backend AFTER the prose, by code,
    // so the model cannot soften or drop it. If the bubble ever clamps or
    // truncates, that is the line that disappears.
    const prose =
      'कल की रिपोर्ट बन गई है और MDG उसे देख रहा है। आपकी तरफ़ से डेंसिटी रजिस्टर का कल ' +
      'वाला पन्ना अभी बाकी है — वो भेज दीजिए।';
    const appended = 'बाक़ी बात MDG की टीम को भेज दी है — कोई यहीं जवाब देगा।';
    const { container } = render(
      <MessageBubble
        message={makeMessage({
          id: 'ai-long',
          senderId: 'system-user',
          senderRole: 'admin',
          body: `${prose}\n${appended}`,
          ai: { ...aiAnswer, kind: 'written' },
        })}
        mine={false}
        currentUserId="me"
      />,
    );
    const bubble = container.querySelector('.whitespace-pre-wrap');
    expect(bubble?.textContent).toBe(`${prose}\n${appended}`);
    // No clamp, no fixed height: the two rules that would swallow the tail.
    const cls = bubble?.getAttribute('class') ?? '';
    expect(cls).not.toMatch(/line-clamp|max-h-|overflow-hidden/);
    expect(cls).toContain('break-words');
  });

  it('draws a message with no ai field exactly as it drew it yesterday', () => {
    const before = render(
      <MessageBubble
        message={makeMessage({ id: 'plain', senderId: 'u1', body: 'kal ka DSR' })}
        mine
        currentUserId="u1"
      />,
    );
    // No extra nodes, no extra buttons — the whole feature is invisible here.
    expect(before.container.querySelectorAll('button').length).toBe(0);
    expect(before.container.querySelector('.lucide-zap')).toBeFalsy();
  });
});

/**
 * The line under a bubble that raised a ticket.
 *
 * MessageList decides WHICH bubble gets one (the message names a ticket and the
 * conversation still lists it) and hands the bubble a status word and a number.
 * What is tested here is only what the bubble does with them: say it quietly,
 * in the app's language, and say nothing when it is given nothing.
 */
describe('MessageBubble — the ticket status line', () => {
  const raising = {
    turnId: 'turn-9',
    kind: 'handoff' as const,
    intent: 'talk_to_human' as const,
    templateId: 'handoff.escalated',
    ticketId: 't-42',
  };

  function raisingMessage() {
    return makeMessage({
      id: 'ai-handoff',
      senderId: 'system-user',
      senderRole: 'admin',
      senderName: 'MDG',
      body: 'Maine ye MDG team ko bhej diya hai.',
      ai: raising,
    });
  }

  it.each([
    ['raised', '#42 · Sent to the MDG team'],
    ['looking', '#42 · MDG team is looking at it'],
    ['resolved', '#42 · Closed by the MDG team'],
  ] as const)('says "%s" in plain words, prefixed with the ticket ref', (status, text) => {
    render(
      <MessageBubble
        message={raisingMessage()}
        mine={false}
        currentUserId="me"
        ticketStatus={status}
        ticketNumber={42}
      />,
    );
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('speaks Hindi on the Hindi screen', () => {
    useLangStore.setState({ lang: 'hi', explicit: true });
    render(
      <MessageBubble
        message={raisingMessage()}
        mine={false}
        currentUserId="me"
        ticketStatus="looking"
        ticketNumber={42}
      />,
    );
    expect(screen.getByText('#42 · MDG टीम देख रही है')).toBeInTheDocument();
  });

  it('draws nothing when the bubble is not handed a status', () => {
    // The message names a ticket but the conversation no longer lists it — a
    // resolved ticket past the server's seven-day window. The line is simply
    // gone; the message that raised it is not.
    const { container } = render(
      <MessageBubble message={raisingMessage()} mine={false} currentUserId="me" />,
    );
    expect(screen.getByText('Maine ye MDG team ko bhej diya hai.')).toBeInTheDocument();
    expect(container.textContent).not.toContain('#');
    expect(container.textContent).not.toContain('MDG team is looking');
  });

  it('draws nothing on an ordinary message', () => {
    const { container } = render(
      <MessageBubble
        message={makeMessage({ id: 'plain', senderId: 'u1', body: 'kal ka DSR' })}
        mine
        currentUserId="u1"
      />,
    );
    expect(container.textContent).not.toContain('#');
  });

  it('is a quiet line, not a button and not green', () => {
    const { container } = render(
      <MessageBubble
        message={raisingMessage()}
        mine={false}
        currentUserId="me"
        ticketStatus="resolved"
        ticketNumber={42}
      />,
    );
    const line = screen.getByText('#42 · Closed by the MDG team');
    expect(line.closest('button')).toBeNull();
    expect(container.querySelectorAll('button').length).toBe(0);
    // Same size and colour as the time inside the bubble above it.
    const cls = line.getAttribute('class') ?? '';
    expect(cls).toContain('text-[11px]');
    expect(cls).toContain('text-wa-meta');
    expect(cls).not.toMatch(/green|success|accent|badge/);
  });

  it('sits with the footnote under a handoff, and still says no "Instant reply"', () => {
    render(
      <MessageBubble
        message={raisingMessage()}
        mine={false}
        currentUserId="me"
        ticketStatus="raised"
        ticketNumber={7}
      />,
    );
    expect(screen.getByText('#7 · Sent to the MDG team')).toBeInTheDocument();
    expect(screen.queryByText('Instant reply')).toBeNull();
  });

  it('follows the ticket when its state changes under an already-drawn bubble', () => {
    // The bubble is React.memo'd, so this is the proof that new primitives are
    // enough to re-render it — no object identity involved.
    const message = raisingMessage();
    const view = render(
      <MessageBubble
        message={message}
        mine={false}
        currentUserId="me"
        ticketStatus="raised"
        ticketNumber={42}
      />,
    );
    expect(screen.getByText('#42 · Sent to the MDG team')).toBeInTheDocument();

    view.rerender(
      <MessageBubble
        message={message}
        mine={false}
        currentUserId="me"
        ticketStatus="looking"
        ticketNumber={42}
      />,
    );
    expect(screen.queryByText('#42 · Sent to the MDG team')).toBeNull();
    expect(screen.getByText('#42 · MDG team is looking at it')).toBeInTheDocument();

    view.rerender(
      <MessageBubble
        message={message}
        mine={false}
        currentUserId="me"
        ticketStatus="resolved"
        ticketNumber={42}
      />,
    );
    expect(screen.getByText('#42 · Closed by the MDG team')).toBeInTheDocument();
  });
});

/**
 * ASKS LIVE IN THE CHAT (ADR 0019). A request MDG posts is an MDG bubble that
 * carries `ask`: its title and day on a light inset, and under the words the
 * button that answers it — or what has become of the answer.
 */
describe('MessageBubble — a request MDG posted', () => {
  // Unmount before the shared teardown resets the language store, or the bubble
  // re-renders outside `act`.
  afterEach(() => cleanup());

  const REQUEST = {
    ref: 'doc:ask1',
    kind: 'document' as const,
    title: 'Fire NOC',
    periodLabel: '12 Oct',
  };

  function ask(
    phase: AskPhase | undefined,
    over: {
      ask?: Partial<typeof REQUEST> & { acceptsFile?: boolean };
      reason?: string;
      onAnswer?: ReturnType<typeof vi.fn>;
      onRetry?: ReturnType<typeof vi.fn>;
    } = {},
  ) {
    const message = makeMessage({
      id: 'ask-msg',
      senderId: 'system-user',
      senderRole: 'admin',
      senderName: 'MDG',
      system: true,
      body: 'MDG needs your Fire NOC.\nTap Send photo.',
      ask: { ...REQUEST, ...over.ask },
    });
    const utils = render(
      <MessageBubble
        message={message}
        mine={false}
        askPhase={phase}
        askReason={over.reason}
        onAskAnswer={over.onAnswer}
        onAskRetry={over.onRetry}
      />,
    );
    return { message, ...utils };
  }

  it('draws the title and the day on a light inset, above the words', () => {
    const { container } = ask('open');
    const inset = container.querySelector('[data-ask-ref="doc:ask1"]')!;
    expect(inset).toBeTruthy();
    expect(inset.textContent).toContain('Fire NOC');
    expect(inset.textContent).toContain('12 Oct');
    expect(inset.className).toContain('bg-wa-row-active');
    // The words are still the message's own.
    expect(screen.getByText(/MDG needs your Fire NOC\./)).toBeInTheDocument();
    // Above them in the bubble.
    const words = screen.getByText(/MDG needs your Fire NOC\./);
    expect(inset.compareDocumentPosition(words) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('a request with no day draws only its title', () => {
    const { container } = ask('open', { ask: { periodLabel: undefined } });
    const inset = container.querySelector('[data-ask-ref]')!;
    expect(inset.querySelectorAll('p')).toHaveLength(1);
  });

  describe('open', () => {
    it('is a full-width, 44px, black Send photo button — in the brand token, no green', () => {
      ask('open');
      const button = screen.getByRole('button', { name: 'Send photo' });
      expect(button.className).toContain('w-full');
      expect(button.className).toContain('h-11');
      expect(button.className).toContain('bg-wa-accent');
      expect(button.className).not.toMatch(/green|emerald|brand\b/);
      // The icon is Lucide's, not the emoji character.
      expect(button.querySelector('.lucide-camera')).toBeTruthy();
      expect(button.textContent).not.toContain('📷');
    });

    it('tapping it hands the message and "camera" up, once', () => {
      const onAnswer = vi.fn();
      const { message } = ask('open', { onAnswer });
      fireEvent.click(screen.getByRole('button', { name: 'Send photo' }));
      expect(onAnswer).toHaveBeenCalledTimes(1);
      expect(onAnswer).toHaveBeenCalledWith(message, 'camera');
    });

    it('offers "Choose file" only when a PDF is as good as a photo', () => {
      const onAnswer = vi.fn();
      const { unmount } = ask('open', { onAnswer });
      expect(screen.queryByRole('button', { name: 'Choose file' })).toBeNull();
      unmount();

      const second = vi.fn();
      const withFile = ask('open', { ask: { acceptsFile: true }, onAnswer: second });
      fireEvent.click(screen.getByRole('button', { name: 'Choose file' }));
      expect(second).toHaveBeenCalledWith(withFile.message, 'files');
      expect(onAnswer).not.toHaveBeenCalled();
      // A paper takes the files, which already include the photos: no third door.
      expect(screen.queryByRole('button', { name: 'Choose from gallery' })).toBeNull();
    });

    it('a request that takes only a photo gets a gallery button under the camera one', () => {
      const onAnswer = vi.fn();
      const { message } = ask('open', { onAnswer });
      expect(screen.queryByRole('button', { name: 'Choose file' })).toBeNull();
      const gallery = screen.getByRole('button', { name: 'Choose from gallery' });
      // Below Send photo, and not the black primary one.
      const send = screen.getByRole('button', { name: 'Send photo' });
      expect(send.compareDocumentPosition(gallery) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(gallery.className).not.toContain('bg-wa-accent');
      fireEvent.click(gallery);
      expect(onAnswer).toHaveBeenCalledTimes(1);
      expect(onAnswer).toHaveBeenCalledWith(message, 'gallery');
    });

    // An iPhone has no gallery; what it has is called Photos. Same door, same action.
    it('on an iPhone the same button says "Choose from Photos"', () => {
      (window as unknown as { __DK_NATIVE_PLATFORM__?: string }).__DK_NATIVE_PLATFORM__ = 'ios';
      try {
        const onAnswer = vi.fn();
        const { message } = ask('open', { onAnswer });
        expect(screen.queryByRole('button', { name: 'Choose from gallery' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Choose from Photos' }));
        expect(onAnswer).toHaveBeenCalledWith(message, 'gallery');
      } finally {
        delete (window as unknown as { __DK_NATIVE_PLATFORM__?: string }).__DK_NATIVE_PLATFORM__;
      }
    });

    it('says it in Hindi on an iPhone', () => {
      useLangStore.setState({ lang: 'hi', explicit: false });
      (window as unknown as { __DK_NATIVE_PLATFORM__?: string }).__DK_NATIVE_PLATFORM__ = 'ios';
      try {
        ask('open');
        expect(screen.getByRole('button', { name: 'फ़ोटो से चुनें' })).toBeInTheDocument();
      } finally {
        delete (window as unknown as { __DK_NATIVE_PLATFORM__?: string }).__DK_NATIVE_PLATFORM__;
      }
    });

    it('shows MDG\'s reason, verbatim, above the button when it sent an answer back', () => {
      ask('open', { reason: 'The photo is blurred — retake it' });
      expect(screen.getByText(/MDG sent it back/)).toBeInTheDocument();
      expect(screen.getByText(/The photo is blurred — retake it/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Send photo' })).toBeInTheDocument();
    });

    it('has no reason line on a first ask', () => {
      ask('open');
      expect(screen.queryByText(/MDG sent it back/)).toBeNull();
    });
  });

  describe('after the dealer has answered', () => {
    it('sent → "Sent — MDG is checking", and no button to press twice', () => {
      ask('sent');
      expect(screen.getByText('Sent — MDG is checking')).toBeInTheDocument();
      expect(screen.queryByRole('button')).toBeNull();
    });

    it('received → "Received", and no button', () => {
      ask('received');
      expect(screen.getByText('Received')).toBeInTheDocument();
      expect(screen.queryByRole('button')).toBeNull();
    });

    it('closed (or unknown) → only the title and day', () => {
      const { container } = ask('none');
      expect(screen.queryByRole('button')).toBeNull();
      expect(screen.queryByText('Received')).toBeNull();
      expect(screen.queryByText('Sent — MDG is checking')).toBeNull();
      expect(container.querySelector('[data-ask-ref]')).toBeTruthy();
    });

    it('a message that was drawn before its state is known draws no footer', () => {
      ask(undefined);
      expect(screen.queryByRole('button')).toBeNull();
    });
  });

  describe('where it stands could not be checked', () => {
    it('says so and offers Try again — it is never drawn as "nothing to do"', () => {
      const onRetry = vi.fn();
      ask('failed', { onRetry });
      expect(screen.getByText("Couldn't check this just now")).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Send photo' })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(onRetry).toHaveBeenCalledTimes(1);
    });
  });

  it('speaks Hindi when the app is in Hindi', () => {
    useLangStore.setState({ lang: 'hi', explicit: true });
    ask('open', { ask: { acceptsFile: true } });
    // The spelling MDG's own message uses ("फ़ोटो भेजें", with the dot).
    expect(screen.getByRole('button', { name: 'फ़ोटो भेजें' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'फ़ाइल चुनें' })).toBeInTheDocument();
  });

  it('speaks Hindi on the gallery button of a photo-only request', () => {
    useLangStore.setState({ lang: 'hi', explicit: true });
    ask('open');
    expect(screen.getByRole('button', { name: 'गैलरी से चुनें' })).toBeInTheDocument();
  });

  it('keeps the time on a line of its own, clear of the button', () => {
    const { container } = ask('open');
    // Pinned to a corner it would sit on top of the full-width button.
    expect(container.querySelector('.absolute.bottom-\\[5px\\]')).toBeNull();
  });

  it('is as wide as a picture, so the button is worth pressing', () => {
    const { container } = ask('open');
    const column = container.firstElementChild!.firstElementChild as HTMLElement;
    expect(column.className).toContain('w-[min(80%,330px)]');
  });

  it('draws nothing of the kind on an ordinary message, even if told a phase', () => {
    const { container } = render(
      <MessageBubble
        message={makeMessage({ body: 'plain' })}
        mine={false}
        askPhase="open"
      />,
    );
    expect(container.querySelector('[data-ask-ref]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send photo' })).toBeNull();
  });
});
