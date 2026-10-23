import { describe, expect, it } from 'vitest';

import { parseIdentifier } from './identifier';

describe('parseIdentifier', () => {
  it('reads a mobile number however it is typed, as ten plain digits', () => {
    for (const typed of ['9876543210', '98765 43210', '+91 98765 43210', '09876543210', ' 98765-43210 ']) {
      expect(parseIdentifier(typed), typed).toEqual({ kind: 'mobile', value: '9876543210' });
    }
  });

  it('reads Hindi digits', () => {
    expect(parseIdentifier('९८७६५ ४३२१०')).toEqual({ kind: 'mobile', value: '9876543210' });
  });

  it('reads an email, trimmed and lower-cased', () => {
    expect(parseIdentifier('  Ramesh@Example.COM ')).toEqual({
      kind: 'email',
      value: 'ramesh@example.com',
    });
  });

  it('refuses what is neither', () => {
    for (const typed of ['', '   ', 'ramesh', '12345', '1234567890', 'ramesh@', '@example.com', 'a b@c.com']) {
      expect(parseIdentifier(typed), typed).toBeNull();
    }
  });
});
