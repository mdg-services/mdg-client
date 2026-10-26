import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useLangStore } from '@/store/lang';
import { PUSH_SNOOZE_DAYS, usePushStore, type PushState } from '@/store/push';
import { renderWithProviders, resetStores } from '@/test/utils';

import { PushNotice } from './PushNotice';

const DAY = 24 * 60 * 60 * 1000;

let postMessage: ReturnType<typeof vi.fn>;
const posted = () => postMessage.mock.calls.map(([raw]) => JSON.parse(raw as string));

function show(state: PushState, lang: 'en' | 'hi' = 'en') {
  useLangStore.setState({ lang, explicit: true });
  usePushStore.setState({ pushState: state });
  return renderWithProviders(<PushNotice />);
}

beforeEach(() => {
  postMessage = vi.fn();
  (window as unknown as { ReactNativeWebView?: unknown }).ReactNativeWebView = { postMessage };
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { ReactNativeWebView?: unknown }).ReactNativeWebView;
  usePushStore.setState({ pushState: 'unknown' });
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetStores();
});

describe('PushNotice', () => {
  it.each(['unknown', 'on', 'unavailable'] as const)('shows nothing while the state is %s', (state) => {
    const { container } = show(state);
    expect(container.querySelector('section')).toBeNull();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  describe('a phone that has never been asked', () => {
    it('explains what the dealer gets, before the phone asks', () => {
      show('ask');
      expect(screen.getByText('Turn on notifications')).toBeInTheDocument();
      expect(
        screen.getByText("Get MDG's replies and your daily report on this phone."),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Turn on' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Not now' })).toBeInTheDocument();
      // Showing the card asks the phone nothing.
      expect(postMessage).not.toHaveBeenCalled();
    });

    it('"Turn on" lets the phone show its prompt, and leaves the card until the answer lands', () => {
      show('ask');
      fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));
      expect(posted()).toEqual([{ type: 'push:register' }]);
      expect(screen.getByText('Turn on notifications')).toBeInTheDocument();
    });

    it('goes away when the answer arrives', () => {
      show('ask');
      act(() => usePushStore.setState({ pushState: 'on' }));
      expect(screen.queryByText('Turn on notifications')).not.toBeInTheDocument();
    });

    it('"Not now" hides it for three days and asks the phone nothing', () => {
      vi.useFakeTimers({ now: new Date(2026, 9, 26, 10, 0) });
      const first = show('ask');
      fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
      expect(screen.queryByText('Turn on notifications')).not.toBeInTheDocument();
      expect(postMessage).not.toHaveBeenCalled();
      first.unmount();

      // Back on the list the next day: still quiet.
      vi.setSystemTime(Date.now() + 1 * DAY);
      show('ask');
      expect(screen.queryByText('Turn on notifications')).not.toBeInTheDocument();
      cleanup();

      // After the three days: back.
      vi.setSystemTime(Date.now() + PUSH_SNOOZE_DAYS.ask * DAY);
      show('ask');
      expect(screen.getByText('Turn on notifications')).toBeInTheDocument();
    });

    it('speaks Hindi', () => {
      show('ask', 'hi');
      expect(screen.getByText('नोटिफ़िकेशन चालू कीजिए')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'चालू करें' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'अभी नहीं' })).toBeInTheDocument();
    });
  });

  describe('a phone that said no', () => {
    it('is one slim line that points at the phone\'s Settings', () => {
      show('off');
      expect(screen.getByText('Notifications are off')).toBeInTheDocument();
      expect(
        screen.getByText("Turn them on in your phone's Settings to get MDG's replies."),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Turn on' })).not.toBeInTheDocument();
    });

    it('"Open settings" opens the phone\'s settings page for this app', () => {
      show('off');
      fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));
      expect(posted()).toEqual([{ type: 'permission:openSettings' }]);
    });

    it('can be put away for seven days', () => {
      vi.useFakeTimers({ now: new Date(2026, 9, 26, 10, 0) });
      const first = show('off');
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
      expect(screen.queryByText('Notifications are off')).not.toBeInTheDocument();
      first.unmount();

      vi.setSystemTime(Date.now() + 6 * DAY);
      show('off');
      expect(screen.queryByText('Notifications are off')).not.toBeInTheDocument();
      cleanup();

      vi.setSystemTime(Date.now() + 1 * DAY);
      show('off');
      expect(screen.getByText('Notifications are off')).toBeInTheDocument();
    });

    it('speaks Hindi', () => {
      show('off', 'hi');
      expect(screen.getByText('नोटिफ़िकेशन बंद हैं')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'सेटिंग खोलें' })).toBeInTheDocument();
    });
  });

  it('putting one reminder away does not hide the other', () => {
    show('ask');
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    act(() => usePushStore.setState({ pushState: 'off' }));
    expect(screen.getByText('Notifications are off')).toBeInTheDocument();
  });

  it('still shows, and still hides on dismiss, when the phone will not keep a note', () => {
    useLangStore.setState({ lang: 'en', explicit: true });
    usePushStore.setState({ pushState: 'ask' });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    renderWithProviders(<PushNotice />);
    expect(screen.getByText('Turn on notifications')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByText('Turn on notifications')).not.toBeInTheDocument();
  });
});
