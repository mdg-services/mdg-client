import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it } from 'vitest';

import { linkify } from './linkify';

const renderBody = (text: string) => render(<p>{linkify(text)}</p>);

describe('linkify', () => {
  it('returns plain text untouched', () => {
    const { container } = renderBody('no links here');
    expect(container.querySelector('a')).toBeNull();
    expect(screen.getByText('no links here')).toBeInTheDocument();
  });

  it('turns an http(s) URL into a safe external link', () => {
    renderBody('see https://example.com/path?x=1 for details');
    const a = screen.getByRole('link');
    expect(a).toHaveAttribute('href', 'https://example.com/path?x=1');
    expect(a).toHaveAttribute('target', '_blank');
    expect(a).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('keeps surrounding text and handles multiple URLs', () => {
    const { container } = renderBody(
      'a http://one.test b https://two.test/x c',
    );
    const links = container.querySelectorAll('a');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', 'http://one.test');
    expect(links[1]).toHaveAttribute('href', 'https://two.test/x');
    expect(container.textContent).toBe('a http://one.test b https://two.test/x c');
  });

  it('never links non-http(s) schemes', () => {
    const { container } = renderBody(
      'ftp://files.test javascript:alert(1) mailto:x@y.z',
    );
    expect(container.querySelector('a')).toBeNull();
  });

  it('stops at closing quotes/brackets and whitespace', () => {
    renderBody('("https://example.com/a") end');
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      'https://example.com/a',
    );
  });

  it('renders HTML in the body as inert text (React escaping)', () => {
    const { container } = renderBody('<img src=x onerror=alert(1)> https://ok.test');
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelectorAll('a')).toHaveLength(1);
  });
});

describe('linkify — highlighting a search', () => {
  const renderMarked = (text: string, highlight: string) =>
    render(<p>{linkify(text, { highlight })}</p>);

  it('paints every occurrence, whatever the case, keeping the text as it was written', () => {
    const { container } = renderMarked('Dal Rate up, rate down, RATE flat', 'rate');
    const marks = container.querySelectorAll('mark');
    expect(Array.from(marks).map((m) => m.textContent)).toEqual(['Rate', 'rate', 'RATE']);
    expect(container.textContent).toBe('Dal Rate up, rate down, RATE flat');
    expect(marks[0]!.className).toContain('bg-wa-search-hit');
  });

  it('treats what was typed as letters, not as a pattern', () => {
    const { container } = renderMarked('cost (inc. tax) is 5+5', '(inc.');
    expect(container.querySelectorAll('mark')).toHaveLength(1);
    expect(container.querySelector('mark')!.textContent).toBe('(inc.');
    const plus = renderMarked('5+5 and 55', '5+5');
    expect(plus.container.querySelectorAll('mark')).toHaveLength(1);
  });

  it('finds Hindi words', () => {
    const { container } = renderMarked('आज की रिपोर्ट बन गई', 'रिपोर्ट');
    expect(container.querySelector('mark')!.textContent).toBe('रिपोर्ट');
  });

  it('leaves a link as a link, and marks the words around it', () => {
    const { container } = renderMarked('see https://example.com/rate for the rate', 'rate');
    const link = container.querySelector('a')!;
    expect(link.getAttribute('href')).toBe('https://example.com/rate');
    expect(link.querySelector('mark')).toBeNull();
    expect(link.textContent).toBe('https://example.com/rate');
    // "rate" in "for the rate" is marked; the one inside the URL is not.
    expect(container.querySelectorAll('mark')).toHaveLength(1);
  });

  it('does nothing for an empty or blank highlight', () => {
    expect(renderMarked('some words', '').container.querySelector('mark')).toBeNull();
    expect(renderMarked('some words', '   ').container.querySelector('mark')).toBeNull();
    // And still returns the plain string, not an array of one.
    expect(linkify('some words', { highlight: '' })).toBe('some words');
  });

  it('marks nothing when the words are not there', () => {
    const { container } = renderMarked('nothing to see', 'zzz');
    expect(container.querySelector('mark')).toBeNull();
    expect(container.textContent).toBe('nothing to see');
  });

  it('stays inert: a body that looks like HTML is still text, marked or not', () => {
    const { container } = renderMarked('<b>rate</b> <img src=x onerror=alert(1)>', 'rate');
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('mark')!.textContent).toBe('rate');
  });
});

