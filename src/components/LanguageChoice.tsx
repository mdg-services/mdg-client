import { Check } from 'lucide-react';

import { cn } from '@/lib/cn';
import type { Lang } from '@/store/lang';
import { DEALER_LANGS, DEALER_LANGUAGES } from '@dk/shared/types';

/**
 * "Chosen", in each language's OWN words (never the app's current language, like everything on this
 * screen). The chosen row says it in a word and a tick, not only in a darker border and a dot.
 */
const CHOSEN_WORD: Record<Lang, string> = {
  hi: 'चुना हुआ',
  hl: 'Chuna hua',
  en: 'Selected',
};

/**
 * The two pieces both language screens are made of: the list of languages, and
 * the sample that shows what picking one means. Used by the first-open picker
 * (`ChooseLanguageScreen`) and by Settings → Language (`LanguageSheet`).
 *
 * Every word here is the language's OWN (its name, its hint, its sample), never
 * the app's current language: a person who has landed in a language they cannot
 * read must still find theirs. The list is `DEALER_LANGS`, so a language added
 * there shows up here with nothing else to change.
 */
export function LanguageOptions({
  value,
  onPick,
  label,
}: {
  value: Lang | null;
  onPick: (lang: Lang) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-2">
      {DEALER_LANGS.map((code) => {
        const info = DEALER_LANGUAGES[code];
        const on = code === value;
        return (
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={info.name}
            lang={info.script === 'deva' ? 'hi' : 'en'}
            onClick={() => onPick(code)}
            className={cn(
              'flex min-h-16 w-full items-center gap-4 rounded-lg border-2 px-4 py-2 text-left shadow-sm active:bg-surface-2',
              on ? 'border-brand bg-brand-soft' : 'border-border bg-surface',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
                on ? 'border-brand' : 'border-text-muted',
              )}
            >
              {on ? <span className="h-2.5 w-2.5 rounded-full bg-brand" /> : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block break-words text-subheading leading-snug text-text">
                {info.name}
              </span>
              <span className="block break-words text-meta leading-snug text-text-muted">{info.hint}</span>
              {/* The tag sits UNDER the name, in the same column: beside it, at 200% text, it took most of
                  the row and the name was left one letter wide. */}
              {on ? (
                <span className="mt-1 flex items-center gap-1 text-meta font-semibold text-text">
                  <Check width={16} strokeWidth={2.4} aria-hidden className="shrink-0" />
                  <span className="break-words">{CHOSEN_WORD[code]}</span>
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * What picking `lang` means, said in `lang`: one plain line, then a message from
 * MDG exactly as it will arrive — a chat bubble on the chat's own wallpaper.
 */
export function LanguageSample({ lang }: { lang: Lang }) {
  const info = DEALER_LANGUAGES[lang];
  return (
    <div
      data-testid="language-sample"
      lang={info.script === 'deva' ? 'hi' : 'en'}
      aria-live="polite"
      className="rounded-lg border border-border bg-surface-2 p-3"
    >
      <p className="text-body leading-snug text-text-muted">{info.sample.explain}</p>
      <div className="mt-2 max-w-[85%] rounded-lg rounded-tl-none border border-border bg-surface px-3 py-2 shadow-sm">
        <p className="text-meta font-semibold text-text-muted">MDG</p>
        <p className="text-body leading-snug text-text">{info.sample.example}</p>
      </div>
    </div>
  );
}
