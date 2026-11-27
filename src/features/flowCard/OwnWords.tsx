import { Pencil, X } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';

/**
 * "कुछ और? लिखिए" — THE DEALER'S OWN WORDS, under every question that has choices
 * (owner, 26 Nov 2026: take a free-text answer whenever the options do not hold the one
 * the dealer wants to give).
 *
 * A quiet link after the choices opens a one-line box. What the dealer writes goes into the
 * chat as their own message, quoting the card, and MDG's team (or the order desk) reads it
 * and fills the same card — the card moves under the message when it does. A row that
 * takes a number (a fuel's KL) passes a plain number straight to the row instead, the same
 * as a tap; anything else in words still goes to the chat.
 *
 * Never for a password or an OTP: those rows have their own boxes, and nothing typed here
 * should ever be a login.
 */
export function OwnWords({
  label,
  disabled,
  compact = false,
  onWords,
  onNumber,
  sentKey = 'flow.ownWordsSent',
}: {
  /** The question, for a screen reader: "Kab chahiye?: write your answer". */
  label: string;
  disabled?: boolean;
  /** An icon-only pill, where the row is tight (a fuel's KL). */
  compact?: boolean;
  /** Send the words as the dealer's own chat message. */
  onWords: (text: string) => void;
  /** A row that takes a number: called with a clean number instead of sending words. Return false to send the words after all. */
  onNumber?: (value: string) => boolean;
  /** What to say once the words are sent: into this card (default), or "we will answer here". */
  sentKey?: 'flow.ownWordsSent' | 'flow.ownWordsSentChat';
}) {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState('');
  const [sent, setSent] = React.useState(false);
  const boxRef = React.useRef<HTMLInputElement>(null);
  const id = React.useId();
  React.useEffect(() => {
    if (open) boxRef.current?.focus();
  }, [open]);

  const words = text.trim();
  const submit = () => {
    if (!words || disabled) return;
    // "9", "9.5", "9 kl": a number goes to the row itself.
    const num = /^(\d{1,3}(?:[.,]\d)?)\s*(?:kl|केएल|के एल)?$/i.exec(words);
    if (num && onNumber && onNumber(num[1]!.replace(',', '.'))) {
      setOpen(false);
      setText('');
      return;
    }
    onWords(words);
    setOpen(false);
    setText('');
    setSent(true);
  };

  if (!open) {
    return (
      <>
        <button
          type="button"
          data-testid="own-words"
          disabled={disabled}
          onClick={() => {
            setSent(false);
            setOpen(true);
          }}
          aria-label={label ? `${label}: ${t('flow.ownWordsLabel')}` : t('flow.ownWordsLabel')}
          title={t('flow.ownWords')}
          className={cn(
            // A quiet link, not another pill: the choices stay the thing to tap.
            'inline-flex min-h-9 items-center justify-center gap-1 rounded-full text-wa-meta',
            'active:bg-wa-row-active disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
            compact ? 'size-9 border border-dashed border-wa-meta/50' : 'px-1.5 text-left text-micro font-medium underline decoration-dotted underline-offset-4',
          )}
        >
          <Pencil aria-hidden width="1em" height="1em" strokeWidth={2} className={compact ? 'shrink-0 text-meta' : 'shrink-0'} />
          {compact ? null : <span>{t('flow.ownWords')}</span>}
        </button>
        {sent ? (
          <p role="status" className="basis-full text-micro text-wa-meta">
            {t(sentKey)}
          </p>
        ) : null}
      </>
    );
  }

  return (
    <form
      data-testid="own-words-box"
      className="flex basis-full items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor={id} className="sr-only">
        {t('flow.ownWordsLabel')}
      </label>
      <input
        id={id}
        ref={boxRef}
        type="text"
        maxLength={500}
        autoComplete="off"
        placeholder={t('flow.ownWordsLabel')}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
        className="min-h-9 min-w-0 flex-1 rounded-full border border-wa-divider bg-wa-in px-3 text-meta outline-none placeholder:text-wa-meta focus:border-wa-accent"
      />
      <button
        type="submit"
        disabled={!words || disabled}
        className="inline-flex min-h-9 shrink-0 items-center rounded-full bg-wa-accent px-3.5 text-meta font-semibold text-white disabled:opacity-40"
      >
        {t('flow.ownWordsSend')}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label={t('common.cancel')}
        className="grid size-9 shrink-0 place-items-center rounded-full text-wa-meta active:bg-wa-row-active"
      >
        <X aria-hidden width={16} strokeWidth={2} />
      </button>
    </form>
  );
}
