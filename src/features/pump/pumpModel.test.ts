import { describe, expect, it } from 'vitest';

import type { LoginRow } from '@/features/logins/types';
import { makePayment } from '@/test/payments';
import type { ResolvedDealerProfileField } from '@dk/shared';
import type { DealerDocumentAskRow, MeServiceEntry, MeServicesView, User } from '@dk/shared/types';

import {
  billHealth,
  filedPapers,
  helpGroups,
  helpProgress,
  joinNames,
  licencePapers,
  longDay,
  loginsHealth,
  lookNames,
  mergePapers,
  oilCompanyLabel,
  paperCounts,
  outletValue,
  papersHealth,
  pumpIdentity,
  servicesHealth,
  sortPapers,
  teamHealth,
  teamState,
} from './pumpModel';

/** 12:00 India time on Fri 27 Nov 2026: every "days left" below is counted from here. */
const NOW = new Date('2026-11-27T06:30:00.000Z');

const field = (key: string, over: Partial<ResolvedDealerProfileField> = {}): ResolvedDealerProfileField =>
  ({
    key,
    label: key,
    group: 'business',
    kind: 'text',
    value: '',
    maxLength: 100,
    dealerVisible: true,
    custom: false,
    ...over,
  }) as ResolvedDealerProfileField;

const filed = (over: Partial<DealerDocumentAskRow> = {}): DealerDocumentAskRow =>
  ({
    id: 'a1',
    titleEn: 'Fire NOC',
    titleHi: 'फायर एनओसी',
    periodLabel: 'Nov 2026',
    ...over,
  }) as DealerDocumentAskRow;

describe('the pump\'s identity is looked up by key', () => {
  const fields = [
    field('pumpName', { value: 'Sharma Fuels' }),
    field('oilCompanyName', { value: 'Indian Oil' }),
    field('pumpSapCode', { value: '1234567' }),
    field('gstin', { value: '22AAAAA0000A1Z5' }),
  ];

  it('reads the name, the oil company and the SAP code, wherever they are in the list', () => {
    expect(pumpIdentity([...fields].reverse())).toEqual({
      name: 'Sharma Fuels',
      oilCompany: 'Indian Oil',
      sapCode: '1234567',
    });
  });

  it('leaves out a key the file does not have: nothing is written as if it were fixed', () => {
    expect(pumpIdentity([field('pumpName', { value: 'Sharma Fuels' })])).toEqual({ name: 'Sharma Fuels' });
    expect(pumpIdentity([])).toEqual({});
    expect(pumpIdentity(undefined)).toEqual({});
  });

  it('treats an empty or blank value as missing', () => {
    expect(outletValue([field('pumpName', { value: '   ' })], 'pumpName')).toBeUndefined();
    expect(outletValue([field('pumpName', { value: ' Sharma ' })], 'pumpName')).toBe('Sharma');
  });
});

describe('licences: the days are counted again from the date', () => {
  it('counts 9 days from the date, and the stricter of the two words wins', () => {
    const [fire] = licencePapers(
      [field('explosiveLicenceNo', { expiresOn: '2026-12-06', expiryState: 'valid' })],
      NOW,
    );
    expect(fire).toMatchObject({ days: 9, state: 'expiring', until: '2026-12-06', titleKey: 'pump.licence.explosive' });
  });

  it('says expired when the date has gone, even if the server said valid a day ago', () => {
    const [p] = licencePapers([field('wmLicenceNo', { expiresOn: '2026-11-26', expiryState: 'valid' })], NOW);
    expect(p).toMatchObject({ days: -1, state: 'expired' });
  });

  it('trusts the server when it says expired and the date is still in the future (the stricter word)', () => {
    const [p] = licencePapers([field('wmLicenceNo', { expiresOn: '2027-06-01', expiryState: 'expired' })], NOW);
    expect(p?.state).toBe('expired');
  });

  it('calls a date far away valid', () => {
    const [p] = licencePapers([field('dtoTradeLicenceNo', { expiresOn: '2027-06-01' })], NOW);
    expect(p).toMatchObject({ state: 'valid', days: 186 });
  });

  it('never calls an unreadable date valid', () => {
    const [p] = licencePapers([field('wmLicenceNo', { expiresOn: 'soon' })], NOW);
    expect(p?.state).toBe('onFile');
  });

  it('draws only the fields that carry a date', () => {
    expect(licencePapers([field('pumpName', { value: 'x' })], NOW)).toEqual([]);
  });
});

describe('papers MDG accepted', () => {
  it('counts days from the date and keeps the sooner of the two verdicts', () => {
    const [p] = filedPapers([filed({ validUntil: '2026-12-06', validityState: 'expiring', daysToExpiry: 99 })], NOW);
    expect(p).toMatchObject({ days: 9, state: 'expiring', until: '2026-12-06' });
  });

  it('takes the server\'s "expiring" word, because its window is the server\'s to decide', () => {
    const [p] = filedPapers([filed({ validUntil: '2027-01-20', validityState: 'expiring' })], NOW);
    expect(p?.state).toBe('expiring');
  });

  it('a paper with no end date is simply on file, with its period in words', () => {
    const [p] = filedPapers([filed({ titleEn: 'Density register', periodLabel: 'Nov 2026' })], NOW);
    expect(p).toMatchObject({ state: 'onFile', days: null, period: 'Nov 2026' });
  });

  it('is expired once the date has gone', () => {
    const [p] = filedPapers([filed({ validUntil: '2026-11-20' })], NOW);
    expect(p).toMatchObject({ state: 'expired', days: -7 });
  });

  it('falls back to Hindi-less rows without breaking: no Hindi title means the English one', () => {
    const [p] = filedPapers([filed({ titleHi: '' })], NOW);
    expect(p?.titleHi).toBe('Fire NOC');
  });
});

describe('papersHealth: the worst paper, in one line', () => {
  const lic = (key: string, expiresOn: string) =>
    licencePapers([field(key, { expiresOn })], NOW)[0]!;

  it('says "all valid" only when something dated is valid', () => {
    expect(papersHealth([lic('wmLicenceNo', '2027-06-01')])).toEqual({ kind: 'valid', status: 'ok' });
  });

  it('never says "all valid" for papers that have no end date', () => {
    const [onFile] = filedPapers([filed({})], NOW);
    expect(papersHealth([onFile!])).toEqual({ kind: 'none', status: 'info' });
    expect(papersHealth([])).toEqual({ kind: 'none', status: 'info' });
  });

  it('names the one ending soonest: "Fire NOC in 9 days"', () => {
    const h = papersHealth([
      lic('wmLicenceNo', '2027-06-01'),
      ...filedPapers([filed({ validUntil: '2026-12-06', validityState: 'expiring' })], NOW),
    ]);
    expect(h).toMatchObject({ kind: 'days', status: 'attention', days: 9 });
    expect(h.kind === 'days' && h.item.titleEn).toBe('Fire NOC');
  });

  it('puts an expired paper before one that is only ending soon', () => {
    const h = papersHealth([lic('dtoTradeLicenceNo', '2026-12-01'), lic('wmLicenceNo', '2026-11-01')]);
    expect(h).toMatchObject({ kind: 'expired', status: 'problem' });
  });

  it('says "ends today" at zero days, not "0 days left"', () => {
    expect(papersHealth([lic('wmLicenceNo', '2026-11-27')])).toMatchObject({ kind: 'today', status: 'attention' });
  });

  it('sorts expired, ending soon, valid, then on file, the soonest first inside each', () => {
    const items = sortPapers([
      lic('wmLicenceNo', '2027-06-01'),
      lic('dtoTradeLicenceNo', '2026-12-20'),
      lic('explosiveLicenceNo', '2026-12-01'),
      ...filedPapers([filed({})], NOW),
    ]);
    expect(items.map((i) => i.state)).toEqual(['expiring', 'expiring', 'valid', 'onFile']);
    expect(items.map((i) => i.days)).toEqual([4, 23, 186, null]);
  });
});

describe('loginsHealth', () => {
  const row = (over: Partial<LoginRow>): LoginRow => ({
    portal: 'sdms',
    name: 'SDMS',
    needed: true,
    status: 'saved',
    history: [],
    ...over,
  });

  it('counts "2 of 2 working" when every login that is needed is saved', () => {
    expect(loginsHealth([row({}), row({ portal: 'iras', name: 'IRAS' })])).toEqual({
      kind: 'ok',
      status: 'ok',
      working: 2,
      total: 2,
    });
  });

  it('a refused password is a problem, named', () => {
    expect(loginsHealth([row({}), row({ portal: 'iras', name: 'IRAS', status: 'refused' })])).toMatchObject({
      kind: 'refused',
      status: 'problem',
      names: ['IRAS'],
      working: 1,
      total: 2,
    });
  });

  it('a refused password outranks a missing one', () => {
    const h = loginsHealth([
      row({ portal: 'iras', name: 'IRAS', status: 'missing' }),
      row({ portal: 'bpcl', name: 'BPCL', status: 'refused' }),
    ]);
    expect(h.kind).toBe('refused');
  });

  it('a needed login that is not added needs a look', () => {
    expect(loginsHealth([row({}), row({ portal: 'iras', name: 'IRAS', status: 'missing' })])).toMatchObject({
      kind: 'missing',
      status: 'attention',
      names: ['IRAS'],
    });
  });

  it('a missing login no service needs is not a fault and is not counted', () => {
    expect(loginsHealth([row({}), row({ portal: 'iras', name: 'IRAS', status: 'missing', needed: false })])).toMatchObject({
      kind: 'ok',
      total: 1,
    });
  });

  it('nothing needed at all is said calmly', () => {
    expect(loginsHealth([])).toEqual({ kind: 'empty', status: 'info' });
    expect(loginsHealth([row({ status: 'missing', needed: false })])).toEqual({ kind: 'empty', status: 'info' });
  });
});

describe('team', () => {
  const user = (over: Partial<User>): User =>
    ({ id: 'u2', name: 'M', role: 'dealer-staff', status: 'ACTIVE', ...over }) as User;

  it('paused beats everything; never signed in is its own word; else active', () => {
    expect(teamState({ status: 'SUSPENDED', lastLoginAt: '2026-11-20T00:00:00.000Z' })).toBe('paused');
    expect(teamState({ status: 'ACTIVE' })).toBe('notYet');
    expect(teamState({ status: 'ACTIVE', lastLoginAt: '2026-11-20T00:00:00.000Z' })).toBe('active');
  });

  it('counts "2 managers, 1 not signed in yet" without counting the owner himself', () => {
    const h = teamHealth(
      [
        user({ id: 'me', role: 'dealer-owner', lastLoginAt: '2026-11-27T00:00:00.000Z' }),
        user({ id: 'a', lastLoginAt: '2026-11-26T00:00:00.000Z' }),
        user({ id: 'b' }),
      ],
      'me',
    );
    expect(h).toMatchObject({ others: 2, managers: 2, partners: 0, notYet: 1, status: 'info' });
  });

  it('a partner is counted as a partner, and a quiet team is "ok"', () => {
    const h = teamHealth(
      [
        user({ id: 'me', role: 'dealer-owner' }),
        user({ id: 'p', role: 'dealer-owner', lastLoginAt: '2026-11-26T00:00:00.000Z' }),
      ],
      'me',
    );
    expect(h).toMatchObject({ others: 1, managers: 0, partners: 1, notYet: 0, status: 'ok' });
  });

  it('being alone is a plain fact, not "ok"', () => {
    expect(teamHealth([user({ id: 'me', role: 'dealer-owner' })], 'me').status).toBe('info');
  });
});

describe('servicesHealth', () => {
  const svc = (serviceId: string, run: MeServiceEntry['run']): MeServiceEntry =>
    ({ serviceId, run, cadence: 'DAILY' }) as MeServiceEntry;
  const view = (services: MeServiceEntry[]): MeServicesView =>
    ({ asOf: '2026-11-27T00:00:00.000Z', services, week: { since: '2026-11-20', total: 0, byKind: {} } }) as MeServicesView;

  it('counts the ones running (ok, running, on request) as "9 running"', () => {
    const h = servicesHealth(view([svc('dsr-report', 'ok'), svc('water-ingress', 'running'), svc('stock-check', 'on_request')]), 'dealer-owner');
    expect(h).toMatchObject({ running: 3, look: 0, total: 3, kind: 'ok', status: 'ok' });
  });

  it('a failing, late or held service needs a look', () => {
    const h = servicesHealth(view([svc('dsr-report', 'ok'), svc('water-ingress', 'failing'), svc('stock-check', 'held')]), 'dealer-owner');
    expect(h).toMatchObject({ running: 1, look: 2, kind: 'look', status: 'attention' });
  });

  it('only services that have not run yet read as "getting ready"', () => {
    const h = servicesHealth(view([svc('dsr-report', 'new')]), 'dealer-owner');
    expect(h).toMatchObject({ getting: 1, running: 0, kind: 'ready', status: 'info' });
  });

  it('a manager never counts the owner-only services; nobody counts a background one', () => {
    const entries = [svc('dsr-report', 'ok'), svc('credit-dod-monitoring', 'ok'), svc('iras-password-reset', 'ok')];
    expect(servicesHealth(view(entries), 'dealer-staff').total).toBe(1);
    expect(servicesHealth(view(entries), 'dealer-owner').total).toBe(2);
  });

  it('no service at all is its own plain answer', () => {
    expect(servicesHealth(view([]), 'dealer-owner').kind).toBe('none');
  });
});

describe('billHealth: days only, never an amount', () => {
  const due = (dueDate: string | null, over = {}) => makePayment({ status: 'due', dueDate, ...over });

  it('counts the days to the soonest open bill: "due in 12 days"', () => {
    expect(billHealth([due('2026-12-09')], NOW)).toEqual({ kind: 'due', status: 'ok', days: 12, date: '2026-12-09' });
  });

  it('is a thing to look at from three days out', () => {
    expect(billHealth([due('2026-11-30')], NOW)).toEqual({ kind: 'due', status: 'attention', days: 3, date: '2026-11-30' });
  });

  it('says due today, and days late', () => {
    expect(billHealth([due('2026-11-27')], NOW)).toEqual({ kind: 'today', status: 'attention' });
    expect(billHealth([due('2026-11-25')], NOW)).toEqual({ kind: 'late', status: 'attention', days: 2, date: '2026-11-25' });
  });

  it('takes the soonest of several open bills', () => {
    expect(billHealth([due('2026-12-20', { id: 'b' }), due('2026-12-05', { id: 'a' })], NOW)).toMatchObject({ days: 8 });
  });

  it('an open bill with no date is "a bill is open"', () => {
    expect(billHealth([due(null)], NOW)).toEqual({ kind: 'open', status: 'info' });
  });

  it('nothing open, or only paid ones, is "no bill is open"', () => {
    expect(billHealth([], NOW)).toEqual({ kind: 'none', status: 'ok' });
    expect(billHealth([makePayment({ status: 'paid' })], NOW)).toEqual({ kind: 'none', status: 'ok' });
  });

  it('carries no amount in what it returns', () => {
    const { date, ...rest } = billHealth([due('2026-12-09')], NOW) as { date: string };
    expect(date).toBe('2026-12-09');
    expect(JSON.stringify(rest)).not.toMatch(/amount|paise|\d{4,}/);
  });
});

describe('help: grouped, with ticks', () => {
  const v = (id: string, service: string | null = null) => ({ id, service });
  const known = (mine: string[], more: string[], watched: string[]) => ({
    mine: new Set(mine),
    more: new Set(more),
    watched: new Set(watched),
  });

  it('puts his services first, then how the app works, then the other services', () => {
    const groups = helpGroups(
      [v('tour'), v('water', 'water-ingress'), v('dsr', 'dsr')],
      known(['dsr'], ['water'], []),
    );
    expect(groups.map((g) => g.id)).toEqual(['mine', 'general', 'more']);
    expect(groups.map((g) => g.rows.map((r) => r.video.id))).toEqual([['dsr'], ['tour'], ['water']]);
  });

  it('a service video that is on neither of his lists still goes under "other services", not "how the app works"', () => {
    const groups = helpGroups([v('newone', 'stock-check')], known([], [], []));
    expect(groups.map((g) => g.id)).toEqual(['more']);
  });

  it('leaves a group out when it has no video', () => {
    expect(helpGroups([v('tour')], known([], [], [])).map((g) => g.id)).toEqual(['general']);
  });

  it('with no list of his own, one plain group and no ticks: nothing is guessed', () => {
    const groups = helpGroups([v('tour'), v('dsr', 'dsr')], null);
    expect(groups.map((g) => g.id)).toEqual(['all']);
    expect(groups[0]!.rows.every((r) => !r.watched && !r.tracked)).toBe(true);
  });

  it('keeps a video out of the list when another row already plays it', () => {
    const groups = helpGroups([v('tour'), v('whats_new_today')], known([], [], []), ['whats_new_today']);
    expect(groups.flatMap((g) => g.rows.map((r) => r.video.id))).toEqual(['tour']);
  });

  it('counts "6 of 13 watched, next: ..." over the videos that keep a tick', () => {
    const groups = helpGroups(
      [v('tour'), v('a', 'dsr'), v('b', 'dsr'), v('c', 'water-ingress')],
      known(['a', 'b'], ['c'], ['a']),
    );
    expect(helpProgress(groups)).toEqual({ done: 1, total: 3, next: v('b', 'dsr') });
  });

  it('has no next once everything that keeps a tick is watched', () => {
    const groups = helpGroups([v('a', 'dsr')], known(['a'], [], ['a']));
    expect(helpProgress(groups)).toEqual({ done: 1, total: 1, next: null });
  });

  it('counts nothing when nothing keeps a tick', () => {
    expect(helpProgress(helpGroups([v('tour')], known([], [], [])))).toEqual({ done: 0, total: 0, next: null });
  });
});

describe('longDay: a date with its year', () => {
  it('writes the year, so a licence good until December is never read as this year\'s', () => {
    expect(longDay('2027-12-31', 'en')).toMatch(/2027/);
    expect(longDay('2026-12-09', 'hi')).not.toMatch(/॰/);
  });

  it('writes the month in full in Hindi (दिसंबर, not दिस), short in English and Hinglish', () => {
    expect(longDay('2026-12-09', 'hi')).toBe('9 दिसंबर 2026');
    expect(longDay('2026-12-09', 'en')).toBe('9 Dec 2026');
    expect(longDay('2026-12-09', 'hl')).toBe('9 Dec 2026');
  });

  it('gives back what it cannot read', () => {
    expect(longDay('soon', 'en')).toBe('soon');
  });
});

describe('mergePapers: each paper once', () => {
  const lic = (key: string, expiresOn: string, state?: 'expired' | 'expiring' | 'valid') =>
    licencePapers([field(key, { expiresOn, ...(state ? { expiryState: state } : {}) })], NOW);
  const accepted = (kindCode: string, over: Partial<DealerDocumentAskRow> = {}) =>
    filedPapers([filed({ kindCode, ...over })], NOW);

  it('gives a licence both lists carry one row, named once, and marks it as accepted', () => {
    const m = mergePapers(lic('wmLicenceNo', '2026-12-06'), accepted('wm-licence', { validUntil: '2026-12-06', validityState: 'expiring' }));
    expect(m.licences).toHaveLength(1);
    expect(m.licences[0]).toMatchObject({ accepted: true, field: 'wmLicenceNo', kindCode: 'wm-licence' });
    expect(m.other).toEqual([]);
    expect(m.all).toHaveLength(1);
  });

  it('takes the LATER end date: a renewal MDG accepted replaces the older date of the outlet file', () => {
    const m = mergePapers(lic('wmLicenceNo', '2026-11-20'), accepted('wm-licence', { validUntil: '2027-11-20', validityState: 'valid' }));
    expect(m.licences[0]).toMatchObject({ state: 'valid', until: '2027-11-20', days: 358, accepted: true });
  });

  it('keeps the outlet file\'s date when it is the later one, or the accepted paper has none', () => {
    const later = mergePapers(lic('wmLicenceNo', '2027-11-20'), accepted('wm-licence', { validUntil: '2026-12-06', validityState: 'expiring' }));
    expect(later.licences[0]).toMatchObject({ until: '2027-11-20', state: 'valid' });
    const undated = mergePapers(lic('wmLicenceNo', '2026-12-06'), accepted('wm-licence', {}));
    expect(undated.licences[0]).toMatchObject({ until: '2026-12-06', state: 'expiring', accepted: true });
  });

  it('gives a Fire NOC (no outlet-file row) and other kinds to the "other" list, one Fire NOC only', () => {
    const fire = filedPapers(
      [
        filed({ id: 'old', kindCode: 'fire-noc', validUntil: '2026-06-01', validityState: 'expired' }),
        filed({ id: 'new', kindCode: 'fire-noc', validUntil: '2027-06-01', validityState: 'valid' }),
        filed({ id: 'reg1', kindCode: 'register-page', titleEn: 'Density register' }),
        filed({ id: 'reg2', kindCode: 'register-page', titleEn: 'Density register', periodLabel: 'Dec 2026' }),
      ],
      NOW,
    );
    const m = mergePapers([], fire);
    expect(m.licences).toEqual([]);
    expect(m.other.map((o) => o.id)).toEqual(['filed:new', 'filed:reg1', 'filed:reg2']);
  });

  it('names a licence by ONE label whichever list it came from', () => {
    const m = mergePapers(lic('wmLicenceNo', '2027-09-01'), accepted('wm-licence', { titleHi: 'नाप-तौल लाइसेंस' }));
    expect(m.licences[0]?.titleKey).toBe('pump.licence.wm');
    const fire = mergePapers([], accepted('fire-noc', { titleHi: 'अग्निशमन' }));
    expect(fire.other[0]?.titleKey).toBe('pump.licence.fire');
  });

  it('counts the papers by state and leaves out the undated ones', () => {
    const m = mergePapers(
      [...lic('dtoTradeLicenceNo', '2026-11-01'), ...lic('explosiveLicenceNo', '2026-12-06'), ...lic('wmLicenceNo', '2027-09-01')],
      filedPapers([filed({ kindCode: 'register-page' })], NOW),
    );
    expect(paperCounts(m.all)).toEqual({ expired: 1, expiring: 1, valid: 1 });
  });
});

describe('words: the oil company, joined names, services that need a look', () => {
  const t = ((key: string) => (key === 'pump.join.and' ? 'and' : key)) as never;

  it('joins names the way a sentence does', () => {
    expect(joinNames(['IRAS'], t)).toBe('IRAS');
    expect(joinNames(['IRAS', 'SDMS'], t)).toBe('IRAS and SDMS');
    expect(joinNames(['IRAS', 'SDMS', 'WEMMIS'], t)).toBe('IRAS, SDMS and WEMMIS');
    expect(joinNames([], t)).toBe('');
  });

  it('maps what was typed to the company\'s name key, and leaves an unknown company as typed', () => {
    const key = ((k: string) => k) as never;
    for (const typed of ['IOCL', 'Indian Oil', 'indianoil']) expect(oilCompanyLabel(typed, key)).toBe('pump.oil.iocl');
    expect(oilCompanyLabel('BPCL', key)).toBe('pump.oil.bpcl');
    expect(oilCompanyLabel('Hindustan Petroleum', key)).toBe('pump.oil.hpcl');
    expect(oilCompanyLabel('Nayara', key)).toBe('pump.oil.nayara');
    expect(oilCompanyLabel('Some Local Oil', key)).toBe('Some Local Oil');
  });

  it('names at most three services that need a look, never a raw id', () => {
    const names = lookNames(['dsr-report', 'stock-check', 'credit-dod-monitoring', 'load-planner', 'no-such-service'], 'en');
    expect(names).toHaveLength(3);
    expect(names.join(' ')).not.toMatch(/dsr-report|stock-check/);
  });
});
