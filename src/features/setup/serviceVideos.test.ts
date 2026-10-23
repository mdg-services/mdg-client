import { describe, expect, it } from 'vitest';

import type { GuideVideoListItem } from '@dk/shared/types';

import { videosByService } from './serviceVideos';

const item = (id: string, service: string | null, over: Partial<GuideVideoListItem> = {}): GuideVideoListItem => ({
  id,
  title: { hi: 'हिंदी', en: 'English' },
  summary: { hi: 'सार', en: 'summary' },
  durationMs: 50_000,
  service,
  available: true,
  ...over,
});

describe('which video each service gets from the library', () => {
  it('gives a service the video that names it, when that video can play', () => {
    const got = videosByService([
      item('svc_dsr', 'dsr-report'),
      item('svc_tt_density', 'tt-density'),
      item('app_tour', null),
    ]);
    expect(Object.keys(got).sort()).toEqual(['dsr-report', 'tt-density']);
    expect(got['tt-density']?.id).toBe('svc_tt_density');
  });

  it('gives nothing for a video that is not uploaded yet — never a dead ▶', () => {
    expect(videosByService([item('svc_dsr', 'dsr-report', { available: false })])).toEqual({});
  });

  it('is one video per service: the first one listed wins', () => {
    const got = videosByService([item('first', 'tt-density'), item('second', 'tt-density')]);
    expect(got['tt-density']?.id).toBe('first');
  });

  it('ignores a service the card does not offer, a video about none, and anything that is not a list', () => {
    expect(videosByService([item('x', 'custom-request'), item('y', null)])).toEqual({});
    expect(videosByService(undefined)).toEqual({});
    expect(videosByService({ stage: 'services' })).toEqual({});
    expect(videosByService([null, 7, 'text'])).toEqual({});
  });
});
