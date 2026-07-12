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
