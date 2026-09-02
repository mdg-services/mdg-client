import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, api } from '@/lib/api';
import type * as ApiModule from '@/lib/api';
import { useLangStore } from '@/store/lang';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';
import type { DealerService } from '@dk/shared/types';

vi.mock('@/lib/api', async (orig) => {
  const actual = await orig<typeof ApiModule>();
  return { ...actual, api: { ...actual.api, get: vi.fn() } };
});

const { ServicesPage } = await import('./ServicesPage');

function svc(overrides: Partial<DealerService> = {}): DealerService {
  return {
    id: 's1',
    dealerId: 'd1',
    serviceId: 'tt-density',
    // A dealer never receives `config` — the route strips it — so nothing on
    // this page may read it. It is here only to prove the page ignores it.
    config: {},
    cadence: 'DAILY',
    schedule: '0 7 * * *',
    status: 'ACTIVE',
    lastRunAt: '2026-08-24T01:35:00.000Z',
    nextRunAt: '2026-08-25T01:35:00.000Z',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-24T01:35:00.000Z',
    ...overrides,
  } as DealerService;
}

function renderServices(lang: 'en' | 'hi' = 'en') {
  signIn({ id: 'owner', dealerId: 'd1' });
  useLangStore.setState({ lang, explicit: true });
  return renderWithProviders(<ServicesPage />);
}

describe('ServicesPage', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
  });

  afterEach(() => resetStores());

  /**
   * The reported bug. This page asked for `/v1/dealer-services?dealerId=…`,
   * which the backend has never served — that router registers only
   * PATCH/DELETE/POST on `/:dsId` — so every dealer got a 404, which the page
   * then swallowed into an empty array and rendered as "No services yet".
   */
  it('asks the route that exists, per dealer', async () => {
    vi.mocked(api.get).mockResolvedValue([svc()]);

    renderServices();

    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(api.get).toHaveBeenCalledWith('/v1/dealers/d1/services');
    expect(vi.mocked(api.get).mock.calls[0]?.[0]).not.toBe('/v1/dealer-services');
  });

  it('names the service the way the dealer does, in English', async () => {
    vi.mocked(api.get).mockResolvedValue([
      svc({ serviceId: 'tt-density' }),
      svc({ id: 's2', serviceId: 'credit-dod-monitoring', cadence: 'DAILY' }),
    ]);

    renderServices('en');

    expect(await screen.findByText('TT Density')).toBeInTheDocument();
    expect(screen.getByText('Credit & DOD Monitoring')).toBeInTheDocument();
    expect(screen.queryByText('tt-density')).not.toBeInTheDocument();
    expect(screen.queryByText('credit-dod-monitoring')).not.toBeInTheDocument();
  });

  /**
   * The point of the whole change: a Hindi-first pump owner was being shown a
   * folder name off our server. In Hindi the name is the dealer's own word for
   * the thing — the register on their desk — not a translation of "TT Density".
   */
  it('names it in the dealer’s own words in Hindi', async () => {
    vi.mocked(api.get).mockResolvedValue([svc({ serviceId: 'tt-density' })]);

    renderServices('hi');

    expect(await screen.findByText('डेंसिटी रजिस्टर')).toBeInTheDocument();
    expect(screen.queryByText('tt-density')).not.toBeInTheDocument();
    expect(screen.queryByText('TT Density')).not.toBeInTheDocument();
  });

  /** An id we have no name for is shown as-is rather than crashing the page. */
  it('degrades an unknown service id to the id itself', async () => {
    vi.mocked(api.get).mockResolvedValue([svc({ serviceId: 'brand-new-plugin' })]);

    renderServices('hi');

    expect(await screen.findByText('brand-new-plugin')).toBeInTheDocument();
  });

  /**
   * The 404 catch is gone with the bad path. A genuine failure must reach the
   * error state — telling a dealer they have no services when the request in
   * fact failed is how this bug survived for as long as it did.
   */
  it('shows the error state on a failure instead of "No services yet"', async () => {
    vi.mocked(api.get).mockRejectedValue(
      new ApiError(404, 'NOT_FOUND', 'Not found'),
    );

    renderServices('en');

    expect(
      await screen.findByText("We couldn't show your services just now"),
    ).toBeInTheDocument();
    expect(screen.queryByText('No services yet')).not.toBeInTheDocument();
  });

  it('still shows the empty state when the dealer genuinely has none', async () => {
    vi.mocked(api.get).mockResolvedValue([]);

    renderServices('en');

    expect(await screen.findByText('No services yet')).toBeInTheDocument();
  });
});
