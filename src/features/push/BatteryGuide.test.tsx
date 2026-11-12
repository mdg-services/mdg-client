/**
 * ADR 0040 in the dealer app: the battery-saver guide, the report of where
 * notifications stand, and the pop-up channel on the device registration.
 */
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ApiModule from '@/lib/api';
import { api } from '@/lib/api';
import { usePushStore } from '@/store/push';
import { renderWithProviders } from '@/test/utils';

vi.mock('@/lib/api', async (orig) => {
  const actual = await orig<typeof ApiModule>();
  return { ...actual, api: { ...actual.api, post: vi.fn(async () => ({})) } };
});
vi.mock('@/lib/monitoring', () => ({ reportIssue: vi.fn(), addCrumb: vi.fn() }));

const { BatteryGuideCard } = await import('./BatteryGuide');
const { useReachReport } = await import('@/hooks/useReachReport');
const { usePushBridge } = await import('@/hooks/usePushBridge');

type ShellWindow = {
  ReactNativeWebView?: unknown;
  __DK_NATIVE_PLATFORM__?: string;
  __DK_NATIVE_FEATURES__?: readonly string[];
  __DK_PHONE_MAKER__?: string;
  __EXPO_PUSH_TOKEN__?: string;
};
const w = () => window as unknown as ShellWindow;
/** The card's title in Hindi, the language the test app starts in. */
const TITLE = 'MDG के मैसेज समय पर पाने के लिए';

function inShell(maker: string, features: string[] = []) {
  w().ReactNativeWebView = { postMessage: () => {} };
  w().__DK_NATIVE_PLATFORM__ = 'android';
  w().__DK_NATIVE_FEATURES__ = features;
  w().__DK_PHONE_MAKER__ = maker;
}

beforeEach(() => {
  vi.mocked(api.post).mockClear();
  usePushStore.setState({ pushState: 'unknown', canAskAgain: false });
  window.localStorage.clear();
});

afterEach(() => {
  delete w().ReactNativeWebView;
  delete w().__DK_NATIVE_PLATFORM__;
  delete w().__DK_NATIVE_FEATURES__;
  delete w().__DK_PHONE_MAKER__;
  delete w().__EXPO_PUSH_TOKEN__;
});

describe('the battery-saver card', () => {
  it('shows on a Xiaomi phone with notifications on, opens the steps, and goes for good on Done', () => {
    inShell('Xiaomi');
    usePushStore.setState({ pushState: 'on' });
    const { unmount } = renderWithProviders(<BatteryGuideCard />);

    expect(screen.getByText(TITLE)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'कैसे करें, दिखाएँ' }));
    expect(screen.getByText('"Autostart" चालू कीजिए।')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'हो गया' }));
    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
    unmount();

    renderWithProviders(<BatteryGuideCard />);
    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
  });

  it('is not there for other phones, with notifications off, or in a browser', () => {
    inShell('Google');
    usePushStore.setState({ pushState: 'on' });
    const google = renderWithProviders(<BatteryGuideCard />);
    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
    google.unmount();

    inShell('samsung');
    usePushStore.setState({ pushState: 'off' });
    const off = renderWithProviders(<BatteryGuideCard />);
    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
    off.unmount();

    delete w().ReactNativeWebView;
    usePushStore.setState({ pushState: 'on' });
    renderWithProviders(<BatteryGuideCard />);
    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
  });
});

function Reporter() {
  useReachReport();
  return null;
}

describe('telling the server where notifications stand', () => {
  it('reports once the shell has answered, again on a change, and never twice the same', () => {
    inShell('Xiaomi');
    renderWithProviders(<Reporter />);
    expect(api.post).not.toHaveBeenCalled(); // the shell has not answered yet

    act(() => usePushStore.setState({ pushState: 'on' }));
    expect(api.post).toHaveBeenCalledWith('/v1/devices/status', {
      platform: 'android',
      push: 'on',
      maker: 'Xiaomi',
    });
    act(() => usePushStore.setState({ pushState: 'off', canAskAgain: false }));
    expect(api.post).toHaveBeenLastCalledWith('/v1/devices/status', {
      platform: 'android',
      push: 'off',
      canAskAgain: false,
      maker: 'Xiaomi',
    });
    act(() => usePushStore.setState({ pushState: 'off', canAskAgain: false }));
    expect(api.post).toHaveBeenCalledTimes(2);
  });

  it('says "website, no notifications" from a browser', () => {
    renderWithProviders(<Reporter />);
    expect(api.post).toHaveBeenCalledWith('/v1/devices/status', { platform: 'web', push: 'unavailable' });
  });
});

function Bridge() {
  usePushBridge();
  return null;
}

describe('registering the phone', () => {
  it('names the pop-up channel only when the shell has made it', async () => {
    inShell('Xiaomi', ['push-channel:messages']);
    w().__EXPO_PUSH_TOKEN__ = 'ExponentPushToken[new]';
    renderWithProviders(<Bridge />);
    await act(async () => {});
    expect(api.post).toHaveBeenCalledWith('/v1/devices', {
      token: 'ExponentPushToken[new]',
      platform: 'android',
      channelId: 'messages',
    });
  });

  it('leaves it out for an older shell', async () => {
    inShell('Xiaomi', []);
    w().__EXPO_PUSH_TOKEN__ = 'ExponentPushToken[old]';
    renderWithProviders(<Bridge />);
    await act(async () => {});
    expect(api.post).toHaveBeenCalledWith('/v1/devices', {
      token: 'ExponentPushToken[old]',
      platform: 'android',
    });
  });
});
