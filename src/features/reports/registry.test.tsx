import { describe, expect, it } from 'vitest';

import { REPORT_KINDS, type ReportData } from '@dk/shared/types';

import { KIND_VIEWS, getKindView, viewOfData } from './registry';

describe('registry: every kind has a view', () => {
  it('holds all nineteen kinds, each view for its own kind', () => {
    expect(Object.keys(KIND_VIEWS).sort()).toEqual([...REPORT_KINDS].sort());
    for (const kind of REPORT_KINDS) {
      const v = getKindView(kind);
      expect(v.kind).toBe(kind);
      expect(typeof v.Overlay).toBe('function');
      expect(typeof v.Glyph).toBe('function');
      for (const fn of [v.tile, v.alert, v.headline, v.share]) expect(typeof fn).toBe('function');
    }
  });

  it('finds the view of a snapshot by its kind', () => {
    const data = { kind: 'credit_dod', v: 1 } as unknown as ReportData;
    expect(viewOfData(data).kind).toBe('credit_dod');
  });
});
