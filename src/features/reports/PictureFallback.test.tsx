import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useLangStore } from '@/store/lang';
import { renderWithProviders } from '@/test/utils';
import type { Attachment } from '@dk/shared/types';

const download = vi.hoisted(() => vi.fn());
const freshUrl = vi.hoisted(() => vi.fn());
vi.mock('@/lib/downloadAttachment', () => ({
  useAttachmentDownload: () => download,
  fetchFreshInlineUrl: freshUrl,
}));
// The full-screen viewer has its own tests; here it only has to be what a tap opens.
vi.mock('@/features/chat/MediaViewer', () => ({
  MediaViewer: (props: { items: Array<{ key: string; senderLabel: string; caption?: string }>; initialKey: string; onClose: () => void }) => (
    <div data-testid="viewer" data-initial={props.initialKey} data-count={props.items.length} data-sender={props.items[0]?.senderLabel} data-caption={props.items[0]?.caption ?? ''}>
      <button onClick={props.onClose}>viewer-close</button>
    </div>
  ),
}));

const { PictureFallback } = await import('./PictureFallback');

const img = (n: number): Attachment => ({
  storageKey: `dsr/${n}.png`,
  filename: `card-${n}.png`,
  contentType: 'image/png',
  size: 10,
  kind: 'image',
  url: `https://files.test/${n}.png`,
});
const pdf: Attachment = {
  storageKey: 'dsr/card.pdf',
  filename: 'card.pdf',
  contentType: 'application/pdf',
  size: 10,
  kind: 'file',
  url: 'https://files.test/card.pdf',
};
const voice: Attachment = { ...pdf, storageKey: 'v.webm', filename: 'v.webm', contentType: 'audio/webm', kind: 'audio' };

const draw = (attachments: Attachment[], headline?: string) =>
  renderWithProviders(
    <PictureFallback
      attachments={attachments}
      conversationId="c1"
      messageId="m1"
      sentAt="2026-11-24T04:50:00.000Z"
      senderLabel="MDG"
      {...(headline ? { headline } : {})}
    />,
  );

beforeEach(() => {
  useLangStore.setState({ lang: 'en', explicit: true });
  freshUrl.mockResolvedValue('https://files.test/fresh.png');
});
afterEach(() => {
  cleanup();
  download.mockReset();
  freshUrl.mockReset();
});

describe('PictureFallback', () => {
  it('shows every picture of the message, and the words with them', () => {
    draw([img(1), img(2)], 'DSR, 13 Aug — within limit');
    expect(screen.getAllByTestId('picture-tile')).toHaveLength(2);
    expect(screen.getByAltText('card-1.png')).toHaveAttribute('src', 'https://files.test/1.png');
    expect(screen.getByAltText('card-2.png')).toBeInTheDocument();
    expect(screen.getByText('DSR, 13 Aug — within limit')).toBeInTheDocument();
    expect(screen.getByText('This is an older report, shown as it was sent.')).toBeInTheDocument();
  });

  it('opens the full-screen viewer on the tapped picture, with the sender and the words', () => {
    draw([img(1), img(2)], 'the words');
    fireEvent.click(screen.getAllByTestId('picture-tile')[1]!);
    const viewer = screen.getByTestId('viewer');
    expect(viewer).toHaveAttribute('data-initial', 'm1:dsr/2.png');
    expect(viewer).toHaveAttribute('data-count', '2');
    expect(viewer).toHaveAttribute('data-sender', 'MDG');
    expect(viewer).toHaveAttribute('data-caption', 'the words');
    fireEvent.click(screen.getByText('viewer-close'));
    expect(screen.queryByTestId('viewer')).toBeNull();
  });

  it('names the tap for a screen reader, and tells a sighted reader they can zoom once it has loaded', () => {
    draw([img(1)]);
    expect(screen.getByRole('button', { name: 'Open the picture to zoom' })).toBeInTheDocument();
    expect(screen.queryByText('Tap to zoom')).toBeNull();
    fireEvent.load(screen.getByAltText('card-1.png'));
    expect(screen.getByText('Tap to zoom')).toBeInTheDocument();
  });

  it('opens a file that is not a picture the way the chat does, and leaves a voice note out', () => {
    draw([pdf, voice]);
    expect(screen.queryByTestId('picture-tile')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open the file' }));
    expect(download).toHaveBeenCalledWith(pdf, { conversationId: 'c1', messageId: 'm1' });
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('gets a fresh link once when the picture will not load, then says so and offers to try again', async () => {
    draw([img(1)]);
    fireEvent.error(screen.getByAltText('card-1.png'));
    await waitFor(() => expect(screen.getByAltText('card-1.png')).toHaveAttribute('src', 'https://files.test/fresh.png'));
    expect(freshUrl).toHaveBeenCalledTimes(1);
    fireEvent.error(screen.getByAltText('card-1.png'));
    expect(await screen.findByTestId('picture-failed')).toHaveTextContent('The picture did not open');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByTestId('picture-failed')).toBeNull());
  });

  it('asks for a link at once when the picture arrived with none', async () => {
    draw([{ ...img(1), url: '' }]);
    await waitFor(() => expect(freshUrl).toHaveBeenCalled());
  });

  it('says it all in Hindi too', () => {
    useLangStore.setState({ lang: 'hi', explicit: true });
    draw([img(1)]);
    expect(screen.getByText('यह पुरानी रिपोर्ट है, जैसी भेजी गई थी वैसी दिखा रहे हैं।')).toBeInTheDocument();
  });
});
