import { afterEach, describe, expect, it } from 'vitest';

import { imageAccept } from './imageAccept';

const setPlatform = (p: 'ios' | 'android' | undefined) => {
  const w = window as unknown as { __DK_NATIVE_PLATFORM__?: string };
  if (p) w.__DK_NATIVE_PLATFORM__ = p;
  else delete w.__DK_NATIVE_PLATFORM__;
};
afterEach(() => setPlatform(undefined));

describe('imageAccept', () => {
  // `image/*` is what makes an iPhone hand back HEIC. Naming the formats it should
  // hand back (and leaving HEIC out) is what makes iOS convert at pick time.
  it('on an iPhone names JPEG, PNG and WebP, and leaves HEIC out', () => {
    setPlatform('ios');
    expect(imageAccept()).toBe('image/jpeg,image/png,image/webp');
    expect(imageAccept()).not.toMatch(/hei/i);
  });

  it('on an iPhone, "Choose file" adds PDF to the same list', () => {
    setPlatform('ios');
    expect(imageAccept(true)).toBe('image/jpeg,image/png,image/webp,application/pdf');
  });

  it('on Android it is the broad type it always was', () => {
    setPlatform('android');
    expect(imageAccept()).toBe('image/*');
    expect(imageAccept(true)).toBe('image/*,application/pdf');
  });

  it('in a plain browser it is the broad type', () => {
    expect(imageAccept()).toBe('image/*');
    expect(imageAccept(true)).toBe('image/*,application/pdf');
  });
});
