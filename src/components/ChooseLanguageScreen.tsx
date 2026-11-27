import { QueryClientContext } from '@tanstack/react-query';
import * as React from 'react';

import { LanguageOptions, LanguageSample } from '@/components/LanguageChoice';
import { Button } from '@/components/ui';
import { invalidateTodayFeed } from '@/hooks/api/useTodayFeed';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useLargeText } from '@/lib/useLargeText';
import { useAuthStore } from '@/store/auth';
import { useLangStore, type Lang } from '@/store/lang';
import { DEALER_LANGUAGES } from '@dk/shared/types';

/**
 * The language screen's one layout: a title in Hindi and English, the three languages each in its
 * OWN script (never translated, so a lost reader finds theirs), a sample of what picking one means,
 * and a button in the picked language. The language the app is already in (Hindi on a new phone, the
 * account's own on a second one) is picked at first, so the button is live from the start and one tap
 * carries on; a reader who wants another taps it.
 * `onConfirm` is what saving means: before sign-in only this phone remembers, after it the account does.
 */
export function LanguagePicker({ onConfirm }: { onConfirm: (lang: Lang) => void }) {
  const current = useLangStore((s) => s.lang);
  const [picked, setPicked] = React.useState<Lang | null>(current);
  // At large text the button bar would take a fifth of the screen and hide the last row: it scrolls
  // with the page instead, below the sample, so nothing is ever covered.
  const large = useLargeText();
  return (
    <div className="flex min-h-full flex-1 flex-col bg-bg safe-bottom">
      <div className="mx-auto w-full max-w-sm flex-1 px-4 pb-6 pt-10">
        <h1 lang="hi" className="text-title text-text">
          अपनी भाषा चुनें
        </h1>
        <p lang="en" className="mt-1 text-body text-text-muted">
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

      <div
        className={cn(
          'border-t border-border bg-bg px-4 pb-4 pt-3',
          large ? '' : 'sticky bottom-0',
        )}
      >
        <div className="mx-auto w-full max-w-sm">
          <Button
            size="lg"
            fullWidth
            disabled={!picked}
            onClick={() => {
              if (picked) onConfirm(picked);
            }}
          >
            {picked ? DEALER_LANGUAGES[picked].confirm : 'आगे बढ़ें · Continue'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * The first thing a dealer sees after signing in, once (owner, 17 Nov 2026): which language should
 * everything come in — the app, the chat, the report cards, the notifications, the AI's answers.
 *
 * Since the redesign (spec 4.9) the question is asked BEFORE Register and Sign in, and sent from
 * there (`features/auth/signIn.ts`), so a dealer who has already answered never reaches this: it is
 * what is left for an account whose phone never asked (a second phone, a login MDG made for them).
 * Shown to anyone whose account has `langChosenAt: null`. Settings → Language changes it later.
 */
export function ChooseLanguageScreen() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const setLang = useLangStore((s) => s.setLang);
  const qc = React.useContext(QueryClientContext);

  const confirm = React.useCallback(
    (picked: Lang) => {
      setLang(picked);
      // Show the app straight away; the save follows the person across phones.
      if (user) setUser({ ...user, lang: picked, langChosenAt: new Date().toISOString() });
      // Today mounts the moment the choice is confirmed and asks for its feed in parallel with
      // this save, so it may be answered in the old language: ask again once the save is done.
      void api
        .patch<{ ok: boolean; data: typeof user }>('/v1/me', { lang: picked })
        .then(() => {
          if (qc) invalidateTodayFeed(qc);
        })
        .catch(() => undefined);
    },
    [setLang, setUser, user, qc],
  );

  return <LanguagePicker onConfirm={confirm} />;
}

/**
 * The language question before anybody has signed in or registered: the choice is kept on this phone
 * (`useLangStore`, `explicit`) and the sign-in that follows sends it to the account. Never asked twice.
 */
export function FirstLanguageScreen() {
  const setLang = useLangStore((s) => s.setLang);
  return <LanguagePicker onConfirm={setLang} />;
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
