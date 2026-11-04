import { Spinner } from '@/components/ui';
import { useT } from '@/lib/i18n';

import { useEmbedStore } from './embedState';

/**
 * What the extension's side panel shows in place of the app until it is signed in
 * (ADR 0032 §6), and instead of the sign-in screen once it is not.
 *
 * - opening: the panel has not handed over a sign-in yet, or the profile is loading;
 * - failed: the profile did not load — nothing is wrong with the sign-in itself;
 * - signed out: the server ended it, or Log out was pressed. The panel has already
 *   been told, and goes back to its own sign-in.
 *
 * `loading` is true while a token is held and the profile is on its way.
 */
export function EmbedStatus({ loading }: { loading: boolean }) {
  const t = useT();
  const phase = useEmbedStore((s) => s.phase);
  const retry = useEmbedStore((s) => s.retry);

  if (phase === 'signed-out' && !loading) {
    return (
      <div
        role="status"
        className="flex min-h-full flex-col items-center justify-center gap-1.5 px-6 text-center"
      >
        <p className="text-base font-semibold text-text">{t('embed.signedOut')}</p>
        <p className="text-sm text-text-muted">{t('embed.signedOutDesc')}</p>
      </div>
    );
  }

  if (phase === 'failed') {
    return (
      <div
        role="alert"
        className="flex min-h-full flex-col items-center justify-center gap-3 px-6 text-center"
      >
        <p className="text-sm text-text-muted">{t('common.loadFailed')}</p>
        <button
          type="button"
          onClick={() => (retry ? retry() : window.location.reload())}
          className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-text-inverse active:opacity-90"
        >
          {t('common.retry')}
        </button>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="flex min-h-full flex-col items-center justify-center gap-3 px-6 text-center"
    >
      <Spinner size={22} />
      <p className="text-sm text-text-muted">{t('embed.opening')}</p>
    </div>
  );
}
