import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ChatButton, More, clockWords, dayWords, istParts, leading, num, plural, stampWords, timeWords, twoLang } from './_supplyKit';
import { reportDetail } from './_supplyTestKit';

afterEach(cleanup);

describe('dates and clocks in the reader’s language', () => {
  it('writes a day without a year, with one when asked, and nothing for a bad day', () => {
    expect(dayWords('2026-11-24', 'en')).toBe('24 Nov');
    expect(dayWords('2026-11-24', 'hl')).toBe('24 Nov');
    expect(dayWords('2026-11-24', 'hi')).toBe('24 नवंबर');
    expect(dayWords('2026-10-22', 'en', true)).toBe('22 Oct 2026');
    expect(dayWords('2026-13-01', 'en')).toBe('');
    expect(dayWords(undefined, 'en')).toBe('');
    expect(dayWords('22-10-2026', 'en')).toBe('');
  });

  it('reads an instant in India time, whatever the phone says', () => {
    expect(istParts('2026-11-24T06:28:00.000Z')).toEqual({ day: '2026-11-24', hour: 11, minute: 58 });
    // 20:00 UTC is already the next morning in India
    expect(istParts('2026-11-24T20:00:00.000Z')).toEqual({ day: '2026-11-25', hour: 1, minute: 30 });
    expect(istParts('not a time')).toBeNull();
    expect(istParts(null)).toBeNull();
  });

  it('writes a clock as 12-hour in Latin and with a part of day in Hindi', () => {
    expect(clockWords(0, 5, 'en')).toBe('12:05 am');
    expect(clockWords(12, 0, 'hl')).toBe('12:00 pm');
    expect(clockWords(19, 5, 'en')).toBe('7:05 pm');
    expect(clockWords(19, 5, 'hi')).toBe('शाम 7:05 बजे');
    expect(clockWords(9, 30, 'hi')).toBe('सुबह 9:30 बजे');
    expect(clockWords(1, 0, 'hi')).toBe('रात 1:00 बजे');
    expect(clockWords(13, 0, 'hi')).toBe('दोपहर 1:00 बजे');
  });

  it('puts a day and a clock together, and either alone', () => {
    expect(stampWords('2026-11-24T06:28:00.000Z', 'en')).toBe('24 Nov, 11:58 am');
    expect(stampWords('2026-11-24T14:35:00.000Z', 'hi')).toBe('24 नवंबर, रात 8:05 बजे');
    expect(timeWords('2026-11-24T08:35:00.000Z', 'en')).toBe('2:05 pm');
    expect(stampWords('bad', 'en')).toBe('');
    expect(timeWords(undefined, 'en')).toBe('');
  });
});

describe('small helpers', () => {
  it('groups numbers the Indian way', () => {
    expect(num(124000)).toBe('1,24,000');
  });

  it('gives Devanagari more air than Latin', () => {
    expect(leading('hi')).toBe('leading-[1.7]');
    expect(leading('hl')).toBe('leading-normal');
  });

  it('picks the one or the many sentence', () => {
    const one = () => ({ hi: 'एक', hl: 'ek', en: 'one' });
    const many = (n: number) => ({ hi: `${n}`, hl: `${n}`, en: `${n} many` });
    expect(plural(1, one, many, 'en')).toBe('one');
    expect(plural(3, one, many, 'en')).toBe('3 many');
  });

  it('chooses the Hindi or English of a text somebody else wrote, and falls back', () => {
    expect(twoLang({ en: 'Photo', hi: 'फ़ोटो' }, 'hi')).toBe('फ़ोटो');
    expect(twoLang({ en: 'Photo', hi: 'फ़ोटो' }, 'hl')).toBe('Photo');
    expect(twoLang({ en: '', hi: 'फ़ोटो' }, 'en')).toBe('फ़ोटो');
    expect(twoLang({ en: 'Photo', hi: '' }, 'hi')).toBe('Photo');
  });
});

describe('the More row', () => {
  it('is closed until it is tapped and says so to a screen reader', () => {
    render(<More label="More details">hidden words</More>);
    const toggle = screen.getByRole('button', { name: 'More details' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('hidden words').closest('[hidden]')).not.toBeNull();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('hidden words').closest('[hidden]')).toBeNull();
  });
});

describe('the chat button', () => {
  it('draws nothing outside a router, where there is no chat to go to', () => {
    const { container } = render(<ChatButton report={reportDetail()}>Open</ChatButton>);
    expect(container).toBeEmptyDOMElement();
  });
});
