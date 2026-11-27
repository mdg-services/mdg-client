import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useLangStore } from '@/store/lang';
import { renderWithProviders, resetStores } from '@/test/utils';

import { CallButton, dialable } from './CallButton';

/**
 * The Call button is the one link in the staff pages that leaves the app: a `tel:` address, handed to
 * the phone's dialler (reviewed in scripts/leavingTheApp.check.mjs). What makes that safe is that the
 * number goes into the link ONLY when it is digits with one optional leading plus (spaces and hyphens
 * a person typed between the digits are dropped). Anything else is shown as plain text with a Copy
 * button, so a stored value can never turn the link into a web address, a script or a dialler command.
 */
afterEach(() => {
  resetStores();
  vi.restoreAllMocks();
});

describe('dialable', () => {
  it.each([
    ['98765 43210', '9876543210'],
    ['98765-43210', '9876543210'],
    ['+91 98765-43210', '+919876543210'],
    ['  9876543210  ', '9876543210'],
  ])('accepts %s as %s', (typed, expected) => {
    expect(dialable(typed)).toBe(expected);
  });

  it.each([
    '(0674) 255 1234',
    '98765.43210 ext 5',
    '98+76',
    '9876543210;123',
    '9876,543210',
    '*123#',
    'javascript:alert(1)',
    'https://evil.test/?x=1',
    '<a href="x">99</a>',
    '+',
    '12',
    'call me',
    '',
  ])('refuses %s: not digits with an optional leading plus', (typed) => {
    expect(dialable(typed)).toBe('');
  });
});

describe('CallButton', () => {
  function html(phone: string | undefined, numberShown = false) {
    useLangStore.setState({ lang: 'en', explicit: true });
    return renderWithProviders(
      <CallButton
        name="Ramesh"
        numberShown={numberShown}
        {...(phone === undefined ? {} : { phone })}
      />,
    );
  }

  it('is one tel: link with the number cleaned, named for the person', () => {
    html('+91 98765-43210');
    const link = screen.getByRole('link', { name: 'Call Ramesh' });
    expect(link).toHaveAttribute('href', 'tel:+919876543210');
    expect(link).not.toHaveAttribute('target');
    expect(link.className).toContain('min-h-11');
  });

  it('draws nothing when there is no number', () => {
    for (const phone of [undefined, '', '   ']) {
      const { unmount } = html(phone);
      expect(screen.queryByRole('link')).toBeNull();
      expect(screen.queryByRole('button')).toBeNull();
      unmount();
    }
  });

  it('shows a number that is not plain digits as text with a Copy button, and no link', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { container } = html('98765 43210 / 98765 43211');
    expect(container.querySelector('a')).toBeNull();
    expect(screen.getByText('98765 43210 / 98765 43211')).toBeInTheDocument();
    const copy = screen.getByRole('button', { name: 'Copy the number of Ramesh' });
    expect(copy.className).toContain('min-h-11');
    fireEvent.click(copy);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('98765 43210 / 98765 43211'));
  });

  it('does not print the number twice when the page already shows it', () => {
    html('0674 / 255', true);
    expect(screen.queryByText('0674 / 255')).toBeNull();
    expect(screen.getByRole('button', { name: 'Copy the number of Ramesh' })).toBeInTheDocument();
  });

  it('never builds an address other than tel: plus digits, whatever is stored', () => {
    for (const phone of [
      'javascript:alert(1)',
      'https://evil.test/1',
      '9876"><script>1</script>',
      '+91 98765 43210',
    ]) {
      const { container, unmount } = html(phone);
      for (const a of container.querySelectorAll('a')) {
        expect(a.getAttribute('href')).toMatch(/^tel:\+?\d+$/);
      }
      unmount();
    }
  });
});
