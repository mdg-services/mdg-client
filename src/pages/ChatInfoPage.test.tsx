import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import * as React from 'react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ApiModule from '@/lib/api';
import { useLangStore } from '@/store/lang';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';
import type { Conversation, ConversationMediaItem, DealerService } from '@dk/shared/types';

import { ChatInfoPage } from './ChatInfoPage';

const h = vi.hoisted(() => ({ api: { get: vi.fn() }, large: false }));
vi.mock('@/lib/useLargeText', () => ({ useLargeText: () => h.large }));
// Everything else in the module (the socket reads `getApiBaseUrl`) stays real; only `api` is ours.
vi.mock('@/lib/api', async (orig) => ({ ...(await orig<typeof ApiModule>()), api: h.api }));

function conversation(over: Partial<Conversation> = {}): Conversation {
  return {
    id: 'c1',
    dealerId: 'd1',
    userId: 'u1',
    kind: 'support',
    participantUserIds: ['u1'],
    status: 'OPEN',
    unreadByAdmin: false,
    unreadByDealer: false,
    createdAt: '',
    updatedAt: '',
    ...over,
  } as Conversation;
}

const picture = (i: number): ConversationMediaItem => ({
  messageId: `m${i}`,
  senderId: 'x',
  createdAt: new Date(2026, 9, 12, 12, 60 - i).toISOString(),
  attachment: {
    storageKey: `chat/c1/p${i}.png`,
    filename: `p${i}.png`,
    contentType: 'image/png',
    size: 10,
    kind: 'image',
    url: `https://files.test/p${i}.png`,
  },
});

interface Mount {
  list?: Conversation[] | 'error';
  media?: ConversationMediaItem[] | 'error' | 'pending';
  /** What `GET /v1/dealers/d1/services` answers: a list, or an error. */
  services?: Array<Partial<DealerService>> | 'error';
}

function mount({ list = [conversation()], media = [], services = [] }: Mount = {}) {
  h.api.get.mockImplementation((path: string) => {
    if (path === '/v1/dealers/d1/services') {
      return services === 'error' ? Promise.reject(new Error('boom')) : Promise.resolve(services);
    }
    if (path === '/v1/conversations/mine') {
      return list === 'error' ? Promise.reject(new Error('boom')) : Promise.resolve(list);
    }
    if (path === '/v1/conversations/c1/media') {
      if (media === 'pending') return new Promise(() => {});
      return media === 'error' ? Promise.reject(new Error('boom')) : Promise.resolve(media);
    }
    return Promise.resolve([]);
  });
  return renderWithProviders(
    <Routes>
      <Route path="/chat/:id/info" element={<ChatInfoPage />} />
      <Route path="/chat/:id/media" element={<div>MEDIA PAGE</div>} />
      <Route path="/chat/:id" element={<div>THE CHAT</div>} />
      <Route path="/reports" element={<div>REPORTS PAGE</div>} />
      <Route path="/pump/papers" element={<div>PAPERS PAGE</div>} />
      <Route path="/services" element={<div>SERVICES PAGE</div>} />
    </Routes>,
    { route: '/chat/c1/info' },
  );
}

beforeEach(() => {
  h.api.get.mockReset();
  signIn({ id: 'u1', name: 'Ramesh', dealerId: 'd1' });
  useLangStore.setState({ lang: 'en', explicit: true });
});
afterEach(() => {
  resetStores();
  h.large = false;
});

describe('ChatInfoPage — Your MDG team', () => {
  it('is called "Your MDG team", never "Chat info", and says who answers', async () => {
    mount();
    expect(await screen.findByRole('heading', { name: 'Who answers you' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your MDG team' })).toBeInTheDocument();
    expect(screen.queryByText('Chat info')).toBeNull();
    expect(screen.getByText('MDG team')).toBeInTheDocument();
    expect(screen.getByText('The MDG team answers your messages here.')).toBeInTheDocument();
    // No member list: it is not a group.
    expect(screen.queryByText(/People in this chat/)).toBeNull();
  });

  it('has a back arrow that names where it goes, and goes back to the chat when opened cold', async () => {
    mount();
    await screen.findByRole('heading', { name: 'Your MDG team' });
    fireEvent.click(screen.getByRole('button', { name: 'Back to chat' }));
    expect(await screen.findByText('THE CHAT')).toBeInTheDocument();
  });

  it('opens the chat from "Open this chat"', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Open this chat' }));
    expect(await screen.findByText('THE CHAT')).toBeInTheDocument();
  });
});

describe('ChatInfoPage — the open question', () => {
  const ticket = (over: Record<string, unknown> = {}) => ({
    id: 't1',
    number: 3,
    state: 'OPEN',
    seen: true,
    raisedAt: new Date().toISOString(),
    ...over,
  });

  it("says where the dealer's question stands, in the same words as the bar in the chat", async () => {
    mount({ list: [conversation({ tickets: [ticket()] as never })] });
    expect(
      await screen.findByRole('heading', { name: 'Your question to MDG' }),
    ).toBeInTheDocument();
    expect(screen.getByText('We are looking at it')).toBeInTheDocument();
    expect(screen.queryByText(/Nothing is waiting with MDG/)).toBeNull();
  });

  it('says nothing is waiting when there is no ticket', async () => {
    mount();
    expect(
      await screen.findByText('Nothing is waiting with MDG. Write in the chat any time.'),
    ).toBeInTheDocument();
  });
});

describe('ChatInfoPage — photos, papers and links', () => {
  it('opens the gallery from its row, which is not called "Media, links and docs"', async () => {
    mount({ media: [picture(1)] });
    expect(screen.queryByText(/Media, links and docs/)).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: /Photos, papers and links/ }));
    expect(await screen.findByText('MEDIA PAGE')).toBeInTheDocument();
  });

  it('counts the pictures and peeks at the newest few', async () => {
    mount({ media: [1, 2, 3, 4, 5, 6].map(picture) });
    const row = await screen.findByRole('button', { name: /Photos, papers and links/ });
    await waitFor(() =>
      expect(within(row).getByText('6 photos, papers and links sent here')).toBeInTheDocument(),
    );
    // No bare number beside the arrow: the count is a sentence.
    expect(within(row).queryByText('6')).toBeNull();
    const peeks = await screen.findAllByRole('button', { name: /^p\d\.png$/ });
    // The newest four, newest first.
    expect(peeks.map((p) => p.getAttribute('aria-label'))).toEqual([
      'p1.png',
      'p2.png',
      'p3.png',
      'p4.png',
    ]);
    expect(peeks[0]!.querySelector('img')).toHaveAttribute('src', 'https://files.test/p1.png');
  });

  it('a tap on a thumbnail opens the gallery too', async () => {
    mount({ media: [picture(1)] });
    fireEvent.click(await screen.findByRole('button', { name: 'p1.png' }));
    expect(await screen.findByText('MEDIA PAGE')).toBeInTheDocument();
  });

  it('adds a "+" when the gallery has more pages than were loaded', async () => {
    // 30 distinct messages is a full page: there may be more.
    mount({ media: Array.from({ length: 30 }, (_, i) => picture(i + 1)) });
    const row = await screen.findByRole('button', { name: /Photos, papers and links/ });
    await waitFor(() =>
      expect(within(row).getByText('More than 30 sent here')).toBeInTheDocument(),
    );
  });

  it('says nothing was sent, in words and with no "0", for a chat with no pictures', async () => {
    mount({ media: [] });
    const row = await screen.findByRole('button', { name: /Photos, papers and links/ });
    await waitFor(() =>
      expect(within(row).getByText('Nothing has been sent in this chat yet')).toBeInTheDocument(),
    );
    expect(within(row).queryByText('0')).toBeNull();
    expect(screen.queryAllByRole('button', { name: /\.png$/ })).toHaveLength(0);
  });

  it('a gallery that failed to load says so — it is not drawn as "0"', async () => {
    mount({ media: 'error' });
    expect(
      await screen.findByText("Couldn't load the photos", undefined, { timeout: 4000 }),
    ).toBeInTheDocument();
    const row = screen.getByRole('button', { name: /Photos, papers and links/ });
    expect(within(row).queryByText('0')).toBeNull();
    // The row itself still opens the gallery, which can try again.
    fireEvent.click(row);
    expect(await screen.findByText('MEDIA PAGE')).toBeInTheDocument();
  });

  it('shows a loading line, and no count, while it loads', async () => {
    mount({ media: 'pending' });
    const row = await screen.findByRole('button', { name: /Photos, papers and links/ });
    expect(within(row).queryByText(/^\d/)).toBeNull();
    expect(screen.getByRole('status', { name: 'Loading…' })).toBeInTheDocument();
  });
});

describe('ChatInfoPage — shortcuts', () => {
  it('opens Reports, Papers and licences, and the services', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Your reports/ }));
    expect(await screen.findByText('REPORTS PAGE')).toBeInTheDocument();
  });

  it('opens Papers and licences', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Papers and licences/ }));
    expect(await screen.findByText('PAPERS PAGE')).toBeInTheDocument();
  });

  it("names the services that run, in the dealer's words, and opens the Services door", async () => {
    mount({
      services: [
        { serviceId: 'dsr-report', status: 'ACTIVE' },
        { serviceId: 'water-ingress-testing', status: 'ACTIVE' },
        { serviceId: 'sdms-password-reset', status: 'ACTIVE' },
        { serviceId: 'mock-drill', status: 'PAUSED' },
      ],
    });
    const row = await screen.findByRole('button', { name: /What MDG runs for you/ });
    await waitFor(() => expect(row).toHaveTextContent(/Daily Sales Report/));
    // A background service and a paused one are never listed.
    expect(row.textContent).not.toMatch(/password/i);
    expect(row.textContent).not.toMatch(/Mock drill/i);
    fireEvent.click(row);
    expect(await screen.findByText('SERVICES PAGE')).toBeInTheDocument();
  });

  it('says "and N more" past three names', async () => {
    mount({
      services: [
        'dsr-report',
        'water-ingress-testing',
        'load-planner',
        'tt-density',
        'tanker-documents',
      ].map((serviceId) => ({ serviceId, status: 'ACTIVE' as const })),
    });
    const row = await screen.findByRole('button', { name: /What MDG runs for you/ });
    await waitFor(() => expect(row).toHaveTextContent(/2 more/));
  });

  it('does not list an owner-only service to a manager', async () => {
    // The manager is signed in before the page is drawn (the test's own sign-in is the owner).
    signIn({ id: 'u1', name: 'Raju', role: 'dealer-staff', dealerId: 'd1' });
    mount({
      services: [
        { serviceId: 'credit-dod-monitoring', status: 'ACTIVE' },
        { serviceId: 'dsr-report', status: 'ACTIVE' },
      ],
    });
    const row = await screen.findByRole('button', { name: /What MDG runs for you/ });
    await waitFor(() => expect(row).toHaveTextContent(/Daily Sales Report/));
    expect(row.textContent).not.toMatch(/Credit/);
  });

  it('keeps the shortcut, without names, when the services list cannot load', async () => {
    mount({ services: 'error' });
    const row = await screen.findByRole('button', { name: /What MDG runs for you/ });
    expect(row).toHaveTextContent('Your services, one by one');
  });
});

describe('ChatInfoPage — the manager group', () => {
  const group = () =>
    conversation({
      kind: 'manager',
      participants: [
        { userId: 'u1', name: 'Ramesh', role: 'dealer-owner' },
        { userId: 'u9', name: 'Raju', role: 'dealer-staff', title: 'Station manager' },
        { userId: 'u10', name: 'Sita', role: 'dealer-owner' },
      ],
    });

  it('names the group and counts its members', async () => {
    mount({ list: [group()] });
    expect(await screen.findByRole('heading', { name: /People in this chat/ })).toHaveTextContent(
      '3',
    );
    // The people are named in the list; the group is not described as a desk.
    expect(screen.getByText('Raju')).toBeInTheDocument();
  });

  it('lists each member with their role, and "You" for the reader', async () => {
    mount({ list: [group()] });
    await screen.findByRole('heading', { name: /People in this chat/ });
    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.queryByText('Ramesh')).toBeNull(); // the reader is "You", not their name
    expect(screen.getByText('Raju')).toBeInTheDocument();
    expect(screen.getByText('Sita')).toBeInTheDocument();
    // The server's own title when it sent one, the role otherwise.
    expect(screen.getByText('Station manager')).toBeInTheDocument();
    expect(screen.getAllByText('Owner')).toHaveLength(2);
  });

  it('does not say who "answers" — people are in the chat, not a desk', async () => {
    mount({ list: [group()] });
    await screen.findByRole('heading', { name: /People in this chat/ });
    expect(screen.queryByText('The MDG team answers your messages here.')).toBeNull();
  });

  it('speaks Hindi on the Hindi screen', async () => {
    useLangStore.setState({ lang: 'hi', explicit: true });
    mount({ list: [group()] });
    expect(
      await screen.findByRole('heading', { name: /इस चैट में कौन-कौन है/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'आपकी MDG टीम' })).toBeInTheDocument();
  });
});

describe('ChatInfoPage — when the chat cannot be shown', () => {
  it('a failed list says it failed and offers to try again — it is not "not available"', async () => {
    mount({ list: 'error' });
    expect(
      await screen.findByRole('button', { name: 'Try again' }, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/We could not load your chats/);
    expect(screen.queryByText("This chat isn't available.")).toBeNull();
  });

  it("a chat that is not the member's says so", async () => {
    mount({ list: [conversation({ id: 'someone-elses' })] });
    expect(await screen.findByText("This chat isn't available.")).toBeInTheDocument();
  });

  it('keeps the title bar and its way back on every one of those screens', async () => {
    mount({ list: [] });
    await screen.findByText("This chat isn't available.");
    expect(screen.getByRole('button', { name: 'Back to chat' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your MDG team' })).toBeInTheDocument();
  });
});

describe('ChatInfoPage — layout', () => {
  it('"Open this chat" is a 44px row with no 56px empty strip under it', async () => {
    mount();
    const open = await screen.findByRole('button', { name: 'Open this chat' });
    expect(open.className).toContain('min-h-11');
    expect(open.className).not.toContain('min-h-14');
  });

  it('puts the picture of who answers beside the words at normal text, above them at large text', async () => {
    const { container, unmount } = mount();
    await screen.findByText('Who answers you');
    const row = container.querySelector('[aria-hidden="true"].rounded-full')!.parentElement!;
    expect(row.className).not.toContain('flex-col');
    unmount();
    h.large = true;
    const again = mount();
    await screen.findByText('Who answers you');
    const rowLarge = again.container.querySelector(
      '[aria-hidden="true"].rounded-full',
    )!.parentElement!;
    expect(rowLarge.className).toContain('flex-col');
    expect(again.container.querySelector('.h-12.w-12')).toBeNull();
  });
});

describe('ChatInfoPage — no clipped words, no pixel sizes', () => {
  it('draws names that wrap, and no truncate, line-clamp or fixed pixel box', async () => {
    const { container } = mount({
      list: [
        conversation({
          kind: 'manager',
          participants: [{ userId: 'u9', name: 'A very long name that must wrap' }],
        }),
      ],
    });
    await screen.findByText('A very long name that must wrap');
    expect(container.innerHTML).not.toMatch(/truncate|line-clamp/);
    expect(container.innerHTML).not.toMatch(/\b(min-)?[hw]-\[\d+px\]/);
  });
});
