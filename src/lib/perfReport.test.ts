import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildReport,
  fileLabel,
  flushPerfReport,
  recordApiCall,
  recordNavigation,
  routePattern,
} from '@/lib/perfReport';
import { useAuthStore } from '@/store/auth';

afterEach(() => {
  vi.unstubAllGlobals();
  useAuthStore.setState({ token: null });
});

describe('what leaves the phone', () => {
  it('takes the ids out of addresses and API paths', () => {
    expect(routePattern('/chat/66f1a2b3c4d5e6f7a8b9c0d1/info?x=1')).toBe('/chat/:id/info');
    expect(routePattern('/v1/conversations/66f1a2b3c4d5e6f7a8b9c0d1/messages')).toBe(
      '/v1/conversations/:id/messages',
    );
    expect(routePattern('/payments/12345')).toBe('/payments/:id');
    expect(routePattern('/settings')).toBe('/settings');
    expect(routePattern('/v1/dealers/66f1a2b3c4d5e6f7a8b9c0d1/leave/2026-11-10')).toBe(
      '/v1/dealers/:id/leave/:id',
    );
  });

  it('names an app file by its screen, not its release', () => {
    expect(fileLabel('https://client.mdgservices.in/assets/ChatPage-B7XzQUOq.js')).toBe('ChatPage.js');
    expect(fileLabel('/assets/index-Cmwu6cav.css?x')).toBe('index.css');
  });
});

describe('the report', () => {
  it('adds up calls of one kind, and sends once someone is signed in', async () => {
    recordApiCall('GET', '/v1/conversations/66f1a2b3c4d5e6f7a8b9c0d1/messages', 400, true);
    recordApiCall('GET', '/v1/conversations/77f1a2b3c4d5e6f7a8b9c0d1/messages', 3_500, false);
    recordApiCall('POST', '/v1/perf', 100, true); // its own send is not counted
    recordNavigation('/chat/66f1a2b3c4d5e6f7a8b9c0d1', 950);

    const call = buildReport().api.find((a) => a.path === 'GET /v1/conversations/:id/messages');
    expect(call).toEqual({
      path: 'GET /v1/conversations/:id/messages',
      n: 2,
      totalMs: 3_900,
      maxMs: 3_500,
      slow: 1,
      failed: 1,
    });
    expect(buildReport().api.some((a) => a.path.includes('/v1/perf'))).toBe(false);
    expect(buildReport().navs).toContainEqual({ to: '/chat/:id', ms: 950 });

    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    // Nobody signed in: nothing goes, nothing is lost.
    await flushPerfReport();
    expect(fetchMock).not.toHaveBeenCalled();

    useAuthStore.setState({ token: 'tok' });
    await flushPerfReport();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/v1\/perf$/);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(JSON.parse(String(init.body)).navs).toContainEqual({ to: '/chat/:id', ms: 950 });
    // Sent: the next report starts empty.
    expect(buildReport().navs).toEqual([]);
    expect(buildReport().api).toEqual([]);
  });

  it('keeps the numbers when a send fails', async () => {
    recordNavigation('/settings', 300);
    useAuthStore.setState({ token: 'tok' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await flushPerfReport();
    expect(buildReport().navs).toContainEqual({ to: '/settings', ms: 300 });
  });

  it('drops a report the server refuses, and keeps one it could not reach', async () => {
    useAuthStore.setState({ token: 'tok' });
    recordNavigation('/staff', 120);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400 }));
    await flushPerfReport();
    expect(buildReport().navs).toEqual([]);

    recordNavigation('/staff', 130);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await flushPerfReport();
    expect(buildReport().navs).toEqual([{ to: '/staff', ms: 130 }]);
  });

  it('keeps what was measured while a send was on its way', async () => {
    useAuthStore.setState({ token: 'tok' });
    recordNavigation('/chat', 100);
    let answer!: (r: { ok: boolean; status: number }) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise((r) => (answer = r))));
    const sent = flushPerfReport();
    recordNavigation('/settings', 200); // measured during the send
    answer({ ok: true, status: 204 });
    await sent;
    expect(buildReport().navs).toEqual([{ to: '/settings', ms: 200 }]);
  });

  it('sends the connection type the server stores, and caps odd times at an hour', () => {
    Object.defineProperty(navigator, 'connection', {
      value: { effectiveType: '3g', downlink: 0.7, rtt: 450, saveData: false },
      configurable: true,
    });
    try {
      expect(buildReport().conn).toEqual({ effectiveType: '3g', downlinkMbps: 0.7, rttMs: 450, saveData: false });
    } finally {
      Object.defineProperty(navigator, 'connection', { value: undefined, configurable: true });
    }
    recordNavigation('/chat', 9_000_000);
    expect(buildReport().navs.at(-1)).toEqual({ to: '/chat', ms: 3_600_000 });
  });
});

