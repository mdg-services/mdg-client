import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ApiModule from '@/lib/api';
import { ApiError, api } from '@/lib/api';
import { useLangStore } from '@/store/lang';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';

vi.mock('@/lib/api', async (orig) => {
  const actual = await orig<typeof ApiModule>();
  return { ...actual, api: { ...actual.api, get: vi.fn() } };
});

const { PapersPage } = await import('./PapersPage');

/** 12:00 India time on Fri 27 Nov 2026. */
const NOW = new Date('2026-11-27T06:30:00.000Z');

const OUTLET = '/v1/me/outlet';
const ON_FILE = '/v1/asks/me/on-file';

type Answer = unknown | Error | 'pending';

const licence = (key: string, label: string, expiresOn: string, expiryState: string) => ({
  key,
  label,
  group: 'licences',
  kind: 'date',
  value: 'No. 1',
  expiresOn,
  expiryState,
  maxLength: 60,
  dealerVisible: true,
  custom: false,
});

const paper = (id: string, titleEn: string, over: Record<string, unknown> = {}) => ({
  id,
  kindCode: 'register-page',
  titleEn,
  titleHi: `${titleEn} (हिंदी)`,
  periodLabel: 'Nov 2026',
  ...over,
});

function serve(answers: Record<string, Answer>) {
  vi.mocked(api.get).mockImplementation(((path: string) => {
    if (!(path in answers)) return Promise.reject(new ApiError(404, 'NOT_FOUND', `unexpected GET ${path}`));
    const a = answers[path];
    if (a === 'pending') return new Promise(() => undefined);
    return a instanceof Error ? Promise.reject(a) : Promise.resolve(a);
  }) as never);
}

function renderPapers(lang: 'en' | 'hi' | 'hl' = 'en', role: 'dealer-owner' | 'dealer-staff' = 'dealer-owner') {
  signIn({ role, dealerId: 'd1' });
  useLangStore.setState({ lang, explicit: true });
  return renderWithProviders(
    <Routes>
      <Route path="/pump" element={<div>went:pump</div>} />
      <Route path="/pump/papers" element={<PapersPage />} />
    </Routes>,
    { route: '/pump/papers' },
  );
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  resetStores();
});

describe('Papers and licences', () => {
  it('lists the licences with their days left and the papers MDG accepted, each with a shape and a word', async () => {
    serve({
      [OUTLET]: {
        fields: [
          licence('explosiveLicenceNo', 'Explosive licence', '2026-12-06', 'expiring'),
          licence('wmLicenceNo', 'Weights and Measures licence', '2027-09-01', 'valid'),
        ],
      },
      [ON_FILE]: {
        rows: [
          paper('a1', 'Fire NOC', { kindCode: 'fire-noc', validUntil: '2026-11-20' }),
          paper('a2', 'Density register', {}),
        ],
        kinds: [],
        today: '2026-11-27',
      },
    });
    const { container } = renderPapers();

    await screen.findByText('Fire NOC');
    const licences = screen.getByRole('region', { name: 'Licences' });
    expect(within(licences).getByText('Explosive licence')).toBeInTheDocument();
    // The days lead the chip: the number is the first thing read.
    expect(within(licences).getByText('9 days left')).toBeInTheDocument();
    expect(within(licences).getByText('Weights and Measures licence')).toBeInTheDocument();
    expect(within(licences).getByText('Valid until 1 Sep 2027')).toBeInTheDocument();

    const accepted = screen.getByRole('region', { name: 'Other papers MDG has accepted' });
    expect(within(accepted).getByText('Fire NOC')).toBeInTheDocument();
    expect(within(accepted).getByText('Expired')).toBeInTheDocument();
    expect(within(accepted).getByText('Ended on 20 Nov 2026')).toBeInTheDocument();
    // A paper with no end date is simply on file, never "valid".
    expect(within(accepted).getByText('Density register')).toBeInTheDocument();
    expect(within(accepted).getByText('On file')).toBeInTheDocument();

    // Every row has its shape.
    expect(container.querySelectorAll('[data-status]').length).toBeGreaterThanOrEqual(5);
  });

  it('puts the worst first inside each list: expired, then ending soon, then valid', async () => {
    serve({
      [OUTLET]: {
        fields: [
          licence('wmLicenceNo', 'Weights and Measures licence', '2027-09-01', 'valid'),
          licence('explosiveLicenceNo', 'Explosive licence', '2026-12-06', 'expiring'),
          licence('dtoTradeLicenceNo', 'DTO trade licence', '2026-11-01', 'expired'),
        ],
      },
      [ON_FILE]: { rows: [], kinds: [], today: '2026-11-27' },
    });
    renderPapers();
    await screen.findByText('DTO trade licence', { selector: 'p' });
    const licences = screen.getByRole('region', { name: 'Licences' });
    const lines = within(licences)
      .getAllByText(/licence/i, { selector: 'p' })
      .map((el) => el.textContent);
    expect(lines).toEqual(['DTO trade licence', 'Explosive licence', 'Weights and Measures licence']);
  });

  // The same licence was on the page twice (once from each list), sometimes under two Hindi names.
  it('shows a licence ONCE when both lists carry it, with the later end date and an "MDG accepted" mark', async () => {
    serve({
      [OUTLET]: { fields: [licence('wmLicenceNo', 'Weights and Measures licence', '2026-12-06', 'expiring')] },
      [ON_FILE]: {
        rows: [
          paper('a1', 'Weights & Measures licence', { kindCode: 'wm-licence', validUntil: '2027-12-06', validityState: 'valid' }),
          paper('a2', 'Fire NOC', { kindCode: 'fire-noc', validUntil: '2026-12-20', validityState: 'expiring' }),
        ],
        kinds: [],
        today: '2026-11-27',
      },
    });
    renderPapers();
    await screen.findByText('Fire NOC');
    const licences = screen.getByRole('region', { name: 'Licences' });
    expect(within(licences).getAllByText('Weights and Measures licence')).toHaveLength(1);
    // The accepted renewal (a year on) replaced the older date of the outlet file.
    expect(within(licences).getByText('Valid until 6 Dec 2027')).toBeInTheDocument();
    expect(within(licences).queryByText('9 days left')).not.toBeInTheDocument();
    expect(within(licences).getByText('MDG accepted')).toBeInTheDocument();
    // Nothing of that licence is repeated in the other list.
    const other = screen.getByRole('region', { name: 'Other papers MDG has accepted' });
    expect(within(other).queryByText(/Weights/)).not.toBeInTheDocument();
    expect(within(other).getByText('Fire NOC')).toBeInTheDocument();
    expect(within(other).queryByText('MDG accepted')).not.toBeInTheDocument();
  });

  it('counts at the top and never repeats a paper\'s name: "1 paper has expired, 1 ends soon, 1 valid"', async () => {
    serve({
      [OUTLET]: {
        fields: [
          licence('dtoTradeLicenceNo', 'DTO trade licence', '2026-11-01', 'expired'),
          licence('explosiveLicenceNo', 'Explosive licence', '2026-12-06', 'expiring'),
          licence('wmLicenceNo', 'Weights and Measures licence', '2027-09-01', 'valid'),
        ],
      },
      [ON_FILE]: { rows: [], kinds: [], today: '2026-11-27' },
    });
    const { container } = renderPapers();
    const top = await screen.findByText('1 paper has expired, 1 ends soon, 1 valid');
    expect(top.closest('[data-status]') ?? top.parentElement?.querySelector('[data-status]')).not.toBeNull();
    expect(container.querySelector('[data-status="problem"]')).not.toBeNull();
    // The name is in its row only, once.
    expect(screen.getAllByText('DTO trade licence')).toHaveLength(1);
  });

  it('says "All valid" at the top only when both lists have arrived and nothing is ending', async () => {
    serve({
      [OUTLET]: { fields: [licence('wmLicenceNo', 'Weights and Measures licence', '2027-09-01', 'valid')] },
      [ON_FILE]: { rows: [], kinds: [], today: '2026-11-27' },
    });
    renderPapers();
    expect(await screen.findByText('All valid')).toBeInTheDocument();
  });

  it('counts a filed paper that is ending: "1 ends soon"', async () => {
    serve({
      [OUTLET]: { fields: [] },
      [ON_FILE]: {
        rows: [paper('a1', 'Fire NOC', { kindCode: 'fire-noc', validUntil: '2026-12-06', validityState: 'expiring' })],
        kinds: [],
        today: '2026-11-27',
      },
    });
    renderPapers();
    expect(await screen.findByText('1 ends soon')).toBeInTheDocument();
    expect(screen.getByText('9 days left')).toBeInTheDocument();
  });

  it('does not say "All valid" while one list is still on the way, or after one failed', async () => {
    serve({
      [OUTLET]: { fields: [licence('wmLicenceNo', 'Weights and Measures licence', '2027-09-01', 'valid')] },
      [ON_FILE]: 'pending',
    });
    renderPapers();
    expect(await screen.findByText('Weights and Measures licence')).toBeInTheDocument();
    expect(screen.queryByText('All valid')).not.toBeInTheDocument();
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
    cleanup();

    serve({
      [OUTLET]: { fields: [licence('wmLicenceNo', 'Weights and Measures licence', '2027-09-01', 'valid')] },
      [ON_FILE]: new ApiError(500, 'INTERNAL', 'boom'),
    });
    renderPapers();
    expect(await screen.findByText('Weights and Measures licence')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('This list did not load.')).toBeInTheDocument());
    expect(screen.queryByText('All valid')).not.toBeInTheDocument();
  });

  it('a failed list has its own Try again, and the other list stays', async () => {
    serve({
      [OUTLET]: new ApiError(500, 'INTERNAL', 'boom'),
      [ON_FILE]: { rows: [paper('a2', 'Density register')], kinds: [], today: '2026-11-27' },
    });
    renderPapers();
    expect(await screen.findByText('Density register')).toBeInTheDocument();
    const failed = await screen.findByText('This list did not load.');
    serve({
      [OUTLET]: { fields: [licence('wmLicenceNo', 'Weights and Measures licence', '2027-09-01', 'valid')] },
      [ON_FILE]: { rows: [paper('a2', 'Density register')], kinds: [], today: '2026-11-27' },
    });
    fireEvent.click(within(failed.closest('div')!.parentElement!).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Weights and Measures licence')).toBeInTheDocument();
  });

  it('says calmly when nothing is on record yet', async () => {
    serve({ [OUTLET]: { fields: [] }, [ON_FILE]: { rows: [], kinds: [], today: '2026-11-27' } });
    renderPapers();
    expect(await screen.findByText('No licence dates are on record yet.')).toBeInTheDocument();
    expect(screen.getByText('MDG has not accepted any paper yet.')).toBeInTheDocument();
    expect(screen.getByText('No papers with an end date are on file yet')).toBeInTheDocument();
  });

  it('shows a manager the same page (papers are for the owner and the manager)', async () => {
    serve({
      [OUTLET]: { fields: [licence('wmLicenceNo', 'Weights and Measures licence', '2027-09-01', 'valid')] },
      [ON_FILE]: { rows: [], kinds: [], today: '2026-11-27' },
    });
    renderPapers('en', 'dealer-staff');
    expect(await screen.findByText('Weights and Measures licence')).toBeInTheDocument();
  });

  it('has a back arrow to My pump and a button that asks MDG in chat, with the words already written', async () => {
    serve({ [OUTLET]: { fields: [] }, [ON_FILE]: { rows: [], kinds: [], today: '2026-11-27' } });
    renderPapers();
    await screen.findByText('MDG has not accepted any paper yet.');
    expect(screen.getByRole('heading', { name: 'Papers and licences' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ask MDG' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('went:pump')).toBeInTheDocument();
  });

  it('reads in Hindi with ONE Hindi name per licence kind, full month names, and in Hinglish without Devanagari', async () => {
    const answers = {
      [OUTLET]: {
        fields: [
          licence('explosiveLicenceNo', 'Explosive licence', '2026-12-06', 'expiring'),
          licence('wmLicenceNo', 'Weights and Measures licence', '2027-09-01', 'valid'),
        ],
      },
      [ON_FILE]: {
        rows: [
          // The accepted paper's own Hindi title is a different wording: it must never reach the screen.
          paper('a1', 'Weights & Measures licence', { kindCode: 'wm-licence', titleHi: 'नाप-तौल लाइसेंस', validUntil: '2027-09-01', validityState: 'valid' }),
          paper('a2', 'Fire NOC', { kindCode: 'fire-noc', validUntil: '2026-12-06', validityState: 'expiring' }),
        ],
        kinds: [],
        today: '2026-11-27',
      },
    };
    serve(answers);
    const hi = renderPapers('hi');
    expect(await screen.findByText('विस्फोटक लाइसेंस')).toBeInTheDocument();
    expect(screen.getAllByText('9 दिन बाकी').length).toBe(2);
    expect(screen.getByText('फायर एनओसी')).toBeInTheDocument();
    expect(screen.getAllByText('वज़न और माप लाइसेंस')).toHaveLength(1);
    expect(hi.container.textContent ?? '').not.toContain('नाप-तौल');
    expect(screen.getByText('1 सितंबर 2027 तक चालू')).toBeInTheDocument();
    expect(screen.getByText('2 जल्द खत्म, 1 चालू')).toBeInTheDocument();
    cleanup();

    serve(answers);
    const { container } = renderPapers('hl');
    expect(await screen.findByText('Visfotak licence')).toBeInTheDocument();
    expect(screen.getAllByText('9 din baaki').length).toBe(2);
    expect(container.textContent ?? '').not.toMatch(/[ऀ-ॿ]/);
  });

  it('keeps names whole and rows tall enough to tap: no truncation, no fixed pixel sizes', async () => {
    serve({
      [OUTLET]: { fields: [licence('explosiveLicenceNo', 'Explosive licence', '2026-12-06', 'expiring')] },
      [ON_FILE]: { rows: [], kinds: [], today: '2026-11-27' },
    });
    const { container } = renderPapers();
    await screen.findAllByText('Explosive licence');
    expect(container.innerHTML).not.toMatch(/\btruncate\b|line-clamp|text-\[|min-h-\[|h-\[\d+px\]/);
  });
});
