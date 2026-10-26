import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useConversationsListSocket } from '@/features/chat/useConversationsListSocket';
import type * as UploadModule from '@/lib/uploadAttachment';
import { useLangStore } from '@/store/lang';
import { makeFakeSocket, type FakeSocket } from '@/test/fakeSocket';
import { makeMessage, renderWithProviders, resetStores, signIn } from '@/test/utils';
import type { ChatAskState, Conversation, Message } from '@dk/shared/types';

import { ChatPage } from './ChatPage';

/**
 * ANSWERING MDG's REQUESTS, THROUGH THE REAL COMPOSER.
 *
 * `ChatPage.test.tsx` replaces the composer with a stub, which is right for what
 * the page owes it, but the bugs here live BETWEEN the two: a request's button
 * lives in the page, the file chooser in the composer, and what stays on screen
 * when the dealer backs out is decided by both. So this mounts the real page,
 * list socket and composer, and drives them the way a finger does — taps, files
 * arriving (or not), the preview closed.
 */

const h = vi.hoisted(() => ({
  socket: null as unknown as FakeSocket,
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() },
  upload: vi.fn(),
}));
vi.mock('@/lib/socket', () => ({ getSocket: () => h.socket }));
vi.mock('@/lib/api', () => ({ api: h.api }));
vi.mock('@/lib/uploadAttachment', async (orig) => ({
  ...(await orig<typeof UploadModule>()),
  uploadAttachment: (...a: unknown[]) => h.upload(...a),
}));

const CID = 'c1';
const REF = 'doc:ask1';
const REG = 'reg:2026-10-11';

const conv = {
  id: CID,
  dealerId: 'd1',
  userId: 'u1',
  kind: 'support',
  participantUserIds: ['u1'],
  status: 'OPEN',
  unreadByAdmin: false,
  unreadByDealer: false,
  unreadDealerUserIds: [],
  lastMessageAt: '2026-10-12T09:00:05.000Z',
  lastMessagePreview: 'hi',
  createdAt: '',
  updatedAt: '',
} as unknown as Conversation;

const askMsg = (over: Partial<Message> = {}) =>
  makeMessage({
    id: 'ask-msg',
    conversationId: CID,
    senderId: 'sys',
    senderRole: 'admin',
    senderName: 'MDG',
    system: true,
    readBy: ['u1'],
    body: 'MDG needs your Fire NOC. Tap Send photo.',
    createdAt: '2026-10-12T09:00:00.000Z',
    ask: { ref: REF, kind: 'document', title: 'Fire NOC', acceptsFile: true },
    ...over,
  });
const registerAsk = () =>
  askMsg({
    body: 'MDG needs the register page for 11 Oct. Tap Send photo.',
    ask: { ref: REG, kind: 'register', title: 'Register page', periodLabel: '11 Oct' },
  });

function Harness() {
  useConversationsListSocket();
  return (
    <Routes>
      <Route path="/chat/:id" element={<ChatPage />} />
      <Route path="/chat" element={<div>LIST</div>} />
    </Routes>
  );
}

let states: () => ChatAskState[] = () => [{ ref: REF, status: 'open' }];
let messages: Message[] = [];
const statesCalls = () => h.api.get.mock.calls.filter(([p]) => p === '/v1/asks/me/states');

function mount() {
  h.api.get.mockImplementation((path: string) => {
    if (path === '/v1/conversations/mine') return Promise.resolve([conv]);
    if (path === `/v1/conversations/${CID}/messages`) return Promise.resolve(messages);
    if (path === '/v1/asks/me/states') return Promise.resolve(states());
    return Promise.resolve([]);
  });
  return renderWithProviders(<Harness />, { route: `/chat/${CID}` });
}

beforeEach(() => {
  h.socket = makeFakeSocket(true);
  h.api.get.mockReset();
  h.api.post.mockReset();
  h.upload.mockReset();
  signIn({ id: 'u1', name: 'Ramesh' });
  useLangStore.setState({ lang: 'en', explicit: true });
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn(() => 'blob:x'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
  messages = [askMsg()];
  states = () => [{ ref: REF, status: 'open' }];
});
afterEach(() => resetStores());

const jpeg = (name = 'IMG_1.jpg') => new File(['x'], name, { type: 'image/jpeg' });
const stored = {
  storageKey: 'chat/c1/a.jpg',
  filename: 'IMG_1.jpg',
  contentType: 'image/jpeg',
  size: 1,
  kind: 'image' as const,
};

/** The hidden file inputs the composer owns. */
const cameraInput = () => document.querySelector<HTMLInputElement>('input[capture="environment"]')!;
/** The attach card's Gallery: many pictures. */
const galleryInput = () =>
  document.querySelector<HTMLInputElement>('input[type="file"][accept="image/*"][multiple]:not([capture])')!;
/** A request's own photos door: one picture, no camera. */
const askGalleryInput = () =>
  document.querySelector<HTMLInputElement>(
    'input[type="file"][accept="image/*"]:not([multiple]):not([capture])',
  )!;

const replyStrip = () => screen.queryByLabelText(/Replying to/i);

/** A file arriving at one of the composer's inputs, as the phone delivers it. */
async function fileArrives(input: HTMLInputElement, file = jpeg()) {
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
}

/** Press Send in the full-screen preview, with the server happy. */
async function sendFromPreview() {
  const send = within(await screen.findByRole('dialog', { name: 'Image preview' })).getByRole(
    'button',
    { name: 'Send' },
  );
  await act(async () => {
    fireEvent.click(send);
  });
}

function serverAccepts(answersAsk?: string) {
  h.upload.mockResolvedValue(stored);
  h.api.post.mockResolvedValue(
    makeMessage({
      id: 'real1',
      conversationId: CID,
      senderId: 'u1',
      readBy: ['u1'],
      body: '',
      ...(answersAsk ? { answersAsk } : {}),
      attachments: [stored] as never,
    }),
  );
}

const lastPostBody = () => h.api.post.mock.calls.at(-1)![1] as Record<string, unknown>;

describe('Send photo, with the real composer', () => {
  it('opens the camera inside the tap, and the photo that comes back goes out as the answer', async () => {
    mount();
    const button = await screen.findByRole('button', { name: 'Send photo' });
    const clicks: Array<{ capture: string | null; accept: string }> = [];
    const orig = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function (this: HTMLInputElement) {
      if (this.type === 'file') {
        clicks.push({ capture: this.getAttribute('capture'), accept: this.accept });
      }
      return orig.call(this);
    };
    fireEvent.click(button);
    HTMLInputElement.prototype.click = orig;
    // Synchronous: no await between the tap and the camera.
    expect(clicks).toEqual([{ capture: 'environment', accept: 'image/*' }]);
    // Nothing is quoted yet — the camera has not given anything back.
    expect(replyStrip()).toBeNull();

    await fileArrives(cameraInput());
    // The photo is in hand: the request is quoted, and the keyboard stays down.
    expect(await screen.findByLabelText(/Replying to/i)).toBeInTheDocument();
    expect(document.activeElement?.tagName).not.toBe('TEXTAREA');

    serverAccepts(REF);
    await sendFromPreview();
    await waitFor(() => expect(h.api.post).toHaveBeenCalled());
    expect(lastPostBody().replyToMessageId).toBe('ask-msg');
    expect(lastPostBody().answersAsk).toBe(REF);
    expect(await screen.findByText('Sent — MDG is checking')).toBeInTheDocument();
    expect(replyStrip()).toBeNull();
  });

  it('a CANCELLED camera leaves nothing behind — the next, unrelated photo is just a photo', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Send photo' }));
    // No change event ever fires on a cancel. Nothing is quoted…
    expect(replyStrip()).toBeNull();

    // …and the dealer sends a photo of a pump fault from the gallery.
    await fileArrives(galleryInput(), jpeg('pump_fault.jpg'));
    expect(replyStrip()).toBeNull();
    serverAccepts();
    await sendFromPreview();
    await waitFor(() => expect(h.api.post).toHaveBeenCalled());

    expect(lastPostBody()).not.toHaveProperty('replyToMessageId');
    expect(lastPostBody()).not.toHaveProperty('answersAsk');
    // The request is untouched: still waiting for its own photo.
    expect(screen.getByRole('button', { name: 'Send photo' })).toBeInTheDocument();
    expect(screen.queryByText('Sent — MDG is checking')).toBeNull();
  });

  it('a photo taken with the camera beside the box after a cancelled Send photo is not the answer either', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Send photo' }));
    // The dealer's own camera button, not the request's.
    fireEvent.click(screen.getByRole('button', { name: 'Take a photo' }));
    await fileArrives(cameraInput(), jpeg('pump_fault.jpg'));
    serverAccepts();
    await sendFromPreview();
    await waitFor(() => expect(h.api.post).toHaveBeenCalled());
    expect(lastPostBody()).not.toHaveProperty('answersAsk');
    expect(lastPostBody()).not.toHaveProperty('replyToMessageId');
  });

  it('✕ on the preview lets the request go — the next photo is not its answer', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Send photo' }));
    await fileArrives(cameraInput());
    await screen.findByLabelText(/Replying to/i);

    // The dealer closes the preview without sending.
    fireEvent.click(
      within(await screen.findByRole('dialog', { name: 'Image preview' })).getByRole('button', {
        name: 'Close preview',
      }),
    );
    expect(screen.queryByRole('dialog', { name: 'Image preview' })).toBeNull();
    expect(replyStrip()).toBeNull();

    await fileArrives(galleryInput(), jpeg('pump_fault.jpg'));
    serverAccepts();
    await sendFromPreview();
    await waitFor(() => expect(h.api.post).toHaveBeenCalled());
    expect(lastPostBody()).not.toHaveProperty('replyToMessageId');
    expect(lastPostBody()).not.toHaveProperty('answersAsk');
    expect(screen.getByRole('button', { name: 'Send photo' })).toBeInTheDocument();
  });

  it('the phone’s Back button on the preview lets it go too', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Send photo' }));
    await fileArrives(cameraInput());
    await screen.findByLabelText(/Replying to/i);

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    await waitFor(() => expect(replyStrip()).toBeNull());
  });
});

describe('a request that takes only a photo', () => {
  beforeEach(() => {
    messages = [registerAsk()];
    states = () => [{ ref: REG, status: 'open' }];
  });

  it('offers the gallery beside the camera, and no "Choose file"', async () => {
    mount();
    expect(await screen.findByRole('button', { name: 'Send photo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose from gallery' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Choose file' })).toBeNull();
  });

  it('the gallery opens a plain picture chooser — one picture, not the camera — and the pick answers it', async () => {
    mount();
    const button = await screen.findByRole('button', { name: 'Choose from gallery' });
    const clicks: Array<{ capture: string | null; accept: string; multiple: boolean }> = [];
    const orig = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function (this: HTMLInputElement) {
      if (this.type === 'file') {
        clicks.push({
          capture: this.getAttribute('capture'),
          accept: this.accept,
          multiple: this.multiple,
        });
      }
      return orig.call(this);
    };
    fireEvent.click(button);
    HTMLInputElement.prototype.click = orig;
    expect(clicks).toEqual([{ capture: null, accept: 'image/*', multiple: false }]);
    expect(replyStrip()).toBeNull();

    await fileArrives(askGalleryInput(), jpeg('register.jpg'));
    serverAccepts(REG);
    await sendFromPreview();
    await waitFor(() => expect(h.api.post).toHaveBeenCalled());
    expect(lastPostBody().replyToMessageId).toBe('ask-msg');
    expect(lastPostBody().answersAsk).toBe(REG);
    expect(await screen.findByText('Sent — MDG is checking')).toBeInTheDocument();
  });

  it('a paper request keeps "Choose file" (a photo or a PDF) and has no gallery button', async () => {
    messages = [askMsg()];
    states = () => [{ ref: REF, status: 'open' }];
    mount();
    expect(await screen.findByRole('button', { name: 'Choose file' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Choose from gallery' })).toBeNull();
  });
});

describe('while the photo is uploading', () => {
  it('the request already reads "Sent" — no second Send photo to press — and the button is back if the photo never goes', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Send photo' }));
    await fileArrives(cameraInput());
    let failUpload!: (e: Error) => void;
    h.upload.mockImplementation(
      () =>
        new Promise((_, reject) => {
          failUpload = reject;
        }),
    );

    await sendFromPreview();

    // The upload is in flight and nothing has been posted.
    expect(h.api.post).not.toHaveBeenCalled();
    expect(await screen.findByText('Sent — MDG is checking')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send photo' })).toBeNull();

    await act(async () => {
      failUpload(new Error('network'));
    });
    expect(await screen.findByRole('button', { name: 'Send photo' })).toBeInTheDocument();
    expect(screen.queryByText('Sent — MDG is checking')).toBeNull();
  });
});

describe('a swipe-reply to a request', () => {
  it('raises the keyboard, like a reply anywhere else — the dealer is about to type', async () => {
    mount();
    await screen.findByRole('button', { name: 'Send photo' });
    const row = document.querySelector('[data-mid="ask-msg"]')!;
    fireEvent.pointerDown(row, { pointerType: 'touch', pointerId: 1, clientX: 40, clientY: 0 });
    fireEvent.pointerMove(row, { pointerType: 'touch', pointerId: 1, clientX: 130, clientY: 2 });
    fireEvent.pointerUp(row, { pointerType: 'touch', pointerId: 1, clientX: 130, clientY: 2 });

    expect(await screen.findByLabelText(/Replying to/i)).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement?.tagName).toBe('TEXTAREA'));
  });
});

describe('where a request stands, when someone else moves it', () => {
  it('a colleague’s answer shows as sent here at once, and does not bring the button back by asking too early', async () => {
    mount();
    expect(await screen.findByRole('button', { name: 'Send photo' })).toBeInTheDocument();
    expect(statesCalls()).toHaveLength(1);

    // The owner photographs the NOC from their phone; this member's phone hears of it.
    act(() =>
      h.socket.server('message:new', {
        message: makeMessage({
          id: 'owner-1',
          conversationId: CID,
          senderId: 'u2',
          senderRole: 'dealer-owner',
          senderName: 'Owner',
          body: '',
          answersAsk: REF,
          attachments: [stored] as never,
          createdAt: '2026-10-12T09:03:00.000Z',
        }),
        conversation: conv,
      }),
    );

    expect(await screen.findByText('Sent — MDG is checking')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send photo' })).toBeNull();
    // The server is still filing: asking now would say `open`. It is asked later.
    expect(statesCalls()).toHaveLength(1);
  });

  it('document-ask:updated — the settled paper stops offering Send photo, with no message in this chat', async () => {
    mount();
    expect(await screen.findByRole('button', { name: 'Send photo' })).toBeInTheDocument();
    expect(statesCalls()).toHaveLength(1);

    // MDG marked it received from the Vault (or from the other chat).
    states = () => [{ ref: REF, status: 'received' }];
    act(() => h.socket.server('document-ask:updated', { row: { id: 'ask1' } }));

    expect(await screen.findByText('Received')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send photo' })).toBeNull();
    expect(statesCalls()).toHaveLength(2);
  });
});
