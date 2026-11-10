import * as React from 'react';

import { Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { useNavigationPending } from '@/lib/useNavigationPending';

function SlowNote() {
  const t = useT();
  return (
    <>
      <p className="text-center text-sm text-text-muted">{t('app.stillLoading')}</p>
      <button
        type="button"
        // The address already holds the screen asked for, so a reload opens it.
        onClick={() => window.location.reload()}
        className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-text-inverse active:opacity-90"
      >
        {t('common.retry')}
      </button>
    </>
  );
}

/**
 * What a screen looks like while its code is coming down the wire, when there is
 * no earlier screen to keep showing (the app opening, or signing in).
 *
 * A bare spinner is fine for the second or two this takes on wifi. On a 2G
 * forecourt link it could sit for a minute with nothing but a small grey dot on
 * an empty screen — no words, no way to tell it apart from a broken app, and
 * nothing to press. After six seconds it says what is happening and offers the
 * reload, which is the same escape the chunk-error boundary gives when the
 * download fails outright.
 */
export function RouteFallback({ className }: { className?: string }) {
  const [slow, setSlow] = React.useState(false);
  React.useEffect(() => {
    const id = window.setTimeout(() => setSlow(true), 6000);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <div className={cn('flex flex-col items-center justify-center gap-4 px-8', className)}>
      <Spinner size={22} />
      {slow ? <SlowNote /> : null}
    </div>
  );
}

/**
 * The sign that a tapped screen is on its way: a thin bar along the top while
 * the screen on show stays put, and after six seconds the same "still loading /
 * Try again" note as above, in a strip at the bottom.
 */
export function NavigationProgress() {
  const state = useNavigationPending();
  if (state === 'idle') return null;
  return (
    <>
      <div className="nav-progress" role="progressbar" aria-busy="true" />
      {state === 'slow' ? (
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-[70] flex flex-col items-center gap-3 border-t border-border bg-surface px-6 pt-4 shadow-lg">
          <SlowNote />
        </div>
      ) : null}
    </>
  );
}
