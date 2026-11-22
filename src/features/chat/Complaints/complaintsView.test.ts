import { describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/api';
import { translate } from '@/lib/i18n';
import { makeComplaintView, makeComplaintsMe } from '@/test/complaintsFixtures';

import { cleanNumber, complaintOf, complaintsErrorText, isLiveBox, stepTime } from './complaintsView';

const t = (key: Parameters<typeof translate>[1]) => translate('en', key);

describe('complaintsView', () => {
  it('finds a complaint by id, or null', () => {
    const data = makeComplaintsMe(makeComplaintView({ id: 'a' }), makeComplaintView({ id: 'b' }));
    expect(complaintOf(data, 'b')?.id).toBe('b');
    expect(complaintOf(data, 'z')).toBeNull();
    expect(complaintOf(undefined, 'a')).toBeNull();
  });

  it('is the live box only on the message the view names', () => {
    expect(isLiveBox(makeComplaintView({ liveMessageId: 'm1' }), 'm1')).toBe(true);
    expect(isLiveBox(makeComplaintView({ liveMessageId: 'm1' }), 'm2')).toBe(false);
    expect(isLiveBox(makeComplaintView({ liveMessageId: undefined }), 'm1')).toBe(false);
    expect(isLiveBox(null, 'm1')).toBe(false);
  });

  it('accepts only plain numbers', () => {
    expect(cleanNumber(' 12 ')).toBe('12');
    expect(cleanNumber('1,250.5')).toBe('1250.5');
    expect(cleanNumber('12.')).toBeNull();
    expect(cleanNumber('abc')).toBeNull();
    expect(cleanNumber('')).toBeNull();
  });

  it('writes a step time in India time, with the day when it is not today', () => {
    expect(stepTime(undefined, 'en')).toBeNull();
    expect(stepTime('nonsense', 'en')).toBeNull();
    expect(stepTime('2020-01-05T10:00:00.000Z', 'en')).toMatch(/5 Jan/);
  });

  it('turns a refusal into plain words', () => {
    expect(complaintsErrorText(new ApiError(422, 'bad', 'Plain sentence.'), t)).toBe('Plain sentence.');
    expect(complaintsErrorText(new ApiError(500, 'x', 'boom'), t)).toBe(t('chat.portalSaveFailed'));
    expect(complaintsErrorText(new ApiError(429, 'x', 'slow'), t)).toBe(t('chat.portalRateLimited'));
    expect(complaintsErrorText(new Error('net'), t)).toBe(t('chat.portalSaveFailed'));
  });
});
