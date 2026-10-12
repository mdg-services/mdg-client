import { fireEvent, screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ApiModule from '@/lib/api';
import { ApiError, api } from '@/lib/api';
import { useLangStore } from '@/store/lang';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';

vi.mock('@/lib/api', async (orig) => {
  const actual = await orig<typeof ApiModule>();
  return { ...actual, api: { ...actual.api, get: vi.fn(), post: vi.fn(), patch: vi.fn() } };
});

const { DensityPage } = await import('./DensityPage');
const { StaffPage } = await import('./StaffPage');

/**
 * The two feature pages that have no test of their own, held to the one rule
 * every screen now shares: it draws its own top bar — the title, and a ← that
 * leaves it — because there is no bottom bar to leave by, and the bar is on
 * every state of the page, a failed load included.
 */

function renderAt(path: '/density' | '/staff', page: React.ReactElement) {
  signIn({ id: 'owner', dealerId: 'd1', role: 'dealer-owner' });
  useLangStore.setState({ lang: 'en', explicit: true });
  return renderWithProviders(
    <Routes>
      <Route path={path} element={page} />
      <Route path="/settings" element={<div>settings-page</div>} />
      <Route path="/chat" element={<div>chat-list</div>} />
    </Routes>,
    { route: path, withRouter: true },
  );
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
});
afterEach(() => resetStores());

// Where ← lands when the page was opened cold: a page a notification can open
// (density) goes home to the chat list; one only Settings leads to goes there.
describe.each([
  ['Density register', '/density' as const, <DensityPage key="d" />, 'We could not open this', 'chat-list'],
  ['Warriors & points', '/staff' as const, <StaffPage key="s" />, "We couldn't load this just now", 'settings-page'],
])('%s — its own top bar', (title, path, page, failedTitle, home) => {
  it('is headed by the bar while it loads', () => {
    vi.mocked(api.get).mockImplementation(() => new Promise(() => undefined));
    renderAt(path, page);
    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });

  it('keeps the bar — and its way out — when the load fails', async () => {
    vi.mocked(api.get).mockRejectedValue(new ApiError(500, 'ERR', 'boom'));
    renderAt(path, page);

    expect(await screen.findByText(failedTitle)).toBeInTheDocument();
    // The title is the bar's, printed once.
    expect(screen.getAllByText(title)).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText(home)).toBeInTheDocument();
  });
});
