import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useLangStore } from '@/store/lang';
import { renderWithProviders } from '@/test/utils';

import { MediaViewer, type MediaViewerItem, type MediaViewerProps } from './MediaViewer';

// Unmount BEFORE the shared teardown resets the language store: that reset runs
// first otherwise, and re-renders a still-mounted component outside `act`.
afterEach(() => cleanup());

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ api }));

/** One picture of a conversation. `n` orders them: pic1 is the oldest. */
function pic(n: number, over: Partial<MediaViewerItem> = {}): MediaViewerItem {
  return {
    key: `m${n}:chat/c1/uuid-pic${n}.jpg`,
    attachment: {
      storageKey: `chat/c1/uuid-pic${n}.jpg`,
      filename: `pic${n}.jpg`,
      contentType: 'image/jpeg',
      size: 1000,
      kind: 'image',
      // Presigned URL captured at fetch time — may be EXPIRED by open time.
      url: `https://s3.test/pic${n}?sig=old`,
    },
    source: { conversationId: 'c1', messageId: `m${n}` },
    senderLabel: `Sender ${n}`,
    // A fixed day long past, so "today" and "yesterday" never creep in.
    createdAt: new Date(2024, 2, 5, 15, 40).toISOString(),
    ...over,
  };
}

const three = [pic(1), pic(2), pic(3)];

function renderViewer(props: Partial<MediaViewerProps> = {}) {
  const onClose = props.onClose ?? vi.fn();
  const utils = renderWithProviders(
    <MediaViewer items={three} initialKey={three[0]!.key} onClose={onClose} {...props} />,
    { withRouter: false },
  );
  return { ...utils, onClose };
}

/**
 * jsdom lays nothing out: every element is 0×0 and every rect is the origin. The
 * viewer measures its frame, the strip and the picture on each gesture, so give
 * it a phone — 360×720 with a 360×480 picture in it — and let the touches be
 * real. Every slide is laid out, not just the one on screen, because a page turn
 * makes a neighbour the active one.
 */
function layOut(): void {
  const root = screen.getByTestId('media-viewer');
  Object.defineProperty(root, 'clientWidth', { value: 360, configurable: true });
  Object.defineProperty(root, 'clientHeight', { value: 720, configurable: true });
  for (const frame of document.querySelectorAll<HTMLElement>('[data-testid^="viewer-frame"]')) {
    Object.defineProperty(frame, 'clientWidth', { value: 360, configurable: true });
    Object.defineProperty(frame, 'clientHeight', { value: 720, configurable: true });
    frame.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 360, height: 720, right: 360, bottom: 720, x: 0, y: 0 }) as DOMRect;
    const img = frame.querySelector('img');
    if (img) {
      Object.defineProperty(img, 'offsetWidth', { value: 360, configurable: true });
      Object.defineProperty(img, 'offsetHeight', { value: 480, configurable: true });
    }
  }
}

const touch = (x: number, y: number) => ({ clientX: x, clientY: y });

const frame = () => screen.getByTestId('viewer-frame');
const activeImg = () => within(frame()).getByRole('img');
const track = () => screen.getByTestId('viewer-track');
const backdrop = () => screen.getByTestId('media-viewer').firstElementChild as HTMLElement;

function tap(el: HTMLElement, x: number, y: number): void {
  fireEvent.touchStart(el, { touches: [touch(x, y)] });
  fireEvent.touchEnd(el, { touches: [] });
}

/**
 * The clock the viewer reads release speed from. A real drag takes tens of
 * milliseconds a move; fireEvent takes none, which would make every test drag an
 * infinitely fast flick — so time is ours to advance, and `drag` takes 100ms a
 * step like an unhurried thumb.
 */
let clock = 0;

/** A one-finger drag from `from` to `to`, in two moves, then lift. */
function drag(
  el: HTMLElement,
  from: [number, number],
  to: [number, number],
  stepMs = 100,
): void {
  fireEvent.touchStart(el, { touches: [touch(...from)] });
  const mid: [number, number] = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
  clock += stepMs;
  fireEvent.touchMove(el, { touches: [touch(...mid)] });
  clock += stepMs;
  fireEvent.touchMove(el, { touches: [touch(...to)] });
  fireEvent.touchEnd(el, { touches: [] });
}

function scaleOf(img: HTMLElement): number {
  const m = /scale\(([\d.]+)\)/.exec(img.style.transform);
  return m ? Number(m[1]) : NaN;
}

/** Let a page turn / spring-back / swipe-away finish (it takes 180ms). */
const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 230));
  });

beforeEach(() => {
  useLangStore.setState({ lang: 'en', explicit: true });
  api.get.mockReset();
  clock = 1_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => clock);
});

describe('MediaViewer — the picture', () => {
  it('renders the embedded URL on the happy path (no refetch)', () => {
    renderViewer();
    expect(screen.getByAltText('pic1.jpg')).toHaveAttribute('src', 'https://s3.test/pic1?sig=old');
    expect(api.get).not.toHaveBeenCalled();
  });

  it('opens on the picture that was tapped, not the first', () => {
    renderViewer({ initialKey: three[1]!.key });
    expect(activeImg()).toHaveAttribute('alt', 'pic2.jpg');
    expect(screen.getByText('Sender 2')).toBeInTheDocument();
  });

  it('swaps in ONE fresh inline URL when the image errors (expired presign)', async () => {
    api.get.mockResolvedValue({ url: 'https://s3.test/fresh?sig=new' });
    renderViewer();
    const img = screen.getByAltText('pic1.jpg');
    fireEvent.error(img);
    await waitFor(() => expect(img).toHaveAttribute('src', 'https://s3.test/fresh?sig=new'));
    // Inline disposition: no `disposition` param on the presign request.
    expect(api.get).toHaveBeenCalledWith('/v1/conversations/c1/messages/m1/download-url', {
      key: 'chat/c1/uuid-pic1.jpg',
    });

    // A genuinely dead key must NOT refetch forever — one retry only.
    fireEvent.error(img);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('says so, in words and with a button, when the refresh itself fails', async () => {
    api.get.mockRejectedValue(new Error('offline'));
    renderViewer();
    const img = screen.getByAltText('pic1.jpg');
    fireEvent.error(img);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    // No crash, no loop: the broken picture stays and the reader is told.
    expect(img).toHaveAttribute('src', 'https://s3.test/pic1?sig=old');
    fireEvent.error(img);
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/This picture didn't open/)).toBeInTheDocument();

    // …and the button asks again.
    api.get.mockResolvedValue({ url: 'https://s3.test/again?sig=new' });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(img).toHaveAttribute('src', 'https://s3.test/again?sig=new'));
  });

  it('fetches a link itself for a picture that arrived without one', async () => {
    api.get.mockResolvedValue({ url: 'https://s3.test/signed?sig=new' });
    const bare = pic(1);
    bare.attachment = { ...bare.attachment, url: undefined };
    renderViewer({ items: [bare, pic(2)], initialKey: bare.key });
    await waitFor(() =>
      expect(screen.getByAltText('pic1.jpg')).toHaveAttribute('src', 'https://s3.test/signed?sig=new'),
    );
    // Through the message, inline — and only for the picture that needed it.
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith('/v1/conversations/c1/messages/m1/download-url', {
      key: 'chat/c1/uuid-pic1.jpg',
    });
  });

  it('says so, with a button, when a link-less picture cannot be signed', async () => {
    api.get.mockRejectedValue(new Error('offline'));
    const bare = pic(1);
    bare.attachment = { ...bare.attachment, url: undefined };
    renderViewer({ items: [bare], initialKey: bare.key });
    expect(await screen.findByText(/This picture didn't open/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('shows a spinner until the picture has loaded', () => {
    renderViewer();
    // The picture on screen is the first slide; its neighbour is loading too.
    const [active] = screen.getAllByTestId('viewer-slide');
    expect(within(active!).getByLabelText('Loading')).toBeInTheDocument();
    fireEvent.load(screen.getByAltText('pic1.jpg'));
    expect(within(active!).queryByLabelText('Loading')).toBeNull();
  });

  it('preloads the picture either side of the one on screen, and no more', () => {
    const five = [1, 2, 3, 4, 5].map((n) => pic(n));
    renderViewer({ items: five, initialKey: five[2]!.key });
    expect(screen.getByAltText('pic2.jpg')).toBeInTheDocument();
    expect(screen.getByAltText('pic4.jpg')).toBeInTheDocument();
    expect(screen.queryByAltText('pic1.jpg')).toBeNull();
    expect(screen.queryByAltText('pic5.jpg')).toBeNull();
  });
});

describe('MediaViewer — the bars', () => {
  it('shows who sent it and when, from the message', () => {
    // 5 Mar 2024, 3:40 pm — neither today nor yesterday.
    renderViewer({ items: [pic(1, { senderLabel: 'MDG' })] });
    expect(screen.getByText('MDG')).toBeInTheDocument();
    expect(screen.getByText('5 Mar 2024, 3:40 pm')).toBeInTheDocument();
  });

  it('puts the caption at the bottom, three lines until it is tapped', () => {
    const long = 'Pump 2 reading '.repeat(30).trim();
    renderViewer({ items: [pic(1, { caption: long })] });
    const button = screen.getByRole('button', { expanded: false, name: long });
    expect(button.firstElementChild).toHaveClass('line-clamp-3');
    fireEvent.click(button);
    expect(screen.getByRole('button', { expanded: true, name: long }).firstElementChild).not.toHaveClass(
      'line-clamp-3',
    );
  });

  it('draws no caption when the message had none', () => {
    renderViewer({ items: [pic(1)] });
    expect(screen.queryByRole('button', { expanded: false })).toBeNull();
  });

  it('hands the download the message the picture came from', () => {
    const onDownload = vi.fn();
    renderViewer({ onDownload });
    fireEvent.click(screen.getByLabelText('Download'));
    expect(onDownload).toHaveBeenCalledWith(three[0]!.attachment, three[0]!.source);
  });

  it('has no download button when the caller offers none', () => {
    renderViewer();
    expect(screen.queryByLabelText('Download')).toBeNull();
  });

  it('closes from the ← in the bar', () => {
    const { onClose } = renderViewer();
    fireEvent.click(screen.getByLabelText('Back'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on the phone’s Back button', () => {
    const { onClose } = renderViewer();
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a tap hides the bars and the next tap brings them back — a drag does not', async () => {
    renderViewer({ items: [pic(1, { caption: 'a caption' })] });
    layOut();
    const bar = screen.getByText('Sender 1').closest('div[class*="transition-opacity"]')!;
    expect(bar).not.toHaveClass('opacity-0');

    tap(frame(), 180, 400);
    await waitFor(() => expect(bar).toHaveClass('opacity-0'));
    // Well past the double-tap window, so it is a second single tap.
    clock += 1000;
    tap(frame(), 180, 400);
    await waitFor(() => expect(bar).not.toHaveClass('opacity-0'));

    // A swipe that turns nothing is not a tap.
    drag(frame(), [180, 400], [210, 400]);
    await new Promise((r) => setTimeout(r, 350));
    expect(bar).not.toHaveClass('opacity-0');
  });

  it('a double-tap zooms and does not flash the bars on the way', async () => {
    renderViewer();
    layOut();
    const bar = screen.getByText('Sender 1').closest('div[class*="transition-opacity"]')!;
    tap(frame(), 180, 400);
    tap(frame(), 180, 400);
    expect(scaleOf(activeImg())).toBeGreaterThan(2);
    await new Promise((r) => setTimeout(r, 350));
    expect(bar).not.toHaveClass('opacity-0');
  });

  it('offers "Show in chat" in the ⋮, and only when the caller handles it', () => {
    const onShowInChat = vi.fn();
    const { unmount } = renderViewer({ onShowInChat, initialKey: three[1]!.key });
    fireEvent.click(screen.getByLabelText('More options'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Show in chat' }));
    expect(onShowInChat).toHaveBeenCalledWith(three[1]);
    unmount();

    renderViewer();
    expect(screen.queryByLabelText('More options')).toBeNull();
  });
});

describe('MediaViewer — zoom', () => {
  it('double-tap zooms in, and a second double-tap comes all the way back out', () => {
    renderViewer();
    layOut();
    expect(scaleOf(activeImg())).toBe(1);

    tap(frame(), 180, 400);
    tap(frame(), 180, 400);
    expect(scaleOf(activeImg())).toBeGreaterThan(2);

    tap(frame(), 180, 400);
    tap(frame(), 180, 400);
    expect(scaleOf(activeImg())).toBe(1);
  });

  it('a single tap is not a zoom, and taps far apart are not a double-tap', () => {
    renderViewer();
    layOut();
    tap(frame(), 100, 300);
    expect(scaleOf(activeImg())).toBe(1);
    // Second tap on the far side of the screen — a different place.
    tap(frame(), 300, 650);
    expect(scaleOf(activeImg())).toBe(1);
  });

  it('pinching apart zooms, and the picture can then be dragged', () => {
    renderViewer();
    layOut();
    fireEvent.touchStart(frame(), { touches: [touch(130, 360), touch(230, 360)] });
    fireEvent.touchMove(frame(), { touches: [touch(80, 360), touch(280, 360)] });
    fireEvent.touchEnd(frame(), { touches: [] });
    expect(scaleOf(activeImg())).toBeCloseTo(2, 5);

    // 2× on a 360-wide card in a 360-wide frame leaves 180px of overhang, so a
    // 60px drag moves it 60px and a 400px drag stops at the edge.
    fireEvent.touchStart(frame(), { touches: [touch(180, 360)] });
    fireEvent.touchMove(frame(), { touches: [touch(240, 360)] });
    fireEvent.touchEnd(frame(), { touches: [] });
    expect(activeImg().style.transform).toContain('translate3d(60px');

    fireEvent.touchStart(frame(), { touches: [touch(180, 360)] });
    fireEvent.touchMove(frame(), { touches: [touch(900, 360)] });
    fireEvent.touchEnd(frame(), { touches: [] });
    expect(activeImg().style.transform).toContain('translate3d(180px');
  });

  it('an unzoomed picture is never dragged off centre — the drag moves the strip', () => {
    renderViewer({ initialKey: three[1]!.key });
    layOut();
    fireEvent.touchStart(frame(), { touches: [touch(180, 360)] });
    fireEvent.touchMove(frame(), { touches: [touch(120, 362)] });
    fireEvent.touchMove(frame(), { touches: [touch(60, 364)] });
    expect(activeImg().style.transform).toBe('translate3d(0px, 0px, 0) scale(1)');
    expect(track().style.transform).toBe('translate3d(-120px, 0px, 0)');
    fireEvent.touchEnd(frame(), { touches: [] });
  });

  it('offers a way back out only once there is something to undo', () => {
    renderViewer();
    layOut();
    expect(screen.queryByText('Fit to screen')).toBeNull();

    tap(frame(), 180, 400);
    tap(frame(), 180, 400);
    fireEvent.click(screen.getByText('Fit to screen'));
    expect(scaleOf(activeImg())).toBe(1);
    expect(screen.queryByText('Fit to screen')).toBeNull();
  });

  it('shows the next picture’s caption again when a key press turns the page from a zoomed one', async () => {
    renderViewer({
      items: [pic(1, { caption: 'first caption' }), pic(2, { caption: 'second caption' })],
    });
    layOut();
    tap(frame(), 180, 400);
    tap(frame(), 180, 400);
    expect(screen.queryByText('first caption')).toBeNull();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    await settle();
    expect(screen.getByText('second caption')).toBeInTheDocument();
  });

  it('hides the caption while zoomed so it cannot sit over the picture', () => {
    renderViewer({ items: [pic(1, { caption: 'a caption' })] });
    layOut();
    expect(screen.getByText('a caption')).toBeInTheDocument();
    tap(frame(), 180, 400);
    tap(frame(), 180, 400);
    expect(screen.queryByText('a caption')).toBeNull();
  });
});

describe('MediaViewer — paging', () => {
  it('a swipe left turns to the NEXT picture (newer)', async () => {
    renderViewer();
    layOut();
    drag(frame(), [300, 400], [100, 400]);
    await settle();
    expect(activeImg()).toHaveAttribute('alt', 'pic2.jpg');
    expect(screen.getByText('Sender 2')).toBeInTheDocument();
    // The strip is re-centred on the new picture.
    expect(track().style.transform).toBe('translate3d(0px, 0px, 0)');
  });

  it('a swipe right turns back to the PREVIOUS picture (older)', async () => {
    renderViewer({ initialKey: three[1]!.key });
    layOut();
    drag(frame(), [100, 400], [300, 400]);
    await settle();
    expect(activeImg()).toHaveAttribute('alt', 'pic1.jpg');
  });

  it('turns more than once, in order, one picture per swipe', async () => {
    renderViewer();
    layOut();
    drag(frame(), [300, 400], [100, 400]);
    await settle();
    layOut();
    drag(frame(), [300, 400], [100, 400]);
    await settle();
    expect(activeImg()).toHaveAttribute('alt', 'pic3.jpg');
  });

  it('a short drag puts the page back', async () => {
    renderViewer({ initialKey: three[1]!.key });
    layOut();
    drag(frame(), [200, 400], [150, 400]);
    await settle();
    expect(activeImg()).toHaveAttribute('alt', 'pic2.jpg');
    expect(track().style.transform).toBe('translate3d(0px, 0px, 0)');
  });

  it('gives a little against the last picture and stays on it', async () => {
    renderViewer({ initialKey: three[2]!.key });
    layOut();
    fireEvent.touchStart(frame(), { touches: [touch(300, 400)] });
    fireEvent.touchMove(frame(), { touches: [touch(200, 400)] });
    fireEvent.touchMove(frame(), { touches: [touch(100, 400)] });
    // 200px of finger, 30% of it on screen.
    expect(track().style.transform).toBe('translate3d(-60px, 0px, 0)');
    fireEvent.touchEnd(frame(), { touches: [] });
    await settle();
    expect(activeImg()).toHaveAttribute('alt', 'pic3.jpg');
  });

  it('a swipe while ZOOMED pans the picture instead of turning the page', async () => {
    renderViewer({ initialKey: three[1]!.key });
    layOut();
    fireEvent.touchStart(frame(), { touches: [touch(130, 360), touch(230, 360)] });
    fireEvent.touchMove(frame(), { touches: [touch(80, 360), touch(280, 360)] });
    fireEvent.touchEnd(frame(), { touches: [] });
    expect(scaleOf(activeImg())).toBeCloseTo(2, 5);

    drag(frame(), [300, 360], [100, 360]);
    await settle();
    // Still on pic2; the picture moved inside its frame, the strip did not.
    expect(activeImg()).toHaveAttribute('alt', 'pic2.jpg');
    expect(activeImg().style.transform).toContain('translate3d(-180px');
    expect(track().style.transform).toBe('translate3d(0px, 0px, 0)');
  });

  it('a second finger landing mid-swipe cancels the swipe and starts a pinch', async () => {
    renderViewer({ initialKey: three[1]!.key });
    layOut();
    fireEvent.touchStart(frame(), { touches: [touch(300, 400)] });
    fireEvent.touchMove(frame(), { touches: [touch(250, 400)] });
    fireEvent.touchMove(frame(), { touches: [touch(200, 400)] });
    expect(track().style.transform).toBe('translate3d(-100px, 0px, 0)');
    fireEvent.touchStart(frame(), { touches: [touch(200, 400), touch(260, 400)] });
    await settle();
    expect(track().style.transform).toBe('translate3d(0px, 0px, 0)');
    expect(activeImg()).toHaveAttribute('alt', 'pic2.jpg');
  });

  it('the arrow keys turn the page and Escape closes', async () => {
    const { onClose } = renderViewer();
    layOut();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    await settle();
    expect(activeImg()).toHaveAttribute('alt', 'pic2.jpg');
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    await settle();
    expect(activeImg()).toHaveAttribute('alt', 'pic1.jpg');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('leaves the arrow keys to a text box that has focus', async () => {
    renderViewer();
    layOut();
    const box = document.createElement('textarea');
    document.body.appendChild(box);
    fireEvent.keyDown(box, { key: 'ArrowRight' });
    await settle();
    expect(activeImg()).toHaveAttribute('alt', 'pic1.jpg');
    box.remove();
  });

  it('keeps the reader on the same picture when older ones are put in front', () => {
    const { rerender, onClose } = renderViewer({
      items: [pic(3), pic(4), pic(5)],
      initialKey: pic(4).key,
    });
    expect(activeImg()).toHaveAttribute('alt', 'pic4.jpg');
    // The thread paged older messages in: two pictures now precede the first.
    rerender(
      <MediaViewer
        items={[pic(1), pic(2), pic(3), pic(4), pic(5)]}
        initialKey={pic(4).key}
        onClose={onClose}
      />,
    );
    expect(activeImg()).toHaveAttribute('alt', 'pic4.jpg');
    expect(screen.getByText('Sender 4')).toBeInTheDocument();
    // …and the picture before it is now pic3, with pic2 beyond the preload.
    expect(screen.getByAltText('pic3.jpg')).toBeInTheDocument();
  });

  it('stays at the same place when the picture it was on is swapped for another key', () => {
    // An optimistic copy replaced by the server's: same position, new key.
    const { rerender, onClose } = renderViewer({
      items: [pic(1), pic(2), pic(3)],
      initialKey: pic(2).key,
    });
    rerender(
      <MediaViewer
        items={[pic(1), pic(22), pic(3)]}
        initialKey={pic(2).key}
        onClose={onClose}
      />,
    );
    expect(activeImg()).toHaveAttribute('alt', 'pic22.jpg');
  });
});

describe('MediaViewer — older pictures', () => {
  it('asks for older ones the moment the reader is on the first picture', () => {
    const onNeedOlder = vi.fn();
    renderViewer({ hasOlder: true, onNeedOlder });
    expect(onNeedOlder).toHaveBeenCalledTimes(1);
  });

  it('does not ask while on any later picture, or with nothing older, or mid-load', () => {
    const onNeedOlder = vi.fn();
    const a = renderViewer({ hasOlder: true, onNeedOlder, initialKey: three[1]!.key });
    a.unmount();
    const b = renderViewer({ hasOlder: false, onNeedOlder });
    b.unmount();
    renderViewer({ hasOlder: true, loadingOlder: true, onNeedOlder });
    expect(onNeedOlder).not.toHaveBeenCalled();
  });

  it('asks when a swipe reaches the first picture', async () => {
    const onNeedOlder = vi.fn();
    renderViewer({ hasOlder: true, onNeedOlder, initialKey: three[1]!.key });
    layOut();
    expect(onNeedOlder).not.toHaveBeenCalled();
    drag(frame(), [100, 400], [300, 400]);
    await settle();
    expect(activeImg()).toHaveAttribute('alt', 'pic1.jpg');
    expect(onNeedOlder).toHaveBeenCalledTimes(1);
  });

  it('does not hammer a request that came back with nothing new', () => {
    const onNeedOlder = vi.fn();
    const { rerender, onClose } = renderViewer({ hasOlder: true, onNeedOlder });
    expect(onNeedOlder).toHaveBeenCalledTimes(1);
    // The request ran and settled: still the same pictures, still "maybe more".
    rerender(
      <MediaViewer
        items={three}
        initialKey={three[0]!.key}
        onClose={onClose}
        hasOlder
        loadingOlder
        onNeedOlder={onNeedOlder}
      />,
    );
    rerender(
      <MediaViewer
        items={three}
        initialKey={three[0]!.key}
        onClose={onClose}
        hasOlder
        onNeedOlder={onNeedOlder}
      />,
    );
    expect(onNeedOlder).toHaveBeenCalledTimes(1);
  });

  it('a pull on the first picture tries again', async () => {
    const onNeedOlder = vi.fn();
    renderViewer({ hasOlder: true, onNeedOlder });
    layOut();
    expect(onNeedOlder).toHaveBeenCalledTimes(1);
    drag(frame(), [100, 400], [300, 400]);
    await settle();
    expect(onNeedOlder).toHaveBeenCalledTimes(2);
  });

  it('says it is getting older pictures while it does', () => {
    renderViewer({ hasOlder: true, loadingOlder: true });
    expect(screen.getByText('Getting older pictures…')).toBeInTheDocument();
  });
});

describe('MediaViewer — swipe down', () => {
  it('carries the picture with the finger and fades the backdrop', () => {
    renderViewer();
    layOut();
    fireEvent.touchStart(frame(), { touches: [touch(180, 200)] });
    fireEvent.touchMove(frame(), { touches: [touch(180, 260)] });
    fireEvent.touchMove(frame(), { touches: [touch(180, 400)] });
    expect(track().style.transform).toBe('translate3d(0px, 200px, 0)');
    expect(Number(backdrop().style.opacity)).toBeLessThan(1);
    expect(Number(backdrop().style.opacity)).toBeGreaterThan(0);
    fireEvent.touchEnd(frame(), { touches: [] });
  });

  it('closes when it has been dragged far enough', async () => {
    const { onClose } = renderViewer();
    layOut();
    drag(frame(), [180, 200], [180, 500]);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('springs back, and stays open, when it was only nudged', async () => {
    const { onClose } = renderViewer();
    layOut();
    drag(frame(), [180, 200], [180, 260]);
    await settle();
    expect(onClose).not.toHaveBeenCalled();
    expect(track().style.transform).toBe('translate3d(0px, 0px, 0)');
    expect(backdrop().style.opacity).toBe('1');
  });

  it('a swipe UP does not move the picture or close anything', async () => {
    const { onClose } = renderViewer();
    layOut();
    fireEvent.touchStart(frame(), { touches: [touch(180, 500)] });
    fireEvent.touchMove(frame(), { touches: [touch(180, 400)] });
    fireEvent.touchMove(frame(), { touches: [touch(180, 200)] });
    expect(track().style.transform).toBe('translate3d(0px, 0px, 0)');
    fireEvent.touchEnd(frame(), { touches: [] });
    await settle();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a drag that starts down but wanders sideways is still a dismiss, not a page turn', async () => {
    const { onClose } = renderViewer({ initialKey: three[1]!.key });
    layOut();
    fireEvent.touchStart(frame(), { touches: [touch(180, 200)] });
    fireEvent.touchMove(frame(), { touches: [touch(185, 250)] });
    // Axis is settled as vertical; a big sideways drift afterwards changes nothing.
    fireEvent.touchMove(frame(), { touches: [touch(40, 520)] });
    fireEvent.touchEnd(frame(), { touches: [] });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(activeImg()).toHaveAttribute('alt', 'pic2.jpg');
  });
});

describe('MediaViewer — nothing to show', () => {
  it('leaves when it holds nothing', () => {
    const onClose = vi.fn();
    renderWithProviders(<MediaViewer items={[]} initialKey="x" onClose={onClose} />, {
      withRouter: false,
    });
    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByTestId('media-viewer')).toBeNull();
  });
});
