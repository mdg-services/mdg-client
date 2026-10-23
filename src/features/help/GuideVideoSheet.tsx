import { VideoOff, X } from 'lucide-react';
import * as React from 'react';

import { Spinner } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { useDialog } from '@/lib/useDialog';

import { playableSrc } from './helpView';
import { fetchGuideVideoPlay } from './useGuideVideos';

type Phase =
  | { kind: 'loading' }
  | { kind: 'ready'; url: string; startSec: number }
  | { kind: 'failed' };

/**
 * The player for one guide video: full screen, black, the phone's own controls.
 *
 * It asks the server for the video at the moment it opens (a link signed a few
 * minutes ahead, from `GET /v1/me/guide-videos/:id`), so there is never a stale
 * link to play. If the phone cannot play the link — it expired, or the signal
 * dropped — it asks once more, and after that says so in words with a tap to try
 * again. A video is never fetched before it is asked for: the list shows titles
 * only.
 *
 * `startSec` opens it at a chapter (the chat will use that); the Help list
 * always starts at the beginning.
 */
export function GuideVideoSheet({
  id,
  title,
  startSec = 0,
  onClose,
}: {
  id: string;
  title: string;
  startSec?: number;
  onClose: () => void;
}) {
  const t = useT();
  // Back, Escape, focus in and out, and a locked page behind it.
  const panelRef = useDialog(onClose);
  const [phase, setPhase] = React.useState<Phase>({ kind: 'loading' });
  const [attempt, setAttempt] = React.useState(0);
  const refreshed = React.useRef(false);

  React.useEffect(() => {
    let cancelled = false;
    setPhase({ kind: 'loading' });
    fetchGuideVideoPlay(id, startSec).then(
      (play) => {
        if (!cancelled) setPhase({ kind: 'ready', url: play.url, startSec: play.startSec });
      },
      () => {
        if (!cancelled) setPhase({ kind: 'failed' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [id, startSec, attempt]);

  const onVideoError = () => {
    // One fresh link, then words.
    if (!refreshed.current) {
      refreshed.current = true;
      setAttempt((n) => n + 1);
    } else {
      setPhase({ kind: 'failed' });
    }
  };

  const tryAgain = () => {
    refreshed.current = false;
    setAttempt((n) => n + 1);
  };

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
      data-testid="guide-video-sheet"
      className="fixed inset-0 z-50 flex flex-col bg-black text-white outline-none safe-bottom animate-in"
    >
      <div className="flex shrink-0 items-center gap-1 px-1 py-1">
        <button
          type="button"
          aria-label={t('help.close')}
          onClick={onClose}
          className="flex h-12 w-12 items-center justify-center rounded-full active:bg-white/15"
        >
          <X width={24} height={24} strokeWidth={1.75} aria-hidden />
        </button>
        <p className="min-w-0 flex-1 truncate pr-4 text-[16px]">{title}</p>
      </div>

      <div className="relative min-h-0 flex-1">
        {phase.kind === 'ready' ? (
          <video
            // A new link is a new element, so the phone starts it cleanly.
            key={phase.url}
            data-testid="guide-video"
            src={playableSrc(phase.url, phase.startSec)}
            controls
            autoPlay
            playsInline
            preload="metadata"
            disablePictureInPicture
            controlsList="nodownload noremoteplayback"
            aria-label={title}
            onError={onVideoError}
            className="absolute inset-0 h-full w-full object-contain"
          />
        ) : null}
        {phase.kind === 'loading' ? (
          <span className="absolute inset-0 flex items-center justify-center text-white/80">
            <Spinner size={24} />
          </span>
        ) : null}
        {phase.kind === 'failed' ? (
          <button
            type="button"
            onClick={tryAgain}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 text-center text-white/85"
          >
            <VideoOff width={32} strokeWidth={1.5} aria-hidden />
            <span className="text-[16px] leading-snug">{t('help.playerFailed')}</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
