import { describe, expect, it } from 'vitest';

import { makeSetupView, makeStrip } from '@/test/setupFixtures';
import type { PortalLoginState } from '@dk/shared/types';

import { heroShows, mdgIsWorking, refusedLogins, savedLogins, turnOf } from './heroView';

describe('when the setup hero shows', () => {
  it('only while the pump is on its way to live', () => {
    expect(heroShows(makeSetupView())).toBe(true);
    expect(heroShows(makeSetupView({ stage: 'watch' }))).toBe(true);
    expect(heroShows(makeSetupView({ stage: 'live' }))).toBe(false);
    expect(heroShows(makeSetupView({ stage: 'lost' }))).toBe(false);
    expect(heroShows(makeSetupView({ active: false }))).toBe(false);
    expect(heroShows(undefined)).toBe(false);
  });
});

describe('whose turn it is', () => {
  it('reads waitingOn: the owner sees "your turn", a manager sees the owner\'s', () => {
    expect(turnOf(makeSetupView({ waitingOn: 'dealer', canEdit: true }))).toBe('dealer');
    expect(turnOf(makeSetupView({ waitingOn: 'dealer', canEdit: false }))).toBe('owner');
    expect(turnOf(makeSetupView({ waitingOn: 'mdg' }))).toBe('mdg');
    expect(turnOf(makeSetupView({ waitingOn: 'nobody' }))).toBe('done');
  });

  it('is done for a value this app does not know', () => {
    expect(turnOf(makeSetupView({ waitingOn: 'someone-new' as never }))).toBe('done');
  });
});

describe('who is working the open step', () => {
  it("MDG's own step is MDG's, and a dealer step is too while the server waits on MDG", () => {
    const view = makeSetupView({ stage: 'setup', waitingOn: 'mdg', strip: makeStrip(['done', 'done', 'done', 'done', 'current']) });
    expect(mdgIsWorking(view, 'start')).toBe(true);
    expect(mdgIsWorking(makeSetupView({ waitingOn: 'dealer' }), 'billing')).toBe(false);
    expect(mdgIsWorking(makeSetupView({ waitingOn: 'mdg' }), 'payment')).toBe(true);
  });
});

describe('the logins', () => {
  const portals: PortalLoginState[] = [
    { portal: 'sdms', needed: true, status: 'saved', savedAt: '2026-11-12T05:00:00Z', savedBy: 'dealer' },
    { portal: 'iras', needed: true, status: 'refused', refusedAt: '2026-11-14T05:00:00Z' },
    { portal: 'sdmsOld', needed: false, status: 'saved' },
  ];

  it('lists the saved ones the setup asked for, in its order, and ignores the rest', () => {
    const saved = savedLogins(makeSetupView({ loginsNeeded: ['sdms', 'iras'] }), portals);
    expect(saved.map((p) => p.portal)).toEqual(['sdms']);
  });

  it('finds every refused login', () => {
    expect(refusedLogins(portals).map((p) => p.portal)).toEqual(['iras']);
    expect(refusedLogins([])).toEqual([]);
  });
});
