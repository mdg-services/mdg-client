import { describe, expect, it } from 'vitest';

import type { MessageReplyContext } from '@dk/shared/types';

import { replySenderLabel, senderDisplayName } from './replyContext';

const t = ((key: string) =>
  ({ 'chat.you': 'आप', 'chat.supportFallbackName': 'MDG सहायता' })[key] ?? key) as Parameters<
  typeof replySenderLabel
>[2];

const quote = (over: Partial<MessageReplyContext>): MessageReplyContext => ({
  messageId: 'm1',
  senderId: 'u1',
  ...over,
});

describe('the name on a quoted message', () => {
  it('is "you" for your own message', () => {
    expect(replySenderLabel(quote({ senderId: 'me', senderName: 'Ramesh' }), 'me', t)).toBe('आप');
  });

  it('is MDG, in the dealer’s words, for the server’s own asks and notices — never "MDG System"', () => {
    expect(replySenderLabel(quote({ senderName: 'MDG System' }), 'me', t)).toBe('MDG सहायता');
    expect(replySenderLabel(quote({}), 'me', t)).toBe('MDG सहायता');
  });

  it('is the person’s own name otherwise', () => {
    expect(replySenderLabel(quote({ senderName: 'Sunita (MDG)' }), 'me', t)).toBe('Sunita (MDG)');
  });
});

describe('the name on a gallery item', () => {
  it('follows the same rules as a quote: you, MDG for the system, otherwise the name', () => {
    expect(senderDisplayName({ senderId: 'me', senderName: 'Ramesh' }, 'me', t)).toBe('आप');
    expect(senderDisplayName({ senderId: 'sys', senderName: 'MDG System' }, 'me', t)).toBe(
      'MDG सहायता',
    );
    expect(senderDisplayName({ senderId: 'sys' }, 'me', t)).toBe('MDG सहायता');
    expect(senderDisplayName({ senderId: 'u9', senderName: 'MDG team' }, 'me', t)).toBe('MDG team');
  });
});
