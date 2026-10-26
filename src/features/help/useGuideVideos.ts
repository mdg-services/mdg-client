import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { detectPlatform } from '@/lib/nativeBridge';
import { useAuthStore } from '@/store/auth';
import type { GuideVideoListItem, GuideVideoPlay } from '@dk/shared/types';

/**
 * The short videos MDG has made for this member (`GET /v1/me/guide-videos`).
 *
 * The server filters by who is asking: an owner's list and a manager's differ,
 * the team's own videos are never in it, and neither is a video that goes out on
 * WhatsApp only. So this list is shown as it comes.
 *
 * The phone is named in the request: some videos walk through screens that exist
 * only on Android (its own back button, its permission pages), and the server
 * leaves those out of an iPhone's list rather than show a dealer steps they
 * cannot follow. A plain browser says `web` and gets what Android gets.
 */
export const guideVideosKey = ['guide-videos', 'me'] as const;

export function useGuideVideos() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: guideVideosKey,
    enabled: !!token,
    // A video is added now and then, not by the minute.
    staleTime: 5 * 60_000,
    queryFn: () =>
      api.get<GuideVideoListItem[]>('/v1/me/guide-videos', { platform: detectPlatform() }),
  });
}

/**
 * One video, with a fresh signed link (`GET /v1/me/guide-videos/:id`). Asked for
 * at the moment of play and never kept: the link lives a few minutes, and a video
 * opened an hour later must not play from a stale one.
 */
export function fetchGuideVideoPlay(id: string, startSec = 0): Promise<GuideVideoPlay> {
  return api.get<GuideVideoPlay>(`/v1/me/guide-videos/${encodeURIComponent(id)}`, {
    start: startSec > 0 ? startSec : undefined,
  });
}
