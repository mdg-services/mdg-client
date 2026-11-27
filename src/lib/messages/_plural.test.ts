import { describe, expect, it } from 'vitest';

import { pluralKey, tnIn } from './_plural';

describe('plural keys', () => {
  it('picks .one for exactly 1 and .many for anything else, zero included', () => {
    expect(pluralKey('kit.more', 1)).toBe('kit.more.one');
    expect(pluralKey('kit.more', 2)).toBe('kit.more.many');
    expect(pluralKey('kit.more', 0)).toBe('kit.more.many');
    expect(pluralKey('kit.more', 11)).toBe('kit.more.many');
  });

  it('writes each language\'s own word for the count', () => {
    expect(tnIn('en', 'kit.notices', 1)).toBe('1 notice');
    expect(tnIn('en', 'kit.notices', 3)).toBe('3 notices');
    expect(tnIn('hi', 'kit.notices', 1)).toBe('1 सूचना');
    expect(tnIn('hi', 'kit.notices', 3)).toBe('3 सूचनाएँ');
    expect(tnIn('hl', 'kit.notices', 1)).toBe('1 soochna');
    expect(tnIn('hl', 'kit.notices', 3)).toBe('3 soochnayein');
  });

  it('fills {n} itself and passes any other variable through', () => {
    expect(tnIn('en', 'kit.more', 4)).toBe('4 more');
    expect(tnIn('hi', 'kit.more', 4)).toBe('4 और');
  });
});
