import { act, fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { NavigationProgress } from '@/components/RouteFallback';

afterEach(() => window.history.replaceState(null, '', '/'));

/** A screen whose code arrives only when the test says so. */
function slowScreen() {
  let arrive!: () => void;
  const Screen = React.lazy(
    () =>
      new Promise<{ default: React.ComponentType }>((resolve) => {
        arrive = () => resolve({ default: () => <div>next screen</div> });
      }),
  );
  return { Screen, arrive: () => arrive() };
}

describe('NavigationProgress', () => {
  it('keeps the screen on show and runs the bar until the next one is drawn', async () => {
    const { Screen, arrive } = slowScreen();
    render(
      <BrowserRouter future={{ v7_startTransition: true }}>
        <NavigationProgress />
        <React.Suspense fallback={<div>blank page</div>}>
          <Routes>
            <Route path="/" element={<Link to="/next">open</Link>} />
            <Route path="/next" element={<Screen />} />
          </Routes>
        </React.Suspense>
      </BrowserRouter>,
    );

    fireEvent.click(screen.getByText('open'));
    // The old screen stays; no empty page with a spinner.
    expect(screen.getByText('open')).toBeInTheDocument();
    expect(screen.queryByText('blank page')).not.toBeInTheDocument();
    expect(await screen.findByRole('progressbar')).toBeInTheDocument();

    await act(async () => arrive());
    expect(await screen.findByText('next screen')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('shows nothing when a screen opens at once', async () => {
    render(
      <BrowserRouter future={{ v7_startTransition: true }}>
        <NavigationProgress />
        <Routes>
          <Route path="/" element={<Link to="/next">open</Link>} />
          <Route path="/next" element={<div>next screen</div>} />
        </Routes>
      </BrowserRouter>,
    );
    fireEvent.click(screen.getByText('open'));
    expect(await screen.findByText('next screen')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 250));
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});
