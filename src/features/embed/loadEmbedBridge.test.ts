import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useEmbedStore } from './embedState';
import { loadEmbedBridge } from './loadEmbedBridge';

beforeEach(() => useEmbedStore.setState({ phase: 'waiting', retry: null }));
afterEach(() => useEmbedStore.setState({ phase: 'waiting', retry: null }));

describe('loadEmbedBridge', () => {
  it('starts the bridge once its chunk has loaded, and leaves the opening screen alone', async () => {
    const startEmbedBridge = vi.fn(() => () => {});
    await loadEmbedBridge(async () => ({ startEmbedBridge }));
    expect(startEmbedBridge).toHaveBeenCalledTimes(1);
    expect(useEmbedStore.getState().phase).toBe('waiting');
  });

  it('shows the load-failed screen when the chunk cannot be fetched, not an opening screen for good', async () => {
    await loadEmbedBridge(() =>
      Promise.reject(new Error('Failed to fetch dynamically imported module')),
    );
    expect(useEmbedStore.getState().phase).toBe('failed');
    // No bridge is running, so the screen's button falls back to reloading the page.
    expect(useEmbedStore.getState().retry).toBeNull();
  });

  it('shows it too when the bridge itself fails to start', async () => {
    await loadEmbedBridge(async () => ({
      startEmbedBridge: () => {
        throw new Error('boom');
      },
    }));
    expect(useEmbedStore.getState().phase).toBe('failed');
  });
});
