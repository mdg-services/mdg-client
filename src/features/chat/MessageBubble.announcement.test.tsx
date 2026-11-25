import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useLangStore } from '@/store/lang';
import { makeMessage } from '@/test/utils';

import { MessageBubble } from './MessageBubble';

beforeEach(() => {
  useLangStore.setState({ lang: 'en', explicit: false });
});
afterEach(cleanup);

const announce = (over: Partial<Parameters<typeof makeMessage>[0]> = {}) =>
  makeMessage({
    id: 'a1',
    senderId: 'mdg',
    system: true,
    body: 'Aaj se agar aap bhool gaye to *hamari team* raat ko Excellent mark kar degi.',
    announcement: { title: 'TT Acknowledgement ab raat ko hum karenge', tone: 'new' },
    ...over,
  });

describe('an MDG announcement', () => {
  it('is a plain card: a bold title, then the words — no coloured strip, no label (ADR 0055)', () => {
    render(<MessageBubble message={announce()} mine={false} first />);

    // The strip, its megaphone and its "Nayi suvidha" label made a message from the team
    // look like a broadcast.
    expect(screen.queryByTestId('announcement-strip')).toBeNull();
    expect(screen.queryByText('Nayi suvidha')).toBeNull();

    const card = screen.getByTestId('announcement-card');
    const title = within(card).getByText('TT Acknowledgement ab raat ko hum karenge');
    expect(title.className).toContain('text-subheading');
    expect(card).toHaveTextContent('Excellent mark kar degi');
  });

  it('turns *stars* into bold and drops the stars', () => {
    render(<MessageBubble message={announce()} mine={false} first />);
    const bold = screen.getByText('hamari team');
    expect(bold.tagName).toBe('STRONG');
    expect(screen.getByTestId('announcement-card')).not.toHaveTextContent('*');
  });

  it('has no button inside a bare bubble — a dealer answers an announcement by writing in the chat', () => {
    // (Outside a router there is no Today to go to, so even the report button stays away.)
    render(<MessageBubble message={announce()} mine={false} first />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it.each(['new', 'notice', 'important'] as const)(
    'looks the same whatever its tone (%s): the tone is not drawn',
    (tone) => {
      render(
        <MessageBubble
          message={announce({ announcement: { title: 'T', tone } })}
          mine={false}
        />,
      );
      expect(screen.queryByTestId('announcement-strip')).toBeNull();
      expect(screen.queryByText(/soochna|suvidha/i)).toBeNull();
      expect(screen.getByTestId('announcement-card')).toHaveTextContent('T');
    },
  );

  it('names the sender "MDG" where a sender name normally shows — never "MDG System"', () => {
    render(
      <MessageBubble
        message={announce({ senderName: 'MDG System' })}
        mine={false}
        first
        showSender
      />,
    );
    expect(screen.queryByText('MDG System')).toBeNull();
    expect(screen.getByText('MDG')).toBeInTheDocument();
  });

  it('shows no sender name at all in a chat that does not show names', () => {
    render(<MessageBubble message={announce({ senderName: 'MDG System' })} mine={false} first />);
    expect(screen.queryByText('MDG System')).toBeNull();
    expect(screen.queryByText('MDG')).toBeNull();
  });

  it('an ordinary message gets no announcement strip, and its *stars* are bold like WhatsApp', () => {
    render(
      <MessageBubble
        message={makeMessage({
          id: 'p1',
          senderId: 'u2',
          body: 'Namaste *ji*',
          announcement: undefined,
        })}
        mine={false}
      />,
    );
    expect(screen.queryByTestId('announcement-strip')).toBeNull();
    // Stars in an everyday message are the sender's own: nothing is turned bold.
    // Bold is no longer announcement-only: MDG stresses the figure that matters in
    // an ordinary message too — the KL, the day, the tanker number (owner, 14 Nov 2026).
    expect(screen.getByText('ji').tagName).toBe('STRONG');
  });
});
