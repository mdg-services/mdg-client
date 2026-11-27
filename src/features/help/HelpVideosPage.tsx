import { MessageCircle, PlayCircle, Sparkles, VideoOff } from 'lucide-react';
import * as React from 'react';

import { ListRow } from '@/components/kit/ListRow';
import { ProgressBar } from '@/components/kit/ProgressBar';
import { SectionCard } from '@/components/kit/SectionCard';
import { SkeletonBlock } from '@/components/kit/SkeletonBlock';
import { StatusPill } from '@/components/kit/StatusPill';
import { SubPageBar } from '@/components/SubPage';
import { Button, Card } from '@/components/ui';
import { useOpenMyChat } from '@/features/chat/useOpenMyChat';
import {
  helpGroups,
  helpProgress,
  type HelpGroupId,
  type HelpKnown,
  type HelpRow,
} from '@/features/pump/pumpModel';
import { useYourVideos } from '@/features/yourVideos/useYourVideos';
import { useLang, useT } from '@/lib/i18n';
import type { Lang } from '@/store/lang';
import { WHATS_NEW_VIDEO } from '@dk/shared';
import type { GuideVideoListItem } from '@dk/shared/types';

import { GuideVideoSheet } from './GuideVideoSheet';
import { durationLabel, playableVideos, videoSummary, videoTitle } from './helpView';
import { useGuideVideos } from './useGuideVideos';

/**
 * Help videos (`/settings/help`, spec 4.5): MDG's short videos, played right here, with the ones for
 * the services this pump has first, a tick on each one already watched, and "6 of 13 watched, next:
 * ..." on top. A row "Replay what is new" brings back the one-time video the app plays by itself.
 *
 * The list comes from the server (`GET /v1/me/guide-videos`), so a video MDG adds shows up here with
 * no new version of the app. Which of them are for this pump's services, and which this person has
 * watched, comes from `GET /v1/me/your-videos`: the same videos, the same person's ticks. Where that
 * answer is not there (an older server, a failed call) the page draws every video in one plain list
 * without ticks, and never says anything it could not know.
 *
 * Nothing here points at a way to pay: the server never sends the "paying your bill" video to the
 * app, and this screen adds no link of its own. Autopay is not here any more: it lives on Bill and
 * plan. Under the list is the other way to get help: ask in the chat.
 *
 * The bar is on every state, including a failed load, so there is always a way out.
 */
export function HelpVideosPage() {
  const t = useT();
  const lang = useLang();
  const q = useGuideVideos();
  const mine = useYourVideos();
  const openChat = useOpenMyChat();
  const [playing, setPlaying] = React.useState<GuideVideoListItem | null>(null);
  const closePlayer = React.useCallback(() => setPlaying(null), []);

  const videos = playableVideos(q.data);
  // An error, OR a request paused because the phone is offline: `isLoading` alone is
  // false for both, and a spinner waiting on a network that is not there never ends.
  const failed = !q.data && (q.isError || (q.status === 'pending' && q.fetchStatus === 'paused'));

  const view = mine.data;
  const known = React.useMemo<HelpKnown | null>(() => {
    // Anything but the two lists is "no answer": the page then draws without groups or ticks.
    if (!view || !Array.isArray(view.mine) || !Array.isArray(view.more)) return null;
    const all = [...view.mine, ...view.more];
    return {
      mine: new Set(view.mine.map((r) => r.id)),
      more: new Set(view.more.map((r) => r.id)),
      watched: new Set(all.filter((r) => r.watched).map((r) => r.id)),
    };
  }, [view]);

  const whatsNew = videos.find((v) => v.id === WHATS_NEW_VIDEO.id) ?? null;
  const groups = helpGroups(videos, known, whatsNew ? [whatsNew.id] : []);
  const progress = helpProgress(groups);

  return (
    <>
      <SubPageBar title={t('help.title')} />
      <div className="flex flex-1 flex-col gap-3 bg-bg p-4 pb-6">
        {q.data ? (
          videos.length > 0 ? (
            <>
              {progress.total > 0 ? (
                <Card className="flex flex-col gap-3 p-4">
                  <ProgressBar
                    value={progress.done}
                    max={progress.total}
                    text={t('yourVideos.progress', { done: progress.done, total: progress.total })}
                  />
                  {progress.next ? (
                    <Button variant="secondary" onClick={() => setPlaying(progress.next)} className="self-start text-left">
                      {t('pump.help.next', { title: videoTitle(progress.next, lang) })}
                    </Button>
                  ) : (
                    <p className="break-words text-body text-text-muted">{t('pump.help.allWatched')}</p>
                  )}
                </Card>
              ) : null}

              {whatsNew ? (
                <Card className="px-4">
                  <ListRow
                    leading={<Sparkles aria-hidden className="h-5 w-5 text-text-muted" strokeWidth={1.75} />}
                    title={t('pump.help.replayRow')}
                    subtitle={t('pump.help.replayDesc')}
                    onPress={() => setPlaying(whatsNew)}
                  />
                </Card>
              ) : null}

              <p className="break-words text-body text-text-muted">{t('help.intro')}</p>
              <div data-testid="help-videos" className="flex flex-col gap-3">
                {groups.map((g) => (
                  <SectionCard key={g.id} title={t(GROUP_TITLE[g.id])} variant="list">
                    <ul>
                      {g.rows.map((row) => (
                        <li key={row.video.id}>
                          <VideoRow row={row} lang={lang} onPlay={() => setPlaying(row.video)} />
                        </li>
                      ))}
                    </ul>
                  </SectionCard>
                ))}
              </div>
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
          <SkeletonBlock lines={4} />
        )}

        <Card className="px-4">
          <ListRow
            leading={<MessageCircle aria-hidden className="h-5 w-5 text-text-muted" strokeWidth={1.75} />}
            title={t('help.askInChat')}
            subtitle={t('help.askInChatDesc')}
            onPress={openChat}
          />
        </Card>
      </div>

      {playing ? (
        <GuideVideoSheet id={playing.id} title={videoTitle(playing, lang)} onClose={closePlayer} />
      ) : null}
    </>
  );
}

const GROUP_TITLE = {
  mine: 'pump.help.group.mine',
  general: 'pump.help.group.general',
  more: 'pump.help.group.more',
  all: 'pump.help.group.all',
} as const satisfies Record<HelpGroupId, string>;

/**
 * One video: a play mark, its title, what it shows, how long it is, and, for a video the server keeps
 * a tick for, the word "Watched" with a tick shape once it has been. Names and summaries wrap.
 */
function VideoRow({
  row,
  lang,
  onPlay,
}: {
  row: HelpRow<GuideVideoListItem>;
  lang: Lang;
  onPlay: () => void;
}) {
  const t = useT();
  const { video, watched } = row;
  const title = videoTitle(video, lang);
  const summary = videoSummary(video, lang);
  const length = durationLabel(video.durationMs);
  return (
    <button
      type="button"
      onClick={onPlay}
      aria-label={t(watched ? 'yourVideos.playWatched' : 'help.play', { title })}
      className="flex min-h-14 w-full items-center gap-3 py-3 text-left active:bg-surface-2"
    >
      <span aria-hidden className="flex shrink-0 items-center justify-center rounded-lg bg-surface-2 p-2 text-text">
        <PlayCircle className="h-6 w-6" strokeWidth={1.75} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="break-words text-body font-medium leading-snug text-text">{title}</span>
        {summary ? <span className="break-words text-meta leading-snug text-text-muted">{summary}</span> : null}
        {watched ? <StatusPill status="ok" word={t('yourVideos.watched')} className="mt-1 self-start" /> : null}
      </span>
      {length ? <span className="shrink-0 self-start pt-0.5 text-meta tabular-nums text-text-muted">{length}</span> : null}
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
    <Card className="flex flex-col items-center gap-3 px-6 py-8 text-center">
      <span aria-hidden className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-text-muted">
        <VideoOff width={28} strokeWidth={1.5} />
      </span>
      <p className="break-words text-heading text-text">{title}</p>
      <p className="max-w-xs break-words text-body text-text-muted">{description}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </Card>
  );
}
