import { describe, expect, it } from 'vitest';

import { baseMessages, messages, type MessageKey } from './i18n';
import { hl } from './i18n.hl';
import { AREA_PREFIXES, type AreaName } from './messages/_types';
import { billHl, billMessages } from './messages/bill';
import { chatHl, chatMessages } from './messages/chat';
import { firstrunHl, firstrunMessages } from './messages/firstrun';
import { glanceHl, glanceMessages } from './messages/glance';
import { kavachHl, kavachMessages } from './messages/kavach';
import { kitHl, kitMessages } from './messages/kit';
import { pumpHl, pumpMessages } from './messages/pump';
import { reportsHl, reportsMessages } from './messages/reports';
import { reportViews1Hl, reportViews1Messages } from './messages/reportViews1';
import { reportViews2Hl, reportViews2Messages } from './messages/reportViews2';
import { reportViews3Hl, reportViews3Messages } from './messages/reportViews3';
import { servicesHl, servicesMessages } from './messages/services';
import { shellHl, shellMessages } from './messages/shell';
import { staffHl, staffMessages } from './messages/staff';
import { todayHl, todayMessages } from './messages/today';

/**
 * The per-area message files (spec section 8). A spread silently lets the later object overwrite
 * the earlier one, so a key written twice would change a sentence on another screen without any
 * error. These tests are what stops that, and what keeps each area to its own prefix.
 */

type Area = {
  name: AreaName;
  messages: Record<string, { en: string; hi: string }>;
  hl: Record<string, string>;
};

const AREAS: Area[] = [
  { name: 'kit', messages: kitMessages, hl: kitHl },
  { name: 'shell', messages: shellMessages, hl: shellHl },
  { name: 'glance', messages: glanceMessages, hl: glanceHl },
  { name: 'today', messages: todayMessages, hl: todayHl },
  { name: 'services', messages: servicesMessages, hl: servicesHl },
  { name: 'reports', messages: reportsMessages, hl: reportsHl },
  { name: 'reportViews1', messages: reportViews1Messages, hl: reportViews1Hl },
  { name: 'reportViews2', messages: reportViews2Messages, hl: reportViews2Hl },
  { name: 'reportViews3', messages: reportViews3Messages, hl: reportViews3Hl },
  { name: 'kavach', messages: kavachMessages, hl: kavachHl },
  { name: 'pump', messages: pumpMessages, hl: pumpHl },
  { name: 'staff', messages: staffMessages, hl: staffHl },
  { name: 'bill', messages: billMessages, hl: billHl },
  { name: 'chat', messages: chatMessages, hl: chatHl },
  { name: 'firstrun', messages: firstrunMessages, hl: firstrunHl },
];

const holes = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();

describe('the area message files', () => {
  it('has a file for every area the spec names, once', () => {
    expect(AREAS.map((a) => a.name).sort()).toEqual(Object.keys(AREA_PREFIXES).sort());
  });

  it('gives no two areas the same prefix', () => {
    const all = Object.values(AREA_PREFIXES).flat();
    expect(new Set(all).size).toBe(all.length);
    // No prefix is the start of another ("rv" would swallow "rv1."), or the spread rule has no meaning.
    for (const a of all) for (const b of all) if (a !== b) expect(b.startsWith(a), `${b} starts with ${a}`).toBe(false);
  });

  it.each(AREAS)('keeps every key of $name inside its own prefix', ({ name, messages: area }) => {
    const prefixes: readonly string[] = AREA_PREFIXES[name];
    const stray = Object.keys(area).filter((k) => !prefixes.some((p) => k.startsWith(p)));
    expect(stray).toEqual([]);
  });

  it('writes no area key in the old catalog or in another area', () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const { name, messages: area } of AREAS) {
      for (const key of Object.keys(area)) {
        if (key in baseMessages) clashes.push(`${key}: ${name} and the old catalog`);
        const first = seen.get(key);
        if (first) clashes.push(`${key}: ${first} and ${name}`);
        seen.set(key, name);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('puts every area key into the one catalog, and every Hinglish string into the one Hinglish file', () => {
    for (const { messages: area, hl: areaHl } of AREAS) {
      for (const key of Object.keys(area)) {
        expect(messages[key as MessageKey]).toBe(area[key]);
        expect(hl[key as MessageKey]).toBe(areaHl[key]);
      }
    }
  });

  it.each(AREAS)('has Hinglish for every key of $name and nothing else', ({ messages: area, hl: areaHl }) => {
    expect(Object.keys(areaHl).sort()).toEqual(Object.keys(area).sort());
  });

  it.each(AREAS)('writes both languages for every key of $name, never empty', ({ messages: area, hl: areaHl }) => {
    for (const [key, m] of Object.entries(area)) {
      expect(m.en.trim(), `${key} en`).toBeTruthy();
      expect(m.hi.trim(), `${key} hi`).toBeTruthy();
      expect(areaHl[key]?.trim(), `${key} hl`).toBeTruthy();
    }
  });

  it.each(AREAS)('keeps the same {placeholders} in all three languages of $name', ({ messages: area, hl: areaHl }) => {
    for (const [key, m] of Object.entries(area)) {
      expect(holes(m.hi), `${key} hi`).toEqual(holes(m.en));
      expect(holes(areaHl[key] ?? ''), `${key} hl`).toEqual(holes(m.en));
    }
  });

  it.each(AREAS)('writes the Hinglish of $name in English letters, and the others in the right script', ({ messages: area, hl: areaHl }) => {
    for (const [key, v] of Object.entries(areaHl)) expect(/[ऀ-ॿ]/.test(v), `${key} hl has Devanagari`).toBe(false);
    for (const [key, m] of Object.entries(area)) expect(/[ऀ-ॿ]/.test(m.en), `${key} en has Devanagari`).toBe(false);
  });

  it.each(AREAS)('gives every .one key of $name its .many twin, and the reverse', ({ messages: area }) => {
    const keys = new Set(Object.keys(area));
    for (const k of keys) {
      if (k.endsWith('.one')) expect(keys.has(k.replace(/\.one$/, '.many')), `${k} has no .many`).toBe(true);
      if (k.endsWith('.many')) expect(keys.has(k.replace(/\.many$/, '.one')), `${k} has no .one`).toBe(true);
    }
  });

  it('never calls a dealer "Sir"', () => {
    const sir = AREAS.flatMap(({ messages: area, hl: areaHl }) =>
      Object.entries(area)
        .filter(([k, m]) => /\bsir\b|(^|[\s,.!?।])सर($|[\s,.!?।])/i.test(`${m.en} ${m.hi} ${areaHl[k]}`))
        .map(([k]) => k),
    );
    expect(sir).toEqual([]);
  });
});
