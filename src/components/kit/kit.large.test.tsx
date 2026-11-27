import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useLangStore } from '@/store/lang';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';

import { InsightRow, MyPumpButton, NoticesRow, PageHeader, PillGroup, SectionCard, VerdictCard } from './index';

const h = vi.hoisted(() => ({ large: false }));
vi.mock('@/lib/useLargeText', () => ({ useLargeText: () => h.large }));

beforeEach(() => {
  useLangStore.setState({ lang: 'en', explicit: true });
  signIn({ id: 'u1' });
});
afterEach(() => {
  resetStores();
  h.large = false;
});

/**
 * What the kit does when the reader's text is at 140% or more (spec 2.3, 6.2). Measured in Chrome at
 * 360 x 640 and 200% (Appendix A of the spec): the parts shed their sub-lines, icons and rem floors so
 * the verdict word and the first thing to do still fit above the bar.
 */
describe('the kit at large text', () => {
  describe('PageHeader (a door\'s bar)', () => {
    it('keeps its sub-line at normal size', () => {
      renderWithProviders(<PageHeader variant="tab" title="Today" subtitle={<span>as of 9:40 am</span>} />);
      expect(screen.getByText('as of 9:40 am')).toBeInTheDocument();
    });

    it('drops the sub-line, and lets "My pump" wrap under a title that does not leave it room', () => {
      h.large = true;
      renderWithProviders(<PageHeader variant="tab" title="Today" subtitle={<span>as of 9:40 am</span>} />);
      expect(screen.queryByText('as of 9:40 am')).not.toBeInTheDocument();
      const heading = screen.getByRole('heading', { name: 'Today' });
      expect(screen.getByRole('banner').firstElementChild!.className).toContain('flex-wrap');
      // The title keeps its own width (never squeezed to a sliver beside the button) and never splits a word.
      expect(heading.parentElement!.className).toContain('flex-auto');
      expect(heading.className).toContain('hyphens-none');
      expect(screen.getByRole('button', { name: 'My pump' }).className).toContain('shrink-0');
    });

    it('is pinned at normal size and scrolls away at large text', () => {
      renderWithProviders(<PageHeader variant="tab" title="Today" />);
      expect(screen.getByRole('banner').className).toContain('sticky');
      cleanup();
      h.large = true;
      renderWithProviders(<PageHeader variant="tab" title="Today" />);
      expect(screen.getByRole('banner').className).not.toContain('sticky');
    });

    it('keeps the same 16 px gutter on the right as on the left of a door\'s bar', () => {
      renderWithProviders(<PageHeader variant="tab" title="Today" />);
      expect(screen.getByRole('banner').firstElementChild!.className).toContain('px-4');
    });

    it('keeps a sub-page\'s title beside its arrow at large text, and unpins it', () => {
      h.large = true;
      renderWithProviders(<PageHeader variant="sub" title="Papers" />);
      expect(screen.getByRole('button', { name: 'Back' }).nextElementSibling).toBe(
        screen.getByRole('heading', { name: 'Papers' }).parentElement,
      );
      expect(screen.getByRole('banner').className).not.toContain('sticky');
    });

    it('keeps a sub-page\'s sub-line: its bar has no button beside the title', () => {
      h.large = true;
      renderWithProviders(<PageHeader variant="sub" title="Papers" subtitle={<span>small</span>} />);
      expect(screen.getByText('small')).toBeInTheDocument();
    });

    it('keeps the arrow at 44 px', () => {
      h.large = true;
      renderWithProviders(<PageHeader variant="sub" title="Papers" />);
      expect(screen.getByRole('button', { name: 'Back' }).className).toContain('h-11');
    });
  });

  describe('MyPumpButton', () => {
    it('keeps its icon at normal size', () => {
      const { container } = renderWithProviders(<MyPumpButton />);
      expect(container.querySelector('button svg')).not.toBeNull();
    });

    it('loses the icon, keeps the words and the 44 px floor', () => {
      h.large = true;
      const { container } = renderWithProviders(<MyPumpButton />);
      const button = screen.getByRole('button', { name: 'My pump' });
      expect(container.querySelector('button svg')).toBeNull();
      expect(button).toHaveTextContent('My pump');
      expect(button.className).toContain('min-h-tap');
    });
  });

  describe('VerdictCard', () => {
    const props = {
      status: 'waiting' as const,
      word: '2 things wait for you',
      sentence: 'Diesel lasts 4 days.',
      counts: [{ label: 'need you', n: 2 }],
      asOf: <span>as of 9:40 am</span>,
    };

    it('shows everything at normal size', () => {
      renderWithProviders(<VerdictCard {...props} />);
      expect(screen.getByText('Diesel lasts 4 days.')).toBeInTheDocument();
      expect(screen.getByText('as of 9:40 am')).toBeInTheDocument();
      expect(screen.getByText('need you').parentElement!.className).not.toContain('sr-only');
    });

    it('goes compact by itself at large text: the word stays, the rest goes', () => {
      h.large = true;
      renderWithProviders(<VerdictCard {...props} />);
      expect(screen.getByRole('heading', { name: '2 things wait for you' })).toBeInTheDocument();
      expect(screen.queryByText('Diesel lasts 4 days.')).not.toBeInTheDocument();
      expect(screen.queryByText('as of 9:40 am')).not.toBeInTheDocument();
    });

    it('keeps the counts for a screen reader when it is compact', () => {
      h.large = true;
      renderWithProviders(<VerdictCard {...props} />);
      const counts = screen.getByText('need you').parentElement!;
      expect(counts.className).toContain('sr-only');
      expect(counts).toHaveTextContent('2 need you');
    });

    it('lets a caller force it either way', () => {
      h.large = true;
      renderWithProviders(<VerdictCard {...props} compact={false} />);
      expect(screen.getByText('Diesel lasts 4 days.')).toBeInTheDocument();
    });
  });

  describe('SectionCard', () => {
    it('draws its title at normal size even when it may hide it', () => {
      renderWithProviders(
        <SectionCard title="Needs you" hideTitleAtLargeText>
          <p>row</p>
        </SectionCard>,
      );
      expect(screen.getByRole('heading', { name: 'Needs you' }).parentElement!.className).not.toContain('sr-only');
    });

    it('keeps the title for a screen reader but does not draw it at large text', () => {
      h.large = true;
      renderWithProviders(
        <SectionCard title="Needs you" hideTitleAtLargeText>
          <p>row</p>
        </SectionCard>,
      );
      expect(screen.getByRole('region', { name: /Needs you/ })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Needs you' }).parentElement!.className).toContain('sr-only');
    });

    it('still draws a title that has a "See all" button: it cannot be hidden', () => {
      h.large = true;
      renderWithProviders(
        <SectionCard title="Reports" hideTitleAtLargeText seeAll={{ label: 'See all', onPress: () => undefined }}>
          <p>row</p>
        </SectionCard>,
      );
      expect(screen.getByRole('heading', { name: 'Reports' }).parentElement!.className).not.toContain('sr-only');
    });

    it('is padded less at large text', () => {
      h.large = true;
      renderWithProviders(
        <SectionCard title="T">
          <p>row</p>
        </SectionCard>,
      );
      expect(screen.getByRole('region').className).toContain('p-2');
    });
  });

  describe('InsightRow', () => {
    it('puts the action beside the sentence at normal size', () => {
      const { container } = renderWithProviders(
        <InsightRow text="Send the photo" action={{ label: 'Send photo', onPress: () => undefined }} />,
      );
      expect((container.firstElementChild!.firstElementChild as HTMLElement).className).toContain('items-center');
      expect(container.firstElementChild!.className).not.toContain('flex-col');
    });

    it('puts the action under the sentence at large text, with the 44 px floor instead of the rem one', () => {
      h.large = true;
      const { container } = renderWithProviders(
        <InsightRow text="Send the photo" action={{ label: 'Send photo', onPress: () => undefined }} />,
      );
      expect(container.firstElementChild!.className).toContain('flex-col');
      const button = screen.getByRole('button', { name: 'Send photo' });
      expect(button.className).toContain('min-h-tap');
      expect(button.className).not.toContain('min-h-11');
    });
  });

  describe('NoticesRow', () => {
    it('sits on the 44 px floor at large text', () => {
      h.large = true;
      renderWithProviders(<NoticesRow notices={[{ id: 'a', text: 'Bill due in 5 days' }]} />);
      expect(screen.getByRole('button', { name: 'Bill due in 5 days' }).className).toContain('min-h-tap');
    });

    it('moves the bell and the arrow above the words at large text, so the words use the whole line', () => {
      h.large = true;
      renderWithProviders(<NoticesRow notices={[{ id: 'a', text: 'Bill due in 5 days' }]} />);
      const row = screen.getByRole('button', { name: 'Bill due in 5 days' });
      expect(row.className).toContain('flex-col');
      // The icons share a row of their own (hidden from a screen reader); the words are the last child, as wide as the row.
      const [icons, words] = Array.from(row.children) as HTMLElement[];
      expect(icons!.querySelectorAll('svg')).toHaveLength(2);
      expect(icons!.getAttribute('aria-hidden')).toBe('true');
      expect(words!.textContent).toBe('Bill due in 5 days');
      expect(row.children).toHaveLength(2);
    });

    it('keeps the bell, the words and the arrow on one line at normal text', () => {
      renderWithProviders(<NoticesRow notices={[{ id: 'a', text: 'Bill due in 5 days' }]} />);
      const row = screen.getByRole('button', { name: 'Bill due in 5 days' });
      expect(row.className).not.toContain('flex-col');
      expect(row.children).toHaveLength(3);
    });
  });
});

describe('the switch at large text', () => {
  const options = [
    { id: 'a', label: 'Services', count: 3 },
    { id: 'b', label: 'Reports' },
  ];

  it('is a column of full-width segments with the count on the label\'s line, and never splits a word', () => {
    h.large = true;
    renderWithProviders(<PillGroup label="Show" value="a" options={options} onChange={() => undefined} />);
    const group = screen.getByRole('radiogroup', { name: 'Show' });
    expect(group.className).toContain('flex-col');
    const first = screen.getByRole('radio', { name: /Services/ });
    expect(first.className).toContain('w-full');
    expect(first.className).toContain('min-h-tap');
    expect(first.textContent).toBe('Services3');
    expect(screen.getByText('Services').className).toContain('hyphens-none');
  });

  it('is a row at normal size', () => {
    renderWithProviders(<PillGroup label="Show" value="a" options={options} onChange={() => undefined} />);
    expect(screen.getByRole('radiogroup', { name: 'Show' }).className).toContain('flex-wrap');
  });
});

describe('InsightRow\'s button', () => {
  it('goes under the sentence when its label is long, and keeps no chevron beside a button', () => {
    renderWithProviders(
      <InsightRow text="Diesel lasts 1.5 days" action={{ label: 'Order taiyaar karein', onPress: () => undefined }} onPress={() => undefined} />,
    );
    const row = screen.getByRole('button', { name: 'Order taiyaar karein' }).parentElement!;
    expect(row.className).toContain('flex-col');
    expect(row.querySelector('svg')).toBeNull();
  });

  it('keeps a short label beside the sentence on a wide screen', () => {
    renderWithProviders(<InsightRow text="Diesel" action={{ label: 'Order', onPress: () => undefined }} />);
    const row = screen.getByRole('button', { name: 'Order' }).parentElement!;
    expect(row.className).not.toContain('flex-col');
  });
});
