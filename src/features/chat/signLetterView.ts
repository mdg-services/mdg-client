import type { Attachment, Message } from '@dk/shared/types';

/**
 * The small decisions behind the "sign this letter" request (ADR 0029), kept
 * apart from the drawing so they can be tested without a screen.
 */

/**
 * A request whose message carries a letter to print, sign, stamp and send back
 * (`ask.variant === 'sign-letter'`). Every other request keeps the usual footer.
 */
export function isSignLetterAsk(message: Pick<Message, 'ask'>): boolean {
  return message.ask?.variant === 'sign-letter';
}

/**
 * The letter itself: the first PDF the message carries. The server posts the
 * letter and the request as ONE message, so this is the file the "Download
 * letter" button hands over — through the same road as any other attachment.
 * Null when there is none (the button is then not drawn; the steps still are).
 */
export function letterPdfOf(message: Pick<Message, 'attachments'>): Attachment | null {
  return (
    message.attachments.find(
      (a) =>
        a.kind === 'file' && (a.contentType === 'application/pdf' || /\.pdf$/i.test(a.filename)),
    ) ?? null
  );
}
