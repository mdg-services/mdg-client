import { describe, expect, it } from 'vitest';

import { pageRenderScale } from './pdf';

// An A4 page in PDF points.
const A4 = { w: 595, h: 842 };

describe('pageRenderScale', () => {
  it('draws a page sharp on the screen: two device pixels per CSS pixel', () => {
    // A 360px-wide phone screen at 2× wants 720 device pixels across.
    expect(pageRenderScale(A4.w, A4.h, 360, 2) * A4.w).toBeCloseTo(720, 5);
  });

  it('never goes past 2× however dense the screen', () => {
    expect(pageRenderScale(A4.w, A4.h, 360, 3.5)).toBeCloseTo(pageRenderScale(A4.w, A4.h, 360, 2), 5);
  });

  it('treats a missing or odd pixel ratio as 1', () => {
    expect(pageRenderScale(A4.w, A4.h, 360, 0) * A4.w).toBeCloseTo(360, 5);
    expect(pageRenderScale(A4.w, A4.h, 360, 0.5) * A4.w).toBeCloseTo(360, 5);
  });

  it('caps a zoomed page at four million pixels, which a cheap phone can hold', () => {
    // 3× zoom on a 360px screen at 2× is 2,160 px across — about 6.5 million pixels.
    const s = pageRenderScale(A4.w, A4.h, 1080, 2);
    expect(A4.w * s * A4.h * s).toBeLessThanOrEqual(4_000_000 + 1);
    expect(A4.w * s * A4.h * s).toBeGreaterThan(3_900_000);
  });
});
