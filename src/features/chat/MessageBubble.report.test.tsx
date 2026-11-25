import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetEmbeddedForTests } from '@/lib/embedMode';
import { useLangStore } from '@/store/lang';
import { makeMessage } from '@/test/utils';
import type { Attachment } from '@dk/shared/types';

import { MessageBubble } from './MessageBubble';
import { buildReplyContext } from './replyContext';

// Downloads and fresh links go through the message; here they are doubles.
vi.mock('@/lib/downloadAttachment', () => ({
  useAttachmentDownload: () => vi.fn(),
  fetchFreshInlineUrl: vi.fn(),
}));

// The panel's modal is its own chunk with its own tests; here it only has to be what opens.
vi.mock('@/features/reports/lazy', () => ({
  ReportModal: (props: {
    conversationId: string;
    messageId: string;
    placeholder?: { kind: string; data?: unknown };
    onClose: () => void;
    onJumpTo?: (id: string) => void;
  }) => (
    <div data-testid="report-modal" data-cid={props.conversationId} data-mid={props.messageId}>
      <span data-testid="modal-row">{props.placeholder?.kind}</span>
      <button type="button" onClick={props.onClose}>
        modal-close
      </button>
      <button type="button" onClick={() => props.onJumpTo?.(props.messageId)}>
        modal-jump
      </button>
    </div>
  ),
  ReportHost: () => null,
}));

beforeEach(() => {
  useLangStore.setState({ lang: 'en', explicit: false });
});
afterEach(cleanup);

const card: Attachment = {
  storageKey: 'dsr/15E/2026-11-22/sales.png',
  filename: 'dsr-sales-2026-11-22.png',
  contentType: 'image/png',
  size: 48_000,
  kind: 'image',
  url: 'https://files.test/dsr-sales.png',
};

const report = (over: Parameters<typeof makeMessage>[0] = {}) =>
  makeMessage({
    id: 'rep-1',
    senderId: 'mdg-system',
    senderRole: 'admin',
    senderName: 'MDG System',
    system: true,
    body: 'Aaj ki bikri ki report bhej di hai. Petrol 4,200 L, Diesel 6,100 L.',
    attachments: [card],
    report: { kind: 'dsr_sales', status: 'ok', day: '2026-11-22' },
    ...over,
  });

/** Shows where the router is, so the tests can see the button's navigation. */
function Where() {
  const loc = useLocation();
  return (
    <div data-testid="where" data-path={loc.pathname}>
      {JSON.stringify(loc.state)}
    </div>
  );
}

function renderIn(ui: React.ReactElement, path = '/chat/c1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={ui} />
      </Routes>
      <Where />
    </MemoryRouter>,
  );
}

describe('a report in the chat (ADR 0055, 0056)', () => {
  it('is a text bubble: the words, no picture', () => {
    const { container } = renderIn(<MessageBubble message={report()} mine={false} currentUserId="me" />);
    expect(
      screen.getByText('Aaj ki bikri ki report bhej di hai. Petrol 4,200 L, Diesel 6,100 L.'),
    ).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.queryByAltText(card.filename)).toBeNull();
    expect(container.querySelectorAll('.bg-wa-in')).toHaveLength(1);
  });

  it('draws the same text bubble when the card is recognised from an old caption, not tagged', () => {
    const { container } = renderIn(
      <MessageBubble
        message={report({
          report: undefined,
          body: '📊 DSR · 13 Aug — stock variation within limit',
          attachments: [{ ...card, filename: 'dsr-variation-2026-08-13.png' }],
        })}
        mine={false}
        currentUserId="me"
      />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByTestId('report-button')).toBeInTheDocument();
  });

  it.each([
    ['en', 'See sales report'],
    ['hi', 'बिक्री रिपोर्ट देखें'],
    ['hl', 'Bikri report dekhein'],
  ] as const)('has a button under the words that names the report, in %s', (lang, label) => {
    useLangStore.setState({ lang, explicit: true });
    renderIn(<MessageBubble message={report()} mine={false} currentUserId="me" />);
    const button = screen.getByRole('button', { name: label });
    expect(button).toBe(screen.getByTestId('report-button'));
    // Under the words, not inside them.
    const words = screen.getByText(/^Aaj ki bikri ki report bhej di hai/);
    expect(words.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(words.contains(button)).toBe(false);
  });

  it('sets the button in 16 px text (the least any text of this change is set in) and keeps it 44 px tall', () => {
    renderIn(<MessageBubble message={report()} mine={false} currentUserId="me" />);
    const button = screen.getByTestId('report-button');
    expect(button.className).toContain('text-cta');
    expect(button.className).not.toContain('text-[15px]');
    expect(button.className).toContain('min-h-12');
  });

  it('names a different report differently, and draws it in its own family colour with its own icon', () => {
    const { container, rerender } = renderIn(<MessageBubble message={report()} mine={false} currentUserId="me" />);
    const dsr = screen.getByTestId('report-button');
    expect(dsr.querySelector('span[aria-hidden]')).toHaveStyle({ backgroundColor: 'var(--kind-dsr-soft)' });
    expect(dsr.querySelector('svg')).toHaveClass('lucide-table2');
    rerender(
      <MemoryRouter>
        <MessageBubble
          message={report({ id: 'rep-2', report: { kind: 'credit_dod', status: 'attention' } })}
          mine={false}
          currentUserId="me"
        />
      </MemoryRouter>,
    );
    const credit = container.querySelector('[data-testid="report-button"]')!;
    expect(credit).toHaveTextContent('See Credit & DOD');
    expect(credit.querySelector('span[aria-hidden]')).toHaveStyle({ backgroundColor: 'var(--kind-credit-soft)' });
    expect(credit.querySelector('svg')).not.toHaveClass('lucide-table2');
  });

  it('is big enough to tap and never clips its label', () => {
    renderIn(<MessageBubble message={report()} mine={false} currentUserId="me" />);
    const button = screen.getByTestId('report-button');
    expect(button.className).toMatch(/min-h-12/);
    expect(button.className).toMatch(/w-full/);
    expect(button.querySelector('span:not([aria-hidden])')?.className).toMatch(/break-words/);
  });

  it('opens the report over the chat: a push to /report/:cid/:mid that leaves the chat beneath', () => {
    renderIn(<MessageBubble message={report({ id: 'rep-77' })} mine={false} currentUserId="me" />);
    fireEvent.click(screen.getByTestId('report-button'));
    const where = screen.getByTestId('where');
    expect(where.getAttribute('data-path')).toBe('/report/c1/rep-77');
    const state = JSON.parse(where.textContent!);
    // The chat is what stays drawn underneath, and what Back returns to.
    expect(state.backgroundLocation.pathname).toBe('/chat/c1');
    // The message's own copy is the overlay's first frame: it opens with no wait and no network.
    expect(state.report).toMatchObject({ messageId: 'rep-77', conversationId: 'c1', kind: 'dsr_sales' });
    // No URL was pasted into the message.
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('hands the overlay the snapshot the message carries', () => {
    const data = { kind: 'dsr_sales', v: 1, products: [] };
    renderIn(
      <MessageBubble
        message={report({ id: 'rep-78', report: { kind: 'dsr_sales', status: 'ok', data } as never })}
        mine={false}
        currentUserId="me"
      />,
    );
    fireEvent.click(screen.getByTestId('report-button'));
    const state = JSON.parse(screen.getByTestId('where').textContent!);
    expect(state.report.data).toEqual(data);
  });

  it('opens an OLD message that has only a picture the same way: the overlay shows the picture', () => {
    renderIn(
      <MessageBubble
        message={report({
          id: 'old-1',
          report: undefined,
          body: '📊 DSR · 13 Aug — stock variation within limit',
          attachments: [{ ...card, filename: 'dsr-variation-2026-08-13.png' }],
        })}
        mine={false}
        currentUserId="me"
      />,
    );
    expect(screen.getByTestId('report-button')).toHaveTextContent('See stock variation');
    fireEvent.click(screen.getByTestId('report-button'));
    expect(screen.getByTestId('where').getAttribute('data-path')).toBe('/report/c1/old-1');
    const state = JSON.parse(screen.getByTestId('where').textContent!);
    // No snapshot, so the overlay's frame carries the stored picture to draw.
    expect(state.report.data).toBeUndefined();
    expect(state.report.attachments).toHaveLength(1);
  });

  it('does not wait for the feed or the network: the tap navigates at once', () => {
    renderIn(<MessageBubble message={report({ id: 'rep-80' })} mine={false} currentUserId="me" />);
    fireEvent.click(screen.getByTestId('report-button'));
    expect(screen.getByTestId('where').getAttribute('data-path')).toBe('/report/c1/rep-80');
  });

  it('from another report overlay, replaces it and keeps the screen beneath', () => {
    render(
      <MemoryRouter
        initialEntries={[
          '/chat/c1',
          {
            pathname: '/report/c1/first',
            state: { backgroundLocation: { pathname: '/chat/c1', search: '', hash: '', state: null, key: 'k' } },
          },
        ]}
        initialIndex={1}
      >
        <Routes>
          <Route path="*" element={<MessageBubble message={report({ id: 'rep-90' })} mine={false} currentUserId="me" />} />
        </Routes>
        <Where />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId('report-button'));
    expect(screen.getByTestId('where').getAttribute('data-path')).toBe('/report/c1/rep-90');
    expect(JSON.parse(screen.getByTestId('where').textContent!).backgroundLocation.pathname).toBe('/chat/c1');
  });

  it('keeps the button from selecting the message or starting a reply swipe', () => {
    const onLongPress = vi.fn();
    renderIn(
      <MessageBubble message={report()} mine={false} currentUserId="me" onLongPress={onLongPress} />,
    );
    const button = screen.getByTestId('report-button');
    expect(button).toHaveAttribute('data-no-swipe');
    fireEvent.pointerDown(button, { pointerId: 1 });
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('puts the time on a line of its own under the button, so the two never overlap', () => {
    const { container } = renderIn(<MessageBubble message={report()} mine={false} currentUserId="me" />);
    expect(container.querySelector('.justify-between')).toBeTruthy();
    expect(container.querySelector('.absolute.bottom-\\[5px\\]')).toBeNull();
  });

  it('says what it is, in the reader\'s language, when the message has no words of its own', () => {
    renderIn(<MessageBubble message={report({ body: undefined })} mine={false} currentUserId="me" />);
    expect(screen.getByText('Here is the sales report.')).toBeInTheDocument();
    act(() => useLangStore.setState({ lang: 'hi', explicit: true }));
    expect(screen.getByText('बिक्री की रिपोर्ट यह रही।')).toBeInTheDocument();
  });

  it('says the same when the only words of an old caption were an emoji', () => {
    renderIn(
      <MessageBubble message={report({ body: '📊', report: undefined })} mine={false} currentUserId="me" />,
    );
    expect(screen.getByText('Here is the sales report.')).toBeInTheDocument();
  });

  it("shows the reader's own language of the words, as any MDG message does", () => {
    useLangStore.setState({ lang: 'hi', explicit: true });
    renderIn(
      <MessageBubble
        message={report({
          body: 'Aaj ki DSR bhej di hai.',
          bodyByLang: { hl: 'Aaj ki DSR bhej di hai.', hi: 'आज की DSR भेज दी है।', en: 'Today’s DSR is sent.' },
        })}
        mine={false}
        currentUserId="me"
      />,
    );
    expect(screen.getByText('आज की DSR भेज दी है।')).toBeInTheDocument();
  });

  it('turns the emoji and the "label ·" of an OLD caption into plain words when drawing it', () => {
    renderIn(
      <MessageBubble
        message={report({
          body: '📒 Khata · 2 nayi entry aayi hain\n⚠️ Check kar lijiye',
          report: undefined,
        })}
        mine={false}
        currentUserId="me"
      />,
    );
    const words = screen.getByText(/2 nayi entry/);
    expect(words.textContent).toBe('Khata, 2 nayi entry aayi hain\nCheck kar lijiye');
  });

  it('leaves the words of a TAGGED message exactly as they were written', () => {
    renderIn(
      <MessageBubble
        message={report({ body: '📒 Khata · 2 nayi entry aayi hain' })}
        mine={false}
        currentUserId="me"
      />,
    );
    expect(screen.getByText('📒 Khata · 2 nayi entry aayi hain')).toBeInTheDocument();
  });

  it('leaves an announcement the way the admin typed it: no label dropped, no bullet stripped', () => {
    renderIn(
      <MessageBubble
        message={makeMessage({
          id: 'ann-2',
          senderId: 'mdg-system',
          senderRole: 'admin',
          system: true,
          body: 'Holiday · Pump closed on Sunday\n✅ Rates stay the same',
          announcement: { title: 'Notice', tone: 'notice' },
        })}
        mine={false}
        currentUserId="me"
      />,
    );
    const words = screen.getByText(/Pump closed on Sunday/);
    expect(words.textContent).toBe('Holiday · Pump closed on Sunday\n✅ Rates stay the same');
  });

  it('names the sender MDG, never "MDG System", where a sender name shows', () => {
    renderIn(
      <MessageBubble message={report()} mine={false} currentUserId="me" first showSender />,
    );
    expect(screen.queryByText('MDG System')).toBeNull();
    expect(screen.getByText('MDG')).toBeInTheDocument();
  });

  it('has no translated label and no instant-reply footnote', () => {
    renderIn(
      <MessageBubble
        message={report({ bodyLang: 'hl', bodyByLang: { hl: 'Aaj ki DSR.', en: 'Today’s DSR.' } })}
        mine={false}
        currentUserId="me"
      />,
    );
    expect(screen.queryByTestId('translated-toggle')).toBeNull();
    expect(screen.queryByText(/Translated|Instant reply/)).toBeNull();
  });

  it('leaves a voice note it also carries in place', () => {
    const voice: Attachment = {
      storageKey: 'v/1',
      filename: 'note.webm',
      contentType: 'audio/webm',
      size: 10,
      kind: 'audio',
      url: 'https://files.test/note.webm',
    };
    renderIn(<MessageBubble message={report({ attachments: [card, voice] })} mine={false} currentUserId="me" />);
    expect(screen.getByRole('button', { name: 'Play voice message' })).toBeInTheDocument();
    expect(screen.queryByAltText(card.filename)).toBeNull();
  });

  it('a quoted report shows no thumbnail of its card in a reply', () => {
    const reply = makeMessage({
      id: 'r2',
      senderId: 'me',
      body: 'theek hai',
      replyTo: {
        messageId: 'rep-1',
        senderId: 'mdg-system',
        body: 'Aaj ki bikri ki report',
        imageUrl: 'https://files.test/dsr-sales.png',
      },
    });
    const { container, rerender } = renderIn(
      <MessageBubble message={reply} mine currentUserId="me" quoteHideImage />,
    );
    expect(container.querySelector('img')).toBeNull();
    // And an ordinary quoted photo still has its thumbnail.
    rerender(
      <MemoryRouter>
        <MessageBubble message={reply} mine currentUserId="me" />
      </MemoryRouter>,
    );
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://files.test/dsr-sales.png');
  });

  it('quoting a report builds a quote of its words: no thumbnail, no "Photo"', () => {
    const quote = buildReplyContext(report());
    expect(quote.imageUrl).toBeUndefined();
    expect(quote.imageStorageKey).toBeUndefined();
    expect(quote.attachmentKind).toBeUndefined();
    expect(quote.body).toContain('bikri');
    // An old report's caption is quoted the way the chat shows it, not in its robot style.
    const old = buildReplyContext(report({ report: undefined, body: '📊 DSR · 22 Nov — daily sales.' }));
    expect(old.body).toBe('DSR, 22 Nov — daily sales.');
    // A tagged message's words are quoted as they were written.
    expect(buildReplyContext(report({ body: '📊 DSR · 22 Nov' })).body).toBe('📊 DSR · 22 Nov');
    // An ordinary picture message still quotes its picture.
    const plain = buildReplyContext(makeMessage({ body: undefined, attachments: [{ ...card, filename: 'site.png' }] }));
    expect(plain.imageUrl).toBe(card.url);
    expect(plain.attachmentKind).toBe('image');
  });
});

describe('a reply to a report that is not among the loaded messages', () => {
  it('shows the quoted words and no thumbnail, no camera icon and no "Photo" label', () => {
    // The snapshot the server keeps for a reply to a report: its words, and no picture.
    const reply = makeMessage({
      id: 'reply-2',
      senderId: 'me',
      body: 'figures are wrong',
      replyTo: {
        messageId: 'older-report-not-loaded',
        senderId: 'mdg-system',
        body: 'DSR, 22 Nov — daily sales.',
      },
    });
    const { container } = renderIn(<MessageBubble message={reply} mine currentUserId="me" />);
    expect(screen.getByText('DSR, 22 Nov — daily sales.')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.queryByText('Photo')).toBeNull();
  });
});

describe('what stays exactly as it was', () => {
  it('an interactive box keeps its attachments, words and no report button', () => {
    const letter: Attachment = {
      storageKey: 'letters/loa.pdf',
      filename: 'loa-letter.pdf',
      contentType: 'application/pdf',
      size: 1000,
      kind: 'file',
      url: 'https://files.test/loa.pdf',
    };
    renderIn(
      <MessageBubble
        message={makeMessage({
          id: 'ask-1',
          senderId: 'mdg-system',
          senderRole: 'admin',
          system: true,
          body: 'Please send a photo of the fire NOC',
          attachments: [letter],
          // A tag on a box is ignored: it is a task, not a report.
          report: { kind: 'dsr_sales', status: 'ok' },
          ask: { ref: 'doc:ask1', kind: 'document', title: 'Fire NOC', periodLabel: '12 Oct' },
        } as never)}
        mine={false}
        currentUserId="me"
        askPhase="open"
      />,
    );
    expect(screen.queryByTestId('report-button')).toBeNull();
    expect(screen.getByText('Fire NOC')).toBeInTheDocument();
    expect(screen.getByText('loa-letter.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send photo/i })).toBeInTheDocument();
  });

  it('a picture MDG sends that is not a report keeps its picture and gets no button', () => {
    const { container } = renderIn(
      <MessageBubble
        message={makeMessage({
          id: 'p1',
          senderId: 'admin-3',
          senderRole: 'admin',
          body: 'Yeh dekhiye',
          attachments: [{ ...card, filename: 'site-visit.png' }],
        })}
        mine={false}
        currentUserId="me"
      />,
    );
    expect(container.querySelector('img')).toBeTruthy();
    expect(screen.queryByTestId('report-button')).toBeNull();
  });

  it("a dealer's own picture is untouched", () => {
    const { container } = renderIn(
      <MessageBubble
        message={makeMessage({ id: 'mine-1', senderId: 'me', body: 'meri photo', attachments: [{ ...card, filename: 'dsr-sales-2026-11-22.png' }] })}
        mine
        currentUserId="me"
      />,
    );
    expect(container.querySelector('img')).toBeTruthy();
    expect(screen.queryByTestId('report-button')).toBeNull();
  });

  it('a tanker card and an announcement keep their plain cards and add the button to Today', () => {
    const { rerender } = renderIn(
      <MessageBubble
        message={makeMessage({
          id: 'ann-1',
          senderId: 'mdg-system',
          senderRole: 'admin',
          system: true,
          body: 'Aaj se *hamari team* raat ko mark karegi.',
          announcement: { title: 'TT ab raat ko', tone: 'new' },
        })}
        mine={false}
        currentUserId="me"
      />,
    );
    expect(screen.getByTestId('announcement-card')).toHaveTextContent('TT ab raat ko');
    expect(screen.getByTestId('report-button')).toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <MessageBubble
          message={makeMessage({
            id: 'fuel-1',
            senderId: 'mdg-system',
            senderRole: 'admin',
            system: true,
            body: 'Tanker lag gaya',
            fuelCard: {
              kind: 'tanker_assigned',
              title: { hi: 'टैंकर लग गया', hl: 'Tanker lag gaya', en: 'Tanker assigned' },
              hero: 'BR10GC5000',
              heroLabel: { hi: 'टैंकर नंबर', hl: 'Tanker number', en: 'Tanker number' },
              rows: [],
            },
          })}
          mine={false}
          currentUserId="me"
        />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('fuel-order-card-hero')).toHaveTextContent('BR10GC5000');
    expect(screen.getByTestId('report-button')).toBeInTheDocument();
  });
});

describe('inside the extension\'s side panel', () => {
  beforeEach(() => {
    window.sessionStorage.setItem('dk.embed', 'extension');
    resetEmbeddedForTests({ framed: true });
  });
  afterEach(() => {
    window.sessionStorage.removeItem('dk.embed');
    resetEmbeddedForTests();
  });

  it('draws the same words-and-button bubble, with no picture', () => {
    const { container } = renderIn(<MessageBubble message={report()} mine={false} currentUserId="me" />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByTestId('report-button')).toHaveTextContent('See sales report');
  });

  it('opens the report as a modal inside the thread, with no navigation', () => {
    renderIn(<MessageBubble message={report({ id: 'rep-5' })} mine={false} currentUserId="me" />);
    expect(screen.queryByTestId('report-modal')).toBeNull();
    fireEvent.click(screen.getByTestId('report-button'));
    const modal = screen.getByTestId('report-modal');
    expect(modal).toHaveAttribute('data-mid', 'rep-5');
    expect(modal).toHaveAttribute('data-cid', 'c1');
    expect(screen.getByTestId('modal-row')).toHaveTextContent('dsr_sales');
    // The address did not change: there is no Today to be over, and no route to push.
    expect(screen.getByTestId('where').getAttribute('data-path')).toBe('/chat/c1');
  });

  it('closes the modal, and jumps to the message in the thread when asked', () => {
    const onJumpTo = vi.fn();
    renderIn(<MessageBubble message={report({ id: 'rep-5' })} mine={false} currentUserId="me" onJumpTo={onJumpTo} />);
    fireEvent.click(screen.getByTestId('report-button'));
    fireEvent.click(screen.getByText('modal-jump'));
    expect(onJumpTo).toHaveBeenCalledWith('rep-5', 'rep-5');
    fireEvent.click(screen.getByText('modal-close'));
    expect(screen.queryByTestId('report-modal')).toBeNull();
  });
});
