import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import * as React from 'react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useLangStore } from '@/store/lang';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';
import type { Conversation, ConversationMediaItem } from '@dk/shared/types';

import { ChatInfoPage } from './ChatInfoPage';

const h = vi.hoisted(() => ({ api: { get: vi.fn() } }));
vi.mock('@/lib/api', () => ({ api: h.api }));

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
}

function mount({ list = [conversation()], media = [] }: Mount = {}) {
  h.api.get.mockImplementation((path: string) => {
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
    </Routes>,
    { route: '/chat/c1/info' },
  );
}

beforeEach(() => {
  h.api.get.mockReset();
  signIn({ id: 'u1', name: 'Ramesh' });
  useLangStore.setState({ lang: 'en', explicit: true });
});
afterEach(() => resetStores());

describe('ChatInfoPage — the support chat', () => {
  it('shows the chat\'s picture and name, and says who answers', async () => {
    const { container } = mount();
    expect(await screen.findByRole('heading', { name: 'Support' })).toBeInTheDocument();
    expect(screen.getByText('MDG team')).toBeInTheDocument();
    expect(screen.getByText('The MDG team answers your messages here.')).toBeInTheDocument();
    // A big round avatar, 96px.
    const avatar = container.querySelector<HTMLElement>('span[aria-hidden].rounded-full')!;
    expect(avatar.style.width).toBe('96px');
    // No member list: it is not a group.
    expect(screen.queryByText(/members/)).toBeNull();
  });

  it('has a title bar with a way back, and goes back to the chat when opened cold', async () => {
    mount();
    await screen.findByRole('heading', { name: 'Support' });
    expect(screen.getByText('Chat info')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('THE CHAT')).toBeInTheDocument();
  });
});

describe('ChatInfoPage — media, links and docs', () => {
  it('opens the gallery from its row', async () => {
    mount({ media: [picture(1)] });
    fireEvent.click(await screen.findByRole('button', { name: /Media, links and docs/ }));
    expect(await screen.findByText('MEDIA PAGE')).toBeInTheDocument();
  });

  it('counts the pictures and peeks at the newest few', async () => {
    mount({ media: [1, 2, 3, 4, 5, 6].map(picture) });
    const row = await screen.findByRole('button', { name: /Media, links and docs/ });
    await waitFor(() => expect(within(row).getByText('6')).toBeInTheDocument());
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
    const row = await screen.findByRole('button', { name: /Media, links and docs/ });
    await waitFor(() => expect(within(row).getByText('30+')).toBeInTheDocument());
  });

  it('shows 0 and no thumbnails for a chat with no pictures', async () => {
    mount({ media: [] });
    const row = await screen.findByRole('button', { name: /Media, links and docs/ });
    await waitFor(() => expect(within(row).getByText('0')).toBeInTheDocument());
    expect(screen.queryAllByRole('button', { name: /\.png$/ })).toHaveLength(0);
  });

  it('a gallery that failed to load says so — it is not drawn as "0"', async () => {
    mount({ media: 'error' });
    expect(await screen.findByText("Couldn't load the photos", undefined, { timeout: 4000 })).toBeInTheDocument();
    const row = screen.getByRole('button', { name: /Media, links and docs/ });
    expect(within(row).queryByText('0')).toBeNull();
    // The row itself still opens the gallery, which can try again.
    fireEvent.click(row);
    expect(await screen.findByText('MEDIA PAGE')).toBeInTheDocument();
  });

  it('shows a spinner, and no count, while it loads', async () => {
    const { container } = mount({ media: 'pending' });
    await screen.findByRole('heading', { name: 'Support' });
    const row = screen.getByRole('button', { name: /Media, links and docs/ });
    expect(within(row).queryByText(/^\d/)).toBeNull();
    expect(container.querySelector('.animate-spin')).toBeTruthy();
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
    expect(await screen.findByRole('heading', { name: 'Manager chat' })).toBeInTheDocument();
    expect(screen.getByText('Group · 3 members')).toBeInTheDocument();
    expect(screen.getByText('3 members')).toBeInTheDocument();
  });

  it('lists each member with their role, and "You" for the reader', async () => {
    mount({ list: [group()] });
    await screen.findByRole('heading', { name: 'Manager chat' });
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
    await screen.findByRole('heading', { name: 'Manager chat' });
    expect(screen.queryByText('The MDG team answers your messages here.')).toBeNull();
  });

  it('speaks Hindi on the Hindi screen', async () => {
    useLangStore.setState({ lang: 'hi', explicit: true });
    mount({ list: [group()] });
    expect(await screen.findByText('ग्रुप · 3 सदस्य')).toBeInTheDocument();
  });
});

describe('ChatInfoPage — when the chat cannot be shown', () => {
  it('a failed list says it failed and offers to try again — it is not "not available"', async () => {
    mount({ list: 'error' });
    expect(
      await screen.findByRole('button', { name: 'Try again' }, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(screen.queryByText("This chat isn't available.")).toBeNull();
  });

  it('a chat that is not the member\'s says so', async () => {
    mount({ list: [conversation({ id: 'someone-elses' })] });
    expect(await screen.findByText("This chat isn't available.")).toBeInTheDocument();
  });

  it('keeps the title bar and its way back on every one of those screens', async () => {
    mount({ list: [] });
    await screen.findByText("This chat isn't available.");
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });
});
