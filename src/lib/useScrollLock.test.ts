import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useScrollLock } from './useScrollLock';

/** Shadow jsdom's prototype `scrollY` getter with a fixed value for the test. */
function setScrollY(y: number): void {
  Object.defineProperty(window, 'scrollY', { configurable: true, value: y });
}

afterEach(() => {
  // Drop the own `scrollY` shadow so the prototype getter resumes, and clear any
  // body styles the hook may have left if an assertion threw mid-test.
  delete (window as { scrollY?: number }).scrollY;
  const b = document.body.style;
  b.position = '';
  b.top = '';
  b.left = '';
  b.right = '';
});

describe('useScrollLock', () => {
  it('pins the body at the current scroll offset while mounted', () => {
    setScrollY(150);
    // jsdom has no real scrollTo; mock it so the teardown cleanup stays quiet.
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    renderHook(() => useScrollLock());

    const b = document.body.style;
    expect(b.position).toBe('fixed');
    expect(b.top).toBe('-150px');
    // Horizontal pin so the fixed body can't drift; exact serialization of "0"
    // is jsdom's business — we only assert it was set.
    expect(b.left).not.toBe('');
    expect(b.right).not.toBe('');
  });

  it('restores the body styles and scroll position on unmount', () => {
    setScrollY(240);
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const { unmount } = renderHook(() => useScrollLock());

    unmount();

    const b = document.body.style;
    expect(b.position).toBe('');
    expect(b.top).toBe('');
    expect(b.left).toBe('');
    expect(b.right).toBe('');
    expect(scrollTo).toHaveBeenCalledWith(0, 240);
  });

  it('captures the offset at mount time, not at unmount (no jump on close)', () => {
    setScrollY(200);
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const { unmount } = renderHook(() => useScrollLock());
    expect(document.body.style.top).toBe('-200px');

    // The page can't actually scroll while pinned, but even if `scrollY` moves
    // the restore target must stay the value captured at mount.
    setScrollY(999);
    unmount();
    expect(scrollTo).toHaveBeenCalledWith(0, 200);
  });
});
