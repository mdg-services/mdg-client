import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

let large = false;
vi.mock('@/lib/useLargeText', () => ({ useLargeText: () => large }));

const { NavRow, StandRow } = await import('./PumpRows');

afterEach(() => {
  large = false;
});

/** The arrow is a lucide icon drawn as an SVG with this class. */
const arrow = (c: HTMLElement) => c.querySelector('svg.lucide-chevron-right');

describe('NavRow and StandRow', () => {
  it('draw an arrow at normal text, and the whole row is one button', () => {
    const onPress = vi.fn();
    const { container } = render(<NavRow title="Language" subtitle="English" onPress={onPress} />);
    expect(arrow(container)).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Language/ }));
    expect(onPress).toHaveBeenCalledOnce();
  });

  it('leave the arrow out at large text so the sentence keeps the whole width, and stay one button', () => {
    large = true;
    const onPress = vi.fn();
    const nav = render(
      <NavRow leading={<span data-testid="pic" />} title="Change password" subtitle="Choose a new password" onPress={onPress} />,
    );
    expect(arrow(nav.container)).toBeNull();
    // The picture is held to a 1.5rem column.
    expect(screen.getByTestId('pic').parentElement?.className).toContain('w-6');
    fireEvent.click(screen.getByRole('button', { name: /Change password/ }));
    expect(onPress).toHaveBeenCalledOnce();
    nav.unmount();

    const stand = render(<StandRow status="attention" text="14 services running, 3 need a look" onPress={onPress} />);
    expect(arrow(stand.container)).toBeNull();
    expect(stand.container.querySelector('[data-status="attention"]')).not.toBeNull();
    // The words of the row are its accessible name.
    expect(screen.getByRole('button', { name: /14 services running, 3 need a look/ })).toBeInTheDocument();
    expect(stand.container.innerHTML).not.toMatch(/\btruncate\b|line-clamp|text-\[|min-h-\[|h-\[\d+px\]/);
  });
});
