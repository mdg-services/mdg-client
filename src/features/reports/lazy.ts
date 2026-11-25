import { lazyRoute } from '@/lib/lazyRoute';

/**
 * The overlay's code is the heaviest thing in the app (every report kind's drawing), so it is
 * its own chunk, downloaded once the app is up (`preloadScreens` in `App.tsx`) and never in the
 * chunk of a screen that only has a button for it.
 */
export const ReportHost = lazyRoute(() =>
  import('./ReportHost').then((m) => ({ default: m.ReportHost })),
);

/** The same overlay for the extension's panel, opened from inside the thread. */
export const ReportModal = lazyRoute(() =>
  import('./ReportModal').then((m) => ({ default: m.ReportModal })),
);
