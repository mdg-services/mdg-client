import { Globe } from 'lucide-react';
import * as React from 'react';

import { FirstLanguageScreen } from '@/components/ChooseLanguageScreen';
import { LANGUAGE_NAMES, LanguageSheet } from '@/components/LanguageSheet';
import { isEmbedded } from '@/lib/embedMode';
import { useLang, useT } from '@/lib/i18n';
import { useAuthStore } from '@/store/auth';
import { useLangStore } from '@/store/lang';

import { hasAccountHere } from './firstScreen';

/**
 * The visible language switch of the two screens before sign-in (spec 4.9): the language's own name
 * with a globe, 44px tall, opening the same sheet as Settings → Language. A reader who lands on a
 * screen in a language they do not read finds it without signing in first.
 */
export function LanguageSwitch() {
  const t = useT();
  const lang = useLang();
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-cta text-text shadow-sm active:bg-surface-2"
      >
        <Globe width={18} strokeWidth={1.75} aria-hidden />
        {/* The spoken name starts with the word for what this is and ends with what is written on it. */}
        <span className="sr-only">{t('profile.language')}: </span>
        <span className="break-words">{LANGUAGE_NAMES[lang]}</span>
      </button>
      {open ? <LanguageSheet onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/**
 * Has this phone still to answer "which language?" before Register or Sign in? Only a phone nobody has
 * signed in or registered on, nobody is signed in, whose reader has not picked a language, and never inside the browser
 * extension's panel (it has neither screen). Once answered it stays answered (`useLangStore.explicit`).
 */
export function useNeedsFirstLanguage(): boolean {
  const explicit = useLangStore((s) => s.explicit);
  const signedIn = useAuthStore((s) => !!s.token);
  const [accountHere] = React.useState(hasAccountHere);
  return !explicit && !signedIn && !accountHere && !isEmbedded();
}

/**
 * Puts the language question in front of a screen that has not been asked yet:
 * `<FirstLanguageGate><RegisterForm/></FirstLanguageGate>`. A wrapper, not an early return inside the
 * page, so the page's own hooks never change order when the answer arrives.
 */
export function FirstLanguageGate({ children }: { children: React.ReactNode }) {
  const needs = useNeedsFirstLanguage();
  return needs ? <FirstLanguageScreen /> : <>{children}</>;
}
