import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useVoiceRecorder } from './useVoiceRecorder';

/**
 * The recorder hook, which until now had no tests at all.
 *
 * Everything here is a race, because every real complaint about the chat
 * microphone was one. Opening a mic is slow and permission-gated, so two
 * attempts overlap constantly on the phones this runs on — and the hook used
 * to keep the stream, the recorder, the chunk buffer and the resolve callback
 * in one slot each, shared by all of them. The symptoms were a hot microphone
 * behind a dead screen, "Recording too short" for audio that recorded fine, a
 * bar that could never be sent, and a voice note that vanished in silence.
 *
 * None of it was reachable from the composer's test suite, which stubs this
 * hook with a plain object.
 */

vi.mock('./monitoring', () => ({
  reportIssue: vi.fn(),
  addCrumb: vi.fn(),
}));
vi.mock('./micDiagnostics', () => ({
  micDiagnostics: vi.fn(async () => ({
    nativeShell: false,
    secureContext: true,
    permissionState: 'granted',
    audioInputs: 1,
  })),
}));

class FakeTrack {
  stopped = false;
  stop() {
    this.stopped = true;
  }
}

class FakeStream {
  tracks: FakeTrack[] = [new FakeTrack()];
  getTracks() {
    return this.tracks;
  }
  get stopped() {
    return this.tracks.every((t) => t.stopped);
  }
}

const recorders: FakeRecorder[] = [];

class FakeRecorder {
  static isTypeSupported() {
    return true;
  }
  state: 'inactive' | 'recording' = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(public stream: FakeStream) {
    recorders.push(this);
  }
  start() {
    this.state = 'recording';
  }
  /** Emit a chunk and finish, the way a real MediaRecorder does on stop(). */
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['audio'], { type: this.mimeType }) });
    this.onstop?.();
  }
}

/** A getUserMedia we can hold open, exactly as the OS dialog does. */
let pending: Array<{
  resolve: (s: FakeStream) => void;
  reject: (e: unknown) => void;
  stream: FakeStream;
}> = [];

function settleNext(): FakeStream {
  const next = pending.shift();
  if (!next) throw new Error('no pending getUserMedia');
  next.resolve(next.stream);
  return next.stream;
}

beforeEach(() => {
  pending = [];
  recorders.length = 0;
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(
        () =>
          new Promise((resolve, reject) => {
            pending.push({
              resolve: resolve as (s: FakeStream) => void,
              reject,
              stream: new FakeStream(),
            });
          }),
      ),
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useVoiceRecorder — one attempt cannot damage another', () => {
  it('records, then hands back the clip', async () => {
    const { result } = renderHook(() => useVoiceRecorder());

    let started: Awaited<ReturnType<typeof result.current.start>> | undefined;
    await act(async () => {
      const p = result.current.start();
      settleNext();
      started = await p;
    });
    expect(started).toEqual({ ok: true, session: expect.any(Number) });
    expect(result.current.status).toBe('recording');

    let clip: Awaited<ReturnType<typeof result.current.stop>> = null;
    await act(async () => {
      clip = await result.current.stop();
    });
    expect(clip).not.toBeNull();
    expect(clip!.blob.size).toBeGreaterThan(0);
  });

  /**
   * The bug the whole report rests on. Cancelling is not a failure, and the
   * caller must be able to tell the difference — the composer used to read
   * "false with no error name" as "the dealer refused permission", and told
   * them their microphone was blocked at the moment they cancelled.
   */
  it('reports a cancelled attempt as superseded, never as an error', async () => {
    const { result } = renderHook(() => useVoiceRecorder());

    let outcome: Awaited<ReturnType<typeof result.current.start>> | undefined;
    await act(async () => {
      const p = result.current.start();
      result.current.cancel();
      settleNext();
      outcome = await p;
    });

    expect(outcome).toEqual({ ok: false, cause: 'superseded' });
  });

  /** …and it must give the microphone straight back, not leave it hot. */
  it('releases a microphone that arrives after the attempt was abandoned', async () => {
    const { result } = renderHook(() => useVoiceRecorder());

    let stream: FakeStream | undefined;
    await act(async () => {
      const p = result.current.start();
      result.current.cancel();
      stream = settleNext();
      await p;
    });

    expect(stream!.stopped).toBe(true);
  });

  /**
   * Pressing twice used to leave two live MediaStreams: `start()` overwrote the
   * stream and recorder refs without stopping what was already on the mic, so
   * the phone's recording indicator stayed lit behind a composer that had
   * moved on.
   */
  it('never holds two microphones at once', async () => {
    const { result } = renderHook(() => useVoiceRecorder());

    let first: FakeStream | undefined;
    await act(async () => {
      const p = result.current.start();
      first = settleNext();
      await p;
    });
    expect(first!.stopped).toBe(false);

    await act(async () => {
      const p = result.current.start();
      settleNext();
      await p;
    });

    expect(first!.stopped).toBe(true);
  });

  /**
   * A superseded take finishing must not reach across and dismantle the
   * recording that replaced it. This is what left a hands-free bar showing a
   * flat waveform and a Send button that answered "Recording too short".
   */
  it('a superseded take finishing leaves the live one alone', async () => {
    const { result } = renderHook(() => useVoiceRecorder());

    await act(async () => {
      const p = result.current.start();
      settleNext();
      await p;
    });
    const stale = recorders[0];

    let second: FakeStream | undefined;
    await act(async () => {
      const p = result.current.start();
      second = settleNext();
      await p;
    });

    // The abandoned recorder flushes late.
    await act(async () => {
      stale.onstop?.();
    });

    expect(second!.stopped).toBe(false);
    expect(result.current.status).toBe('recording');
  });

  /**
   * `cancel()` used to null the pending resolve without calling it, so the
   * composer awaited a promise that could never settle: the voice note simply
   * disappeared — no bubble, no error, nothing.
   */
  it('a cancel during stop() still settles the caller', async () => {
    const { result } = renderHook(() => useVoiceRecorder());

    await act(async () => {
      const p = result.current.start();
      settleNext();
      await p;
    });

    // Stop without letting the recorder fire onstop, then cancel underneath it.
    const rec = recorders[0];
    rec.stop = function noFlush() {
      this.state = 'inactive';
    };

    let settled = false;
    await act(async () => {
      const stopping = result.current.stop().then(() => {
        settled = true;
      });
      result.current.cancel();
      await stopping;
    });

    expect(settled).toBe(true);
  });

  /**
   * DOMException is not reliably `instanceof Error` on the old Android WebViews
   * this runs on, and the name is the only thing that makes the advice we give
   * true rather than a guess.
   */
  it('keeps the failure name, even from a thrown object that is not an Error', async () => {
    const { result } = renderHook(() => useVoiceRecorder());
    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValueOnce({
      name: 'NotReadableError',
      message: 'device in use',
    });

    let outcome: Awaited<ReturnType<typeof result.current.start>> | undefined;
    await act(async () => {
      outcome = await result.current.start();
    });

    expect(outcome).toEqual({ ok: false, cause: 'error', name: 'NotReadableError' });
  });

  it('releases the microphone when the screen goes away mid-recording', async () => {
    const { result, unmount } = renderHook(() => useVoiceRecorder());

    let stream: FakeStream | undefined;
    await act(async () => {
      const p = result.current.start();
      stream = settleNext();
      await p;
    });

    unmount();
    expect(stream!.stopped).toBe(true);
  });
});
