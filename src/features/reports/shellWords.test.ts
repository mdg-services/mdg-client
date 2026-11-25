import { describe, expect, it } from 'vitest';

import { messages } from '@/lib/i18n';
import { hl } from '@/lib/i18n.hl';

/**
 * The words the report shell and the Reports tab say are all in the catalog (not in a kind's
 * file), so each must exist in the three dealer languages, in the right script (ADR 0056: dealer
 * text in hi + hl + en).
 */
const shellKeys = Object.keys(messages).filter(
  (k) => k.startsWith('report.') || k.startsWith('reports.') || k === 'tabs.reports' || /^chat\.reportSentence/.test(k),
) as Array<keyof typeof messages>;

describe('the report shell\'s words', () => {
  it('finds the keys it is about', () => {
    expect(shellKeys.length).toBeGreaterThan(50);
  });

  it.each(shellKeys)('%s is written in English, Hindi (Devanagari) and Hinglish (Latin)', (key) => {
    const m = messages[key];
    const latin = hl[key];
    expect(m.en.trim()).not.toBe('');
    expect(m.hi.trim()).not.toBe('');
    expect(latin.trim()).not.toBe('');
    // Hindi is in Devanagari (a placeholder-only value is the one exception), Hinglish never is.
    if (/[A-Za-z]{3,}/.test(m.en.replace(/\{\w+\}/g, ''))) expect(/[ऀ-ॿ]/.test(m.hi)).toBe(true);
    expect(/[ऀ-ॿ]/.test(latin)).toBe(false);
    // The same placeholders in every language, so no value is lost in one of them.
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
    expect(ph(m.hi)).toBe(ph(m.en));
    expect(ph(latin)).toBe(ph(m.en));
  });

  it('never says "Sir" to a dealer', () => {
    for (const key of shellKeys) {
      expect(`${messages[key].en} ${messages[key].hi} ${hl[key]}`).not.toMatch(/\bsir\b|सर\b/i);
    }
  });
});
