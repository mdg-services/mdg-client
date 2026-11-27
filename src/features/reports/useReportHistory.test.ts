import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/lib/api';

import {
  fetchReportHistory,
  fetchReportSummary,
  invalidateReports,
  reportHistoryKey,
  reportSummaryKey,
} from './useReportHistory';

afterEach(() => vi.restoreAllMocks());

describe('the history list: page size', () => {
  it('leaves the key and the request exactly as older callers know them when no limit is given', () => {
    expect(reportHistoryKey()).toEqual(['report-history', 'all']);
    expect(reportHistoryKey(['credit_dod'])).toEqual(['report-history', 'credit_dod']);
  });

  it('puts a limit in the key, so a page of ten never answers for a page of forty', () => {
    expect(reportHistoryKey(undefined, 10)).toEqual(['report-history', 'all', 10]);
    expect(reportHistoryKey(undefined, 10)).not.toEqual(reportHistoryKey());
  });

  it('asks for a limit only when one is given', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ items: [] } as never);
    await fetchReportHistory(undefined, ['dsr_sales'], 10);
    expect(get).toHaveBeenLastCalledWith('/v1/me/reports', { kinds: 'dsr_sales', limit: 10 });
    await fetchReportHistory('c1');
    expect(get).toHaveBeenLastCalledWith('/v1/me/reports', { cursor: 'c1' });
  });
});

describe('the 30-day summary', () => {
  it('asks for the last 30 days by default, and for the days it is given', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ since: 'x', byKind: {} } as never);
    await fetchReportSummary();
    expect(get).toHaveBeenLastCalledWith('/v1/me/reports/summary', { days: 30 });
    await fetchReportSummary(7);
    expect(get).toHaveBeenLastCalledWith('/v1/me/reports/summary', { days: 7 });
    expect(reportSummaryKey()).toEqual(['report-summary', 30]);
  });

  it('is marked out of date with the lists when a report arrives or changes', () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    invalidateReports(qc);
    expect(spy).toHaveBeenCalledWith({ queryKey: ['report-summary'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['report-history'] });
  });
});
