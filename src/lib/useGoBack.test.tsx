import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { useGoBack } from './useGoBack';

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
