import { act, screen, fireEvent } from '@testing-library/react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ApiModule from '@/lib/api';
import { api } from '@/lib/api';
import { reportIssue } from '@/lib/monitoring';
import { usePushStore } from '@/store/push';
import { renderWithProviders } from '@/test/utils';

vi.mock('@/lib/api', async (orig) => {
  const actual = await orig<typeof ApiModule>();
  return { ...actual, api: { ...actual.api, post: vi.fn() } };
});
vi.mock('@/lib/monitoring', () => ({ reportIssue: vi.fn(), addCrumb: vi.fn() }));

const { usePushBridge, requestPushPermission } = await import('./usePushBridge');

type ShellWindow = {
  ReactNativeWebView?: unknown;
  __EXPO_PUSH_TOKEN__?: string;
  __DK_NATIVE_PLATFORM__?: string;
};
const shellWindow = () => window as unknown as ShellWindow;

/**
 * A stand-in for the native shell. It records what the page posts and, when
 * `answerStatus` is set, answers `push:status` the way the real one does — the
 * one message an older shell has never heard of and so never answers.
 */
function makeShell() {
  const sent: Array<Record<string, unknown>> = [];
  const shell = {
    sent,
    answerStatus: null as null | { status: string; canAskAgain: boolean },
    types: () => sent.map((m) => m.type),
    count: (type: string) => sent.filter((m) => m.type === type).length,
  };
  shellWindow().ReactNativeWebView = {
    postMessage: (raw: string) => {
      const msg = JSON.parse(raw) as Record<string, unknown>;
      sent.push(msg);
      if (msg.type === 'push:status' && shell.answerStatus) {
        const detail = shell.answerStatus;
        // The shell answers on a later turn, as a real bridge does.
        queueMicrotask(() =>
          window.dispatchEvent(new CustomEvent('native-push-status', { detail })),
        );
      }
    },
  };
  return shell;
}

const fire = (name: string, detail?: unknown) =>
  act(() => {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  });

function Harness() {
  usePushBridge();
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <div>
      <span data-testid="path">{location.pathname}</span>
      <button onClick={() => navigate('/two')}>go-two</button>
      <button onClick={() => navigate('/three')}>go-three</button>
    </div>
  );
}

const mount = () =>
  renderWithProviders(
    <Routes>
      <Route path="*" element={<Harness />} />
    </Routes>,
    { route: '/one' },
  );

/** Let the shell's answer and the hook's reaction to it run. */
const settle = () => act(async () => {
  await vi.advanceTimersByTimeAsync(0);
});

const pushState = () => usePushStore.getState().pushState;

describe('usePushBridge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(api.post).mockReset().mockResolvedValue({ registered: true } as never);
    vi.mocked(reportIssue).mockReset();
    usePushStore.setState({ pushState: 'unknown' });
    shellWindow().__DK_NATIVE_PLATFORM__ = 'ios';
  });
  afterEach(() => {
    vi.useRealTimers();
    delete shellWindow().ReactNativeWebView;
    delete shellWindow().__EXPO_PUSH_TOKEN__;
    delete shellWindow().__DK_NATIVE_PLATFORM__;
  });

  describe('where the phone stands, asked WITHOUT prompting', () => {
    it('asks only for the state on first mount, and posts no token request yet', async () => {
      const shell = makeShell();
      shell.answerStatus = { status: 'undetermined', canAskAgain: true };
      mount();
      await settle();
      expect(shell.types()).toEqual(['push:status']);
    });

    it('a phone that was never asked: shows the card, and does NOT let the phone prompt', async () => {
      const shell = makeShell();
      shell.answerStatus = { status: 'undetermined', canAskAgain: true };
      mount();
      await settle();
      await vi.advanceTimersByTimeAsync(5000);
      expect(pushState()).toBe('ask');
      expect(shell.count('push:register')).toBe(0);
    });

    it('the prompt waits for requestPushPermission(), and the token that follows turns it on', async () => {
      const shell = makeShell();
      shell.answerStatus = { status: 'undetermined', canAskAgain: true };
      mount();
      await settle();

      act(() => requestPushPermission());
      expect(shell.count('push:register')).toBe(1);

      fire('expo-push-token', 'ExponentPushToken[abc]');
      await settle();
      expect(pushState()).toBe('on');
      expect(api.post).toHaveBeenCalledWith('/v1/devices', {
        token: 'ExponentPushToken[abc]',
        platform: 'ios',
      });
    });

    it('permission already granted: fetches the token (no prompt is possible) and is on', async () => {
      const shell = makeShell();
      shell.answerStatus = { status: 'granted', canAskAgain: true };
      mount();
      await settle();
      expect(shell.types()).toEqual(['push:status', 'push:register']);
      expect(pushState()).toBe('on');
    });

    it('acts on the first answer once, not twice', async () => {
      const shell = makeShell();
      shell.answerStatus = { status: 'granted', canAskAgain: true };
      mount();
      await settle();
      await vi.advanceTimersByTimeAsync(5000);
      expect(shell.count('push:register')).toBe(1);
    });

    it('refused: says off, and never asks the phone again', async () => {
      const shell = makeShell();
      shell.answerStatus = { status: 'denied', canAskAgain: false };
      mount();
      await settle();
      expect(pushState()).toBe('off');
      expect(shell.count('push:register')).toBe(0);
    });

    it('Expo Go or a build with no notifications: unavailable, nothing to offer', async () => {
      const shell = makeShell();
      shell.answerStatus = { status: 'unavailable', canAskAgain: false };
      mount();
      await settle();
      expect(pushState()).toBe('unavailable');
      expect(shell.count('push:register')).toBe(0);
    });

    // An older shell has never heard of push:status and never answers. The
    // dealer on it must keep getting notifications exactly as before.
    it('an older shell, which does not answer: asks for the token the old way after 1.5 s', async () => {
      const shell = makeShell(); // answerStatus stays null: silence
      mount();
      await vi.advanceTimersByTimeAsync(1499);
      expect(shell.count('push:register')).toBe(0);
      await vi.advanceTimersByTimeAsync(1);
      expect(shell.types()).toEqual(['push:status', 'push:register']);
      expect(pushState()).toBe('unknown');

      fire('expo-push-token', 'ExponentPushToken[old]');
      await settle();
      expect(pushState()).toBe('on');
    });

    it('a token the shell had already injected is registered at once, with no question asked', async () => {
      const shell = makeShell();
      shellWindow().__EXPO_PUSH_TOKEN__ = 'ExponentPushToken[early]';
      mount();
      await settle();
      expect(shell.types()).toEqual([]);
      expect(pushState()).toBe('on');
      expect(api.post).toHaveBeenCalledWith('/v1/devices', {
        token: 'ExponentPushToken[early]',
        platform: 'ios',
      });
    });

    it('does nothing at all in a plain browser', async () => {
      mount();
      await vi.advanceTimersByTimeAsync(5000);
      expect(pushState()).toBe('unknown');
      expect(api.post).not.toHaveBeenCalled();
    });
  });

  describe('what the shell says afterwards', () => {
    it('registers a token once, however many times it is announced', async () => {
      makeShell();
      mount();
      await vi.advanceTimersByTimeAsync(1500);
      fire('expo-push-token', 'ExponentPushToken[same]');
      fire('expo-push-token', 'ExponentPushToken[same]');
      await settle();
      expect(api.post).toHaveBeenCalledTimes(1);
    });

    it('a refusal becomes state and is NOT reported — it is the dealer\'s own choice', async () => {
      makeShell();
      mount();
      await vi.advanceTimersByTimeAsync(1500);
      fire('native-push-blocked', { reason: 'permission', canAskAgain: false });
      expect(pushState()).toBe('off');
      expect(reportIssue).not.toHaveBeenCalled();
    });

    it('any other reason is still reported, and Expo Go reads as nothing to offer', async () => {
      makeShell();
      mount();
      await vi.advanceTimersByTimeAsync(1500);

      fire('native-push-blocked', { reason: 'token-failed', detail: 'no FCM' });
      expect(reportIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'push.token-unavailable',
          tags: { platform: 'ios', reason: 'token-failed' },
        }),
      );
      expect(pushState()).toBe('unknown');

      fire('native-push-blocked', { reason: 'expo-go' });
      expect(pushState()).toBe('unavailable');
      expect(reportIssue).toHaveBeenCalledTimes(2);
    });

    it('follows the phone when permission changes while the app is away', async () => {
      const shell = makeShell();
      shell.answerStatus = { status: 'denied', canAskAgain: false };
      mount();
      await settle();
      expect(pushState()).toBe('off');

      // The dealer turned notifications on in Settings; the shell says so, unasked.
      fire('native-push-status', { status: 'granted', canAskAgain: true });
      expect(pushState()).toBe('on');
      // Allowed and no token in hand yet: it is fetched (never a prompt).
      expect(shell.count('push:register')).toBe(1);

      fire('native-push-status', { status: 'denied', canAskAgain: false });
      expect(pushState()).toBe('off');
    });

    it('does not fetch the token again when it already has one', async () => {
      const shell = makeShell();
      shell.answerStatus = { status: 'granted', canAskAgain: true };
      mount();
      await settle();
      fire('expo-push-token', 'ExponentPushToken[have]');
      await settle();
      fire('native-push-status', { status: 'granted', canAskAgain: true });
      expect(shell.count('push:register')).toBe(1);
    });
  });

  describe('the effect is set up once', () => {
    it('does not ask the shell again on every screen the dealer opens', async () => {
      const shell = makeShell();
      shell.answerStatus = { status: 'granted', canAskAgain: true };
      mount();
      await settle();
      expect(shell.count('push:status')).toBe(1);

      fireEvent.click(screen.getByText('go-two'));
      fireEvent.click(screen.getByText('go-three'));
      await settle();
      expect(screen.getByTestId('path')).toHaveTextContent('/three');
      expect(shell.count('push:status')).toBe(1);
    });

    it('a deep link still lands through the newest navigate, after screens have changed', async () => {
      makeShell();
      mount();
      await vi.advanceTimersByTimeAsync(1500);
      fireEvent.click(screen.getByText('go-two'));

      fire('expo-deep-link', '/chat/c9');
      expect(screen.getByTestId('path')).toHaveTextContent('/chat/c9');
      expect((window as unknown as { __handledDeepLink?: boolean }).__handledDeepLink).toBe(true);
    });

    it('lets go of every listener when it unmounts', async () => {
      makeShell();
      const view = mount();
      await vi.advanceTimersByTimeAsync(1500);
      view.unmount();
      fire('expo-push-token', 'ExponentPushToken[late]');
      fire('native-push-blocked', { reason: 'permission' });
      await settle();
      expect(api.post).not.toHaveBeenCalled();
      expect(pushState()).toBe('unknown');
    });
  });
});
