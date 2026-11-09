import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useLangStore } from '@/store/lang';
import { usePushStore, type PushState } from '@/store/push';
import { renderWithProviders, resetStores } from '@/test/utils';

import { PushNotice } from './PushNotice';

let postMessage: ReturnType<typeof vi.fn>;
const posted = () => postMessage.mock.calls.map(([raw]) => JSON.parse(raw as string));

function show(state: PushState, canAskAgain = false, lang: 'en' | 'hi' = 'en') {
  useLangStore.setState({ lang, explicit: true });
  usePushStore.setState({ pushState: state, canAskAgain });
  return renderWithProviders(<PushNotice />);
}

beforeEach(() => {
  postMessage = vi.fn();
  (window as unknown as { ReactNativeWebView?: unknown }).ReactNativeWebView = { postMessage };
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { ReactNativeWebView?: unknown }).ReactNativeWebView;
  usePushStore.setState({ pushState: 'unknown', canAskAgain: false });
  vi.restoreAllMocks();
  resetStores();
});

describe('PushNotice', () => {
  // A phone that was never asked is asked by the phone itself, with no card first.
  it.each(['unknown', 'ask', 'on', 'unavailable'] as const)('shows nothing while the state is %s', (state) => {
    const { container } = show(state);
    expect(container.querySelector('section')).toBeNull();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  describe('a phone that said no and will not be asked again', () => {
    it("points at the phone's Settings", () => {
      show('off', false);
      expect(screen.getByText('Notifications are off')).toBeInTheDocument();
      expect(
        screen.getByText("Turn them on in your phone's Settings to get MDG's replies."),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Turn on' })).not.toBeInTheDocument();
    });

    it('"Open settings" opens the phone\'s settings page for this app', () => {
      show('off', false);
      fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));
      expect(posted()).toEqual([{ type: 'permission:openSettings' }]);
    });

    it('speaks Hindi', () => {
      show('off', false, 'hi');
      expect(screen.getByText('नोटिफ़िकेशन बंद हैं')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'सेटिंग खोलें' })).toBeInTheDocument();
    });
  });

  describe('a phone that said no but will still show its prompt', () => {
    it('"Turn on" asks the phone again', () => {
      show('off', true);
      expect(screen.getByText('Notifications are off')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));
      expect(posted()).toEqual([{ type: 'push:register' }]);
      expect(screen.queryByRole('button', { name: 'Open settings' })).not.toBeInTheDocument();
    });

    it('speaks Hindi', () => {
      show('off', true, 'hi');
      expect(screen.getByRole('button', { name: 'चालू करें' })).toBeInTheDocument();
    });
  });

  it('cannot be put away: there is no dismiss', () => {
    show('off', true);
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
  });

  it('keeps showing until the phone says yes, then goes', () => {
    show('off', true);
    act(() => usePushStore.setState({ pushState: 'on' }));
    expect(screen.queryByText('Notifications are off')).not.toBeInTheDocument();
  });
});
