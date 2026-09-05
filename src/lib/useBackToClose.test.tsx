import { act, render } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useBackToClose } from './useBackToClose';

/**
 * The Back key is the only "close" gesture a dealer reaches for without being
 * taught, and before this hook every sheet in the app ignored it and left the
 * screen instead — taking the photograph, the points, or the half-typed reply
 * with it.
 */
function Sheet({ onClose, enabled }: { onClose: () => void; enabled?: boolean }) {
  useBackToClose(onClose, enabled);
  return <div>sheet</div>;
}

afterEach(() => {
  // Wind history back to a single entry between tests.
  while (window.history.length > 1 && window.history.state) {
    window.history.replaceState(null, '');
    break;
  }
});

describe('useBackToClose', () => {
  it('claims one history entry while it is open', () => {
    const before = window.history.state;
    const { unmount } = render(<Sheet onClose={() => {}} />);
    expect(window.history.state).not.toEqual(before);
    expect((window.history.state as { __dkSheet?: number }).__dkSheet).toBeGreaterThan(0);
    unmount();
  });

  it('closes on Back instead of letting the page navigate', () => {
    const onClose = vi.fn();
    render(<Sheet onClose={onClose} />);
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('gives its history entry back when closed by the ✕ instead', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const { unmount } = render(<Sheet onClose={() => {}} />);
    unmount();
    // Otherwise the next Back press would be swallowed by a spare entry and the
    // dealer would have to press it twice to leave the screen.
    expect(back).toHaveBeenCalledTimes(1);
    back.mockRestore();
  });

  it('does NOT unwind after Back already popped it', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const onClose = vi.fn();
    const { unmount } = render(<Sheet onClose={onClose} />);
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    });
    unmount();
    expect(back).not.toHaveBeenCalled();
    back.mockRestore();
  });

  it('leaves history alone when the app navigated out from under it', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const { unmount } = render(<Sheet onClose={() => {}} />);
    // A deep link / push notification took the app somewhere else: the current
    // entry is the router's, not ours. Popping it would undo THAT navigation.
    window.history.pushState({ router: true }, '');
    unmount();
    expect(back).not.toHaveBeenCalled();
    back.mockRestore();
  });

  it('does nothing at all when disabled', () => {
    const before = window.history.state;
    const onClose = vi.fn();
    render(<Sheet onClose={onClose} enabled={false} />);
    expect(window.history.state).toEqual(before);
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});
