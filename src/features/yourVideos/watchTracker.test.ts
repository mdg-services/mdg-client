import { describe, expect, it } from 'vitest';

import { MAX_PLAY_STEP_SEC, createWatchTracker } from './watchTracker';

/** Play from `from` to `to` the way a phone reports it: a position about four times a second. */
function play(t: ReturnType<typeof createWatchTracker>, from: number, to: number, step = 0.25) {
  for (let p = from; p <= to + 1e-9; p += step) t.step(p);
}

describe('counting the seconds a person really played', () => {
  it('counts what plays through', () => {
    const t = createWatchTracker();
    play(t, 0, 40);
    expect(t.playedSec()).toBeCloseTo(40, 0);
  });

  it('counts nothing for a jump to the end: the bar dragged is not a video watched', () => {
    const t = createWatchTracker();
    t.step(0);
    t.step(0.25);
    t.skip(); // the seek bar was dragged
    play(t, 59, 60);
    expect(t.playedSec()).toBeLessThan(2);
  });

  it('counts nothing for a move bigger than a phone could skip between two updates, even without a seek event', () => {
    const t = createWatchTracker();
    t.step(1);
    t.step(1 + MAX_PLAY_STEP_SEC + 0.5);
    expect(t.playedSec()).toBe(0);
  });

  it('still counts a phone that reports a second or two apart (screen dimmed)', () => {
    const t = createWatchTracker();
    for (let p = 0; p <= 40; p += 2) t.step(p);
    expect(t.playedSec()).toBeCloseTo(40, 0);
  });

  it('counts each second once: playing the first twenty seconds three times is twenty seconds', () => {
    const t = createWatchTracker();
    play(t, 0, 20);
    t.skip();
    play(t, 0, 20);
    t.skip();
    play(t, 0, 20);
    expect(t.playedSec()).toBeCloseTo(20, 0);
  });

  it('adds up pieces played in different places', () => {
    const t = createWatchTracker();
    play(t, 0, 10);
    t.skip();
    play(t, 30, 40);
    expect(t.playedSec()).toBeCloseTo(20, 0);
  });

  it('does not count a pause: no update, no seconds', () => {
    const t = createWatchTracker();
    play(t, 0, 10);
    // paused for a minute: no timeupdate fires; playing resumes from where it stopped
    play(t, 10, 20);
    expect(t.playedSec()).toBeCloseTo(20, 0);
  });

  it('ignores a position that is not a number or goes backwards', () => {
    const t = createWatchTracker();
    t.step(Number.NaN);
    t.step(-3);
    t.step(5);
    t.step(4.9); // backwards: a replay, nothing earned
    expect(t.playedSec()).toBe(0);
  });
});
