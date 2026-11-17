import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { DEFAULT_DEALER_LANG, isDealerLang, type DealerLang, type User } from '@dk/shared/types';

/**
 * The languages the dealer app speaks — one list for the whole system,
 * `shared/types/dealerLanguage.ts`. Hindi is the default (ADR 0008).
 */
export type Lang = DealerLang;

interface LangState {
  lang: Lang;
  /**
   * True once the member has *explicitly* chosen a language via the toggle.
   * Once set, a returning-member server preference never silently overrides it.
   */
  explicit: boolean;
  /** Set the language and mark the choice as explicit (a deliberate user pick). */
  setLang: (lang: Lang) => void;
  /**
   * Adopt the language stored on the member's account (best-effort, on load),
   * but ONLY if the member has not already made an explicit local choice. This
   * lets a returning member land in their saved language without stomping a
   * fresh pick made on this device.
   */
  setLangFromUser: (user: Pick<User, 'lang'> | null | undefined) => void;
}

export const useLangStore = create<LangState>()(
  persist(
    (set, get) => ({
      // Hindi-first: the dealer audience reads Hindi more comfortably (ADR 0008).
      lang: DEFAULT_DEALER_LANG,
      explicit: false,
      setLang: (lang) => set({ lang, explicit: true }),
      setLangFromUser: (user) => {
        if (get().explicit) return;
        const serverLang = user?.lang;
        if (isDealerLang(serverLang)) {
          // Adopt without marking explicit — it's the account default, not a
          // deliberate on-device pick.
          set({ lang: serverLang });
        }
      },
    }),
    {
      name: 'mdg.client.lang',
      partialize: (s) => ({ lang: s.lang, explicit: s.explicit }),
    },
  ),
);

/** Imperative accessor for use outside React (e.g. formatting helpers). */
export function getLang(): Lang {
  return useLangStore.getState().lang;
}
