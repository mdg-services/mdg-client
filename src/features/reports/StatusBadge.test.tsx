import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { STATUS_STYLE, StatusBadge, statusFromTag, statusWord } from './StatusBadge';
import type { ReportStatusKey } from './types';

const ALL: ReportStatusKey[] = ['problem', 'attention', 'waiting', 'ok', 'info'];

describe('StatusBadge', () => {
  it('always says the status in words, in the reader’s language', () => {
    for (const status of ALL) {
      const { unmount } = render(<StatusBadge status={status} lang="en" />);
      expect(screen.getByText(STATUS_STYLE[status].word.en)).toBeInTheDocument();
      unmount();
    }
    render(<StatusBadge status="attention" lang="hi" />);
    expect(screen.getByText('ध्यान दें')).toBeInTheDocument();
  });

  it('draws five different shapes, none of them only a colour', () => {
    const signatures = new Set<string>();
    for (const status of ALL) {
      const { container, unmount } = render(<StatusBadge status={status} lang="en" />);
      const svg = container.querySelector('svg')!;
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      // The outline: polygon (octagon / triangle) or circle, plus the mark inside.
      signatures.add(svg.innerHTML);
      unmount();
    }
    expect(signatures.size).toBe(5);
    // The problem is an octagon (8 points) and the look is a triangle (3 points).
    const octagon = render(<StatusBadge status="problem" lang="en" />).container.querySelector('polygon')!;
    expect(octagon.getAttribute('points')!.trim().split(/\s+/)).toHaveLength(8);
    const triangle = render(<StatusBadge status="attention" lang="en" />).container.querySelector('polygon')!;
    expect(triangle.getAttribute('points')!.trim().split(/\s+/)).toHaveLength(3);
  });

  it('uses the ADR colours', () => {
    expect(STATUS_STYLE.problem.color).toBe('#b91c1c');
    expect(STATUS_STYLE.attention.color).toBe('#92400e');
    expect(STATUS_STYLE.waiting.color).toBe('#1d4ed8');
    expect(STATUS_STYLE.ok.color).toBe('#166534');
    expect(STATUS_STYLE.info.color).toBe('#475569');
    const { container } = render(<StatusBadge status="problem" lang="en" />);
    // A quiet tag: the status's ink on its pale tint (both theme-aware variables).
    expect(container.firstElementChild).toHaveStyle({ backgroundColor: 'var(--status-problem-soft)', color: 'var(--status-problem-ink)' });
  });

  it('can replace the standard word with the kind’s own ("Short")', () => {
    render(<StatusBadge status="problem" lang="en" word="Short" />);
    expect(screen.getByText('Short')).toBeInTheDocument();
    expect(screen.queryByText('Problem')).not.toBeInTheDocument();
  });

  it('draws the shape alone with the word as its name', () => {
    render(<StatusBadge status="ok" lang="en" showWord={false} />);
    expect(screen.getByRole('img', { name: 'All fine' })).toBeInTheDocument();
    expect(screen.queryByText('All fine')).not.toBeInTheDocument();
  });

  it('has the status words in all three languages, and maps a report tag to itself', () => {
    for (const status of ALL) {
      for (const lang of ['hi', 'hl', 'en'] as const) expect(statusWord(status, lang)).not.toBe('');
    }
    expect(statusFromTag('attention')).toBe('attention');
  });
});
