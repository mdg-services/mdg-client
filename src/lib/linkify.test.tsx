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
