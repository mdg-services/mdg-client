import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { requestNativeMicPermission } from './nativeBridge';

/** Answer the pending bridge request the way the native shell does. */
function nativeReplies(granted: boolean): void {
  window.dispatchEvent(
    new CustomEvent('native-mic-permission', { detail: { granted } }),
  );
}

describe('requestNativeMicPermission', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (window as unknown as { ReactNativeWebView?: unknown }).ReactNativeWebView = {
      postMessage: vi.fn(),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as unknown as { ReactNativeWebView?: unknown }).ReactNativeWebView;
  });

  /**
   * The reported bug: `PermissionsAndroid.request()` does not resolve until the
   * user answers the OS dialog, so this clock measures a HUMAN. At 5s a real
   * dealer was still reading "Allow Dealer Kavach to record audio?" — we gave up,
   * reported denied, and told them to go to Settings while they were tapping
   * Allow. Reading the prompt must not be mistaken for a denial.
   */
  it('still accepts a grant that arrives after a human-length pause', async () => {
    const pending = requestNativeMicPermission();

    await vi.advanceTimersByTimeAsync(15_000); // user reading the OS dialog
    nativeReplies(true);

    await expect(pending).resolves.toBe(true);
  });

  it('reports a real denial immediately', async () => {
    const pending = requestNativeMicPermission();
    nativeReplies(false);
    await expect(pending).resolves.toBe(false);
  });

  it('still gives up if the shell never answers at all (no dead air)', async () => {
    const pending = requestNativeMicPermission();
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(pending).resolves.toBe(false);
  });

  it('resolves false in a plain browser (no native shell)', async () => {
    delete (window as unknown as { ReactNativeWebView?: unknown }).ReactNativeWebView;
    await expect(requestNativeMicPermission()).resolves.toBe(false);
  });
});
