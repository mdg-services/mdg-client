import { lazyRoute } from '@/lib/lazyRoute';

/** The player's code is its own chunk: the Today page's first paint never carries it. */
export const WhatsNewVideo = lazyRoute(() =>
  import('./WhatsNewVideo').then((m) => ({ default: m.WhatsNewVideo })),
);
