import { afterEach, describe, expect, it } from 'vitest';

import { resetStores } from '@/test/utils';

import { useAuthStore } from './auth';

/** A token-shaped string carrying the claims the store reads. Not signed. */
function token(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(claims)}.signature`;
}

const user = { id: 'u1', email: 'o@x.test', role: 'dealer-owner' } as never;

afterEach(() => resetStores());

describe('swapping in a renewed token', () => {
  it('takes a renewal of the same sign-in', () => {
    const first = token({ sub: 'u1', sid: 's-new', iat: 1 });
    const renewed = token({ sub: 'u1', sid: 's-new', iat: 2 });
    useAuthStore.getState().login({ token: first, user });
    useAuthStore.getState().setToken(renewed);
    expect(useAuthStore.getState().token).toBe(renewed);
  });

  it("refuses a renewal of an EARLIER sign-in — a cached reply's old header", () => {
    // Signed out and back in on the same phone; a 304 then replays a header
    // from the previous session. Keeping it signed the dealer out on next open.
    const now = token({ sub: 'u1', sid: 's-new' });
    const stale = token({ sub: 'u1', sid: 's-old' });
    useAuthStore.getState().login({ token: now, user });
    useAuthStore.getState().setToken(stale);
    expect(useAuthStore.getState().token).toBe(now);
  });

  it('refuses a token for somebody else, or one it cannot read', () => {
    const now = token({ sub: 'u1', sid: 's1' });
    useAuthStore.getState().login({ token: now, user });
    useAuthStore.getState().setToken(token({ sub: 'u2', sid: 's1' }));
    useAuthStore.getState().setToken('not-a-token');
    expect(useAuthStore.getState().token).toBe(now);
  });

  it('does nothing while signed out', () => {
    useAuthStore.getState().setToken(token({ sub: 'u1', sid: 's1' }));
    expect(useAuthStore.getState().token).toBeNull();
  });
});
