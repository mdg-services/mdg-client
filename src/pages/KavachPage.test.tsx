import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useLangStore } from '@/store/lang';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';
import type { KavachProgramme } from '@dk/shared/types';

// Mutable results the mocked hooks read from, so a single test can drive the
// query from its loading phase into its loaded phase (the exact transition that
// used to crash the whole tree via a hook called after an early return).
const h = vi.hoisted(() => ({
  me: { isLoading: true, isError: false, data: undefined as unknown },
  conv: { data: undefined as unknown, isLoading: false },
}));

vi.mock('@/hooks/api/useKavach', () => ({
  useKavachMe: () => h.me,
  kavachMeQueryKey: ['kavach', 'me'],
}));
vi.mock('@/hooks/api/useMyConversations', () => ({
  myConversationsKey: ['conversations', 'mine'],
  useMyConversations: () => ({ data: [], isLoading: false }),
  useMyPrimaryConversation: () => h.conv,
}));

const { KavachPage } = await import('./KavachPage');

function programme(): KavachProgramme {
  return {
    id: 'p1',
    dealerId: 'd1',
    status: 'ACTIVE',
    outlet: {} as KavachProgramme['outlet'],
    score: {
      overallPct: 80,
      byBucket: {},
      validPoints: 8,
      totalPoints: 10,
      computedAt: '2026-01-01T00:00:00.000Z',
    },
    totalPoints: 10,
    initiatedByAdminId: 'a1',
    initiatedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '',
    updatedAt: '',
  } as KavachProgramme;
}

afterEach(() => {
  resetStores();
  h.me = { isLoading: true, isError: false, data: undefined };
  h.conv = { data: undefined, isLoading: false };
});

describe('KavachPage', () => {
  it('does not crash when the /kavach/me query resolves from loading to a programme', () => {
    signIn({ id: 'owner' });
    useLangStore.setState({ lang: 'en', explicit: true });

    // Render 1: query still loading → spinner, fewer hooks.
    h.me = { isLoading: true, isError: false, data: undefined };
    const { rerender } = renderWithProviders(<KavachPage />, { route: '/kavach' });

    // Render 2: programme arrives. Pre-fix this reached a `useCallback` that the
    // loading render skipped, changing the hook count and crashing React.
    h.me = { isLoading: false, isError: false, data: { programme: programme(), items: [] } };
    expect(() => rerender(<KavachPage />)).not.toThrow();

    expect(screen.getByText('Pump health')).toBeInTheDocument();
  });
});
