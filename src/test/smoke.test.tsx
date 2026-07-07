import { screen } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it } from 'vitest';

import { makeMessage, renderWithProviders, signIn } from './utils';

// Verifies the harness itself: providers render, jsdom matchers work, fixtures build.
describe('test harness', () => {
  it('renders a component inside the providers', () => {
    renderWithProviders(<div>नमस्ते</div>);
    expect(screen.getByText('नमस्ते')).toBeInTheDocument();
  });

  it('signIn seeds the auth store and makeMessage builds a fixture', () => {
    const user = signIn({ id: 'u9', name: 'Suresh' });
    expect(user.id).toBe('u9');
    const msg = makeMessage({ body: 'hi there' });
    expect(msg.body).toBe('hi there');
    expect(msg.deliveredTo).toEqual([]);
  });
});
