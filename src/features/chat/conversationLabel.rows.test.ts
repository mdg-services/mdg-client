import { describe, expect, it } from 'vitest';

import type { Conversation } from '@dk/shared/types';

import { rowPreview, tasksByConversation, ticketLine } from './conversationLabel';

describe('tasksByConversation', () => {
  it('counts the open tasks of each chat', () => {
    const counts = tasksByConversation([
      { conversationId: 'a' },
      { conversationId: 'b' },
      { conversationId: 'a' },
      {},
    ]);
    expect(counts.get('a')).toBe(2);
    expect(counts.get('b')).toBe(1);
    expect(counts.get('zzz')).toBeUndefined();
    expect(counts.size).toBe(2);
  });

  it('is empty for a feed that has not answered, or an empty one', () => {
    expect(tasksByConversation(undefined).size).toBe(0);
    expect(tasksByConversation([]).size).toBe(0);
  });
});

describe('rowPreview', () => {
  it('leaves a short line alone and flattens line breaks', () => {
    expect(rowPreview('Your report is ready')).toBe('Your report is ready');
    expect(rowPreview('line one\n\nline   two')).toBe('line one line two');
  });

  it('cuts a long reply at a WHOLE word and adds an ellipsis', () => {
    const long = 'word '.repeat(60).trim();
    const cut = rowPreview(long);
    expect(cut.endsWith('…')).toBe(true);
    expect(cut.length).toBeLessThanOrEqual(91);
    // Never half a word.
    expect(cut.replace('…', '').split(' ').every((w) => w === 'word')).toBe(true);
  });

  it('cuts shorter at large text', () => {
    const long = 'word '.repeat(60).trim();
    expect(rowPreview(long, true).length).toBeLessThan(rowPreview(long, false).length);
  });

  it('hard-cuts one long unbroken run, and drops a dangling comma before the ellipsis', () => {
    expect(rowPreview('x'.repeat(200))).toBe(`${'x'.repeat(90)}…`);
    const text = `${'a '.repeat(44)}b, ${'c'.repeat(40)}`;
    expect(rowPreview(text)).not.toMatch(/,…$/);
  });

  it('cuts Hindi at a word as well', () => {
    const hindi = 'कल की रिपोर्ट बन गई है और MDG उसे देख रहा है। '.repeat(5).trim();
    const cut = rowPreview(hindi);
    expect(cut.endsWith('…')).toBe(true);
    expect(cut.length).toBeLessThan(hindi.length);
  });
});

describe('ticketLine', () => {
  const NOW = new Date(2026, 9, 14, 15, 30);
  const iso = (h: number, m = 0) => new Date(2026, 9, 14, h, m).toISOString();
  const conv = (tickets: unknown): Pick<Conversation, 'tickets'> => ({ tickets: tickets as never });
  const open = (over: Record<string, unknown> = {}) => ({
    id: 't',
    number: 1,
    state: 'OPEN',
    seen: true,
    raisedAt: iso(10),
    ...over,
  });

  it('is null with no ticket, an undefined list, or one closed more than a day ago', () => {
    expect(ticketLine(conv(undefined), 'en', NOW)).toBeNull();
    expect(ticketLine(conv([]), 'en', NOW)).toBeNull();
    expect(
      ticketLine(conv([open({ state: 'RESOLVED', resolvedAt: new Date(2026, 9, 12).toISOString() })]), 'en', NOW),
    ).toBeNull();
  });

  it('says "looking" with an info shape for an open ticket a person has seen', () => {
    expect(ticketLine(conv([open()]), 'en', NOW)).toEqual({ text: 'We are looking at it', status: 'info' });
  });

  it('says "on it, update by" with a clock while a promise runs', () => {
    const line = ticketLine(conv([open({ promiseUntil: iso(16, 10) })]), 'en', NOW)!;
    expect(line.status).toBe('waiting');
    expect(line.text).toMatch(/^We are on it · update by /);
  });

  it('says "taking a little longer" with a triangle once the team was reminded', () => {
    const line = ticketLine(conv([open({ promiseUntil: iso(12), teamReminded: true })]), 'en', NOW)!;
    expect(line).toEqual({ text: 'Taking a little longer than we said', status: 'attention' });
  });

  it('says "Done" with a tick for a question closed in the last day', () => {
    const line = ticketLine(conv([open({ state: 'RESOLVED', resolvedAt: iso(9) })]), 'en', NOW)!;
    expect(line).toEqual({ text: 'Done ✓', status: 'ok' });
  });

  it('says it in Hindi on the Hindi screen, and in Hinglish on the Hinglish one', () => {
    expect(ticketLine(conv([open()]), 'hi', NOW)!.text).toBe('हम देख रहे हैं');
    expect(ticketLine(conv([open()]), 'hl', NOW)!.text).toBe('Hum dekh rahe hain');
  });
});
