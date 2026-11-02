import { describe, expect, it } from 'vitest';

import { makeMessage } from '@/test/utils';
import type { Attachment } from '@dk/shared/types';

import { isSignLetterAsk, letterPdfOf } from './signLetterView';

const pdf = (over: Partial<Attachment> = {}): Attachment => ({
  storageKey: 'calibration/d1/c1/letter-1.pdf',
  filename: 'request-letter.pdf',
  contentType: 'application/pdf',
  size: 40_000,
  kind: 'file',
  ...over,
});
const photo = (): Attachment => ({
  storageKey: 'chat/c1/p.jpg',
  filename: 'p.jpg',
  contentType: 'image/jpeg',
  size: 100,
  kind: 'image',
});

describe('isSignLetterAsk', () => {
  const ask = { ref: 'doc:a1', kind: 'document' as const, title: 'Letter' };

  it('is true only for the sign-letter variant', () => {
    expect(isSignLetterAsk(makeMessage({ ask: { ...ask, variant: 'sign-letter' } }))).toBe(true);
    expect(isSignLetterAsk(makeMessage({ ask }))).toBe(false);
    expect(isSignLetterAsk(makeMessage())).toBe(false);
  });
});

describe('letterPdfOf', () => {
  it('is the PDF the message carries', () => {
    const letter = pdf();
    expect(letterPdfOf(makeMessage({ attachments: [letter] }))).toBe(letter);
  });

  it('takes the first PDF when there are several, and passes over a picture', () => {
    const first = pdf({ filename: 'a.pdf' });
    const second = pdf({ filename: 'b.pdf' });
    expect(letterPdfOf(makeMessage({ attachments: [photo(), first, second] }))).toBe(first);
  });

  it('knows a PDF by its name when the content type is missing', () => {
    const letter = pdf({ contentType: '', filename: 'LETTER.PDF' });
    expect(letterPdfOf(makeMessage({ attachments: [letter] }))).toBe(letter);
  });

  it('is null when the message carries no PDF', () => {
    expect(letterPdfOf(makeMessage({ attachments: [] }))).toBeNull();
    expect(letterPdfOf(makeMessage({ attachments: [photo()] }))).toBeNull();
    expect(
      letterPdfOf(
        makeMessage({ attachments: [pdf({ contentType: 'text/plain', filename: 'a.txt' })] }),
      ),
    ).toBeNull();
  });
});
