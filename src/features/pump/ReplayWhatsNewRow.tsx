import { Sparkles } from 'lucide-react';
import * as React from 'react';
import { createPortal } from 'react-dom';

import { GuideVideoSheet } from '@/features/help/GuideVideoSheet';
import { playableVideos, videoTitle } from '@/features/help/helpView';
import { useGuideVideos } from '@/features/help/useGuideVideos';
import { useLang, useT } from '@/lib/i18n';
import { WHATS_NEW_VIDEO } from '@dk/shared';

import { NavRow } from './PumpRows';

/**
 * "Replay what is new": the one-time video the app plays by itself once, brought back as a row
 * (spec 4.5). It plays the same guide video in the same in-app player, which also ticks it as watched.
 * Hidden unless that video is in the list the server gave THIS person (it is the server that leaves
 * out a video the person may not have), so there is never a row that plays nothing.
 */
export function ReplayWhatsNewRow() {
  const t = useT();
  const lang = useLang();
  const q = useGuideVideos();
  const [open, setOpen] = React.useState(false);
  const video = playableVideos(q.data).find((v) => v.id === WHATS_NEW_VIDEO.id);
  if (!video) return null;
  return (
    <>
      <NavRow
        leading={<Sparkles aria-hidden className="h-5 w-5 text-text-muted" strokeWidth={1.75} />}
        title={t('pump.help.replayRow')}
        subtitle={t('pump.help.replayDesc')}
        onPress={() => setOpen(true)}
      />
      {open
        ? createPortal(
            <GuideVideoSheet id={video.id} title={videoTitle(video, lang)} onClose={() => setOpen(false)} />,
            document.body,
          )
        : null}
    </>
  );
}
