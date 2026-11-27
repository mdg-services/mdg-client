import { cn } from '@/lib/cn';
import type { Lang } from '@/store/lang';
import { DEALER_LANGS, DEALER_LANGUAGES } from '@dk/shared/types';

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
              'flex min-h-[60px] w-full items-center gap-4 rounded-lg border-2 px-4 text-left active:bg-wa-row-active',
              on ? 'border-wa-accent bg-wa-select' : 'border-wa-divider bg-wa-bar',
            )}
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
            <span className="min-w-0">
              <span className="block text-subheading leading-snug text-wa-bar-text">
                {info.name}
              </span>
              <span className="block text-meta leading-snug text-wa-meta">{info.hint}</span>
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
      className="rounded-lg bg-wa-wallpaper p-3"
    >
      <p className="text-meta leading-snug text-wa-bubble-text">{info.sample.explain}</p>
      <div className="mt-2 max-w-[85%] rounded-lg rounded-tl-none bg-wa-in px-3 py-2 shadow-sm">
        <p className="text-meta font-medium text-wa-accent">MDG</p>
        <p className="text-body leading-snug text-wa-bubble-text">{info.sample.example}</p>
      </div>
    </div>
  );
}
