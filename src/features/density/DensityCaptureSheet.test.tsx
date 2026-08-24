import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useLangStore } from '@/store/lang';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';

import { DensityCaptureSheet } from './DensityCaptureSheet';

const upload = vi.hoisted(() => ({ uploadDensityPhoto: vi.fn() }));
vi.mock('@/lib/uploadDensityPhoto', () => upload);

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock('@/lib/api', () => ({ api, ApiError: class ApiError extends Error {} }));

// jsdom implements neither, and the sheet builds a preview object URL on mount.
if (!URL.createObjectURL) {
  URL.createObjectURL = () => 'blob:preview';
  URL.revokeObjectURL = () => undefined;
}

/** Drive `navigator.onLine`, which the sheet reads once and then tracks by event. */
function setOnline(value: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', {
    value,
    configurable: true,
  });
}

const photoFile = new File(['x'], 'register.jpg', { type: 'image/jpeg' });

/** The English copy of `density.offline`, so the assertion reads as the dealer does. */
const OFFLINE_EN = 'Your phone is not on the internet right now. The photo will not go.';
const OFFLINE_HI = 'आपका फ़ोन अभी इंटरनेट पर नहीं है। फोटो अभी नहीं जाएगी।';

describe('DensityCaptureSheet', () => {
  beforeEach(() => {
    resetStores();
    signIn({ dealerId: 'd1' });
    useLangStore.setState({ lang: 'en', explicit: true });
    upload.uploadDensityPhoto.mockReset();
    api.post.mockReset();
    setOnline(true);
  });

  afterEach(() => {
    setOnline(true);
  });

  it('says the phone is offline even after a send has already failed', async () => {
    const user = userEvent.setup();
    // A send that fails on the network, then the phone goes off the network for
    // good — the retry pill is disabled from here on and every tap is swallowed.
    upload.uploadDensityPhoto.mockRejectedValue(new Error('network'));

    renderWithProviders(
      <DensityCaptureSheet
        file={photoFile}
        businessDate="2026-08-24"
        onClose={() => {}}
        onRetake={() => {}}
        onSent={() => {}}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Yes, send this' }));
    const retry = await screen.findByRole('button', { name: /Send again/ });

    setOnline(false);
    window.dispatchEvent(new Event('offline'));

    // The failure block still explains what went wrong...
    await waitFor(() => expect(retry).toBeDisabled());
    expect(screen.getByText('The photo did not reach us')).toBeInTheDocument();
    // ...and the offline sentence is beside it, not replaced by it. Without this
    // the dealer faces a faded pill that swallows taps with nothing saying why.
    expect(screen.getByText(OFFLINE_EN)).toBeInTheDocument();
  });

  it('says it in Hindi too', async () => {
    const user = userEvent.setup();
    upload.uploadDensityPhoto.mockRejectedValue(new Error('network'));
    useLangStore.setState({ lang: 'hi', explicit: true });

    renderWithProviders(
      <DensityCaptureSheet
        file={photoFile}
        businessDate="2026-08-24"
        onClose={() => {}}
        onRetake={() => {}}
        onSent={() => {}}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'हाँ, यही भेजें' }));
    await screen.findByRole('button', { name: /दोबारा भेजें/ });

    setOnline(false);
    window.dispatchEvent(new Event('offline'));

    await waitFor(() => expect(screen.getByText(OFFLINE_HI)).toBeInTheDocument());
  });

  it('shows the offline sentence before any send has been attempted', () => {
    setOnline(false);
    renderWithProviders(
      <DensityCaptureSheet
        file={photoFile}
        businessDate="2026-08-24"
        onClose={() => {}}
        onRetake={() => {}}
        onSent={() => {}}
      />,
    );
    expect(screen.getByText(OFFLINE_EN)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yes, send this' })).toBeDisabled();
  });
});
