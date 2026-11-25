import { describe, expect, it } from 'vitest';

import { kItem, kView } from './kavachFixtures';
import {
  actionOf,
  actionWord,
  clockWords,
  countsOf,
  dayWords,
  lineOf,
  orderNow,
  pctOf,
  sectionsOf,
  sentBackLine,
  sentenceOf,
  sentKey,
  tabVisible,
  tagOf,
  titleOf,
  todoCount,
  whoSendsLine,
} from './kavachView';

// 25 Nov 2026, 10:00 in India (04:30 UTC).
const NOW = new Date('2026-11-25T04:30:00.000Z');
const DEVANAGARI = /[ऀ-ॿ]/;

describe('the tab', () => {
  it('shows only where Kavach is on, and counts what is to do now', () => {
    expect(tabVisible(undefined)).toBe(false);
    expect(tabVisible(kView({ on: false }))).toBe(false);
    expect(tabVisible(kView())).toBe(true);
    expect(todoCount(undefined)).toBe(0);
    expect(todoCount(kView({ on: false, now: [kItem()] }))).toBe(0);
    expect(todoCount(kView({ now: [kItem(), kItem({ checkId: 'c2' }), kItem({ checkId: 'c3' })] }))).toBe(3);
  });
});

describe('the order of "Do now"', () => {
  it('puts sent-back first, then late, then the one due soonest', () => {
    const soon = kItem({ checkId: 'soon', dueAt: '2026-11-25T08:00:00.000Z' });
    const later = kItem({ checkId: 'later', dueAt: '2026-11-25T17:00:00.000Z' });
    const late = kItem({ checkId: 'late', late: true, dueAt: '2026-11-25T03:00:00.000Z' });
    const back = kItem({
      checkId: 'back',
      state: 'sent_back',
      dueAt: '2026-11-25T17:30:00.000Z',
      sentBack: { reason: 'not_clear', note: null, at: '2026-11-25T04:00:00.000Z' },
    });
    expect(orderNow([later, soon, late, back]).map((i) => i.checkId)).toEqual(['back', 'late', 'soon', 'later']);
  });

  it('keeps the server order between equals, and leaves a point with no time last', () => {
    const a = kItem({ checkId: 'a', dueAt: null });
    const b = kItem({ checkId: 'b', dueAt: null });
    const c = kItem({ checkId: 'c' });
    expect(orderNow([a, b, c]).map((i) => i.checkId)).toEqual(['c', 'a', 'b']);
  });
});

describe('the sections', () => {
  it('moves a row the dealer just sent from "Do now" to "With MDG" at once', () => {
    const a = kItem({ checkId: 'a' });
    const b = kItem({ checkId: 'b' });
    const view = kView({ now: [a, b] });
    const s = sectionsOf(view, new Set([sentKey(a)]));
    expect(s.now.map((i) => i.checkId)).toEqual(['b']);
    expect(s.waiting.map((i) => [i.checkId, i.state])).toEqual([['a', 'sent']]);
  });

  it('lists a row once when the server already has it under "With MDG"', () => {
    const a = kItem({ checkId: 'a' });
    const view = kView({ now: [a], waiting: [kItem({ checkId: 'a', state: 'sent' })] });
    expect(sectionsOf(view, new Set([sentKey(a)])).waiting).toHaveLength(1);
  });

  it('brings a row back to "Do now" when MDG sends it back again (a new send-back is a new key)', () => {
    const first = kItem({ checkId: 'a', state: 'sent_back', sentBack: { reason: 'not_clear', note: null, at: '2026-11-25T03:00:00.000Z' } });
    const again = kItem({ checkId: 'a', state: 'sent_back', sentBack: { reason: 'wrong_page', note: null, at: '2026-11-25T09:00:00.000Z' } });
    const view = kView({ now: [again] });
    expect(sectionsOf(view, new Set([sentKey(first)])).now.map((i) => i.checkId)).toEqual(['a']);
  });
});

describe('the sentence under the ring', () => {
  it.each([
    ['en', 'Aaj', '6 to do today — 2 late'],
    ['hi', 'आज', 'आज 6 काम बाकी हैं — 2 देर से'],
    ['hl', 'Aaj', 'Aaj 6 kaam baaki hain — 2 der se'],
  ] as const)('says what is left and what is late, in %s', (lang, _w, expected) => {
    const now = [
      ...Array.from({ length: 4 }, (_, i) => kItem({ checkId: `t${i}` })),
      kItem({ checkId: 'l1', late: true }),
      kItem({ checkId: 'l2', late: true }),
    ];
    expect(sentenceOf(kView({ now }), lang)).toBe(expected);
  });

  it('leaves "late" out when nothing is late', () => {
    expect(sentenceOf(kView({ now: [kItem(), kItem({ checkId: 'x' })] }), 'en')).toBe('2 to do today');
    expect(sentenceOf(kView({ now: [kItem()] }), 'hi')).toBe('आज 1 काम बाकी हैं');
  });

  it('says it is all done, or that only MDG\'s checking is left', () => {
    expect(sentenceOf(kView({ now: [], done: [kItem({ state: 'done' })] }), 'en')).toBe('All done for today');
    expect(sentenceOf(kView({ now: [], done: [kItem({ state: 'done' })] }), 'hi')).toMatch(DEVANAGARI);
    expect(sentenceOf(kView({ now: [], waiting: [kItem({ state: 'sent' }), kItem({ state: 'sent', checkId: 'z' })] }), 'en')).toBe(
      'Nothing to do now. 2 with MDG for checking.',
    );
  });

  it('says it is getting ready when there is no score and nothing yet', () => {
    expect(sentenceOf({ ...kView({ now: [] }), summary: null }, 'en')).toBe('Your Kavach is getting ready');
  });
});

describe('the figures', () => {
  it('rounds the % and keeps it inside 0–100; null when not scored', () => {
    expect(pctOf(kView())).toBe(62);
    expect(pctOf({ ...kView(), summary: { ...kView().summary!, pct: 61.6 } })).toBe(62);
    expect(pctOf({ ...kView(), summary: { ...kView().summary!, pct: 140 } })).toBe(100);
    expect(pctOf({ ...kView(), summary: null })).toBeNull();
  });

  it('counts Done · With MDG · To do (to do is what the page lists)', () => {
    const view = kView({ now: [kItem(), kItem({ checkId: 'b' })], waiting: [kItem({ state: 'sent' })] });
    view.summary!.counts = { done: 5, sent: 1, todo: 9, late: 0, sentBack: 0 };
    expect(countsOf(view)).toEqual({ done: 5, sent: 1, todo: 2 });
    expect(countsOf({ ...view, summary: null })).toEqual({ done: 0, sent: 1, todo: 2 });
  });
});

describe('the one line under a title', () => {
  it('says when a point is due, in Indian time', () => {
    const item = kItem({ dueAt: '2026-11-25T04:30:00.000Z' }); // 10:00 IST, today
    expect(lineOf(item, 'now', 'en', NOW)).toBe('By 10:00 am');
    expect(lineOf(item, 'now', 'hi', NOW)).toBe('10:00 am तक');
    expect(lineOf(item, 'now', 'hl', NOW)).toBe('10:00 am tak');
  });

  it('says the day when it is due another day', () => {
    const item = kItem({ everyDays: 30, dueAt: '2026-12-03T10:00:00.000Z' });
    expect(lineOf(item, 'now', 'en', NOW)).toBe('By 3 Dec');
    expect(lineOf(item, 'now', 'hi', NOW)).toMatch(/3.*तक/);
  });

  it('says how late: the time for a daily point, the day for a longer one', () => {
    const daily = kItem({ late: true, dueAt: '2026-11-25T03:30:00.000Z' }); // 9:00 IST
    expect(lineOf(daily, 'now', 'en', NOW)).toBe('Late. Was due 9:00 am');
    const longer = kItem({ late: true, everyDays: 90, dueAt: '2026-11-20T10:00:00.000Z' });
    expect(lineOf(longer, 'now', 'en', NOW)).toBe('Late. Was due 20 Nov');
    expect(lineOf(kItem({ late: true, dueAt: null }), 'now', 'en', NOW)).toBe('Late');
    expect(lineOf(daily, 'now', 'hi', NOW)).toMatch(DEVANAGARI);
  });

  it('says why a photo was sent back, in plain words, with the admin\'s note', () => {
    const at = '2026-11-25T03:00:00.000Z';
    expect(sentBackLine({ reason: 'not_clear', note: null, at }, 'en')).toBe('Please send again: The photo is not clear');
    expect(sentBackLine({ reason: 'not_clear', note: null, at }, 'hi')).toBe('फिर से भेजें: फ़ोटो साफ़ नहीं है');
    expect(sentBackLine({ reason: 'wrong_page', note: 'Send the page for 24 Nov', at }, 'en')).toBe(
      'Please send again: Wrong page. MDG wrote: Send the page for 24 Nov',
    );
    expect(sentBackLine({ reason: 'numbers_differ', note: null, at }, 'hl')).toBe('Phir se bhejein: Aankde mel nahi khaate');
    expect(sentBackLine({ reason: 'not_updated', note: null, at }, 'en')).toContain('Not updated today');
    // "Something else" has no words of its own: the note is the whole reason.
    expect(sentBackLine({ reason: 'other', note: 'Cover the logo', at }, 'en')).toBe('Please send again: Cover the logo');
    expect(sentBackLine({ reason: 'other', note: null, at }, 'en')).toBe('Please send it again');
    const row = kItem({ state: 'sent_back', sentBack: { reason: 'not_clear', note: null, at } });
    expect(lineOf(row, 'now', 'en', NOW)).toContain('The photo is not clear');
  });

  it('says when a sent photo went, and when a done point stops holding', () => {
    const sent = kItem({ state: 'sent', sentAt: '2026-11-25T04:12:00.000Z' }); // 9:42 IST
    expect(lineOf(sent, 'waiting', 'en', NOW)).toBe('Sent 9:42 am');
    expect(lineOf(kItem({ state: 'sent', sentAt: '2026-11-24T04:12:00.000Z' }), 'waiting', 'en', NOW)).toBe('Sent 24 Nov');
    const done = kItem({ state: 'done', everyDays: 365, validUntil: '2027-03-12T00:00:00.000Z' });
    expect(lineOf(done, 'done', 'en', NOW)).toBe('Valid till 12 Mar');
    expect(lineOf(done, 'done', 'hi', NOW)).toMatch(/12.*मान्य/);
    expect(lineOf(kItem({ state: 'done', validUntil: null }), 'done', 'en', NOW)).toBe('Done today');
  });

  it('says what our data says for a data point, in the reader\'s language, or a plain default', () => {
    const data = kItem({ how: 'data', dataEn: 'No DSR for 24 Nov yet', dataHi: '24 नवंबर का DSR अभी नहीं आया', canSend: false });
    expect(lineOf(data, 'now', 'en', NOW)).toBe('No DSR for 24 Nov yet');
    expect(lineOf(data, 'now', 'hi', NOW)).toBe('24 नवंबर का DSR अभी नहीं आया');
    expect(lineOf(kItem({ how: 'data' }), 'now', 'en', NOW)).toBe('MDG checks this from your reports');
  });

  it('says when a coming-up point opens, and what a when-it-happens point is for', () => {
    const up = kItem({ opensAt: '2026-12-10T00:00:00.000Z', state: 'todo' });
    expect(lineOf(up, 'upcoming', 'en', NOW)).toBe('Opens 10 Dec');
    expect(lineOf(kItem({ everyDays: null }), 'events', 'en', NOW)).toBe('Send a photo when it happens');
    expect(lineOf(kItem({ everyDays: null }), 'events', 'hi', NOW)).toMatch(DEVANAGARI);
  });
});

describe('who sends it', () => {
  it('says so when this member cannot send the point, and says nothing when they can', () => {
    const owner = kItem({ uploader: 'owner', canSend: false });
    expect(whoSendsLine(owner, 'en')).toBe('Owner sends this');
    expect(whoSendsLine(owner, 'hi')).toBe('मालिक भेजेंगे');
    expect(whoSendsLine(owner, 'hl')).toBe('Malik bhejenge');
    expect(whoSendsLine(kItem({ uploader: 'manager', canSend: false }), 'en')).toBe('Manager sends this');
    expect(whoSendsLine(kItem({ uploader: 'owner', canSend: true }), 'en')).toBeNull();
    // A data point is nobody's to send.
    expect(whoSendsLine(kItem({ how: 'data', canSend: false }), 'en')).toBeNull();
  });

  it('never says "Sir"', () => {
    for (const lang of ['en', 'hi', 'hl'] as const) {
      expect(whoSendsLine(kItem({ uploader: 'owner', canSend: false }), lang)).not.toMatch(/\bsir\b|सर/i);
    }
  });
});

describe('the main action', () => {
  it('is Take photo for a photo point, and Open sheet for a sheet point', () => {
    expect(actionOf(kItem(), 'now')).toBe('photo');
    expect(actionOf(kItem({ how: 'sheet', sheet: 'dsr-book' }), 'now')).toBe('sheet');
    expect(actionWord(kItem(), 'photo', 'en')).toBe('Take photo');
    expect(actionWord(kItem({ how: 'sheet' }), 'sheet', 'en')).toBe('Open sheet');
    expect(actionWord(kItem(), 'photo', 'hi')).toBe('फ़ोटो लें');
  });

  it('asks for the photo again on a sent-back row', () => {
    expect(actionWord(kItem({ state: 'sent_back' }), 'photo', 'en')).toBe('Send again');
  });

  it('is none for a data point, for a member who cannot send it, and for a row already with MDG', () => {
    expect(actionOf(kItem({ how: 'data', canSend: false }), 'now')).toBeNull();
    expect(actionOf(kItem({ canSend: false }), 'now')).toBeNull();
    expect(actionOf(kItem({ state: 'sent' }), 'waiting')).toBeNull();
    expect(actionOf(kItem({ state: 'done' }), 'done')).toBeNull();
    expect(actionOf(kItem({ checkId: null }), 'upcoming')).toBeNull();
  });

  it('is Send photo for a when-it-happens point', () => {
    const event = kItem({ checkId: null, everyDays: null });
    expect(actionOf(event, 'events')).toBe('event');
    expect(actionWord(event, 'event', 'en')).toBe('Send photo');
  });
});

describe('the tag: a shape and a word, never colour alone', () => {
  it('gives each state its own shape and word', () => {
    expect(tagOf(kItem(), 'now', 'en')).toEqual({ status: 'info', word: 'To do' });
    expect(tagOf(kItem({ late: true }), 'now', 'en')).toEqual({ status: 'problem', word: 'Late' });
    expect(tagOf(kItem({ state: 'sent_back' }), 'now', 'en')).toEqual({ status: 'attention', word: 'Send again' });
    expect(tagOf(kItem({ state: 'sent' }), 'waiting', 'en')).toEqual({ status: 'waiting', word: 'With MDG' });
    expect(tagOf(kItem({ state: 'done' }), 'done', 'en')).toEqual({ status: 'ok', word: 'Done' });
    expect(tagOf(kItem(), 'upcoming', 'en')).toEqual({ status: 'info', word: 'Coming up' });
    expect(tagOf(kItem(), 'events', 'en')).toBeNull();
    expect(tagOf(kItem({ late: true }), 'now', 'hi')!.word).toMatch(DEVANAGARI);
  });
});

describe('the words of a title', () => {
  it('reads the title in the reader\'s language; Hinglish reads the English', () => {
    const item = kItem();
    expect(titleOf(item, 'en')).toBe('Forecourt photo');
    expect(titleOf(item, 'hi')).toBe('फोरकोर्ट की फ़ोटो');
    expect(titleOf(item, 'hl')).toBe('Forecourt photo');
  });
});

describe('dates and clocks', () => {
  it('are in Indian time, with Latin digits for the clock', () => {
    expect(clockWords('2026-11-25T04:12:00.000Z')).toBe('9:42 am');
    expect(clockWords('2026-11-25T18:29:00.000Z')).toBe('11:59 pm');
    expect(dayWords('2026-11-25T19:00:00.000Z', 'en')).toBe('26 Nov');
  });
});
