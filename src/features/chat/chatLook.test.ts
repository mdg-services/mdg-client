import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { chatLook, sideOf } from './chatLook';

/**
 * `chatLook.ts` is one file in two apps (ADR 0060): the dealer app and the admin carry
 * byte-identical copies, so a message looks the same in both. This test pins the file's
 * hash. If you changed the file, copy it to the other app, then put the new hash in
 * BOTH `chatLook.test.ts` files (it is printed in the failure).
 */
const PINNED = '4b132412beadc3abcb05eda99012ab7ce00a786b';

describe('chatLook', () => {
  it('is the same file in the dealer app and the admin', () => {
    const text = readFileSync(join(__dirname, 'chatLook.ts'), 'utf8');
    expect(createHash('sha1').update(text).digest('hex')).toBe(PINNED);
  });

  it('puts the dealer on the right in their app and on the left in the admin', () => {
    expect(sideOf('dealer', false)).toBe('right');
    expect(sideOf('dealer', true)).toBe('left');
    expect(sideOf('admin', true)).toBe('right');
    expect(sideOf('admin', false)).toBe('left');
  });

  it('colours a bubble by who sent it, not by the side it sits on', () => {
    const base = { first: true, wide: false, padded: true } as const;
    // The team's words: white. The dealer's: stone. On either side.
    expect(chatLook.bubble({ ...base, fromMdg: true, side: 'left' })).toContain('bg-wa-in');
    expect(chatLook.bubble({ ...base, fromMdg: true, side: 'right' })).toContain('bg-wa-in');
    expect(chatLook.bubble({ ...base, fromMdg: false, side: 'left' })).toContain('bg-wa-out');
    expect(chatLook.bubble({ ...base, fromMdg: false, side: 'right' })).toContain('bg-wa-out');
  });

  it('hangs the tail off the corner on the bubble\'s own side', () => {
    expect(chatLook.tail(true, 'left')).toContain('-left-[7px]');
    expect(chatLook.tail(false, 'right')).toContain('-right-[7px]');
  });
});
