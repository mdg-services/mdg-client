import { Camera, Download } from 'lucide-react';
import * as React from 'react';

import { useAttachmentDownload, type AttachmentSource } from '@/lib/downloadAttachment';
import { useT, type MessageKey } from '@/lib/i18n';
import type { Message } from '@dk/shared/types';

import type { AskAnswerHow } from './MessageBubble';
import { letterPdfOf } from './signLetterView';

const STEPS: readonly MessageKey[] = ['chat.letterStep1', 'chat.letterStep2', 'chat.letterStep3'];

const SECONDARY_BUTTON =
  'flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-wa-divider bg-wa-chip px-3 text-[15px] font-medium text-wa-bubble-text active:bg-wa-row-active';

/**
 * What sits under the signed-letter request while it is the owner's turn: three
 * short steps, then the buttons — Download letter, Photo of signed letter,
 * Choose file — and one quiet line for the owner with no printer.
 *
 * "Download letter" takes THIS message's PDF through the ordinary attachment
 * download (a fresh signed link through the message, the app's own downloader in
 * the shell). The two answer buttons are the usual ones, handed straight up and
 * called INSIDE the tap: the camera and the file picker only open from a tap
 * the Android WebView can see (see `AskFooter`).
 *
 * "Choose file" always takes files, a PDF among them: the owner with a scanner
 * sends the scan, not a photograph.
 *
 * `lead` is drawn first: MDG's reason when it sent a signed copy back.
 */
export function SignLetterOpen({
  message,
  source,
  lead,
  onAnswer,
}: {
  message: Message;
  source: AttachmentSource;
  lead?: React.ReactNode;
  onAnswer?: (message: Message, how: AskAnswerHow) => void;
}) {
  const t = useT();
  const download = useAttachmentDownload();
  const letter = letterPdfOf(message);
  // A message still on its way out has no row to presign through yet.
  const unsent = source.messageId.startsWith('temp-');

  return (
    <div data-sign-letter className="mt-1.5 flex flex-col gap-1.5">
      {lead}
      <ol
        role="list"
        aria-label={t('chat.letterStepsLabel')}
        className="flex list-none flex-col gap-1.5 rounded-md bg-wa-row-active px-2.5 py-2"
      >
        {STEPS.map((key, i) => (
          <li key={key} className="flex items-start gap-2 text-[14px] leading-snug">
            <span
              aria-hidden
              className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-black/10 text-[12px] font-medium"
            >
              {i + 1}
            </span>
            <span className="min-w-0 break-words">{t(key)}</span>
          </li>
        ))}
      </ol>
      {letter ? (
        <button
          type="button"
          disabled={unsent}
          onClick={() => void download(letter, source)}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-wa-accent px-3 text-[15px] font-medium text-white active:opacity-90 disabled:opacity-60"
        >
          <Download width={18} strokeWidth={2} className="shrink-0" aria-hidden />
          {t('chat.letterDownload')}
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => onAnswer?.(message, 'camera')}
        className={SECONDARY_BUTTON}
      >
        <Camera width={18} strokeWidth={2} className="shrink-0" aria-hidden />
        {t('chat.letterPhoto')}
      </button>
      <button
        type="button"
        onClick={() => onAnswer?.(message, 'files')}
        className={SECONDARY_BUTTON}
      >
        {t('chat.askChooseFile')}
      </button>
      <p className="px-0.5 text-[12px] leading-snug text-wa-meta">{t('chat.letterNoPrinter')}</p>
    </div>
  );
}
