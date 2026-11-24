import * as React from 'react';

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
              'min-h-10 rounded-full border px-3.5 py-1.5 text-[14.5px] font-medium leading-tight shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] transition-colors ' +
              (sent === o.value
                ? 'border-wa-accent bg-wa-accent text-white'
                : 'border-wa-accent bg-wa-in text-wa-accent-strong active:bg-wa-row-active disabled:opacity-50')
            }
          >
            {words}
          </button>
        );
      })}
    </div>
  );
}
