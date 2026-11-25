import { afterEach, describe, expect, it } from 'vitest';

import { resetEmbeddedForTests } from '@/lib/embedMode';

import {
  backgroundOf,
  homePath,
  openReportOptions,
  parseReportPath,
  readReportState,
  outletHintOf,
  reportDeepLink,
  reportPath,
} from './reportNav';

const loc = (over: Partial<Parameters<typeof openReportOptions>[0]> = {}) => ({
  pathname: '/chat/c1',
  search: '',
  hash: '',
  state: null as unknown,
  key: 'k1',
  ...over,
});

afterEach(() => {
  window.sessionStorage.removeItem('dk.embed');
  resetEmbeddedForTests();
});

describe('a report\'s address', () => {
  it('is /report/:conversationId/:messageId with both ids encoded', () => {
    expect(reportPath('c1', 'm1')).toBe('/report/c1/m1');
    expect(reportPath('a b', 'x/y')).toBe('/report/a%20b/x%2Fy');
  });

  it('reads the two ids back, and nothing else', () => {
    expect(parseReportPath('/report/c1/m1')).toEqual({ conversationId: 'c1', messageId: 'm1' });
    expect(parseReportPath('/report/c1/m1/')).toEqual({ conversationId: 'c1', messageId: 'm1' });
    expect(parseReportPath('/report/a%20b/x%2Fy')).toEqual({ conversationId: 'a b', messageId: 'x/y' });
    for (const bad of ['/report', '/report/c1', '/report/c1/m1/extra', '/chat/c1', '/reports', '/', '/report//m1']) {
      expect(parseReportPath(bad)).toBeNull();
    }
    // A broken escape is not an address.
    expect(parseReportPath('/report/%E0%A4%A/m1')).toBeNull();
  });
});

describe('readReportState — what an entry says about a report, checked', () => {
  it('keeps a well-formed screen behind and a well-formed row', () => {
    const row = { id: 'm1', kind: 'dsr_sales', messageId: 'm1', conversationId: 'c1' };
    const out = readReportState({
      backgroundLocation: { pathname: '/chat/c1', search: '?a=1', hash: '', state: { jumpToMessageId: 'x' }, key: 'abc' },
      report: row,
    });
    expect(out.backgroundLocation).toEqual({
      pathname: '/chat/c1',
      search: '?a=1',
      hash: '',
      state: { jumpToMessageId: 'x' },
      key: 'abc',
    });
    expect(out.report).toBe(row);
  });

  it('drops anything off: not an object, a path that is not ours, a screen that is itself a report, a row without ids', () => {
    expect(readReportState(null)).toEqual({});
    expect(readReportState('x')).toEqual({});
    expect(readReportState({ backgroundLocation: { pathname: 'https://evil.test/' } })).toEqual({});
    expect(readReportState({ backgroundLocation: { pathname: 42 } })).toEqual({});
    // A report behind a report would loop the router.
    expect(readReportState({ backgroundLocation: { pathname: '/report/c1/m1' } })).toEqual({});
    expect(readReportState({ report: { kind: 'dsr_sales' } })).toEqual({});
  });
});

describe('backgroundOf — the screen drawn under an overlay', () => {
  it('is null when the address is not a report\'s: the real location is drawn as always', () => {
    expect(backgroundOf({ pathname: '/chat/c1', state: null })).toBeNull();
    expect(backgroundOf({ pathname: '/', state: null })).toBeNull();
  });

  it('is the screen the opener left behind', () => {
    const bg = backgroundOf({
      pathname: '/report/c1/m1',
      state: { backgroundLocation: { pathname: '/chat/c1', search: '', hash: '', state: null, key: 'k' } },
    });
    expect(bg?.pathname).toBe('/chat/c1');
  });

  it('is Today when nothing was left behind (a push on a cold start, a pasted link)', () => {
    expect(backgroundOf({ pathname: '/report/c1/m1', state: null })?.pathname).toBe('/');
  });

  it('is the chat in the extension\'s panel, which has no Today', () => {
    window.sessionStorage.setItem('dk.embed', 'extension');
    resetEmbeddedForTests({ framed: true });
    expect(homePath()).toBe('/chat');
    expect(backgroundOf({ pathname: '/report/c1/m1', state: null })?.pathname).toBe('/chat');
  });
});

describe('openReportOptions — one entry per overlay', () => {
  it('PUSHES from a screen, and leaves that screen behind the overlay, with its own state', () => {
    const here = loc({ pathname: '/chat/c1', state: { jumpToMessageId: 'x' }, key: 'kk' });
    const opts = openReportOptions(here);
    expect(opts.replace).toBe(false);
    expect(opts.state).toEqual({
      backgroundLocation: { pathname: '/chat/c1', search: '', hash: '', state: { jumpToMessageId: 'x' }, key: 'kk' },
    });
  });

  it('carries the row the opener holds', () => {
    const row = { id: 'm1', messageId: 'm1', conversationId: 'c1', kind: 'dsr_sales' } as never;
    expect(openReportOptions(loc({ pathname: '/reports' }), row).state).toMatchObject({ report: row });
  });

  it('REPLACES from another overlay, and keeps the screen the dealer started on, not the overlay', () => {
    const bg = { pathname: '/reports', search: '', hash: '', state: null, key: 'r' };
    const opts = openReportOptions(loc({ pathname: '/report/c1/first', state: { backgroundLocation: bg, report: { x: 1 } } }));
    expect(opts.replace).toBe(true);
    expect(opts.state).toEqual({ backgroundLocation: bg });
  });

  it('remembers the message the first overlay was opened for, and keeps it through "See newer"', () => {
    const first = openReportOptions(loc({ pathname: '/chat/c1' }), undefined, 'm0');
    expect(first.state).toMatchObject({ openedFromMessageId: 'm0' });
    const bg = { pathname: '/chat/c1', search: '', hash: '', state: null, key: 'r' };
    const newer = openReportOptions(
      loc({ pathname: '/report/c1/m0', state: { backgroundLocation: bg, openedFromMessageId: 'm0' } }),
      undefined,
      'm1',
    );
    expect(newer.state).toEqual({ backgroundLocation: bg, openedFromMessageId: 'm0' });
    expect(readReportState(newer.state).openedFromMessageId).toBe('m0');
  });

  it('leaves no screen behind when an overlay that had none is replaced (a cold-opened report)', () => {
    const opts = openReportOptions(loc({ pathname: '/report/c1/first', state: null }));
    expect(opts.replace).toBe(true);
    expect(opts.state).toEqual({});
  });
});

describe('reportDeepLink — a push', () => {
  it('turns a report\'s address into a navigation over the current screen', () => {
    const out = reportDeepLink('/report/c1/m1', loc({ pathname: '/chat/c9' }));
    expect(out?.to).toBe('/report/c1/m1');
    expect(out?.options.replace).toBe(false);
    expect(out?.options.state).toMatchObject({ backgroundLocation: { pathname: '/chat/c9' } });
  });

  it('replaces an overlay that is already open', () => {
    const out = reportDeepLink('/report/c1/m2', loc({ pathname: '/report/c1/m1', state: null }));
    expect(out?.options.replace).toBe(true);
  });

  it('ignores any query it does not know, and any address that is not a report\'s', () => {
    expect(reportDeepLink('/report/c1/m1?utm=x&a=b', loc())?.to).toBe('/report/c1/m1');
    expect(reportDeepLink('/chat/c1', loc())).toBeNull();
    expect(reportDeepLink('/documents?ask=1', loc())).toBeNull();
    expect(reportDeepLink('density', loc())).toBeNull();
  });

  it('keeps the pump a push names (`?outlet=`) so the overlay can tell when it is not the pump signed in', () => {
    const out = reportDeepLink('/report/c1/m1?outlet=12E#x', loc());
    expect(out?.to).toBe('/report/c1/m1?outlet=12E');
    expect((out?.options.state as { outletCode?: string }).outletCode).toBe('12E');
  });

  it('drops a pump hint that is not a plain code (it goes into an address, so it is never trusted)', () => {
    expect(reportDeepLink('/report/c1/m1?outlet=12E%3Cscript%3E', loc())?.to).toBe('/report/c1/m1');
    expect(reportDeepLink('/report/c1/m1?outlet=', loc())?.to).toBe('/report/c1/m1');
  });
});

describe('outletHintOf', () => {
  it('reads the query first, then the entry state, and only a plain code', () => {
    expect(outletHintOf('?outlet=15E', null)).toBe('15E');
    expect(outletHintOf('', { outletCode: '16E' })).toBe('16E');
    expect(outletHintOf('?outlet=15E', { outletCode: '16E' })).toBe('15E');
    expect(outletHintOf('?outlet=a b', { outletCode: 5 })).toBeUndefined();
    expect(outletHintOf('', undefined)).toBeUndefined();
  });
});
