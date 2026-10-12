import * as React from 'react';

import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { useDialog } from '@/lib/useDialog';
import { useAuthStore } from '@/store/auth';
import { useLangStore, type Lang } from '@/store/lang';

/**
 * Each language in its OWN script. A dealer who has ended up in a language they
 * cannot read must still be able to find the way back, so these are never
 * translated.
 */
export const LANGUAGE_NAMES: Record<Lang, string> = {
  hi: 'हिंदी',
  en: 'English',
};

const OPTIONS: Lang[] = ['hi', 'en'];

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

  const choose = React.useCallback(
    (next: Lang) => {
      if (next === lang) return;
      setLang(next);
      // Reflect immediately in the cached user so a /me refetch doesn't flicker.
      if (user) setUser({ ...user, lang: next });
      // Best-effort: follow the member across devices. Ignore all failures.
      void api.patch('/v1/me', { lang: next }).catch(() => undefined);
    },
    [lang, setLang, user, setUser],
  );

  return { lang, choose };
}

/**
 * The small sheet Settings → Language opens: हिंदी / English, one tap to pick,
 * and it closes on its own. It used to be a segmented switch in the app's header
 * on every screen; with no header, the choice lives where WhatsApp keeps it.
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
        className="relative mx-auto flex w-full max-w-md flex-col rounded-t-2xl bg-wa-bar pb-2 shadow-lg outline-none safe-bottom animate-in"
      >
        <p className="px-6 pb-2 pt-5 text-[17px] font-medium text-wa-bar-text">
          {t('profile.language')}
        </p>
        <div role="radiogroup" aria-label={t('profile.language')}>
          {OPTIONS.map((value) => {
            const on = value === lang;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  choose(value);
                  onClose();
                }}
                className="flex min-h-[52px] w-full items-center gap-4 px-6 text-left text-[16px] text-wa-bar-text active:bg-wa-row-active"
              >
                <span
                  aria-hidden
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
                    on ? 'border-wa-accent' : 'border-wa-bar-icon',
                  )}
                >
                  {on ? <span className="h-2.5 w-2.5 rounded-full bg-wa-accent" /> : null}
                </span>
                {LANGUAGE_NAMES[value]}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
