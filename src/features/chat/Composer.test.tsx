import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useLangStore } from '@/store/lang';
import { renderWithProviders } from '@/test/utils';

import { Composer } from './Composer';

/**
 * The recorder stub MODELS SESSIONS, because sessions are the contract.
 *
 * The old stub returned a bare boolean and the suite could not express the
 * difference between "the mic was refused" and "this attempt was abandoned" —
 * which is the difference the composer used to get wrong, and the reason a
 * dealer cancelling a voice note was told their microphone was blocked. A
 * counter here costs three lines and makes that testable.
 */
const recorder = vi.hoisted(() => ({
  supported: true,
  status: 'idle' as 'idle' | 'recording' | 'error',
  elapsedMs: 0,
  session: 0,
  start: vi.fn(),
  stop: vi.fn(),
  cancel: vi.fn(),
  getLevels: vi.fn(() => [] as number[]),
  currentSession: vi.fn((): number => recorder.session),
}));
vi.mock('@/lib/useVoiceRecorder', () => ({
  useVoiceRecorder: () => recorder,
}));

/** A start() that claims the mic, exactly as the real hook does. */
function startSucceeds() {
  recorder.start.mockImplementation(() => {
    recorder.session += 1;
    return Promise.resolve({ ok: true as const, session: recorder.session });
  });
}
/** A start() that fails for a named reason (the DOMException name). */
function startFails(name: string) {
  recorder.start.mockImplementation(() => {
    recorder.session += 1;
    return Promise.resolve({ ok: false as const, cause: 'error' as const, name });
  });
}
/** A start() that hangs, as it does while the OS permission dialog is up. */
function startHangs() {
  recorder.start.mockImplementation(() => {
    recorder.session += 1;
    return new Promise(() => {});
  });
}
/** `cancel()` invalidates whatever was opening — the real hook bumps here too. */
function cancelBumpsSession() {
  recorder.cancel.mockImplementation(() => {
    recorder.session += 1;
  });
}

const bridge = vi.hoisted(() => ({
  isNativeShell: vi.fn(() => true),
  requestNativeMicPermission: vi.fn(),
  openNativeAppSettings: vi.fn(),
  postToNative: vi.fn(),
  detectPlatform: vi.fn(() => 'android'),
  getInjectedPushToken: vi.fn(() => null),
  requestNativeDownload: vi.fn(),
}));
vi.mock('@/lib/nativeBridge', () => bridge);

/**
 * Regression: the first voice note opens the Android mic prompt, which is a
 * separate Activity over the WebView. `getUserMedia` does not settle while it is
 * up — and can stay pending forever if its result never reaches the WebView. The
 * composer used to sit in the press-and-hold overlay indefinitely: frozen 0:00
 * timer, no waveform, and no way to send, cancel, or even type. It had to be
 * impossible to get stuck there.
 */
describe('Composer voice recording — a mic that never opens', () => {
  beforeEach(() => {
    vi.useRealTimers();
    useLangStore.setState({ lang: 'en', explicit: true });
    recorder.start.mockReset();
    recorder.cancel.mockReset();
    recorder.currentSession.mockClear();
    recorder.session = 0;
    recorder.status = 'idle';
    cancelBumpsSession();
    bridge.isNativeShell.mockReturnValue(true);
    bridge.requestNativeMicPermission.mockReset();
    bridge.openNativeAppSettings.mockReset();
  });

  function pressMic() {
    const mic = screen.getByRole('button', { name: 'Record voice message' });
    fireEvent.pointerDown(mic, { pointerId: 1, clientX: 0, clientY: 0 });
    return mic;
  }

  it('recovers the composer when getUserMedia never resolves', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    startHangs();

    renderWithProviders(<Composer onSend={vi.fn()} />);
    pressMic();

    // Stuck in the press-and-hold overlay…
    expect(screen.getByText('Slide to cancel')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(12_000);
    });

    // …and released by the watchdog, rather than jamming forever.
    await waitFor(() => {
      expect(screen.queryByText('Slide to cancel')).not.toBeInTheDocument();
    });
    expect(recorder.cancel).toHaveBeenCalled();
    // A HANG IS NOT A REFUSAL. This used to re-prompt for a permission that was
    // never the problem — and that request, racing the WebView's own, is the
    // chain that could wedge the microphone for the life of the screen.
    expect(bridge.requestNativeMicPermission).not.toHaveBeenCalled();
    expect(await screen.findByText("The microphone didn't open")).toBeInTheDocument();
    vi.useRealTimers();
  });

  /**
   * THE ORIGINAL FROZEN-OVERLAY BUG, kept alive by the mechanism added to stop
   * it. One untagged watchdog slot was shared by every attempt: a superseded
   * attempt disarmed BEFORE it checked whether it had been superseded, so it
   * cleared the live attempt's timer on its way out. Press twice — which is
   * what anyone does when the first press looks frozen — and nothing was left
   * to rescue the composer.
   */
  it('a second press does not strip the live attempt of its watchdog', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let releaseFirst: (() => void) | null = null;
    let call = 0;
    recorder.start.mockImplementation(() => {
      call += 1;
      recorder.session += 1;
      if (call === 1) {
        return new Promise((resolve) => {
          releaseFirst = () => resolve({ ok: false, cause: 'superseded' });
        });
      }
      return new Promise(() => {});
    });

    renderWithProviders(<Composer onSend={vi.fn()} />);
    const mic = pressMic();
    await act(async () => {
      fireEvent.pointerUp(mic, { pointerId: 1 });
    });
    // It still looks frozen, so press again.
    await act(async () => {
      fireEvent.pointerDown(mic, { pointerId: 2, clientX: 0, clientY: 0 });
    });
    // The abandoned first attempt now settles, on its way out.
    await act(async () => {
      releaseFirst?.();
    });

    expect(screen.getByText('Slide to cancel')).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(12_000);
    });
    await waitFor(() => {
      expect(screen.queryByText('Slide to cancel')).not.toBeInTheDocument();
    });
    vi.useRealTimers();
  });

  /**
   * A TAP IS A TAP EVEN WHEN THE MIC IS SLOW. The hold length used to be
   * measured when the gesture was RESOLVED, which — if the mic was still
   * opening at release — is whenever getUserMedia happened to settle. A 150ms
   * tap on a cheap phone measured as a 750ms hold, so the composer stopped a
   * recorder that had just started, got no audio frames back, and told the
   * dealer their recording was too short. It reproduces on their hardware and
   * never on ours, which is how it survived review.
   */
  it('a quick tap goes hands-free even when the mic opens slowly', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let openMic: (() => void) | null = null;
    recorder.start.mockImplementation(() => {
      recorder.session += 1;
      const session = recorder.session;
      return new Promise((resolve) => {
        openMic = () => resolve({ ok: true, session });
      });
    });

    renderWithProviders(<Composer onSend={vi.fn()} />);
    const mic = pressMic();
    await act(async () => {
      vi.advanceTimersByTime(150);
      fireEvent.pointerUp(mic, { pointerId: 1 });
    });
    // The mic finally opens, well past the tap threshold.
    await act(async () => {
      vi.advanceTimersByTime(600);
      openMic?.();
    });

    expect(
      await screen.findByRole('button', { name: 'Send voice message' }),
    ).toBeInTheDocument();
    expect(recorder.stop).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  /**
   * CANCELLING IS NOT REFUSING, and telling a dealer their microphone is
   * blocked at the exact moment they chose not to use it is the report that
   * started this. Discarding a note while the mic was still opening left the
   * abandoned attempt to report a failure nobody had suffered: it returned
   * false with no error name, and "no error name" was read as "refused".
   */
  it('discarding a note while the mic is opening says nothing and asks nothing', async () => {
    let abandon: (() => void) | null = null;
    recorder.start.mockImplementation(() => {
      recorder.session += 1;
      return new Promise((resolve) => {
        abandon = () => resolve({ ok: false, cause: 'superseded' });
      });
    });

    renderWithProviders(<Composer onSend={vi.fn()} />);
    const mic = pressMic();
    // Slide up to hands-free while it is still opening, then bin it.
    await act(async () => {
      fireEvent.pointerMove(mic, { pointerId: 1, clientX: 0, clientY: -120 });
    });
    const bin = await screen.findByRole('button', { name: 'Cancel recording' });
    await act(async () => {
      fireEvent.pointerDown(bin, { pointerId: 2 });
      fireEvent.click(bin);
    });
    await act(async () => {
      abandon?.();
    });

    expect(recorder.cancel).toHaveBeenCalled();
    expect(bridge.requestNativeMicPermission).not.toHaveBeenCalled();
    expect(screen.queryByText("Can't access the microphone")).not.toBeInTheDocument();
    // And the bin worked first time: a blanket 500ms guard used to make the
    // natural "oops, cancel" tap do nothing at all.
    expect(
      screen.queryByRole('button', { name: 'Cancel recording' }),
    ).not.toBeInTheDocument();
  });

  /** The ordinary case, which had no coverage either: hold, speak, release. */
  it('a genuine hold sends the note when the finger lifts', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    startSucceeds();
    recorder.stop.mockResolvedValue({
      blob: new Blob(['audio'], { type: 'audio/webm' }),
      durationMs: 900,
      mimeType: 'audio/webm',
      peaks: [],
    });
    const onSend = vi.fn().mockResolvedValue(undefined);

    renderWithProviders(<Composer onSend={onSend} />);
    const mic = pressMic();
    await act(async () => {
      vi.advanceTimersByTime(900);
    });
    await act(async () => {
      fireEvent.pointerUp(mic, { pointerId: 1 });
    });

    await waitFor(() => expect(recorder.stop).toHaveBeenCalled());
    await waitFor(() => expect(onSend).toHaveBeenCalled());
    expect(screen.queryByText('Recording too short')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  /**
   * A pointer gesture arms a click suppressor so the keyboard path does not
   * also fire. It was only ever cleared where a click arrived — and the mic
   * button unmounts on every hands-free swap, so that click frequently never
   * came. The flag stayed set and silently ate the NEXT genuine keyboard or
   * TalkBack activation, which reads as "the mic sometimes does nothing".
   */
  it('a keyboard activation still works after a pointer gesture', async () => {
    startSucceeds();
    renderWithProviders(<Composer onSend={vi.fn()} />);

    // A pointer gesture that ends by handing over to hands-free, then binned.
    const mic = pressMic();
    await act(async () => {
      fireEvent.pointerMove(mic, { pointerId: 1, clientX: 0, clientY: -120 });
    });
    const bin = await screen.findByRole('button', { name: 'Cancel recording' });
    await act(async () => {
      fireEvent.pointerDown(bin, { pointerId: 2 });
      fireEvent.click(bin);
    });

    // Now activate the mic the way a keyboard or TalkBack does: click alone.
    recorder.start.mockClear();
    const micAgain = await screen.findByRole('button', { name: 'Record voice message' });
    await act(async () => {
      fireEvent.click(micAgain);
    });

    expect(recorder.start).toHaveBeenCalled();
  });

  it('starts recording once the native shell grants the mic', async () => {
    let call = 0;
    recorder.start.mockImplementation(() => {
      call += 1;
      recorder.session += 1;
      if (call === 1) {
        return Promise.resolve({ ok: false, cause: 'error', name: 'NotAllowedError' });
      }
      return Promise.resolve({ ok: true, session: recorder.session });
    });
    bridge.requestNativeMicPermission.mockResolvedValue({
      granted: true,
      permanentlyDenied: false,
    });

    renderWithProviders(<Composer onSend={vi.fn()} />);
    pressMic();

    // Granting must actually record — not just announce that the mic now works.
    await waitFor(() => {
      expect(recorder.start).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByRole('button', { name: 'Send voice message' })).toBeInTheDocument();
  });
});

describe('Composer reply strip', () => {
  beforeEach(() => {
    useLangStore.setState({ lang: 'en', explicit: false });
  });

  it('shows the quoted sender and snippet while replying', () => {
    renderWithProviders(
      <Composer
        onSend={vi.fn()}
        replyingTo={{ senderLabel: 'Priya', text: 'original message', icon: null }}
        onCancelReply={vi.fn()}
      />,
    );
    expect(screen.getByText('Priya')).toBeInTheDocument();
    expect(screen.getByText('original message')).toBeInTheDocument();
  });

  it('cancels the reply via the strip’s close button', () => {
    const onCancelReply = vi.fn();
    renderWithProviders(
      <Composer
        onSend={vi.fn()}
        replyingTo={{ senderLabel: 'You', text: 'Photo', icon: 'image' }}
        onCancelReply={onCancelReply}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel reply' }));
    expect(onCancelReply).toHaveBeenCalledTimes(1);
  });

  it('renders no strip when not replying', () => {
    renderWithProviders(<Composer onSend={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Cancel reply' })).toBeNull();
  });
});

/**
 * Regression: every way the microphone can fail used to produce the SAME message —
 * "allow microphone access in your phone Settings".
 *
 * That advice is only true when the mic was refused. If it is busy (a call, a voice
 * assistant, another app holding it), the dealer goes to Settings, finds the
 * permission already granted, and comes back to report the mic as broken again.
 * Which is roughly how a mic bug survives two rounds of fixes.
 *
 * The recorder now surfaces the DOMException name and the composer says something
 * that can actually be acted on.
 */
describe('Composer — the mic failure message matches the actual cause', () => {
  beforeEach(() => {
    vi.useRealTimers();
    useLangStore.setState({ lang: 'en', explicit: true });
    recorder.start.mockReset();
    recorder.cancel.mockReset();
    recorder.currentSession.mockClear();
    recorder.session = 0;
    recorder.status = 'idle';
    cancelBumpsSession();
    bridge.isNativeShell.mockReturnValue(true);
    bridge.requestNativeMicPermission.mockReset();
    bridge.openNativeAppSettings.mockReset();
  });

  /** Hold the mic, let start() fail, release. */
  async function failWith(name: string) {
    startFails(name);
    renderWithProviders(<Composer onSend={vi.fn()} />);
    const mic = screen.getByRole('button', { name: 'Record voice message' });
    await act(async () => {
      fireEvent.pointerDown(mic, { pointerId: 1, clientX: 0, clientY: 0 });
    });
    await act(async () => {
      fireEvent.pointerUp(window, { pointerId: 1 });
    });
  }

  it('a BUSY mic is not sent to Settings — the permission is already granted', async () => {
    // NotReadableError: allowed and present, but another app has it open.
    await failWith('NotReadableError');

    expect(
      await screen.findByText('The microphone is being used by another app'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Close any call or recording app/)).toBeInTheDocument();
    // The old, useless advice must be gone.
    expect(screen.queryByText(/in your phone Settings/)).not.toBeInTheDocument();
    // And we must not re-prompt: the permission was never the problem.
    expect(bridge.requestNativeMicPermission).not.toHaveBeenCalled();
  });

  it('a MISSING mic says so, and points at typing instead', async () => {
    await failWith('NotFoundError');

    expect(await screen.findByText('No microphone found on this phone')).toBeInTheDocument();
    expect(screen.queryByText(/in your phone Settings/)).not.toBeInTheDocument();
    expect(bridge.requestNativeMicPermission).not.toHaveBeenCalled();
  });

  it('an unusable mic (insecure context / no mediaDevices) does not blame the dealer', async () => {
    await failWith('SecurityError');

    expect(
      await screen.findByText("Voice notes don't work on this phone"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/in your phone Settings/)).not.toBeInTheDocument();
  });

  it('a REFUSED mic — the one case Settings actually fixes — still says Settings', async () => {
    startFails('NotAllowedError');
    // The native re-prompt is offered, and refused again.
    bridge.requestNativeMicPermission.mockResolvedValue({
      granted: false,
      permanentlyDenied: false,
    });

    renderWithProviders(<Composer onSend={vi.fn()} />);
    const mic = screen.getByRole('button', { name: 'Record voice message' });
    await act(async () => {
      fireEvent.pointerDown(mic, { pointerId: 1, clientX: 0, clientY: 0 });
    });
    await act(async () => {
      fireEvent.pointerUp(window, { pointerId: 1 });
    });

    // Only here is it right to re-ask, and only here is Settings the answer.
    await waitFor(() => expect(bridge.requestNativeMicPermission).toHaveBeenCalled());
    expect(await screen.findByText(/in your phone Settings/)).toBeInTheDocument();
    // Android will still ask, so there is nothing for a Settings button to fix.
    expect(screen.queryByRole('button', { name: 'Open settings' })).not.toBeInTheDocument();
  });

  /**
   * Once Android has stopped asking, pressing the mic can never show the prompt
   * again — the settings page is the only way back, and telling somebody to
   * find it themselves on a forecourt is where this trail goes cold.
   */
  it('offers a way in when Android has stopped asking', async () => {
    startFails('NotAllowedError');
    bridge.requestNativeMicPermission.mockResolvedValue({
      granted: false,
      permanentlyDenied: true,
    });

    renderWithProviders(<Composer onSend={vi.fn()} />);
    const mic = screen.getByRole('button', { name: 'Record voice message' });
    await act(async () => {
      fireEvent.pointerDown(mic, { pointerId: 1, clientX: 0, clientY: 0 });
    });
    await act(async () => {
      fireEvent.pointerUp(window, { pointerId: 1 });
    });

    const open = await screen.findByRole('button', { name: 'Open settings' });
    fireEvent.click(open);
    expect(bridge.openNativeAppSettings).toHaveBeenCalled();
  });
});

/**
 * The one-tap questions above the composer.
 *
 * They exist for one reason: "आज की रिपोर्ट?" is nine taps on a Devanagari phone
 * keyboard and one tap here. The dangerous part is the mechanism — the seed sets
 * the textarea's value, it does not append to it — so a chip that stayed on
 * screen beside a half-typed sentence would be a one-tap way to lose it. They
 * must be gone before the first character lands.
 */
describe('Composer quick-reply chips', () => {
  beforeEach(() => {
    vi.useRealTimers();
    useLangStore.setState({ lang: 'en', explicit: true });
  });

  // "Sent today's photo?" was the middle one until the conversational writer
  // shipped: `AskBar` already states that chore above this thread and opens the
  // camera, while "What do I need to do?" is the question the live incident at
  // 1E was handed to a person over.
  const CHIPS = ["Today's report?", 'What do I need to do?', 'Talk to support'];

  it('offers the three questions while the box is empty', () => {
    renderWithProviders(<Composer onSend={vi.fn()} showQuickReplies />);
    for (const label of CHIPS) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('fills the box and does NOT send', () => {
    const onSend = vi.fn();
    renderWithProviders(<Composer onSend={onSend} showQuickReplies />);
    fireEvent.click(screen.getByRole('button', { name: "Today's report?" }));

    const box = screen.getByPlaceholderText('Type your message…') as HTMLTextAreaElement;
    expect(box.value).toBe("Today's report?");
    // The dealer still reads it, still edits it, still presses Send.
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });

  it('disappears the moment anything is typed, so a chip can never wipe it', () => {
    renderWithProviders(<Composer onSend={vi.fn()} showQuickReplies />);
    const box = screen.getByPlaceholderText('Type your message…');
    fireEvent.change(box, { target: { value: 'p' } });

    for (const label of CHIPS) {
      expect(screen.queryByRole('button', { name: label })).toBeNull();
    }
  });

  it('stays gone while a half-typed message sits in the box', () => {
    // The one that actually protects the dealer: a long sentence, mid-thought.
    renderWithProviders(<Composer onSend={vi.fn()} showQuickReplies />);
    const box = screen.getByPlaceholderText('Type your message…');
    fireEvent.change(box, {
      target: { value: 'pump 2 ka nozzle band hai, kal se, aur' },
    });
    expect(screen.queryByRole('button', { name: 'Talk to support' })).toBeNull();
    // Clearing it brings them back — the row is a state of the empty box, not a
    // one-shot banner.
    fireEvent.change(box, { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Talk to support' })).toBeInTheDocument();
  });

  it('hides them while replying to a message', () => {
    // The reply strip owns that row, and a canned question is not a reply.
    renderWithProviders(
      <Composer
        onSend={vi.fn()}
        showQuickReplies
        replyingTo={{ senderLabel: 'MDG Support', text: 'the answer', icon: null }}
        onCancelReply={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: "Today's report?" })).toBeNull();
  });

  it('shows nothing at all when the caller has not asked for them', () => {
    // An empty thread: `MessageList`'s empty state is already offering its own
    // three chips, and six on one screen is no clear first move.
    renderWithProviders(<Composer onSend={vi.fn()} />);
    for (const label of CHIPS) {
      expect(screen.queryByRole('button', { name: label })).toBeNull();
    }
  });
});
