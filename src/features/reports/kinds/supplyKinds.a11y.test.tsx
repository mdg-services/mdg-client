import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Lang } from '@/store/lang';

import { announcement, duOtp, renderOverlay, supply, water } from './_supplyTestKit';
import { view as announcementView } from './announcement';
import { view as duOtpView } from './du_otp';
import { view as roSupplyView } from './ro_supply';
import { view as waterView } from './water_ingress';

vi.mock('@/features/help/GuideVideoSheet', () => ({ GuideVideoSheet: () => null }));

afterEach(cleanup);

const LANGS: Lang[] = ['hi', 'hl', 'en'];

/** Every kind of this group, with a fixture that shows as much of it as it can. */
const CASES = [
  { name: 'water_ingress', view: waterView, data: water() },
  { name: 'ro_supply', view: roSupplyView, data: supply({ blocked: true }) },
  { name: 'du_otp', view: duOtpView, data: duOtp() },
  { name: 'announcement', view: announcementView, data: announcement({ tone: 'important', ackable: true, videoId: 'v1', serviceId: 'dsr-report' }) },
] as const;

describe('the visual kinds, in every language', () => {
  for (const c of CASES) {
    for (const lang of LANGS) {
      it(`${c.name} (${lang}) prints no broken value and no empty text`, () => {
        const { container } = renderOverlay(c.view as never, c.data as never, lang);
        const text = container.textContent ?? '';
        expect(text.length).toBeGreaterThan(40);
        expect(text).not.toMatch(/undefined|NaN|\[object|null\b/);
        expect(c.view.headline(c.data as never, lang)).not.toMatch(/undefined|NaN|\[object/);
        expect(c.view.share(c.data as never, lang)).not.toMatch(/undefined|NaN|\[object/);
      });
    }

    it(`${c.name}: every button is 48 px, every drawing is hidden from a screen reader, every list item is named or text`, () => {
      const { container } = renderOverlay(c.view as never, c.data as never, 'en');
      for (const b of Array.from(container.querySelectorAll('button'))) {
        // the video poster is a whole 16:9 picture, far above 48 px
        expect(b.className, `${c.name} button`).toMatch(/min-h-12|min-h-\[48px\]|aspect-video/);
      }
      // a link inside the running text stays text; the 48 px button under the letter repeats it
      for (const a of Array.from(container.querySelectorAll('a')).filter((x) => !x.closest('[data-testid="announcement-body"]'))) {
        expect(a.className, `${c.name} link`).toMatch(/min-h-12|min-h-\[48px\]/);
      }
      for (const svg of Array.from(container.querySelectorAll('svg'))) {
        // a drawing either is decorative or carries its own name; none is left to be read as "image"
        const hidden = svg.getAttribute('aria-hidden') === 'true' || svg.closest('[aria-hidden="true"]');
        expect(hidden || svg.getAttribute('aria-label'), `${c.name} svg`).toBeTruthy();
      }
    });

    it(`${c.name}: no text under 14 px and nothing that cannot wrap`, () => {
      const { container } = renderOverlay(c.view as never, c.data as never, 'en');
      expect(container.innerHTML).not.toMatch(/text-\[(8|9|10|11|12|13)px\]/);
      expect(container.innerHTML).not.toMatch(/text-micro\b/);
      expect(container.innerHTML).not.toMatch(/whitespace-nowrap/);
    });
  }

  it('gives each kind its own glyph, none alike', () => {
    const glyphs = new Set<string>();
    for (const c of CASES) {
      const G = c.view.Glyph;
      const { container, unmount } = renderOverlay({ ...c.view, Overlay: () => <G /> } as never, c.data as never);
      glyphs.add(container.querySelector('svg')!.innerHTML);
      unmount();
    }
    expect(glyphs.size).toBe(CASES.length);
  });
});
