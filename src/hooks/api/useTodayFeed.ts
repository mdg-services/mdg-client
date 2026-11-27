import { useQuery, type QueryClient } from '@tanstack/react-query';

import { isPlannerUser } from '@/features/planner/isPlanner';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type { TodayFeed } from '@dk/shared/types';

/** Cache key for the Today page's feed (ADR 0055). */
export const todayFeedKey = ['today-feed'] as const;

/**
 * What the Today page draws: the open tasks, the newest report of each kind and
 * what MDG finished today, all in the reader's language, built by the server from
 * the chats this member belongs to (`GET /v1/me/today-feed`).
 *
 * It is one call on purpose. Each box in the chat reads its own live view, and
 * asking for eight of them at app start on a 2G link would be eight round trips
 * for a page that mostly shows nothing new.
 *
 * `staleTime` is short because the page is the first screen: a dealer who flips
 * between the two tabs should see a fresh answer, and the sockets (the chat list's
 * and each box's) mark it out of date the moment something changes, so a feed with
 * nobody looking at it costs no request.
 */
/** The one call behind the page; also what a chat button asks for when it has no copy yet. */
export const fetchTodayFeed = () => api.get<TodayFeed>('/v1/me/today-feed');

/** How long a burst of chat events is held to one request. */
const REFRESH_WINDOW_MS = 1500;

export function useTodayFeed() {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.user?.role);
  const planner = useAuthStore((s) => isPlannerUser(s.user));
  return useQuery({
    queryKey: todayFeedKey,
    // The dealer app's own route: an admin who signs in here has no outlet.
    // A planner (ADR 0058) has no outlet: nothing to ask for.
    enabled: !!token && role !== 'admin' && !planner,
    staleTime: 20_000,
    queryFn: fetchTodayFeed,
  });
}

const refreshGate = new WeakMap<QueryClient, { timer: ReturnType<typeof setTimeout> | undefined; again: boolean }>();

/**
 * Ask for the feed again — a message arrived, a box changed. Cheap when the page is
 * not on screen: with nobody reading the feed the entry is only marked out of date.
 *
 * The first call goes through at once; the rest that come within the next second and
 * a half are folded into ONE more. The Chats tab keeps the feed mounted for its badge,
 * so without this ten messages in an afternoon were ten full reads (each one signs
 * every picture URL) over what may be a 2G link.
 */
export function invalidateTodayFeed(qc: QueryClient): void {
  let gate = refreshGate.get(qc);
  if (!gate) {
    gate = { timer: undefined, again: false };
    refreshGate.set(qc, gate);
  }
  if (gate.timer !== undefined) {
    gate.again = true;
    return;
  }
  void qc.invalidateQueries({ queryKey: todayFeedKey });
  const g = gate;
  g.timer = setTimeout(() => {
    g.timer = undefined;
    if (g.again) {
      g.again = false;
      invalidateTodayFeed(qc);
    }
  }, REFRESH_WINDOW_MS);
}
