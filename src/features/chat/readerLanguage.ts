/**
 * EACH READER IN THEIR OWN LANGUAGE (owner, 20 Nov 2026).
 *
 * An owner who reads English and a manager who reads Hindi share the manager
 * group. A card MDG sends there is drawn in both languages
 * (`Message.attachmentsByLang`), and what MDG's team types or the assistant replies
 * is translated a few seconds after it arrives (`Message.bodyByLang` + `bodyLang`).
 * These two helpers pick this reader's own.
 */
import { sayIn, type DealerLang } from '@dk/shared/types';
import type { Message } from '@dk/shared/types';

/**
 * The message with this reader's own-language pictures in `attachments`, so every
 * part of the chat (the bubble, photo groups, download, reply quotes) shows them
 * without knowing about languages. The same object when there is nothing to swap,
 * so a long thread does not redraw.
 */
export function withReaderPictures(message: Message, lang: DealerLang): Message {
  const own = message.attachmentsByLang?.[lang];
  if (!own || own.length === 0 || own === message.attachments) return message;
  return { ...message, attachments: own };
}

export interface ReaderBody {
  /** The words to draw. */
  text: string | undefined;
  /**
   * A machine translation of what MDG wrote, in this reader's language — the
   * bubble labels it "Translated" and offers the original. False for the writer's
   * own words and for notices MDG wrote in every language.
   */
  translated: boolean;
}

/**
 * The words of a message for this reader. `showOriginal` is the reader's tap on
 * "See original": the writer's own words, however the message was translated.
 */
export function readerBody(message: Message, lang: DealerLang, showOriginal = false): ReaderBody {
  const byLang = message.bodyByLang;
  if (!byLang) return { text: message.body, translated: false };
  const source = message.bodyLang;
  if (source) {
    const own = byLang[lang];
    if (showOriginal || lang === source || !own) {
      return { text: byLang[source] || message.body, translated: false };
    }
    return { text: own, translated: true };
  }
  // A notice MDG wrote in every language: the reader's own, never "translated".
  return { text: sayIn(byLang, lang) || message.body, translated: false };
}
