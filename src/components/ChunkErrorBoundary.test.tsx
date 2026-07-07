import { fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChunkErrorBoundary } from '@/components/ChunkErrorBoundary';

function Boom(): React.ReactElement {
  throw new Error('chunk load failed');
}

describe('ChunkErrorBoundary', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders children unchanged when nothing throws', () => {
    render(
      <ChunkErrorBoundary>
        <div>hello</div>
      </ChunkErrorBoundary>,
    );
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('renders the bilingual fallback with a retry button when a child throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {}); // expected boundary noise
    render(
      <ChunkErrorBoundary>
        <Boom />
      </ChunkErrorBoundary>,
    );
    expect(screen.getByText(/Something didn.t load/i)).toBeInTheDocument();
    expect(screen.getByText(/कुछ लोड नहीं हो पाया/)).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('invokes onReload when the Try again button is pressed', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onReload = vi.fn();
    render(
      <ChunkErrorBoundary onReload={onReload}>
        <Boom />
      </ChunkErrorBoundary>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('logs the underlying error via componentDidCatch (not swallowed silently)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ChunkErrorBoundary onReload={() => {}}>
        <Boom />
      </ChunkErrorBoundary>,
    );
    expect(spy.mock.calls.some((c) => String(c[0]).includes('chunk-load / render error'))).toBe(
      true,
    );
  });
});
