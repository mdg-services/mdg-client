/**
 * Counting the seconds of a video a person REALLY played.
 *
 * A video counts as watched when about 65% of it was played (`GUIDE_VIDEO_WATCHED_FRACTION`),
 * and "played" means played through — not dragged to the end. The player's `timeupdate`
 * fires about four times a second while a video plays, and once more after the person
 * drags the seek bar. So a position that moved a little since the last one is play, and a
 * position that jumped is a skip, and a skip earns nothing.
 *
 * COVERAGE, NOT A STOPWATCH. Each second of the video holds how much of it has been seen
 * (0 to 1), so playing the first twenty seconds three times is still twenty seconds. The
 * total is what the server weighs against the video's real length.
 *
 * Pure: no player, no timers. The player calls {@link WatchTracker.step} on every
 * `timeupdate` and {@link WatchTracker.skip} on `seeking`.
 */

/**
 * The largest move between two updates that still counts as play. A phone with the screen
 * dimmed or the app behind another may deliver an update every second or two; a person
 * dragging the bar moves further than this in one go.
 */
export const MAX_PLAY_STEP_SEC = 2.5;

export interface WatchTracker {
  /** The position now, in seconds. Credits the stretch since the last one when it is play. */
  step(positionSec: number): void;
  /** The person moved the playhead (a drag, a tap on the bar): forget where it was. */
  skip(): void;
  /** Seconds of the video that have been played, each counted once. */
  playedSec(): number;
}

export function createWatchTracker(): WatchTracker {
  /** Second index → how much of that second has been seen, 0 to 1. */
  const seen = new Map<number, number>();
  let last: number | null = null;

  const credit = (from: number, to: number): void => {
    for (let k = Math.floor(from); k <= Math.floor(to); k += 1) {
      const overlap = Math.min(to, k + 1) - Math.max(from, k);
      if (overlap > 0) seen.set(k, Math.min(1, (seen.get(k) ?? 0) + overlap));
    }
  };

  return {
    step(positionSec) {
      if (!Number.isFinite(positionSec) || positionSec < 0) return;
      if (last !== null) {
        const moved = positionSec - last;
        if (moved > 0 && moved <= MAX_PLAY_STEP_SEC) credit(last, positionSec);
      }
      last = positionSec;
    },
    skip() {
      last = null;
    },
    playedSec() {
      let total = 0;
      for (const v of seen.values()) total += v;
      return total;
    },
  };
}
