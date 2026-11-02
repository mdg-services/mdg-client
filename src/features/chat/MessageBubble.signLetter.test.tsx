import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useLangStore } from '@/store/lang';
import { makeMessage } from '@/test/utils';
import type { Attachment, MessageAsk } from '@dk/shared/types';

import type { AskPhase } from './askView';
import { MessageBubble } from './MessageBubble';

// Downloads go through the message; here they are a double, as in the other
// bubble tests.
const h = vi.hoisted(() => ({ download: vi.fn(), fresh: vi.fn() }));
vi.mock('@/lib/downloadAttachment', () => ({
  useAttachmentDownload: () => h.download,
  fetchFreshInlineUrl: (...args: unknown[]) => h.fresh(...args),
}));

beforeEach(() => {
  useLangStore.setState({ lang: 'en', explicit: false });
  h.download.mockReset();
  h.fresh.mockReset();
});
// Unmount before the shared teardown resets the language store, or the bubble
// re-renders outside `act`.
afterEach(() => cleanup());

const LETTER: Attachment = {
  storageKey: 'calibration/d1/c1/letter-1.pdf',
  filename: 'request-letter.pdf',
  contentType: 'application/pdf',
  size: 40_960,
  kind: 'file',
};

const ASK: MessageAsk = {
  ref: 'doc:letter1',
  kind: 'document',
  title: 'Calibration request letter',
  periodLabel: '2026-27',
  acceptsFile: true,
  variant: 'sign-letter',
};

function letter(
  phase: AskPhase | undefined,
  over: {
    ask?: Partial<MessageAsk>;
    attachments?: Attachment[];
    id?: string;
    reason?: string;
    onAnswer?: ReturnType<typeof vi.fn>;
    onRetry?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const message = makeMessage({
    id: over.id ?? 'letter-msg',
    senderId: 'system-user',
    senderRole: 'admin',
    senderName: 'MDG',
    system: true,
    body: 'Your letter for the calibration claim is ready.',
    attachments: over.attachments ?? [LETTER],
    ask: { ...ASK, ...over.ask },
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

/** The steps' text, in the order they are drawn. */
const stepTexts = () =>
  within(screen.getByRole('list', { name: 'How to send the signed letter' }))
    .getAllByRole('listitem')
    .map((li) => li.textContent);

describe('MessageBubble — a letter to sign', () => {
  describe('open', () => {
    it('shows three short numbered steps', () => {
      letter('open');
      expect(stepTexts()).toEqual([
        '1Download the letter and print it',
        "2Sign it and put the pump's stamp",
        '3Send a photo of the signed page (or the scanned PDF)',
      ]);
    });

    it('draws the steps above the buttons', () => {
      letter('open');
      const steps = screen.getByRole('list', { name: 'How to send the signed letter' });
      for (const name of ['Download letter', 'Photo of signed letter', 'Choose file']) {
        const button = screen.getByRole('button', { name });
        expect(
          steps.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
      }
    });

    it('has three buttons, in order: Download letter, Photo of signed letter, Choose file', () => {
      const { container } = letter('open');
      const footer = container.querySelector('[data-sign-letter]') as HTMLElement;
      const names = within(footer)
        .getAllByRole('button')
        .map((b) => b.textContent);
      expect(names).toEqual(['Download letter', 'Photo of signed letter', 'Choose file']);
    });

    it('Download letter is the full-width, 44px, black one, with its own icon', () => {
      letter('open');
      const button = screen.getByRole('button', { name: 'Download letter' });
      expect(button.className).toContain('w-full');
      expect(button.className).toContain('h-11');
      expect(button.className).toContain('bg-wa-accent');
      expect(button.querySelector('.lucide-download')).toBeTruthy();
      // The other two are the quiet ones.
      expect(
        screen.getByRole('button', { name: 'Photo of signed letter' }).className,
      ).not.toContain('bg-wa-accent');
      expect(screen.getByRole('button', { name: 'Choose file' }).className).not.toContain(
        'bg-wa-accent',
      );
    });

    it("Download letter takes this message's PDF through the ordinary download, once", () => {
      const { message } = letter('open');
      fireEvent.click(screen.getByRole('button', { name: 'Download letter' }));
      expect(h.download).toHaveBeenCalledTimes(1);
      expect(h.download).toHaveBeenCalledWith(LETTER, {
        conversationId: message.conversationId,
        messageId: 'letter-msg',
      });
    });

    it('Photo of signed letter opens the camera, the same way Send photo does', () => {
      const onAnswer = vi.fn();
      const { message } = letter('open', { onAnswer });
      const button = screen.getByRole('button', { name: 'Photo of signed letter' });
      expect(button.querySelector('.lucide-camera')).toBeTruthy();
      fireEvent.click(button);
      expect(onAnswer).toHaveBeenCalledTimes(1);
      expect(onAnswer).toHaveBeenCalledWith(message, 'camera');
    });

    it('Choose file opens the files, a PDF among them', () => {
      const onAnswer = vi.fn();
      const { message } = letter('open', { onAnswer });
      fireEvent.click(screen.getByRole('button', { name: 'Choose file' }));
      expect(onAnswer).toHaveBeenCalledWith(message, 'files');
    });

    it('Choose file takes files even if the message forgot to say a PDF is welcome', () => {
      const onAnswer = vi.fn();
      const { message } = letter('open', { onAnswer, ask: { acceptsFile: undefined } });
      fireEvent.click(screen.getByRole('button', { name: 'Choose file' }));
      expect(onAnswer).toHaveBeenCalledWith(message, 'files');
    });

    it('has none of the usual request buttons', () => {
      letter('open');
      expect(screen.queryByRole('button', { name: 'Send photo' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Choose from gallery' })).toBeNull();
    });

    it('says in one quiet line what to do with no printer', () => {
      letter('open');
      const line = screen.getByText('No printer? Reply here and our team will help.');
      expect(line.className).toContain('text-wa-meta');
      expect(line.tagName).toBe('P');
    });

    it("still draws the letter as a PDF row above, and the request's title and year", () => {
      const { container } = letter('open');
      expect(screen.getByText('request-letter.pdf')).toBeInTheDocument();
      const inset = container.querySelector('[data-ask-ref="doc:letter1"]')!;
      expect(inset.textContent).toContain('Calibration request letter');
      expect(inset.textContent).toContain('2026-27');
    });

    it('draws no Download button when the message carries no PDF, but keeps the steps and the answers', () => {
      letter('open', { attachments: [] });
      expect(screen.queryByRole('button', { name: 'Download letter' })).toBeNull();
      expect(stepTexts()).toHaveLength(3);
      expect(screen.getByRole('button', { name: 'Photo of signed letter' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Choose file' })).toBeInTheDocument();
    });

    it('cannot download a letter whose message the server has not acknowledged yet', () => {
      letter('open', { id: 'temp-123' });
      const button = screen.getByRole('button', { name: 'Download letter' });
      expect(button).toBeDisabled();
      fireEvent.click(button);
      expect(h.download).not.toHaveBeenCalled();
    });

    it("shows MDG's reason, verbatim, above the steps when the signed copy was sent back", () => {
      letter('open', { reason: 'The stamp is missing — sign and stamp it again' });
      const reason = screen.getByText(/The stamp is missing/);
      expect(screen.getByText(/MDG sent it back/)).toBeInTheDocument();
      const steps = screen.getByRole('list', { name: 'How to send the signed letter' });
      expect(reason.compareDocumentPosition(steps) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Photo of signed letter' })).toBeInTheDocument();
    });

    it('has no reason line on a first ask', () => {
      letter('open');
      expect(screen.queryByText(/MDG sent it back/)).toBeNull();
    });

    it('keeps the time on a line of its own, clear of the buttons', () => {
      const { container } = letter('open');
      expect(container.querySelector('.absolute.bottom-\\[5px\\]')).toBeNull();
    });

    it('speaks Hindi when the app is in Hindi', () => {
      useLangStore.setState({ lang: 'hi', explicit: true });
      letter('open');
      expect(screen.getByRole('button', { name: 'लेटर डाउनलोड करें' })).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'साइन किए लेटर की फ़ोटो भेजें' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'फ़ाइल चुनें' })).toBeInTheDocument();
      expect(
        screen.getByText('प्रिंटर नहीं है? यहीं लिखिए, हमारी टीम मदद करेगी।'),
      ).toBeInTheDocument();
      const list = screen.getByRole('list', { name: 'साइन किया लेटर कैसे भेजें' });
      expect(within(list).getAllByRole('listitem')).toHaveLength(3);
      expect(within(list).getByText('लेटर डाउनलोड करके प्रिंट निकालिए')).toBeInTheDocument();
      expect(within(list).getByText('उस पर साइन कीजिए और पंप की मोहर लगाइए')).toBeInTheDocument();
    });
  });

  // The usual phases are the usual ones: the steps and buttons are for the
  // owner's turn only.
  describe('after the owner has answered', () => {
    it('sent → "Sent — MDG is checking", with no steps and no button to press twice', () => {
      letter('sent');
      expect(screen.getByText('Sent — MDG is checking')).toBeInTheDocument();
      expect(screen.queryByRole('list')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Photo of signed letter' })).toBeNull();
    });

    it('received → "Received", with no steps', () => {
      letter('received');
      expect(screen.getByText('Received')).toBeInTheDocument();
      expect(screen.queryByRole('list')).toBeNull();
    });

    it('closed (or not yet known) → only the title and the letter itself', () => {
      const { container } = letter('none');
      expect(container.querySelector('[data-ask-ref]')).toBeTruthy();
      expect(screen.queryByRole('list')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Download letter' })).toBeNull();
    });

    it('where it stands could not be checked → says so, with Try again', () => {
      const onRetry = vi.fn();
      letter('failed', { onRetry });
      expect(screen.getByText("Couldn't check this just now")).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('list')).toBeNull();
    });
  });
});

describe('MessageBubble — a request that is not a letter', () => {
  it('keeps the usual footer: Send photo, then Choose file or gallery, and no steps', () => {
    const onAnswer = vi.fn();
    const message = makeMessage({
      id: 'plain-ask',
      senderId: 'system-user',
      senderRole: 'admin',
      system: true,
      body: 'MDG needs your Fire NOC.',
      ask: { ref: 'doc:noc1', kind: 'document', title: 'Fire NOC', acceptsFile: true },
    });
    render(<MessageBubble message={message} mine={false} askPhase="open" onAskAnswer={onAnswer} />);
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Download letter' })).toBeNull();
    expect(screen.queryByText(/No printer/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Send photo' }));
    expect(onAnswer).toHaveBeenCalledWith(message, 'camera');
    fireEvent.click(screen.getByRole('button', { name: 'Choose file' }));
    expect(onAnswer).toHaveBeenCalledWith(message, 'files');
  });

  it('a request with a PDF on it but no letter variant is still the usual footer', () => {
    const message = makeMessage({
      id: 'pdf-ask',
      senderId: 'system-user',
      senderRole: 'admin',
      system: true,
      body: 'Please sign and send back.',
      attachments: [LETTER],
      ask: { ref: 'doc:x', kind: 'document', title: 'A paper', acceptsFile: true },
    });
    render(<MessageBubble message={message} mine={false} askPhase="open" />);
    expect(screen.getByRole('button', { name: 'Send photo' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download letter' })).toBeNull();
  });
});
