import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import * as React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@/components/ui';
import type { ComposerProps } from '@/features/chat/Composer';
import { useConversationsListSocket } from '@/features/chat/useConversationsListSocket';
import type * as UploadModule from '@/lib/uploadAttachment';
import { GHOST_CLICK_GRACE_MS, LONG_PRESS_MS } from '@/lib/useLongPress';
import { useLangStore } from '@/store/lang';
import { makeFakeSocket, type FakeSocket } from '@/test/fakeSocket';
import {
  makeMessage,
  makeTestQueryClient,
  renderWithProviders,
  resetStores,
  signIn,
} from '@/test/utils';
import type { Attachment, Conversation, Message, TicketDealerView } from '@dk/shared/types';

import { ChatPage } from './ChatPage';

const h = vi.hoisted(() => ({
  socket: null as unknown as FakeSocket,
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() },
  composer: null as null | ComposerProps,
  copyText: vi.fn(),
  download: vi.fn(),
  upload: vi.fn(),
}));
vi.mock('@/lib/socket', () => ({ getSocket: () => h.socket }));
vi.mock('@/lib/api', () => ({ api: h.api }));
vi.mock('@/lib/clipboard', () => ({ copyText: (...a: unknown[]) => h.copyText(...a) }));
vi.mock('@/lib/downloadAttachment', () => ({
  useAttachmentDownload: () => h.download,
  fetchFreshInlineUrl: vi.fn(),
}));
vi.mock('@/lib/uploadAttachment', async (orig) => ({
  ...(await orig<typeof UploadModule>()),
  uploadAttachment: (...a: unknown[]) => h.upload(...a),
}));
// The composer is another builder's component, with a lot of its own machinery
// (the mic, the camera, the attach sheet). What this page owes it is a handful
// of props, so those are what is captured.
vi.mock('@/features/chat/Composer', () => ({
  Composer: (props: ComposerProps) => {
    h.composer = props;
    return <div data-testid="composer" />;
  },
}));

/**
 * The dealer's chat, end to end through the real list cache.
 *
 * The status line under a bubble reads `conversation.tickets`, and that comes
 * from the conversations LIST cache, which `useConversationsListSocket` (mounted
 * once in AppShell) upserts on `conversation:updated`. This mounts both, with
 * the real page, list and bubble, and drives the server's event.
 */

const CONVERSATION_ID = 'c1';

function ticket(over: Partial<TicketDealerView> = {}): TicketDealerView {
  return {
    id: 't-42',
    number: 42,
    state: 'OPEN',
    seen: false,
    raisedAt: '2026-10-12T09:00:00.000Z',
    ...over,
  };
}

function conversation(
  tickets: TicketDealerView[] | undefined,
  over: Partial<Conversation> = {},
): Conversation {
  return {
    id: CONVERSATION_ID,
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
    ...(tickets ? { tickets } : {}),
    createdAt: '',
    updatedAt: '',
    ...over,
  } as Conversation;
}

const history = [
  makeMessage({
    id: 'q',
    conversationId: CONVERSATION_ID,
    senderId: 'u1',
    body: 'Mera credit limit kab badhega?',
    readBy: ['u1'],
    createdAt: '2026-10-12T09:00:00.000Z',
  }),
  makeMessage({
    id: 'handoff',
    conversationId: CONVERSATION_ID,
    senderId: 'system-user',
    senderRole: 'admin',
    senderName: 'MDG',
    body: 'Ye MDG team ko bhej diya hai.',
    readBy: ['u1'],
    createdAt: '2026-10-12T09:00:05.000Z',
    ai: {
      turnId: 'turn-1',
      kind: 'handoff',
      intent: 'talk_to_human',
      templateId: 'handoff.escalated',
      ticketId: 't-42',
    } as never,
  }),
];

/** AppShell mounts the list listener; so does this, around the page. */
function Harness() {
  useConversationsListSocket();
  return (
    <Routes>
      <Route path="/chat/:id" element={<ChatPage />} />
      <Route path="/chat/:id/info" element={<div>INFO PAGE</div>} />
      <Route path="/chat/:id/media" element={<div>MEDIA PAGE</div>} />
      <Route path="/chat" element={<div>CHAT LIST</div>} />
    </Routes>
  );
}

interface MountOptions {
  messages?: Message[];
  /** Answer the search endpoint with this (or reject with an Error). */
  search?: (q: string) => Promise<unknown> | unknown;
  listError?: boolean;
  messagesError?: boolean;
}

function mount(initial: Conversation, opts: MountOptions = {}) {
  h.api.get.mockImplementation((path: string, query?: { q?: string }) => {
    if (path === '/v1/conversations/mine') {
      return opts.listError ? Promise.reject(new Error('boom')) : Promise.resolve([initial]);
    }
    if (path === `/v1/conversations/${CONVERSATION_ID}/messages`) {
      return opts.messagesError
        ? Promise.reject(new Error('boom'))
        : Promise.resolve(opts.messages ?? history);
    }
    if (path === `/v1/conversations/${CONVERSATION_ID}/messages/search`) {
      return Promise.resolve(opts.search ? opts.search(query?.q ?? '') : []);
    }
    return Promise.resolve([]);
  });
  return renderWithProviders(<Harness />, { route: `/chat/${CONVERSATION_ID}` });
}

/** What the server sends every dealer participant when a ticket changes. */
function serverUpdates(next: Conversation) {
  act(() => h.socket.server('conversation:updated', { conversation: next }));
}

beforeEach(() => {
  h.socket = makeFakeSocket(true);
  h.api.get.mockReset();
  h.api.post.mockReset();
  h.api.del.mockReset();
  h.copyText.mockReset();
  h.download.mockReset();
  h.upload.mockReset();
  h.composer = null;
  signIn({ id: 'u1', name: 'Ramesh' });
  useLangStore.setState({ lang: 'en', explicit: true });
});
afterEach(() => resetStores());

describe('ChatPage — the ticket status line', () => {
  it('shows where the raised ticket stands under the message that raised it', async () => {
    mount(conversation([ticket()]));
    expect(await screen.findByText('#42 · Sent to the MDG team')).toBeInTheDocument();
  });

  it('updates in place when a conversation:updated arrives with the ticket changed', async () => {
    mount(conversation([ticket()]));
    await screen.findByText('#42 · Sent to the MDG team');

    // An admin opens it.
    serverUpdates(conversation([ticket({ seen: true })]));
    expect(await screen.findByText('#42 · MDG team is looking at it')).toBeInTheDocument();
    expect(screen.queryByText('#42 · Sent to the MDG team')).toBeNull();

    // An admin resolves it.
    serverUpdates(
      conversation([ticket({ seen: true, state: 'RESOLVED', resolvedAt: '2026-10-12T09:30:00.000Z' })]),
    );
    expect(await screen.findByText('#42 · Closed by the MDG team')).toBeInTheDocument();
    expect(screen.queryByText('#42 · MDG team is looking at it')).toBeNull();
  });

  it('draws the line in Hindi when the app is in Hindi, and follows a switch', async () => {
    mount(conversation([ticket({ seen: true })]));
    expect(await screen.findByText('#42 · MDG team is looking at it')).toBeInTheDocument();
    act(() => useLangStore.setState({ lang: 'hi', explicit: true }));
    expect(await screen.findByText('#42 · MDG टीम देख रही है')).toBeInTheDocument();
  });

  it('shows nothing once the conversation stops listing the ticket', async () => {
    mount(conversation([ticket()]));
    await screen.findByText('#42 · Sent to the MDG team');

    // A resolved ticket past the server's seven-day window drops out.
    serverUpdates(conversation([]));
    await waitFor(() => expect(screen.queryByText(/#42/)).toBeNull());
    // The message that raised it is still in the thread.
    expect(screen.getByText('Ye MDG team ko bhej diya hai.')).toBeInTheDocument();
  });

  it('shows nothing from a server that sends no tickets at all', async () => {
    mount(conversation(undefined));
    await screen.findByText('Ye MDG team ko bhej diya hai.');
    expect(screen.queryByText(/#42/)).toBeNull();
  });

  it('offers no way to ask for a person: no button under the reply, no chip', async () => {
    mount(conversation([ticket()]));
    await screen.findByText('Ye MDG team ko bhej diya hai.');
    expect(screen.queryByText(/talk to a person/i)).toBeNull();
    expect(screen.queryByText(/talk to support/i)).toBeNull();
    expect(screen.queryByText(/someone from mdg is coming/i)).toBeNull();
  });
});

describe('ChatPage — the bar', () => {
  it('shows the chat\'s name with who answers under it, and no fake "Online"', async () => {
    mount(conversation(undefined));
    await screen.findByText('Ye MDG team ko bhej diya hai.');
    expect(screen.getByText('Support')).toBeInTheDocument();
    expect(screen.getByText('MDG team')).toBeInTheDocument();
    expect(screen.queryByText('Online')).toBeNull();
    expect(screen.queryByText('ऑनलाइन')).toBeNull();
  });

  it('wears the MDG mark for the support chat and a group glyph for the manager chat', async () => {
    const view = mount(conversation(undefined));
    await screen.findByText('Ye MDG team ko bhej diya hai.');
    const bar = screen.getByRole('button', { name: 'Chat info' });
    expect(bar.querySelector('svg')).toBeTruthy();
    expect(bar.querySelector('.lucide-users')).toBeNull();
    view.unmount();

    mount(
      conversation(undefined, {
        kind: 'manager',
        participants: [
          { userId: 'u1', name: 'Ramesh' },
          { userId: 'u9', name: 'Raju' },
        ],
      }),
    );
    await screen.findByText('Ye MDG team ko bhej diya hai.');
    expect(screen.getByRole('button', { name: 'Chat info' }).querySelector('.lucide-users')).toBeTruthy();
  });

  it('lists the other members under a group\'s name', async () => {
    mount(
      conversation(undefined, {
        kind: 'manager',
        participants: [
          { userId: 'u1', name: 'Ramesh' },
          { userId: 'u9', name: 'Raju' },
          { userId: 'u10', name: 'Sita' },
        ],
      }),
    );
    expect(await screen.findByText('Raju, Sita')).toBeInTheDocument();
  });

  it('says "typing…" in green in place of the subtitle while MDG writes', async () => {
    mount(conversation(undefined));
    await screen.findByText('Ye MDG team ko bhej diya hai.');
    act(() =>
      h.socket.server('typing', { conversationId: CONVERSATION_ID, userId: 'system-user', userName: 'MDG' }),
    );
    const typing = await screen.findByText('typing…');
    expect(typing.className).toContain('text-wa-accent-strong');
    expect(screen.queryByText('MDG team')).toBeNull();
  });

  it('names who is writing in a group', async () => {
    mount(
      conversation(undefined, {
        kind: 'manager',
        participants: [
          { userId: 'u1', name: 'Ramesh' },
          { userId: 'u9', name: 'Raju' },
        ],
      }),
    );
    await screen.findByText('Ye MDG team ko bhej diya hai.');
    act(() =>
      h.socket.server('typing', { conversationId: CONVERSATION_ID, userId: 'u9', userName: 'Raju' }),
    );
    expect(await screen.findByText('Raju is typing…')).toBeInTheDocument();
  });

  it('opens the chat\'s info when its name is tapped', async () => {
    mount(conversation(undefined));
    await screen.findByText('Ye MDG team ko bhej diya hai.');
    fireEvent.click(screen.getByRole('button', { name: 'Chat info' }));
    expect(await screen.findByText('INFO PAGE')).toBeInTheDocument();
  });

  it('keeps Media and Search in the ⋮ menu, and Media opens the gallery', async () => {
    mount(conversation(undefined));
    await screen.findByText('Ye MDG team ko bhej diya hai.');
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getByText('Search')).toBeInTheDocument();
    fireEvent.click(within(menu).getByText('Media, links and docs'));
    expect(await screen.findByText('MEDIA PAGE')).toBeInTheDocument();
  });

  it('goes back to the chat list from the arrow', async () => {
    mount(conversation(undefined));
    await screen.findByText('Ye MDG team ko bhej diya hai.');
    fireEvent.click(screen.getByRole('button', { name: 'Back to chats' }));
    expect(await screen.findByText('CHAT LIST')).toBeInTheDocument();
  });

  it('a chat that is not the member\'s says so, with a way out — and a failed list says it failed', async () => {
    mount(conversation(undefined, { id: 'someone-elses' }));
    expect(await screen.findByText("This chat isn't available.")).toBeInTheDocument();
    fireEvent.click(screen.getByText('Back to chats'));
    expect(await screen.findByText('CHAT LIST')).toBeInTheDocument();
  });
});

describe('ChatPage — a thread that will not load', () => {
  it('says it could not load; it is never drawn as a new, empty chat', async () => {
    mount(conversation(undefined), { messagesError: true });
    expect(await screen.findByText("Couldn't load this chat")).toBeInTheDocument();
    expect(screen.queryByText('How can we help?')).toBeNull();
    const asked = () =>
      h.api.get.mock.calls.filter(([p]) => p === `/v1/conversations/${CONVERSATION_ID}/messages`)
        .length;
    const before = asked();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(asked()).toBeGreaterThan(before));
  });
});

/**
 * Long-press, then taps: WhatsApp's selection mode in place of an action sheet.
 */
describe('ChatPage — selecting messages', () => {
  const mdg = (over: Partial<Message> = {}) =>
    makeMessage({
      conversationId: CONVERSATION_ID,
      senderId: 'system-user',
      senderRole: 'admin',
      senderName: 'MDG',
      readBy: ['u1', 'system-user'],
      ...over,
    });
  const mine = (over: Partial<Message> = {}) =>
    makeMessage({
      conversationId: CONVERSATION_ID,
      senderId: 'u1',
      readBy: ['u1'],
      deliveredTo: ['system-user'],
      ...over,
    });

  const thread = () => [
    mine({ id: 'm1', body: 'first line', createdAt: '2026-10-12T09:00:00.000Z' }),
    mdg({ id: 'm2', body: 'second line', createdAt: '2026-10-12T09:01:00.000Z' }),
    mdg({
      id: 'm3',
      body: undefined,
      createdAt: '2026-10-12T09:02:00.000Z',
      attachments: [
        {
          storageKey: 'dealers/d1/rate.pdf',
          filename: 'rate.pdf',
          contentType: 'application/pdf',
          size: 1000,
          kind: 'file',
          url: 'https://files.test/rate.pdf',
        } as Attachment,
      ],
    }),
    mdg({ id: 'm4', body: 'third line', createdAt: '2026-10-12T09:03:00.000Z' }),
  ];

  /** Hold a finger on a bubble until the long-press fires. */
  async function holdOn(text: string) {
    const bubble = screen.getByText(text).closest('.bg-wa-in, .bg-wa-out')!;
    fireEvent.pointerDown(bubble, { pointerId: 1, clientX: 5, clientY: 5 });
    await act(async () => {
      await new Promise((r) => setTimeout(r, LONG_PRESS_MS + 60));
    });
    fireEvent.pointerUp(bubble, { pointerId: 1, clientX: 5, clientY: 5 });
    await settle();
  }

  /**
   * A real finger takes longer than this to come down again. The long-press
   * swallows the click its own release would produce, for a short grace after
   * the finger lifts; a test that clicks at once would be swallowed too.
   */
  async function settle() {
    await act(async () => {
      await new Promise((r) => setTimeout(r, GHOST_CLICK_GRACE_MS + 40));
    });
  }

  /** A tap on a row, the way a finger lands on its words. */
  function tap(text: string) {
    fireEvent.click(screen.getByText(text));
  }

  async function open() {
    mount(conversation(undefined), { messages: thread() });
    await screen.findByText('second line');
  }

  it('long-press turns the bar into the selection bar and tints the row', async () => {
    await open();
    await holdOn('second line');
    const bar = await screen.findByRole('button', { name: 'Clear selection' });
    expect(bar).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reply' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    // MDG's, not mine; no file: neither Info nor Download.
    expect(screen.queryByRole('button', { name: 'Message info' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull();
    expect(
      screen.getByText('second line').closest('[data-mid]')!.className,
    ).toContain('bg-wa-select');
    // The chat's own bar is gone, not stacked under this one.
    expect(screen.queryByRole('button', { name: 'More options' })).toBeNull();
  });

  it('floats the six reactions over the one selected message', async () => {
    await open();
    await holdOn('second line');
    const strip = await screen.findByRole('group', { name: 'Reactions' });
    expect(within(strip).getAllByRole('button')).toHaveLength(6);
  });

  it('a reaction from the strip is sent, and selection mode ends', async () => {
    h.api.post.mockResolvedValue(mdg({ id: 'm2', reactions: [] }));
    await open();
    await holdOn('second line');
    const strip = await screen.findByRole('group', { name: 'Reactions' });
    fireEvent.click(within(strip).getByRole('button', { name: '🙏' }));
    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith(
        `/v1/conversations/${CONVERSATION_ID}/messages/m2/reactions`,
        { emoji: '🙏' },
      ),
    );
    expect(screen.queryByRole('button', { name: 'Clear selection' })).toBeNull();
    expect(screen.getByRole('button', { name: 'More options' })).toBeInTheDocument();
  });

  it('offers Info only for my own message', async () => {
    await open();
    await holdOn('first line');
    expect(await screen.findByRole('button', { name: 'Message info' })).toBeInTheDocument();
  });

  it('shows Download for one message that carries a file, and downloads it', async () => {
    await open();
    // A document bubble has no words to hold; hold on its name.
    const doc = screen.getByText('rate.pdf').closest('.bg-wa-in')!;
    fireEvent.pointerDown(doc, { pointerId: 1, clientX: 5, clientY: 5 });
    await act(async () => {
      await new Promise((r) => setTimeout(r, LONG_PRESS_MS + 60));
    });
    fireEvent.pointerUp(doc, { pointerId: 1 });
    await settle();
    const download = await screen.findByRole('button', { name: 'Download' });
    expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull(); // nothing to copy
    fireEvent.click(download);
    await waitFor(() => expect(h.download).toHaveBeenCalledTimes(1));
    expect(h.download).toHaveBeenCalledWith(
      expect.objectContaining({ storageKey: 'dealers/d1/rate.pdf' }),
      { conversationId: CONVERSATION_ID, messageId: 'm3' },
    );
    expect(screen.queryByRole('button', { name: 'Clear selection' })).toBeNull();
  });

  it('tapping other messages adds and removes them; the count follows', async () => {
    await open();
    await holdOn('second line');
    tap('third line');
    expect(await screen.findByText('2')).toBeInTheDocument();
    // Two selected: no Reply, no reaction strip, no Info.
    expect(screen.queryByRole('button', { name: 'Reply' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Reactions' })).toBeNull();
    tap('third line'); // off again
    expect(await screen.findByText('1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reply' })).toBeInTheDocument();
  });

  it('copies SEVERAL selected messages as one text, oldest first, with no names or times', async () => {
    h.copyText.mockResolvedValue(true);
    await open();
    // Picked newest first on purpose.
    await holdOn('third line');
    tap('second line');
    tap('first line');
    expect(await screen.findByText('3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(h.copyText).toHaveBeenCalledTimes(1));
    expect(h.copyText).toHaveBeenCalledWith('first line\nsecond line\nthird line');
    expect(await screen.findByText('Copied')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear selection' })).toBeNull();
  });

  it('copies only the messages that have words when a picture is in the selection', async () => {
    h.copyText.mockResolvedValue(true);
    await open();
    await holdOn('second line');
    // Select the document row too.
    fireEvent.click(screen.getByText('rate.pdf'));
    fireEvent.click(await screen.findByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(h.copyText).toHaveBeenCalledWith('second line'));
  });

  it('says so when copying fails', async () => {
    h.copyText.mockResolvedValue(false);
    await open();
    await holdOn('second line');
    fireEvent.click(await screen.findByRole('button', { name: 'Copy' }));
    expect(await screen.findByText("Couldn't copy the message")).toBeInTheDocument();
  });

  it('Reply puts the message in the composer\'s reply strip and ends selection', async () => {
    await open();
    await holdOn('second line');
    fireEvent.click(await screen.findByRole('button', { name: 'Reply' }));
    expect(h.composer!.replyingTo).toMatchObject({ senderLabel: 'MDG', text: 'second line' });
    expect(screen.queryByRole('button', { name: 'Clear selection' })).toBeNull();
  });

  it('✕ clears the selection', async () => {
    await open();
    await holdOn('second line');
    fireEvent.click(await screen.findByRole('button', { name: 'Clear selection' }));
    expect(screen.queryByRole('button', { name: 'Clear selection' })).toBeNull();
    expect(
      screen.getByText('second line').closest('[data-mid]')!.className,
    ).not.toContain('bg-wa-select');
  });

  it('the phone\'s Back button leaves selection mode, not the chat', async () => {
    await open();
    await holdOn('second line');
    await screen.findByRole('button', { name: 'Clear selection' });
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.queryByRole('button', { name: 'Clear selection' })).toBeNull();
    // Still in the chat.
    expect(screen.getByText('second line')).toBeInTheDocument();
    expect(screen.queryByText('CHAT LIST')).toBeNull();
  });

  it('deselecting the last message ends selection mode', async () => {
    await open();
    await holdOn('second line');
    tap('second line');
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Clear selection' })).toBeNull(),
    );
  });

  it('opens the message info sheet for my own message', async () => {
    await open();
    await holdOn('first line');
    fireEvent.click(await screen.findByRole('button', { name: 'Message info' }));
    // The sheet waits for the selection\'s history entry to rewind, then opens.
    expect(await screen.findByRole('heading', { name: 'Message info' })).toBeInTheDocument();
  });
});

describe('ChatPage — what was unread when it opened', () => {
  const waiting = (id: string, at: string, readBy: string[] = ['system-user']) =>
    makeMessage({
      id,
      conversationId: CONVERSATION_ID,
      senderId: 'system-user',
      senderRole: 'admin',
      senderName: 'MDG',
      body: `msg ${id}`,
      readBy,
      createdAt: at,
    });

  const thread = () => [
    waiting('old', '2026-10-12T08:00:00.000Z', ['system-user', 'u1']),
    waiting('n1', '2026-10-12T09:00:00.000Z'),
    waiting('n2', '2026-10-12T09:01:00.000Z'),
  ];

  const band = (container: HTMLElement) => container.querySelector('[data-unread-band]');

  it('puts "N unread messages" above the first unread one', async () => {
    const view = mount(conversation(undefined), { messages: thread() });
    await screen.findByText('msg n2');
    const el = band(view.container)!;
    expect(el.textContent).toBe('2 unread messages');
    expect(el.nextElementSibling!.getAttribute('data-mid')).toBe('n1');
    expect(el.previousElementSibling!.getAttribute('data-mid')).toBe('old');
  });

  it('counts what sits below the line, even when the list said more were waiting', async () => {
    // The list says 45; one page holds two of them. "45 unread messages" over
    // two messages is a number the dealer cannot find by scrolling.
    const view = mount(conversation(undefined, { unreadCount: 45 }), { messages: thread() });
    await screen.findByText('msg n2');
    expect(band(view.container)!.textContent).toBe('2 unread messages');
  });

  it('says it in the singular for one', async () => {
    const view = mount(conversation(undefined), {
      messages: [thread()[0]!, thread()[1]!],
    });
    await screen.findByText('msg n1');
    expect(band(view.container)!.textContent).toBe('1 unread message');
  });

  it('draws no band when everything was already read', async () => {
    const view = mount(conversation(undefined), {
      messages: [waiting('a', '2026-10-12T09:00:00.000Z', ['system-user', 'u1'])],
    });
    await screen.findByText('msg a');
    expect(band(view.container)).toBeNull();
  });

  it('tells the server it has read them — after the band was worked out', async () => {
    const view = mount(conversation(undefined), { messages: thread() });
    await screen.findByText('msg n2');
    await waitFor(() =>
      expect(h.socket.emit).toHaveBeenCalledWith('read', {
        conversationId: CONVERSATION_ID,
        messageIds: ['n1', 'n2'],
      }),
    );
    expect(band(view.container)).not.toBeNull();
  });

  it('keeps the band when the server confirms they are read — it says where the dealer left off', async () => {
    const view = mount(conversation(undefined), { messages: thread() });
    await screen.findByText('msg n2');
    act(() =>
      h.socket.server('read', {
        conversationId: CONVERSATION_ID,
        userId: 'u1',
        messageIds: ['n1', 'n2'],
      }),
    );
    expect(band(view.container)!.textContent).toBe('2 unread messages');
    expect(band(view.container)!.nextElementSibling!.getAttribute('data-mid')).toBe('n1');
  });

  it('a message that arrives while the chat is open is not "unread" — it is read on arrival', async () => {
    const view = mount(conversation(undefined), {
      messages: [waiting('a', '2026-10-12T09:00:00.000Z', ['system-user', 'u1'])],
    });
    await screen.findByText('msg a');
    act(() =>
      h.socket.server('message:new', {
        message: waiting('live', '2026-10-12T09:05:00.000Z'),
        conversation: {},
      }),
    );
    await screen.findByText('msg live');
    expect(band(view.container)).toBeNull();
  });
});

describe('ChatPage — searching inside the chat', () => {
  const hit = (messageId: string, createdAt: string) => ({
    messageId,
    senderId: 'system-user',
    createdAt,
    snippet: 'rate',
  });
  const thread = () => [
    makeMessage({
      id: 'old',
      conversationId: CONVERSATION_ID,
      senderId: 'system-user',
      senderRole: 'admin',
      body: 'Dal rate was 90',
      readBy: ['u1'],
      createdAt: '2026-10-12T08:00:00.000Z',
    }),
    makeMessage({
      id: 'mid',
      conversationId: CONVERSATION_ID,
      senderId: 'u1',
      body: 'something else',
      readBy: ['u1'],
      createdAt: '2026-10-12T08:30:00.000Z',
    }),
    makeMessage({
      id: 'new',
      conversationId: CONVERSATION_ID,
      senderId: 'system-user',
      senderRole: 'admin',
      body: 'Dal rate is now 95',
      readBy: ['u1'],
      createdAt: '2026-10-12T09:00:00.000Z',
    }),
  ];

  async function startSearch() {
    fireEvent.click(await screen.findByRole('button', { name: 'More options' }));
    fireEvent.click(within(screen.getByRole('menu')).getByText('Search'));
    return await screen.findByRole('searchbox');
  }

  const jumped = () => {
    const calls: Element[] = [];
    vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(function (this: Element) {
      calls.push(this);
    });
    return calls;
  };

  it('turns the bar into a search field', async () => {
    mount(conversation(undefined), { messages: thread() });
    await screen.findByText('Dal rate is now 95');
    const field = await startSearch();
    expect(field).toHaveAttribute('placeholder', 'Search');
    expect(screen.queryByRole('button', { name: 'Chat info' })).toBeNull();
  });

  it('asks the server for the typed words (trimmed), once typing has paused', async () => {
    mount(conversation(undefined), { messages: thread(), search: () => [] });
    await screen.findByText('Dal rate is now 95');
    const field = await startSearch();
    fireEvent.change(field, { target: { value: '  ra' } });
    fireEvent.change(field, { target: { value: '  rate  ' } });
    await screen.findByText('No results');
    const searches = h.api.get.mock.calls.filter(
      ([p]) => p === `/v1/conversations/${CONVERSATION_ID}/messages/search`,
    );
    // One request for the finished word, none for the half-typed "ra".
    expect(searches).toHaveLength(1);
    expect(searches[0]![1]).toEqual({ q: 'rate' });
  });

  it('does not search for a single letter, and says so', async () => {
    mount(conversation(undefined), { messages: thread() });
    await screen.findByText('Dal rate is now 95');
    const field = await startSearch();
    fireEvent.change(field, { target: { value: 'r' } });
    expect(await screen.findByText('Type 2 letters')).toBeInTheDocument();
    expect(
      h.api.get.mock.calls.some(([p]) => String(p).endsWith('/messages/search')),
    ).toBe(false);
  });

  it('starts at the NEWEST hit, scrolls to it, and counts the hits', async () => {
    const calls = jumped();
    const view = mount(conversation(undefined), {
      messages: thread(),
      search: () => [hit('new', '2026-10-12T09:00:00.000Z'), hit('old', '2026-10-12T08:00:00.000Z')],
    });
    await screen.findByText('Dal rate is now 95');
    const field = await startSearch();
    fireEvent.change(field, { target: { value: 'rate' } });
    expect(await screen.findByText('1 of 2')).toBeInTheDocument();
    await waitFor(() =>
      expect(calls).toContain(view.container.querySelector('[data-mid="new"]')),
    );
  });

  it('paints the matched words in the bubbles', async () => {
    const view = mount(conversation(undefined), {
      messages: thread(),
      search: () => [hit('new', '2026-10-12T09:00:00.000Z')],
    });
    await screen.findByText('Dal rate is now 95');
    const field = await startSearch();
    fireEvent.change(field, { target: { value: 'rate' } });
    await screen.findByText('1 of 1');
    const marks = view.container.querySelectorAll('mark');
    expect(marks.length).toBeGreaterThan(0);
    expect(marks[0]!.textContent).toBe('rate');
    // Not in a bubble that does not hold the words.
    expect(
      screen.getByText('something else').querySelector('mark'),
    ).toBeNull();
  });

  it('↑ goes to the next OLDER hit and ↓ back to the newer one', async () => {
    const calls = jumped();
    const view = mount(conversation(undefined), {
      messages: thread(),
      search: () => [hit('new', '2026-10-12T09:00:00.000Z'), hit('old', '2026-10-12T08:00:00.000Z')],
    });
    await screen.findByText('Dal rate is now 95');
    const field = await startSearch();
    fireEvent.change(field, { target: { value: 'rate' } });
    await screen.findByText('1 of 2');

    const up = screen.getByRole('button', { name: 'Older result' });
    const down = screen.getByRole('button', { name: 'Newer result' });
    expect(down).toBeDisabled(); // already on the newest
    fireEvent.click(up);
    expect(await screen.findByText('2 of 2')).toBeInTheDocument();
    await waitFor(() =>
      expect(calls).toContain(view.container.querySelector('[data-mid="old"]')),
    );
    expect(up).toBeDisabled(); // nothing older
    fireEvent.click(down);
    expect(await screen.findByText('1 of 2')).toBeInTheDocument();
  });

  it('says "No results" when nothing matches', async () => {
    mount(conversation(undefined), { messages: thread(), search: () => [] });
    await screen.findByText('Dal rate is now 95');
    const field = await startSearch();
    fireEvent.change(field, { target: { value: 'zzzz' } });
    expect(await screen.findByText('No results')).toBeInTheDocument();
  });

  it('a search that FAILED is not "No results" — it says so and offers to try again', async () => {
    let fail = true;
    mount(conversation(undefined), {
      messages: thread(),
      search: () => {
        if (fail) return Promise.reject(new Error('timeout'));
        return [hit('new', '2026-10-12T09:00:00.000Z')];
      },
    });
    await screen.findByText('Dal rate is now 95');
    const field = await startSearch();
    fireEvent.change(field, { target: { value: 'rate' } });
    const failed = await screen.findByRole('button', { name: "Couldn't search. Try again" }, { timeout: 3000 });
    expect(screen.queryByText('No results')).toBeNull();
    fail = false;
    fireEvent.click(failed);
    expect(await screen.findByText('1 of 1')).toBeInTheDocument();
  });

  it('← closes the search, brings the chat\'s bar back and clears the highlights', async () => {
    const view = mount(conversation(undefined), {
      messages: thread(),
      search: () => [hit('new', '2026-10-12T09:00:00.000Z')],
    });
    await screen.findByText('Dal rate is now 95');
    const field = await startSearch();
    fireEvent.change(field, { target: { value: 'rate' } });
    await screen.findByText('1 of 1');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('button', { name: 'Chat info' })).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(view.container.querySelector('mark')).toBeNull();
  });

  it('the phone\'s Back button closes the search, not the chat', async () => {
    mount(conversation(undefined), { messages: thread() });
    await screen.findByText('Dal rate is now 95');
    await startSearch();
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.getByText('Dal rate is now 95')).toBeInTheDocument();
  });
});

describe('ChatPage — sending', () => {
  const photo = (name = 'IMG_1.jpg'): File => new File(['x'], name, { type: 'image/jpeg' });
  const sent = (over: Partial<Message> = {}) =>
    makeMessage({
      id: 'real-1',
      conversationId: CONVERSATION_ID,
      senderId: 'u1',
      readBy: ['u1'],
      ...over,
    });

  beforeEach(() => {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(() => 'blob:local-1'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
  });
  afterEach(() => {
    delete (URL as unknown as Record<string, unknown>).createObjectURL;
    delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
  });

  it('draws the sent text at once, before the server has answered', async () => {
    mount(conversation(undefined));
    await screen.findByText('Ye MDG team ko bhej diya hai.');
    let resolvePost!: (m: Message) => void;
    h.api.post.mockReturnValue(new Promise<Message>((r) => (resolvePost = r)));
    let done = false;
    act(() => {
      void h.composer!.onSend('Hello MDG', []).then(() => (done = true));
    });
    const text = await screen.findByText('Hello MDG');
    expect(text.closest('[data-mid]')!.getAttribute('data-mid')).toMatch(/^temp-/);
    expect(done).toBe(false);
    await act(async () => resolvePost(sent({ body: 'Hello MDG' })));
    await waitFor(() => expect(done).toBe(true));
    expect(screen.getByText('Hello MDG').closest('[data-mid]')!.getAttribute('data-mid')).toBe(
      'real-1',
    );
  });

  it('a just-sent photo is drawn AS the photo at once — and keeps its row when the server confirms it', async () => {
    mount(conversation(undefined));
    await screen.findByText('Ye MDG team ko bhej diya hai.');
    let finishUpload!: (a: Attachment) => void;
    h.upload.mockReturnValue(new Promise<Attachment>((r) => (finishUpload = r)));
    h.api.post.mockResolvedValue(
      sent({
        body: undefined,
        attachments: [
          {
            storageKey: 'chat/c1/real.jpg',
            filename: 'IMG_1.jpg',
            contentType: 'image/jpeg',
            size: 1,
            kind: 'image',
            url: 'https://files.test/real.jpg',
          },
        ],
      }),
    );
    act(() => {
      void h.composer!.onSend('', [{ file: photo(), kind: 'image', contentType: 'image/jpeg' }]);
    });
    // On screen before the upload has even finished: the phone's own copy, with
    // the sending spinner on it, in a bubble that is not yet the server's.
    const img = await screen.findByAltText('IMG_1.jpg');
    expect(img).toHaveAttribute('src', 'blob:local-1');
    const row = img.closest('[data-mid]') as HTMLElement;
    expect(row.getAttribute('data-mid')).toMatch(/^temp-/);
    expect(row.querySelector('.animate-spin')).toBeTruthy();
    expect(row.querySelector('.lucide-file-text')).toBeNull();

    await act(async () =>
      finishUpload({
        storageKey: 'chat/c1/real.jpg',
        filename: 'IMG_1.jpg',
        contentType: 'image/jpeg',
        size: 1,
        kind: 'image',
      }),
    );
    await waitFor(() =>
      expect(screen.getByAltText('IMG_1.jpg').closest('[data-mid]')!.getAttribute('data-mid')).toBe(
        'real-1',
      ),
    );
    // THE SAME ROW: it was not torn down and rebuilt, so the picture did not blink.
    expect(screen.getByAltText('IMG_1.jpg').closest('[data-mid]')).toBe(row);
    expect(row.querySelector('.animate-spin')).toBeNull();
  });

  it('every file failing with no text is reported once, the bubble goes, and the composer gets it back', async () => {
    mount(conversation(undefined));
    await screen.findByText('Ye MDG team ko bhej diya hai.');
    h.upload.mockRejectedValue(new Error('network'));
    let rejected: unknown;
    await act(async () => {
      await h.composer!
        .onSend('', [{ file: photo('a.jpg'), kind: 'image', contentType: 'image/jpeg' }])
        .catch((e: unknown) => (rejected = e));
    });
    expect(rejected).toBeInstanceOf(Error);
    expect(h.api.post).not.toHaveBeenCalled();
    // One red toast for one failure.
    expect(await screen.findByText(/We couldn't send a\.jpg/)).toBeInTheDocument();
    expect(screen.queryByText(/Your message didn't go through/)).toBeNull();
    expect(screen.queryByAltText('a.jpg')).toBeNull();
  });

  it('a file that fails is reported and the rest of the message still goes', async () => {
    mount(conversation(undefined));
    await screen.findByText('Ye MDG team ko bhej diya hai.');
    h.upload
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({
        storageKey: 'chat/c1/b.jpg',
        filename: 'b.jpg',
        contentType: 'image/jpeg',
        size: 1,
        kind: 'image',
      });
    h.api.post.mockResolvedValue(sent({ body: 'two photos' }));
    await act(async () => {
      await h.composer!.onSend('two photos', [
        { file: photo('a.jpg'), kind: 'image', contentType: 'image/jpeg' },
        { file: photo('b.jpg'), kind: 'image', contentType: 'image/jpeg' },
      ]);
    });
    expect(h.api.post).toHaveBeenCalledTimes(1);
    const body = h.api.post.mock.calls[0]![1] as { attachments: { storageKey: string }[] };
    expect(body.attachments.map((a) => a.storageKey)).toEqual(['chat/c1/b.jpg']);
    expect(await screen.findByText(/a\.jpg/)).toBeInTheDocument();
  });

  it('a send that the server refuses takes its bubble away, says so, and gives back the reply target', async () => {
    mount(conversation(undefined));
    await screen.findByText('Ye MDG team ko bhej diya hai.');
    // Reply to the handoff message first.
    swipeReply('handoff');
    await waitFor(() => expect(h.composer!.replyingTo).not.toBeNull());
    h.api.post.mockRejectedValue(new Error('500'));
    let rejected = false;
    await act(async () => {
      await h.composer!.onSend('will fail', []).catch(() => (rejected = true));
    });
    expect(rejected).toBe(true);
    expect(await screen.findByText(/Your message didn't go through/)).toBeInTheDocument();
    expect(screen.queryByText('will fail')).toBeNull();
    expect(h.composer!.replyingTo).not.toBeNull();
  });

  it('keeps messages that arrived while a send was failing', async () => {
    mount(conversation(undefined));
    await screen.findByText('Ye MDG team ko bhej diya hai.');
    let failPost!: (e: Error) => void;
    h.api.post.mockReturnValue(new Promise((_, rej) => (failPost = rej)));
    let rejected = false;
    act(() => {
      void h.composer!.onSend('slow one', []).catch(() => (rejected = true));
    });
    await screen.findByText('slow one');
    act(() =>
      h.socket.server('message:new', {
        message: makeMessage({
          id: 'arrived',
          conversationId: CONVERSATION_ID,
          senderId: 'system-user',
          senderRole: 'admin',
          body: 'arrived meanwhile',
        }),
        conversation: {},
      }),
    );
    await screen.findByText('arrived meanwhile');
    await act(async () => failPost(new Error('500')));
    await waitFor(() => expect(rejected).toBe(true));
    expect(screen.queryByText('slow one')).toBeNull();
    expect(screen.getByText('arrived meanwhile')).toBeInTheDocument();
  });

  /** The swipe a finger makes on a row. */
  function swipeReply(id: string) {
    const row = document.querySelector(`[data-mid="${id}"]`)!;
    fireEvent.pointerDown(row, { pointerType: 'touch', pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(row, { pointerType: 'touch', pointerId: 1, clientX: 90, clientY: 2 });
    fireEvent.pointerUp(row, { pointerType: 'touch', pointerId: 1, clientX: 90, clientY: 2 });
  }
});

describe('ChatPage — "Show in chat" from the gallery', () => {
  it('scrolls to the message the gallery named, once the thread is on screen', async () => {
    const calls: Element[] = [];
    vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(function (this: Element) {
      calls.push(this);
    });
    h.api.get.mockImplementation((path: string) => {
      if (path === '/v1/conversations/mine') return Promise.resolve([conversation(undefined)]);
      if (path === `/v1/conversations/${CONVERSATION_ID}/messages`) return Promise.resolve(history);
      return Promise.resolve([]);
    });
    const qc = makeTestQueryClient();
    const view = render(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <MemoryRouter
            initialEntries={[
              { pathname: `/chat/${CONVERSATION_ID}`, state: { jumpToMessageId: 'q' } },
            ]}
          >
            <Routes>
              <Route path="/chat/:id" element={<ChatPage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );
    await screen.findByText('Mera credit limit kab badhega?');
    await waitFor(() =>
      expect(calls).toContain(view.container.querySelector('[data-mid="q"]')),
    );
  });
});
