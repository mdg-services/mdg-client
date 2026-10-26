import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  detectPlatform,
  haptic,
  postChatClose,
  postChatOpen,
  requestNativeMicPermission,
  requestNativePushStatus,
} from './nativeBridge';

type ShellWindow = { ReactNativeWebView?: unknown; __DK_NATIVE_PLATFORM__?: string };
const shellWindow = () => window as unknown as ShellWindow;

/** Put the page inside the native shell, with a spy for what it posts. */
function enterShell(): ReturnType<typeof vi.fn> {
  const postMessage = vi.fn();
  shellWindow().ReactNativeWebView = { postMessage };
  return postMessage;
}
const posted = (spy: ReturnType<typeof vi.fn>) =>
  spy.mock.calls.map(([raw]) => JSON.parse(raw as string) as Record<string, unknown>);

function setUserAgent(ua: string): void {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
}

const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 13; SM-A135F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
// An iPad asks for desktop sites, so it reports itself as a Mac.
const IPAD_AS_MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/** Answer the pending bridge request the way the native shell does. */
function nativeReplies(granted: boolean, permanentlyDenied?: boolean): void {
  window.dispatchEvent(
    new CustomEvent('native-mic-permission', {
      detail:
        permanentlyDenied === undefined ? { granted } : { granted, permanentlyDenied },
    }),
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

    await expect(pending).resolves.toEqual({ granted: true, permanentlyDenied: false });
  });

  it('reports a real denial immediately', async () => {
    const pending = requestNativeMicPermission();
    nativeReplies(false);
    await expect(pending).resolves.toEqual({ granted: false, permanentlyDenied: false });
  });

  it('still gives up if the shell never answers at all (no dead air)', async () => {
    const pending = requestNativeMicPermission();
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(pending).resolves.toEqual({ granted: false, permanentlyDenied: false });
  });

  /**
   * "Don't allow" twice on Android means the prompt is gone for good, and only
   * the settings page can bring the mic back. The caller needs to know that, so
   * it can offer a button instead of an instruction.
   */
  it('passes on that Android has stopped asking', async () => {
    const pending = requestNativeMicPermission();
    nativeReplies(false, true);
    await expect(pending).resolves.toEqual({ granted: false, permanentlyDenied: true });
  });

  /**
   * A shell from before this field existed sends `{ granted }` alone. It must
   * read as "Android will still ask", never as a permanent denial — otherwise
   * a Play rollout would show a Settings button that the older binary has no
   * handler for, and the button would do nothing at all.
   */
  it('treats an older shell\'s reply as still-askable', async () => {
    const pending = requestNativeMicPermission();
    nativeReplies(false);
    await expect(pending).resolves.toEqual({ granted: false, permanentlyDenied: false });
  });

  it('resolves false in a plain browser (no native shell)', async () => {
    delete (window as unknown as { ReactNativeWebView?: unknown }).ReactNativeWebView;
    await expect(requestNativeMicPermission()).resolves.toEqual({
      granted: false,
      permanentlyDenied: false,
    });
  });
});

describe('detectPlatform', () => {
  afterEach(() => {
    delete shellWindow().ReactNativeWebView;
    delete shellWindow().__DK_NATIVE_PLATFORM__;
    delete (navigator as unknown as { userAgent?: string }).userAgent;
  });

  it("believes the shell's own word over the user-agent", () => {
    // An iPad in desktop mode reads as a Mac, and the shell knows better.
    setUserAgent(IPAD_AS_MAC_UA);
    shellWindow().__DK_NATIVE_PLATFORM__ = 'ios';
    expect(detectPlatform()).toBe('ios');

    setUserAgent(IPHONE_UA);
    shellWindow().__DK_NATIVE_PLATFORM__ = 'android';
    expect(detectPlatform()).toBe('android');
  });

  it('calls anything inside the shell that is not Android an iPhone or iPad', () => {
    enterShell();
    setUserAgent(IPAD_AS_MAC_UA);
    expect(detectPlatform()).toBe('ios');
  });

  it('keeps Android as Android inside the shell when the shell says nothing', () => {
    enterShell();
    setUserAgent(ANDROID_UA);
    expect(detectPlatform()).toBe('android');
  });

  it('reads the user-agent in a plain browser', () => {
    setUserAgent(IPHONE_UA);
    expect(detectPlatform()).toBe('ios');
    setUserAgent(ANDROID_UA);
    expect(detectPlatform()).toBe('android');
    setUserAgent(DESKTOP_UA);
    expect(detectPlatform()).toBe('web');
    // A desktop browser (and an iPad's Safari asking for desktop sites) is not the app.
    setUserAgent(IPAD_AS_MAC_UA);
    expect(detectPlatform()).toBe('web');
  });

  it('ignores a platform word it does not know', () => {
    shellWindow().__DK_NATIVE_PLATFORM__ = 'windows';
    setUserAgent(DESKTOP_UA);
    expect(detectPlatform()).toBe('web');
  });
});

describe('requestNativePushStatus', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    delete shellWindow().ReactNativeWebView;
  });

  const shellReplies = (detail: unknown) =>
    window.dispatchEvent(new CustomEvent('native-push-status', { detail }));

  it('asks with push:status and hands back what the shell answers', async () => {
    const spy = enterShell();
    const pending = requestNativePushStatus(1500);
    expect(posted(spy)).toEqual([{ type: 'push:status' }]);

    shellReplies({ status: 'undetermined', canAskAgain: true });
    await expect(pending).resolves.toEqual({ status: 'undetermined', canAskAgain: true });
  });

  // An older shell ignores a message it does not know. Silence IS the answer.
  it('resolves null when nothing answers in time — an older shell', async () => {
    enterShell();
    const pending = requestNativePushStatus(1500);
    await vi.advanceTimersByTimeAsync(1500);
    await expect(pending).resolves.toBeNull();
  });

  it('resolves null at once in a plain browser, without posting anything', async () => {
    await expect(requestNativePushStatus(1500)).resolves.toBeNull();
  });

  it('stops listening once it has an answer, so a later event settles nothing', async () => {
    enterShell();
    const pending = requestNativePushStatus(1500);
    shellReplies({ status: 'granted', canAskAgain: true });
    shellReplies({ status: 'denied', canAskAgain: false });
    await expect(pending).resolves.toEqual({ status: 'granted', canAskAgain: true });
  });

  it('ignores an event with no status in it', async () => {
    enterShell();
    const pending = requestNativePushStatus(1500);
    shellReplies(undefined);
    shellReplies({ nonsense: true });
    await vi.advanceTimersByTimeAsync(1500);
    await expect(pending).resolves.toBeNull();
  });
});

describe('chat open and close', () => {
  afterEach(() => delete shellWindow().ReactNativeWebView);

  it('tells the shell which chat is on screen, and when it is not', () => {
    const spy = enterShell();
    postChatOpen('c42');
    postChatClose();
    expect(posted(spy)).toEqual([
      { type: 'chat:open', conversationId: 'c42' },
      { type: 'chat:close' },
    ]);
  });

  it('is silent in a plain browser', () => {
    expect(() => {
      postChatOpen('c42');
      postChatClose();
    }).not.toThrow();
  });

  it('never announces a chat with no id', () => {
    const spy = enterShell();
    postChatOpen('');
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('haptic', () => {
  afterEach(() => {
    delete shellWindow().ReactNativeWebView;
    delete (navigator as unknown as { vibrate?: unknown }).vibrate;
  });

  it('uses the browser\'s own vibration where there is one (Android)', () => {
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    const spy = enterShell();
    haptic();
    expect(vibrate).toHaveBeenCalledWith(10);
    // Not both: the phone would tick twice.
    expect(spy).not.toHaveBeenCalled();
  });

  it('asks the shell for the tick when the web view has no vibrate (iPhone)', () => {
    const spy = enterShell();
    haptic();
    haptic('selection');
    haptic('medium');
    expect(posted(spy)).toEqual([
      { type: 'haptic', style: 'light' },
      { type: 'haptic', style: 'selection' },
      { type: 'haptic', style: 'medium' },
    ]);
  });

  it('does nothing in a plain browser with no vibrate', () => {
    expect(() => haptic()).not.toThrow();
  });
});
