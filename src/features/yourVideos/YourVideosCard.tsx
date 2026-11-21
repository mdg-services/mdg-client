import { Check, Play } from 'lucide-react';
import * as React from 'react';
import { createPortal } from 'react-dom';

import { GuideVideoSheet } from '@/features/help/GuideVideoSheet';
import { durationLabel } from '@/features/help/helpView';
import { Block, CardBox, CardPending, Note } from '@/features/setup/CardParts';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useLang, useT } from '@/lib/i18n';
import type { Lang } from '@/store/lang';
import { sayIn, type YourVideoRow } from '@dk/shared/types';

import { useYourVideos } from './useYourVideos';

/**
 * The "your videos" list inside an MDG message (`message.videoList`): a short video for
 * each service, the sentences the dealer can type or say to that service, and a tick on
 * every video THIS person has watched.
 *
 * THE LIST IS DRAWN FROM THE SERVER'S VIEW NOW, never from the message: the message is
 * posted once and cannot be edited, so an old one shows the services the pump has today and
 * the ticks earned since. Two groups — the services this pump has, then the ones it can
 * still start — and the sentences are in the reader's own language.
 *
 * A tap plays the video in the app's own full-screen player. It is portalled to the page,
 * not drawn inside the bubble: the bubble moves with a swipe, and a full-screen layer inside
 * something that moves is no longer full-screen. Nothing here leaves the app.
 *
 * An older server with no such list (404) leaves nothing drawn at all.
 */
export function YourVideosCard() {
  const t = useT();
  const lang = useLang();
  const q = useYourVideos();
  const { refetch } = q;
  const retry = React.useCallback(() => void refetch(), [refetch]);
  const [playing, setPlaying] = React.useState<YourVideoRow | null>(null);

  const view = q.data;
  if (!view) {
    if (q.error instanceof ApiError && q.error.status === 404) return null;
    return <CardPending failed={q.isError} onRetry={retry} />;
  }

  const all = [...view.mine, ...view.more];
  if (all.length === 0) {
    return (
      <CardBox kind="your-videos">
        <Note>{t('yourVideos.empty')}</Note>
      </CardBox>
    );
  }
  const done = all.filter((r) => r.watched).length;

  return (
    <CardBox kind="your-videos">
      <Note>
        <span data-testid="your-videos-progress">
          {t('yourVideos.progress', { done, total: all.length })}
        </span>
      </Note>
      <Group title={t('yourVideos.mine')} rows={view.mine} lang={lang} onPlay={setPlaying} />
      <Group title={t('yourVideos.more')} rows={view.more} lang={lang} onPlay={setPlaying} />
      {playing
        ? createPortal(
            <GuideVideoSheet
              id={playing.id}
              title={sayIn(playing.title, lang)}
              onClose={() => setPlaying(null)}
            />,
            document.body,
          )
        : null}
    </CardBox>
  );
}

function Group({
  title,
  rows,
  lang,
  onPlay,
}: {
  title: string;
  rows: YourVideoRow[];
  lang: Lang;
  onPlay: (row: YourVideoRow) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="flex flex-col gap-1.5" aria-label={title}>
      <h4 className="px-0.5 pt-1 text-[13px] font-medium text-wa-meta">{title}</h4>
      {rows.map((row) => (
        <VideoRowButton key={row.id} row={row} lang={lang} onPlay={() => onPlay(row)} />
      ))}
    </section>
  );
}

/** One video: the tick (or a play mark), its title, how long it is, and the sentences to try. */
function VideoRowButton({
  row,
  lang,
  onPlay,
}: {
  row: YourVideoRow;
  lang: Lang;
  onPlay: () => void;
}) {
  const t = useT();
  const title = sayIn(row.title, lang);
  const length = durationLabel(row.durationMs);
  return (
    <Block className="p-0">
      <button
        type="button"
        onClick={onPlay}
        data-testid={`your-video-${row.id}`}
        data-watched={row.watched ? 'true' : 'false'}
        aria-label={t(row.watched ? 'yourVideos.playWatched' : 'yourVideos.play', { title })}
        className="flex min-h-[44px] w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left active:opacity-80"
      >
        <span
          aria-hidden
          data-testid={row.watched ? 'your-video-tick' : undefined}
          className={cn(
            'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
            row.watched ? 'bg-wa-accent text-white' : 'bg-wa-accent/10 text-wa-accent',
          )}
        >
          {row.watched ? (
            <Check width={16} height={16} strokeWidth={3} />
          ) : (
            <Play width={14} height={14} strokeWidth={2.25} />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="text-[15px] font-medium leading-snug text-wa-bubble-text">{title}</span>
            {length ? (
              <span className="ml-auto shrink-0 text-[12px] tabular-nums text-wa-meta">{length}</span>
            ) : null}
          </span>
          {row.watched ? (
            <span className="block text-[12px] font-medium text-wa-accent">{t('yourVideos.watched')}</span>
          ) : null}
          <span className="mt-1 block text-[12px] text-wa-meta">{t('yourVideos.tryThis')}</span>
          {row.examples.map((example, i) => (
            <span key={i} className="mt-0.5 block text-[14px] leading-snug text-wa-bubble-text">
              “{sayIn(example, lang)}”
            </span>
          ))}
        </span>
      </button>
    </Block>
  );
}
