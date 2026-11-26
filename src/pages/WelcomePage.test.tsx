import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useLangStore } from '@/store/lang';
import { renderWithProviders, resetStores } from '@/test/utils';

import { WelcomePage } from './WelcomePage';

/** Each destination says where it is and with what query, so a test can see both. */
function Spot({ name }: { name: string }) {
  const { search } = useLocation();
  return (
    <div>
      {name}
      <span data-testid="search">{search}</span>
    </div>
  );
}

function renderAt(route: string, lang: 'en' | 'hi' = 'en') {
  useLangStore.setState({ lang, explicit: true });
  return renderWithProviders(
    <Routes>
      <Route path="/welcome" element={<WelcomePage />} />
      <Route path="/register" element={<Spot name="register-page" />} />
      <Route path="/register/new-pump" element={<Spot name="new-pump-page" />} />
      <Route path="/login" element={<Spot name="login-page" />} />
    </Routes>,
    { route },
  );
}

describe('WelcomePage: the first-open choice (ADR 0058 §3.1)', () => {
  afterEach(() => resetStores());

  it('asks in Hindi by default, with both answers', () => {
    useLangStore.setState({ lang: 'hi', explicit: false });
    renderWithProviders(
      <Routes>
        <Route path="/welcome" element={<WelcomePage />} />
      </Routes>,
      { route: '/welcome' },
    );
    expect(screen.getByRole('button', { name: /मेरा पेट्रोल पंप चल रहा है/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /मुझे पेट्रोल पंप खोलना है/ })).toBeInTheDocument();
  });

  it('"I run a petrol pump" goes to the outlet sign-up', async () => {
    const user = userEvent.setup();
    renderAt('/welcome');
    await user.click(screen.getByRole('button', { name: /I run a petrol pump/ }));
    expect(await screen.findByText('register-page')).toBeInTheDocument();
  });

  it('"I want to open a petrol pump" goes to the Kavach Shuruaat form', async () => {
    const user = userEvent.setup();
    renderAt('/welcome');
    await user.click(screen.getByRole('button', { name: /I want to open a petrol pump/ }));
    expect(await screen.findByText('new-pump-page')).toBeInTheDocument();
  });

  it('has Sign in for someone who already has an account', async () => {
    const user = userEvent.setup();
    renderAt('/welcome');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('login-page')).toBeInTheDocument();
  });

  it('a link with ?for=new-pump skips the question, and keeps the share code', async () => {
    renderAt('/welcome?for=new-pump&r=film42');
    expect(await screen.findByText('new-pump-page')).toBeInTheDocument();
    expect(screen.getByTestId('search')).toHaveTextContent('?r=film42');
  });

  it('carries a share code on to whichever form is chosen', async () => {
    const user = userEvent.setup();
    renderAt('/welcome?r=film42');
    await user.click(screen.getByRole('button', { name: /I run a petrol pump/ }));
    expect(await screen.findByText('register-page')).toBeInTheDocument();
    expect(screen.getByTestId('search')).toHaveTextContent('?r=film42');
  });

  it('with Kavach Shuruaat sign-up switched off, there is only the outlet road', async () => {
    vi.stubEnv('VITE_PLANNER_ENABLED', 'false');
    renderAt('/welcome?for=new-pump');
    expect(await screen.findByText('register-page')).toBeInTheDocument();
  });
});
