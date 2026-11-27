import { QueryClientContext } from '@tanstack/react-query';
import * as React from 'react';

import { LanguageOptions, LanguageSample } from '@/components/LanguageChoice';
import { Button } from '@/components/ui';
import { invalidateTodayFeed } from '@/hooks/api/useTodayFeed';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useDialog } from '@/lib/useDialog';
import { useAuthStore } from '@/store/auth';
import { useLangStore, type Lang } from '@/store/lang';
import { DEALER_LANGS, DEALER_LANGUAGES } from '@dk/shared/types';

/**
 * Each language in its OWN script. A dealer who has ended up in a language they
 * cannot read must still be able to find the way back, so these are never
 * translated.
 */
export const LANGUAGE_NAMES: Record<Lang, string> = Object.fromEntries(
  DEALER_LANGS.map((l) => [l, DEALER_LANGUAGES[l].name]),
) as Record<Lang, string>;

/**
 * Switching the app's language: flips every screen at once (reactive store
 * read), reflects it into the cached user, and best-effort syncs it to the
 * account via PATCH /v1/me — a failure never blocks the UI (ADR 0008).
 */
export function useLanguageChoice(): { lang: Lang; choose: (next: Lang) => void } {
  const lang = useLangStore((s) => s.lang);
  const setLang = useLangStore((s) => s.setLang);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  // Absent in a bare test render: nothing cached then to refresh.
  const qc = React.useContext(QueryClientContext);

  const choose = React.useCallback(
    (next: Lang) => {
      if (next === lang) return;
      setLang(next);
      // Reflect immediately in the cached user so a /me refetch doesn't flicker.
      if (user) setUser({ ...user, lang: next, langChosenAt: new Date().toISOString() });
      // Best-effort: follow the member across devices. Ignore all failures.
      // The Today feed's words are written in the language the server holds for the member,
      // so it is asked for again only once the save has gone through.
      void api
        .patch('/v1/me', { lang: next })
        .then(() => {
          if (qc) invalidateTodayFeed(qc);
        })
        .catch(() => undefined);
    },
    [lang, setLang, user, setUser, qc],
  );

  return { lang, choose };
}

/**
 * Settings → Language: the same choices as the first-open picker. A tap switches
 * the whole app at once (this sheet too) and shows, in that language, what it
 * means and a message as it will arrive; "Done" closes it.
 */
export function LanguageSheet({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { lang, choose } = useLanguageChoice();
  // Back, Escape, focus in and out, and a locked page behind it.
  const panelRef = useDialog(onClose);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label={t('common.dismiss')}
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('profile.language')}
        tabIndex={-1}
        className="relative mx-auto flex max-h-[90dvh] w-full max-w-md flex-col overflow-y-auto rounded-t-2xl border border-border bg-surface px-4 pb-4 shadow-lg outline-none safe-bottom animate-in"
      >
        <p className="pb-3 pt-5 text-heading text-text">
          {t('profile.language')}
        </p>
        <LanguageOptions value={lang} onPick={choose} label={t('profile.language')} />
        <div className="mt-4">
          <LanguageSample lang={lang} />
        </div>
        <Button size="lg" fullWidth onClick={onClose} className="mt-4">
          {t('common.done')}
        </Button>
      </div>
    </div>
  );
}
