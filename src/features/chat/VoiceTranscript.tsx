import * as React from 'react';

import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import type { Attachment } from '@dk/shared/types';

/** A transcript longer than this is shown three lines at a time, with "Show more". */
export const TRANSCRIPT_COLLAPSE_AFTER = 160;

/**
 * The words of a voice note, if MDG has written them down. Empty when it has not
 * (the note was not listened to yet, could not be made out, or is not a voice
 * note at all) — the bubble then has nothing under the player.
 */
export function transcriptOf(attachment: Pick<Attachment, 'transcript'>): string {
  return typeof attachment.transcript === 'string' ? attachment.transcript.trim() : '';
}

/**
 * What a voice note says, under its player: small, muted, labelled. The words are
 * a machine's reading of the audio, so they are drawn as plain text under a label
 * and never as something the sender typed. A long one shows its first three lines
 * and opens with a tap, so a minute of speech does not push the thread off the screen.
 *
 * As wide as the player above it, so the bubble keeps its shape.
 */
export function VoiceTranscript({ text }: { text: string }) {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  const bodyId = React.useId();
  const long = text.length > TRANSCRIPT_COLLAPSE_AFTER;
  return (
    <div
      data-testid="voice-transcript"
      className="w-[min(68vw,264px)] px-1.5 pb-1 pt-0.5 text-wa-meta"
    >
      <p className="text-[11px] font-medium leading-tight">{t('chat.transcript')}</p>
      <p
        id={bodyId}
        className={cn(
          'whitespace-pre-wrap break-words text-[13px] leading-snug',
          long && !open && 'line-clamp-3',
        )}
      >
        {text}
      </p>
      {long ? (
        <button
          type="button"
          // A tap on the link must not start a reply swipe or select the message.
          data-no-swipe
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={bodyId}
          className="-ml-1.5 min-h-9 rounded-md px-1.5 text-[13px] font-medium text-wa-accent-strong active:bg-black/10"
        >
          {open ? t('chat.transcriptLess') : t('chat.transcriptMore')}
        </button>
      ) : null}
    </div>
  );
}
