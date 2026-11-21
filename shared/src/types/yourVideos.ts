/**
 * "Your videos": the list message MDG puts in a dealer's chat — a video for each
 * service, with the sentences the dealer can type or say to that service — and the
 * tick on every video the dealer really watched.
 *
 * WHAT IS IN THE MESSAGE. Nothing but a marker (`message.videoList`). The app draws
 * the list from `GET /me/your-videos`, the state NOW, because a message cannot be
 * edited: a tick that appears after the dealer watches, and a service that starts
 * after the message was sent, must show in the old message too.
 *
 * WHOSE TICK. A tick belongs to the PERSON who watched, not to the outlet. Owners
 * share one chat and the manager has another, and "the manager watched the stock
 * video" does not mean the owner knows it. Each person sees their own ticks; the
 * admin sees, per outlet, who watched what.
 *
 * WHEN IT COUNTS. When about {@link GUIDE_VIDEO_WATCHED_FRACTION} of the video has
 * genuinely been played — seconds that were played through, never seconds jumped
 * over (the player counts them; the server checks the figure against the video's
 * real length).
 */
import type { SomeDealerWords } from './dealerLanguage';
import type { GuideVideoText } from './videoLibrary';

/**
 * How much of a video must have been played for it to count as watched. The owner
 * asked for "60-70%"; 65% is the middle. A guide's last seconds are its end card
 * ("any question: ask in the chat"), so 65% is everything it teaches and a little more.
 */
export const GUIDE_VIDEO_WATCHED_FRACTION = 0.65;

/**
 * The seconds of play that count a video as watched, for a video of this length. Rounded UP,
 * so a 47-second video needs 31 seconds, never 30. Both the player (when to report) and the
 * server (whether to believe it) use this one function.
 */
export function watchedNeededSec(durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 0;
  return Math.ceil((durationMs / 1000) * GUIDE_VIDEO_WATCHED_FRACTION);
}

/**
 * The marker on an MDG message that carries the "your videos" list. Empty on
 * purpose: the app draws the list from `GET /me/your-videos`.
 */
export type MessageVideoList = Record<string, never>;

/** One video in the list, as one reader sees it. */
export interface YourVideoRow {
  /** The video's id in the guide library. */
  id: string;
  title: GuideVideoText;
  summary: GuideVideoText;
  durationMs: number;
  /** The service the video is about (a `SERVICE_LABELS` id). */
  service: string;
  /** Sentences the dealer can type or say to this service, each in every language it is written in. */
  examples: SomeDealerWords[];
  /**
   * A picture of the video to show as its thumbnail: a signed, short-lived link to the poster in the
   * bucket, or null when it is not there (the app then draws a plain play mark). Absent from an older server.
   */
  posterUrl?: string | null;
  /** This reader has played enough of it. */
  watched: boolean;
  watchedAt: string | null;
}

/** What the list shows: the services this outlet has, then the ones it can still start. */
export interface YourVideosView {
  /** "Your services": videos of services attached to this outlet. */
  mine: YourVideoRow[];
  /** "Also available": videos of services this outlet does not have yet. */
  more: YourVideoRow[];
}

/** The answer to "I played this video": whether it now counts, and the figure it was weighed against. */
export interface WatchReportResult {
  id: string;
  watched: boolean;
  watchedAt: string | null;
  /** Seconds of play that count it. */
  neededSec: number;
}

/** One person who watched a video, for the admin. */
export interface YourVideosWatcher {
  userId: string;
  name: string | null;
  role: 'owner' | 'manager';
  watchedAt: string;
}

/** One video on the outlet's page in the admin: who watched it. */
export interface YourVideosAdminRow {
  id: string;
  title: GuideVideoText;
  /** The service it is about, and its name in both languages. */
  service: string;
  serviceName: { en: string; hi: string };
  /** The outlet has this service attached (the video is in "Your services" for its dealers). */
  attached: boolean;
  durationMs: number;
  /** Everyone at the outlet who has watched it, newest first. Empty = nobody. */
  watchedBy: YourVideosWatcher[];
}

/** The admin's view of one outlet's videos. */
export interface YourVideosAdminView {
  rows: YourVideosAdminRow[];
  /** The people on the app at this outlet (owners and the manager): how many could watch. */
  people: number;
  /** When the list was last put in this outlet's chat, or null when it never was. */
  lastSentAt: string | null;
}
