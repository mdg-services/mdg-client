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
  it('is drawn as a card: coloured strip with its label, a bold title, then the words', () => {
    render(<MessageBubble message={announce()} mine={false} first />);

    const strip = screen.getByTestId('announcement-strip');
    expect(strip).toHaveTextContent('Nayi suvidha');
    expect(strip.className).toContain('bg-emerald-600');

    const card = screen.getByTestId('announcement-card');
    const title = within(card).getByText('TT Acknowledgement ab raat ko hum karenge');
    expect(title.className).toContain('font-bold');
    expect(card).toHaveTextContent('Excellent mark kar degi');
  });

  it('turns *stars* into bold and drops the stars', () => {
    render(<MessageBubble message={announce()} mine={false} first />);
    const bold = screen.getByText('hamari team');
    expect(bold.tagName).toBe('STRONG');
    expect(screen.getByTestId('announcement-card')).not.toHaveTextContent('*');
  });

  it('has no button for the dealer to press: they answer by writing in the chat', () => {
    render(<MessageBubble message={announce()} mine={false} first />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('uses a different colour for each tone', () => {
    const { rerender } = render(
      <MessageBubble
        message={announce({ announcement: { title: 'T', tone: 'notice' } })}
        mine={false}
      />,
    );
    expect(screen.getByTestId('announcement-strip').className).toContain('bg-sky-600');
    expect(screen.getByTestId('announcement-strip')).toHaveTextContent('Soochna');

    rerender(
      <MessageBubble
        message={announce({ announcement: { title: 'T', tone: 'important' } })}
        mine={false}
      />,
    );
    expect(screen.getByTestId('announcement-strip').className).toContain('bg-amber-500');
    expect(screen.getByTestId('announcement-strip')).toHaveTextContent('Zaroori soochna');
  });

  it('does not repeat the sender name above the strip', () => {
    render(
      <MessageBubble
        message={announce({ senderName: 'MDG System' })}
        mine={false}
        first
        showSender
      />,
    );
    expect(screen.queryByText('MDG System')).toBeNull();
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
