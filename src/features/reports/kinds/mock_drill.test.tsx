import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useLangStore } from '@/store/lang';
import { resetStores } from '@/test/utils';
import type { MockDrillData } from '@dk/shared/types';

import { reportOf, signedPhoto } from './_paperwork.fixtures';
import { progressSteps, stepsOnTime, usedResponse, view } from './mock_drill';

const filed: MockDrillData = {
  kind: 'mock_drill',
  v: 1,
  outletCode: '1E',
  stage: 'filed',
  submissionId: 's1',
  mode: 'new',
  scenario: { id: 'sc1', family: 'fire', label: 'Fire at the dispensing area' },
  drillDay: '2026-11-22',
  startTime: '11:00',
  durationMinutes: 30,
  allClear: '2026-11-22 11:30',
  level: '1',
  personsPresent: 12,
  headCountShort: 0,
  response: [
    { step: 3, expectedSec: 90, actualSec: 75 },
    { step: 0, expectedSec: 60, actualSec: 45 },
    { step: 6, expectedSec: 0, actualSec: 0 },
  ],
  photos: [
    { key: 'k/p1.jpg', mime: 'image/jpeg', size: 1 },
    { key: 'k/p2.jpg', mime: 'image/jpeg', size: 1 },
  ],
  filedAt: '2026-11-23T08:00:00.000Z',
  portalState: 'pending_approval',
};

afterEach(() => resetStores());

function open(data: MockDrillData, lang: 'hi' | 'hl' | 'en' = 'en') {
  // The kit's own words follow the app's language.
  useLangStore.setState({ lang });
  const Overlay = view.Overlay;
  return render(
    <Overlay data={data} report={reportOf('mock_drill', [signedPhoto('k/p1.jpg', 'https://signed/1')])} lang={lang} />,
  );
}

describe('mock_drill', () => {
  it('opens with one plain sentence', () => {
    open(filed);
    expect(screen.getByText("We filed your mock drill report on IndianOil's portal.")).toBeInTheDocument();
  });

  it('draws a stopwatch dial that reads as text and has 60 tick marks', () => {
    open(filed);
    const dial = screen.getByRole('img', { name: '30 min' });
    // 60 ticks + the hand
    expect(dial.querySelectorAll('line').length).toBe(61);
    expect(within(dial).getByText('30 min')).toBeInTheDocument();
    expect(screen.getByText('Started 11:00 am')).toBeInTheDocument();
    expect(screen.getByText('All clear 11:30 am')).toBeInTheDocument();
  });

  it('a dial of a whole hour sweeps a full circle, and one with no length draws no hand', () => {
    const { container, unmount } = open({ ...filed, durationMinutes: 60 });
    expect(container.querySelectorAll('svg[role="img"] circle').length).toBeGreaterThanOrEqual(3);
    unmount();
    const none = open({ ...filed, durationMinutes: null });
    const dial = none.container.querySelector('svg[role="img"]')!;
    expect(dial.querySelectorAll('line').length).toBe(60);
    expect(within(dial as unknown as HTMLElement).getByText('—')).toBeInTheDocument();
  });

  it('names the kind of drill and quotes IndianOil’s own label', () => {
    open(filed);
    expect(screen.getByText('Fire')).toBeInTheDocument();
    expect(screen.getByText('IndianOil says')).toBeInTheDocument();
    expect(screen.getByText('Fire at the dispensing area')).toBeInTheDocument();
  });

  it('prints expected and actual for each step used, in portal order, and skips the unused rows', () => {
    open(filed);
    expect(usedResponse(filed).map((r) => r.step)).toEqual([0, 3]);
    const section = screen.getByRole('region', { name: 'How fast each step started' });
    const rows = within(section).getAllByRole('listitem').filter((li) => li.hasAttribute('data-step'));
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText('Siren')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('In 45 s (expected 1 min)')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Fire team')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('In 1 min 15 s (expected 1 min 30 s)')).toBeInTheDocument();
  });

  it('draws the expected bar as an outline and the actual one filled, scaled to the longest', () => {
    open(filed);
    const row = document.querySelector('[data-step="3"]')!;
    const [expected, actual] = Array.from(row.querySelectorAll('rect'));
    expect(expected).toHaveAttribute('fill', 'none');
    expect(Number(expected!.getAttribute('width'))).toBe(100);
    expect(actual).toHaveAttribute('fill', 'currentColor');
    expect(Math.round(Number(actual!.getAttribute('width')))).toBe(83);
  });

  it('shows who was there, the level, and the two photos with a calm box for an unsigned one', () => {
    open(filed);
    const people = screen.getByRole('group', { name: 'People present: 12' });
    expect(within(people).getByText('12')).toBeInTheDocument();
    expect(within(people).getByText('Head count short 0')).toBeInTheDocument();
    expect(screen.getByText('Level 1 drill')).toBeInTheDocument();
    expect(screen.getByAltText('Photo 1')).toHaveAttribute('src', 'https://signed/1');
    expect(screen.getByText('Photo is not shown here')).toBeInTheDocument();
    fireEvent.error(screen.getByAltText('Photo 1'));
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('draws the four steps and says the officer step is as of the filing day, not a permanent wait', () => {
    const steps = progressSteps(filed, 'en');
    expect(steps.map((s) => s.state)).toEqual(['done', 'done', 'done', 'now']);
    expect(steps[3]!.text).toBe("Waiting for IndianOil's officer (as of 23 Nov)");
    open(filed);
    const list = screen.getByRole('list', { name: 'Where it stands' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(4);
  });

  it('a returned drill asks for the photos again; an unknown state says the approval is IndianOil’s', () => {
    expect(progressSteps({ ...filed, portalState: 'returned' }, 'en')[3]).toEqual({
      state: 'look',
      text: 'IndianOil sent it back. Please send the photos again in the chat.',
    });
    expect(progressSteps({ ...filed, portalState: 'unknown' }, 'en')[3]).toEqual({
      state: 'next',
      text: "Filed 23 Nov. The approval is IndianOil's.",
    });
    expect(progressSteps({ ...filed, portalState: 'none' }, 'hl')[3]!.text).toBe('23 Nov ko jama hui. Manzoori IndianOil ke haath mein hai.');
  });

  it('a drill still being checked says so and has not been filed yet', () => {
    const received: MockDrillData = { ...filed, stage: 'received', filedAt: undefined, receivedAt: '2026-11-23T07:00:00.000Z', portalState: 'none', allClear: undefined };
    open(received);
    expect(screen.getByText('We are checking your photos. Then we file it.')).toBeInTheDocument();
    expect(screen.queryByText(/Filed by MDG/)).toBeNull();
    const steps = progressSteps(received, 'en');
    expect(steps.map((s) => s.state)).toEqual(['done', 'now', 'next', 'next']);
  });

  it('every step is words as well as a shape', () => {
    open(filed);
    const list = screen.getByRole('list', { name: 'Where it stands' });
    expect(within(list).getAllByText("Done:").length).toBe(3);
    expect(within(list).getByText('Now:')).toBeInTheDocument();
  });

  it('speaks Hindi', () => {
    open(filed, 'hi');
    expect(screen.getByText('हमने आपकी मॉक ड्रिल रिपोर्ट IndianOil के पोर्टल पर जमा कर दी है।')).toBeInTheDocument();
    expect(screen.getByText('सायरन')).toBeInTheDocument();
    expect(screen.getByText('45 सेकंड में (तय समय: 1 मिनट)')).toBeInTheDocument();
  });

  it('writes the history line, the share text, and has no tile or alert', () => {
    expect(view.headline(filed, 'en')).toBe('Mock drill filed, 22 Nov, 30 min');
    expect(view.headline({ ...filed, stage: 'received' }, 'en')).toBe('Mock drill received, checking the photos');
    expect(view.share(filed, 'en').split('\n')).toEqual([
      'Mock drill filed, 22 Nov, 30 min',
      'Started 11:00 am · All clear 11:30 am',
      'People present 12',
    ]);
    expect(view.tile(filed, 'en')).toBeNull();
    expect(view.alert(filed, 'en')).toBeNull();
  });

  it('draws a 40 x 28 stopwatch glyph', () => {
    const Glyph = view.Glyph;
    const { container } = render(<Glyph />);
    expect(container.querySelector('svg')).toHaveAttribute('viewBox', '0 0 40 28');
  });
});

describe('mock_drill: the figures at a glance', () => {
  it('counts the steps that started within the expected time, leaving out a step the drill did not run', () => {
    expect(stepsOnTime(usedResponse(filed))).toEqual({ onTime: 2, total: 2 });
    const slow = { ...filed, response: [{ step: 0, expectedSec: 60, actualSec: 90 }, { step: 3, expectedSec: 90, actualSec: 80 }] };
    expect(stepsOnTime(usedResponse(slow))).toEqual({ onTime: 1, total: 2 });
    expect(stepsOnTime([])).toBeNull();
  });

  it('shows the drill day, the people there and the steps on time as three tiles', () => {
    open({ ...filed, response: [{ step: 0, expectedSec: 60, actualSec: 90 }, { step: 3, expectedSec: 90, actualSec: 80 }] });
    expect(screen.getByRole('group', { name: 'Drill day: 22 Nov' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'People present: 12' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Steps started on time: 1 of 2' })).toBeInTheDocument();
  });

  it('leaves out the tiles it has no figure for', () => {
    open({ ...filed, drillDay: undefined, filedAt: undefined, receivedAt: undefined, personsPresent: undefined, headCountShort: undefined, response: [] });
    expect(screen.queryByRole('group', { name: /Drill day/ })).toBeNull();
    expect(screen.queryByRole('group', { name: /People present/ })).toBeNull();
    expect(screen.queryByRole('group', { name: /on time/ })).toBeNull();
  });

  it('puts the response bars and the progress list in cards with their own headings', () => {
    open(filed);
    expect(screen.getByRole('heading', { name: 'How fast each step started' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Where it stands' })).toBeInTheDocument();
  });

  it('says it in Hindi and Hinglish', () => {
    const hi = open(filed, 'hi');
    expect(hi.container.textContent).toContain('मौजूद लोग');
    expect(hi.container.textContent).toContain('2 में से 2');
    hi.unmount();
    const hl = open(filed, 'hl');
    expect(hl.container.textContent).toContain('Maujood log');
    expect(hl.container.textContent).not.toMatch(/[\u0900-\u097F]/);
  });
});
