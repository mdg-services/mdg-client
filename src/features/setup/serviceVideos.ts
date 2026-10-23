import * as React from 'react';

import { useGuideVideos } from '@/features/help/useGuideVideos';
import { SETUP_SERVICE_IDS, type GuideVideoListItem, type SetupServiceId } from '@dk/shared/types';

/**
 * The short video that explains each service, played from the ▶ beside it on the
 * services card.
 *
 * It comes from the video library, not from a list in the app: each service video
 * names the service it explains (`service`), and the server's list
 * (`GET /v1/me/guide-videos`) says which are uploaded. A service with a video that
 * can play gets a ▶; a service without one shows no button at all — never a dead
 * one. Adding a video is the library's job (a folder and an upload), not a change
 * here.
 */
export type ServiceVideos = Readonly<Partial<Record<SetupServiceId, GuideVideoListItem>>>;

/**
 * The library's list, turned into "the video each service has". Only a video that
 * can play right now counts, and one service has one video: the first the server
 * listed wins. Anything the server sends that is not a list (or names a service the
 * card does not offer) is ignored rather than trusted.
 */
export function videosByService(list: unknown): ServiceVideos {
  const out: Partial<Record<SetupServiceId, GuideVideoListItem>> = {};
  if (!Array.isArray(list)) return out;
  for (const v of list as GuideVideoListItem[]) {
    if (!v || typeof v !== 'object' || !v.available || !v.service) continue;
    if (!(SETUP_SERVICE_IDS as readonly string[]).includes(v.service)) continue;
    const id = v.service as SetupServiceId;
    if (!out[id]) out[id] = v;
  }
  return out;
}

/** The ▶ videos for the services card, from the library. Empty until the list arrives. */
export function useServiceVideos(): ServiceVideos {
  const { data } = useGuideVideos();
  return React.useMemo(() => videosByService(data), [data]);
}
