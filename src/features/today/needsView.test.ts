import { describe, expect, it } from 'vitest';

import { variationData } from '@/features/glance/glanceFixtures';
import type { Glance } from '@/features/glance/glanceModel';
import type { NeedsMeItem } from '@/features/glance/needsMe';
import type { TodayReport } from '@dk/shared/types';

import { needsCounts, refineNeedsMe, stopFor, verdictSentenceOf, verdictWordOf } from './needsView';

const item = (over: Partial<NeedsMeItem> & { id: string }): NeedsMeItem => ({
  source: 'task',
  status: 'waiting',
  late: false,
  text: over.id,
  serviceId: null,
  since: '2026-11-26T00:00:00.000Z',
  ...over,
});

const variationReport = (offL: number, variationL = -520): TodayReport => {
  const data = variationData({ offL });
  data.products[0]!.variation.variationL = variationL;
  return {
    id: 'r1',
    kind: 'dsr_variation',
    status: 'attention',
    sentAt: '2026-11-27T01:35:00.000Z',
    headline: 'x',
    attachments: [],
    conversationId: 'c1',
    messageId: 'm1',
    data: data as never,
  };
};

describe('needsCounts', () => {
  it('splits the one list into work for the dealer and things to look at, and they add up to the list', () => {
    const items = [
      item({ id: 'a' }),
      item({ id: 'b', source: 'kavach' }),
      item({ id: 'c', source: 'alert', status: 'attention' }),
      item({ id: 'd', source: 'alert', status: 'problem' }),
      item({ id: 'e', source: 'alert', status: 'attention' }),
    ];
    expect(needsCounts(items)).toEqual({ needYou: 2, look: 3, total: 5 });
    expect(needsCounts([])).toEqual({ needYou: 0, look: 0, total: 0 });
  });
});

describe('refineNeedsMe', () => {
  const alertItem = (report: TodayReport) =>
    item({ id: 'alert:m1', source: 'alert', status: 'problem', text: 'Diesel 520 L short', report });

  it('says the limit and the stock difference together, in each language', () => {
    const [en] = refineNeedsMe([alertItem(variationReport(100))], 'en', true);
    expect(en!.text).toBe('Diesel is 100 L beyond the limit (520 L short)');
    const [hl] = refineNeedsMe([alertItem(variationReport(100))], 'hl', true);
    expect(hl!.text).toMatch(/seema se 100 .* bahar hai \(520 .* kam\)/);
    expect(hl!.text).not.toMatch(/[ऀ-ॿ]/);
    const [hi] = refineNeedsMe([alertItem(variationReport(100))], 'hi', true);
    expect(hi!.text).toMatch(/सीमा से 100 .* बाहर है \(520 .* कम\)/);
  });

  it('says "over" for an excess', () => {
    const [en] = refineNeedsMe([alertItem(variationReport(80, 600))], 'en', true);
    expect(en!.text).toBe('Diesel is 80 L beyond the limit (600 L over)');
  });

  it('leaves a row alone when there is no litre beyond the limit, no snapshot, or it is not a variation row', () => {
    const inside = alertItem(variationReport(0));
    const noData = alertItem({ ...variationReport(100), data: undefined });
    const task = item({ id: 't' });
    expect(refineNeedsMe([inside, noData, task], 'en', true)).toEqual([inside, noData, task]);
  });

  it('never reads a snapshot a manager may not read', () => {
    const owners = alertItem({ ...variationReport(100), kind: 'dsr_variation' });
    // dsr_variation is not owner-only, so a manager reads it; a kind that is owner-only stays untouched.
    expect(refineNeedsMe([owners], 'en', false)[0]!.text).toContain('beyond the limit');
  });
});

describe('verdictWordOf', () => {
  const g = (verdict: Glance['verdict'], word: string) => ({ verdict, word });
  it('counts the word from the list for the two verdicts that count', () => {
    const counts = { needYou: 5, look: 3, total: 8 };
    expect(verdictWordOf(g('needs_you', '11 things wait for you'), counts, 'en')).toBe('5 things wait for you');
    expect(verdictWordOf(g('look', '6 things need a look'), counts, 'en')).toBe('3 things need a look');
    expect(verdictWordOf(g('needs_you', 'आपके लिए 11 काम हैं'), counts, 'hi')).toBe('आपके लिए 5 काम हैं');
  });
  it('keeps the model\'s word for the rest, and when the list has nothing to count', () => {
    expect(verdictWordOf(g('problem', '1 problem'), { needYou: 1, look: 0, total: 1 }, 'en')).toBe('1 problem');
    expect(verdictWordOf(g('fine', 'All fine'), { needYou: 0, look: 0, total: 0 }, 'en')).toBe('All fine');
    expect(verdictWordOf(g('look', '2 things need a look'), { needYou: 0, look: 0, total: 0 }, 'en')).toBe('2 things need a look');
  });
});

describe('verdictSentenceOf', () => {
  const glance = (over: Partial<Pick<Glance, 'verdict' | 'problems' | 'missingReport' | 'sentence'>> = {}) => ({
    verdict: 'needs_you' as const,
    problems: 0,
    missingReport: false,
    ...over,
  });

  it('joins the top two with one word and one stop, per language', () => {
    const items = [item({ id: 'a', text: 'Diesel is 100 L beyond the limit (520 L short).' }), item({ id: 'b', text: 'Fire NOC ends in 9 days.' }), item({ id: 'c', text: 'third' })];
    expect(verdictSentenceOf({ glance: glance(), items, lang: 'en' })).toBe('Diesel is 100 L beyond the limit (520 L short) and Fire NOC ends in 9 days.');
    expect(verdictSentenceOf({ glance: glance(), items: [item({ id: 'a', text: 'पहला.' }), item({ id: 'b', text: 'दूसरा।' })], lang: 'hi' })).toBe('पहला और दूसरा।');
    expect(verdictSentenceOf({ glance: glance(), items: [item({ id: 'a', text: 'Pehla' }), item({ id: 'b', text: 'Doosra!' })], lang: 'hl' })).toBe('Pehla aur Doosra.');
  });

  it('puts problems first when there is a problem, then the stopped supply line, then the missing report', () => {
    const items = [item({ id: 'a', text: 'A task' }), item({ id: 'b', text: 'A problem', status: 'problem', source: 'alert' })];
    expect(verdictSentenceOf({ glance: glance({ verdict: 'problem', problems: 1 }), items, lang: 'en' })).toBe('A problem and A task.');
    expect(verdictSentenceOf({ glance: glance({ verdict: 'problem', problems: 1 }), items, supplyStopped: 'Supply is stopped', lang: 'en' })).toBe(
      'Supply is stopped and A problem.',
    );
    expect(verdictSentenceOf({ glance: glance({ verdict: 'look', missingReport: true }), items: [], lang: 'en' })).toBe(
      "Yesterday's sales report has not come yet.",
    );
  });

  it('leaves the model\'s own sentence for the verdicts that have no reasons', () => {
    expect(verdictSentenceOf({ glance: glance({ verdict: 'unknown', sentence: 'Try again' }), items: [], lang: 'en' })).toBe('Try again');
    expect(verdictSentenceOf({ glance: glance({ verdict: 'fine' }), items: [], lang: 'en' })).toBeUndefined();
    expect(verdictSentenceOf({ glance: glance({ sentence: 'kept' }), items: [], lang: 'en' })).toBe('kept');
  });

  it('uses the danda in Hindi only', () => {
    expect(stopFor('hi')).toBe('।');
    expect(stopFor('hl')).toBe('.');
    expect(stopFor('en')).toBe('.');
  });
});
