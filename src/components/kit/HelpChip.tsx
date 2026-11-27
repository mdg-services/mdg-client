import { PlayCircle } from 'lucide-react';
import * as React from 'react';
import { createPortal } from 'react-dom';

import { GuideVideoSheet } from '@/features/help/GuideVideoSheet';
import { playableVideos, videoTitle } from '@/features/help/helpView';
import { useGuideVideos } from '@/features/help/useGuideVideos';
import { cn } from '@/lib/cn';
import { useLang, useT } from '@/lib/i18n';

export interface HelpChipProps {
  /** The guide video this screen is about. No id, no chip. */
  videoId?: string;
  className?: string;
}

/**
 * "Watch a short video": a 44px chip that opens the guide video in its player. It is hidden when
 * the screen has no video, when the list has not arrived, and when the video is not in the list
 * the server gave THIS person: the server leaves out outside-the-app videos (payment, WhatsApp
 * only), so none of those can appear here by a wrong id.
 */
export function HelpChip({ videoId, className }: HelpChipProps) {
  // The list is asked for only by a screen that has a video: a split component, since a hook
  // cannot sit behind an `if`.
  if (!videoId) return null;
  return <HelpChipFor videoId={videoId} {...(className ? { className } : {})} />;
}

function HelpChipFor({ videoId, className }: { videoId: string; className?: string }) {
  const t = useT();
  const lang = useLang();
  const q = useGuideVideos();
  const [open, setOpen] = React.useState(false);
  const video = playableVideos(q.data).find((v) => v.id === videoId);
  if (!video) return null;
  const title = videoTitle(video, lang);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-surface px-3 py-1 text-left text-cta text-text shadow-sm active:bg-surface-2',
          className,
        )}
      >
        <PlayCircle aria-hidden className="h-5 w-5 shrink-0" strokeWidth={1.75} />
        <span className="min-w-0 break-words">{t('kit.help.watch')}</span>
      </button>
      {open
        ? createPortal(<GuideVideoSheet id={video.id} title={title} onClose={() => setOpen(false)} />, document.body)
        : null}
    </>
  );
}
