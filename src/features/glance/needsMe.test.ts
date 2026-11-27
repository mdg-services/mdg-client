import { describe, expect, it } from 'vitest';

import { KAVACH_ROW } from '@/features/services/serviceMap';

import {
  NOW,
  feed,
  kavach,
  kavachItem,
  report,
  task,
  waterData,
} from './glanceFixtures';
import {
  attentionReports,
  buildNeedsMe,
  isAgedAlarm,
  kavachNeedCount,
  kavachNeeds,
  newestOfEachKind,
  sortNeedsMe,
  type NeedsMeInput,
  type NeedsMeItem,
} from './needsMe';

const build = (over: Partial<NeedsMeInput> = {}) =>
  buildNeedsMe({ feed: feed(), alerts: [], kavach: null, role: 'owner', lang: 'en', now: NOW, ...over });

const item = (over: Partial<NeedsMeItem>): NeedsMeItem => ({
  id: 'x',
  source: 'task',
  status: 'waiting',
  late: false,
  text: 'x',
  serviceId: null,
  since: '2026-11-27T00:00:00.000Z',
  ...over,
});

describe('isAgedAlarm', () => {
  it('is true only for a kind the server ages, once it has turned to information', () => {
    expect(isAgedAlarm({ kind: 'ro_supply', status: 'info' })).toBe(true);
    expect(isAgedAlarm({ kind: 'water_ingress', status: 'info' })).toBe(true);
    expect(isAgedAlarm({ kind: 'ro_supply', status: 'attention' })).toBe(false);
    expect(isAgedAlarm({ kind: 'credit_dod', status: 'info' })).toBe(false);
  });
});

describe('newestOfEachKind and attentionReports', () => {
  it('keeps the newest report of a kind, and every report of the per-order kinds', () => {
    const a = report('credit_dod', { sentAt: '2026-11-25T10:00:00.000Z' });
    const b = report('credit_dod', { sentAt: '2026-11-27T10:00:00.000Z' });
    const o1 = report('fuel_order', { sentAt: '2026-11-25T10:00:00.000Z' });
    const o2 = report('fuel_order', { sentAt: '2026-11-26T10:00:00.000Z' });
    const got = newestOfEachKind([a, b, o1, o2], 'owner');
    expect(got).toContain(b);
    expect(got).not.toContain(a);
    expect(got).toEqual(expect.arrayContaining([o1, o2]));
  });

  it('drops an owner-only kind for a manager', () => {
    const r = report('credit_dod', { status: 'attention' });
    expect(newestOfEachKind([r], 'manager')).toEqual([]);
    expect(attentionReports(feed({ reports: [r] }), 'manager')).toEqual([]);
    expect(attentionReports(feed({ reports: [r] }), 'owner')).toEqual([r]);
  });

  it('skips a report a task already asks for, and an aged alarm', () => {
    const du = report('du_otp', { status: 'attention' });
    const aged = report('ro_supply', { status: 'info' });
    expect(attentionReports(feed({ tasks: [task({ kind: 'du_otp' })], reports: [du, aged] }), 'owner')).toEqual([]);
  });
});

describe('kavachNeeds and kavachNeedCount', () => {
  const back = kavachItem({ state: 'sent_back', code: 'a', sentBack: { reason: 'other', note: null, at: '2026-11-26T08:00:00.000Z' } });
  const late = kavachItem({ code: 'b', late: true });
  const calm = kavachItem({ code: 'c' });

  it('takes the sent-back and the late points, not the calm ones', () => {
    expect(kavachNeeds(kavach({ now: [back, late, calm] }), 'owner', []).map((k) => k.code)).toEqual(['a', 'b']);
  });

  it('is empty while Kavach is off or not read', () => {
    expect(kavachNeeds(kavach({ on: false, now: [back] }), 'owner', [])).toEqual([]);
    expect(kavachNeeds(null, 'owner', [])).toEqual([]);
    expect(kavachNeeds(undefined, 'owner', [])).toEqual([]);
    expect(kavachNeedCount(null, 'owner', [])).toBe(0);
  });

  it('a late point that was already sent is not a thing to do', () => {
    expect(kavachNeeds(kavach({ now: [kavachItem({ state: 'sent', late: true })] }), 'owner', [])).toEqual([]);
  });

  it('a manager skips a point he cannot send', () => {
    const owners = kavachItem({ code: 'o', late: true, canSend: false });
    expect(kavachNeeds(kavach({ now: [owners, late] }), 'manager', []).map((k) => k.code)).toEqual(['b']);
  });

  it('skips a point an open task already asks for (by code or by check id)', () => {
    const byCode = task({ kind: 'ask', action: { type: 'photo', askRef: 'kv:b', acceptsFile: false } });
    expect(kavachNeeds(kavach({ now: [late] }), 'owner', [byCode])).toEqual([]);
    const withCheck = kavachItem({ code: 'z', checkId: 'chk-z', late: true });
    const byCheck = task({ kind: 'ask', action: { type: 'photo', askRef: 'kv:chk-z', acceptsFile: false } });
    expect(kavachNeeds(kavach({ now: [withCheck] }), 'owner', [byCheck])).toEqual([]);
  });

  it('counts one point once even when it is listed twice', () => {
    expect(kavachNeedCount(kavach({ now: [late, { ...late }] }), 'owner', [])).toBe(1);
  });

  it('with only the summary, takes the larger of late and sent back (a point can sit in both)', () => {
    const k = { ...kavach({ counts: { late: 3, sentBack: 2 } }), now: undefined } as never;
    expect(kavachNeedCount(k, 'owner', [])).toBe(3);
  });
});

describe('sortNeedsMe: late first, then problems, then attention, then newest', () => {
  it('orders by rank, then newest first, then the order it came in', () => {
    const items = [
      item({ id: 'wait-old', since: '2026-11-25T00:00:00.000Z' }),
      item({ id: 'attention', status: 'attention', source: 'alert' }),
      item({ id: 'problem', status: 'problem', source: 'alert' }),
      item({ id: 'late-old', late: true, since: '2026-11-24T00:00:00.000Z' }),
      item({ id: 'wait-new', since: '2026-11-27T01:00:00.000Z' }),
      item({ id: 'late-new', late: true, since: '2026-11-26T00:00:00.000Z' }),
      item({ id: 'tie-a', since: '2026-11-23T00:00:00.000Z' }),
      item({ id: 'tie-b', since: '2026-11-23T00:00:00.000Z' }),
    ];
    expect(sortNeedsMe(items).map((i) => i.id)).toEqual([
      'late-new',
      'late-old',
      'problem',
      'attention',
      'wait-new',
      'wait-old',
      'tie-a',
      'tie-b',
    ]);
  });

  it('does not change the list it is given', () => {
    const items = [item({ id: 'b', late: false }), item({ id: 'a', late: true })];
    sortNeedsMe(items);
    expect(items.map((i) => i.id)).toEqual(['b', 'a']);
  });
});

describe('buildNeedsMe', () => {
  it('lists tasks, Kavach points and alerts together, in order', () => {
    const w = report('water_ingress', { status: 'attention', data: waterData({ missed: 2 }) });
    const g = report('ro_supply', { status: 'attention' });
    const t = task({ title: "Send today's register photo", late: true });
    const k = kavach({ now: [kavachItem({ state: 'sent_back', titleEn: 'Fire extinguisher photo', sentBack: { reason: 'other', note: null, at: '2026-11-26T08:00:00.000Z' } })] });
    const got = build({
      feed: feed({ tasks: [t], reports: [w, g] }),
      alerts: [
        { report: w, headline: 'Two water checks missed', severity: 'attention' },
        { report: g, headline: 'Supply is stopped', severity: 'problem' },
      ],
      kavach: k,
    });
    expect(got.map((i) => i.source)).toEqual(['task', 'alert', 'alert', 'kavach']);
    expect(got.map((i) => i.status)).toEqual(['waiting', 'problem', 'attention', 'waiting']);
  });

  it('a task names its service when it has one', () => {
    const got = build({ feed: feed({ tasks: [task({ kind: 'declarations' }), task({ kind: 'portal_login' })] }) });
    expect(got.map((i) => i.serviceId)).toEqual(expect.arrayContaining(['dealer-declarations', null]));
  });

  it('a register-page ask belongs to the density register; a Kavach ask to the Kavach row', () => {
    const reg = task({ kind: 'ask', action: { type: 'photo', askRef: 'reg:2026-11-26', acceptsFile: false } });
    const kv = task({ kind: 'ask', action: { type: 'photo', askRef: 'kv:abc', acceptsFile: false } });
    const got = build({ feed: feed({ tasks: [reg, kv] }) });
    expect(got.map((i) => i.serviceId).sort()).toEqual([KAVACH_ROW, 'tt-density'].sort());
  });

  it('an alert names the service of its report kind', () => {
    const w = report('water_ingress', { status: 'attention' });
    expect(build({ alerts: [{ report: w, headline: 'x', severity: 'attention' }] })[0]?.serviceId).toBe('water-ingress-testing');
  });

  it('skips the setup task when the setup block already shows it', () => {
    const f = feed({ tasks: [task({ kind: 'setup' }), task({ kind: 'declarations' })] });
    expect(build({ feed: f, setupShown: true })).toHaveLength(1);
    expect(build({ feed: f, setupShown: false })).toHaveLength(2);
  });

  it('counts the days a task has waited in India time: 0 on the day it came', () => {
    const t = task({ since: '2026-11-25T20:00:00.000Z' }); // 01:30 on the 26th in India
    expect(build({ feed: feed({ tasks: [t] }) })[0]?.waitingDays).toBe(1);
    expect(build({ feed: feed({ tasks: [task({ since: '2026-11-27T02:00:00.000Z' })] }) })[0]?.waitingDays).toBe(0);
  });

  it('the waiting day rolls over at India midnight, not at midnight UTC', () => {
    const t = task({ since: '2026-11-26T12:00:00.000Z' }); // 17:30 on the 26th in India
    const at = (iso: string) => build({ feed: feed({ tasks: [t] }), now: new Date(iso) })[0]?.waitingDays;
    expect(at('2026-11-26T18:29:59.000Z')).toBe(0);
    expect(at('2026-11-26T18:30:00.000Z')).toBe(1);
  });

  it('a Kavach row says whether the point came back or is late, in the reader\'s language', () => {
    const back = kavachItem({ state: 'sent_back', titleEn: 'Fire photo', titleHi: 'आग की फ़ोटो', sentBack: { reason: 'other', note: null, at: '2026-11-25T08:00:00.000Z' } });
    const late = kavachItem({ late: true, titleEn: 'Water photo', titleHi: 'पानी की फ़ोटो' });
    const k = kavach({ now: [back, late] });
    expect(build({ kavach: k }).map((i) => i.text)).toEqual(
      expect.arrayContaining(['Kavach point sent back: Fire photo', 'Kavach point is late: Water photo']),
    );
    expect(build({ kavach: k, lang: 'hi' }).map((i) => i.text)).toEqual(
      expect.arrayContaining(['कवच का काम वापस आया: आग की फ़ोटो', 'कवच का काम देर से है: पानी की फ़ोटो']),
    );
    const hl = build({ kavach: k, lang: 'hl' }).map((i) => i.text);
    for (const t of hl) expect(/[\u0900-\u097F]/.test(t)).toBe(false);
  });

  it('is empty when nothing waits', () => {
    expect(build()).toEqual([]);
  });
});
