import { describe, expect, it } from 'vitest';

import { messages, translate } from '@/lib/i18n';
import { SERVICE_ABOUT, SERVICE_LABELS } from '@dk/shared';

import { serviceAboutOf, serviceNameOf, needFromYouKeys } from './serviceCopy';
import { SERVICE_MAP, isHiddenService } from './serviceMap';

/**
 * The sentences are written for the dealer's page, not copied from the shared list (which is a lower-case
 * fragment with no full stop and runs to five lines for some services): each is one short, capitalised
 * sentence, ended with a full stop, in all three languages.
 */
describe("what each service does, in the dealer's words", () => {
  const visible = Object.keys(SERVICE_MAP).filter((id) => !isHiddenService(id));

  it('has one short, capitalised, finished sentence for every service the app lists', () => {
    for (const id of visible) {
      expect(SERVICE_ABOUT[id], id).toBeTruthy();
      const en = translate('en', `serviceAbout.${id}` as never);
      const hi = translate('hi', `serviceAbout.${id}` as never);
      const hl = translate('hl', `serviceAbout.${id}` as never);
      expect(en, id).toMatch(/^[A-Z"].*\.$/);
      expect(hl, id).toMatch(/^[A-Z"].*\.$/);
      expect(hi, id).toMatch(/।$/);
      expect(hl, id).not.toMatch(/[ऀ-ॿ]/);
      // One sentence: no semicolon, no dash run-on, and short enough to read without scrolling at 200% text.
      for (const text of [en, hi, hl]) {
        expect(text, id).not.toMatch(/;|\s—\s/);
        expect(text.length, id).toBeLessThanOrEqual(120);
      }
    }
  });

  it('writes no sentence for a service that is never shown', () => {
    for (const id of [
      'sdms-password-reset',
      'iras-password-reset',
      'hpcl-account',
      'custom-request',
    ]) {
      expect(`serviceAbout.${id}` in messages).toBe(false);
    }
  });

  it('names every listed service in Hindi and English and never falls back to its id', () => {
    for (const id of visible) {
      expect(serviceNameOf(id, 'en')).toBe(SERVICE_LABELS[id]!.en);
      // The one name the owner says differently from the depot's: fuel orders are "तेल का ऑर्डर", not "लोड ऑर्डर".
      expect(serviceNameOf(id, 'hi')).toBe(
        id === 'fuel-indent' ? 'तेल का ऑर्डर' : SERVICE_LABELS[id]!.hi,
      );
      expect(serviceAboutOf(id, 'hi')).not.toBe('');
    }
    expect(serviceNameOf('brand-new-plugin', 'en')).toBe('');
    expect(serviceAboutOf('brand-new-plugin', 'en')).toBe('');
  });

  it('gives each service page one plain line of what MDG needs from the dealer', () => {
    for (const id of visible) {
      const spec = SERVICE_MAP[id]!;
      if (!spec.template) continue;
      const keys = needFromYouKeys(id, spec.template);
      expect(keys).toHaveLength(1);
      for (const k of keys) expect(k in messages, k).toBe(true);
    }
  });
});
