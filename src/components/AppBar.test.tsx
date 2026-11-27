import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders, resetStores } from '@/test/utils';

const h = vi.hoisted(() => ({ large: false }));
vi.mock('@/lib/useLargeText', () => ({ useLargeText: () => h.large }));

const { AppBar } = await import('./AppBar');

const LONG_TITLE = 'Supplier desk of the Mahadev Fuel Station and Service Centre';
const LONG_SUBTITLE = 'MDG team is online and will answer your question within the hour';

function bar() {
  return renderWithProviders(
    <AppBar
      title={LONG_TITLE}
      subtitle={LONG_SUBTITLE}
      leading={<span data-testid="avatar">M</span>}
      onBack={() => {}}
      backLabel="Go back"
      onTitleClick={() => {}}
      titleLabel="Chat info"
      menu={[{ key: 'a', label: 'Settings', onSelect: () => {} }]}
    />,
  );
}

beforeEach(() => {
  resetStores();
  h.large = false;
});
afterEach(cleanup);

describe('the chat thread\'s top bar', () => {
  it('never cuts the title or the subtitle with an ellipsis, even where the title opens the chat info', () => {
    bar();
    const html = screen.getByRole('button', { name: 'Chat info' }).innerHTML;
    expect(html).not.toMatch(/truncate|line-clamp|text-ellipsis/);
    expect(screen.getByText(LONG_TITLE).className).toContain('break-words');
    expect(screen.getByText(LONG_SUBTITLE).className).toContain('break-words');
  });

  it('keeps the avatar beside the title at normal text', () => {
    bar();
    expect(screen.getByTestId('avatar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chat info' }).className).toContain('flex-1');
  });

  it('at large text drops the avatar and gives the title its own full-width row under the buttons', () => {
    h.large = true;
    bar();
    expect(screen.queryByTestId('avatar')).not.toBeInTheDocument();
    const title = screen.getByRole('button', { name: 'Chat info' });
    expect(title.className).toContain('basis-full');
    expect(title.className).toContain('order-last');
    expect(title.parentElement?.className).toContain('flex-wrap');
    // Both lines are still there, whole.
    expect(screen.getByText(LONG_TITLE)).toBeInTheDocument();
    expect(screen.getByText(LONG_SUBTITLE)).toBeInTheDocument();
  });

  it('keeps the back arrow and the menu reachable at large text', () => {
    h.large = true;
    bar();
    expect(screen.getByRole('button', { name: 'Go back' })).toBeInTheDocument();
    // Back, the title, and the menu: three buttons, each still there.
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });
});
