import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useLangStore } from '@/store/lang';
import { renderWithProviders, resetStores } from '@/test/utils';

import {
  AsOf,
  BandBar,
  DayStrip,
  DeltaChip,
  EmptyCalm,
  ErrorCard,
  InsightRow,
  ListRow,
  MiniBars,
  Num,
  PillGroup,
  ProgressBar,
  SectionCard,
  SkeletonBlock,
  StatTile,
  StatusPill,
  StickyAction,
  VerdictCard,
} from './index';

afterEach(() => resetStores());

function lang(l: 'en' | 'hi' | 'hl') {
  useLangStore.setState({ lang: l, explicit: true });
}

/** Every control the kit draws is 44px or more by its own classes. */
function expectTappable(el: HTMLElement) {
  expect(el.className, el.outerHTML.slice(0, 80)).toMatch(/\bmin-h-(11|12|14)\b|\bh-11\b/);
}

describe('Num', () => {
  it('writes a number with Indian grouping and keeps it in one piece', () => {
    render(<Num value={118000} />);
    const el = screen.getByText('1,18,000');
    expect(el.className).toContain('whitespace-nowrap');
  });

  it('keeps already-formatted text in one piece too', () => {
    render(<Num>24,330 L</Num>);
    expect(screen.getByText('24,330 L').className).toContain('whitespace-nowrap');
  });
});

describe('StatusPill', () => {
  it.each([
    ['problem', 'Problem'],
    ['attention', 'Needs a look'],
    ['waiting', 'We are on it'],
    ['ok', 'All fine'],
    ['info', 'Info'],
  ] as const)('draws a shape AND the word for %s', (status, word) => {
    lang('en');
    const { container } = render(<StatusPill status={status} />);
    expect(screen.getByText(word)).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.firstElementChild).toHaveAttribute('data-status', status);
  });

  it('says "Stopped" with the octagon', () => {
    lang('en');
    const { container } = render(<StatusPill status="stopped" />);
    expect(screen.getByText('Stopped')).toBeInTheDocument();
    expect(container.querySelector('polygon')).not.toBeNull();
  });

  it('says its word in Hindi and Hinglish', () => {
    lang('hi');
    const hi = render(<StatusPill status="attention" />);
    expect(screen.getByText('ध्यान दें')).toBeInTheDocument();
    hi.unmount();
    lang('hl');
    render(<StatusPill status="stopped" />);
    expect(screen.getByText('Thap hai')).toBeInTheDocument();
  });

  it('puts a caller\'s own word in place of the standard one, and still draws the shape', () => {
    lang('en');
    const { container } = render(<StatusPill status="problem" word="Short by 40 L" />);
    expect(screen.getByText('Short by 40 L')).toBeInTheDocument();
    expect(screen.queryByText('Problem')).not.toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('lets the word wrap and never cuts it', () => {
    render(<StatusPill status="ok" />);
    expect(document.body.innerHTML).not.toMatch(/truncate|line-clamp/);
  });
});

describe('AsOf', () => {
  const NOW = new Date('2026-11-27T05:00:00.000Z');

  it('says the clock time', () => {
    lang('en');
    render(<AsOf at="2026-11-27T04:10:00.000Z" />);
    expect(screen.getByText('as of 9:40 am')).toBeInTheDocument();
  });

  it('says "Checked" for an old feed', () => {
    lang('en');
    render(<AsOf at="2026-11-27T03:40:00.000Z" checked />);
    expect(screen.getByText('Checked 9:10 am')).toBeInTheDocument();
  });

  it('says the day, in the reader\'s words', () => {
    lang('hi');
    render(<AsOf at="2026-11-26" kind="day" now={NOW} />);
    expect(screen.getByText('कल की')).toBeInTheDocument();
  });

  it('says "from yesterday" in English and Hinglish', () => {
    lang('en');
    const en = render(<AsOf at="2026-11-26" kind="day" now={NOW} />);
    expect(screen.getByText('from yesterday')).toBeInTheDocument();
    en.unmount();
    lang('hl');
    render(<AsOf at="2026-11-26" kind="day" now={NOW} />);
    expect(screen.getByText('Kal ki')).toBeInTheDocument();
  });

  it('shows words it cannot read as a date exactly as given', () => {
    lang('en');
    render(<AsOf at="today 7:05 am" />);
    expect(screen.getByText('today 7:05 am')).toBeInTheDocument();
  });
});

describe('DeltaChip', () => {
  it.each([
    ['up', 8, '%', 'last Monday', '8% more than last Monday'],
    ['down', 8, '%', 'last Monday', '8% less than last Monday'],
    ['up', 1200, 'L', 'yesterday', '1,200 L more than yesterday'],
  ] as const)('says %s with an arrow, words and the number', (dir, n, unit, against, text) => {
    lang('en');
    const { container } = render(<DeltaChip dir={dir} n={n} unit={unit} against={against} />);
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('says "same" with its own shape', () => {
    lang('en');
    const { container } = render(<DeltaChip dir="same" against="last Monday" />);
    expect(screen.getByText('Same as last Monday')).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('still says more or less when there is no number', () => {
    lang('en');
    render(<DeltaChip dir="down" against="last Monday" />);
    expect(screen.getByText('Less than last Monday')).toBeInTheDocument();
  });

  it('puts the sentence in Hindi word order', () => {
    lang('hi');
    render(<DeltaChip dir="up" n={8} unit="%" against="पिछले सोमवार" />);
    expect(screen.getByText('पिछले सोमवार से 8% ज़्यादा')).toBeInTheDocument();
  });

  it('is not red or green: the direction is the arrow and the words', () => {
    const { container } = render(<DeltaChip dir="down" n={3} unit="%" against="x" />);
    expect(container.innerHTML).not.toMatch(/red|green|danger|success/);
  });
});

describe('ProgressBar', () => {
  it('is a progressbar with its number in words, and always shows the number', () => {
    render(<ProgressBar value={10} max={12} text="10 of 12 done" />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '10');
    expect(bar).toHaveAttribute('aria-valuemax', '12');
    expect(bar).toHaveAttribute('aria-valuetext', '10 of 12 done');
    expect(screen.getByText('10 of 12 done')).toBeInTheDocument();
  });

  it('names its marker in words as well as drawing it', () => {
    render(<ProgressBar value={40} max={100} text="40% used" marker={{ at: 80, label: 'limit 80%' }} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '40% used, limit 80%');
    expect(screen.getByText(/limit 80%/)).toBeInTheDocument();
  });

  it('stays inside its track when the value is out of range', () => {
    const { container } = render(<ProgressBar value={500} max={100} text="500 of 100" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    expect((container.querySelector('[style*="width"]') as HTMLElement).style.width).toBe('100%');
  });
});

describe('MiniBars', () => {
  const data = [
    { label: 'Mon', value: 100 },
    { label: 'Tue', value: null },
    { label: 'Wed', value: 24100 },
  ];

  it('is one image named by its spoken summary', () => {
    lang('en');
    render(<MiniBars data={data} summary="Last 3 days, highest 24,100 litres on Wednesday" />);
    expect(screen.getByRole('img', { name: 'Last 3 days, highest 24,100 litres on Wednesday' })).toBeInTheDocument();
  });

  it('carries the same numbers in a visually hidden table', () => {
    lang('en');
    render(<MiniBars data={data} summary="s" />);
    const table = screen.getByRole('table');
    // The wrapper is what is hidden: a bare `table.sr-only` keeps its table layout and widens the page at large text.
    expect(table.closest('.sr-only')).not.toBeNull();
    expect(table.className).not.toContain('sr-only');
    expect(within(table).getByText('24,100')).toBeInTheDocument();
    expect(within(table).getByRole('row', { name: /Tue none/ })).toBeInTheDocument();
    expect(within(table).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Day', 'Amount']);
  });

  it('draws a missing day as a hollow stub with the word "none", not a bar of zero', () => {
    lang('en');
    const { container } = render(<MiniBars data={data} summary="s" />);
    expect(container.querySelector('.border-dashed')).not.toBeNull();
    expect(screen.getAllByText('none').length).toBeGreaterThan(0);
  });

  it('outlines today\'s bar and tags it "today"', () => {
    lang('en');
    const { container } = render(<MiniBars data={data} todayIndex={2} summary="s" />);
    expect(screen.getByText('today')).toBeInTheDocument();
    expect(container.querySelector('.border-brand')).not.toBeNull();
  });

  it('draws a dashed line at the average', () => {
    const { container } = render(<MiniBars data={data} average={5000} summary="s" />);
    expect(container.querySelector('.border-dashed.border-t-2')).not.toBeNull();
  });

  it('keeps the last 14 days only, and sizes bars in percent of a rem-sized box', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ label: `d${i}`, value: i + 1 }));
    const { container } = render(<MiniBars data={many} summary="s" />);
    expect(screen.getAllByRole('row')).toHaveLength(15); // 14 days and the header row
    const bar = container.querySelector('[style*="height"]') as HTMLElement;
    expect(bar.style.height).toMatch(/%$/);
    expect(container.innerHTML).not.toMatch(/h-\[\d+px/);
  });

  it('writes in Hindi', () => {
    lang('hi');
    render(<MiniBars data={data} summary="s" />);
    expect(screen.getByRole('columnheader', { name: 'दिन' })).toBeInTheDocument();
    expect(screen.getAllByText('कोई नहीं').length).toBeGreaterThan(0);
  });
});

describe('BandBar', () => {
  it('names the fuel, the number, the word and the allowed range', () => {
    lang('en');
    render(<BandBar fuel="Diesel" value={-45} low={-100} high={100} word="inside the limit" status="ok" />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('aria-label', 'Diesel: -45. inside the limit. Allowed -100 to 100');
    expect(screen.getByText('inside the limit')).toBeInTheDocument();
  });

  it('draws the status shape with the word, so it is not read from the picture alone', () => {
    lang('en');
    const { container } = render(<BandBar fuel="Petrol" value={300} low={-100} high={100} word="beyond the limit" status="attention" />);
    expect(container.querySelector('[data-status="attention"] svg')).not.toBeNull();
  });

  it('keeps the marker inside the track even when far outside the band', () => {
    const { container } = render(<BandBar fuel="Diesel" value={9999} low={-100} high={100} word="w" status="problem" />);
    const marker = container.querySelector('[style*="left"]:not([class*="rounded-sm"])') as HTMLElement;
    expect(parseFloat(marker.style.left)).toBeLessThanOrEqual(100);
  });
});

describe('PillGroup', () => {
  const options = [
    { id: 'a', label: 'Services' },
    { id: 'b', label: 'Reports', count: 3 },
  ];

  it('is a labelled radiogroup with the chosen segment checked', () => {
    render(<PillGroup label="Show" value="a" options={options} onChange={() => undefined} />);
    expect(screen.getByRole('radiogroup', { name: 'Show' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Services' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /Reports/ })).toHaveAttribute('aria-checked', 'false');
  });

  it('gives every segment 44px and names its count aloud', () => {
    lang('en');
    render(<PillGroup label="Show" value="a" options={options} onChange={() => undefined} />);
    for (const r of screen.getAllByRole('radio')) expectTappable(r);
    expect(screen.getByRole('radio', { name: 'Reports, 3' })).toBeInTheDocument();
  });

  it('calls onChange with the id tapped', () => {
    const onChange = vi.fn();
    render(<PillGroup label="Show" value="a" options={options} onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: /Reports/ }));
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('moves with the arrow keys', () => {
    const onChange = vi.fn();
    render(<PillGroup label="Show" value="a" options={options} onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Services' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('wraps its segments at large text instead of squeezing', () => {
    render(<PillGroup label="Show" value="a" options={options} onChange={() => undefined} />);
    expect(screen.getByRole('radiogroup').className).toContain('flex-wrap');
  });
});

describe('ListRow', () => {
  it('is a button of at least 56px when tappable, with a chevron, and names wrap', () => {
    const onPress = vi.fn();
    const { container } = render(<ListRow title="A very long Hindi-ish service name that must wrap" onPress={onPress} />);
    const row = screen.getByRole('button');
    expect(row.className).toContain('min-h-14');
    expect(container.querySelector('svg')).not.toBeNull();
    expect(row.innerHTML).toContain('break-words');
    expect(row.innerHTML).not.toMatch(/truncate|line-clamp/);
    fireEvent.click(row);
    expect(onPress).toHaveBeenCalled();
  });

  it('is plain text, not a button, with no handler', () => {
    render(<ListRow title="Static" subtitle="small print" trailing="3" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('small print')).toBeInTheDocument();
  });

  it('can be disabled', () => {
    render(<ListRow title="X" onPress={() => undefined} disabled />);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});

describe('InsightRow', () => {
  it('puts the status shape and word with the sentence', () => {
    lang('en');
    render(<InsightRow status="attention" text="Diesel lasts 4 days" meta="from 9:40 am" />);
    expect(screen.getByText('Needs a look')).toBeInTheDocument();
    expect(screen.getByText('Diesel lasts 4 days')).toBeInTheDocument();
    expect(screen.getByText('from 9:40 am')).toBeInTheDocument();
  });

  it('is at least 56px tall and shows a right-aligned value', () => {
    const { container } = render(<InsightRow text="Deposit" value="Rs 1,18,000" />);
    expect((container.firstElementChild as HTMLElement).className).toContain('min-h-14');
    expect(screen.getByText('Rs 1,18,000')).toBeInTheDocument();
  });

  it('makes the whole row a 44px button when it has onPress', () => {
    const onPress = vi.fn();
    render(<InsightRow text="Open it" onPress={onPress} />);
    const row = screen.getByRole('button', { name: /Open it/ });
    expectTappable(row);
    fireEvent.click(row);
    expect(onPress).toHaveBeenCalled();
  });

  it('gives its action a 44px button of its own, beside the row button', () => {
    const onRow = vi.fn();
    const onAction = vi.fn();
    render(<InsightRow text="Send the photo" onPress={onRow} action={{ label: 'Send photo', onPress: onAction }} />);
    const action = screen.getByRole('button', { name: 'Send photo' });
    expectTappable(action);
    fireEvent.click(action);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onRow).not.toHaveBeenCalled();
  });
});

describe('SectionCard', () => {
  it('is a region named by its title, with a count and a 44px "See all"', () => {
    const onPress = vi.fn();
    render(
      <SectionCard title="New reports" count={4} seeAll={{ label: 'See all', onPress }}>
        <p>body</p>
      </SectionCard>,
    );
    const region = screen.getByRole('region', { name: /New reports/ });
    expect(within(region).getByText('4')).toBeInTheDocument();
    const seeAll = within(region).getByRole('button', { name: 'See all' });
    expectTappable(seeAll);
    fireEvent.click(seeAll);
    expect(onPress).toHaveBeenCalled();
  });

  it('draws list rows with hairline dividers', () => {
    render(
      <SectionCard title="T" variant="list">
        <div>row</div>
      </SectionCard>,
    );
    expect(screen.getByText('row').parentElement!.className).toContain('divide-y');
  });

  it('has the card look: 12px corners, a hairline border, a light shadow', () => {
    render(
      <SectionCard title="T">
        <div />
      </SectionCard>,
    );
    const cls = screen.getByRole('region').className;
    expect(cls).toContain('rounded-xl');
    expect(cls).toContain('border-border');
    expect(cls).toContain('shadow-sm');
  });
});

describe('VerdictCard', () => {
  it('says the verdict as a shape and a word, and reads as a region named by the word', () => {
    const { container } = render(<VerdictCard status="ok" word="All fine" />);
    expect(screen.getByRole('region', { name: 'All fine' })).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'All fine' })).toBeInTheDocument();
  });

  it.each(['unknown', 'setup'] as const)('draws %s as the circle-i, never a tick', (status) => {
    const { container } = render(<VerdictCard status={status} word="Cannot check right now" />);
    expect(container.querySelector('polygon')).toBeNull();
    expect(container.querySelector('path[d^="M6 10.4"]')).toBeNull(); // the tick
    expect(container.querySelector('circle')).not.toBeNull();
  });

  it('puts the number before the label in its counts, and they are not buttons', () => {
    render(
      <VerdictCard
        status="waiting"
        word="2 things wait for you"
        counts={[
          { label: 'need you', n: 2 },
          { label: 'need a look', n: 1 },
        ]}
      />,
    );
    expect(screen.getByText('need you').parentElement).toHaveTextContent('2 need you');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('drops the sentence at large text but keeps the word and the counts', () => {
    render(
      <VerdictCard status="attention" word="1 thing needs a look" sentence="Diesel lasts 4 days." counts={[{ label: 'need a look', n: 1 }]} compact />,
    );
    expect(screen.queryByText('Diesel lasts 4 days.')).not.toBeInTheDocument();
    expect(screen.getByText('1 thing needs a look')).toBeInTheDocument();
    expect(screen.getByText('need a look')).toBeInTheDocument();
  });

  it('shows the sentence, the as-of line and its children otherwise', () => {
    render(
      <VerdictCard status="attention" word="w" sentence="Diesel lasts 4 days." asOf={<span>as of 9:40 am</span>}>
        <p>notices</p>
      </VerdictCard>,
    );
    expect(screen.getByText('Diesel lasts 4 days.')).toBeInTheDocument();
    expect(screen.getByText('as of 9:40 am')).toBeInTheDocument();
    expect(screen.getByText('notices')).toBeInTheDocument();
  });
});

describe('StatTile', () => {
  it('is a labelled group with the number, never shrunk, when it has no tap', () => {
    render(<StatTile label="Sales" value={<Num value={24330} />} unit="L" ariaLabel="Sales yesterday 24,330 litres" />);
    expect(screen.getByRole('group', { name: 'Sales yesterday 24,330 litres' })).toBeInTheDocument();
    const value = screen.getByText('24,330');
    expect(value.closest('span.text-display')).not.toBeNull();
    expect(document.body.innerHTML).not.toMatch(/text-\[|scale-|truncate/);
  });

  it('is ONE button when it has onPress, named by the caller\'s words', () => {
    const onPress = vi.fn();
    render(<StatTile label="Sales" value="1" ariaLabel="Sales, all fine" onPress={onPress} />);
    const tile = screen.getByRole('button', { name: 'Sales, all fine' });
    expectTappable(tile);
    fireEvent.click(tile);
    expect(onPress).toHaveBeenCalled();
  });

  it('shows the status as a pill only when it is not "ok"', () => {
    lang('en');
    const ok = render(<StatTile label="S" value="1" status="ok" ariaLabel="S" />);
    expect(screen.queryByText('All fine')).not.toBeInTheDocument();
    ok.unmount();
    render(<StatTile label="S" value="1" status="problem" ariaLabel="S" />);
    expect(screen.getByText('Problem')).toBeInTheDocument();
  });

  it('draws one row per fuel instead of one big number', () => {
    lang('en');
    render(
      <StatTile
        label="Variation"
        value="x"
        rows={[
          { label: 'Diesel', value: '-45 L' },
          { label: 'Petrol', value: '+120 L', status: 'attention' },
        ]}
        ariaLabel="Variation"
      />,
    );
    expect(screen.getByText('Diesel')).toBeInTheDocument();
    expect(screen.getByText('Petrol')).toBeInTheDocument();
    expect(screen.getByText('Needs a look')).toBeInTheDocument();
    expect(screen.queryByText('x')).not.toBeInTheDocument();
  });

  it('carries a change, bars, a caption and an as-of line', () => {
    lang('en');
    render(
      <StatTile
        label="Sales"
        value="1"
        delta={{ dir: 'up', n: 8, unit: '%', against: 'last Monday' }}
        bars={{ data: [{ label: 'Mon', value: 3 }], summary: 'sales bars' }}
        caption="Diesel and petrol"
        asOf="from yesterday"
        ariaLabel="Sales"
      />,
    );
    expect(screen.getByText('8% more than last Monday')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'sales bars' })).toBeInTheDocument();
    expect(screen.getByText('Diesel and petrol')).toBeInTheDocument();
    expect(screen.getByText('from yesterday')).toBeInTheDocument();
  });
});

describe('DayStrip', () => {
  const NOW = new Date('2026-11-27T05:00:00.000Z');
  const days = [
    { day: '2026-11-24', state: 'came' as const },
    { day: '2026-11-25', state: 'none' as const },
    { day: '2026-11-26', state: 'look' as const },
  ];

  it('gives every dot a spoken label that says what happened that day', () => {
    lang('en');
    render(<DayStrip days={days} subject="sales report" now={NOW} />);
    expect(screen.getByRole('img', { name: 'sales report for Tue 24 Nov' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'No sales report for Wed 25 Nov' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'sales report for yesterday needs a look' })).toBeInTheDocument();
  });

  it('uses a different shape for each state, never colour alone', () => {
    lang('en');
    const { container } = render(<DayStrip days={days} now={NOW} />);
    const shapes = Array.from(container.querySelectorAll('li svg')).map((s) => s.innerHTML);
    expect(new Set(shapes).size).toBe(3);
  });

  it('draws a day letter under each dot', () => {
    lang('en');
    render(<DayStrip days={days} now={NOW} />);
    // Tuesday and Thursday are both "T"; Wednesday is "W".
    expect(screen.getAllByText('T')).toHaveLength(2);
    expect(screen.getByText('W')).toBeInTheDocument();
  });

  it('makes a dot with onPress a 44px button', () => {
    lang('en');
    const onPress = vi.fn();
    render(<DayStrip days={[{ day: '2026-11-24', state: 'came', onPress }]} now={NOW} />);
    const dot = screen.getByRole('button');
    expectTappable(dot);
    fireEvent.click(dot);
    expect(onPress).toHaveBeenCalled();
  });

  it('wraps onto a second row at large text instead of squeezing', () => {
    render(<DayStrip days={days} now={NOW} />);
    expect(screen.getByRole('list').className).toContain('auto-fit');
  });

  it('writes the labels in Hindi', () => {
    lang('hi');
    render(<DayStrip days={days} now={NOW} />);
    expect(screen.getByRole('img', { name: 'मंगल 24 नवंबर की रिपोर्ट' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'बुध 25 नवंबर की रिपोर्ट नहीं आई' })).toBeInTheDocument();
  });
});

describe('EmptyCalm, ErrorCard and SkeletonBlock', () => {
  it('EmptyCalm says one calm sentence with a shape, and at most one button', () => {
    const onPress = vi.fn();
    const { container } = render(<EmptyCalm text="Nothing to do today" status="ok" action={{ label: 'See reports', onPress }} />);
    expect(screen.getByText('Nothing to do today')).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeNull();
    const button = screen.getByRole('button', { name: 'See reports' });
    expectTappable(button);
    fireEvent.click(button);
    expect(onPress).toHaveBeenCalled();
  });

  it('EmptyCalm with no action has no button', () => {
    render(<EmptyCalm text="No chats" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('ErrorCard is an alert with a "Try again" button that retries', () => {
    lang('en');
    const onRetry = vi.fn();
    renderWithProviders(<ErrorCard text="Could not load" onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load');
    const retry = screen.getByRole('button', { name: 'Try again' });
    expectTappable(retry);
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalled();
  });

  it('ErrorCard says "Try again" in Hindi', () => {
    lang('hi');
    render(<ErrorCard text="x" onRetry={() => undefined} />);
    expect(screen.getByRole('button', { name: 'फिर कोशिश करें' })).toBeInTheDocument();
  });

  it('SkeletonBlock is announced once as loading, with the lines in rem', () => {
    lang('en');
    const { container } = render(<SkeletonBlock lines={3} />);
    expect(screen.getByRole('status', { name: 'Loading…' })).toBeInTheDocument();
    expect(container.querySelectorAll('[aria-hidden]')).toHaveLength(3);
    expect(container.innerHTML).not.toMatch(/\d+px/);
  });
});

describe('StickyAction', () => {
  it('is a 48px button across the width, stuck to the bottom', () => {
    const onPress = vi.fn();
    const { container } = render(<StickyAction label="Give points" onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Give points' });
    expect(button.className).toContain('min-h-12');
    expect(button.className).toContain('w-full');
    expect((container.firstElementChild as HTMLElement).className).toContain('sticky');
    expect((container.firstElementChild as HTMLElement).className).toContain('bottom-0');
    fireEvent.click(button);
    expect(onPress).toHaveBeenCalled();
  });

  it('can be disabled and can show it is working', () => {
    const onPress = vi.fn();
    const { rerender } = render(<StickyAction label="Send" onPress={onPress} disabled />);
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    rerender(<StickyAction label="Send" onPress={onPress} loading />);
    expect(screen.getByRole('button', { name: /Send/ })).toBeDisabled();
  });
});
