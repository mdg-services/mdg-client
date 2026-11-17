/**
 * The languages a dealer can choose — one list, read by every place that writes
 * words for a dealer: the app's screens, chat messages, report cards, phone
 * notifications, WhatsApp, and the AI's answers (owner, 17 Nov 2026).
 *
 * Each person picks one the first time they open the app (and can change it in
 * Settings → Language). Their choice is `User.lang`; `User.langChosenAt` says they
 * really chose it rather than inherited the default.
 *
 * ADDING A LANGUAGE
 * -----------------
 * 1. Add its code to `DEALER_LANGS` and a row to `DEALER_LANGUAGES` below.
 * 2. Compile. `DealerWords` needs every language, so every sentence written for a
 *    dealer that lacks the new one is now a type error — the compiler hands over
 *    the whole list of what to translate. The app's screen catalog has the same
 *    rule (`mdg-client/src/lib/i18n.ts` and its per-language files).
 * 3. Text that is data rather than authored words (a paper's name from the
 *    catalog, a message stored months ago) falls back along `fallback`, so a gap
 *    shows a readable word instead of nothing.
 * 4. WhatsApp templates are approved by Meta per language: set `whatsapp` to the
 *    template language this reader should get until theirs is approved.
 */

export const DEALER_LANGS = ['hi', 'hl', 'en'] as const;
export type DealerLang = (typeof DEALER_LANGS)[number];

/** What a person reads before they have chosen (ADR 0008: Hindi first). */
export const DEFAULT_DEALER_LANG: DealerLang = 'hi';

export interface DealerLanguageInfo {
  /** Its name in its OWN script, never translated: a lost reader must find the way back. */
  name: string;
  /** One short line under the name, in the language itself: what it looks like. */
  hint: string;
  /**
   * The sample shown when it is picked: what changes, then one message as it will
   * really read. Written in the language itself.
   */
  sample: { explain: string; example: string };
  /** The button that confirms the choice, in the language itself. */
  confirm: string;
  /** `deva` = Devanagari letters, `latn` = English letters. */
  script: 'deva' | 'latn';
  /** Where a missing word is looked for next. `null` = this is a base language with every word. */
  fallback: DealerLang | null;
  /** Dates and numbers (`Intl`). */
  locale: 'hi-IN' | 'en-IN';
  /** What the phone listens for when the person speaks a message. */
  speech: 'hi-IN' | 'en-IN';
  /** The Meta template language this reader is sent (Meta's `hi` templates are written in Hinglish). */
  whatsapp: 'hi' | 'en';
}

export const DEALER_LANGUAGES: Record<DealerLang, DealerLanguageInfo> = {
  hi: {
    name: 'हिंदी',
    hint: 'हिंदी अक्षरों में',
    sample: {
      explain: 'हमारे सारे मैसेज, रिपोर्ट कार्ड, सूचनाएँ और जवाब अब हिंदी में आएँगे।',
      example: 'आज की DSR रिपोर्ट तैयार है। कुल बिक्री 8,450 लीटर।',
    },
    confirm: 'आगे बढ़ें',
    script: 'deva',
    fallback: null,
    locale: 'hi-IN',
    speech: 'hi-IN',
    // No Devanagari template is approved yet: Hindi readers get the Hinglish one.
    whatsapp: 'hi',
  },
  hl: {
    name: 'Hinglish',
    hint: 'Hindi, English letters mein',
    sample: {
      explain: 'Hamare saare message, report card, notification aur jawab ab Hinglish mein aayenge.',
      example: 'Aaj ki DSR report taiyaar hai. Kul bikri 8,450 litre.',
    },
    confirm: 'Aage badhein',
    script: 'latn',
    // Same letters: a name or term that has no Hinglish form reads best in English.
    fallback: 'en',
    locale: 'en-IN',
    speech: 'hi-IN',
    whatsapp: 'hi',
  },
  en: {
    name: 'English',
    hint: 'In English',
    sample: {
      explain: 'All our messages, report cards, notifications and answers will now come in English.',
      example: "Today's DSR report is ready. Total sales 8,450 litres.",
    },
    confirm: 'Continue',
    script: 'latn',
    fallback: null,
    locale: 'en-IN',
    speech: 'en-IN',
    whatsapp: 'en',
  },
};

export function isDealerLang(raw: unknown): raw is DealerLang {
  return typeof raw === 'string' && (DEALER_LANGS as readonly string[]).includes(raw);
}

/** A stored or sent value → a language to write in. Anything unknown reads the default. */
export function dealerLangOf(raw: unknown): DealerLang {
  return isDealerLang(raw) ? raw : DEFAULT_DEALER_LANG;
}

/** One sentence in every language. Required for every language, so a new one is a compile error until written. */
export type DealerWords = Readonly<Record<DealerLang, string>>;

/**
 * Words where only some languages are written: older data, and two-language
 * labels from the catalogs (`labelEn`/`labelHi`). Read through {@link sayIn}.
 */
export type SomeDealerWords = Readonly<Partial<Record<DealerLang, string>>>;

/**
 * The text for `lang`: its own, else along its fallback chain, else Hindi, else
 * English, else the first language written. A plain string is the same in every
 * language (a figure, a code, a name).
 */
export function sayIn(words: SomeDealerWords | string, lang: DealerLang): string {
  if (typeof words === 'string') return words;
  let at: DealerLang | null = lang;
  const seen = new Set<DealerLang>();
  while (at && !seen.has(at)) {
    seen.add(at);
    const text = words[at];
    if (text !== undefined && text !== '') return text;
    at = DEALER_LANGUAGES[at].fallback;
  }
  return words.hi ?? words.en ?? Object.values(words).find((v) => v) ?? '';
}

/** The base two-language pair a language reads when only Hindi and English exist. */
export function baseLangOf(lang: DealerLang): 'hi' | 'en' {
  let at: DealerLang = lang;
  for (let i = 0; i < DEALER_LANGS.length; i++) {
    if (at === 'hi' || at === 'en') return at;
    const next = DEALER_LANGUAGES[at].fallback;
    if (!next) break;
    at = next;
  }
  return DEALER_LANGUAGES[lang].script === 'deva' ? 'hi' : 'en';
}
