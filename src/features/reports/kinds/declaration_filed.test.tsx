import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useLangStore } from '@/store/lang';
import { resetStores } from '@/test/utils';
import type { DeclarationFiledData } from '@dk/shared/types';

import { reportOf, signedPhoto } from './_paperwork.fixtures';
import { calendarDays, view } from './declaration_filed';

const safety: DeclarationFiledData = {
  kind: 'declaration_filed',
  v: 1,
  declaration: 'safety',
  how: 'submitted',
  day: '2026-11-23',
  filedAt: '2026-11-23T17:10:00.000Z',
  late: false,
  everyDays: 1,
  nextDueDay: '2026-11-24',
  outletCode: '1E',
  streak: 14,
  recentDays: Array.from({ length: 14 }, (_, i) => `2026-11-${String(10 + i).padStart(2, '0')}`),
  ref: 'row1',
};

const washroom: DeclarationFiledData = {
  kind: 'declaration_filed',
  v: 1,
  declaration: 'washroom',
  how: 'submitted',
  day: '2026-11-23',
  filedAt: '2026-11-23T17:10:00.000Z',
  late: false,
  everyDays: 7,
  nextDueDay: '2026-11-30',
  outletCode: '1E',
  previousDay: '2026-11-16',
  photos: [
    { slot: 'inside', key: 'k/inside.jpg', mime: 'image/jpeg', size: 1, reused: true },
    { slot: 'outside', key: 'k/outside.jpg', mime: 'image/jpeg', size: 1, reused: true },
  ],
  ref: 'row2',
};

afterEach(() => resetStores());

function open(data: DeclarationFiledData, lang: 'hi' | 'hl' | 'en' = 'en', attachments = [signedPhoto('k/outside.jpg', 'https://signed/o')]) {
  // The kit's own words follow the app's language.
  useLangStore.setState({ lang });
  const Overlay = view.Overlay;
  return render(<Overlay data={data} report={reportOf('declaration_filed', attachments)} lang={lang} />);
}

describe('declaration_filed', () => {
  it('draws a round seal that says Filed and the date', () => {
    open(safety);
    const seal = screen.getByRole('img', { name: 'Filed, 23 Nov' });
    expect(seal.querySelectorAll('circle').length).toBeGreaterThanOrEqual(3);
    expect(within(seal).getByText('FILED')).toBeInTheDocument();
    expect(screen.getByText("The safety declaration for 23 Nov is filed on IndianOil's portal.")).toBeInTheDocument();
  });

  it('says the same in Hindi and Hinglish', () => {
    const { unmount } = open(safety, 'hi');
    expect(screen.getByRole('img', { name: 'जमा हुआ, 23 नवंबर' })).toBeInTheDocument();
    expect(screen.getByText(/सेफ्टी डिक्लेरेशन IndianOil के पोर्टल पर जमा हो गई है/)).toBeInTheDocument();
    unmount();
    open(safety, 'hl');
    expect(screen.getByText('23 Nov ka safety declaration IndianOil ke portal par jama ho gaya hai.')).toBeInTheDocument();
  });

  it('builds the 14 days ending on the report day, with the missed ones empty', () => {
    const gap = { ...safety, recentDays: ['2026-11-23', '2026-11-22', '2026-11-20'], streak: 2 };
    const days = calendarDays(gap);
    expect(days).toHaveLength(14);
    expect(days[0]!.day).toBe('2026-11-10');
    expect(days[13]).toEqual({ day: '2026-11-23', filed: true, isReportDay: true });
    expect(days.filter((d) => d.filed).map((d) => d.day)).toEqual(['2026-11-20', '2026-11-22', '2026-11-23']);
  });

  it('shows the calendar as a list of 14 days, each with its words', () => {
    open({ ...safety, recentDays: ['2026-11-23', '2026-11-22'], streak: 2 });
    const list = screen.getByRole('list', { name: 'Last 14 days' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(14);
    expect(within(list).getByText('23 Nov: Filed, This report')).toBeInTheDocument();
    expect(within(list).getByText('21 Nov: No filing')).toBeInTheDocument();
    // The streak is one tile: the number, "days in a row", and when the next one is due.
    const tile = screen.getByRole('group', { name: 'Safety declaration, filed: 2 days in a row' });
    expect(within(tile).getByText('2')).toBeInTheDocument();
    expect(within(tile).getByText('days in a row')).toBeInTheDocument();
    expect(within(tile).getByText('Next one due 24 Nov')).toBeInTheDocument();
  });

  it('draws no streak tile for one day, for the washroom paper, or when the streak is not in the snapshot', () => {
    const { unmount } = open({ ...safety, streak: 1 });
    expect(screen.queryByRole('group', { name: /days in a row/ })).toBeNull();
    unmount();
    const w = open(washroom);
    expect(screen.queryByRole('group', { name: /days in a row/ })).toBeNull();
    w.unmount();
    open({ ...safety, streak: undefined });
    expect(screen.queryByRole('group', { name: /days in a row/ })).toBeNull();
  });

  it('says the streak in Hindi', () => {
    const { container } = open(safety, 'hi');
    expect(container.textContent).toContain('दिन लगातार');
  });

  it('safety has no photos and no calendar when the snapshot has no recent days', () => {
    open({ ...safety, recentDays: undefined, streak: undefined });
    expect(screen.queryByRole('list', { name: 'Last 14 days' })).toBeNull();
    expect(screen.queryByAltText('Outside photo')).toBeNull();
  });

  it('washroom shows its two photos, outside first, with a calm box for the one not signed', () => {
    open(washroom);
    expect(screen.getByAltText('Outside photo')).toHaveAttribute('src', 'https://signed/o');
    expect(screen.queryByAltText('Inside photo')).toBeNull();
    expect(screen.getByText('Photo is not shown here')).toBeInTheDocument();
    const labels = screen.getAllByText(/^(Outside|Inside) photo$/).map((e) => e.textContent);
    expect(labels).toEqual(['Outside photo', 'Inside photo']);
    expect(screen.getByText('Same photos as last time')).toBeInTheDocument();
    expect(screen.getByText('Filed 23 Nov. Next 30 Nov.')).toBeInTheDocument();
    expect(screen.getByText('Filed every 7 days.')).toBeInTheDocument();
    expect(screen.getByText('Before this: 16 Nov')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Last 14 days' })).toBeNull();
  });

  it('washroom with no photos says so calmly', () => {
    open({ ...washroom, photos: [] });
    expect(screen.getByText('The photos for this one are not kept here.')).toBeInTheDocument();
  });

  it('a late filing says which day it was for and when it went in', () => {
    // Filed at 02:00 IST on the 24th, for the 23rd.
    open({ ...safety, late: true, filedAt: '2026-11-23T20:30:00.000Z' });
    expect(screen.getByText('It was for 23 Nov. It went in on 24 Nov.')).toBeInTheDocument();
  });

  it('a declaration that was already on the portal is an info report and an open seal, never "filed by MDG"', () => {
    open({ ...safety, how: 'already_on_portal' });
    expect(screen.getByText("This was already on IndianOil's portal. MDG did not file it.")).toBeInTheDocument();
    expect(screen.getByText('Already there')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Already on the portal, 23 Nov' })).toBeInTheDocument();
    expect(screen.queryByText(/Filed by MDG/)).toBeNull();
  });

  it('closes with who did the work', () => {
    open(safety);
    expect(screen.getByText("Filed by MDG's team on IndianOil's portal for you.")).toBeInTheDocument();
  });

  it('writes the history line and the share text, and has no tile or alert', () => {
    expect(view.headline(safety, 'en')).toBe('Safety declaration filed, 23 Nov');
    expect(view.headline(washroom, 'hl')).toBe('Washroom declaration jama, 23 Nov');
    expect(view.headline({ ...safety, how: 'already_on_portal' }, 'en')).toBe('Safety declaration was already on the portal, 23 Nov');
    const text = view.share(safety, 'en');
    expect(text.split('\n')).toEqual([
      'Safety declaration filed, 23 Nov',
      'Filed 23 Nov. Next 24 Nov.',
      '14 days in a row',
      "Filed by MDG's team on IndianOil's portal.",
    ]);
    expect(view.tile(safety, 'en')).toBeNull();
    expect(view.alert(safety, 'en')).toBeNull();
  });

  it('draws a 40 x 28 glyph that keeps its shape at any height', () => {
    const Glyph = view.Glyph;
    const { container } = render(<Glyph size={56} />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('viewBox', '0 0 40 28');
    expect(svg).toHaveAttribute('height', '56');
    expect(svg).toHaveAttribute('width', '80');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });
});
