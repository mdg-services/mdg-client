import { ChevronUp, Lock, MicOff, Pause, Play, SendHorizonal, Trash2, X } from 'lucide-react';
import * as React from 'react';

import { Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useT, type MessageKey } from '@/lib/i18n';
import { micAskYesWords } from '@/lib/micPolicy';
import { formatDuration } from '@/lib/uploadAttachment';
import { useBackToClose } from '@/lib/useBackToClose';
import type { VoiceRecording } from '@/lib/useVoiceRecorder';

/**
 * The pieces of the voice-note bar that are only pictures and words: the strip
 * that says why the mic did not start, the review step for a recording the phone
 * stopped, the one-time "we need the mic" sheet, the lock pill and the red dot.
 * The composer owns every decision; these only draw what it decided.
 */

/**
 * Why the mic did not start, as one of a few things the dealer can act on.
 *
 *  - `failed`         — it did not start, after the quiet retry. Try again.
 *  - `muted`          — the phone gave us a mic it was using (a call, Siri). We
 *                       know this one for certain, so we may say so.
 *  - `app-update`     — an Android phone app built without the mic fix.
 *  - `refused`        — permission is off and the phone will still ask: Allow.
 *  - `settings`       — permission is off and only Settings can turn it on.
 *  - `restart`        — the phone says the mic is allowed, yet it is refused
 *                       anyway. Only closing and reopening the app clears it.
 *  - `blocked-browser`— a plain browser refused; its own site settings fix it.
 *  - `missing`        — no microphone at all.
 *  - `unavailable`    — this phone cannot record voice notes.
 */
export type MicStripKind =
  | 'failed'
  | 'muted'
  | 'app-update'
  | 'refused'
  | 'settings'
  | 'restart'
  | 'blocked-browser'
  | 'missing'
  | 'unavailable';

export interface MicStripAction {
  label: string;
  onClick: () => void;
  primary?: boolean;
}

/**
 * The inline strip above the composer when the mic did not start.
 *
 * NOT A TOAST. A toast vanished after 8 seconds, often before a dealer on a
 * forecourt had read it, and offered no way forward. The strip stays until
 * recording starts, the dealer types, or the chat changes, and carries the one
 * button that helps. Polite live region: read out once, never interrupting.
 */
export function MicStatusStrip({
  title,
  hint,
  actions,
  tone = 'neutral',
  onDismiss,
}: {
  title: string;
  hint?: string;
  actions: MicStripAction[];
  tone?: 'neutral' | 'warning';
  onDismiss: () => void;
}) {
  const t = useT();
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'mx-2 mt-2 flex items-start gap-2 rounded-2xl px-3 py-2.5 shadow-sm',
        tone === 'warning' ? 'bg-warning-soft text-warning-strong' : 'bg-wa-chip text-wa-bubble-text',
      )}
    >
      <MicOff width={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-danger" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug">{title}</p>
        {hint ? <p className="mt-0.5 text-[13px] leading-snug text-wa-meta">{hint}</p> : null}
        {actions.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {actions.map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={a.onClick}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-sm font-medium active:opacity-70',
                  a.primary
                    ? 'bg-wa-accent text-white'
                    : 'border border-wa-divider bg-transparent text-wa-bubble-text',
                )}
              >
                {a.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        aria-label={t('common.dismiss')}
        onClick={onDismiss}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-wa-meta active:bg-wa-row-active"
      >
        <X width={14} strokeWidth={2} />
      </button>
    </div>
  );
}

/** Why a recording is waiting for the dealer to decide, instead of being sent. */
export type ReviewReason = 'background' | 'interrupted' | 'muted' | 'silent';

const REVIEW_LINE: Record<ReviewReason, MessageKey> = {
  background: 'chat.voiceReviewStopped',
  interrupted: 'chat.voiceReviewStopped',
  muted: 'chat.micMutedMid',
  silent: 'chat.voiceSilent',
};

/**
 * A recording the dealer has to look at before it goes: the phone stopped it
 * (the app went to the background, a call came in, the recorder failed), or it
 * came out silent. NEVER sent by itself — what the dealer did not choose to
 * send stays on the phone until they say so.
 */
export function VoiceReviewBar({
  clip,
  url,
  reason,
  sending,
  onDelete,
  onSend,
  onRecordAgain,
}: {
  clip: VoiceRecording;
  url: string;
  reason: ReviewReason;
  sending?: boolean;
  onDelete: () => void;
  onSend: () => void;
  onRecordAgain: () => void;
}) {
  const t = useT();
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = React.useState(false);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void el.play?.()?.catch?.(() => setPlaying(false));
    else el.pause();
  };

  const warn = reason === 'muted' || reason === 'silent';
  return (
    <div className="px-2 pt-1.5">
      <p
        role="status"
        aria-live="polite"
        className={cn(
          'mb-1.5 rounded-xl px-3 py-1.5 text-[13px] leading-snug',
          warn ? 'bg-warning-soft text-warning-strong' : 'bg-wa-chip text-wa-meta',
        )}
      >
        {t(REVIEW_LINE[reason])}
      </p>
      <div className="flex items-end gap-1.5">
        <div className="flex min-h-[48px] min-w-0 flex-1 items-center gap-2 rounded-3xl bg-wa-chip pl-1 pr-4 shadow-sm">
          <button
            type="button"
            aria-label={t('chat.cancelRecording')}
            onClick={onDelete}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-wa-bar-icon active:bg-wa-row-active"
          >
            <Trash2 width={22} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            aria-label={t(playing ? 'chat.pauseVoice' : 'chat.playVoice')}
            onClick={toggle}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-wa-bubble-text active:bg-wa-row-active"
          >
            {playing ? <Pause width={20} strokeWidth={1.75} /> : <Play width={20} strokeWidth={1.75} />}
          </button>
          <span className="shrink-0 text-sm font-medium tabular-nums text-wa-bubble-text">
            {formatDuration(clip.durationMs)}
          </span>
          <audio
            ref={audioRef}
            src={url}
            preload="metadata"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            className="hidden"
          />
        </div>
        {reason === 'silent' ? null : (
          <button
            type="button"
            aria-label={t('chat.sendVoice')}
            onClick={onSend}
            disabled={sending}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-wa-accent text-white disabled:cursor-not-allowed"
          >
            {sending ? <Spinner size={18} /> : <SendHorizonal width={22} strokeWidth={1.75} />}
          </button>
        )}
      </div>
      {reason === 'silent' ? (
        <div className="mt-2 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onRecordAgain}
            className="rounded-full bg-wa-accent px-3.5 py-1.5 text-sm font-medium text-white active:opacity-70"
          >
            {t('chat.voiceRecordAgain')}
          </button>
          <button
            type="button"
            onClick={onSend}
            disabled={sending}
            className="rounded-full border border-wa-divider px-3.5 py-1.5 text-sm font-medium text-wa-bubble-text active:opacity-70"
          >
            {t('chat.voiceSendAnyway')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The one-time sheet before the phone's own microphone dialog.
 *
 * A dialog that appears cold, with no reason given, is the one a dealer refuses
 * — and on Android two refusals end the asking for good. One sentence first,
 * saying why and what to tap, costs a tap once and saves the mic for good.
 */
export function MicExplainerSheet({ onOk, onClose }: { onOk: () => void; onClose: () => void }) {
  const t = useT();
  useBackToClose(onClose);
  // Android 11 and later names its "yes" "While using the app", not "Allow".
  const line: MessageKey =
    micAskYesWords() === 'while-using' ? 'chat.micExplainerAndroid' : 'chat.micExplainer';
  return (
    <div
      role="dialog"
      aria-label={t('chat.recordVoice')}
      data-no-swipe
      className="fixed inset-0 z-50 flex flex-col justify-end"
    >
      <button
        type="button"
        aria-label={t('common.dismiss')}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-wa-viewer opacity-25"
      />
      <div className="safe-bottom relative mx-auto w-full max-w-md px-3">
        <div className="rounded-2xl bg-wa-chip px-5 py-5 shadow-lg animate-in">
          <p className="text-base leading-snug text-wa-bubble-text">{t(line)}</p>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={onOk}
              className="rounded-full bg-wa-accent px-5 py-2 text-sm font-medium text-white active:opacity-70"
            >
              {t('chat.micExplainerOk')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * "Slide up to lock", floating above the mic while a finger holds it. WhatsApp
 * shows the same pill; without it, nobody finds hands-free recording by sliding.
 */
export function LockPill() {
  const t = useT();
  return (
    <div className="pointer-events-none absolute -top-[6.5rem] right-1 z-10 flex w-[4.5rem] flex-col items-center gap-0.5 rounded-3xl bg-wa-chip px-1 py-2 text-wa-meta shadow-md">
      <Lock width={16} strokeWidth={2} aria-hidden />
      <ChevronUp width={16} strokeWidth={2} className="animate-bounce" aria-hidden />
      <span className="text-center text-[11px] leading-tight">{t('chat.slideToLock')}</span>
    </div>
  );
}

/** The red "recording" dot. A plain tap now records too, so it has to be unmistakable. */
export function RecordingDot() {
  return <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-danger" />;
}
