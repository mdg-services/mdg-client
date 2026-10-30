import { describe, expect, it } from 'vitest';

import { digitsOf, enrollAccountOf, toMobile } from './enroll';

describe('toMobile', () => {
  it('takes a mobile however it is typed', () => {
    for (const typed of [
      '9467466963',
      '94674 66963',
      '94674-66963',
      '+91 94674 66963',
      '+919467466963',
      '919467466963',
      '09467466963',
      '(+91) 94674.66963',
      ' 9467466963 ',
    ]) {
      expect(toMobile(typed), typed).toBe('9467466963');
    }
  });

  it('reads Hindi and other Indian digits', () => {
    expect(toMobile('९४६७४६६९६३')).toBe('9467466963'); // Devanagari
    expect(toMobile('+९१ ९४६७४ ६६९६३')).toBe('9467466963');
    expect(toMobile('૯૪૬૭૪૬૬૯૬૩')).toBe('9467466963'); // Gujarati
    expect(toMobile('৯৪৬৭৪৬৬৯৬৩')).toBe('9467466963'); // Bengali
    expect(toMobile('੯੪੬੭੪੬੬੯੬੩')).toBe('9467466963'); // Gurmukhi
  });

  it('keeps a number that only looks like it has a country code', () => {
    expect(toMobile('9123456789')).toBe('9123456789');
    expect(toMobile('9100000000')).toBe('9100000000');
  });

  it('refuses what nobody could ring back', () => {
    for (const typed of [
      '',
      '12345',
      '1234567890', // not a mobile: starts with 1
      '0000000000',
      '5876543210',
      '05712401234', // a landline with its area code
      '98765432109', // eleven digits
      '98765o4321', // a letter for a zero
      '9876543210 ext 2',
      '94674+66963',
    ]) {
      expect(toMobile(typed), typed).toBeNull();
    }
  });
});

describe('digitsOf', () => {
  it('keeps the digits, in plain 0-9 whatever script they were typed in', () => {
    expect(digitsOf('482913')).toBe('482913');
    expect(digitsOf('४८२ 913')).toBe('482913');
    expect(digitsOf('٤٨٢٩١٣')).toBe('482913'); // Arabic-Indic
    expect(digitsOf('４８２９１３')).toBe('482913'); // full-width
  });

  it('drops everything that is not a digit', () => {
    expect(digitsOf(' 48-29 13 ')).toBe('482913');
    expect(digitsOf('abc')).toBe('');
    expect(digitsOf('')).toBe('');
  });
});

describe('enrollAccountOf', () => {
  it('reads the endpoint\'s answer, and anything else — an older endpoint says nothing — is waiting', () => {
    expect(enrollAccountOf('ready')).toBe('ready');
    expect(enrollAccountOf('existing')).toBe('existing');
    expect(enrollAccountOf('waiting')).toBe('waiting');
    expect(enrollAccountOf(undefined)).toBe('waiting');
    expect(enrollAccountOf('approved')).toBe('waiting');
  });
});
