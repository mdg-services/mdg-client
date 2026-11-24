import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useLangStore } from '@/store/lang';
import { makeMessage } from '@/test/utils';

import { MessageBubble } from './MessageBubble';

beforeEach(() => {
  useLangStore.setState({ lang: 'hi', explicit: true });
});
afterEach(cleanup);

/** MDG's tanker question at 12E (24 Nov 2026), now with its answers as buttons. */
const question = () =>
  makeMessage({
    id: 'q1',
    senderId: 'mdg',
    senderRole: 'admin',
    body: 'आपका अपना टैंकर है, या लोड किराए की गाड़ी से आता है?',
    replyChoices: {
      key: 'owns_tanker',
      options: [
        { value: 'yes', label: { hi: 'अपना टैंकर है', hl: 'Apna tanker hai', en: 'We have our own tanker' } },
        { value: 'no', label: { hi: 'किराए की गाड़ी', hl: 'Kiraye ki gaadi', en: 'Hired tanker' } },
      ],
    },
  });

describe('answer buttons under an MDG question', () => {
  it("shows the answers in the reader's language, and a tap sends those words once", () => {
    const onChoice = vi.fn();
    render(<MessageBubble message={question()} mine={false} first choicesLive onChoice={onChoice} />);
    fireEvent.click(screen.getByRole('button', { name: 'किराए की गाड़ी' }));
    fireEvent.click(screen.getByRole('button', { name: 'अपना टैंकर है' }));
    expect(onChoice).toHaveBeenCalledTimes(1);
    expect(onChoice).toHaveBeenCalledWith('किराए की गाड़ी');
  });

  it('is gone once the question is no longer the newest message', () => {
    render(<MessageBubble message={question()} mine={false} first choicesLive={false} onChoice={vi.fn()} />);
    expect(screen.queryByTestId('reply-choices')).toBeNull();
  });

  it('speaks Hinglish to a Hinglish reader', () => {
    useLangStore.setState({ lang: 'hl', explicit: true });
    render(<MessageBubble message={question()} mine={false} first choicesLive onChoice={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Kiraye ki gaadi' })).toBeInTheDocument();
  });
});
