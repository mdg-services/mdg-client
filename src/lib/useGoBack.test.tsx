import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { fallbackParentOf, useGoBack } from './useGoBack';

function Page() {
  const goBack = useGoBack('/home');
  return (
    <button type="button" onClick={goBack}>
      back
    </button>
  );
}

function renderAt(entries: Array<string | { pathname: string; key: string }>, index: number) {
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={index}>
      <Routes>
        <Route path="/page" element={<Page />} />
        <Route path="/prev" element={<div>previous-screen</div>} />
        <Route path="/home" element={<div>home-screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => window.history.replaceState(null, ''));

describe('useGoBack', () => {
  it('goes home when the app has nothing behind this screen, even under a replaced key', () => {
    // A cold start forwarded with `replace` (the `/chat?c=` link, or a ← that
    // already replaced a cold page) sits at index 0 under a RANDOM key. Reading
    // the key alone sent this tap to `navigate(-1)` — off the app, or nowhere.
    window.history.replaceState({ idx: 0, key: 'k1' }, '');
    renderAt([{ pathname: '/page', key: 'k1' }], 0);
    fireEvent.click(screen.getByRole('button', { name: 'back' }));
    expect(screen.getByText('home-screen')).toBeInTheDocument();
  });

  it('goes back when the app put an earlier screen behind this one', () => {
    window.history.replaceState({ idx: 1, key: 'k2' }, '');
    renderAt(['/prev', '/page'], 1);
    fireEvent.click(screen.getByRole('button', { name: 'back' }));
    expect(screen.getByText('previous-screen')).toBeInTheDocument();
  });
});

function Bare() {
  const goBack = useGoBack();
  return (
    <button type="button" onClick={goBack}>
      back
    </button>
  );
}

describe('useGoBack with no fallback named', () => {
  it('goes to the parent of the address when the app was opened cold on it', () => {
    window.history.replaceState({ idx: 0, key: 'k3' }, '');
    render(
      <MemoryRouter initialEntries={[{ pathname: '/services/dsr', key: 'k3' }]} initialIndex={0}>
        <Routes>
          <Route path="/services/:serviceId" element={<Bare />} />
          <Route path="/services" element={<div>services-door</div>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'back' }));
    expect(screen.getByText('services-door')).toBeInTheDocument();
  });

  it('still goes back when there is an earlier screen', () => {
    window.history.replaceState({ idx: 1, key: 'k4' }, '');
    render(
      <MemoryRouter initialEntries={['/', '/pump/papers']} initialIndex={1}>
        <Routes>
          <Route path="/" element={<div>today-screen</div>} />
          <Route path="/pump/papers" element={<Bare />} />
          <Route path="/pump" element={<div>pump-screen</div>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'back' }));
    expect(screen.getByText('today-screen')).toBeInTheDocument();
  });
});

describe('fallbackParentOf', () => {
  it.each([
    ['/services/dsr_sales', '/services'],
    ['/services/dsr_sales/', '/services'],
    ['/services', '/'],
    ['/pump/papers', '/pump'],
    ['/pump', '/'],
    ['/staff/emp1', '/staff'],
    ['/staff', '/pump'],
    ['/payments/p1', '/payments'],
    ['/payments', '/pump'],
    ['/settings', '/pump'],
    ['/profile', '/pump'],
    ['/settings/profile', '/pump'],
    ['/settings/account', '/pump'],
    ['/settings/team', '/pump'],
    ['/settings/help', '/pump'],
    ['/settings/logins', '/pump'],
    ['/settings/autopay', '/pump'],
    ['/chat/c1', '/chat'],
    ['/chat/c1/info', '/chat/c1'],
    ['/chat/c1/media', '/chat/c1'],
    ['/chat', '/'],
    ['/kavach', '/'],
    ['/somewhere/unknown', '/'],
  ])('%s goes up to %s', (from, to) => {
    expect(fallbackParentOf(from)).toBe(to);
  });
});
