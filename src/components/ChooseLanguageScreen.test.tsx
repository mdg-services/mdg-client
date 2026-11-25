import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ApiModule from '@/lib/api';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useLangStore } from '@/store/lang';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';

vi.mock('@/lib/api', async (importOriginal) => {
  const real = await importOriginal<typeof ApiModule>();
  return { ...real, api: { ...real.api, patch: vi.fn() } };
});

const { ChooseLanguageScreen, mustChooseLanguage } = await import('./ChooseLanguageScreen');

beforeEach(() => {
  resetStores();
  vi.mocked(api.patch).mockResolvedValue({ ok: true, data: {} } as never);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('the first-open language picker', () => {
  it('offers every language in its own script, and nothing is picked yet', () => {
    signIn({ role: 'dealer-owner', langChosenAt: null });
    renderWithProviders(<ChooseLanguageScreen />);
    const options = screen.getAllByRole('radio');
    expect(options.map((o) => o.getAttribute('aria-label'))).toEqual([
      'हिंदी',
      'Hinglish',
      'English',
    ]);
    expect(options.every((o) => o.getAttribute('aria-checked') === 'false')).toBe(true);
    expect(screen.queryByTestId('language-sample')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continue/ })).toBeDisabled();
  });

  it('shows a sample in the picked language, with the button in it too', () => {
    signIn({ role: 'dealer-owner', langChosenAt: null });
    renderWithProviders(<ChooseLanguageScreen />);
    fireEvent.click(screen.getByRole('radio', { name: 'Hinglish' }));
    expect(screen.getByTestId('language-sample')).toHaveTextContent(
      'Aaj ki DSR report taiyaar hai',
    );
    expect(screen.getByRole('button', { name: 'Aage badhein' })).toBeEnabled();

    fireEvent.click(screen.getByRole('radio', { name: 'English' }));
    expect(screen.getByTestId('language-sample')).toHaveTextContent("Today's DSR report is ready");
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('saves the choice to the account and lets the app through', () => {
    signIn({ role: 'dealer-owner', langChosenAt: null });
    renderWithProviders(<ChooseLanguageScreen />);
    fireEvent.click(screen.getByRole('radio', { name: 'Hinglish' }));
    fireEvent.click(screen.getByRole('button', { name: 'Aage badhein' }));
    expect(useLangStore.getState().lang).toBe('hl');
    expect(api.patch).toHaveBeenCalledWith('/v1/me', { lang: 'hl' });
    const user = useAuthStore.getState().user;
    expect(user?.lang).toBe('hl');
    expect(mustChooseLanguage(user)).toBe(false);
  });
});

describe('the Today feed after the choice', () => {
  it('is asked for again once the save has gone through, so its words follow the new language', async () => {
    signIn({ role: 'dealer-owner', langChosenAt: null });
    const { queryClient } = renderWithProviders(<ChooseLanguageScreen />);
    // Today was answered in the old language while the choice was being saved.
    queryClient.setQueryData(['today-feed'], { day: '2026-11-24' });
    expect(queryClient.getQueryState(['today-feed'])?.isInvalidated).toBe(false);
    fireEvent.click(screen.getByRole('radio', { name: 'English' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(queryClient.getQueryState(['today-feed'])?.isInvalidated).toBe(true));
  });

  it('is left as it was when the save fails', async () => {
    vi.mocked(api.patch).mockRejectedValue(new Error('offline'));
    signIn({ role: 'dealer-owner', langChosenAt: null });
    const { queryClient } = renderWithProviders(<ChooseLanguageScreen />);
    queryClient.setQueryData(['today-feed'], { day: '2026-11-24' });
    fireEvent.click(screen.getByRole('radio', { name: 'English' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalled());
    await Promise.resolve();
    expect(queryClient.getQueryState(['today-feed'])?.isInvalidated).toBe(false);
  });
});

describe('who is asked', () => {
  it('a dealer login whose account says it never chose', () => {
    expect(mustChooseLanguage({ role: 'dealer-owner', langChosenAt: null })).toBe(true);
    expect(mustChooseLanguage({ role: 'dealer-staff', langChosenAt: null })).toBe(true);
  });

  it('nobody who chose, no admin, and nobody on a server too old to say', () => {
    expect(mustChooseLanguage({ role: 'dealer-owner', langChosenAt: '2026-11-17T10:00:00Z' })).toBe(
      false,
    );
    expect(mustChooseLanguage({ role: 'admin', langChosenAt: null })).toBe(false);
    expect(mustChooseLanguage({ role: 'dealer-owner' })).toBe(false);
    expect(mustChooseLanguage(null)).toBe(false);
  });
});
