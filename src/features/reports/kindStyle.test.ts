import { describe, expect, it } from 'vitest';

import { REPORT_KINDS } from '@dk/shared/types';

import { ALL_GROUP_NAME, KIND_FAMILIES, KIND_GROUPS, KIND_STYLE, kindStyle, kindsOfGroup } from './kindStyle';
import { STATUS_STYLE } from './StatusBadge';
import { sayWords } from './types';

/** WCAG relative luminance and contrast of two #rrggbb colours. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('kindStyle: one look per report kind', () => {
  it('has a style for every one of the nineteen kinds', () => {
    expect(REPORT_KINDS).toHaveLength(19);
    expect(Object.keys(KIND_STYLE).sort()).toEqual([...REPORT_KINDS].sort());
  });

  it('gives every kind a name and a button in all three languages, Hindi in Devanagari', () => {
    for (const kind of REPORT_KINDS) {
      const s = kindStyle(kind);
      for (const words of [s.names, s.button]) {
        for (const lang of ['hi', 'hl', 'en'] as const) expect(sayWords(words, lang).trim()).not.toBe('');
      }
      // The Hindi name and button are Hindi; the Latin ones are not.
      expect(s.button.hi).toMatch(/[ऀ-ॿ]/);
      expect(s.button.hl).not.toMatch(/[ऀ-ॿ]/);
      expect(s.button.en).not.toMatch(/[ऀ-ॿ]/);
      // The button's chevron is drawn, not typed: the words end with the report's name.
      for (const lang of ['hi', 'hl', 'en'] as const) expect(s.button[lang].endsWith('›')).toBe(false);
    }
  });

  it('names the report by its own name in the button, so a blind tap knows which report it opens', () => {
    // The name without its bracketed tag, and the button without its verb and chevron.
    const core = (name: string) => name.replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();
    const bare = (button: string) =>
      button
        .replace(/\s*›$/, '')
        .replace(/^(See|Open)\s+/i, '')
        .replace(/\s+(देखें|खोलें|dekhein|kholein)$/i, '')
        .trim()
        .toLowerCase();
    // ADR 0056 §5 words the sales button "See sales report" in English (dealers call it the sales report).
    const exempt = new Set(['dsr_sales|en']);
    for (const kind of REPORT_KINDS) {
      const s = kindStyle(kind);
      for (const lang of ['hi', 'hl', 'en'] as const) {
        if (exempt.has(`${kind}|${lang}`)) continue;
        expect(bare(s.button[lang]), `${kind} ${lang}`).toBe(core(s.names[lang]));
      }
    }
  });

  it('names the report in its button the way the ADR shows it', () => {
    expect(kindStyle('dsr_sales').button.hi).toBe('बिक्री रिपोर्ट देखें');
  });

  it('uses the ADR palette: white text on every family colour is at least 7:1, and ink on its soft tint at least 4.5:1', () => {
    for (const [family, c] of Object.entries(KIND_FAMILIES)) {
      expect(contrast('#ffffff', c.color), `${family} header`).toBeGreaterThanOrEqual(7);
      expect(contrast(c.color, c.soft), `${family} ink on soft`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('never makes a family colour a status colour, so identity cannot be read as a verdict', () => {
    const statusColors = new Set(Object.values(STATUS_STYLE).map((s) => s.color));
    for (const c of Object.values(KIND_FAMILIES)) expect(statusColors.has(c.color)).toBe(false);
  });

  it('copies the family colours onto each kind', () => {
    for (const kind of REPORT_KINDS) {
      const s = kindStyle(kind);
      expect(s.color).toBe(KIND_FAMILIES[s.family].color);
      expect(s.soft).toBe(KIND_FAMILIES[s.family].soft);
      expect(s.Icon).toBeDefined();
    }
  });

  it('keeps the ADR families: DSR navy, the four tanker kinds one cyan, plum for the paperwork kinds', () => {
    expect(kindStyle('dsr_sales').color).toBe('#1e3a8a');
    expect(kindStyle('dsr_variation').family).toBe('dsr');
    for (const k of ['load_plan', 'tanker_density', 'tt_ack', 'fuel_order'] as const) {
      expect(kindStyle(k).color).toBe('#155e75');
    }
    for (const k of ['declaration_filed', 'mock_drill', 'electrical_audit'] as const) {
      expect(kindStyle(k).color).toBe('#86198f');
    }
    expect(kindStyle('kavach').color).toBe('#18181b');
    expect(kindStyle('calibration_claim').color).toBe('#6d28d9');
  });

  it('puts every kind in exactly one filter group, and each group agrees with the kind', () => {
    const seen: string[] = [];
    for (const g of KIND_GROUPS) {
      for (const kind of g.kinds) {
        seen.push(kind);
        expect(kindStyle(kind).group).toBe(g.group);
      }
      expect(kindsOfGroup(g.group)).toEqual(g.kinds);
      for (const lang of ['hi', 'hl', 'en'] as const) expect(sayWords(g.names, lang)).not.toBe('');
    }
    expect([...seen].sort()).toEqual([...REPORT_KINDS].sort());
    expect(new Set(seen).size).toBe(seen.length);
    expect(sayWords(ALL_GROUP_NAME, 'en')).toBe('All');
  });
});
