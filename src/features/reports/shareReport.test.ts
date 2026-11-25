import { afterEach, describe, expect, it, vi } from 'vitest';

import { shareReportText } from './shareReport';

const copyText = vi.hoisted(() => vi.fn());
vi.mock('@/lib/clipboard', () => ({ copyText }));

const setShare = (fn: unknown) =>
  Object.defineProperty(navigator, 'share', { value: fn, configurable: true, writable: true });

afterEach(() => {
  copyText.mockReset();
  // jsdom has no share; leave it that way.
  delete (navigator as unknown as { share?: unknown }).share;
});

describe('shareReportText', () => {
  it('hands the text to the phone\'s share sheet when it has one', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setShare(share);
    expect(await shareReportText('  Diesel 412 L short  ', 'Stock variation')).toBe('shared');
    expect(share).toHaveBeenCalledWith({ text: 'Diesel 412 L short', title: 'Stock variation' });
    expect(copyText).not.toHaveBeenCalled();
  });

  it('says nothing when the dealer closes the sheet', async () => {
    setShare(vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'AbortError' })));
    expect(await shareReportText('hello')).toBe('cancelled');
    expect(copyText).not.toHaveBeenCalled();
  });

  it('copies instead when the sheet refuses for any other reason', async () => {
    setShare(vi.fn().mockRejectedValue(new Error('NotAllowedError')));
    copyText.mockResolvedValue(true);
    expect(await shareReportText('hello')).toBe('copied');
    expect(copyText).toHaveBeenCalledWith('hello');
  });

  it('copies when the phone has no share sheet (an Android app view)', async () => {
    copyText.mockResolvedValue(true);
    expect(await shareReportText('hello')).toBe('copied');
  });

  it('fails plainly when nothing worked, and for nothing to share', async () => {
    copyText.mockResolvedValue(false);
    expect(await shareReportText('hello')).toBe('failed');
    expect(await shareReportText('   ')).toBe('failed');
  });
});
