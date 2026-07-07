import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  render,
  renderHook,
  type RenderHookOptions,
  type RenderOptions,
} from '@testing-library/react';
import * as React from 'react';
import { MemoryRouter } from 'react-router-dom';

import { ToastProvider } from '@/components/ui';
import { useAuthStore } from '@/store/auth';
import { useLangStore } from '@/store/lang';
import type { Message, User } from '@dk/shared/types';

/** A QueryClient tuned for tests: no retries, no background refetch noise. */
export function makeTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Infinity,
        staleTime: 0,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });
}

interface ProviderOptions {
  /** Initial URL for the MemoryRouter. */
  route?: string;
  /** Supply a shared client to assert on cache state; defaults to a fresh one. */
  queryClient?: QueryClient;
  /** Wrap in a MemoryRouter (default true). Turn off for pure-logic hooks. */
  withRouter?: boolean;
}

function makeWrapper({ route = '/', queryClient, withRouter = true }: ProviderOptions) {
  const client = queryClient ?? makeTestQueryClient();
  function Wrapper({ children }: { children: React.ReactNode }) {
    const tree = (
      <QueryClientProvider client={client}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    );
    return withRouter ? <MemoryRouter initialEntries={[route]}>{tree}</MemoryRouter> : tree;
  }
  return { Wrapper, client };
}

/** Render a component inside the app's providers (Router + QueryClient + Toast). */
export function renderWithProviders(
  ui: React.ReactElement,
  opts: ProviderOptions & Omit<RenderOptions, 'wrapper'> = {},
) {
  const { route, queryClient, withRouter, ...rest } = opts;
  const { Wrapper, client } = makeWrapper({ route, queryClient, withRouter });
  return { queryClient: client, ...render(ui, { wrapper: Wrapper, ...rest }) };
}

/** Render a hook inside the app's providers. */
export function renderHookWithProviders<Result, Props>(
  hook: (props: Props) => Result,
  opts: ProviderOptions & Omit<RenderHookOptions<Props>, 'wrapper'> = {},
) {
  const { route, queryClient, withRouter, ...rest } = opts;
  const { Wrapper, client } = makeWrapper({ route, queryClient, withRouter });
  return { queryClient: client, ...renderHook(hook, { wrapper: Wrapper, ...rest }) };
}

/** Reset persisted stores + localStorage so tests don't leak into each other. */
export function resetStores(): void {
  useAuthStore.setState({ token: null, user: null });
  useLangStore.setState({ lang: 'hi', explicit: false });
  try {
    localStorage.clear();
  } catch {
    /* jsdom always has localStorage; guard anyway */
  }
}

/** Put the auth store in a signed-in state WITHOUT firing login()'s side effects. */
export function signIn(user: Partial<User> = {}, token = 'test-token'): User {
  const u = makeUser(user);
  useAuthStore.setState({ token, user: u });
  return u;
}

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u1',
    name: 'Ramesh',
    role: 'dealer-owner',
    lang: 'hi',
    ...overrides,
  } as User;
}

let msgSeq = 0;
/** Build a Message fixture; each call gets a later createdAt for stable ordering. */
export function makeMessage(overrides: Partial<Message> = {}): Message {
  msgSeq += 1;
  return {
    id: `m${msgSeq}`,
    conversationId: 'c1',
    senderId: 'u1',
    senderRole: 'dealer-owner',
    body: 'hello',
    attachments: [],
    deliveredTo: [],
    readBy: [],
    createdAt: new Date(2026, 0, 1, 12, 0, msgSeq).toISOString(),
    ...overrides,
  } as Message;
}
