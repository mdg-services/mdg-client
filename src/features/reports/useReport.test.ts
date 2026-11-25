import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { ApiError, api } from '@/lib/api';
import type { TodayReport } from '@dk/shared/types';


import { fetchReport, placeholderDetail, reportKey, reportLoadProblem } from './useReport';
import { fetchReportHistory, historyItems, invalidateReports, reportHistoryKey } from './useReportHistory';

const row = (id: string): TodayReport => ({
  id,
  kind: 'water_ingress',
  status: 'ok',
  sentAt: '2026-11-24T05:00:00.000Z',
  headline: 'Water checks',
  attachments: [],
  conversationId: 'c1',
  messageId: id,
});

describe('reportLoadProblem: why a report would not open', () => {
  it('reads 410 as gone and 404 as not available, and a stalled link as offline', () => {
    expect(reportLoadProblem(new ApiError(410, 'REPORT_GONE', 'gone'))).toBe('gone');
    expect(reportLoadProblem(new ApiError(404, 'REPORT_NOT_AVAILABLE', 'no'))).toBe('not_available');
    expect(reportLoadProblem(new ApiError(0, 'TIMEOUT', 'Request timed out'))).toBe('offline');
    expect(reportLoadProblem(new TypeError('Failed to fetch'))).toBe('offline');
    expect(reportLoadProblem(new ApiError(500, 'INTERNAL', 'x'))).toBe('other');
    expect(reportLoadProblem('weird')).toBe('other');
  });
});

describe('placeholderDetail', () => {
  it('shows a row the caller holds as the first frame, with no live state yet', () => {
    const d = placeholderDetail(row('m1'));
    expect(d).toMatchObject({ messageId: 'm1', kind: 'water_ingress', live: {} });
  });
});

describe('the cache keys', () => {
  it('keys a report by its message, and a history list by its kinds in any order', () => {
    expect(reportKey('m1')).toEqual(['report', 'm1']);
    expect(reportHistoryKey()).toEqual(['report-history', 'all']);
    expect(reportHistoryKey([])).toEqual(['report-history', 'all']);
    expect(reportHistoryKey(['ro_supply', 'credit_dod'])).toEqual(reportHistoryKey(['credit_dod', 'ro_supply']));
    expect(reportHistoryKey(['credit_dod'])).not.toEqual(reportHistoryKey());
  });
});

describe('historyItems', () => {
  it('flattens the pages in order and lists a report once, even if two pages overlap', () => {
    const items = historyItems([
      { items: [row('a'), row('b')], nextCursor: 'x' },
      { items: [row('b'), row('c')] },
    ]);
    expect(items.map((i) => i.messageId)).toEqual(['a', 'b', 'c']);
    expect(historyItems(undefined)).toEqual([]);
  });
});

describe('invalidateReports', () => {
  it('marks the open overlays and every history list out of date', () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    invalidateReports(qc);
    expect(spy).toHaveBeenCalledWith({ queryKey: ['report'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['report-history'] });
  });
});

describe('the two calls', () => {
  it('asks for one report by its message id', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({} as never);
    await fetchReport('6b056c56b47d84008a28ad15');
    expect(get).toHaveBeenCalledWith('/v1/me/reports/6b056c56b47d84008a28ad15');
    get.mockRestore();
  });

  it('asks for a history page with the marker and the kinds, and leaves both out when there are none', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ items: [] } as never);
    await fetchReportHistory(undefined);
    expect(get).toHaveBeenLastCalledWith('/v1/me/reports', {});
    await fetchReportHistory('abc', ['credit_dod', 'ledger_watch']);
    expect(get).toHaveBeenLastCalledWith('/v1/me/reports', { cursor: 'abc', kinds: 'credit_dod,ledger_watch' });
    await fetchReportHistory(undefined, []);
    expect(get).toHaveBeenLastCalledWith('/v1/me/reports', {});
    get.mockRestore();
  });
});
