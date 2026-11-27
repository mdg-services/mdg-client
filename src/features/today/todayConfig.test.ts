import { describe, expect, it } from 'vitest';

import { TODAY_WORK_LAYOUT } from './todayConfig';

describe('the Needs-you layout switch (owner decision Q1)', () => {
  it('is the slider until the owner answers: one card at a time, as he chose on 25 Nov', () => {
    expect(TODAY_WORK_LAYOUT).toBe('slider');
  });
});
