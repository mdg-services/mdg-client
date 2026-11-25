import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  PhotoFrame,
  addDays,
  fmtClock,
  fmtDay,
  fmtDayTime,
  fmtNum,
  fmtRs,
  fmtSeconds,
  istOf,
  photoUrl,
} from './_paperwork';
import { signedPhoto } from './_paperwork.fixtures';

describe('paperwork helpers: dates, times, money', () => {
  it('writes a day in the reader’s language', () => {
    expect(fmtDay('2026-11-24', 'en')).toBe('24 Nov');
    expect(fmtDay('2026-11-24', 'hl')).toBe('24 Nov');
    expect(fmtDay('2026-11-24', 'hi')).toBe('24 नवंबर');
    expect(fmtDay('2026-11-24', 'en', true)).toBe('24 Nov 2026');
    expect(fmtDay(null, 'en')).toBe('');
    expect(fmtDay('soon', 'en')).toBe('soon');
  });

  it('counts calendar days across a month and a year end', () => {
    expect(addDays('2026-11-24', -13)).toBe('2026-11-11');
    expect(addDays('2026-01-03', -5)).toBe('2025-12-29');
    expect(addDays('2026-02-27', 3)).toBe('2026-03-02');
  });

  it('reads an instant as an Indian day and time', () => {
    // 20:00 UTC on the 23rd is 01:30 on the 24th in India.
    expect(istOf('2026-11-23T20:00:00.000Z')).toEqual({ day: '2026-11-24', time: '01:30' });
    expect(istOf('nonsense')).toBeNull();
    expect(fmtDayTime('2026-11-24T08:35:00.000Z', 'en')).toBe('24 Nov, 2:05 pm');
  });

  it('writes the clock the way each reader says it', () => {
    expect(fmtClock('11:00', 'en')).toBe('11:00 am');
    expect(fmtClock('00:15', 'en')).toBe('12:15 am');
    expect(fmtClock('12:00', 'hl')).toBe('12:00 pm');
    expect(fmtClock('14:05', 'en')).toBe('2:05 pm');
    expect(fmtClock('11:00', 'hi')).toBe('सुबह 11:00');
    expect(fmtClock('17:30', 'hi')).toBe('शाम 5:30');
  });

  it('groups rupees the Indian way', () => {
    expect(fmtNum(124000)).toBe('1,24,000');
    expect(fmtRs(12600, 'en')).toBe('₹12,600');
    expect(fmtRs(12600, 'hi')).toBe('₹12,600');
  });

  it('says seconds as seconds, then as minutes', () => {
    expect(fmtSeconds(45, 'en')).toBe('45 s');
    expect(fmtSeconds(75, 'en')).toBe('1 min 15 s');
    expect(fmtSeconds(120, 'en')).toBe('2 min');
    expect(fmtSeconds(45, 'hi')).toBe('45 सेकंड');
  });
});

describe('paperwork helpers: photos', () => {
  it('finds the signed copy of a photo by its storage key', () => {
    const report = { attachments: [signedPhoto('k/outside.jpg', 'https://signed/o'), signedPhoto('k/inside.jpg', 'https://signed/i')] };
    expect(photoUrl(report, 'k/inside.jpg')).toBe('https://signed/i');
    expect(photoUrl(report, 'k/gone.jpg')).toBeUndefined();
    expect(photoUrl({ attachments: [] }, 'k/inside.jpg')).toBeUndefined();
  });

  it('shows the picture with its label as the alt text', () => {
    render(<PhotoFrame src="https://signed/o" label="Outside photo" size={156} lang="en" />);
    expect(screen.getByAltText('Outside photo')).toHaveAttribute('src', 'https://signed/o');
  });

  it('shows a calm box when there is no address', () => {
    render(<PhotoFrame src={undefined} label="Outside photo" size={156} lang="en" />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('Photo is not shown here')).toBeInTheDocument();
    expect(screen.getByText('Outside photo')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('says the photo did not open and offers Try again when the picture fails', () => {
    render(<PhotoFrame src="https://signed/broken" label="Inside photo" size={156} lang="en" />);
    fireEvent.error(screen.getByAltText('Inside photo'));
    expect(screen.getByText('Photo did not open')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByAltText('Inside photo')).toBeInTheDocument();
  });
});
