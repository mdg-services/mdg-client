import { describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/api';
import { translate } from '@/lib/i18n';
import { PhotoRejected } from '@/lib/uploadMockDrillPhoto';
import type { WorkPermitDealerView, WorkPermitsMeView } from '@dk/shared/types';

import { isLiveBox, permitWhen, typedAnswer, workPermitOf, workPermitsErrorText } from './workPermitsView';

const t = (key: Parameters<typeof translate>[1]) => translate('en', key);

function view(over: Partial<WorkPermitDealerView> = {}): WorkPermitDealerView {
  return {
    id: 'p1',
    title: { en: 'Engineer visit' },
    stage: 'drafting',
    screen: 'asking',
    statusLine: { en: '' },
    hasPdf: false,
    hasLetter: false,
    canCancel: true,
    canFinish: false,
    updatedAt: '2026-11-22T10:00:00.000Z',
    ...over,
  } as WorkPermitDealerView;
}

describe('workPermitsView', () => {
  it('finds a permit by id, or null', () => {
    const data: WorkPermitsMeView = { permits: [view({ id: 'a' }), view({ id: 'b' })] };
    expect(workPermitOf(data, 'b')?.id).toBe('b');
    expect(workPermitOf(data, 'z')).toBeNull();
    expect(workPermitOf(undefined, 'a')).toBeNull();
  });

  it('is the live box only on the message the view names', () => {
    expect(isLiveBox(view({ liveMessageId: 'm1' }), 'm1')).toBe(true);
    expect(isLiveBox(view({ liveMessageId: 'm1' }), 'm2')).toBe(false);
    expect(isLiveBox(view(), 'm1')).toBe(false);
    expect(isLiveBox(null, 'm1')).toBe(false);
  });

  it('cleans typed answers', () => {
    expect(typedAnswer('  ', 'text')).toBeNull();
    expect(typedAnswer(' Ravi Kumar ', 'text')).toBe('Ravi Kumar');
    expect(typedAnswer('0010 253 490', 'number')).toBe('0010253490');
    expect(typedAnswer('12ab', 'number')).toBeNull();
  });

  it('writes the time in India, without the day when it is today', () => {
    const now = new Date('2026-11-22T08:00:00Z');
    expect(permitWhen('2026-11-22T10:10:00Z', 'en', now)).toMatch(/3:40/);
    expect(permitWhen('2026-11-23T10:10:00Z', 'en', now)).toMatch(/23 Nov/);
    expect(permitWhen(undefined, 'en', now)).toBeNull();
    expect(permitWhen('nonsense', 'en', now)).toBeNull();
  });

  it('turns failures into plain words', () => {
    expect(workPermitsErrorText(new PhotoRejected('size'), t, 'photo')).toBe(t('chat.workPermitTooBig'));
    expect(workPermitsErrorText(new PhotoRejected('type'), t, 'photo')).toBe(t('chat.workPermitBadType'));
    expect(workPermitsErrorText(new Error('x'), t, 'file')).toBe(t('chat.workPermitFileFailed'));
    expect(workPermitsErrorText(new Error('x'), t, 'answer')).toBe(t('chat.portalSaveFailed'));
    expect(workPermitsErrorText(new ApiError(429, 'RATE', 'slow'), t, 'answer')).toBe(t('chat.portalRateLimited'));
  });
});
