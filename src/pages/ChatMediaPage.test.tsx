import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import * as React from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useLangStore } from '@/store/lang';
import { renderWithProviders, signIn } from '@/test/utils';
import type { ConversationMediaItem } from '@dk/shared/types';

import { ChatMediaPage } from './ChatMediaPage';

// Unmount BEFORE the shared teardown resets the language store: that reset runs
// first otherwise, and re-renders a still-mounted component outside `act`.
afterEach(() => cleanup());

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ api }));

function item(overrides: Partial<ConversationMediaItem>): ConversationMediaItem {
  return {
    messageId: 'm1',
    senderId: 'u1',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function picture(n: number, over: Partial<ConversationMediaItem> = {}): ConversationMediaItem {
  return item({
    messageId: `m-img${n}`,
    attachment: {
      storageKey: `chat/c1/a-pic${n}.jpg`,
      filename: `pic${n}.jpg`,
      contentType: 'image/jpeg',
      size: 1000,
      kind: 'image',
      url: `https://s3.test/pic${n}.jpg`,
    },
    ...over,
  });
}

const mediaItem = picture(0);
const docItem = item({
  messageId: 'm-doc',
  attachment: {
    storageKey: 'chat/c1/b-report.pdf',
    filename: 'report.pdf',
    contentType: 'application/pdf',
    size: 2048,
    kind: 'file',
    url: 'https://s3.test/report.pdf',
  },
});
const linkItem = item({
  messageId: 'm-link',
  urls: ['https://example.com/offer'],
  bodySnippet: 'check https://example.com/offer',
});

function mockByTab() {
  api.get.mockImplementation((_path: string, query?: { tab?: string }) => {
    if (query?.tab === 'docs') return Promise.resolve([docItem]);
    if (query?.tab === 'links') return Promise.resolve([linkItem]);
    return Promise.resolve([mediaItem]);
  });
}

/** Where "Show in chat" and ← land, so the tests can see the trip. */
function ChatStub() {
  const location = useLocation();
  return (
    <div data-testid="chat-stub">
      chat {location.pathname} {JSON.stringify(location.state)}
    </div>
  );
}

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/chat/:id/media" element={<ChatMediaPage />} />
      <Route path="/chat/:id" element={<ChatStub />} />
    </Routes>,
    { route: '/chat/c1/media' },
  );
}

/** A page of the gallery as the server sends it: newest first. */
function page(first: number, count: number, over: (n: number) => Partial<ConversationMediaItem> = () => ({})) {
  return Array.from({ length: count }, (_, i) => picture(first + i, over(first + i)));
}

describe('ChatMediaPage', () => {
  beforeEach(() => {
    useLangStore.setState({ lang: 'en', explicit: false });
    api.get.mockReset();
  });

  it('loads the media tab by default and renders the image grid', async () => {
    mockByTab();
    renderPage();
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        '/v1/conversations/c1/media',
        expect.objectContaining({ tab: 'media', limit: 30 }),
      ),
    );
    const img = await screen.findByAltText('pic0.jpg');
    expect(img).toHaveAttribute('src', 'https://s3.test/pic0.jpg');
    expect(img).toHaveAttribute('loading', 'lazy');
  });

  it('is a white bar with ← and "Media, links and docs", and three underlined tabs', async () => {
    mockByTab();
    renderPage();
    await screen.findByAltText('pic0.jpg');
    expect(screen.getByText('Media, links and docs')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Media', 'Docs', 'Links']);
    expect(screen.getByRole('tab', { name: 'Media' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Docs' })).toHaveAttribute('aria-selected', 'false');
    // The chosen one carries the accent underline.
    expect(screen.getByRole('tab', { name: 'Media' })).toHaveClass('border-wa-accent-strong');
    expect(screen.getByRole('tab', { name: 'Docs' })).toHaveClass('border-transparent');
  });

  it('← goes back to the chat when the page was opened cold', async () => {
    mockByTab();
    renderPage();
    await screen.findByAltText('pic0.jpg');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByTestId('chat-stub')).toHaveTextContent('chat /chat/c1');
  });

  it('switching tabs fetches that tab and renders its layout', async () => {
    mockByTab();
    renderPage();
    await screen.findByAltText('pic0.jpg');

    fireEvent.click(screen.getByRole('tab', { name: 'Docs' }));
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        '/v1/conversations/c1/media',
        expect.objectContaining({ tab: 'docs' }),
      ),
    );
    expect(await screen.findByText('report.pdf')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Links' }));
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        '/v1/conversations/c1/media',
        expect.objectContaining({ tab: 'links' }),
      ),
    );
    const link = await screen.findByRole('link');
    expect(link).toHaveAttribute('href', 'https://example.com/offer');
    expect(link).toHaveAttribute('target', '_blank');
    expect(screen.getByText('example.com')).toBeInTheDocument();
  });

  it('shows the per-tab empty state', async () => {
    api.get.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText('No photos yet')).toBeInTheDocument();
  });

  it('a FAILED load is a retry, never "No photos yet"', async () => {
    api.get.mockRejectedValue(new Error('offline'));
    renderPage();
    expect(await screen.findByText("Couldn't load the photos")).toBeInTheDocument();
    expect(screen.queryByText('No photos yet')).toBeNull();

    api.get.mockResolvedValue([mediaItem]);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByAltText('pic0.jpg')).toBeInTheDocument();
  });
});

describe('ChatMediaPage — month shelves', () => {
  beforeEach(() => {
    useLangStore.setState({ lang: 'en', explicit: false });
    api.get.mockReset();
  });

  it('groups the grid under month headings, this month first and called "This month"', async () => {
    const now = new Date();
    api.get.mockResolvedValue([
      picture(1, { createdAt: now.toISOString() }),
      picture(2, { createdAt: now.toISOString() }),
      picture(3, { createdAt: new Date(2024, 2, 9, 10).toISOString() }),
      picture(4, { createdAt: new Date(2024, 2, 2, 10).toISOString() }),
      picture(5, { createdAt: new Date(2023, 11, 25, 10).toISOString() }),
    ]);
    renderPage();
    await screen.findByAltText('pic1.jpg');

    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['This month', 'March 2024', 'December 2023']);

    // Each picture sits under its own month.
    const [thisMonth, march, december] = screen
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.parentElement!);
    expect(within(thisMonth!).getAllByRole('img')).toHaveLength(2);
    expect(within(march!).getAllByRole('img')).toHaveLength(2);
    expect(within(december!).getByAltText('pic5.jpg')).toBeInTheDocument();
  });

  it('writes the months in Hindi when the app is in Hindi', async () => {
    useLangStore.setState({ lang: 'hi', explicit: true });
    api.get.mockResolvedValue([picture(1, { createdAt: new Date(2024, 2, 9, 10).toISOString() })]);
    renderPage();
    await screen.findByAltText('pic1.jpg');
    expect(screen.getByRole('heading', { level: 2 }).textContent).toMatch(/2024/);
    expect(screen.getByRole('heading', { level: 2 }).textContent).not.toMatch(/March/);
  });
});

describe('ChatMediaPage — docs', () => {
  beforeEach(() => {
    useLangStore.setState({ lang: 'en', explicit: false });
    api.get.mockReset();
  });

  it('gives each paper the coloured type badge — PDF red, DOC blue, XLS green, other grey', async () => {
    const doc = (name: string, contentType: string) =>
      item({
        messageId: `m-${name}`,
        attachment: {
          storageKey: `chat/c1/${name}`,
          filename: name,
          contentType,
          size: 1024 * 1024,
          kind: 'file',
          url: `https://s3.test/${name}`,
        },
      });
    api.get.mockResolvedValue([
      doc('rates.pdf', 'application/pdf'),
      doc('letter.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
      doc('sales.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
      doc('notes.txt', 'text/plain'),
    ]);
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: 'Docs' }));
    await screen.findByText('rates.pdf');

    const badge = (label: string) => screen.getByText(label);
    expect(badge('PDF')).toHaveClass('bg-danger');
    expect(badge('DOC')).toHaveClass('bg-info');
    expect(badge('XLS')).toHaveClass('bg-success');
    expect(badge('TXT')).toHaveClass('bg-neutral');
    // Size and date under the name.
    expect(screen.getAllByText(/1\.0 MB · /)).toHaveLength(4);
  });

  it('tapping a paper downloads it', async () => {
    mockByTab();
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: 'Docs' }));
    const row = (await screen.findByText('report.pdf')).closest('button')!;
    // The download path presigns through the message, then opens it.
    api.get.mockResolvedValue({ url: 'https://s3.test/dl' });
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    fireEvent.click(row);
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        '/v1/conversations/c1/messages/m-doc/download-url',
        expect.objectContaining({ key: 'chat/c1/b-report.pdf', disposition: 'attachment' }),
      ),
    );
    await waitFor(() => expect(open).toHaveBeenCalled());
  });
});

describe('ChatMediaPage — loading more', () => {
  beforeEach(() => {
    useLangStore.setState({ lang: 'en', explicit: false });
    api.get.mockReset();
  });

  /** An IntersectionObserver the test can fire by hand. */
  class FakeObserver {
    static all: FakeObserver[] = [];
    callback: IntersectionObserverCallback;
    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback;
      FakeObserver.all.push(this);
    }
    observe = vi.fn();
    disconnect = vi.fn();
    unobserve = vi.fn();
    takeRecords = () => [];
    see(isIntersecting: boolean) {
      this.callback([{ isIntersecting } as IntersectionObserverEntry], this as never);
    }
  }
  const live = () => FakeObserver.all.filter((o) => o.disconnect.mock.calls.length === 0);

  it('offers a Load more button only when the page came back full (no observer available)', async () => {
    // A full page (30 MESSAGES) ⇒ hasMore.
    api.get.mockResolvedValue(page(100, 30));
    renderPage();
    expect(await screen.findByText('Load more')).toBeInTheDocument();
  });

  it('does NOT offer load-more when multi-image messages inflate the item count', async () => {
    // The server pages by MESSAGE: 15 messages × 2 images = 30 items, but the
    // history is exhausted (fewer than 30 messages) — no phantom Load-more.
    const inflated = Array.from({ length: 30 }, (_, i) =>
      picture(i, { messageId: `m-${Math.floor(i / 2)}` }),
    );
    api.get.mockResolvedValue(inflated);
    renderPage();
    await screen.findByAltText('pic0.jpg');
    expect(screen.queryByText('Load more')).not.toBeInTheDocument();
  });

  it('loads the next page by itself when the end of the grid scrolls near', async () => {
    FakeObserver.all = [];
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    api.get.mockResolvedValueOnce(page(100, 30));
    renderPage();
    await screen.findByAltText('pic100.jpg');
    // No button when the scroll does the work.
    expect(screen.queryByText('Load more')).toBeNull();

    api.get.mockResolvedValueOnce(page(200, 3));
    await act(async () => {
      live().at(-1)!.see(true);
    });
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    // The cursor is the oldest item of the page it already has.
    expect(api.get).toHaveBeenLastCalledWith(
      '/v1/conversations/c1/media',
      expect.objectContaining({ tab: 'media', before: expect.any(String) }),
    );
    expect(await screen.findByAltText('pic200.jpg')).toBeInTheDocument();
    // The short second page was the last: nothing left to watch for.
    await waitFor(() => expect(screen.queryByLabelText('Loading')).toBeNull());
  });

  it('does not ask again while a page is on its way', async () => {
    FakeObserver.all = [];
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    api.get.mockResolvedValueOnce(page(100, 30));
    renderPage();
    await screen.findByAltText('pic100.jpg');

    let release: (v: ConversationMediaItem[]) => void = () => {};
    api.get.mockImplementationOnce(() => new Promise((r) => (release = r)));
    await act(async () => {
      live().at(-1)!.see(true);
    });
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    // Mid-flight the observer is torn down: nothing more can fire it.
    expect(live()).toHaveLength(0);
    await act(async () => {
      release(page(200, 3));
    });
  });

  it('a failed next page leaves what was loaded, and a chip to try again', async () => {
    FakeObserver.all = [];
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    api.get.mockResolvedValueOnce(page(100, 30));
    renderPage();
    await screen.findByAltText('pic100.jpg');

    api.get.mockRejectedValueOnce(new Error('offline'));
    await act(async () => {
      live().at(-1)!.see(true);
    });
    const chip = await screen.findByRole('button', { name: "Couldn't load more. Tap to try again." });
    // The grid is still there — and it is not the failure screen.
    expect(screen.getByAltText('pic100.jpg')).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load the photos")).toBeNull();
    // And no observer is left to hammer a dead network.
    expect(live()).toHaveLength(0);

    api.get.mockResolvedValueOnce(page(200, 2));
    fireEvent.click(chip);
    expect(await screen.findByAltText('pic200.jpg')).toBeInTheDocument();
  });
});

describe('ChatMediaPage — the viewer', () => {
  beforeEach(() => {
    useLangStore.setState({ lang: 'en', explicit: true });
    api.get.mockReset();
    signIn({ id: 'me' });
  });

  /** Three pictures, newest first as the server sends them. */
  const trio = () => [
    picture(3, { senderId: 'me', senderName: 'Ramesh', bodySnippet: 'third one' }),
    picture(2, { senderId: 'u9', senderName: 'MDG team' }),
    picture(1, { senderId: 'u9', senderName: 'MDG team' }),
  ];
  const viewer = () => screen.getByRole('dialog', { name: 'Image preview' });
  const shown = () => within(screen.getByTestId('viewer-frame')).getByRole('img');
  const settle = () =>
    act(async () => {
      await new Promise((r) => setTimeout(r, 230));
    });

  it('opens on the picture that was tapped, with who sent it', async () => {
    api.get.mockResolvedValue(trio());
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'pic2.jpg' }));
    expect(viewer()).toBeInTheDocument();
    expect(shown()).toHaveAttribute('alt', 'pic2.jpg');
    expect(within(viewer()).getByText('MDG team')).toBeInTheDocument();
  });

  it('says MDG, in the dealer’s words, for a picture the system posted — never "MDG System"', async () => {
    api.get.mockResolvedValue([
      picture(2, { senderId: 'sys', senderName: 'MDG System' }),
      picture(1, { senderId: 'sys' }),
    ]);
    renderPage();
    for (const name of ['pic2.jpg', 'pic1.jpg']) {
      fireEvent.click(await screen.findByRole('button', { name }));
      expect(within(viewer()).getByText('MDG Support')).toBeInTheDocument();
      expect(within(viewer()).queryByText('MDG System')).toBeNull();
      fireEvent.keyDown(window, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Image preview' })).toBeNull());
    }
  });

  it('says "You" for a picture the dealer sent, and shows its caption', async () => {
    api.get.mockResolvedValue(trio());
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'pic3.jpg' }));
    expect(within(viewer()).getByText('You')).toBeInTheDocument();
    expect(within(viewer()).getByText('third one')).toBeInTheDocument();
  });

  it('pages through ALL the loaded pictures, oldest to newest', async () => {
    api.get.mockResolvedValue(trio());
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'pic2.jpg' }));

    // Older than pic2 is pic1; newer is pic3 — the opposite order to the grid.
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    await settle();
    expect(shown()).toHaveAttribute('alt', 'pic1.jpg');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    await settle();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    await settle();
    expect(shown()).toHaveAttribute('alt', 'pic3.jpg');
  });

  it('keeps a message’s own pictures in the order they were sent', async () => {
    // One message with two pictures (a, b), and an older one before it.
    api.get.mockResolvedValue([
      picture(2, { messageId: 'm-album' }),
      picture(3, { messageId: 'm-album' }),
      picture(1, { messageId: 'm-old' }),
    ]);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'pic1.jpg' }));
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    await settle();
    expect(shown()).toHaveAttribute('alt', 'pic2.jpg');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    await settle();
    expect(shown()).toHaveAttribute('alt', 'pic3.jpg');
  });

  it('asks for the next page when the reader reaches the oldest picture', async () => {
    api.get.mockResolvedValueOnce(page(100, 30));
    renderPage();
    // The grid is newest first, so the LAST square is the oldest picture.
    const squares = await screen.findAllByRole('button', { name: /^pic\d+\.jpg$/ });
    api.get.mockResolvedValueOnce(page(200, 3));
    fireEvent.click(squares[squares.length - 1]!);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(api.get).toHaveBeenLastCalledWith(
      '/v1/conversations/c1/media',
      expect.objectContaining({ before: expect.any(String) }),
    );
    // …and the new, older pictures are now part of the strip: the reader is
    // still on the same picture.
    await waitFor(() => expect(within(viewer()).getByAltText('pic200.jpg')).toBeInTheDocument());
    expect(shown()).toHaveAttribute('alt', 'pic129.jpg');
  });

  it('downloads the picture on screen through its own message', async () => {
    api.get.mockResolvedValue(trio());
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'pic2.jpg' }));
    api.get.mockResolvedValue({ url: 'https://s3.test/dl' });
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    fireEvent.click(within(viewer()).getByLabelText('Download'));
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        '/v1/conversations/c1/messages/m-img2/download-url',
        expect.objectContaining({ key: 'chat/c1/a-pic2.jpg', disposition: 'attachment' }),
      ),
    );
    await waitFor(() => expect(open).toHaveBeenCalled());
  });

  it('closes on Back and leaves the gallery where it was', async () => {
    api.get.mockResolvedValue(trio());
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'pic2.jpg' }));
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.queryByRole('dialog', { name: 'Image preview' })).toBeNull();
    expect(screen.getByRole('button', { name: 'pic2.jpg' })).toBeInTheDocument();
  });

  it('"Show in chat" closes the viewer and opens the chat at that message', async () => {
    api.get.mockResolvedValue(trio());
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'pic2.jpg' }));
    fireEvent.click(within(viewer()).getByLabelText('More options'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Show in chat' }));

    const stub = await screen.findByTestId('chat-stub', undefined, { timeout: 2000 });
    expect(stub).toHaveTextContent('chat /chat/c1');
    expect(stub).toHaveTextContent('"jumpToMessageId":"m-img2"');
    expect(screen.queryByRole('dialog', { name: 'Image preview' })).toBeNull();
  });

  it('does not offer the viewer for a picture the server could not sign', async () => {
    const unsigned = picture(7);
    unsigned.attachment = { ...unsigned.attachment!, url: undefined };
    api.get.mockResolvedValue([unsigned, picture(8)]);
    renderPage();
    await screen.findByAltText('pic8.jpg');
    expect(screen.queryByAltText('pic7.jpg')).toBeNull();
  });
});
