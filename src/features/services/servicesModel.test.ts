import { describe, expect, it } from 'vitest';

import {
  NOW,
  feed,
  kavach,
  report,
  salesData,
  task,
  variationData,
  creditData,
} from '@/features/glance/glanceFixtures';
import type { MeServiceEntry } from '@dk/shared/types';

import {
  attachedOf,
  buildHub,
  newestOf,
  resultLine,
  waitingDaysOf,
  type HubInput,
} from './servicesModel';
import type { MeServicesRead } from './useMeServices';

const entry = (
  serviceId: string,
  run: MeServiceEntry['run'],
  extra: Partial<MeServiceEntry> = {},
): MeServiceEntry => ({
  serviceId,
  run,
  cadence: 'DAILY',
  ...extra,
});
const me = (services: MeServiceEntry[], week?: number): MeServicesRead => ({
  services,
  asOf: NOW.toISOString(),
  ...(week === undefined ? {} : { week: { since: '2026-11-20', total: week, byKind: {} } }),
});
const hubOf = (over: Partial<HubInput> = {}) =>
  buildHub({ isOwner: true, live: true, lang: 'en', now: NOW, ...over });
const ids = (h: ReturnType<typeof buildHub>) => h.groups.flatMap((g) => g.rows.map((r) => r.id));

describe('the hub: which services are listed', () => {
  it('lists the attached services in the spec groups, in the spec order', () => {
    const h = hubOf({
      me: me([
        entry('stock-check', 'on_request'),
        entry('dealer-declarations', 'ok'),
        entry('water-ingress-testing', 'ok'),
        entry('dsr-report', 'ok'),
        entry('iras-shift-data', 'ok'),
      ]),
    });
    expect(h.groups.map((g) => [g.group, g.rows.map((r) => r.id)])).toEqual([
      ['daily', ['dsr-report', 'water-ingress-testing']],
      ['filed', ['dealer-declarations']],
      ['ask', ['stock-check']],
    ]);
    expect(h.feeds).toEqual({ n: 1, allRunning: true, stopped: 0 });
  });

  it('never lists the login helpers, HPCL account or the custom request, whatever the server sends', () => {
    const h = hubOf({
      me: me([
        entry('iras-password-reset', 'ok'),
        entry('sdms-password-reset', 'ok'),
        entry('sdms-old-password-reset', 'ok'),
        entry('hpcl-account', 'ok'),
        entry('custom-request', 'on_request'),
        entry('brand-new-plugin', 'ok'),
        entry('dsr-report', 'ok'),
      ]),
    });
    expect(ids(h)).toEqual(['dsr-report']);
    expect(h.feeds).toBeNull();
    expect(h.groups.flatMap((g) => g.rows).every((r) => r.name !== '')).toBe(true);
  });

  it('hides the owner-only services from a manager, as rows and as counts', () => {
    const entries = [
      entry('dsr-report', 'ok'),
      entry('credit-dod-monitoring', 'ok'),
      entry('calibration-claim', 'ok'),
    ];
    const owner = hubOf({ me: me(entries), isOwner: true });
    const manager = hubOf({ me: me(entries), isOwner: false });
    expect(ids(owner)).toEqual(['dsr-report', 'credit-dod-monitoring', 'calibration-claim']);
    expect(ids(manager)).toEqual(['dsr-report']);
    expect(manager.health?.total).toBe(1);
  });

  it('does not offer an owner-only service to a manager under "You could add"', () => {
    const owner = hubOf({ me: me([entry('dsr-report', 'ok')]), isOwner: true });
    const manager = hubOf({ me: me([entry('dsr-report', 'ok')]), isOwner: false });
    expect(owner.addable.map((a) => a.id)).toContain('credit-dod-monitoring');
    expect(manager.addable.map((a) => a.id)).not.toContain('credit-dod-monitoring');
  });

  it('offers the standard package minus what is attached, never a data feed, with the about sentence', () => {
    const h = hubOf({ me: me([entry('dsr-report', 'ok'), entry('stock-check', 'on_request')]) });
    const add = h.addable.map((a) => a.id);
    expect(add).not.toContain('dsr-report');
    expect(add).not.toContain('stock-check');
    expect(add).not.toContain('iras-shift-data');
    expect(add).not.toContain('inspection-reports');
    expect(add).toContain('water-ingress-testing');
    expect(h.addable.every((a) => a.about.length > 0 && a.name.length > 0)).toBe(true);
  });

  it('draws no "You could add" when what is attached is not known from a server', () => {
    const h = hubOf({ feed: feed({ reports: [report('dsr_sales', { data: salesData() })] }) });
    expect(ids(h)).toEqual(['dsr-report']);
    expect(h.addable).toEqual([]);
    expect(attachedOf({ feed: null }).known).toBe(false);
  });

  it("falls back to the older route's list when /me/services is missing", () => {
    const h = hubOf({ me: null, attachedIds: ['dsr-report', 'stock-check'] });
    expect(ids(h)).toEqual(['dsr-report', 'stock-check']);
    expect(h.addable.length).toBeGreaterThan(0);
  });

  it('puts a service with a page in a tappable row and a feed in no row at all', () => {
    const h = hubOf({ me: me([entry('dsr-report', 'ok'), entry('bpcl-iot-data', 'ok')]) });
    expect(h.groups[0]!.rows[0]!.tappable).toBe(true);
    expect(ids(h)).toEqual(['dsr-report']);
  });
});

describe("the hub: the door's own result lines", () => {
  it('writes the stock variation as a sentence and the orders as a count, never a plate', () => {
    const h = hubOf({
      me: me([entry('dsr-report', 'ok'), entry('fuel-indent', 'ok')]),
      feed: feed({
        reports: [
          report('dsr_variation', { status: 'attention', data: variationData({ offL: 90 }) }),
        ],
      }),
    });
    const by = Object.fromEntries(h.groups.flatMap((g) => g.rows).map((r) => [r.id, r.result]));
    expect(by['dsr-report']).toBe('Diesel 90 L outside the limit (170 L short)');
    expect(by['fuel-indent']).toBeNull();
  });
});

describe('the hub: honest words', () => {
  const dsrFeed = feed({ reports: [report('dsr_sales', { data: salesData(), status: 'ok' })] });

  it('gives no health and no state when /me/services is absent (never "Working")', () => {
    const h = hubOf({ me: null, attachedIds: ['dsr-report'], feed: dsrFeed });
    expect(h.health).toBeNull();
    expect(h.groups[0]!.rows[0]!.state).toBeNull();
    expect(h.groups[0]!.rows[0]!.times).toEqual({});
    expect(h.cameToday).toBe(1);
    expect(h.week).toBeNull();
  });

  it('still says "Needs you" and "Look at this" without the server, because the feed proves them', () => {
    const t1 = task({ kind: 'declarations' });
    const h = hubOf({
      me: null,
      attachedIds: ['dsr-report', 'dealer-declarations'],
      feed: feed({
        tasks: [t1],
        reports: [report('dsr_sales', { status: 'attention', data: salesData() })],
      }),
    });
    const by = Object.fromEntries(h.groups.flatMap((g) => g.rows).map((r) => [r.id, r.state?.id]));
    expect(by).toEqual({ 'dsr-report': 'look', 'dealer-declarations': 'needs_you' });
    expect(h.health).toBeNull();
  });

  it('counts "8 of 9"-style health from the server\'s run words, and leaves "when you ask" out of the count', () => {
    const h = hubOf({
      me: me(
        [
          entry('dsr-report', 'ok', {
            lastRanAt: '2026-11-27T01:35:00.000Z',
            nextRunAt: '2026-11-28T01:35:00.000Z',
          }),
          entry('water-ingress-testing', 'ok'),
          entry('load-planner', 'late'),
          entry('tt-density', 'failing'),
          entry('stock-check', 'on_request', { cadence: 'ON_DEMAND' }),
        ],
        28,
      ),
    });
    expect(h.health).toMatchObject({
      total: 4,
      running: 2,
      stopped: 1,
      lookAt: 1,
      needsYou: 0,
      status: 'problem',
    });
    expect(h.health!.first!.id).toBe('tt-density');
    expect(h.week).toBe(28);
    const dsr = h.groups[0]!.rows[0]!;
    expect(dsr.state?.id).toBe('working');
    expect(dsr.times.lastRan).toMatch(/^Last ran today/);
    expect(dsr.times.next).toBe('Next run Sat 28 Nov 7:05 am.');
  });

  it('counts EVERY state so the numbers under the headline add up to the services listed', () => {
    const h = hubOf({
      live: false,
      me: me([
        entry('dsr-report', 'ok'),
        entry('water-ingress-testing', 'ok'),
        entry('load-planner', 'late'),
        entry('tt-density', 'failing'),
        entry('du-otp-acknowledgement', 'held'),
        entry('stock-check', 'on_request', { cadence: 'ON_DEMAND' }),
        entry('ro-supply-status', 'on_request', { cadence: 'ON_DEMAND' }),
      ]),
    });
    const x = h.health!;
    expect(x).toMatchObject({
      total: 5,
      running: 2,
      lookAt: 1,
      stopped: 1,
      needsYou: 0,
      notYet: 1,
      onRequest: 2,
    });
    // running + needs you + look + stopped + getting ready + on request = every row listed.
    expect(x.running + x.needsYou + x.lookAt + x.stopped + x.notYet + x.onRequest).toBe(
      h.groups.flatMap((g) => g.rows).length,
    );
  });

  it('says every service runs only when all do', () => {
    const h = hubOf({
      me: me([entry('dsr-report', 'ok'), entry('water-ingress-testing', 'running')]),
    });
    expect(h.health).toMatchObject({ total: 2, running: 2, status: 'ok', first: null });
  });

  it("uses the newest report's own words as the row's result line", () => {
    const older = report('dsr_sales', { sentAt: '2026-11-26T01:35:00.000Z', headline: 'older' });
    const newer = report('dsr_variation', {
      sentAt: '2026-11-27T01:35:00.000Z',
      headline: 'newer words',
    });
    expect(newestOf([older, newer], ['dsr_sales', 'dsr_variation'])).toBe(newer);
    expect(resultLine(newer, true, 'en')).toBe('newer words');
    const withData = report('dsr_sales', { data: salesData({ soldL: 24_330 }) });
    expect(resultLine(withData, true, 'en')).toContain('24,330');
  });

  it('drops an owner-only report from a manager even if the server sent it', () => {
    const credit = report('credit_dod', { data: creditData() });
    const h = hubOf({
      me: me([entry('credit-dod-monitoring', 'ok')]),
      feed: feed({ reports: [credit] }),
      isOwner: false,
    });
    expect(ids(h)).toEqual([]);
    expect(h.cameToday).toBe(0);
  });
});

describe('the hub: needs you, feeds, Kavach', () => {
  it("lists the open tasks that belong to a service, late and oldest first, with the service's name", () => {
    const a = task({ kind: 'declarations', since: '2026-11-26T02:00:00.000Z' });
    const b = task({ kind: 'mock_drill', since: '2026-11-24T02:00:00.000Z' });
    const c = task({ kind: 'complaint', since: '2026-11-25T02:00:00.000Z', late: true });
    const setup = task({ kind: 'setup' });
    const h = hubOf({
      me: me([entry('dealer-declarations', 'ok')]),
      feed: feed({ tasks: [a, b, c, setup] }),
    });
    expect(h.needs.map((n) => n.task.id)).toEqual([c.id, b.id, a.id]);
    expect(h.needs.map((n) => n.serviceName)).toEqual([
      'Complaints',
      'Mock drill report',
      'IndianOil declarations',
    ]);
    expect(h.needs.map((n) => n.waitingDays)).toEqual([2, 3, 1]);
  });

  it('lists a paper photo ask under "Your papers" and a login box under "Your pump", but never the setup box', () => {
    const doc = task({
      kind: 'ask',
      title: 'Send the licence photo',
      action: { type: 'photo', askRef: 'doc:explosive-license', acceptsFile: false },
    });
    const login = task({ kind: 'portal_login', title: 'Send your IRAS login' });
    const setup = task({ kind: 'setup' });
    const h = hubOf({
      me: me([entry('dsr-report', 'ok')]),
      feed: feed({ tasks: [doc, login, setup] }),
    });
    expect(h.needs.map((n) => [n.task.id, n.serviceId, n.serviceName])).toEqual([
      [doc.id, 'papers', 'Your papers'],
      [login.id, 'pump', 'Your pump'],
    ]);
    // In Hindi too, never a raw id.
    const hi = hubOf({ lang: 'hi', feed: feed({ tasks: [doc] }) });
    expect(hi.needs[0]!.serviceName).toBe('आपके काग़ज़');
  });

  it('keeps a retired Kavach ask off the door while Kavach is off', () => {
    const kv = task({
      kind: 'ask',
      action: { type: 'photo', askRef: 'kv:abc', acceptsFile: false },
    });
    expect(hubOf({ feed: feed({ tasks: [kv] }) }).needs).toEqual([]);
    expect(hubOf({ feed: feed({ tasks: [kv] }), kavach: kavach({}) }).needs).toHaveLength(1);
  });

  it('does not list a manager an owner-only task', () => {
    const t = task({ kind: 'sign_letter' });
    expect(hubOf({ feed: feed({ tasks: [t] }), isOwner: false }).needs).toEqual([]);
    expect(hubOf({ feed: feed({ tasks: [t] }), isOwner: true }).needs).toHaveLength(1);
  });

  it('says "running" for the feeds only when the server said so and every one runs', () => {
    const running = hubOf({
      me: me([entry('iras-shift-data', 'ok'), entry('inspection-reports', 'running')]),
    });
    expect(running.feeds).toEqual({ n: 2, allRunning: true, stopped: 0 });
    const stopped = hubOf({
      me: me([entry('iras-shift-data', 'failing'), entry('inspection-reports', 'ok')]),
    });
    expect(stopped.feeds).toEqual({ n: 2, allRunning: false, stopped: 1 });
    const unknown = hubOf({ me: null, attachedIds: ['iras-shift-data'] });
    expect(unknown.feeds).toEqual({ n: 1, allRunning: false, stopped: 0 });
  });

  it('carries the Kavach score only while Kavach is on', () => {
    expect(hubOf({ kavach: kavach({ pct: 62 }) }).kavach).toEqual({ pct: 62 });
    expect(hubOf({ kavach: kavach({ on: false }) }).kavach).toBeNull();
    expect(hubOf({}).kavach).toBeNull();
  });

  it('counts the reports needing a look from the feed, for the Reports pill', () => {
    const h = hubOf({
      feed: feed({
        reports: [
          report('dsr_variation', { status: 'attention', data: variationData({ offL: 90 }) }),
        ],
      }),
    });
    expect(h.look).toBe(1);
  });

  it('counts whole India days a task has waited', () => {
    expect(waitingDaysOf('2026-11-27T02:00:00.000Z', NOW)).toBe(0);
    expect(waitingDaysOf('2026-11-25T20:00:00.000Z', NOW)).toBe(1); // 26 Nov 1:30 am India
    expect(waitingDaysOf('2026-11-20T02:00:00.000Z', NOW)).toBe(7);
  });
});
