import { describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/api';
import { translate } from '@/lib/i18n';
import { PaperRejected } from '@/lib/uploadDuOtpPaper';
import { makeDuOtpEntry, makeDuOtpGroup } from '@/test/duOtpFixtures';
import { DU_OTP_STEPS } from '@dk/shared/types';

import {
  DU_OTP_STEP_COUNT,
  STEP_TITLE_KEY,
  calibrationDatesOf,
  duLine,
  duName,
  duOtpErrorText,
  formatDmy,
  groupFailure,
  nozzleText,
  nozzlesOf,
  otpDateOf,
  stepNumber,
  summariseRecent,
} from './duOtpView';

const en = (key: Parameters<typeof translate>[1], vars?: Parameters<typeof translate>[2]) =>
  translate('en', key, vars);

describe('stepNumber', () => {
  it('counts the five questions, and the review is none of them', () => {
    expect(DU_OTP_STEP_COUNT).toBe(5);
    expect(DU_OTP_STEPS.map((s) => stepNumber(s))).toEqual([1, 2, 3, 4, 5, null]);
  });

  it('has a title for every step the contract names', () => {
    for (const step of DU_OTP_STEPS) expect(STEP_TITLE_KEY[step]).toBeTruthy();
  });
});

describe('formatDmy', () => {
  it('writes a plain day as dd-mm-yyyy, with no time zone in it', () => {
    expect(formatDmy('2026-10-22')).toBe('22-10-2026');
    expect(formatDmy('2026-01-05')).toBe('05-01-2026');
  });

  it('writes a moment as the day it was in India', () => {
    // 22:30 UTC on the 4th is already 04:00 on the 5th in India.
    expect(formatDmy('2026-11-04T22:30:00.000Z')).toBe('05-11-2026');
    expect(formatDmy('2026-11-05T09:00:00.000Z')).toBe('05-11-2026');
  });

  it('is null for nothing, or for something that is not a date', () => {
    expect(formatDmy(null)).toBeNull();
    expect(formatDmy(undefined)).toBeNull();
    expect(formatDmy('')).toBeNull();
    expect(formatDmy('soon')).toBeNull();
  });
});

describe('the DU and its nozzles', () => {
  it('names the make and model, whichever there is', () => {
    expect(duName('Gilbarco', 'Encore 300')).toBe('Gilbarco Encore 300');
    expect(duName('Gilbarco', '')).toBe('Gilbarco');
    expect(duName(' ', ' ')).toBe('');
  });

  it('says which DU in one line, leaving out what is missing', () => {
    expect(duLine(en, { duMake: 'Gilbarco', duModel: 'Encore 300', duSerial: 'GB1' })).toBe(
      'DU Gilbarco Encore 300 · serial GB1',
    );
    expect(duLine(en, { duMake: 'Gilbarco', duModel: '', duSerial: '' })).toBe('DU Gilbarco');
    expect(duLine(en, { duMake: '', duModel: '', duSerial: 'GB1' })).toBe('serial GB1');
    expect(duLine(en, { duMake: '', duModel: '', duSerial: '' })).toBe('');
  });

  it('lists each nozzle once, in order', () => {
    const e = (nozzleNo: string) => makeDuOtpEntry({ nozzleNo });
    expect(nozzlesOf([e('2'), e('1'), e('2'), e(' ')])).toEqual(['2', '1']);
    expect(nozzleText(en, ['3'])).toBe('Nozzle 3');
    expect(nozzleText(en, ['1', '2'])).toBe('Nozzles 1, 2');
    expect(nozzleText(en, [])).toBe('');
  });

  it("gives an event's OTP date, or the printed text when it did not read", () => {
    expect(otpDateOf({ transactionDate: '2026-10-22', transactionDateText: '22-OCT-26' })).toBe('22-10-2026');
    expect(otpDateOf({ transactionDate: null, transactionDateText: ' 22-OCT-26 ' })).toBe('22-OCT-26');
  });

  it('gives each calibration date once', () => {
    const entries = [
      makeDuOtpEntry({ calibrationDate: '2026-10-22' }),
      makeDuOtpEntry({ calibrationDate: '2026-10-22' }),
      makeDuOtpEntry({ calibrationDate: null }),
      makeDuOtpEntry({ calibrationDate: '2026-10-25' }),
    ];
    expect(calibrationDatesOf({ entries })).toEqual(['22-10-2026', '25-10-2026']);
  });
});

describe('groupFailure', () => {
  it('is the first failed event that says why', () => {
    const group = makeDuOtpGroup({
      entries: [
        makeDuOtpEntry({ state: 'submitted', failure: 'old' }),
        makeDuOtpEntry({ state: 'failed', failure: '  ' }),
        makeDuOtpEntry({ state: 'failed', failure: ' Nozzle 2 was refused. ' }),
        makeDuOtpEntry({ state: 'failed', failure: 'Another.' }),
      ],
    });
    expect(groupFailure(group)).toBe('Nozzle 2 was refused.');
  });

  it('is null when nothing says', () => {
    expect(groupFailure(makeDuOtpGroup({ entries: [makeDuOtpEntry({ state: 'failed', failure: null })] }))).toBeNull();
  });
});

describe('summariseRecent', () => {
  it('folds the nozzles of one unit filed on one day into one line', () => {
    const lines = summariseRecent([
      makeDuOtpEntry({ id: 'a', state: 'submitted', nozzleNo: '1', submittedAt: '2026-11-05T09:00:00.000Z' }),
      makeDuOtpEntry({ id: 'b', state: 'submitted', nozzleNo: '2', submittedAt: '2026-11-05T09:01:00.000Z' }),
      makeDuOtpEntry({ id: 'c', state: 'submitted', nozzleNo: '2', submittedAt: '2026-11-05T09:02:00.000Z' }),
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ nozzles: ['1', '2'], state: 'submitted', date: '05-11-2026' });
  });

  it('keeps another unit, another day, or another outcome apart', () => {
    const lines = summariseRecent([
      makeDuOtpEntry({ id: 'a', state: 'submitted', submittedAt: '2026-11-05T09:00:00.000Z' }),
      makeDuOtpEntry({ id: 'b', state: 'submitted', submittedAt: '2026-11-04T09:00:00.000Z' }),
      makeDuOtpEntry({ id: 'c', state: 'submitted', duSerial: 'OTHER', submittedAt: '2026-11-05T09:00:00.000Z' }),
      makeDuOtpEntry({ id: 'd', state: 'gone', lastSeenAt: '2026-11-05T09:00:00.000Z' }),
    ]);
    expect(lines.map((l) => [l.duSerial, l.state, l.date])).toEqual([
      ['GB12345', 'submitted', '05-11-2026'],
      ['GB12345', 'submitted', '04-11-2026'],
      ['OTHER', 'submitted', '05-11-2026'],
      ['GB12345', 'gone', '05-11-2026'],
    ]);
  });

  it('skips anything that is not closed', () => {
    expect(summariseRecent([makeDuOtpEntry({ state: 'failed' }), makeDuOtpEntry({ state: 'pending' })])).toEqual([]);
  });
});

describe('duOtpErrorText', () => {
  it("gives the server's plain words for a refusal", () => {
    expect(duOtpErrorText(new ApiError(409, 'X', ' Already done. '), en, 'answer')).toBe('Already done.');
    expect(duOtpErrorText(new ApiError(403, 'X', 'Only the owner can do this'), en, 'paper')).toBe(
      'Only the owner can do this',
    );
  });

  it('keeps the server\'s own words for itself on a rate limit, a fault or no connection', () => {
    expect(duOtpErrorText(new ApiError(429, 'X', 'detail'), en, 'answer')).toBe('Try again in a little while');
    expect(duOtpErrorText(new ApiError(500, 'X', 'detail'), en, 'answer')).toBe("Couldn't save — try again");
    expect(duOtpErrorText(new ApiError(0, 'NETWORK_ERROR', 'Failed to fetch'), en, 'answer')).toBe(
      "Couldn't save — try again",
    );
    expect(duOtpErrorText(new ApiError(400, 'X', ''), en, 'answer')).toBe("Couldn't save — try again");
  });

  it('turns a refused pick and a failed upload into plain words', () => {
    expect(duOtpErrorText(new PaperRejected('type'), en, 'paper')).toBe('Choose a PDF or a photo (JPEG, PNG or WebP).');
    expect(duOtpErrorText(new PaperRejected('size'), en, 'paper')).toBe('That file is over 10 MB. Choose a smaller one.');
    expect(duOtpErrorText(new Error('Upload failed: 403 Forbidden'), en, 'paper')).toBe(
      'The upload did not go through. Check your network and try again.',
    );
  });
});
