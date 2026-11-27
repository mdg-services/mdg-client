import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { NOW, feed, kavach, kavachItem, report, task } from '@/features/glance/glanceFixtures';
import { countsOf } from '@/features/glance/glanceModel';

import { todayBadgeCounts } from './todayBadge';

describe('todayBadgeCounts: the badge is the glance model\'s "need you" count, nothing of its own', () => {
  const kv = kavach({
    now: [
      kavachItem({ code: 'a', late: true, uploader: 'manager' }),
      kavachItem({ code: 'b', late: true, uploader: 'owner' }),
      kavachItem({ code: 'c', state: 'sent_back', uploader: 'manager' }),
      kavachItem({ code: 'd', state: 'todo' }),
    ],
    counts: { late: 2, sentBack: 1 },
  });
  const f = feed({
    tasks: [task(), task({ id: 'ask:2' }), task({ id: 'setup:1', kind: 'setup' })],
    reports: [report('dsr_variation', { status: 'attention' }), report('ro_supply', { status: 'info' })],
  });

  it.each(['owner', 'manager'] as const)('says what countsOf says, for the %s', (role) => {
    for (const setupShown of [false, true]) {
      const { needYou } = countsOf({ feed: f, kavach: kv, role, now: NOW, setupShown });
      expect(todayBadgeCounts({ feed: f, kavach: kv, role, now: NOW, setupShown })).toEqual({ needYou });
    }
  });

  it('counts the reader\'s own Kavach points only: the owner\'s badge leaves the manager\'s jobs out', () => {
    const owner = todayBadgeCounts({ feed: f, kavach: kv, role: 'owner', now: NOW });
    const manager = todayBadgeCounts({ feed: f, kavach: kv, role: 'manager', now: NOW });
    // 3 tasks + the owner's one late point; the manager: 3 tasks + his late job and his sent-back job.
    expect(owner.needYou).toBe(4);
    expect(manager.needYou).toBe(3 + 3);
  });

  it('leaves the feed\'s setup task out while the setup hero carries it', () => {
    expect(todayBadgeCounts({ feed: f, role: 'owner', now: NOW, setupShown: true }).needYou).toBe(2);
    expect(todayBadgeCounts({ feed: f, role: 'owner', now: NOW, setupShown: false }).needYou).toBe(3);
  });

  it('does not count the reports that need a look: the card lists those from the alerts the kinds raise, the bar cannot know which', () => {
    const lookOnly = feed({
      reports: [report('dsr_variation', { status: 'attention' }), report('dsr_sales', { status: 'attention' })],
    });
    expect(todayBadgeCounts({ feed: lookOnly, role: 'owner', now: NOW })).toEqual({ needYou: 0 });
  });

  it('is zero with no answer yet', () => {
    expect(todayBadgeCounts({ feed: undefined, role: 'owner' })).toEqual({ needYou: 0 });
  });

  it('still counts the open tasks when an answer is shaped in a way the model cannot read', () => {
    const bad = { tasks: [task()], reports: [{ kind: 'dsr_sales', status: 'attention' }, { kind: 'dsr_variation', status: 'attention' }] } as never;
    expect(todayBadgeCounts({ feed: bad, role: 'owner', now: NOW })).toEqual({ needYou: 1 });
  });
});

describe('todayBadge: the bar loads no report view', () => {
  const SRC = path.resolve(__dirname, '../..');

  /** Every file the bar's badge pulls in at run time (type-only imports are erased and do not count). */
  function closure(entry: string): Set<string> {
    const seen = new Set<string>();
    const visit = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const text = fs.readFileSync(file, 'utf8');
      for (const m of text.matchAll(/^import\s+(?!type\b)[^;]*?from\s+'([^']+)'/gms)) {
        const spec = m[1]!;
        const base = spec.startsWith('@/') ? path.join(SRC, spec.slice(2)) : spec.startsWith('.') ? path.resolve(path.dirname(file), spec) : null;
        if (!base) continue;
        const found = ['.ts', '.tsx', '/index.ts', '/index.tsx'].map((ext) => base + ext).find((p) => fs.existsSync(p));
        if (found) visit(found);
      }
    };
    visit(entry);
    return seen;
  }

  it('reaches no report kind\'s drawing code, no kind registry and no component', () => {
    const files = [...closure(path.join(SRC, 'features/tabs/todayBadge.ts'))].map((f) => path.relative(SRC, f));
    const kindCode = files.filter(
      (f) => f.startsWith('features/reports/registry') || f.startsWith('features/reports/kinds/') || f.endsWith('.tsx'),
    );
    // The one kind file it reaches is a plain formatter (the fuel's name), with no drawing in it.
    expect(kindCode).toEqual(['features/reports/kinds/dsr_sales/fmt.ts']);
  });
});
