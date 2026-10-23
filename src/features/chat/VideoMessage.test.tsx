import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useLangStore } from '@/store/lang';
import { makeMessage } from '@/test/utils';
import type { Attachment } from '@dk/shared/types';

import { splitAttachments, VideoMessage } from './AttachmentPreview';
import { MessageBubble } from './MessageBubble';
import { replyPreview } from './replyContext';

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
afterEach(() => cleanup());

const video = (over: Partial<Attachment> = {}): Attachment => ({
  storageKey: 'guides/app-tour-hi-v1.mp4',
  filename: 'app-tour-hi-v1.mp4',
  contentType: 'video/mp4',
  size: 6_000_000,
  kind: 'file',
  durationMs: 42_000,
  url: 'https://files.test/app-tour.mp4?sig=1',
  ...over,
});

const SOURCE = { conversationId: 'c1', messageId: 'm1' };
const el = () => screen.getByTestId('video-message').querySelector('video')!;

describe('VideoMessage', () => {
  it('plays inline: controls, playsInline, metadata only, the first frame as the poster', () => {
    render(<VideoMessage attachment={video()} source={SOURCE} />);
    const v = el();
    expect(v).toHaveAttribute('controls');
    expect(v).toHaveAttribute('playsinline');
    expect(v).toHaveAttribute('preload', 'metadata');
    expect(v.getAttribute('src')).toBe('https://files.test/app-tour.mp4?sig=1#t=0.1');
    const box = screen.getByTestId('video-message');
    expect(box.className).toContain('bg-black');
    expect(box.style.aspectRatio).toBe('9 / 16');
  });

  it('shows the length in a chip until it starts', () => {
    render(<VideoMessage attachment={video()} source={SOURCE} />);
    expect(screen.getByTestId('video-duration')).toHaveTextContent('0:42');
    fireEvent.play(el());
    expect(screen.queryByTestId('video-duration')).toBeNull();
  });

  it('has no chip when the length is not known', () => {
    render(<VideoMessage attachment={video({ durationMs: undefined })} source={SOURCE} />);
    expect(screen.queryByTestId('video-duration')).toBeNull();
  });

  it('a stale link is replaced once; the second failure says so, and a tap tries again', async () => {
    h.fresh.mockResolvedValueOnce('https://files.test/app-tour.mp4?sig=2');
    render(<VideoMessage attachment={video()} source={SOURCE} />);
    fireEvent.error(el());
    await waitFor(() => expect(el().getAttribute('src')).toBe('https://files.test/app-tour.mp4?sig=2#t=0.1'));
    expect(h.fresh).toHaveBeenCalledTimes(1);
    expect(h.fresh).toHaveBeenCalledWith(expect.objectContaining({ storageKey: 'guides/app-tour-hi-v1.mp4' }), SOURCE);

    // The fresh one fails too: no endless loop, words instead.
    fireEvent.error(el());
    const retry = await screen.findByRole('button', { name: "Couldn't play. Tap to try again" });
    expect(h.fresh).toHaveBeenCalledTimes(1);

    h.fresh.mockResolvedValueOnce('https://files.test/app-tour.mp4?sig=3');
    fireEvent.click(retry);
    await waitFor(() => expect(el().getAttribute('src')).toBe('https://files.test/app-tour.mp4?sig=3#t=0.1'));
    expect(h.fresh).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('button', { name: /Tap to try again/ })).toBeNull();
  });

  it('says so when a fresh link cannot be had', async () => {
    h.fresh.mockRejectedValue(new Error('403'));
    render(<VideoMessage attachment={video()} source={SOURCE} />);
    fireEvent.error(el());
    expect(
      await screen.findByRole('button', { name: "Couldn't play. Tap to try again" }),
    ).toBeInTheDocument();
  });

  it('a video that arrives with no link is asked for at once', async () => {
    h.fresh.mockResolvedValue('https://files.test/signed.mp4?sig=9');
    render(<VideoMessage attachment={video({ url: '' })} source={SOURCE} />);
    // Nothing to play until the link arrives.
    expect(screen.getByTestId('video-message').querySelector('video')).toBeNull();
    await waitFor(() => expect(el().getAttribute('src')).toBe('https://files.test/signed.mp4?sig=9#t=0.1'));
    expect(h.fresh).toHaveBeenCalledTimes(1);
  });

  it('a message still on its way out asks for nothing', async () => {
    render(
      <VideoMessage
        attachment={video({ url: '' })}
        source={{ conversationId: 'c1', messageId: 'temp-1' }}
      />,
    );
    await act(async () => {});
    expect(h.fresh).not.toHaveBeenCalled();
  });

  it('keeps playing when the thread is refetched with a newly signed link', () => {
    const { rerender } = render(<VideoMessage attachment={video()} source={SOURCE} />);
    const before = el();
    fireEvent.play(before);
    rerender(<VideoMessage attachment={video({ url: 'https://files.test/app-tour.mp4?sig=2' })} source={SOURCE} />);
    // The same element, on the same link: nothing restarted.
    expect(el()).toBe(before);
    expect(el().getAttribute('src')).toBe('https://files.test/app-tour.mp4?sig=1#t=0.1');
  });

  it('takes the new link when the old one had failed', async () => {
    h.fresh.mockRejectedValue(new Error('offline'));
    const { rerender } = render(<VideoMessage attachment={video()} source={SOURCE} />);
    fireEvent.error(el());
    await waitFor(() => expect(screen.getByRole('button')).toBeInTheDocument());
    rerender(<VideoMessage attachment={video({ url: 'https://files.test/app-tour.mp4?sig=3' })} source={SOURCE} />);
    await waitFor(() => expect(el().getAttribute('src')).toBe('https://files.test/app-tour.mp4?sig=3#t=0.1'));
  });

  it('keeps the player’s touches to itself: no swipe-to-reply, no long press', () => {
    render(<VideoMessage attachment={video()} source={SOURCE} />);
    expect(screen.getByTestId('video-message')).toHaveAttribute('data-no-swipe');
  });

  it('leaves a link that already has a fragment alone', () => {
    render(<VideoMessage attachment={video({ url: 'https://files.test/a.mp4#t=5' })} source={SOURCE} />);
    expect(el().getAttribute('src')).toBe('https://files.test/a.mp4#t=5');
  });
});

describe('a video in a message', () => {
  const message = (over: Parameters<typeof makeMessage>[0] = {}) =>
    makeMessage({
      id: 'vid-msg',
      senderId: 'system-user',
      senderRole: 'admin',
      senderName: 'MDG',
      system: true,
      body: 'How Dealer Kavach works — a short video',
      attachments: [video()],
      ...over,
    });

  it('is a player with the caption below, never a download row', () => {
    const { container } = render(<MessageBubble message={message()} mine={false} />);
    const player = screen.getByTestId('video-message');
    const caption = screen.getByText('How Dealer Kavach works — a short video');
    expect(player.compareDocumentPosition(caption) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // A document row is a button carrying the file's name and size; there is none.
    expect(screen.queryByRole('button', { name: /app-tour-hi-v1\.mp4/ })).toBeNull();
    expect(container.textContent).not.toContain('MB');
  });

  it('is as wide as a picture bubble', () => {
    const { container } = render(<MessageBubble message={message()} mine={false} />);
    expect(container.innerHTML).toContain('w-[min(80%,330px)]');
  });

  it('with no caption the time still has a line of its own', () => {
    const { container } = render(<MessageBubble message={message({ body: undefined })} mine={false} />);
    expect(screen.getByTestId('video-message')).toBeInTheDocument();
    expect(container.querySelector('.justify-between')).toBeTruthy();
  });

  it('re-signs through its message', async () => {
    h.fresh.mockResolvedValue('https://files.test/fresh.mp4?sig=2');
    render(<MessageBubble message={message()} mine={false} />);
    fireEvent.error(el());
    await waitFor(() => expect(el().getAttribute('src')).toContain('sig=2'));
    expect(h.fresh).toHaveBeenCalledWith(expect.anything(), {
      conversationId: 'c1',
      messageId: 'vid-msg',
    });
  });

  it('a pdf beside it is still a document row', () => {
    render(
      <MessageBubble
        message={message({
          attachments: [
            video(),
            video({ storageKey: 'k2', filename: 'rates.pdf', contentType: 'application/pdf', durationMs: undefined }),
          ],
        })}
        mine={false}
      />,
    );
    expect(screen.getAllByTestId('video-message')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /rates\.pdf/ })).toBeInTheDocument();
  });
});

describe('splitAttachments with a video', () => {
  const at = (over: Partial<Attachment>): Attachment => ({ ...video(), ...over });
  it('sorts a video by its content type, whatever its kind says', () => {
    const out = splitAttachments([
      at({ storageKey: 'v', contentType: 'video/mp4', kind: 'file' }),
      at({ storageKey: 'v2', contentType: 'VIDEO/webm', kind: 'file' }),
      at({ storageKey: 'd', contentType: 'application/pdf', kind: 'file' }),
      at({ storageKey: 'i', contentType: 'image/jpeg', kind: 'image' }),
      at({ storageKey: 'a', contentType: 'audio/webm', kind: 'audio' }),
    ]);
    expect(out.videos.map((a) => a.storageKey)).toEqual(['v', 'v2']);
    expect(out.docs.map((a) => a.storageKey)).toEqual(['d']);
    expect(out.images.map((a) => a.storageKey)).toEqual(['i']);
    expect(out.voices.map((a) => a.storageKey)).toEqual(['a']);
  });

  it('a voice note recorded as video/webm is still a voice note', () => {
    const out = splitAttachments([at({ kind: 'audio', contentType: 'video/webm' })]);
    expect(out.voices).toHaveLength(1);
    expect(out.videos).toHaveLength(0);
  });
});

describe('quoting a video', () => {
  const t = (k: string) => (k === 'chat.replyVideo' ? 'Video' : k === 'chat.replyFile' ? 'File' : k);
  it('says Video with a video icon, not the file name', () => {
    const p = replyPreview(
      { messageId: 'm', senderId: 's', attachmentKind: 'file', attachmentName: 'app-tour-hi-v1.mp4' },
      t as never,
    );
    expect(p).toEqual({ text: 'Video', icon: 'video' });
  });
  it('a captioned video keeps the caption and gets the video icon', () => {
    const p = replyPreview(
      { messageId: 'm', senderId: 's', body: 'Short video', attachmentKind: 'file', attachmentName: 'a.MOV' },
      t as never,
    );
    expect(p).toEqual({ text: 'Short video', icon: 'video' });
  });
  it('a pdf is still a file', () => {
    const p = replyPreview(
      { messageId: 'm', senderId: 's', attachmentKind: 'file', attachmentName: 'rates.pdf' },
      t as never,
    );
    expect(p).toEqual({ text: 'rates.pdf', icon: 'file' });
  });
});
