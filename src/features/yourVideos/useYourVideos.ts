import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { api } from '@/lib/api';
import { detectPlatform } from '@/lib/nativeBridge';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/store/auth';
import { watchedNeededSec, type WatchReportResult, type YourVideosView } from '@dk/shared/types';

import { createWatchTracker } from './watchTracker';

/**
 * The "your videos" list as THIS person sees it NOW (`GET /v1/me/your-videos`).
 *
 * The message that carries the list is posted once and never edited, so it keeps nothing
 * of its own: every list in the thread draws this one view, and a tick that lands after
 * the message was sent shows on it at once. The tick arrives three ways: this phone's own
 * player reports it (and patches the cache the moment the server says yes), another phone
 * of the same person is told over the socket, and the window coming back to the front asks
 * again.
 */
export const yourVideosKey = ['your-videos'] as const;

export function useYourVideos() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();

  // A tick earned on another phone of this person.
  React.useEffect(() => {
    if (!token) return undefined;
    const socket = getSocket();
    if (!socket) return undefined;
    const onWatched = (p: { videoId: string; watchedAt: string }) => markWatched(qc, p.videoId, p.watchedAt);
    socket.on('videos:watched', onWatched);
    return () => {
      socket.off('videos:watched', onWatched);
    };
  }, [token, qc]);

  return useQuery({
    queryKey: yourVideosKey,
    enabled: !!token,
    staleTime: 60_000,
    queryFn: () => api.get<YourVideosView>('/v1/me/your-videos', { platform: detectPlatform() }),
  });
}

/** Tick one video in the cached list, in both groups, without asking the server again. */
export function markWatched(qc: QueryClient, videoId: string, watchedAt: string): void {
  qc.setQueryData<YourVideosView>(yourVideosKey, (old) => {
    if (!old) return old;
    const tick = <T extends { id: string }>(rows: T[]): T[] =>
      rows.map((r) => (r.id === videoId ? { ...r, watched: true, watchedAt } : r));
    return { mine: tick(old.mine), more: tick(old.more) };
  });
}

/** A video the player can name: by its library id (opened from a list), or by the file (a chat message). */
export type WatchedVideo = { videoId: string } | { storageKey: string };

/** How long to wait before asking the server again after a report that did not get through. */
const RETRY_AFTER_MS = 5_000;

/**
 * Report a video as played, once it has been played far enough.
 *
 * Give it the video and its length (the server's: the same length the server weighs the
 * report against) and spread the returned handlers on the `<video>`. It counts the seconds
 * genuinely played, skips excluded (`watchTracker`), and when they reach the bar it tells
 * the server once. The answer ticks the list at once.
 *
 * A report that fails (no signal) is tried again a few seconds later, and again when the
 * video is paused, ends, or the player closes. A video of no known length is never reported:
 * the server could not weigh it. Nothing here is ever shown to the person: it is bookkeeping.
 */
export function useWatchReport(video: WatchedVideo, durationMs: number | undefined) {
  const qc = useQueryClient();
  const trackerRef = React.useRef(createWatchTracker());
  const doneRef = React.useRef(false);
  const busyRef = React.useRef(false);
  const lastTryRef = React.useRef(0);
  /** What the server last said counts; starts at the library's figure and follows the server. */
  const neededRef = React.useRef(watchedNeededSec(durationMs ?? 0));
  const videoKey = 'videoId' in video ? `id:${video.videoId}` : `file:${video.storageKey}`;

  // A different video (or a new length) is a new count.
  React.useEffect(() => {
    trackerRef.current = createWatchTracker();
    doneRef.current = false;
    busyRef.current = false;
    lastTryRef.current = 0;
    neededRef.current = watchedNeededSec(durationMs ?? 0);
  }, [videoKey, durationMs]);

  const report = React.useCallback(
    async (force: boolean): Promise<void> => {
      if (doneRef.current || busyRef.current) return;
      const needed = neededRef.current;
      const played = trackerRef.current.playedSec();
      if (needed <= 0 || played < needed) return;
      const now = Date.now();
      if (!force && now - lastTryRef.current < RETRY_AFTER_MS) return;
      lastTryRef.current = now;
      busyRef.current = true;
      try {
        const res = await api.post<WatchReportResult>('/v1/me/your-videos/watch', {
          ...video,
          playedSec: Math.round(played * 10) / 10,
        });
        if (res.watched) {
          doneRef.current = true;
          markWatched(qc, res.id, res.watchedAt ?? new Date().toISOString());
        } else if (res.neededSec > neededRef.current) {
          // The server weighs it against a longer length than this player was told: keep playing.
          neededRef.current = res.neededSec;
        }
      } catch {
        // Not through (no signal, a video that is not on the list): bookkeeping, tried again later.
      } finally {
        busyRef.current = false;
      }
    },
    // `video` is a fresh object each render; its content is `videoKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, videoKey],
  );

  return React.useMemo(
    () => ({
      onTimeUpdate: (e: React.SyntheticEvent<HTMLVideoElement>) => {
        trackerRef.current.step(e.currentTarget.currentTime);
        void report(false);
      },
      onSeeking: () => trackerRef.current.skip(),
      onPause: () => void report(true),
      onEnded: () => void report(true),
      /** Call when the player closes or goes away. */
      flush: () => void report(true),
    }),
    [report],
  );
}
