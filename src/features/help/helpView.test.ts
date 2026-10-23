import { describe, expect, it } from 'vitest';

import type { GuideVideoListItem } from '@dk/shared/types';

import { durationLabel, playableSrc, playableVideos, videoSummary, videoTitle } from './helpView';

function item(over: Partial<GuideVideoListItem> = {}): GuideVideoListItem {
  return {
    id: 'app_tour',
    title: { hi: 'ऐप कैसे चलाएं', en: 'How the app works' },
    summary: { hi: 'चैट, रिपोर्ट और सेटिंग', en: 'Chat, reports and settings' },
    durationMs: 94_900,
    service: null,
    available: true,
    ...over,
  };
}

describe('playableVideos', () => {
  it('keeps the order the server sent and drops a video with no file yet', () => {
    const list = [
      item({ id: 'a' }),
      item({ id: 'b', available: false }),
      item({ id: 'c' }),
    ];
    expect(playableVideos(list).map((v) => v.id)).toEqual(['a', 'c']);
  });

  it('is an empty list before anything has loaded', () => {
    expect(playableVideos(undefined)).toEqual([]);
  });
});

describe('words', () => {
  it('follow the dealer\'s language', () => {
    expect(videoTitle(item(), 'hi')).toBe('ऐप कैसे चलाएं');
    expect(videoTitle(item(), 'en')).toBe('How the app works');
    expect(videoSummary(item(), 'en')).toBe('Chat, reports and settings');
  });

  it('fall back to the other language rather than show a blank row', () => {
    const v = item({ title: { hi: 'सिर्फ़ हिंदी', en: '' } });
    expect(videoTitle(v, 'en')).toBe('सिर्फ़ हिंदी');
  });
});

describe('durationLabel', () => {
  it('writes minutes and seconds', () => {
    expect(durationLabel(94_900)).toBe('1:35');
    expect(durationLabel(49_800)).toBe('0:50');
  });

  it('writes nothing when the length is not known', () => {
    expect(durationLabel(0)).toBe('');
    expect(durationLabel(undefined)).toBe('');
    expect(durationLabel(Number.NaN)).toBe('');
  });
});

describe('playableSrc', () => {
  it('shows the first frame when there is no start second', () => {
    expect(playableSrc('https://x.test/v.mp4?sig=1', 0)).toBe('https://x.test/v.mp4?sig=1#t=0.1');
  });

  it('starts at the chapter when there is one', () => {
    expect(playableSrc('https://x.test/v.mp4?sig=1', 46)).toBe('https://x.test/v.mp4?sig=1#t=46');
  });

  it('leaves a link that already carries a fragment alone', () => {
    expect(playableSrc('https://x.test/v.mp4#t=5', 46)).toBe('https://x.test/v.mp4#t=5');
  });
});
