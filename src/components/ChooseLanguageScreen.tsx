import * as React from 'react';

import { LanguageOptions, LanguageSample } from '@/components/LanguageChoice';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useLangStore, type Lang } from '@/store/lang';
import { DEALER_LANGUAGES } from '@dk/shared/types';

/**
 * The first thing a dealer sees after signing in, once (owner, 17 Nov 2026):
 * which language should everything come in — the app, the chat, the report
 * cards, the notifications, the AI's answers.
 *
 * One screen, three big choices. Tapping one shows, in that language, what it
 * means and a message as it will really arrive; the button under it (also in
 * that language) saves it. Nothing else is asked. Shown to anyone whose account
 * has `langChosenAt: null` — new dealers, and every existing one once, since
 * Hinglish and English are new choices. Settings → Language changes it later.
 */
export function ChooseLanguageScreen() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const setLang = useLangStore((s) => s.setLang);
  const [picked, setPicked] = React.useState<Lang | null>(null);

  const confirm = React.useCallback(() => {
    if (!picked) return;
    setLang(picked);
    // Show the app straight away; the save follows the person across phones.
    if (user) setUser({ ...user, lang: picked, langChosenAt: new Date().toISOString() });
    void api
      .patch<{ ok: boolean; data: typeof user }>('/v1/me', { lang: picked })
      .catch(() => undefined);
  }, [picked, setLang, setUser, user]);

  return (
    <div className="flex min-h-full flex-1 flex-col bg-wa-bar safe-bottom">
      <div className="flex-1 px-5 pb-4 pt-10">
        <h1 lang="hi" className="text-[24px] font-semibold leading-tight text-wa-bar-text">
          अपनी भाषा चुनें
        </h1>
        <p lang="en" className="mt-1 text-[15px] leading-snug text-wa-meta">
          Apni bhasha chuniye · Choose your language
        </p>

        <div className="mt-6">
          <LanguageOptions value={picked} onPick={setPicked} label="भाषा · Bhasha · Language" />
        </div>

        {picked ? (
          <div className="mt-5">
            <LanguageSample lang={picked} />
          </div>
        ) : null}
      </div>

      <div className="sticky bottom-0 bg-wa-bar px-5 pb-5 pt-2">
        <button
          type="button"
          disabled={!picked}
          onClick={confirm}
          className="flex h-12 w-full items-center justify-center rounded-lg bg-wa-accent px-3 text-[16px] font-medium text-white active:opacity-90 disabled:opacity-40"
        >
          {picked ? DEALER_LANGUAGES[picked].confirm : 'आगे बढ़ें · Continue'}
        </button>
      </div>
    </div>
  );
}

/** Does this signed-in person still have to pick? Only dealer logins, and only a `null` from the server. */
export function mustChooseLanguage(
  user: { role?: string; langChosenAt?: string | null } | null | undefined,
): boolean {
  if (!user) return false;
  if (user.role !== 'dealer-owner' && user.role !== 'dealer-staff') return false;
  // `undefined` = a server from before this screen existed: never block on it.
  return user.langChosenAt === null;
}
