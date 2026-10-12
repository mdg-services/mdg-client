import { fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useLangStore } from '@/store/lang';
import { makeMessage } from '@/test/utils';
import type { Attachment, MessageReaction } from '@dk/shared/types';

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

describe('MessageBubble system notices', () => {
  // Exactly the shape dsr-report/share.ts posts: a `system: true` message whose
  // body ends "See the two images above", carrying the cards as attachments.
  const card: Attachment = {
    storageKey: 'dsr/15E/2026-08-13/variation.png',
    filename: 'dsr-variation-2026-08-13.png',
    contentType: 'image/png',
    size: 48_000,
    kind: 'image',
    url: 'https://files.example.test/dsr-variation.png',
  };

  it('renders the card image AND the body (the body used to be all of it)', () => {
    const { container } = render(
      <MessageBubble
        message={makeMessage({
          id: 'sys-1',
          system: true,
          body: 'See the two images above — Variation and Sales.',
          attachments: [card],
        })}
        mine={false}
        currentUserId="me"
      />,
    );
    expect(screen.getByAltText(card.filename)).toHaveAttribute('src', card.url);
    expect(
      screen.getByText('See the two images above — Variation and Sales.'),
    ).toBeInTheDocument();
    // The chip is a rounded box, never a 9999px pill: a bilingual notice runs
    // to a dozen lines and the pill radius cuts through its own text.
    expect(container.querySelector('p.rounded-lg')).toBeTruthy();
    expect(container.querySelector('p.rounded-full')).toBeFalsy();
  });

  it('opens the lightbox when the notice image is tapped', () => {
    const onOpenImage = vi.fn();
    render(
      <MessageBubble
        message={makeMessage({ id: 'sys-2', system: true, attachments: [card] })}
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

  it('shows no reactions and no delivery ticks — a notice is not a message you reply to', () => {
    const { container } = render(
      <MessageBubble
        message={makeMessage({
          id: 'sys-3',
          senderId: 'me',
          system: true,
          body: 'a notice',
          attachments: [card],
          reactions: [reaction()],
          deliveredTo: ['u2'],
          readBy: ['u2'],
        })}
        mine
        currentUserId="me"
      />,
    );
    expect(screen.queryByRole('button', { name: 'Reactions' })).toBeNull();
    expect(screen.queryByText('👍')).toBeNull();
    expect(
      container.querySelector('.lucide-clock, .lucide-check, .lucide-check-check'),
    ).toBeFalsy();
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
    // Not a badge, not a colour change: the bubble is the same Support bubble a
    // person's reply gets, because a dealer should not have to care which desk
    // answered.
    expect(container.querySelector('.bg-surface.text-text')).toBeTruthy();
    expect(container.querySelector('.bg-brand')).toBeFalsy();
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
    // Same size and colour as the timestamp row it hangs under.
    const cls = line.getAttribute('class') ?? '';
    expect(cls).toContain('text-[11px]');
    expect(cls).toContain('text-text-subtle');
    expect(cls).not.toMatch(/green|success/);
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
