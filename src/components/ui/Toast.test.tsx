import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { resetStores } from '@/test/utils';

import { ToastProvider, useToast } from './Toast';

/**
 * Where a toast sits. There is no bottom tab bar to clear any more, so toasts
 * go just above the bottom edge — except in an open conversation, where the
 * composer is pinned to that edge and a toast on top of it would swallow the
 * taps meant for the message being typed.
 */

function Fire({ text }: { text: string }) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast.success(text)}>
      fire
    </button>
  );
}

/** The fixed strip the toasts are drawn in, found through a toast inside it. */
function strip(text: string): HTMLElement {
  const status = screen.getByText(text).closest('[role="status"]');
  return status!.parentElement as HTMLElement;
}

function show(text: string) {
  act(() => screen.getByRole('button', { name: 'fire' }).click());
  return strip(text);
}

afterEach(() => resetStores());

describe('ToastProvider — placement', () => {
  it('sits just above the bottom edge, clear of the safe area, on an ordinary screen', () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <ToastProvider>
          <Fire text="Saved" />
        </ToastProvider>
      </MemoryRouter>,
    );
    const el = show('Saved');
    expect(el.className).toContain('bottom-[calc(1rem+env(safe-area-inset-bottom))]');
    expect(el.className).not.toContain('4.5rem');
  });

  it('stays above the composer inside an open conversation', () => {
    render(
      <MemoryRouter initialEntries={['/chat/c1']}>
        <ToastProvider>
          <Fire text="Saved" />
        </ToastProvider>
      </MemoryRouter>,
    );
    expect(show('Saved').className).toContain('bottom-[calc(4.5rem+env(safe-area-inset-bottom))]');
  });

  // `/chat/:id/media` and `/chat/:id/info` have no composer.
  it('does not lift for the conversation\'s media and info pages', () => {
    render(
      <MemoryRouter initialEntries={['/chat/c1/info']}>
        <ToastProvider>
          <Fire text="Saved" />
        </ToastProvider>
      </MemoryRouter>,
    );
    expect(show('Saved').className).not.toContain('4.5rem');
  });

  // Several tests mount the provider with no router around it at all.
  it('still works with no router above it', () => {
    render(
      <ToastProvider>
        <Fire text="Saved" />
      </ToastProvider>,
    );
    expect(show('Saved').className).toContain('bottom-[calc(1rem+env(safe-area-inset-bottom))]');
  });
});
