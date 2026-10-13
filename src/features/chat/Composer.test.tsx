import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useLangStore } from '@/store/lang';
import { makeMessage, renderWithProviders } from '@/test/utils';

import { Composer, type ComposerHandle } from './Composer';

// Unmount BEFORE the shared teardown resets the language store: that reset runs
// first otherwise, and re-renders a still-mounted component outside `act`.
afterEach(() => cleanup());

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
  const CHIPS = ["Today's report?", 'What do I need to do?'];

  it('offers the two questions while the box is empty', () => {
    renderWithProviders(<Composer onSend={vi.fn()} showQuickReplies />);
    for (const label of CHIPS) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('has no "Talk to support" chip — a person is reached by a ticket, not a tap', () => {
    renderWithProviders(<Composer onSend={vi.fn()} showQuickReplies />);
    expect(screen.queryByRole('button', { name: 'Talk to support' })).toBeNull();
  });

  it('fills the box and does NOT send', () => {
    const onSend = vi.fn();
    renderWithProviders(<Composer onSend={onSend} showQuickReplies />);
    fireEvent.click(screen.getByRole('button', { name: "Today's report?" }));

    const box = screen.getByPlaceholderText('Message') as HTMLTextAreaElement;
    expect(box.value).toBe("Today's report?");
    // The dealer still reads it, still edits it, still presses Send.
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });

  it('disappears the moment anything is typed, so a chip can never wipe it', () => {
    renderWithProviders(<Composer onSend={vi.fn()} showQuickReplies />);
    const box = screen.getByPlaceholderText('Message');
    fireEvent.change(box, { target: { value: 'p' } });

    for (const label of CHIPS) {
      expect(screen.queryByRole('button', { name: label })).toBeNull();
    }
  });

  it('stays gone while a half-typed message sits in the box', () => {
    // The one that actually protects the dealer: a long sentence, mid-thought.
    renderWithProviders(<Composer onSend={vi.fn()} showQuickReplies />);
    const box = screen.getByPlaceholderText('Message');
    fireEvent.change(box, {
      target: { value: 'pump 2 ka nozzle band hai, kal se, aur' },
    });
    expect(screen.queryByRole('button', { name: "Today's report?" })).toBeNull();
    // Clearing it brings them back — the row is a state of the empty box, not a
    // one-shot banner.
    fireEvent.change(box, { target: { value: '' } });
    expect(screen.getByRole('button', { name: "Today's report?" })).toBeInTheDocument();
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


/**
 * The composer as WhatsApp draws it: a white pill with the box, a paperclip and a
 * camera, a round green button outside it, and an attach card, a photo preview
 * and a caption on the way to a send. NONE of it may touch the voice code above,
 * which is why that suite is left exactly as it was.
 */
describe('Composer — the pill', () => {
  beforeEach(() => {
    vi.useRealTimers();
    useLangStore.setState({ lang: 'en', explicit: true });
    recorder.supported = true;
  });

  it('has a "Message" box, a paperclip and a camera, and the mic outside the pill', () => {
    renderWithProviders(<Composer onSend={vi.fn()} />);
    expect(screen.getByPlaceholderText('Message')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Attach' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Take a photo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record voice message' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
  });

  it('turns the mic into Send, and loses the camera, the moment there is text', () => {
    renderWithProviders(<Composer onSend={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('Message'), { target: { value: 'hi' } });
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Record voice message' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Take a photo' })).toBeNull();
    // …and clearing the box brings them back.
    fireEvent.change(screen.getByPlaceholderText('Message'), { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Record voice message' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Take a photo' })).toBeInTheDocument();
  });

  it('Enter is a new line, Ctrl+Enter sends', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<Composer onSend={onSend} />);
    const box = screen.getByPlaceholderText('Message');
    fireEvent.change(box, { target: { value: 'line one' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();

    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('line one', []));
  });

  it('puts the reply quote inside the pill with the sender in the accent colour', () => {
    renderWithProviders(
      <Composer
        onSend={vi.fn()}
        replyingTo={{ senderLabel: 'MDG', text: 'the answer', icon: 'image' }}
        onCancelReply={vi.fn()}
      />,
    );
    const strip = screen.getByLabelText('Replying to MDG');
    expect(within(strip).getByText('MDG')).toHaveClass('text-wa-accent-strong');
    expect(within(strip).getByText('the answer')).toBeInTheDocument();
    // The box is in the same pill, not under it.
    expect(strip.parentElement).toContainElement(screen.getByPlaceholderText('Message'));
  });

  it('sends typed text with no attachments as before', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<Composer onSend={onSend} />);
    fireEvent.change(screen.getByPlaceholderText('Message'), { target: { value: ' hello ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('hello', []));
    expect((screen.getByPlaceholderText('Message') as HTMLTextAreaElement).value).toBe('');
  });
});

describe('Composer — the attach card', () => {
  /** Every hidden file input, by what it accepts. */
  function inputs(container: HTMLElement) {
    const all = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="file"]'));
    return {
      document: all.find((i) => i.accept.includes('.pdf'))!,
      gallery: all.find((i) => i.accept === 'image/*' && !i.hasAttribute('capture'))!,
      camera: all.find((i) => i.hasAttribute('capture'))!,
    };
  }

  beforeEach(() => {
    vi.useRealTimers();
    useLangStore.setState({ lang: 'en', explicit: true });
    recorder.supported = true;
  });

  it('the paperclip opens a card of three choices — it does not open a picker itself', () => {
    const { container } = renderWithProviders(<Composer onSend={vi.fn()} />);
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    expect(screen.queryByRole('dialog', { name: 'Attach' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Attach' }));
    const card = screen.getByRole('dialog', { name: 'Attach' });
    for (const name of ['Document', 'Camera', 'Gallery']) {
      expect(within(card).getByRole('button', { name })).toBeInTheDocument();
    }
    expect(click).not.toHaveBeenCalled();
    expect(inputs(container).document).toBeDefined();
  });

  it.each([
    ['Document', 'document'],
    ['Camera', 'camera'],
    ['Gallery', 'gallery'],
  ] as const)('%s opens its own chooser and closes the card', (label, which) => {
    const { container } = renderWithProviders(<Composer onSend={vi.fn()} />);
    const picked: HTMLInputElement[] = [];
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (
      this: HTMLInputElement,
    ) {
      picked.push(this);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Attach' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Attach' })).getByRole('button', { name: label }));

    expect(picked).toEqual([inputs(container)[which]]);
    expect(screen.queryByRole('dialog', { name: 'Attach' })).toBeNull();
  });

  it('Document takes papers only, Gallery takes pictures, Camera shoots one with the rear camera', () => {
    const { container } = renderWithProviders(<Composer onSend={vi.fn()} />);
    const { document: doc, gallery, camera } = inputs(container);
    expect(doc.accept).toBe('.pdf,.doc,.docx,.xls,.xlsx,.txt');
    expect(doc.multiple).toBe(true);
    expect(gallery.accept).toBe('image/*');
    expect(gallery.multiple).toBe(true);
    expect(camera.getAttribute('capture')).toBe('environment');
  });

  it('the camera icon in the pill goes straight to the camera', () => {
    const { container } = renderWithProviders(<Composer onSend={vi.fn()} />);
    const picked: HTMLInputElement[] = [];
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (
      this: HTMLInputElement,
    ) {
      picked.push(this);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Take a photo' }));
    expect(picked).toEqual([inputs(container).camera]);
  });

  it('closes on the phone’s Back button and on a tap outside', () => {
    renderWithProviders(<Composer onSend={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Attach' }));
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.queryByRole('dialog', { name: 'Attach' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Attach' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('dialog', { name: 'Attach' })).toBeNull();
  });
});

describe('Composer — photos go through the preview', () => {
  const photo = (name: string, type = 'image/jpeg') => new File(['x'], name, { type });
  let seq = 0;

  function galleryInput(container: HTMLElement) {
    return Array.from(container.querySelectorAll<HTMLInputElement>('input[type="file"]')).find(
      (i) => i.accept === 'image/*' && !i.hasAttribute('capture'),
    )!;
  }
  function cameraInput(container: HTMLElement) {
    return container.querySelector<HTMLInputElement>('input[capture]')!;
  }
  function documentInput(container: HTMLElement) {
    return Array.from(container.querySelectorAll<HTMLInputElement>('input[type="file"]')).find((i) =>
      i.accept.includes('.pdf'),
    )!;
  }
  const previewDialog = () => screen.getByRole('dialog', { name: 'Image preview' });

  beforeEach(() => {
    vi.useRealTimers();
    useLangStore.setState({ lang: 'en', explicit: true });
    recorder.supported = true;
    seq = 0;
    URL.createObjectURL = vi.fn(() => `blob:local-${(seq += 1)}`);
    URL.revokeObjectURL = vi.fn();
  });

  it('picking a photo opens the full-screen preview, not a chip', () => {
    const { container } = renderWithProviders(<Composer onSend={vi.fn()} />);
    expect(screen.queryByRole('dialog', { name: 'Image preview' })).toBeNull();

    fireEvent.change(galleryInput(container), { target: { files: [photo('one.jpg')] } });

    const dialog = previewDialog();
    expect(within(dialog).getByAltText('one.jpg')).toHaveAttribute('src', 'blob:local-1');
    expect(within(dialog).getByPlaceholderText('Add a caption…')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Send' })).toBeInTheDocument();
    // No thumbnail strip for a single picture, and no chip behind it.
    expect(within(dialog).queryByRole('button', { name: /^Photo \d+ of \d+$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove attachment' })).toBeNull();
  });

  it('a shot from the camera whose file has no MIME type is still a photo', () => {
    const { container } = renderWithProviders(<Composer onSend={vi.fn()} />);
    fireEvent.change(cameraInput(container), { target: { files: [photo('IMG_0042', '')] } });
    expect(within(previewDialog()).getByAltText('IMG_0042')).toBeInTheDocument();
  });

  it('sends every picture as ONE message with the caption, and lets the previews go once it is sent', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const { container } = renderWithProviders(<Composer onSend={onSend} />);
    fireEvent.change(galleryInput(container), {
      target: { files: [photo('a.jpg'), photo('b.jpg'), photo('c.png', 'image/png')] },
    });
    const dialog = previewDialog();
    fireEvent.change(within(dialog).getByPlaceholderText('Add a caption…'), {
      target: { value: '  Pump 3 today  ' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    const [body, files] = onSend.mock.calls[0]!;
    expect(body).toBe('Pump 3 today');
    expect(files.map((f: { file: File }) => f.file.name)).toEqual(['a.jpg', 'b.jpg', 'c.png']);
    expect(files.every((f: { kind: string }) => f.kind === 'image')).toBe(true);
    // The thread draws its own bubble from the files; the composer's local
    // previews have done their job, and a camera's big file is not held on to.
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledTimes(3));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-1');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-2');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-3');
    // The preview is gone, nothing is left staged, and the box is empty.
    expect(screen.queryByRole('dialog', { name: 'Image preview' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove attachment' })).toBeNull();
  });

  it('starts the caption from what was already typed in the box, and the send empties the box', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const { container } = renderWithProviders(<Composer onSend={onSend} />);
    fireEvent.change(screen.getByPlaceholderText('Message'), { target: { value: 'nozzle 2' } });
    fireEvent.change(galleryInput(container), { target: { files: [photo('a.jpg')] } });

    const caption = within(previewDialog()).getByPlaceholderText('Add a caption…') as HTMLTextAreaElement;
    expect(caption.value).toBe('nozzle 2');
    fireEvent.click(within(previewDialog()).getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(onSend).toHaveBeenCalledWith('nozzle 2', expect.any(Array)));
    expect((screen.getByPlaceholderText('Message') as HTMLTextAreaElement).value).toBe('');
  });

  it('sends a photo with no caption at all', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const { container } = renderWithProviders(<Composer onSend={onSend} />);
    fireEvent.change(galleryInput(container), { target: { files: [photo('a.jpg')] } });
    fireEvent.click(within(previewDialog()).getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('', expect.any(Array)));
  });

  it('Ctrl+Enter in the caption sends; plain Enter is a new line', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const { container } = renderWithProviders(<Composer onSend={onSend} />);
    fireEvent.change(galleryInput(container), { target: { files: [photo('a.jpg')] } });
    const caption = within(previewDialog()).getByPlaceholderText('Add a caption…');
    fireEvent.change(caption, { target: { value: 'x' } });
    fireEvent.keyDown(caption, { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(caption, { key: 'Enter', metaKey: true });
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('x', expect.any(Array)));
  });

  it('several pictures show a strip: tap to switch, ✕ on the current one drops it', () => {
    const { container } = renderWithProviders(<Composer onSend={vi.fn()} />);
    fireEvent.change(galleryInput(container), {
      target: { files: [photo('a.jpg'), photo('b.jpg'), photo('c.jpg')] },
    });
    const dialog = previewDialog();
    expect(within(dialog).getByAltText('a.jpg')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Photo 2 of 3' }));
    expect(within(dialog).getByAltText('b.jpg')).toBeInTheDocument();
    expect(within(dialog).queryByAltText('a.jpg')).toBeNull();

    // Drop the one on screen: its neighbour takes over, two are left.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove this photo' }));
    expect(within(dialog).getAllByRole('button', { name: /^Photo \d of 2$/ })).toHaveLength(2);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-2');
    expect(within(dialog).getByAltText('c.jpg')).toBeInTheDocument();
  });

  it('dropping one of two leaves the other on its own, with no strip', () => {
    const { container } = renderWithProviders(<Composer onSend={vi.fn()} />);
    fireEvent.change(galleryInput(container), {
      target: { files: [photo('a.jpg'), photo('b.jpg')] },
    });
    fireEvent.click(within(previewDialog()).getByRole('button', { name: 'Remove this photo' }));
    expect(within(previewDialog()).getByAltText('b.jpg')).toBeInTheDocument();
    expect(within(previewDialog()).queryByRole('button', { name: /^Photo \d of \d$/ })).toBeNull();
  });

  it('+ opens the gallery again and the new pictures join the batch', () => {
    const { container } = renderWithProviders(<Composer onSend={vi.fn()} />);
    const gallery = galleryInput(container);
    fireEvent.change(gallery, { target: { files: [photo('a.jpg')] } });

    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    fireEvent.click(within(previewDialog()).getByRole('button', { name: 'Add more photos' }));
    expect(click).toHaveBeenCalled();

    fireEvent.change(gallery, { target: { files: [photo('b.jpg')] } });
    expect(within(previewDialog()).getAllByRole('button', { name: /^Photo \d of 2$/ })).toHaveLength(2);
  });

  it('✕ cancels: nothing is sent, nothing is kept, the typed text stays', () => {
    const onSend = vi.fn();
    const { container } = renderWithProviders(<Composer onSend={onSend} />);
    fireEvent.change(screen.getByPlaceholderText('Message'), { target: { value: 'keep me' } });
    fireEvent.change(galleryInput(container), {
      target: { files: [photo('a.jpg'), photo('b.jpg')] },
    });
    fireEvent.click(within(previewDialog()).getByRole('button', { name: 'Close preview' }));

    expect(screen.queryByRole('dialog', { name: 'Image preview' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove attachment' })).toBeNull();
    expect(onSend).not.toHaveBeenCalled();
    expect((screen.getByPlaceholderText('Message') as HTMLTextAreaElement).value).toBe('keep me');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-1');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-2');
  });

  it('the phone’s Back button cancels the preview too', () => {
    const { container } = renderWithProviders(<Composer onSend={vi.fn()} />);
    fireEvent.change(galleryInput(container), { target: { files: [photo('a.jpg')] } });
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.queryByRole('dialog', { name: 'Image preview' })).toBeNull();
  });

  it('a paper picked from the Document chooser is a chip above the box, with no preview', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const { container } = renderWithProviders(<Composer onSend={onSend} />);
    fireEvent.change(documentInput(container), {
      target: { files: [photo('rates.pdf', 'application/pdf')] },
    });
    expect(screen.queryByRole('dialog', { name: 'Image preview' })).toBeNull();
    expect(screen.getByText('rates.pdf')).toBeInTheDocument();
    // A staged paper is something to send, so the mic has turned into Send.
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend.mock.calls[0]![1][0]).toMatchObject({ kind: 'file' });
  });

  it('a picture from the Document chooser still gets the preview', () => {
    const { container } = renderWithProviders(<Composer onSend={vi.fn()} />);
    fireEvent.change(documentInput(container), { target: { files: [photo('scan.png', 'image/png')] } });
    expect(within(previewDialog()).getByAltText('scan.png')).toBeInTheDocument();
  });

  it('papers and photos go out together in one message', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const { container } = renderWithProviders(<Composer onSend={onSend} />);
    fireEvent.change(documentInput(container), {
      target: { files: [photo('rates.pdf', 'application/pdf')] },
    });
    fireEvent.change(galleryInput(container), { target: { files: [photo('a.jpg')] } });
    fireEvent.click(within(previewDialog()).getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend.mock.calls[0]![1].map((f: { kind: string }) => f.kind)).toEqual(['file', 'image']);
  });

  it('stops at ten to a message, says so, and lets the rest go', async () => {
    const { container } = renderWithProviders(<Composer onSend={vi.fn()} />);
    const twelve = Array.from({ length: 12 }, (_, i) => photo(`p${i}.jpg`));
    fireEvent.change(galleryInput(container), { target: { files: twelve } });
    expect(await screen.findByText('You can send up to 10 files at once')).toBeInTheDocument();
    expect(
      within(previewDialog()).getAllByRole('button', { name: /^Photo \d+ of 10$/ }),
    ).toHaveLength(10);
    // The two that did not fit are not leaked.
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it('a failed send brings the photos back as chips and the words back in the box', async () => {
    const onSend = vi.fn().mockRejectedValue(new Error('offline'));
    const { container } = renderWithProviders(<Composer onSend={onSend} />);
    fireEvent.change(galleryInput(container), { target: { files: [photo('a.jpg'), photo('b.jpg')] } });
    fireEvent.change(within(previewDialog()).getByPlaceholderText('Add a caption…'), {
      target: { value: 'try me' },
    });
    fireEvent.click(within(previewDialog()).getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Remove attachment' })).toHaveLength(2),
    );
    expect((screen.getByPlaceholderText('Message') as HTMLTextAreaElement).value).toBe('try me');
    // Not revoked: a restored photo has to still be viewable.
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it('does not send from the preview while the composer is disabled, and keeps the pictures', () => {
    const onSend = vi.fn();
    const { container, rerender } = renderWithProviders(<Composer onSend={onSend} />);
    fireEvent.change(galleryInput(container), { target: { files: [photo('a.jpg')] } });
    // The chat went read-only while the preview was open.
    rerender(<Composer onSend={onSend} disabled />);
    fireEvent.click(within(previewDialog()).getByRole('button', { name: 'Send' }));
    expect(onSend).not.toHaveBeenCalled();
    expect(within(previewDialog()).getByAltText('a.jpg')).toBeInTheDocument();
  });
});

/**
 * A request's "Send photo" lives in a message bubble, far from this component's
 * private file inputs. The chat screen reaches them through a handle — and the
 * click on the input has to happen INSIDE the tap that asked for it, because the
 * Android System WebView drops a picker opened from an effect or a later render.
 *
 * The request is only REMEMBERED at the tap. It becomes the reply target when a
 * file really arrives (`onAnswerPicked`) and is let go if the dealer backs out
 * (`onAnswerDropped`): a cancelled camera fires no event, so a reply target set at
 * the tap would sit above the box and claim whatever photo came next.
 */
describe('Composer — answering a request (the handle)', () => {
  const file = (name: string, type: string) => new File(['x'], name, { type });
  const ask = makeMessage({
    id: 'ask-msg',
    senderId: 'system-user',
    senderRole: 'admin',
    system: true,
    body: 'MDG needs your Fire NOC.',
    ask: { ref: 'doc:ask1', kind: 'document', title: 'Fire NOC', acceptsFile: true },
  });
  const otherAsk = makeMessage({
    id: 'ask-2',
    senderId: 'system-user',
    senderRole: 'admin',
    system: true,
    body: 'MDG needs the register page.',
    ask: { ref: 'reg:2026-10-11', kind: 'register', title: 'Register page' },
  });
  let seq = 0;

  function inputs(container: HTMLElement) {
    const all = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="file"]'));
    return {
      camera: container.querySelector<HTMLInputElement>('input[capture]')!,
      ask: all.find((i) => i.accept === 'image/*,application/pdf')!,
      // The attach card's Gallery takes many pictures; a request's takes one.
      gallery: all.find((i) => i.accept === 'image/*' && !i.hasAttribute('capture') && i.multiple)!,
      askGallery: all.find((i) => i.accept === 'image/*' && !i.hasAttribute('capture') && !i.multiple)!,
    };
  }
  const previewDialog = () => screen.getByRole('dialog', { name: 'Image preview' });

  beforeEach(() => {
    vi.useRealTimers();
    useLangStore.setState({ lang: 'en', explicit: true });
    recorder.supported = true;
    recorder.status = 'idle';
    seq = 0;
    URL.createObjectURL = vi.fn(() => `blob:ask-${(seq += 1)}`);
    URL.revokeObjectURL = vi.fn();
  });

  function mountWithHandle(props: Partial<React.ComponentProps<typeof Composer>> = {}) {
    const ref = React.createRef<ComposerHandle>();
    const utils = renderWithProviders(<Composer ref={ref} onSend={vi.fn()} {...props} />);
    return { ref, ...utils };
  }

  it('openCamera() clicks the rear-camera input before it returns — not later', () => {
    const { ref, container } = mountWithHandle();
    const { camera } = inputs(container);
    const click = vi.spyOn(camera, 'click');

    ref.current!.openCamera(ask);

    // No await, no act, no timer between the call and the click.
    expect(click).toHaveBeenCalledTimes(1);
    expect(camera.getAttribute('capture')).toBe('environment');
  });

  it('openFiles() clicks a picture-or-PDF input that takes ONE file', () => {
    const { ref, container } = mountWithHandle();
    const { ask: askInput, camera } = inputs(container);
    const click = vi.spyOn(askInput, 'click');
    const cameraClick = vi.spyOn(camera, 'click');

    ref.current!.openFiles(ask);

    expect(click).toHaveBeenCalledTimes(1);
    expect(cameraClick).not.toHaveBeenCalled();
    // One file: MDG files one picture or PDF per answer.
    expect(askInput.multiple).toBe(false);
    expect(askInput.accept).toBe('image/*,application/pdf');
  });

  it('openGallery() clicks an input for ONE picture that is not the camera', () => {
    const { ref, container } = mountWithHandle();
    const { askGallery, camera, ask: askInput } = inputs(container);
    const click = vi.spyOn(askGallery, 'click');
    const cameraClick = vi.spyOn(camera, 'click');
    const askClick = vi.spyOn(askInput, 'click');

    ref.current!.openGallery(ask);

    expect(click).toHaveBeenCalledTimes(1);
    expect(cameraClick).not.toHaveBeenCalled();
    expect(askClick).not.toHaveBeenCalled();
    // Photos only (no PDF: a register page is a picture), no `capture` (that is
    // what would force the camera), and one at a time.
    expect(askGallery.accept).toBe('image/*');
    expect(askGallery.hasAttribute('capture')).toBe(false);
    expect(askGallery.multiple).toBe(false);
  });

  it('does nothing while the composer cannot send', () => {
    const { ref, container } = mountWithHandle({ disabled: true });
    const { camera, ask: askInput, askGallery } = inputs(container);
    const cameraClick = vi.spyOn(camera, 'click');
    const askClick = vi.spyOn(askInput, 'click');
    const galleryClick = vi.spyOn(askGallery, 'click');

    ref.current!.openCamera(ask);
    ref.current!.openFiles(ask);
    ref.current!.openGallery(ask);

    expect(cameraClick).not.toHaveBeenCalled();
    expect(askClick).not.toHaveBeenCalled();
    expect(galleryClick).not.toHaveBeenCalled();
  });

  it('does nothing while a voice note is being recorded — a camera would end it', async () => {
    recorder.start.mockImplementation(() => {
      recorder.session += 1;
      return Promise.resolve({ ok: true as const, session: recorder.session });
    });
    const { ref, container } = mountWithHandle();
    const { camera } = inputs(container);
    const cameraClick = vi.spyOn(camera, 'click');

    // A tap on the mic starts hands-free recording.
    const mic = screen.getByRole('button', { name: 'Record voice message' });
    fireEvent.pointerDown(mic, { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerUp(mic, { pointerId: 1, clientX: 0, clientY: 0 });
    await screen.findByRole('button', { name: 'Send voice message' });

    ref.current!.openCamera(ask);
    expect(cameraClick).not.toHaveBeenCalled();
  });

  it('a photo from the camera goes through the same full-screen preview', () => {
    const { container } = mountWithHandle();
    fireEvent.change(inputs(container).camera, {
      target: { files: [file('IMG_5.jpg', 'image/jpeg')] },
    });
    expect(screen.getByRole('dialog', { name: 'Image preview' })).toBeInTheDocument();
  });

  it('a picture chosen with "Choose file" goes to the same preview', () => {
    const { container } = mountWithHandle();
    const { ask: askInput } = inputs(container);

    fireEvent.change(askInput, { target: { files: [file('noc.png', 'image/png')] } });
    expect(
      within(screen.getByRole('dialog', { name: 'Image preview' })).getByAltText('noc.png'),
    ).toBeInTheDocument();
  });

  it('a picture chosen from the gallery goes to the same preview', () => {
    const { container } = mountWithHandle();
    fireEvent.change(inputs(container).askGallery, {
      target: { files: [file('register.jpg', 'image/jpeg')] },
    });
    expect(within(previewDialog()).getByAltText('register.jpg')).toBeInTheDocument();
  });

  it('a PDF chosen with "Choose file" waits as a chip, ready to send', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const { container } = mountWithHandle({ onSend });
    fireEvent.change(inputs(container).ask, {
      target: { files: [file('licence.pdf', 'application/pdf')] },
    });

    expect(screen.queryByRole('dialog', { name: 'Image preview' })).toBeNull();
    expect(screen.getByText('licence.pdf')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend.mock.calls[0]![1][0]).toMatchObject({ kind: 'file', contentType: 'application/pdf' });
  });

  describe('the request becomes the reply target only when a file really arrives', () => {
    it('pressing the button alone raises nothing — a cancelled camera leaves no reply target behind', () => {
      const onAnswerPicked = vi.fn();
      const onAnswerDropped = vi.fn();
      const { ref } = mountWithHandle({ onAnswerPicked, onAnswerDropped });

      ref.current!.openCamera(ask);
      // The dealer cancels: the browser fires no event at all. Nothing to wait for…
      expect(onAnswerPicked).not.toHaveBeenCalled();
      expect(onAnswerDropped).not.toHaveBeenCalled();
    });

    it('a cancelled camera does not claim the NEXT photo, whichever door it comes through', () => {
      const onAnswerPicked = vi.fn();
      const { ref, container } = mountWithHandle({ onAnswerPicked });
      ref.current!.openCamera(ask);

      // …then the dealer takes an ordinary photo with the camera beside the box.
      vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
      fireEvent.click(screen.getByRole('button', { name: 'Take a photo' }));
      fireEvent.change(inputs(container).camera, {
        target: { files: [file('pump_fault.jpg', 'image/jpeg')] },
      });

      expect(previewDialog()).toBeInTheDocument();
      expect(onAnswerPicked).not.toHaveBeenCalled();
    });

    it('a cancelled camera does not claim a photo picked from the attach card either', () => {
      const onAnswerPicked = vi.fn();
      const { ref, container } = mountWithHandle({ onAnswerPicked });
      ref.current!.openCamera(ask);

      vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
      fireEvent.click(screen.getByRole('button', { name: 'Attach' }));
      fireEvent.click(within(screen.getByRole('dialog', { name: 'Attach' })).getByRole('button', { name: /Gallery/ }));
      fireEvent.change(inputs(container).gallery, {
        target: { files: [file('other.jpg', 'image/jpeg')] },
      });

      expect(onAnswerPicked).not.toHaveBeenCalled();
    });

    it('the photo that arrives from the camera is the answer: the request is handed up, once', () => {
      const onAnswerPicked = vi.fn();
      const { ref, container } = mountWithHandle({ onAnswerPicked });
      ref.current!.openCamera(ask);
      expect(onAnswerPicked).not.toHaveBeenCalled();

      fireEvent.change(inputs(container).camera, {
        target: { files: [file('IMG_5.jpg', 'image/jpeg')] },
      });

      expect(onAnswerPicked).toHaveBeenCalledTimes(1);
      expect(onAnswerPicked).toHaveBeenCalledWith(ask);
      // A second file (the "+" in the preview) is more of the same answer, not a new one.
      fireEvent.change(inputs(container).gallery, {
        target: { files: [file('IMG_6.jpg', 'image/jpeg')] },
      });
      expect(onAnswerPicked).toHaveBeenCalledTimes(1);
    });

    it('a file from "Choose file" and one from the gallery are answers too', () => {
      const onAnswerPicked = vi.fn();
      const { ref, container } = mountWithHandle({ onAnswerPicked });

      ref.current!.openFiles(ask);
      fireEvent.change(inputs(container).ask, {
        target: { files: [file('licence.pdf', 'application/pdf')] },
      });
      expect(onAnswerPicked).toHaveBeenLastCalledWith(ask);

      ref.current!.openGallery(otherAsk);
      fireEvent.change(inputs(container).askGallery, {
        target: { files: [file('register.jpg', 'image/jpeg')] },
      });
      expect(onAnswerPicked).toHaveBeenLastCalledWith(otherAsk);
    });

    it('pressing a second request replaces the first one that was never answered', () => {
      const onAnswerPicked = vi.fn();
      const { ref, container } = mountWithHandle({ onAnswerPicked });
      ref.current!.openCamera(ask);
      ref.current!.openGallery(otherAsk);

      fireEvent.change(inputs(container).askGallery, {
        target: { files: [file('register.jpg', 'image/jpeg')] },
      });

      expect(onAnswerPicked).toHaveBeenCalledTimes(1);
      expect(onAnswerPicked).toHaveBeenCalledWith(otherAsk);
    });

    it('✕ / Back on the preview lets the request go', () => {
      const onAnswerPicked = vi.fn();
      const onAnswerDropped = vi.fn();
      const { ref, container } = mountWithHandle({ onAnswerPicked, onAnswerDropped });
      ref.current!.openCamera(ask);
      fireEvent.change(inputs(container).camera, {
        target: { files: [file('IMG_5.jpg', 'image/jpeg')] },
      });

      fireEvent.click(within(previewDialog()).getByRole('button', { name: 'Close preview' }));

      expect(onAnswerDropped).toHaveBeenCalledTimes(1);
      expect(onAnswerDropped).toHaveBeenCalledWith(ask);
      // And closing it again (a stray second Back) says nothing more.
      expect(screen.queryByRole('dialog', { name: 'Image preview' })).toBeNull();
    });

    it('dropping one of two photos keeps the answer; closing what is left lets it go', () => {
      const onAnswerDropped = vi.fn();
      const { ref, container } = mountWithHandle({ onAnswerDropped });
      ref.current!.openGallery(otherAsk);
      fireEvent.change(inputs(container).askGallery, {
        target: { files: [file('a.jpg', 'image/jpeg')] },
      });
      fireEvent.change(inputs(container).gallery, {
        target: { files: [file('b.jpg', 'image/jpeg')] },
      });

      fireEvent.click(within(previewDialog()).getByRole('button', { name: 'Remove this photo' }));
      // One photo is still waiting to go with it.
      expect(onAnswerDropped).not.toHaveBeenCalled();

      fireEvent.click(within(previewDialog()).getByRole('button', { name: 'Close preview' }));
      expect(onAnswerDropped).toHaveBeenCalledTimes(1);
      expect(onAnswerDropped).toHaveBeenCalledWith(otherAsk);
    });

    it('closing the preview keeps the answer while a PDF chip is still waiting to go with it', () => {
      const onAnswerDropped = vi.fn();
      const { ref, container } = mountWithHandle({ onAnswerDropped });
      ref.current!.openFiles(ask);
      fireEvent.change(inputs(container).ask, {
        target: { files: [file('licence.pdf', 'application/pdf')] },
      });
      // A photo of the same paper joins the chip, then the dealer thinks better of it.
      fireEvent.change(inputs(container).gallery, {
        target: { files: [file('page2.jpg', 'image/jpeg')] },
      });
      fireEvent.click(within(previewDialog()).getByRole('button', { name: 'Close preview' }));

      expect(onAnswerDropped).not.toHaveBeenCalled();
      expect(screen.getByText('licence.pdf')).toBeInTheDocument();
    });

    it('taking the PDF chip off lets the request go', () => {
      const onAnswerDropped = vi.fn();
      const { ref, container } = mountWithHandle({ onAnswerDropped });
      ref.current!.openFiles(ask);
      fireEvent.change(inputs(container).ask, {
        target: { files: [file('licence.pdf', 'application/pdf')] },
      });

      fireEvent.click(screen.getByRole('button', { name: 'Remove attachment' }));

      expect(onAnswerDropped).toHaveBeenCalledWith(ask);
    });

    it('sending the answer spends the request — nothing is handed back after', async () => {
      const onAnswerDropped = vi.fn();
      const onSend = vi.fn().mockResolvedValue(undefined);
      const { ref, container } = mountWithHandle({ onSend, onAnswerDropped });
      ref.current!.openCamera(ask);
      fireEvent.change(inputs(container).camera, {
        target: { files: [file('IMG_5.jpg', 'image/jpeg')] },
      });

      fireEvent.click(within(previewDialog()).getByRole('button', { name: 'Send' }));
      await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
      await act(async () => {});

      expect(onAnswerDropped).not.toHaveBeenCalled();
    });

    it('a send that fails brings the photo back as a chip, and taking that off still lets the request go', async () => {
      const onAnswerDropped = vi.fn();
      const onSend = vi.fn().mockRejectedValue(new Error('offline'));
      const { ref, container } = mountWithHandle({ onSend, onAnswerDropped });
      ref.current!.openCamera(ask);
      fireEvent.change(inputs(container).camera, {
        target: { files: [file('IMG_5.jpg', 'image/jpeg')] },
      });
      fireEvent.click(within(previewDialog()).getByRole('button', { name: 'Send' }));
      const chip = await screen.findByRole('button', { name: 'Remove attachment' });
      expect(onAnswerDropped).not.toHaveBeenCalled();

      fireEvent.click(chip);

      expect(onAnswerDropped).toHaveBeenCalledWith(ask);
    });

    it('an ordinary photo, with no request pressed, hands nothing up', () => {
      const onAnswerPicked = vi.fn();
      const onAnswerDropped = vi.fn();
      const { container } = mountWithHandle({ onAnswerPicked, onAnswerDropped });
      fireEvent.change(inputs(container).gallery, {
        target: { files: [file('a.jpg', 'image/jpeg')] },
      });
      fireEvent.click(within(previewDialog()).getByRole('button', { name: 'Close preview' }));
      expect(onAnswerPicked).not.toHaveBeenCalled();
      expect(onAnswerDropped).not.toHaveBeenCalled();
    });
  });

  describe('the reply strip for a request', () => {
    const strip = { senderLabel: 'MDG', text: 'MDG needs your Fire NOC', icon: null } as const;

    it('does not raise the keyboard when the photo is already in hand', () => {
      renderWithProviders(<Composer onSend={vi.fn()} replyingTo={{ ...strip, quiet: true }} />);
      expect(screen.getByText('MDG needs your Fire NOC')).toBeInTheDocument();
      expect(document.activeElement).not.toBe(screen.getByPlaceholderText('Message'));
    });

    it('still focuses the box for an ordinary reply', () => {
      renderWithProviders(<Composer onSend={vi.fn()} replyingTo={strip} />);
      expect(document.activeElement).toBe(screen.getByPlaceholderText('Message'));
    });
  });
});
