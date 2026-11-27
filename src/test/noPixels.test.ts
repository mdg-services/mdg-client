import { describe, expect, it } from 'vitest';

import { FROZEN } from './noPixels.frozen';
import { fileExists, RULES, scanFile, scanText, sourceFiles, stripComments, type RuleName } from './noPixels.scan';

/**
 * The build-time guard (spec 5, 3.1). A file of the redesign is written in the type scale and in
 * rem, so it works at 200% text: no `text-[13px]`, no fixed pixel height or width on anything that
 * holds text, no `truncate` or `line-clamp` on a name, no dark mode, no `target="_blank"`.
 *
 * Every source file is read. The files that already broke a rule before the redesign are on a frozen
 * list that only shrinks (`noPixels.frozen.ts`); every other file, new or old, must be clean. The
 * kit and the new files of the spec's section 10 are clean even if someone adds them to the list.
 */

/** Files and folders new in this work (spec section 10): never on the frozen list, always clean. */
const NEW = [
  'components/kit/',
  'lib/fmt.ts',
  'lib/useLargeText.ts',
  'features/tabs/tabConfig.ts',
  'features/tabs/useKavachMemory.ts',
  'features/tabs/todayBadge.ts',
  'pages/ServicePage.tsx',
  'pages/PumpPage.tsx',
  'pages/PapersPage.tsx',
  'pages/StaffPersonPage.tsx',
  'features/setup/SetupHero.tsx',
  'features/glance/',
  'features/services/serviceMap.ts',
  'features/services/serviceState.ts',
  'features/services/useMeServices.ts',
  'features/today/WorkList.tsx',
  'features/today/todayConfig.ts',
  'features/pump/',
  'features/staff/warriorStats.ts',
];

const names = Object.keys(RULES) as RuleName[];

describe('the pixel guard\'s scanner', () => {
  it.each([
    ['text-[13px]', 'textPx'],
    ['text-[0.8rem]', 'textPx'],
    ['h-[72px]', 'heightPx'],
    ['min-h-[64px]', 'heightPx'],
    ['w-[200px]', 'widthPx'],
    ['min-w-[200px]', 'widthPx'],
    ['truncate', 'truncate'],
    ['line-clamp-2', 'lineClamp'],
    ['dark:bg-black', 'dark'],
    ['target="_blank"', 'blank'],
    ["target='_blank'", 'blank'],
    ['target={"_blank"}', 'blank'],
  ])('catches %s', (cls, rule) => {
    const found = scanText(`<div className="${cls}" />`);
    expect(found[rule as RuleName]).toBeGreaterThan(0);
  });

  it.each([
    'text-body',
    'text-meta',
    'min-h-11',
    'min-h-14',
    'h-[1.25em]',
    '[&>svg]:h-[2.25rem]',
    'w-2/3',
    'break-words',
    'max-w-md',
    'bg-surface',
    'data-truncated',
    'darkness',
  ])('lets %s through', (cls) => {
    expect(scanText(`<div className="${cls}" />`)).toEqual({});
  });

  it('does not count a sentence in a comment', () => {
    const src = `
      // never truncate a name, never text-[12px]
      /* h-[40px] and dark:bg-black are gone */
      const a = 'https://example.com/path';
      export const b = 1;
    `;
    expect(stripComments(src)).not.toMatch(/text-\[12px\]|h-\[40px\]/);
    expect(scanText(src)).toEqual({});
  });
});

describe('the pixel guard', () => {
  const files = sourceFiles();

  it('reads the app\'s source', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain('components/kit/index.ts');
    expect(files.some((f) => f.endsWith('.test.tsx'))).toBe(false);
  });

  it('keeps the kit and every new file of the redesign clean, and off the frozen list', () => {
    const mine = files.filter((f) => NEW.some((n) => (n.endsWith('/') ? f.startsWith(n) : f === n)));
    expect(mine.length).toBeGreaterThan(20);
    const dirty = mine.filter((f) => Object.keys(scanFile(f)).length > 0).map((f) => `${f} ${JSON.stringify(scanFile(f))}`);
    expect(dirty).toEqual([]);
    expect(Object.keys(FROZEN).filter((f) => NEW.some((n) => (n.endsWith('/') ? f.startsWith(n) : f === n)))).toEqual([]);
  });

  it('keeps every file off the list clean: a new file starts with no pixel sizes, no truncate, no dark mode', () => {
    const dirty: string[] = [];
    for (const f of files) {
      if (FROZEN[f]) continue;
      const c = scanFile(f);
      if (Object.keys(c).length > 0) dirty.push(`${f} ${JSON.stringify(c)}`);
    }
    expect(dirty).toEqual([]);
  });

  it('lets a frozen file break a rule no more often than it did', () => {
    const worse: string[] = [];
    for (const [f, frozen] of Object.entries(FROZEN)) {
      if (!fileExists(f)) continue;
      const now = scanFile(f);
      for (const rule of names) {
        if ((now[rule] ?? 0) > (frozen[rule] ?? 0)) worse.push(`${f}: ${rule} ${now[rule]} > ${frozen[rule] ?? 0}`);
      }
    }
    expect(worse).toEqual([]);
  });

  // Run with NO_PIXELS_STRICT=1 (group Z does, at the end) to find entries that are now dead weight.
  const strict = process.env.NO_PIXELS_STRICT === '1';
  (strict ? it : it.skip)('has no stale entry on the frozen list', () => {
    const stale: string[] = [];
    for (const [f, frozen] of Object.entries(FROZEN)) {
      if (!fileExists(f)) {
        stale.push(`${f}: the file is gone`);
        continue;
      }
      const now = scanFile(f);
      for (const rule of names) {
        if ((now[rule] ?? 0) < (frozen[rule] ?? 0)) stale.push(`${f}: ${rule} is ${now[rule] ?? 0}, listed ${frozen[rule]}`);
      }
    }
    expect(stale).toEqual([]);
  });
});
