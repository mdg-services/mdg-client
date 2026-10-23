import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useLangStore } from '@/store/lang';
import { makeSetupView } from '@/test/setupFixtures';
import { renderWithProviders, signIn } from '@/test/utils';

import { LazyCardView } from './LazyCardView';
import { SetupCardView } from './SetupCardView';

// The card chunk, as a download that can fail: while `broken` is set every try
// throws (the app's own retry makes three per load), then it comes.
let broken = false;
const loader = () =>
  broken
    ? Promise.reject(new Error('Failed to fetch dynamically imported module'))
    : Promise.resolve({ default: SetupCardView });

beforeEach(() => {
  useLangStore.setState({ lang: 'en', explicit: false });
  signIn({ role: 'dealer-owner' });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  broken = false;
});

describe('LazyCardView', () => {
  it('shows the card once it has come down', async () => {
    renderWithProviders(
      <LazyCardView card="started" view={makeSetupView({ stage: 'watch' })} loader={loader} />,
    );
    expect(await screen.findByText('Your services have started')).toBeInTheDocument();
  });

  it('a download that fails says so in place — it does not take the chat down — and Try again fetches it', async () => {
    vi.useFakeTimers();
    broken = true;
    renderWithProviders(
      <div>
        <p>the chat stays</p>
        <LazyCardView card="started" view={makeSetupView({ stage: 'watch' })} loader={loader} />
      </div>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.getByText("Couldn't load this just now")).toBeInTheDocument();
    expect(screen.getByText('the chat stays')).toBeInTheDocument();

    // The link is back: one tap and it comes.
    broken = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(screen.getByText('Your services have started')).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load this just now")).toBeNull();
  });
});
