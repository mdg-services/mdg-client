import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { reportIssue } from './monitoring';
import { STOP_FINISH_MS, useVoiceRecorder, voiceMimeCandidates } from './useVoiceRecorder';

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

/** An event target, like a real track, so the recorder can hear `ended` and `mute`. */
class FakeTrack extends EventTarget {
  stopped = false;
  muted = false;
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
  /** What this phone can record; a test narrows it to model an older phone. */
  static supports: (type: string) => boolean = () => true;
  static isTypeSupported(type: string) {
    return FakeRecorder.supports(type);
  }
  /** When the constructor throws; a test sets it to model a picky engine. */
  static throwsWhen: (options?: { mimeType?: string }) => boolean = () => false;
  state: 'inactive' | 'recording' = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(
    public stream: FakeStream,
    public options?: { mimeType?: string },
  ) {
    if (FakeRecorder.throwsWhen(options)) throw new Error('NotSupportedError');
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

/**
 * Answer the next getUserMedia once it has been asked. Async, because a press
 * straight after another waits out the short release gap before it asks.
 */
async function settleNext(): Promise<FakeStream> {
  await vi.waitFor(() => {
    if (pending.length === 0) throw new Error('no pending getUserMedia yet');
  });
  const next = pending.shift()!;
  next.resolve(next.stream);
  return next.stream;
}

const gum = () => navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>;
const domError = (name: string, message = '') => ({ name, message });

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
  vi.useRealTimers();
  vi.unstubAllGlobals();
  FakeRecorder.supports = () => true;
  FakeRecorder.throwsWhen = () => false;
  delete (window as unknown as { __DK_NATIVE_PLATFORM__?: string }).__DK_NATIVE_PLATFORM__;
});

describe('useVoiceRecorder — one attempt cannot damage another', () => {
  it('records, then hands back the clip', async () => {
    const { result } = renderHook(() => useVoiceRecorder());

    let started: Awaited<ReturnType<typeof result.current.start>> | undefined;
    await act(async () => {
      const p = result.current.start();
      await settleNext();
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
      await settleNext();
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
      stream = await settleNext();
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
      first = await settleNext();
      await p;
    });
    expect(first!.stopped).toBe(false);

    await act(async () => {
      const p = result.current.start();
      await settleNext();
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
      await settleNext();
      await p;
    });
    const stale = recorders[0];

    let second: FakeStream | undefined;
    await act(async () => {
      const p = result.current.start();
      second = await settleNext();
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
      await settleNext();
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
    gum().mockRejectedValueOnce(domError('NotFoundError', 'no device'));

    let outcome: Awaited<ReturnType<typeof result.current.start>> | undefined;
    await act(async () => {
      outcome = await result.current.start();
    });

    expect(outcome).toEqual({
      ok: false,
      cause: 'error',
      name: 'NotFoundError',
      message: 'no device',
      attempts: 1,
    });
  });

  it('releases the microphone when the screen goes away mid-recording', async () => {
    const { result, unmount } = renderHook(() => useVoiceRecorder());

    let stream: FakeStream | undefined;
    await act(async () => {
      const p = result.current.start();
      stream = await settleNext();
      await p;
    });

    unmount();
    expect(stream!.stopped).toBe(true);
  });
});

/**
 * THE QUIET SECOND CHANCE. A start that fails because the phone could not start
 * the mic for a moment (pressed as the app came back to the screen, the phone
 * still letting go of a call) gets one retry before the dealer hears anything.
 * A refusal, a missing mic or a hang never does: trying again changes nothing.
 */
describe('useVoiceRecorder — one quiet retry', () => {
  function setVisibility(state: 'visible' | 'hidden') {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  }
  afterEach(() => {
    setVisibility('visible');
  });

  it('retries once on NotReadableError and records', async () => {
    vi.useFakeTimers();
    gum().mockRejectedValueOnce(domError('NotReadableError', 'Could not start audio source'));
    const { result } = renderHook(() => useVoiceRecorder());

    let outcome: Awaited<ReturnType<typeof result.current.start>> | undefined;
    await act(async () => {
      const p = result.current.start();
      await vi.advanceTimersByTimeAsync(400);
      await settleNext();
      outcome = await p;
    });

    expect(gum()).toHaveBeenCalledTimes(2);
    expect(outcome).toEqual({ ok: true, session: expect.any(Number) });
    expect(result.current.status).toBe('recording');
  });

  it('retries an AbortError the same way', async () => {
    vi.useFakeTimers();
    gum().mockRejectedValueOnce(domError('AbortError'));
    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      const p = result.current.start();
      await vi.advanceTimersByTimeAsync(400);
      await settleNext();
      await p;
    });
    expect(gum()).toHaveBeenCalledTimes(2);
  });

  it('never retries a refusal', async () => {
    vi.useFakeTimers();
    gum().mockRejectedValueOnce(domError('NotAllowedError'));
    const { result } = renderHook(() => useVoiceRecorder());

    let outcome: Awaited<ReturnType<typeof result.current.start>> | undefined;
    await act(async () => {
      const p = result.current.start();
      await vi.advanceTimersByTimeAsync(5000);
      outcome = await p;
    });

    expect(gum()).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({ ok: false, cause: 'error', name: 'NotAllowedError', attempts: 1 });
  });

  it('waits for the app to be back on screen before retrying', async () => {
    vi.useFakeTimers();
    setVisibility('hidden');
    gum().mockRejectedValueOnce(domError('NotReadableError'));
    const { result } = renderHook(() => useVoiceRecorder());

    let p: ReturnType<typeof result.current.start> | undefined;
    await act(async () => {
      p = result.current.start();
      await vi.advanceTimersByTimeAsync(1500);
    });
    // Still hidden: no second ask yet.
    expect(gum()).toHaveBeenCalledTimes(1);

    await act(async () => {
      setVisibility('visible');
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(gum()).toHaveBeenCalledTimes(2);
    await act(async () => {
      await settleNext();
      await p;
    });
  });

  it('a cancel during the wait means no second ask at all', async () => {
    vi.useFakeTimers();
    gum().mockRejectedValueOnce(domError('NotReadableError'));
    const { result } = renderHook(() => useVoiceRecorder());

    let outcome: Awaited<ReturnType<typeof result.current.start>> | undefined;
    await act(async () => {
      const p = result.current.start();
      await vi.advanceTimersByTimeAsync(100);
      result.current.cancel();
      await vi.advanceTimersByTimeAsync(4000);
      outcome = await p;
    });

    expect(gum()).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ ok: false, cause: 'superseded' });
  });

  it('sends ONE report per press, saying a retry ran and how it ended', async () => {
    vi.useFakeTimers();
    gum()
      .mockRejectedValueOnce(domError('NotReadableError', 'Could not start audio source'))
      .mockRejectedValueOnce(domError('NotReadableError', 'Could not start audio source'));
    const { result } = renderHook(() => useVoiceRecorder());

    let outcome: Awaited<ReturnType<typeof result.current.start>> | undefined;
    await act(async () => {
      const p = result.current.start();
      await vi.advanceTimersByTimeAsync(400);
      outcome = await p;
    });
    await vi.waitFor(() => expect(reportIssue).toHaveBeenCalled());

    expect(outcome).toMatchObject({ ok: false, name: 'NotReadableError', attempts: 2 });
    const blocked = vi.mocked(reportIssue).mock.calls.filter(([i]) => i.name === 'mic.blocked');
    expect(blocked).toHaveLength(1);
    expect(blocked[0][0].tags).toMatchObject({
      'mic.error': 'NotReadableError',
      'mic.message': 'Could not start audio source',
      'mic.retries': 1,
      'mic.retryOutcome': 'failed-again',
    });
  });
});

describe('useVoiceRecorder — nothing left live, nothing lost', () => {
  it('a recorder that will not take the format starts with the phone\'s own default', async () => {
    FakeRecorder.throwsWhen = (options) => !!options?.mimeType;
    const { result } = renderHook(() => useVoiceRecorder());

    let outcome: Awaited<ReturnType<typeof result.current.start>> | undefined;
    await act(async () => {
      const p = result.current.start();
      await settleNext();
      outcome = await p;
    });

    expect(outcome).toEqual({ ok: true, session: expect.any(Number) });
    expect(recorders.at(-1)!.options).toBeUndefined();
  });

  it('lets go of the microphone when no recorder will start at all', async () => {
    FakeRecorder.throwsWhen = () => true;
    const { result } = renderHook(() => useVoiceRecorder());

    let stream: FakeStream | undefined;
    let outcome: Awaited<ReturnType<typeof result.current.start>> | undefined;
    await act(async () => {
      const p = result.current.start();
      stream = await settleNext();
      outcome = await p;
    });

    expect(outcome).toMatchObject({ ok: false, cause: 'error', name: 'RecorderStartError' });
    expect(stream!.stopped).toBe(true);
  });

  /**
   * A recording the phone stopped (the track ended) used to drop the clip: the
   * bar sat at 0:00 and Send said "too short". Now the clip is kept, and the
   * next stop() hands it over for review.
   */
  it('keeps a clip the phone stopped, and stop() hands it back', async () => {
    const { result } = renderHook(() => useVoiceRecorder());
    let stream: FakeStream | undefined;
    await act(async () => {
      const p = result.current.start();
      stream = await settleNext();
      await p;
    });

    await act(async () => {
      stream!.tracks[0].dispatchEvent(new Event('ended'));
    });
    expect(result.current.status).toBe('interrupted');
    expect(result.current.interruptReason).toBe('ended');

    let clip: Awaited<ReturnType<typeof result.current.stop>> = null;
    await act(async () => {
      clip = await result.current.stop();
    });
    expect(clip).not.toBeNull();
    expect(clip!.endedBy).toBe('ended');
    expect(clip!.blob.size).toBeGreaterThan(0);
    expect(result.current.status).toBe('idle');
  });

  it('a recorder error followed by its stop is handled once', async () => {
    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      const p = result.current.start();
      await settleNext();
      await p;
    });
    const rec = recorders[0];

    await act(async () => {
      rec.onerror?.(); // stops the recorder, which fires onstop
      rec.onstop?.(); // a second, late onstop
    });
    expect(result.current.interruptReason).toBe('error');

    let first: Awaited<ReturnType<typeof result.current.stop>> = null;
    let second: Awaited<ReturnType<typeof result.current.stop>> = null;
    await act(async () => {
      first = await result.current.stop();
      second = await result.current.stop();
    });
    expect(first!.endedBy).toBe('error');
    expect(second).toBeNull();
  });

  it('says so when the phone mutes the track', async () => {
    const { result } = renderHook(() => useVoiceRecorder());
    let stream: FakeStream | undefined;
    await act(async () => {
      const p = result.current.start();
      stream = await settleNext();
      await p;
    });
    await act(async () => {
      stream!.tracks[0].dispatchEvent(new Event('mute'));
    });
    expect(result.current.muted).toBe(true);
  });

  /**
   * When the phone ends the track, the recorder is often already inactive but
   * its last chunk (on most phones all of the audio) is still on its way. The
   * clip used to be built at once, empty, and the note was lost.
   */
  it('a track that ends after the recorder went quiet still keeps the whole note', async () => {
    const { result } = renderHook(() => useVoiceRecorder());
    let stream: FakeStream | undefined;
    await act(async () => {
      const p = result.current.start();
      stream = await settleNext();
      await p;
    });
    const rec = recorders[0]!;
    rec.state = 'inactive';

    await act(async () => {
      stream!.tracks[0]!.dispatchEvent(new Event('ended'));
    });
    // The audio has not arrived yet, so nothing has been built from it.
    expect(result.current.status).toBe('recording');

    await act(async () => {
      await Promise.resolve();
      rec.ondataavailable?.({ data: new Blob(['audio'], { type: rec.mimeType }) });
      rec.onstop?.();
    });
    expect(result.current.status).toBe('interrupted');

    let clip: Awaited<ReturnType<typeof result.current.stop>> = null;
    await act(async () => {
      clip = await result.current.stop();
    });
    expect(clip!.endedBy).toBe('ended');
    expect(clip!.blob.size).toBeGreaterThan(0);
  });

  it('stop() on a recorder already inactive waits for its last chunk', async () => {
    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      const p = result.current.start();
      await settleNext();
      await p;
    });
    const rec = recorders[0]!;
    rec.state = 'inactive';

    let clip: Awaited<ReturnType<typeof result.current.stop>> = null;
    await act(async () => {
      const stopping = result.current.stop();
      await Promise.resolve();
      rec.ondataavailable?.({ data: new Blob(['audio'], { type: rec.mimeType }) });
      rec.onstop?.();
      clip = await stopping;
    });
    expect(clip).not.toBeNull();
    expect(clip!.blob.size).toBeGreaterThan(0);
  });

  /**
   * A press while the last note is still flushing must not touch that note:
   * not tear down its microphone, not settle its stop() early. The note that
   * was just sent still arrives in full.
   */
  it('a press while the last note is still being finished waits, gives up quietly, and the note survives', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useVoiceRecorder());
    let first: FakeStream | undefined;
    await act(async () => {
      const p = result.current.start();
      first = await settleNext();
      await p;
    });
    const rec = recorders[0]!;
    rec.stop = function slowFlush() {
      this.state = 'inactive';
      setTimeout(() => {
        this.ondataavailable?.({ data: new Blob(['audio'], { type: this.mimeType }) });
        this.onstop?.();
      }, 2000);
    };

    let outcome: Awaited<ReturnType<typeof result.current.start>> | undefined;
    let clip: Awaited<ReturnType<typeof result.current.stop>> | undefined;
    let stopping: Promise<unknown> | undefined;
    await act(async () => {
      stopping = result.current.stop().then((c) => {
        clip = c;
      });
      const p = result.current.start();
      await vi.advanceTimersByTimeAsync(1500);
      outcome = await p;
    });

    expect(outcome).toEqual({ ok: false, cause: 'busy-self' });
    expect(gum()).toHaveBeenCalledTimes(1);
    expect(first!.stopped).toBe(false);
    expect(clip).toBeUndefined();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
      await stopping;
    });
    expect(clip!.blob.size).toBeGreaterThan(0);
  });

  /** A recorder that never fires `stop` used to leave the mic on and every later press waiting. */
  it('a recorder that never finishes is finished for it, and the next press works', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useVoiceRecorder());
    let first: FakeStream | undefined;
    await act(async () => {
      const p = result.current.start();
      first = await settleNext();
      await p;
    });
    const rec = recorders[0]!;
    rec.stop = function noFlush() {
      this.state = 'inactive';
    };

    let settled = false;
    await act(async () => {
      void result.current.stop().then(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(STOP_FINISH_MS);
    });
    expect(settled).toBe(true);
    expect(first!.stopped).toBe(true);

    let outcome: Awaited<ReturnType<typeof result.current.start>> | undefined;
    await act(async () => {
      const p = result.current.start();
      await vi.advanceTimersByTimeAsync(300);
      expect(gum()).toHaveBeenCalledTimes(2);
      await settleNext();
      outcome = await p;
    });
    expect(outcome).toEqual({ ok: true, session: expect.any(Number) });
  });

  /**
   * Two presses waiting on the same note: the composer watches only the newest
   * press, so the newest must be the one that gets the mic.
   */
  it('two presses waiting on a note being finished: the newer one gets the mic', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      const p = result.current.start();
      await settleNext();
      await p;
    });
    const rec = recorders[0]!;
    rec.stop = function slowFlush() {
      this.state = 'inactive';
      setTimeout(() => {
        this.ondataavailable?.({ data: new Blob(['audio'], { type: this.mimeType }) });
        this.onstop?.();
      }, 500);
    };

    let older: Awaited<ReturnType<typeof result.current.start>> | undefined;
    let newer: Awaited<ReturnType<typeof result.current.start>> | undefined;
    await act(async () => {
      void result.current.stop();
      const p1 = result.current.start();
      const p2 = result.current.start();
      await vi.advanceTimersByTimeAsync(500);
      older = await p1;
      await vi.advanceTimersByTimeAsync(300);
      await settleNext();
      newer = await p2;
    });

    expect(older).toEqual({ ok: false, cause: 'superseded' });
    expect(newer).toEqual({ ok: true, session: expect.any(Number) });
    expect(gum()).toHaveBeenCalledTimes(2);
  });

  /**
   * Press, let go before the mic opens, press again. Two asks at once used to
   * overwrite each other in the Android WebView's single permission slot, and
   * the press hung. The second press now joins the first ask.
   */
  it('two quick presses make ONE getUserMedia, and the newest press gets the mic', async () => {
    const { result } = renderHook(() => useVoiceRecorder());

    let first: Awaited<ReturnType<typeof result.current.start>> | undefined;
    let second: Awaited<ReturnType<typeof result.current.start>> | undefined;
    let stream: FakeStream | undefined;
    await act(async () => {
      const p1 = result.current.start();
      const p2 = result.current.start();
      stream = await settleNext();
      first = await p1;
      second = await p2;
    });

    expect(gum()).toHaveBeenCalledTimes(1);
    expect(first).toEqual({ ok: false, cause: 'superseded' });
    expect(second).toEqual({ ok: true, session: expect.any(Number) });
    expect(stream!.stopped).toBe(false);
  });

  it('waits a moment after letting go of one mic before asking for the next', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      const p = result.current.start();
      await settleNext();
      await p;
    });
    await act(async () => {
      await result.current.stop();
    });

    await act(async () => {
      void result.current.start();
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(gum()).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(gum()).toHaveBeenCalledTimes(2);
  });
});

/**
 * WHAT A VOICE NOTE IS RECORDED AS decides who can hear it. Recent iOS can record
 * WebM; an older iPhone cannot PLAY it. AAC in MP4 plays on every phone MDG's
 * dealers and team hold, so an iPhone puts it first. Android is unchanged.
 */
describe('useVoiceRecorder — what to record as', () => {
  const asked = async (platform: 'ios' | 'android') => {
    (window as unknown as { __DK_NATIVE_PLATFORM__?: string }).__DK_NATIVE_PLATFORM__ = platform;
    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      const p = result.current.start();
      await settleNext();
      await p;
    });
    return recorders.at(-1)!.options?.mimeType;
  };

  it('an iPhone tries AAC in MP4 before anything else, then plain MP4, then the common list', () => {
    const list = voiceMimeCandidates('ios');
    expect(list.slice(0, 2)).toEqual(['audio/mp4;codecs=mp4a.40.2', 'audio/mp4']);
    expect(list.slice(2)).toEqual(voiceMimeCandidates('android'));
  });

  it('Android keeps the order it has always had: WebM/Opus first', () => {
    expect(voiceMimeCandidates('android')).toEqual([
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/aac',
      'audio/ogg;codecs=opus',
    ]);
    expect(voiceMimeCandidates('web')).toEqual(voiceMimeCandidates('android'));
  });

  it('an iPhone that can record both picks MP4, not WebM', async () => {
    expect(await asked('ios')).toBe('audio/mp4;codecs=mp4a.40.2');
  });

  it('an iPhone that cannot name the codec falls back to plain MP4', async () => {
    FakeRecorder.supports = (t) => t === 'audio/mp4' || t.startsWith('audio/webm');
    expect(await asked('ios')).toBe('audio/mp4');
  });

  it('an Android phone that can record both still picks WebM/Opus', async () => {
    expect(await asked('android')).toBe('audio/webm;codecs=opus');
  });

  it('an iPhone that can only record WebM still records', async () => {
    FakeRecorder.supports = (t) => t.startsWith('audio/webm');
    expect(await asked('ios')).toBe('audio/webm;codecs=opus');
  });
});
