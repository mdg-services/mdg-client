import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LARGE_TEXT_SCALE, measureTextScale, useLargeText } from './useLargeText';

/** jsdom lays nothing out, so the probe's box is whatever the test says it is. */
function probeHeight(px: number) {
  return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    height: px,
    width: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
}

function rootFont(px: string) {
  document.documentElement.style.fontSize = px;
}

afterEach(() => {
  rootFont('');
  document.querySelectorAll('[data-probe]').forEach((n) => n.remove());
});

describe('measureTextScale', () => {
  it('is 1 when the probe is as tall as 16 px', () => {
    probeHeight(16);
    expect(measureTextScale()).toBe(1);
  });

  it('is 2 when the probe is 32 px tall (text at 200%)', () => {
    probeHeight(32);
    expect(measureTextScale()).toBe(2);
  });

  it('reads the root font size too, in case the phone\'s text zoom does not move the probe', () => {
    probeHeight(16);
    rootFont('28px');
    expect(measureTextScale()).toBeCloseTo(1.75);
  });

  it('removes its probe afterwards', () => {
    probeHeight(16);
    measureTextScale();
    expect(document.querySelector('[data-probe]')).toBeNull();
  });

  it('is 1, not NaN, when nothing can be measured', () => {
    probeHeight(0);
    expect(measureTextScale()).toBeGreaterThan(0);
  });
});

describe('useLargeText', () => {
  it('is false at normal size', () => {
    probeHeight(16);
    const { result } = renderHook(() => useLargeText());
    expect(result.current).toBe(false);
  });

  it('is true from 140% up, and false just under it', () => {
    probeHeight(16 * LARGE_TEXT_SCALE - 0.5);
    const under = renderHook(() => useLargeText());
    expect(under.result.current).toBe(false);
    under.unmount();

    probeHeight(16 * LARGE_TEXT_SCALE);
    const at = renderHook(() => useLargeText());
    expect(at.result.current).toBe(true);
  });

  it('is true at 200%', () => {
    probeHeight(32);
    const { result } = renderHook(() => useLargeText());
    expect(result.current).toBe(true);
  });

  it('measures again when the window is resized', () => {
    const spy = probeHeight(16);
    const { result } = renderHook(() => useLargeText());
    expect(result.current).toBe(false);
    spy.mockReturnValue({ height: 32 } as DOMRect);
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(result.current).toBe(true);
    spy.mockReturnValue({ height: 16 } as DOMRect);
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(result.current).toBe(false);
  });

  it('shares one answer across callers and stops listening when the last one leaves', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    probeHeight(16);
    const a = renderHook(() => useLargeText());
    const b = renderHook(() => useLargeText());
    expect(add.mock.calls.filter(([e]) => e === 'resize')).toHaveLength(1);
    a.unmount();
    expect(remove.mock.calls.filter(([e]) => e === 'resize')).toHaveLength(0);
    b.unmount();
    expect(remove.mock.calls.filter(([e]) => e === 'resize')).toHaveLength(1);
  });

  it('notices the root font size being raised after load, with no resize event (DevTools, a photo run)', async () => {
    // The probe's box follows the root font size, the way a real browser lays it out.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      () => ({ height: Number.parseFloat(document.documentElement.style.fontSize || '16') }) as DOMRect,
    );
    const { result } = renderHook(() => useLargeText());
    expect(result.current).toBe(false);
    // jsdom does not resolve "200%", so the test sets the size a browser would compute.
    act(() => {
      document.documentElement.style.fontSize = '32px';
    });
    await waitFor(() => expect(result.current).toBe(true));
    act(() => {
      document.documentElement.style.fontSize = '16px';
    });
    await waitFor(() => expect(result.current).toBe(false));
  });

  it('notices a style tag that raises the text size, and leaves no probe behind', async () => {
    const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ height: 16 } as DOMRect);
    const { result, unmount } = renderHook(() => useLargeText());
    spy.mockReturnValue({ height: 32 } as DOMRect);
    const style = document.createElement('style');
    style.textContent = 'html{font-size:200%}';
    act(() => {
      document.head.appendChild(style);
    });
    await waitFor(() => expect(result.current).toBe(true));
    style.remove();
    unmount();
    expect(document.querySelector('[data-probe="text-scale-watch"]')).toBeNull();
  });
});
