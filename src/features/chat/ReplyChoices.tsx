import { Check } from 'lucide-react';
import * as React from 'react';

import { OwnWords } from '@/features/flowCard/OwnWords';
import type { Lang } from '@/store/lang';
import { sayIn, type MessageReplyChoices } from '@dk/shared/types';


/**
 * The answers to MDG's question as buttons to TAP instead of typing (owner,
 * 24 Nov 2026: at 12E the same tanker question went out seven times while the
 * owner typed "किराए" six different ways). A tap sends the button's words, in
 * the reader's language, as their own message — the server knows those exact
 * words, so a tapped answer is never misread. One tap only: the buttons lock
 * at once, and vanish when anything newer arrives.
 */
export function ReplyChoices({
  choices,
  lang,
  onChoice,
}: {
  choices: MessageReplyChoices;
  lang: Lang;
  onChoice: (text: string) => void;
}) {
  const [sent, setSent] = React.useState<string | null>(null);
  return (
    <div data-testid="reply-choices" data-no-swipe className="mt-1.5 flex max-w-[330px] flex-wrap gap-1.5">
      {choices.options.map((o) => {
        const words = sayIn(o.label, lang);
        return (
          <button
            key={o.value}
            type="button"
            disabled={sent !== null}
            onClick={() => {
              if (sent !== null || !words) return;
              setSent(o.value);
              onChoice(words);
            }}
            className={
              'min-h-10 rounded-full border px-3.5 py-1.5 text-cta font-medium shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] transition-colors ' +
              (sent === o.value
                ? 'border-wa-accent bg-wa-accent text-white'
                : 'border-wa-accent bg-wa-in text-wa-accent-strong active:bg-wa-row-active disabled:opacity-50')
            }
          >
            {words}
          </button>
        );
      })}
      {/* None of these? The dealer says it in their own words (ADR 0059). */}
      {sent === null ? (
        <OwnWords
          label=""
          sentKey="flow.ownWordsSentChat"
          onWords={(text) => {
            setSent('own');
            onChoice(text);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * The question's answer, once given (ADR 0059): the button the dealer tapped (or the
 * words they typed that match one) stays under the question, filled and ticked, so the
 * chat shows what was chosen. The other buttons are gone: the question is answered.
 */
export function AnsweredChoice({ words }: { words: string }) {
  return (
    <div data-testid="reply-choice-answered" className="mt-1.5 flex max-w-[330px]">
      <span className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-wa-accent bg-wa-accent px-3 py-1 text-meta font-medium text-white">
        <Check aria-hidden width={14} strokeWidth={3} />
        {words}
      </span>
    </div>
  );
}

/** The option a reply's words name, in any dealer language, or null. Spaces, case and stops ignored. */
export function pickedChoice(choices: MessageReplyChoices, reply: string | undefined, lang: Lang): string | null {
  if (!reply) return null;
  const key = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const said = key(reply);
  if (!said) return null;
  for (const o of choices.options) {
    for (const w of Object.values(o.label)) {
      if (typeof w === 'string' && key(w) === said) return sayIn(o.label, lang) || w;
    }
  }
  return null;
}
