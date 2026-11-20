/**
 * Each reader in their own language (owner, 20 Nov 2026): an English owner and a
 * Hindi manager in the same group each see MDG's card and words in theirs, and a
 * translated message offers the writer's own words with one tap.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useLangStore } from '@/store/lang';
import { makeMessage } from '@/test/utils';
import type { Attachment } from '@dk/shared/types';

import { MessageBubble } from './MessageBubble';
import { readerBody, withReaderPictures } from './readerLanguage';

afterEach(() => {
  cleanup();
  useLangStore.setState({ lang: 'en', explicit: false });
});

const card = (lang: string): Attachment => ({
  storageKey: `chat/c1/card-${lang}.png`,
  filename: `card-${lang}.png`,
  contentType: 'image/png',
  size: 10,
  kind: 'image',
});

describe('withReaderPictures', () => {
  const message = makeMessage({
    attachments: [card('hi')],
    attachmentsByLang: { hi: [card('hi')], en: [card('en')] },
  });

  it('gives the English owner the English card and the Hindi manager the Hindi one', () => {
    expect(withReaderPictures(message, 'en').attachments).toEqual([card('en')]);
    expect(withReaderPictures(message, 'hi').attachments).toEqual([card('hi')]);
  });

  it('keeps the chat language card for a reader whose language was not drawn, unchanged', () => {
    expect(withReaderPictures(message, 'hl')).toBe(message);
  });

  it('returns the same message when there is nothing to swap', () => {
    const plain = makeMessage({ attachments: [card('hi')] });
    expect(withReaderPictures(plain, 'en')).toBe(plain);
  });
});

describe('readerBody', () => {
  const translated = makeMessage({
    senderRole: 'admin',
    body: 'Aapka DSR bhej diya hai.',
    bodyLang: 'hl',
    bodyByLang: { hl: 'Aapka DSR bhej diya hai.', hi: 'आपका DSR भेज दिया है।', en: 'Your DSR has been sent.' },
  });

  it('shows each reader their own language, marked as translated', () => {
    expect(readerBody(translated, 'en')).toEqual({ text: 'Your DSR has been sent.', translated: true });
    expect(readerBody(translated, 'hi')).toEqual({ text: 'आपका DSR भेज दिया है।', translated: true });
  });

  it('shows the writer their own words, not marked', () => {
    expect(readerBody(translated, 'hl')).toEqual({ text: 'Aapka DSR bhej diya hai.', translated: false });
  });

  it('shows the original after "See original"', () => {
    expect(readerBody(translated, 'en', true)).toEqual({ text: 'Aapka DSR bhej diya hai.', translated: false });
  });

  it('never marks a notice MDG wrote in every language as translated', () => {
    const notice = makeMessage({ body: 'रिपोर्ट', bodyByLang: { hi: 'रिपोर्ट', en: 'Report', hl: 'Report' } });
    expect(readerBody(notice, 'en')).toEqual({ text: 'Report', translated: false });
  });

  it('keeps the original for a reader whose translation was dropped (a number did not survive)', () => {
    const partial = makeMessage({ body: 'Aaj 4,500 litre', bodyLang: 'hl', bodyByLang: { hl: 'Aaj 4,500 litre' } });
    expect(readerBody(partial, 'en')).toEqual({ text: 'Aaj 4,500 litre', translated: false });
  });
});

describe('the bubble', () => {
  it('labels a translation and switches to the original and back on a tap', () => {
    useLangStore.setState({ lang: 'en', explicit: false });
    render(
      <MessageBubble
        message={makeMessage({
          senderRole: 'admin',
          body: 'Aapka DSR bhej diya hai.',
          bodyLang: 'hl',
          bodyByLang: { hl: 'Aapka DSR bhej diya hai.', en: 'Your DSR has been sent.' },
        })}
        mine={false}
      />,
    );
    expect(screen.getByText('Your DSR has been sent.')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('translated-toggle'));
    expect(screen.getByText('Aapka DSR bhej diya hai.')).toBeInTheDocument();
    expect(screen.getByTestId('translated-toggle')).toHaveTextContent('Original · See translation');
    fireEvent.click(screen.getByTestId('translated-toggle'));
    expect(screen.getByText('Your DSR has been sent.')).toBeInTheDocument();
  });

  it('has no label for the writer, or on a message that was never translated', () => {
    useLangStore.setState({ lang: 'hl', explicit: false });
    render(
      <MessageBubble
        message={makeMessage({
          senderRole: 'admin',
          body: 'Aapka DSR bhej diya hai.',
          bodyLang: 'hl',
          bodyByLang: { hl: 'Aapka DSR bhej diya hai.', en: 'Your DSR has been sent.' },
        })}
        mine={false}
      />,
    );
    expect(screen.queryByTestId('translated-toggle')).toBeNull();
  });
});
