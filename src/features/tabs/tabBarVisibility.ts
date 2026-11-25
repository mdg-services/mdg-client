import * as React from 'react';
import { create } from 'zustand';

/**
 * Whether a screen has asked the bottom tab bar to step aside.
 *
 * The chat list hides it while its search is open: the search bar takes the top
 * of the screen and the keyboard the bottom, and a tab bar in between would be
 * one more thing to mis-tap. The screen that asks owns the answer — it clears the
 * ask itself when it closes the search or goes away.
 */
const useVisibility = create<{ asked: number }>(() => ({ asked: 0 }));

/** Hide the tab bar while `hide` is true. */
export function useHideTabBar(hide: boolean): void {
  React.useEffect(() => {
    if (!hide) return;
    useVisibility.setState((s) => ({ asked: s.asked + 1 }));
    return () => useVisibility.setState((s) => ({ asked: Math.max(0, s.asked - 1) }));
  }, [hide]);
}

/** True while some screen has asked for the bar to be hidden. */
export function useTabBarHidden(): boolean {
  return useVisibility((s) => s.asked > 0);
}
