import { fireEvent, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useLangStore } from '@/store/lang';
import { renderWithProviders } from '@/test/utils';
import type { ConversationMediaItem } from '@dk/shared/types';

import { ChatMediaPage } from './ChatMediaPage';

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ api }));

function item(overrides: Partial<ConversationMediaItem>): ConversationMediaItem {
  return {
    messageId: 'm1',
    senderId: 'u1',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

const mediaItem = item({
  messageId: 'm-img',
  attachment: {
    storageKey: 'chat/c1/a-pic.jpg',
    filename: 'pic.jpg',
    contentType: 'image/jpeg',
    size: 1000,
    kind: 'image',
    url: 'https://s3.test/pic.jpg',
  },
});
const docItem = item({
  messageId: 'm-doc',
  attachment: {
    storageKey: 'chat/c1/b-report.pdf',
    filename: 'report.pdf',
    contentType: 'application/pdf',
    size: 2048,
    kind: 'file',
    url: 'https://s3.test/report.pdf',
  },
});
const linkItem = item({
  messageId: 'm-link',
  urls: ['https://example.com/offer'],
  bodySnippet: 'check https://example.com/offer',
});

function mockByTab() {
  api.get.mockImplementation((_path: string, query?: { tab?: string }) => {
    if (query?.tab === 'docs') return Promise.resolve([docItem]);
    if (query?.tab === 'links') return Promise.resolve([linkItem]);
    return Promise.resolve([mediaItem]);
  });
}

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/chat/:id/media" element={<ChatMediaPage />} />
    </Routes>,
    { route: '/chat/c1/media' },
  );
}

describe('ChatMediaPage', () => {
  beforeEach(() => {
    useLangStore.setState({ lang: 'en', explicit: false });
    api.get.mockReset();
  });

  it('loads the media tab by default and renders the image grid', async () => {
    mockByTab();
    renderPage();
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        '/v1/conversations/c1/media',
        expect.objectContaining({ tab: 'media', limit: 30 }),
      ),
    );
    const img = await screen.findByAltText('pic.jpg');
    expect(img).toHaveAttribute('src', 'https://s3.test/pic.jpg');
    expect(img).toHaveAttribute('loading', 'lazy');
  });

  it('switching tabs fetches that tab and renders its layout', async () => {
    mockByTab();
    renderPage();
    await screen.findByAltText('pic.jpg');

    fireEvent.click(screen.getByRole('button', { name: 'Docs' }));
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        '/v1/conversations/c1/media',
        expect.objectContaining({ tab: 'docs' }),
      ),
    );
    expect(await screen.findByText('report.pdf')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Links' }));
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        '/v1/conversations/c1/media',
        expect.objectContaining({ tab: 'links' }),
      ),
    );
    const link = await screen.findByRole('link');
    expect(link).toHaveAttribute('href', 'https://example.com/offer');
    expect(link).toHaveAttribute('target', '_blank');
    expect(screen.getByText('example.com')).toBeInTheDocument();
  });

  it('shows the per-tab empty state', async () => {
    api.get.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText('No photos yet')).toBeInTheDocument();
  });

  it('offers load-more only when the page came back full', async () => {
    // A full page (30 MESSAGES) ⇒ hasMore.
    const fullPage = Array.from({ length: 30 }, (_, i) =>
      item({
        messageId: `m-${i}`,
        attachment: { ...mediaItem.attachment!, storageKey: `k-${i}` },
      }),
    );
    api.get.mockResolvedValue(fullPage);
    renderPage();
    expect(await screen.findByText('Load more')).toBeInTheDocument();
  });

  it('does NOT offer load-more when multi-image messages inflate the item count', async () => {
    // The server pages by MESSAGE: 15 messages × 2 images = 30 items, but the
    // history is exhausted (fewer than 30 messages) — no phantom Load-more.
    const inflated = Array.from({ length: 30 }, (_, i) =>
      item({
        messageId: `m-${Math.floor(i / 2)}`,
        attachment: { ...mediaItem.attachment!, storageKey: `k-${i}` },
      }),
    );
    api.get.mockResolvedValue(inflated);
    renderPage();
    await screen.findAllByAltText('pic.jpg');
    expect(screen.queryByText('Load more')).not.toBeInTheDocument();
  });
});
