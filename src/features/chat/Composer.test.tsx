import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useLangStore } from '@/store/lang';
import { renderWithProviders } from '@/test/utils';

import { Composer } from './Composer';

const recorder = vi.hoisted(() => ({
  supported: true,
  status: 'idle' as 'idle' | 'recording' | 'error',
  elapsedMs: 0,
  start: vi.fn(),
  stop: vi.fn(),
  cancel: vi.fn(),
  getLevels: vi.fn(() => [] as number[]),
  /** The DOMException name from the last failed start(), e.g. 'NotReadableError'. */
  lastError: vi.fn((): string | null => null),
}));
vi.mock('@/lib/useVoiceRecorder', () => ({
  useVoiceRecorder: () => recorder,
}));

const bridge = vi.hoisted(() => ({
  isNativeShell: vi.fn(() => true),
  requestNativeMicPermission: vi.fn(),
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
    recorder.status = 'idle';
    bridge.isNativeShell.mockReturnValue(true);
    bridge.requestNativeMicPermission.mockReset();
  });

  function pressMic() {
    const mic = screen.getByRole('button', { name: 'Record voice message' });
    fireEvent.pointerDown(mic, { pointerId: 1, clientX: 0, clientY: 0 });
    return mic;
  }

  it('recovers the composer when getUserMedia never resolves', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // A promise that never settles — exactly what the hung permission flow does.
    recorder.start.mockReturnValue(new Promise<boolean>(() => {}));
    bridge.requestNativeMicPermission.mockResolvedValue(false);

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
    expect(bridge.requestNativeMicPermission).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('starts recording once the native shell grants the mic', async () => {
    recorder.start.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    bridge.requestNativeMicPermission.mockResolvedValue(true);

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
    recorder.lastError.mockReset();
    recorder.status = 'idle';
    bridge.isNativeShell.mockReturnValue(true);
    bridge.requestNativeMicPermission.mockReset();
  });

  /** Hold the mic, let start() fail, release. */
  async function failWith(name: string) {
    recorder.lastError.mockReturnValue(name);
    recorder.start.mockResolvedValue(false);
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
    recorder.lastError.mockReturnValue('NotAllowedError');
    recorder.start.mockResolvedValue(false);
    // The native re-prompt is offered, and refused again.
    bridge.requestNativeMicPermission.mockResolvedValue(false);

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

  const CHIPS = ["Today's report?", "Sent today's photo?", 'Talk to support'];

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
