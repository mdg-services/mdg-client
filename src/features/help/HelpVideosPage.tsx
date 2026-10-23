import { MessageCircle, PlayCircle, VideoOff } from 'lucide-react';
import * as React from 'react';

import { SubPageBar } from '@/components/SubPage';
import { Button, Spinner } from '@/components/ui';
import { useOpenMyChat } from '@/features/chat/useOpenMyChat';
import { useLang, useT } from '@/lib/i18n';
import type { GuideVideoListItem } from '@dk/shared/types';

import { GuideVideoSheet } from './GuideVideoSheet';
import { durationLabel, playableVideos, videoSummary, videoTitle } from './helpView';
import { useGuideVideos } from './useGuideVideos';

/**
 * Settings → Help videos: MDG's short videos, played right here.
 *
 * This replaced a link that left the app for a separate video website. The list
 * comes from the server (`GET /v1/me/guide-videos`), so a video MDG adds shows up
 * here with no new version of the app; tapping one opens the in-app player.
 *
 * Nothing here points at a way to pay: the server never sends the "paying your
 * bill" video to the app, and this screen adds no link of its own. Under the list
 * is the other way to get help: ask in the chat.
 *
 * The bar is on every state, including a failed load, so there is always a way out.
 */
export function HelpVideosPage() {
  const t = useT();
  const lang = useLang();
  const q = useGuideVideos();
  const openChat = useOpenMyChat();
  const [playing, setPlaying] = React.useState<GuideVideoListItem | null>(null);
  const closePlayer = React.useCallback(() => setPlaying(null), []);

  const videos = playableVideos(q.data);
  // An error, OR a request paused because the phone is offline: `isLoading` alone is
  // false for both, and a spinner waiting on a network that is not there never ends.
  const failed = !q.data && (q.isError || (q.status === 'pending' && q.fetchStatus === 'paused'));

  return (
    <>
      <SubPageBar title={t('help.title')} />
      <div className="flex flex-1 flex-col bg-wa-bar pb-6">
        {q.data ? (
          videos.length > 0 ? (
            <>
              <p className="px-5 pb-1 pt-4 text-[14px] text-wa-meta">{t('help.intro')}</p>
              <ul data-testid="help-videos">
                {videos.map((v) => (
                  <li key={v.id}>
                    <VideoRow video={v} lang={lang} onPlay={() => setPlaying(v)} />
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <Notice title={t('help.emptyTitle')} description={t('help.emptyDesc')} />
          )
        ) : failed ? (
          <Notice
            title={t('help.loadFailed')}
            description={t('help.loadFailedDesc')}
            action={
              <Button variant="secondary" onClick={() => void q.refetch()}>
                {t('common.retry')}
              </Button>
            }
          />
        ) : (
          <div className="flex flex-1 items-center justify-center py-20">
            <Spinner size={22} />
          </div>
        )}

        <ul className="mt-2 border-t border-wa-divider">
          <li>
            <button
              type="button"
              onClick={openChat}
              className="flex min-h-[64px] w-full items-center gap-5 px-5 py-2.5 text-left active:bg-wa-row-active"
            >
              <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center text-wa-bar-icon">
                <MessageCircle width={24} height={24} strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] text-wa-bar-text">
                  {t('help.askInChat')}
                </span>
                <span className="block truncate text-[14px] text-wa-meta">
                  {t('help.askInChatDesc')}
                </span>
              </span>
            </button>
          </li>
        </ul>
      </div>

      {playing ? (
        <GuideVideoSheet
          id={playing.id}
          title={videoTitle(playing, lang)}
          onClose={closePlayer}
        />
      ) : null}
    </>
  );
}

/** One video: a play mark, its title, one line on what it shows, and how long it is. */
function VideoRow({
  video,
  lang,
  onPlay,
}: {
  video: GuideVideoListItem;
  lang: 'en' | 'hi';
  onPlay: () => void;
}) {
  const t = useT();
  const title = videoTitle(video, lang);
  const summary = videoSummary(video, lang);
  const length = durationLabel(video.durationMs);
  return (
    <button
      type="button"
      onClick={onPlay}
      aria-label={t('help.play', { title })}
      className="flex min-h-[72px] w-full items-center gap-4 border-b border-wa-divider px-5 py-3 text-left active:bg-wa-row-active"
    >
      <span
        aria-hidden
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-wa-accent/10 text-wa-accent"
      >
        <PlayCircle width={28} height={28} strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] leading-snug text-wa-bar-text">{title}</span>
        {summary ? (
          <span className="line-clamp-2 text-[14px] leading-snug text-wa-meta">{summary}</span>
        ) : null}
      </span>
      {length ? (
        <span className="shrink-0 text-[13px] tabular-nums text-wa-meta">{length}</span>
      ) : null}
    </button>
  );
}

/** An empty or failed list, with room for one button. The "ask in chat" row below is always there. */
function Notice({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-8 py-12 text-center">
      <span
        aria-hidden
        className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-2 text-text-muted"
      >
        <VideoOff width={28} strokeWidth={1.5} />
      </span>
      <p className="text-[18px] font-medium text-wa-bar-text">{title}</p>
      <p className="max-w-xs text-[15px] text-wa-meta">{description}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
