import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/test/utils';
import type { Attachment } from '@dk/shared/types';

import { ImageLightbox } from './ImageLightbox';

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ api }));

/** The message the picture hangs off — how a fresh URL gets authorised. */
const source = { conversationId: 'c1', messageId: 'm1' };

const attachment: Attachment = {
  storageKey: 'chat/c1/uuid-pic.jpg',
  filename: 'pic.jpg',
  contentType: 'image/jpeg',
  size: 1000,
  kind: 'image',
  // Presigned URL captured at fetch time — may be EXPIRED by open time.
  url: 'https://s3.test/expired?sig=old',
};

describe('ImageLightbox', () => {
  it('renders the embedded URL on the happy path (no refetch)', () => {
    api.get.mockReset();
    renderWithProviders(
      <ImageLightbox attachment={attachment} source={source} onClose={() => {}} />,
      { withRouter: false },
    );
    expect(screen.getByAltText('pic.jpg')).toHaveAttribute(
      'src',
      'https://s3.test/expired?sig=old',
    );
    expect(api.get).not.toHaveBeenCalled();
  });

  it('swaps in ONE fresh inline URL when the image errors (expired presign)', async () => {
    api.get.mockReset();
    api.get.mockResolvedValue({ url: 'https://s3.test/fresh?sig=new' });
    renderWithProviders(
      <ImageLightbox attachment={attachment} source={source} onClose={() => {}} />,
      { withRouter: false },
    );
    const img = screen.getByAltText('pic.jpg');
    fireEvent.error(img);
    await waitFor(() =>
      expect(img).toHaveAttribute('src', 'https://s3.test/fresh?sig=new'),
    );
    // Inline disposition: no `disposition` param on the presign request.
    expect(api.get).toHaveBeenCalledWith(
      '/v1/conversations/c1/messages/m1/download-url',
      { key: attachment.storageKey },
    );

    // A genuinely dead key must NOT refetch forever — one retry only.
    fireEvent.error(img);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('keeps the broken image (no crash, no loop) when the refresh itself fails', async () => {
    api.get.mockReset();
    api.get.mockRejectedValue(new Error('offline'));
    renderWithProviders(
      <ImageLightbox attachment={attachment} source={source} onClose={() => {}} />,
      { withRouter: false },
    );
    const img = screen.getByAltText('pic.jpg');
    fireEvent.error(img);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    expect(img).toHaveAttribute('src', 'https://s3.test/expired?sig=old');
    fireEvent.error(img);
    expect(api.get).toHaveBeenCalledTimes(1);
  });
});

/**
 * jsdom lays nothing out: every element is 0×0 and every rect is the origin. The
 * viewer measures the frame and the picture on each gesture, so give it a phone
 * with a DSR card in it — 360×720 holding a 360×480 image — and let the touches
 * be real.
 */
function layOut(): { frame: HTMLElement; img: HTMLElement } {
  const frame = screen.getByTestId('lightbox-frame');
  const img = screen.getByAltText('pic.jpg');
  Object.defineProperty(frame, 'clientWidth', { value: 360, configurable: true });
  Object.defineProperty(frame, 'clientHeight', { value: 720, configurable: true });
  frame.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 360, height: 720, right: 360, bottom: 720, x: 0, y: 0 }) as DOMRect;
  Object.defineProperty(img, 'offsetWidth', { value: 360, configurable: true });
  Object.defineProperty(img, 'offsetHeight', { value: 480, configurable: true });
  return { frame, img };
}

const touch = (x: number, y: number) => ({ clientX: x, clientY: y });

function tap(frame: HTMLElement, x: number, y: number): void {
  fireEvent.touchStart(frame, { touches: [touch(x, y)] });
  fireEvent.touchEnd(frame, { touches: [] });
}

function scaleOf(img: HTMLElement): number {
  const m = /scale\(([\d.]+)\)/.exec(img.style.transform);
  return m ? Number(m[1]) : NaN;
}

describe('ImageLightbox gestures', () => {
  it('double-tap zooms in, and a second double-tap comes all the way back out', () => {
    api.get.mockReset();
    renderWithProviders(
      <ImageLightbox attachment={attachment} source={source} onClose={() => {}} />,
      { withRouter: false },
    );
    const { frame, img } = layOut();
    expect(scaleOf(img)).toBe(1);

    tap(frame, 180, 400);
    tap(frame, 180, 400);
    expect(scaleOf(img)).toBeGreaterThan(2);

    tap(frame, 180, 400);
    tap(frame, 180, 400);
    expect(scaleOf(img)).toBe(1);
  });

  it('a single tap is not a zoom, and taps far apart are not a double-tap', () => {
    renderWithProviders(
      <ImageLightbox attachment={attachment} source={source} onClose={() => {}} />,
      { withRouter: false },
    );
    const { frame, img } = layOut();
    tap(frame, 100, 300);
    expect(scaleOf(img)).toBe(1);
    // Second tap on the far side of the screen — a different place, not a
    // double-tap.
    tap(frame, 300, 650);
    expect(scaleOf(img)).toBe(1);
  });

  it('pinching apart zooms, and the picture can then be dragged', () => {
    renderWithProviders(
      <ImageLightbox attachment={attachment} source={source} onClose={() => {}} />,
      { withRouter: false },
    );
    const { frame, img } = layOut();

    fireEvent.touchStart(frame, { touches: [touch(130, 360), touch(230, 360)] });
    fireEvent.touchMove(frame, { touches: [touch(80, 360), touch(280, 360)] });
    fireEvent.touchEnd(frame, { touches: [] });
    expect(scaleOf(img)).toBeCloseTo(2, 5);

    // 2× on a 360-wide card in a 360-wide frame leaves 180px of overhang, so a
    // 60px drag moves it 60px and a 400px drag stops at the edge.
    fireEvent.touchStart(frame, { touches: [touch(180, 360)] });
    fireEvent.touchMove(frame, { touches: [touch(240, 360)] });
    fireEvent.touchEnd(frame, { touches: [] });
    expect(img.style.transform).toContain('translate3d(60px');

    fireEvent.touchStart(frame, { touches: [touch(180, 360)] });
    fireEvent.touchMove(frame, { touches: [touch(900, 360)] });
    fireEvent.touchEnd(frame, { touches: [] });
    expect(img.style.transform).toContain('translate3d(180px');
  });

  it('an unzoomed picture cannot be dragged off centre', () => {
    renderWithProviders(
      <ImageLightbox attachment={attachment} source={source} onClose={() => {}} />,
      { withRouter: false },
    );
    const { frame, img } = layOut();
    fireEvent.touchStart(frame, { touches: [touch(180, 360)] });
    fireEvent.touchMove(frame, { touches: [touch(40, 120)] });
    fireEvent.touchEnd(frame, { touches: [] });
    expect(img.style.transform).toBe('translate3d(0px, 0px, 0) scale(1)');
  });

  it('a drag that ends over the backdrop does not dismiss the viewer', () => {
    const onClose = vi.fn();
    renderWithProviders(
      <ImageLightbox attachment={attachment} source={source} onClose={onClose} />,
      { withRouter: false },
    );
    const { frame } = layOut();
    fireEvent.touchStart(frame, { touches: [touch(180, 360)] });
    fireEvent.touchMove(frame, { touches: [touch(300, 500)] });
    fireEvent.touchEnd(frame, { touches: [] });
    fireEvent.click(frame);
    expect(onClose).not.toHaveBeenCalled();

    // …but a plain tap on the backdrop still does.
    fireEvent.click(frame);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('offers a way back out only once there is something to undo', () => {
    renderWithProviders(
      <ImageLightbox attachment={attachment} source={source} onClose={() => {}} />,
      { withRouter: false },
    );
    const { frame, img } = layOut();
    expect(screen.queryByText('पूरी तस्वीर दिखाएँ')).toBeNull();

    tap(frame, 180, 400);
    tap(frame, 180, 400);
    const reset = screen.getByText('पूरी तस्वीर दिखाएँ');
    fireEvent.click(reset);
    expect(scaleOf(img)).toBe(1);
    expect(screen.queryByText('पूरी तस्वीर दिखाएँ')).toBeNull();
  });

  it('hands the download the message the picture came from', () => {
    const onDownload = vi.fn();
    renderWithProviders(
      <ImageLightbox
        attachment={attachment}
        source={source}
        onClose={() => {}}
        onDownload={onDownload}
      />,
      { withRouter: false },
    );
    fireEvent.click(screen.getByLabelText('डाउनलोड करें'));
    expect(onDownload).toHaveBeenCalledWith(attachment, source);
  });
});
