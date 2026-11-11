import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mockDrillKey } from '@/hooks/api/useMockDrill';
import { ApiError } from '@/lib/api';
import { useLangStore } from '@/store/lang';
import {
  makeCollecting,
  makeMockDrillDependent,
  makeMockDrillOpen,
  makeMockDrillPhoto,
  makeMockDrillView,
} from '@/test/mockDrillFixtures';
import { makeMessage, renderWithProviders, signIn } from '@/test/utils';
import { mockDrillAnswerSchema } from '@dk/shared/schemas';
import type { MockDrillView } from '@dk/shared/types';

import { MessageBubble } from './MessageBubble';

// The server is a double; the hooks and the box are the real ones.
const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), fetch: vi.fn() }));
vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<{ ApiError: typeof ApiError }>()),
  api: { get: h.get, post: h.post, put: h.put },
}));

const VIEW_PATH = '/v1/me/mock-drill';
const ANSWER_PATH = '/v1/me/mock-drill/answer';
const SIGN_PATH = '/v1/uploads/sign';

/** The answers the double will give, in order, and the bodies it was sent. */
let replies: MockDrillView[] = [];
let answers: unknown[] = [];
let signed: unknown[] = [];

const withPhotos = (n: 0 | 1 | 2) =>
  makeMockDrillDependent({
    photos: [
      makeMockDrillPhoto({ key: 'mock-drill/d1/uploads/a', filename: 'one.jpg' }),
      makeMockDrillPhoto({ key: 'mock-drill/d1/uploads/b', filename: 'two.jpg' }),
    ].slice(0, n),
  });

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
  h.post.mockReset();
  h.post.mockImplementation(async (path: string, body: unknown) => {
    if (path === SIGN_PATH) {
      signed.push(body);
      return {
        uploadUrl: 'https://s3.example.test/put?sig=1',
        storageKey: `mock-drill/d1/uploads/${signed.length}`,
        expiresIn: 900,
      };
    }
    if (path === ANSWER_PATH) {
      answers.push(body);
      // Whatever goes to the server must be a body its own schema accepts.
      expect(mockDrillAnswerSchema.safeParse(body).success, JSON.stringify(body)).toBe(true);
      const next = replies.shift();
      if (!next) throw new Error('no reply left in the double');
      return next;
    }
    throw new Error(`unexpected POST ${path}`);
  });
});
afterEach(() => cleanup());

function box(body = 'Time to record your mock drill.') {
  const message = makeMessage({
    id: 'md-msg',
    senderId: 'system-user',
    senderRole: 'admin',
    senderName: 'MDG',
    system: true,
    body,
    mockDrill: {},
  });
  return renderWithProviders(<MessageBubble message={message} mine={false} />);
}

const slotInput = (slot: 1 | 2) =>
  document.querySelector<HTMLInputElement>(`[data-photo-slot="${slot}"] input[type="file"]`)!;

describe('MessageBubble — a Mock Drill box MDG posted', () => {
  it('asks for the view only when a box is on screen', async () => {
    renderWithProviders(<MessageBubble message={makeMessage({ body: 'hello' })} mine={false} />);
    await Promise.resolve();
    expect(h.get).not.toHaveBeenCalled();
  });

  it("reads the outlet's own view, and draws the words first and the box under them", async () => {
    h.get.mockResolvedValue(makeMockDrillView());
    const { container } = box();
    await screen.findByRole('button', { name: 'Start' });
    expect(h.get).toHaveBeenCalledWith(VIEW_PATH);
    const words = screen.getByText('Time to record your mock drill.');
    const inner = container.querySelector('[data-mock-drill]')!;
    expect(words.compareDocumentPosition(inner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('draws for an empty marker, once, as wide as a request, with its time on its own line', async () => {
    h.get.mockResolvedValue(makeMockDrillView());
    const { container } = box();
    await screen.findByRole('button', { name: 'Start' });
    expect(container.querySelectorAll('[data-mock-drill]')).toHaveLength(1);
    expect(container.innerHTML).toContain('w-[min(80%,330px)]');
    expect(container.querySelector('span[aria-hidden].inline-block')).toBeNull();
    expect(container.querySelector('.absolute.bottom-\\[5px\\]')).toBeNull();
  });

  it('is its own box: no other box is drawn with it, and no other view asked for', async () => {
    h.get.mockResolvedValue(makeMockDrillView());
    const { container } = box();
    await screen.findByRole('button', { name: 'Start' });
    expect(container.querySelector('[data-du-otp]')).toBeNull();
    expect(container.querySelector('[data-portal-login]')).toBeNull();
    expect(h.get).toHaveBeenCalledTimes(1);
  });

  it('draws the LIVE view: when the server moves it, an old box follows', async () => {
    h.get.mockResolvedValueOnce(makeMockDrillView());
    const { queryClient } = box();
    await screen.findByRole('button', { name: 'Start' });
    h.get.mockResolvedValue(makeMockDrillView({ screen: 'blocked' }));
    await queryClient.invalidateQueries({ queryKey: mockDrillKey });
    expect(await screen.findByText(/still waiting for approval/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
  });

  it('works for a manager as it does for an owner', async () => {
    signIn({ role: 'dealer-manager', dealerId: 'd1' });
    h.get.mockResolvedValue(makeMockDrillView());
    box();
    expect(await screen.findByRole('button', { name: 'Start' })).toBeInTheDocument();
    expect(h.get).toHaveBeenCalledWith(VIEW_PATH);
  });

  it('shows the words of a failed read, with a way to try again', async () => {
    h.get.mockRejectedValue(new ApiError(500, 'X', 'boom'));
    box();
    expect(await screen.findByText("Couldn't check this just now")).toBeInTheDocument();
    h.get.mockResolvedValue(makeMockDrillView());
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Start' })).toBeInTheDocument();
  });

  // The whole road once, through the real hooks and the real upload path: Start →
  // scenario → two photos → today → Send. Each answer's reply is the whole fresh
  // view, which is what moves the box on; the view is never asked for again.
  it('walks the whole road, one answer per step, and posts exactly what the contract says', async () => {
    h.get.mockResolvedValue(makeMockDrillView());
    const chosen = makeMockDrillDependent({
      scenarioId: 'e15',
      scenarioLabel: 'Fire during TT decantation',
    });
    const one = { ...chosen, photos: withPhotos(1).photos };
    const two = { ...chosen, photos: withPhotos(2).photos };
    replies = [
      makeCollecting('scenario'),
      makeCollecting('photos', { dependent: chosen }),
      makeCollecting('photos', { dependent: one }),
      makeCollecting('when', { dependent: two }),
      makeCollecting('review', { dependent: two, confirmedDay: '2026-11-11' }),
      makeMockDrillView({
        screen: 'waiting',
        open: makeMockDrillOpen({ state: 'review', dependent: two, confirmedDay: '2026-11-11' }),
      }),
    ];

    box();
    fireEvent.click(await screen.findByRole('button', { name: 'Start' }));

    // Scenario: the list opens in the chat; one tap answers.
    fireEvent.click(await screen.findByRole('button', { name: 'Choose' }));
    fireEvent.click(screen.getByRole('option', { name: /Fire during TT decantation/ }));

    // Photos: each goes through the presigned upload, then is told to the server.
    expect(await screen.findByText('Two photos of the drill')).toBeInTheDocument();
    fireEvent.change(slotInput(1), {
      target: { files: [new File([new Uint8Array([1, 2, 3])], 'one.jpg', { type: 'image/jpeg' })] },
    });
    await waitFor(() => expect(answers).toHaveLength(3));
    fireEvent.change(slotInput(2), {
      target: { files: [new File([new Uint8Array([4, 5, 6])], 'two.png', { type: 'image/png' })] },
    });

    // When: the owner's word that it happened.
    fireEvent.click(await screen.findByRole('button', { name: 'Drill done today' }));

    // Review, then send.
    expect(await screen.findByText('Check and send')).toBeInTheDocument();
    expect(screen.getByText('11-11-2026')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText(/The MDG team is looking at your photos/)).toBeInTheDocument();

    expect(signed).toEqual([
      {
        filename: 'one.jpg',
        contentType: 'image/jpeg',
        size: 3,
        scope: 'mock-drill',
        dealerId: 'd1',
      },
      {
        filename: 'two.png',
        contentType: 'image/png',
        size: 3,
        scope: 'mock-drill',
        dealerId: 'd1',
      },
    ]);
    expect(h.fetch).toHaveBeenCalledTimes(2);
    expect(answers).toEqual([
      { step: 'start_new' },
      { step: 'scenario', scenarioId: 'e15' },
      { step: 'photo', slot: 1, key: 'mock-drill/d1/uploads/1', filename: 'one.jpg' },
      { step: 'photo', slot: 2, key: 'mock-drill/d1/uploads/2', filename: 'two.png' },
      { step: 'when', day: 'today', confirmDone: true },
      { step: 'submit' },
    ]);
    expect(h.get).toHaveBeenCalledTimes(1);
  });

  it('"Same as last time" is two taps: pick it, then the day, then Send', async () => {
    const setup = {
      ...makeMockDrillDependent({
        scenarioId: 'e15',
        scenarioLabel: 'Fire during TT decantation',
        photos: withPhotos(2).photos,
      }),
      approvedAt: '2026-10-01T00:00:00.000Z',
      approvedBy: null,
    };
    h.get.mockResolvedValue(makeMockDrillView({ screen: 'choose', setup }));
    replies = [
      makeCollecting('when', { mode: 'same', dependent: setup }, { setup }),
      makeCollecting(
        'review',
        { mode: 'same', dependent: setup, confirmedDay: '2026-11-10' },
        { setup },
      ),
      makeMockDrillView({
        screen: 'waiting',
        open: makeMockDrillOpen({ state: 'ready', mode: 'same' }),
        setup,
      }),
    ];
    box();
    fireEvent.click(await screen.findByRole('button', { name: /Same as last time/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Drill done yesterday' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Send' }));
    expect(
      await screen.findByText(/Putting your report on the IndianOil website/),
    ).toBeInTheDocument();
    expect(answers).toEqual([
      { step: 'start_same' },
      { step: 'when', day: 'yesterday', confirmDone: true },
      { step: 'submit' },
    ]);
  });

  it('turns away a file that is not an image before anything is sent, in plain words', async () => {
    h.get.mockResolvedValue(makeCollecting('photos', { dependent: withPhotos(0) }));
    box();
    await screen.findByText('Two photos of the drill');
    fireEvent.change(slotInput(1), {
      target: { files: [new File(['%PDF-1.4'], 'form.pdf', { type: 'application/pdf' })] },
    });
    expect(
      await screen.findByText('That is not a photo. Choose a JPEG, PNG or WebP photo.'),
    ).toBeInTheDocument();
    expect(signed).toHaveLength(0);
    expect(answers).toHaveLength(0);
  });

  it('turns away a photo over 5 MB before anything is sent, in plain words', async () => {
    h.get.mockResolvedValue(makeCollecting('photos', { dependent: withPhotos(0) }));
    box();
    await screen.findByText('Two photos of the drill');
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.jpg', { type: 'image/jpeg' });
    fireEvent.change(slotInput(1), { target: { files: [big] } });
    expect(
      await screen.findByText('That photo is over 5 MB. Choose a smaller one.'),
    ).toBeInTheDocument();
    expect(signed).toHaveLength(0);
    expect(answers).toHaveLength(0);
  });

  it('draws the view again at once when the server says the step had already moved', async () => {
    h.get.mockResolvedValueOnce(makeCollecting('when'));
    box();
    const today = await screen.findByRole('button', { name: 'Drill done today' });
    h.get.mockResolvedValue(makeMockDrillView({ screen: 'blocked' }));
    h.post.mockImplementation(async () => {
      throw new ApiError(409, 'CONFLICT', 'That step has already moved.');
    });
    fireEvent.click(today);
    expect(await screen.findByText(/still waiting for approval/)).toBeInTheDocument();
  });
});
