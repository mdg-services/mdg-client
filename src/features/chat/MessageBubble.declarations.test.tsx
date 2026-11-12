import { onlineManager } from '@tanstack/react-query';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { declarationsKey } from '@/hooks/api/useDeclarations';
import { ApiError } from '@/lib/api';
import { ImageRejected } from '@/lib/squeezeImage';
import { useLangStore } from '@/store/lang';
import {
  makeCollect,
  makeDeclarationsView,
  makeWashroomCycle,
  makeWashroomPhoto,
} from '@/test/declarationsFixtures';
import { makeMessage, renderWithProviders, signIn } from '@/test/utils';
import { declarationsAnswerSchema } from '@dk/shared/schemas';
import type { DeclarationsView } from '@dk/shared/types';

import { MessageBubble } from './MessageBubble';

// The server is a double; the hooks and the box are the real ones. The squeezer is
// a double too: jsdom opens no pictures, and what it does is tested on its own.
const h = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  fetch: vi.fn(),
  squeeze: vi.fn(),
}));
vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<{ ApiError: typeof ApiError }>()),
  api: { get: h.get, post: h.post, put: h.put },
}));
vi.mock('@/lib/squeezeImage', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  squeezeImage: h.squeeze,
}));

const VIEW_PATH = '/v1/me/declarations';
const ANSWER_PATH = '/v1/me/declarations/answer';
const SIGN_PATH = '/v1/uploads/sign';

/** The answers the double will give, in order, and the bodies it was sent. */
let replies: DeclarationsView[] = [];
let answers: unknown[] = [];
let signed: unknown[] = [];

beforeEach(() => {
  useLangStore.setState({ lang: 'en', explicit: false });
  signIn({ role: 'dealer-owner', dealerId: 'd1' });
  replies = [];
  answers = [];
  signed = [];
  h.get.mockReset();
  h.put.mockReset();
  h.fetch.mockReset();
  h.fetch.mockResolvedValue({ ok: true, status: 200, statusText: 'OK' });
  vi.stubGlobal('fetch', h.fetch);
  // The phone squeezes a photo into a JPEG: here, the bytes come back as they went in.
  h.squeeze.mockReset();
  h.squeeze.mockImplementation(async (file: File) => file);
  h.post.mockReset();
  h.post.mockImplementation(async (path: string, body: unknown) => {
    if (path === SIGN_PATH) {
      signed.push(body);
      return {
        uploadUrl: 'https://s3.example.test/put?sig=1',
        storageKey: `declarations/d1/uploads/${signed.length}`,
        expiresIn: 900,
      };
    }
    if (path === ANSWER_PATH) {
      answers.push(body);
      // Whatever goes to the server must be a body its own schema accepts.
      expect(declarationsAnswerSchema.safeParse(body).success, JSON.stringify(body)).toBe(true);
      const next = replies.shift();
      if (!next) throw new Error('no reply left in the double');
      return next;
    }
    throw new Error(`unexpected POST ${path}`);
  });
});
afterEach(() => cleanup());

function declMessage(id = 'decl-msg', body = 'IndianOil wants your washroom photos this week.') {
  return makeMessage({
    id,
    senderId: 'system-user',
    senderRole: 'admin',
    senderName: 'MDG',
    system: true,
    body,
    declarations: {},
  });
}

function box(body = 'IndianOil wants your washroom photos this week.') {
  return renderWithProviders(
    <MessageBubble message={declMessage('decl-msg', body)} mine={false} />,
  );
}

const slotInput = (slot: 'outside' | 'inside') =>
  document.querySelector<HTMLInputElement>(`[data-photo-slot="${slot}"] input[type="file"]`)!;
const jpeg = (name: string, bytes = 3) =>
  new File([new Uint8Array(bytes)], name, { type: 'image/jpeg' });
const fresh = () =>
  screen.getByRole('checkbox', { name: 'These photos were taken today of my own washroom' });

/** A view where the cycle has exactly the photos given. */
const withPhotos = (...slots: Array<'outside' | 'inside'>) =>
  makeDeclarationsView({
    screen: 'collect',
    washroom: makeWashroomCycle({
      state: 'collecting',
      photos: slots.map((s) =>
        makeWashroomPhoto(s, {
          key: `declarations/d1/uploads/${s}`,
          filename: `washroom-${s}.jpg`,
        }),
      ),
    }),
  });

describe('MessageBubble — a Declarations box MDG posted', () => {
  it('asks for the view only when a box is on screen', async () => {
    renderWithProviders(<MessageBubble message={makeMessage({ body: 'hello' })} mine={false} />);
    await Promise.resolve();
    expect(h.get).not.toHaveBeenCalled();
  });

  it("reads the outlet's own view, and draws the words first and the box under them", async () => {
    h.get.mockResolvedValue(makeCollect(0));
    const { container } = box();
    await screen.findByText('IndianOil needs 2 photos of your washroom this week:');
    expect(h.get).toHaveBeenCalledWith(VIEW_PATH);
    const words = screen.getByText('IndianOil wants your washroom photos this week.');
    const inner = container.querySelector('[data-declarations]')!;
    expect(words.compareDocumentPosition(inner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('draws for an empty marker, once, as wide as a request, with its time on its own line', async () => {
    h.get.mockResolvedValue(makeCollect(0));
    const { container } = box();
    await screen.findByText('IndianOil needs 2 photos of your washroom this week:');
    expect(container.querySelectorAll('[data-declarations]')).toHaveLength(1);
    expect(container.innerHTML).toContain('w-[min(80%,330px)]');
    expect(container.querySelector('span[aria-hidden].inline-block')).toBeNull();
    expect(container.querySelector('.absolute.bottom-\\[5px\\]')).toBeNull();
  });

  it('is its own box: no other box is drawn with it, and no other view asked for', async () => {
    h.get.mockResolvedValue(makeCollect(0));
    const { container } = box();
    await screen.findByText('IndianOil needs 2 photos of your washroom this week:');
    expect(container.querySelector('[data-mock-drill]')).toBeNull();
    expect(container.querySelector('[data-du-otp]')).toBeNull();
    expect(container.querySelector('[data-portal-login]')).toBeNull();
    expect(h.get).toHaveBeenCalledTimes(1);
  });

  it('draws the LIVE view: when the server moves it, an old box follows', async () => {
    h.get.mockResolvedValueOnce(makeCollect(2));
    const { queryClient } = box();
    await screen.findByText('IndianOil needs 2 photos of your washroom this week:');
    h.get.mockResolvedValue(
      makeDeclarationsView({ screen: 'done', lastWashroomFiledDay: '2026-11-12' }),
    );
    await queryClient.invalidateQueries({ queryKey: declarationsKey });
    expect(
      await screen.findByText("Filed on IndianOil's portal on 12-11-2026."),
    ).toBeInTheDocument();
    expect(document.querySelector('input')).toBeNull();
  });

  it('works for a manager as it does for an owner', async () => {
    signIn({ role: 'dealer-staff', dealerId: 'd1' });
    h.get.mockResolvedValue(makeCollect(0));
    box();
    expect(
      await screen.findByText('IndianOil needs 2 photos of your washroom this week:'),
    ).toBeInTheDocument();
    expect(h.get).toHaveBeenCalledWith(VIEW_PATH);
  });

  it('shows the words of a failed read, with a way to try again', async () => {
    h.get.mockRejectedValue(new ApiError(500, 'X', 'boom'));
    box();
    expect(await screen.findByText("Couldn't check this just now")).toBeInTheDocument();
    h.get.mockResolvedValue(makeCollect(0));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByText('IndianOil needs 2 photos of your washroom this week:'),
    ).toBeInTheDocument();
  });

  // The whole road once, through the real hooks and the real upload path: outside
  // photo → inside photo → the owner's word → Send. Each answer's reply is the whole
  // fresh view, which is what moves the box on; the view is never asked for again.
  it('walks the whole road, and posts exactly what the contract says', async () => {
    h.get.mockResolvedValue(makeCollect(0));
    replies = [
      withPhotos('outside'),
      withPhotos('outside', 'inside'),
      makeDeclarationsView({
        screen: 'waiting',
        washroom: makeWashroomCycle({ state: 'ready', confirmedDay: '2026-11-12' }),
      }),
    ];
    box();

    await screen.findByText('IndianOil needs 2 photos of your washroom this week:');
    fireEvent.change(slotInput('outside'), { target: { files: [jpeg('IMG_1.jpg')] } });
    await waitFor(() => expect(answers).toHaveLength(1));
    // The first photo is in; the box has moved on by itself.
    expect(await screen.findByText('Added')).toBeInTheDocument();

    fireEvent.change(slotInput('inside'), { target: { files: [jpeg('IMG_2.jpg')] } });
    await waitFor(() => expect(answers).toHaveLength(2));
    await waitFor(() => expect(screen.getAllByText('Added')).toHaveLength(2));

    fireEvent.click(fresh());
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(
      await screen.findByText("Photos received. MDG is filing it on IndianOil's portal."),
    ).toBeInTheDocument();

    // Both went through the squeezer, then the presigned upload under the new scope.
    expect(h.squeeze).toHaveBeenCalledTimes(2);
    expect(signed).toEqual([
      {
        filename: 'washroom-outside.jpg',
        contentType: 'image/jpeg',
        size: 3,
        scope: 'declarations',
        dealerId: 'd1',
      },
      {
        filename: 'washroom-inside.jpg',
        contentType: 'image/jpeg',
        size: 3,
        scope: 'declarations',
        dealerId: 'd1',
      },
    ]);
    expect(h.fetch).toHaveBeenCalledTimes(2);
    expect(answers).toEqual([
      {
        step: 'photo',
        slot: 'outside',
        key: 'declarations/d1/uploads/1',
        filename: 'washroom-outside.jpg',
      },
      {
        step: 'photo',
        slot: 'inside',
        key: 'declarations/d1/uploads/2',
        filename: 'washroom-inside.jpg',
      },
      { step: 'send', confirmFresh: true },
    ]);
    expect(h.get).toHaveBeenCalledTimes(1);
  });

  it('a retake is ONE call: the server replaces what the slot held, nothing is taken out first', async () => {
    h.get.mockResolvedValue(withPhotos('outside', 'inside'));
    replies = [withPhotos('outside', 'inside')];
    box();
    await screen.findByText('IndianOil needs 2 photos of your washroom this week:');
    fireEvent.change(slotInput('outside'), { target: { files: [jpeg('again.jpg')] } });
    await waitFor(() => expect(answers).toHaveLength(1));
    expect(answers).toEqual([
      {
        step: 'photo',
        slot: 'outside',
        key: 'declarations/d1/uploads/1',
        filename: 'washroom-outside.jpg',
      },
    ]);
    // The new photo was squeezed and uploaded BEFORE the server was told about it.
    expect(h.fetch).toHaveBeenCalledTimes(1);
    expect(h.post.mock.calls.map(([path]) => path)).toEqual([SIGN_PATH, ANSWER_PATH]);
    // The old photo stayed on screen all the while: the slot never showed empty.
    expect(screen.getAllByText('Added')).toHaveLength(2);
  });

  it('asks the server again when a retake does not arrive, and draws what it says: no stale "Added"', async () => {
    h.get.mockResolvedValueOnce(withPhotos('outside', 'inside'));
    box();
    await screen.findByText('IndianOil needs 2 photos of your washroom this week:');
    // The link drops on the answer, after the upload. The server's slot is whatever it says next.
    h.get.mockResolvedValue(withPhotos('inside'));
    h.post.mockImplementation(async (path: string) => {
      if (path === SIGN_PATH) {
        return {
          uploadUrl: 'https://s3.example.test/put',
          storageKey: 'declarations/d1/uploads/9',
          expiresIn: 900,
        };
      }
      throw new TypeError('Failed to fetch');
    });
    fireEvent.change(slotInput('outside'), { target: { files: [jpeg('again.jpg')] } });
    expect(
      await screen.findByText('The upload did not go through. Check your network and try again.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(h.get).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getAllByText('Added')).toHaveLength(1));
  });

  it('keeps the photo the owner had when the new one cannot be squeezed', async () => {
    h.get.mockResolvedValue(withPhotos('outside', 'inside'));
    h.squeeze.mockRejectedValue(new ImageRejected('size'));
    box();
    await screen.findByText('IndianOil needs 2 photos of your washroom this week:');
    fireEvent.change(slotInput('outside'), { target: { files: [jpeg('huge.jpg')] } });
    expect(
      await screen.findByText('This photo is too big. Take it again from a little further away.'),
    ).toBeInTheDocument();
    // Nothing was sent, nothing was taken out, and the server is not asked again: it was never told.
    expect(signed).toHaveLength(0);
    expect(answers).toHaveLength(0);
    expect(h.get).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText('Added')).toHaveLength(2);
  });

  it('turns away a file that is not a picture before anything is squeezed or sent', async () => {
    h.get.mockResolvedValue(makeCollect(0));
    box();
    await screen.findByText('IndianOil needs 2 photos of your washroom this week:');
    fireEvent.change(slotInput('outside'), {
      target: { files: [new File(['%PDF-1.4'], 'form.pdf', { type: 'application/pdf' })] },
    });
    expect(
      await screen.findByText(
        'That is not a photo. Take a new one, or choose one from your gallery.',
      ),
    ).toBeInTheDocument();
    expect(h.squeeze).not.toHaveBeenCalled();
    expect(signed).toHaveLength(0);
    expect(answers).toHaveLength(0);
  });

  it('says so when a phone-format photo cannot be opened, and sends nothing', async () => {
    h.get.mockResolvedValue(makeCollect(0));
    h.squeeze.mockRejectedValue(new ImageRejected('heic'));
    box();
    await screen.findByText('IndianOil needs 2 photos of your washroom this week:');
    fireEvent.change(slotInput('inside'), {
      target: { files: [new File([new Uint8Array(4)], 'IMG_9.HEIC', { type: 'image/heic' })] },
    });
    expect(
      await screen.findByText(
        'This kind of photo cannot be opened here. Take a new photo with the camera.',
      ),
    ).toBeInTheDocument();
    expect(signed).toHaveLength(0);
  });

  it('draws the view again at once when the server says the cycle had already moved', async () => {
    h.get.mockResolvedValueOnce(makeCollect(2));
    box();
    await screen.findByText('IndianOil needs 2 photos of your washroom this week:');
    fireEvent.click(fresh());
    h.get.mockResolvedValue(
      makeDeclarationsView({ screen: 'done', lastWashroomFiledDay: '2026-11-12' }),
    );
    h.post.mockImplementation(async () => {
      throw new ApiError(409, 'CONFLICT', 'This week has already been sent.');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(
      await screen.findByText("Filed on IndianOil's portal on 12-11-2026."),
    ).toBeInTheDocument();
  });

  it('looks again by itself while MDG is filing, in case the socket missed the news', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      h.get.mockResolvedValueOnce(makeDeclarationsView({ screen: 'waiting' }));
      box();
      expect(await screen.findByRole('status')).toHaveTextContent(/Photos received/);
      h.get.mockResolvedValue(
        makeDeclarationsView({ screen: 'done', lastWashroomFiledDay: '2026-11-12' }),
      );
      await vi.advanceTimersByTimeAsync(5_500);
      expect(
        await screen.findByText("Filed on IndianOil's portal on 12-11-2026."),
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
  it('holds EVERY box in the thread still while one photo is on its way', async () => {
    h.get.mockResolvedValue(makeCollect(0));
    let landed!: (view: DeclarationsView) => void;
    h.post.mockImplementation(async (path: string) => {
      if (path === SIGN_PATH) {
        return {
          uploadUrl: 'https://s3.example.test/put',
          storageKey: 'declarations/d1/uploads/1',
          expiresIn: 900,
        };
      }
      return new Promise<DeclarationsView>((resolve) => {
        landed = resolve;
      });
    });
    renderWithProviders(
      <>
        <MessageBubble message={declMessage('first')} mine={false} />
        <MessageBubble message={declMessage('second')} mine={false} />
      </>,
    );
    await waitFor(() =>
      expect(
        screen.getAllByText('IndianOil needs 2 photos of your washroom this week:'),
      ).toHaveLength(2),
    );
    const inside = () => [
      ...document.querySelectorAll<HTMLInputElement>(
        '[data-photo-slot="inside"] input[type="file"]',
      ),
    ];
    const outside = () => [
      ...document.querySelectorAll<HTMLInputElement>(
        '[data-photo-slot="outside"] input[type="file"]',
      ),
    ];
    expect(inside()).toHaveLength(2);

    // The owner picks the inside photo in the FIRST box.
    fireEvent.change(inside()[0]!, { target: { files: [jpeg('in.jpg')] } });
    await waitFor(() => expect(inside()[1]).toBeDisabled());
    // The second box cannot start another answer, so two replies can never race for the cache.
    expect(inside()[0]).toBeDisabled();
    expect(outside().every((input) => input.disabled)).toBe(true);
    expect(screen.getAllByRole('checkbox').every((box) => (box as HTMLInputElement).disabled)).toBe(
      true,
    );
    // Both boxes say which slot is uploading.
    expect(screen.getAllByText('Uploading…')).toHaveLength(2);
    for (const slot of document.querySelectorAll('[data-photo-slot="outside"]')) {
      expect(within(slot as HTMLElement).queryByText('Uploading…')).toBeNull();
    }

    // When the answer lands, both boxes are free again and both draw the one new view.
    await waitFor(() => expect(typeof landed).toBe('function'));
    landed(withPhotos('inside'));
    await waitFor(() => expect(inside().every((input) => !input.disabled)).toBe(true));
    expect(outside().every((input) => !input.disabled)).toBe(true);
    expect(screen.getAllByText('Added')).toHaveLength(2);
  });

  it('ends in a sentence, not a spinner, when the phone says it has no network', async () => {
    onlineManager.setOnline(false);
    try {
      // The first read, the photo and the answer all run: none waits for a signal that may
      // not come back until the owner has left.
      h.get.mockResolvedValue(makeCollect(0));
      h.post.mockImplementation(async () => {
        throw new TypeError('Failed to fetch');
      });
      box();
      await screen.findByText('IndianOil needs 2 photos of your washroom this week:');
      fireEvent.change(slotInput('outside'), { target: { files: [jpeg('a.jpg')] } });
      expect(
        await screen.findByText('The upload did not go through. Check your network and try again.'),
      ).toBeInTheDocument();
      // Nothing is left parked: the controls are back.
      expect(slotInput('outside')).not.toBeDisabled();
      expect(screen.queryByText('Uploading…')).toBeNull();
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it('shows the "could not check" line, not a spinner for good, when the first read cannot be made offline', async () => {
    onlineManager.setOnline(false);
    try {
      h.get.mockRejectedValue(new TypeError('Failed to fetch'));
      box();
      expect(await screen.findByText("Couldn't check this just now")).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    } finally {
      onlineManager.setOnline(true);
    }
  });
});
