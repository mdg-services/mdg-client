import { Volume2, X } from 'lucide-react';
import * as React from 'react';

import { Spinner } from '@/components/ui';
import { playableSrc } from '@/features/help/helpView';
import { fetchGuideVideoPlay } from '@/features/help/useGuideVideos';
import { useWatchReport } from '@/features/yourVideos/useYourVideos';
import { useT } from '@/lib/i18n';
import { useDialog } from '@/lib/useDialog';

type Phase =
  | { kind: 'loading' }
  | { kind: 'ready'; url: string; durationMs: number };

/**
 * The "what is new" video, full screen and black, played by itself (ADR 0056, "A one-time
 * video on the next phone open").
 *
 * It starts with sound. A browser that refuses sound without a tap is answered by playing it
 * muted and putting one large "Turn on sound" button over the picture; the phone app's own
 * shell allows it, so there the button never shows. The native controls stay.
 *
 * `onStarted` fires once, at the first real "playing": that is the moment the video counts as
 * shown. A video that cannot load closes the screen quietly (`onClose`) and never calls it, so
 * the dealer is not blocked and the video is offered again on the next open.
 *
 * At the end the picture gives way to two buttons: "Go to Today" (closes) and "Watch again".
 */
export function WhatsNewVideo({
  videoId,
  onStarted,
  onClose,
}: {
  videoId: string;
  onStarted: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const panelRef = useDialog(onClose);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = React.useState<Phase>({ kind: 'loading' });
  const [attempt, setAttempt] = React.useState(0);
  const [needsSound, setNeedsSound] = React.useState(false);
  const [ended, setEnded] = React.useState(false);
  const goTodayRef = React.useRef<HTMLButtonElement>(null);
  const refreshed = React.useRef(false);
  const started = React.useRef(false);
  const closeRef = React.useRef(onClose);
  closeRef.current = onClose;

  // The seconds really played count towards the team's "videos watched" tick.
  const watch = useWatchReport({ videoId }, phase.kind === 'ready' ? phase.durationMs : undefined);
  const { flush } = watch;
  React.useEffect(() => flush, [flush]);

  React.useEffect(() => {
    let cancelled = false;
    setPhase({ kind: 'loading' });
    fetchGuideVideoPlay(videoId).then(
      (play) => {
        if (!cancelled) setPhase({ kind: 'ready', url: play.url, durationMs: play.durationMs });
      },
      () => {
        // Not blocking the dealer: leave quietly, and the server offers it again next open.
        if (!cancelled) closeRef.current();
      },
    );
    return () => {
      cancelled = true;
    };
  }, [videoId, attempt]);

  // Ask the browser to play with sound; on a refusal, play muted and offer the sound button.
  const readyUrl = phase.kind === 'ready' ? phase.url : null;
  React.useEffect(() => {
    const el = videoRef.current;
    if (!readyUrl || !el || typeof el.play !== 'function') return;
    let result: Promise<void> | undefined;
    try {
      result = el.play() as Promise<void> | undefined;
    } catch {
      result = undefined;
    }
    result?.catch(() => {
      el.muted = true;
      setNeedsSound(true);
      try {
        const again = el.play() as Promise<void> | undefined;
        again?.catch(() => undefined);
      } catch {
        // Nothing more to try; the native controls start it.
      }
    });
  }, [readyUrl]);

  const onVideoError = () => {
    // One fresh link, then give up quietly.
    if (!refreshed.current) {
      refreshed.current = true;
      setAttempt((n) => n + 1);
    } else {
      closeRef.current();
    }
  };

  const turnSoundOn = () => {
    const el = videoRef.current;
    if (el) {
      el.muted = false;
      try {
        const p = el.play() as Promise<void> | undefined;
        p?.catch(() => undefined);
      } catch {
        // The phone keeps it playing; ignore.
      }
    }
    setNeedsSound(false);
  };

  // The end panel covers the picture: take focus to its main button so a keyboard or TalkBack
  // user lands on it, and hide the video from them while it shows.
  React.useEffect(() => {
    if (ended) goTodayRef.current?.focus();
  }, [ended]);

  const watchAgain = () => {
    const el = videoRef.current;
    setEnded(false);
    el?.focus();
    if (el) {
      el.currentTime = 0;
      try {
        const p = el.play() as Promise<void> | undefined;
        p?.catch(() => undefined);
      } catch {
        // The native controls start it.
      }
    }
  };

  const title = t('whatsNew.title');

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
      data-testid="whats-new-video"
      className="fixed inset-0 z-50 flex flex-col bg-black text-white outline-none motion-safe:animate-in"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex shrink-0 items-center gap-1 px-1 py-1">
        <button
          type="button"
          onClick={onClose}
          className="flex h-12 min-w-12 items-center justify-center gap-2 rounded-full pl-3 pr-4 text-cta active:bg-white/15"
        >
          <X width={24} height={24} strokeWidth={1.75} aria-hidden />
          <span>{t('whatsNew.close')}</span>
        </button>
        <h2 className="min-w-0 flex-1 px-3 text-subheading">{title}</h2>
      </div>

      <div className="relative min-h-0 flex-1">
        {phase.kind === 'ready' ? (
          <video
            ref={videoRef}
            // A new link is a new element, so the phone starts it cleanly.
            key={phase.url}
            data-testid="whats-new-player"
            src={playableSrc(phase.url, 0)}
            controls
            autoPlay
            playsInline
            preload="auto"
            disablePictureInPicture
            controlsList="nodownload noremoteplayback"
            aria-label={title}
            aria-hidden={ended || undefined}
            tabIndex={ended ? -1 : undefined}
            onError={onVideoError}
            onPlaying={() => {
              if (started.current) return;
              started.current = true;
              onStarted();
            }}
            onTimeUpdate={watch.onTimeUpdate}
            onSeeking={watch.onSeeking}
            onPause={watch.onPause}
            onVolumeChange={(e) => {
              // The native control's own speaker button counts too.
              if (!e.currentTarget.muted) setNeedsSound(false);
            }}
            onEnded={() => {
              watch.onEnded();
              setEnded(true);
            }}
            className="absolute inset-0 h-full w-full object-contain"
          />
        ) : null}
        {phase.kind === 'loading' ? (
          <span className="absolute inset-0 flex items-center justify-center text-white/80">
            <Spinner size={24} />
          </span>
        ) : null}

        {needsSound && !ended ? (
          <div className="absolute inset-x-0 top-6 flex justify-center px-4">
            <button
              type="button"
              onClick={turnSoundOn}
              className="flex min-h-12 items-center gap-2 rounded-xl bg-white px-6 text-cta text-black"
            >
              <Volume2 width={24} height={24} strokeWidth={1.75} aria-hidden />
              {t('whatsNew.soundOn')}
            </button>
          </div>
        ) : null}

        {ended ? (
          <div
            data-testid="whats-new-end"
            role="status"
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black px-6"
          >
            <button
              ref={goTodayRef}
              type="button"
              onClick={onClose}
              className="min-h-12 w-full max-w-xs rounded-xl bg-white px-6 text-cta text-black"
            >
              {t('whatsNew.goToday')}
            </button>
            <button
              type="button"
              onClick={watchAgain}
              className="min-h-12 w-full max-w-xs rounded-xl border border-white px-6 text-cta text-white"
            >
              {t('whatsNew.again')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
