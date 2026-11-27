import { describe, expect, it } from 'vitest';

import { kavachNeedCount, kavachNeeds } from '@/features/glance/needsMe';
import { translate } from '@/lib/i18n';
import { useAuthStore } from '@/store/auth';


import { kItem, kView } from './kavachFixtures';
import {
  actionOf,
  actionWord,
  clockWords,
  countsOfSections,
  countsOutOfStep,
  dailyJobsOf,
  dayWords,
  isLoud,
  isMine,
  isNeed,
  kavachRoleOf,
  leftWords,
  lineOf,
  nextJobAt,
  orderNow,
  pctOf,
  pointsOf,
  readerCountsOf,
  scoreCountsOf,
  scoreStatusOf,
  sectionsOf,
  sentBackLine,
  sentByOf,
  sentenceOf,
  sentKey,
  sheetOf,
  tabVisible,
  tagOf,
  titleOf,
  todayOf,
  todoCount,
  whoSendsLine,
  worthOf,
} from './kavachView';

// 25 Nov 2026, 10:00 in India (04:30 UTC).
const NOW = new Date('2026-11-25T04:30:00.000Z');
const DEVANAGARI = /[ऀ-ॿ]/;
const sentBackAt = (reason: 'not_clear' | 'wrong_page' | 'numbers_differ' | 'not_updated' | 'other' = 'not_clear') => ({
  reason,
  note: null,
  at: '2026-11-25T03:00:00.000Z',
});
const ownerRow = (over = {}) => kItem({ checkId: 'o1', code: 'o1', uploader: 'owner', everyDays: 365, dueAt: '2026-11-26T11:00:00.000Z', ...over });
const managerRow = (over = {}) => kItem({ checkId: 'm1', code: 'm1', uploader: 'manager', ...over });

describe('the door in the bar', () => {
  it('shows only where Kavach is on, and counts what is to do now', () => {
    expect(tabVisible(undefined)).toBe(false);
    expect(tabVisible(kView({ on: false }))).toBe(false);
    expect(tabVisible(kView())).toBe(true);
    expect(todoCount(undefined)).toBe(0);
    expect(todoCount(kView({ on: false, now: [kItem()] }))).toBe(0);
    expect(todoCount(kView({ now: [kItem(), kItem({ checkId: 'c2' }), kItem({ checkId: 'c3' })] }))).toBe(3);
  });

  it('counts, for an owner, only the owner\'s own jobs when told the role (the manager\'s daily work is not his)', () => {
    const view = kView({ now: [managerRow(), managerRow({ checkId: 'm2' }), ownerRow({ everyDays: 1 }), kItem({ checkId: 'e1', code: 'e1', uploader: 'either' })] });
    expect(todoCount(view, NOW)).toBe(4); // no role given: every point the member may send, as before
    expect(todoCount(view, NOW, 'dealer-owner')).toBe(2);
    // What the server sends a manager: the owner's own point is not his to send.
    const forManager = kView({ now: view.now.map((i) => (i.uploader === 'owner' ? { ...i, canSend: false } : i)) });
    expect(todoCount(forManager, NOW, 'dealer-staff')).toBe(3); // the manager's two and the "either" one
    expect(todayOf(view, NOW, 'dealer-owner').map((i) => i.code)).toEqual(['o1', 'e1']);
  });
});

describe('whose job a point is', () => {
  it('is nobody\'s for a data point, and the owner\'s or the manager\'s by who sends it', () => {
    expect(isMine(kItem({ how: 'data', canSend: false }), 'dealer-owner')).toBe(false);
    expect(isMine(managerRow(), 'dealer-owner')).toBe(false);
    expect(isMine(managerRow(), 'dealer-staff')).toBe(true);
    expect(isMine(ownerRow({ canSend: true }), 'dealer-owner')).toBe(true);
    expect(isMine(ownerRow({ canSend: false }), 'dealer-staff')).toBe(false);
    expect(isMine(kItem({ uploader: 'either' }), 'dealer-owner')).toBe(true);
    expect(isMine(kItem({ uploader: 'either' }), 'dealer-staff')).toBe(true);
    // No role known: the old answer, "can this member send it".
    expect(isMine(managerRow())).toBe(true);
    expect(isMine(kItem({ canSend: false }))).toBe(false);
  });
});

describe('the order of the open rows', () => {
  it('puts sent-back first, then late, then the one due soonest', () => {
    const soon = kItem({ checkId: 'soon', dueAt: '2026-11-25T08:00:00.000Z' });
    const later = kItem({ checkId: 'later', dueAt: '2026-11-25T17:00:00.000Z' });
    const late = kItem({ checkId: 'late', late: true, dueAt: '2026-11-25T03:00:00.000Z' });
    const back = kItem({ checkId: 'back', state: 'sent_back', dueAt: '2026-11-25T17:30:00.000Z', sentBack: sentBackAt() });
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
  it('pulls sent-back and late rows out of the long list into Needs you', () => {
    const back = kItem({ checkId: 'back', code: 'back', state: 'sent_back', sentBack: sentBackAt() });
    const late = kItem({ checkId: 'late', code: 'late', late: true });
    const plain = kItem({ checkId: 'plain', code: 'plain' });
    const s = sectionsOf(kView({ now: [plain, late, back] }), new Set(), NOW);
    expect(s.needs.map((i) => i.code)).toEqual(['back', 'late']);
    expect(s.now.map((i) => i.code)).toEqual(['plain']);
  });

  it('puts a longer point due on a later day in This week, and one due today in Do today', () => {
    const week = kItem({ checkId: 'wk', code: 'wk', everyDays: 15, dueAt: '2026-12-01T10:00:00.000Z' });
    const today = kItem({ checkId: 'td', code: 'td', everyDays: 15, dueAt: '2026-11-25T12:00:00.000Z' });
    const s = sectionsOf(kView({ now: [week, today] }), new Set(), NOW);
    expect(s.now.map((i) => i.code)).toEqual(['td']);
    expect(s.week.map((i) => i.code)).toEqual(['wk']);
  });

  it('keeps MDG\'s data points and the other member\'s points out of the reader\'s lists', () => {
    const data = kItem({ checkId: 'dt', code: 'dt', how: 'data', canSend: false });
    const owner = ownerRow({ canSend: false });
    const s = sectionsOf(kView({ now: [kItem(), data, owner] }), new Set(), NOW, { role: 'dealer-staff' });
    expect(s.data.map((i) => i.code)).toEqual(['dt']);
    expect(s.others.map((i) => i.code)).toEqual(['o1']);
    expect(s.now.map((i) => i.code)).toEqual(['forecourt-photo']);
  });

  it('gives an owner the manager\'s daily work as the manager\'s, not his own', () => {
    const view = kView({ now: [managerRow(), managerRow({ checkId: 'm2', code: 'm2', late: true }), kItem({ checkId: 'e1', code: 'e1', uploader: 'either' })] });
    const owner = sectionsOf(view, new Set(), NOW, { role: 'dealer-owner' });
    expect(owner.now.map((i) => i.code)).toEqual(['e1']);
    expect(owner.needs).toEqual([]);
    expect(owner.others.map((i) => i.code)).toEqual(['m2', 'm1']); // late first
    const manager = sectionsOf(view, new Set(), NOW, { role: 'dealer-staff' });
    expect(manager.others).toEqual([]);
    expect(manager.needs.map((i) => i.code)).toEqual(['m2']);
    expect(manager.now.map((i) => i.code)).toEqual(['m1', 'e1']);
  });

  it('moves a row the dealer just sent from the to-do lists to With MDG at once', () => {
    const a = kItem({ checkId: 'a' });
    const b = kItem({ checkId: 'b' });
    const s = sectionsOf(kView({ now: [a, b] }), new Set([sentKey(a)]), NOW);
    expect(s.now.map((i) => i.checkId)).toEqual(['b']);
    expect(s.waiting.map((i) => [i.checkId, i.state])).toEqual([['a', 'sent']]);
  });

  it('lists a row once when the server already has it under With MDG', () => {
    const a = kItem({ checkId: 'a' });
    const view = kView({ now: [a], waiting: [kItem({ checkId: 'a', state: 'sent' })] });
    expect(sectionsOf(view, new Set([sentKey(a)]), NOW).waiting).toHaveLength(1);
  });

  it('brings a row back to Needs you when MDG sends it back again (a new send-back is a new key)', () => {
    const first = kItem({ checkId: 'a', state: 'sent_back', sentBack: sentBackAt('not_clear') });
    const again = kItem({ checkId: 'a', state: 'sent_back', sentBack: { ...sentBackAt('wrong_page'), at: '2026-11-25T09:00:00.000Z' } });
    expect(sectionsOf(kView({ now: [again] }), new Set([sentKey(first)]), NOW).needs.map((i) => i.checkId)).toEqual(['a']);
  });
});

describe('a photo sent for a when-it-happens point (it used to vanish)', () => {
  const sentEvent = (over = {}) => kItem({ checkId: 'ev1', code: 'decantation', everyDays: null, state: 'sent', dueAt: null, sentAt: '2026-11-25T04:12:00.000Z', ...over });

  it('stays under With MDG after the three seconds are over', () => {
    const s = sectionsOf(kView({ now: [], events: [kItem({ checkId: null, code: 'decantation', everyDays: null })] }), new Set(), NOW, { events: [sentEvent()] });
    expect(s.waiting.map((i) => [i.code, i.state])).toEqual([['decantation', 'sent']]);
    // The point itself stays in When it happens, ready for the next one.
    expect(s.events.map((i) => i.code)).toEqual(['decantation']);
  });

  it('comes back to Needs you when MDG sends it back, with the reason', () => {
    const back = sentEvent({ state: 'sent_back', sentBack: sentBackAt('not_clear') });
    const s = sectionsOf(kView({ now: [] }), new Set(), NOW, { events: [back] });
    expect(s.needs.map((i) => i.code)).toEqual(['decantation']);
    expect(lineOf(s.needs[0]!, 'needs', 'en', NOW)).toBe('Please send again: The photo is not clear');
    expect(actionOf(s.needs[0]!, 'needs')).toBe('photo');
  });

  it('shows under Done when MDG accepted it', () => {
    const s = sectionsOf(kView({ now: [] }), new Set(), NOW, { events: [sentEvent({ state: 'done' })] });
    expect(s.done.map((i) => i.code)).toEqual(['decantation']);
  });

  it('is dropped when the server lists the same check itself (the server wins)', () => {
    const view = kView({ now: [], waiting: [sentEvent()] });
    const s = sectionsOf(view, new Set(), NOW, { events: [sentEvent()] });
    expect(s.waiting).toHaveLength(1);
  });
});

describe('the counts under the ring', () => {
  it('are, on the Today tile, the outlet\'s: from the server, and a job is never counted twice', () => {
    const now = [
      kItem({ checkId: 'sb1', state: 'sent_back', sentBack: sentBackAt() }),
      kItem({ checkId: 'sb2', state: 'sent_back', sentBack: sentBackAt() }),
      kItem({ checkId: 'l1', late: true }),
      ...Array.from({ length: 9 }, (_, i) => kItem({ checkId: `t${i}`, code: `t${i}` })),
    ];
    const view = kView({ now });
    view.summary!.counts = { done: 5, sent: 0, todo: 12, late: 1, sentBack: 2 };
    expect(scoreCountsOf(view, new Set(), NOW)).toEqual({ sentBack: 2, late: 1, todo: 9 });
  });

  it('are, on the Kavach page, the reader\'s own lists counted once: a job is never counted under two words, and to do today is Needs you plus Do today', () => {
    const now = [
      kItem({ checkId: 'sb1', state: 'sent_back', sentBack: sentBackAt() }),
      // Late AND sent back: one job, counted as sent back only.
      kItem({ checkId: 'sb2', state: 'sent_back', late: true, sentBack: sentBackAt() }),
      kItem({ checkId: 'l1', late: true }),
      ...Array.from({ length: 9 }, (_, i) => kItem({ checkId: `t${i}`, code: `t${i}` })),
    ];
    const view = kView({ now });
    view.summary!.counts = { done: 5, sent: 0, todo: 12, late: 2, sentBack: 2 };
    expect(readerCountsOf(view, new Set(), NOW)).toEqual({ sentBack: 2, late: 1, todo: 12 });
  });

  it('agree with the lists the page draws and with the badge in the bar, for the owner, the manager and the week', () => {
    const view = kView({
      now: [
        managerRow({ checkId: 'ml', code: 'ml', late: true }), // the manager's late job: not the owner's count
        ownerRow({ everyDays: 1, checkId: 'od', code: 'od' }),
        kItem({ checkId: 'wk', code: 'wk', uploader: 'either', everyDays: 30, dueAt: '2026-12-02T11:00:00.000Z' }), // later this week
        kItem({ checkId: 'sb', code: 'sb', uploader: 'owner', state: 'sent_back', sentBack: sentBackAt() }),
      ],
    });
    view.summary!.counts = { done: 0, sent: 0, todo: 4, late: 1, sentBack: 1 };
    const sections = sectionsOf(view, new Set(), NOW, { role: 'dealer-owner' });
    const counts = countsOfSections(sections);
    expect(counts).toEqual({ sentBack: 1, late: 0, todo: 2 });
    expect(counts.todo).toBe(sections.needs.length + sections.now.length);
    expect(counts.todo).toBe(todoCount(view, NOW, 'dealer-owner'));
    // The week's job is in neither the count nor the sentence's "today".
    expect(sentenceOf(view, sections, 'en')).toBe('1 job needs you first');
    const quiet = kView({ now: [view.now[2]!] });
    const quietSections = sectionsOf(quiet, new Set(), NOW, { role: 'dealer-owner' });
    expect(countsOfSections(quietSections).todo).toBe(0);
    expect(sentenceOf(quiet, quietSections, 'en')).toBe("Today's work is done. 1 more job this week.");
  });

  it('default the bar\'s role to the signed-in reader\'s', () => {
    const view = kView({ now: [managerRow(), ownerRow({ everyDays: 1 })] });
    useAuthStore.setState({ user: { role: 'dealer-owner' } as never });
    try {
      expect(todoCount(view, NOW)).toBe(1);
    } finally {
      useAuthStore.setState({ user: null });
    }
    expect(todoCount(view, NOW)).toBe(2);
  });

  it('notice when the server counts a send-back or a late job that no list shows (half-updated), but not just after a send', () => {
    const view = kView({ now: [kItem()] });
    view.summary!.counts = { done: 0, sent: 0, todo: 1, late: 0, sentBack: 1 };
    const sections = sectionsOf(view, new Set(), NOW);
    expect(countsOutOfStep(view, sections)).toBe(true);
    expect(countsOutOfStep(view, sections, new Set(['x']))).toBe(false);
    view.summary!.counts = { done: 0, sent: 0, todo: 1, late: 0, sentBack: 0 };
    expect(countsOutOfStep(view, sections)).toBe(false);
    // A late job in the other member's list is shown (folded), so the lists are not out of step.
    const mine = kView({ now: [managerRow({ late: true })] });
    mine.summary!.counts = { done: 0, sent: 0, todo: 1, late: 1, sentBack: 0 };
    expect(countsOutOfStep(mine, sectionsOf(mine, new Set(), NOW, { role: 'dealer-owner' }))).toBe(false);
    expect(countsOutOfStep({ ...view, summary: null }, sections)).toBe(false);
  });

  it('drop a job the dealer has just sent, before the server\'s answer comes back', () => {
    const a = kItem({ checkId: 'a', late: true });
    const b = kItem({ checkId: 'b' });
    const view = kView({ now: [a, b] });
    view.summary!.counts = { done: 0, sent: 0, todo: 2, late: 1, sentBack: 0 };
    expect(scoreCountsOf(view, new Set([sentKey(a)]), NOW)).toEqual({ sentBack: 0, late: 0, todo: 1 });
  });

  it('read the lists when the server has not scored the outlet, and add a remembered send-back', () => {
    const view = { ...kView({ now: [kItem({ late: true }), kItem({ checkId: 'x' })] }), summary: null };
    const back = kItem({ checkId: 'ev', state: 'sent_back', sentBack: sentBackAt(), everyDays: null });
    expect(scoreCountsOf(view, new Set(), NOW, [back])).toEqual({ sentBack: 1, late: 1, todo: 1 });
    expect(readerCountsOf(view, new Set(), NOW, [back])).toEqual({ sentBack: 1, late: 1, todo: 3 });
  });

  it('leave MDG\'s data points out', () => {
    const view = kView({ now: [kItem({ how: 'data', canSend: false, late: true })] });
    view.summary!.counts = { done: 0, sent: 0, todo: 1, late: 0, sentBack: 0 };
    expect(scoreCountsOf(view, new Set(), NOW).todo).toBe(0);
  });

  it('give the card a shape for what it is about, never a claim that all is fine', () => {
    const view = kView();
    expect(scoreStatusOf(view, { sentBack: 1, late: 0, todo: 0 })).toBe('attention');
    expect(scoreStatusOf(view, { sentBack: 0, late: 2, todo: 3 })).toBe('attention');
    expect(scoreStatusOf(view, { sentBack: 0, late: 0, todo: 3 })).toBe('waiting');
    expect(scoreStatusOf(view, { sentBack: 0, late: 0, todo: 0 })).toBe('ok');
    expect(scoreStatusOf({ ...view, summary: null }, { sentBack: 0, late: 0, todo: 0 })).toBe('info');
  });
});

describe('the figures', () => {
  it('rounds the % and keeps it inside 0–100; null when not scored', () => {
    expect(pctOf(kView())).toBe(62);
    expect(pctOf({ ...kView(), summary: { ...kView().summary!, pct: 61.6 } })).toBe(62);
    expect(pctOf({ ...kView(), summary: { ...kView().summary!, pct: 140 } })).toBe(100);
    expect(pctOf({ ...kView(), summary: null })).toBeNull();
  });

  it('gives the points behind the ring from the server, never recomputed', () => {
    const view = kView();
    view.summary!.donePoints = 2320;
    view.summary!.totalPoints = 3740;
    expect(pointsOf(view)).toEqual({ done: 2320, total: 3740 });
    expect(pointsOf({ ...view, summary: null })).toBeNull();
    expect(pointsOf({ ...view, summary: { ...view.summary!, totalPoints: 0 } })).toBeNull();
  });
});

describe('the sentence on the score card', () => {
  const say = (view: ReturnType<typeof kView>, lang: 'en' | 'hi' | 'hl' = 'en') => sentenceOf(view, sectionsOf(view, new Set(), NOW), lang);

  it('says what needs the reader first, with the number', () => {
    const view = kView({ now: [kItem({ late: true }), kItem({ checkId: 'x' })] });
    expect(say(view)).toBe('1 job needs you first');
    const two = kView({ now: [kItem({ late: true }), kItem({ checkId: 'x', late: true }), kItem({ checkId: 'y' })] });
    expect(say(two)).toBe('2 jobs need you first');
    expect(say(two, 'hi')).toBe('पहले 2 काम आपका इंतज़ार कर रहे हैं');
    expect(say(two, 'hl')).toBe('Pehle 2 kaam aapka intezaar kar rahe hain');
  });

  it('then says what is left today, then this week', () => {
    expect(say(kView({ now: [kItem()] }))).toBe('1 job to do today');
    expect(say(kView({ now: [kItem(), kItem({ checkId: 'b' })] }))).toBe('2 jobs to do today');
    expect(say(kView({ now: [kItem()] }), 'hi')).toBe('आज 1 काम बाकी है');
    const later = kItem({ everyDays: 15, dueAt: '2026-12-02T10:00:00.000Z' });
    expect(say(kView({ now: [later] }))).toBe("Today's work is done. 1 more job this week.");
  });

  it('says it is all done, or that only MDG\'s checking is left', () => {
    expect(say(kView({ now: [], done: [kItem({ state: 'done' })] }))).toBe('All done for today');
    expect(say(kView({ now: [], done: [kItem({ state: 'done' })] }), 'hi')).toMatch(DEVANAGARI);
    expect(say(kView({ now: [], waiting: [kItem({ state: 'sent' }), kItem({ state: 'sent', checkId: 'z' })] }))).toBe(
      'Nothing to do now. 2 jobs are with MDG for checking.',
    );
  });

  it('says it is getting ready when there is no score and nothing yet', () => {
    expect(say({ ...kView({ now: [] }), summary: null })).toBe('Your Kavach is getting ready');
  });
});

describe('today\'s jobs', () => {
  const daily = (over = {}) => kItem({ everyDays: 1, ...over });

  it('counts done, with MDG and to do across the lists, and leaves MDG\'s data points out', () => {
    const view = kView({
      now: [daily({ checkId: 'n1' }), daily({ checkId: 'n2' }), daily({ checkId: 'd', how: 'data', canSend: false }), kItem({ checkId: 'lng', everyDays: 30 })],
      waiting: [daily({ checkId: 'w1', state: 'sent' })],
      done: [daily({ checkId: 'x1', state: 'done' }), daily({ checkId: 'x2', state: 'done' }), kItem({ checkId: 'x3', state: 'done', everyDays: 90 })],
    });
    const jobs = dailyJobsOf(view, new Set(), NOW)!;
    expect(jobs).toMatchObject({ total: 5, done: 2, withMdg: 1 });
  });

  it('counts a photo just sent as with MDG, not done', () => {
    const a = daily({ checkId: 'a' });
    const jobs = dailyJobsOf(kView({ now: [a, daily({ checkId: 'b' })] }), new Set([sentKey(a)]), NOW)!;
    expect(jobs).toMatchObject({ total: 2, done: 0, withMdg: 1 });
  });

  it('names the next deadline still ahead, this reader\'s own, never a late job', () => {
    const view = kView({
      now: [
        daily({ checkId: 'late', late: true, dueAt: '2026-11-25T03:00:00.000Z' }),
        daily({ checkId: 'later', code: 'later', uploader: 'either', dueAt: '2026-11-25T12:30:00.000Z' }),
        daily({ checkId: 'soon', code: 'soon', uploader: 'either', dueAt: '2026-11-25T05:50:00.000Z' }),
        daily({ checkId: 'mgr', code: 'mgr', uploader: 'manager', dueAt: '2026-11-25T04:45:00.000Z' }),
      ],
    });
    expect(dailyJobsOf(view, new Set(), NOW, 'dealer-owner')!.next?.code).toBe('soon');
    expect(dailyJobsOf(view, new Set(), NOW, 'dealer-staff')!.next?.code).toBe('mgr');
  });

  it('also names a job that is not daily when it falls due later today, and none that is a week away', () => {
    const view = kView({
      now: [
        daily({ checkId: 'd', code: 'd', late: true, dueAt: '2026-11-25T03:00:00.000Z' }),
        kItem({ checkId: 'p', code: 'p', everyDays: 7, uploader: 'either', dueAt: '2026-11-25T10:00:00.000Z' }),
        kItem({ checkId: 'w', code: 'w', everyDays: 30, uploader: 'either', dueAt: '2026-11-30T10:00:00.000Z' }),
      ],
    });
    expect(dailyJobsOf(view, new Set(), NOW)!.next?.code).toBe('p');
    expect(dailyJobsOf(kView({ now: [daily({ late: true }), kItem({ checkId: 'w', everyDays: 30, dueAt: '2026-11-30T10:00:00.000Z' })] }), new Set(), NOW)!.next).toBeNull();
  });

  it('is null when the pump has no daily job', () => {
    expect(dailyJobsOf(kView({ now: [kItem({ everyDays: 30 })] }), new Set(), NOW)).toBeNull();
  });

  it('says how long is left, in words', () => {
    expect(leftWords('2026-11-25T05:50:00.000Z', NOW, 'en')).toBe('1 h 20 min left');
    expect(leftWords('2026-11-25T05:30:00.000Z', NOW, 'en')).toBe('1 h left');
    expect(leftWords('2026-11-25T04:45:00.000Z', NOW, 'en')).toBe('15 min left');
    expect(leftWords('2026-11-25T04:30:20.000Z', NOW, 'en')).toBe('less than a minute left');
    expect(leftWords('2026-11-25T05:50:00.000Z', NOW, 'hi')).toBe('1 घंटे 20 मिनट बाकी');
    expect(leftWords('2026-11-25T05:50:00.000Z', NOW, 'hl')).toBe('1 ghante 20 minute baaki');
  });

  it('finds the next job date from what is still to come', () => {
    const week = kItem({ dueAt: '2026-12-03T10:00:00.000Z' });
    const up = kItem({ checkId: null, opensAt: '2026-12-01T00:00:00.000Z' });
    expect(nextJobAt({ week: [week], upcoming: [up], others: [] })).toBe('2026-12-01T00:00:00.000Z');
    expect(nextJobAt({ week: [], upcoming: [], others: [] })).toBeNull();
  });
});

describe('the one line under a title', () => {
  it('says when a point is due and how long is left, in Indian time', () => {
    const item = kItem({ dueAt: '2026-11-25T11:00:00.000Z' }); // 4:30 pm IST, today
    expect(lineOf(item, 'now', 'en', NOW)).toBe('By 4:30 pm, 6 h 30 min left');
    expect(lineOf(item, 'now', 'hi', NOW)).toBe('शाम 4:30 तक, 6 घंटे 30 मिनट बाकी');
    expect(lineOf(item, 'now', 'hl', NOW)).toBe('shaam 4:30 tak, 6 ghante 30 minute baaki');
  });

  it('says the time alone when it was due earlier today but is not yet late', () => {
    expect(lineOf(kItem({ dueAt: '2026-11-25T04:00:00.000Z' }), 'now', 'en', NOW)).toBe('By 9:30 am');
  });

  it('says the day when it is due another day', () => {
    const item = kItem({ everyDays: 30, dueAt: '2026-12-03T10:00:00.000Z' });
    expect(lineOf(item, 'week', 'en', NOW)).toBe('By Thu 3 Dec');
    expect(lineOf(item, 'week', 'hi', NOW)).toBe('गुरु 3 दिसंबर तक');
  });

  it('says how late: the time for a daily point, the day for a longer one', () => {
    const daily = kItem({ late: true, dueAt: '2026-11-25T03:30:00.000Z' }); // 9:00 IST
    expect(lineOf(daily, 'needs', 'en', NOW)).toBe('Late. Was due 9:00 am');
    const longer = kItem({ late: true, everyDays: 90, dueAt: '2026-11-20T10:00:00.000Z' });
    expect(lineOf(longer, 'needs', 'en', NOW)).toBe('Late. Was due Fri 20 Nov');
    expect(lineOf(kItem({ late: true, dueAt: null }), 'needs', 'en', NOW)).toBe('Late');
    expect(lineOf(daily, 'needs', 'hi', NOW)).toMatch(DEVANAGARI);
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
    expect(lineOf(row, 'needs', 'en', NOW)).toContain('The photo is not clear');
  });

  it('says when a sent photo went, who sent it when the server says, and when a done point stops holding', () => {
    const sent = kItem({ state: 'sent', sentAt: '2026-11-25T04:12:00.000Z' }); // 9:42 IST
    expect(lineOf(sent, 'waiting', 'en', NOW)).toBe('Sent 9:42 am');
    expect(lineOf({ ...sent, sentByName: 'Ramesh' } as typeof sent, 'waiting', 'en', NOW)).toBe('Sent 9:42 am by Ramesh');
    expect(lineOf({ ...sent, sentByName: 'Ramesh' } as typeof sent, 'waiting', 'hi', NOW)).toBe('Ramesh ने सुबह 9:42 पर भेजा');
    expect(lineOf(kItem({ state: 'sent', sentAt: '2026-11-24T04:12:00.000Z' }), 'waiting', 'en', NOW)).toBe('Sent yesterday');
    const done = kItem({ state: 'done', everyDays: 365, validUntil: '2027-03-12T00:00:00.000Z' });
    expect(lineOf(done, 'done', 'en', NOW)).toBe('Valid till Fri 12 Mar');
    expect(lineOf(done, 'done', 'hi', NOW)).toMatch(/12.*मान्य/);
    expect(lineOf(kItem({ state: 'done', validUntil: null }), 'done', 'en', NOW)).toBe('Done today');
  });

  it('says what our data says for a data point, in the reader\'s language, or a plain default; and keeps the words once it is done', () => {
    const data = kItem({ how: 'data', dataEn: 'No DSR for 24 Nov yet', dataHi: '24 नवंबर का DSR अभी नहीं आया', canSend: false });
    expect(lineOf(data, 'data', 'en', NOW)).toBe('No DSR for 24 Nov yet');
    expect(lineOf(data, 'data', 'hi', NOW)).toBe('24 नवंबर का DSR अभी नहीं आया');
    expect(lineOf(kItem({ how: 'data' }), 'data', 'en', NOW)).toBe('MDG checks this from your reports');
    const done = kItem({ how: 'data', state: 'done', dataEn: 'DSR of 24 Nov: all variations within limit', dataHi: '24 नवंबर का DSR: सब सीमा के अंदर', canSend: false });
    expect(lineOf(done, 'done', 'en', NOW)).toBe('DSR of 24 Nov: all variations within limit');
    expect(lineOf({ ...done, dataEn: null, dataHi: null }, 'done', 'en', NOW)).toBe('MDG checked this from your reports');
  });

  it('says when a coming-up point opens, and what a when-it-happens point is for', () => {
    const up = kItem({ opensAt: '2026-12-10T00:00:00.000Z', state: 'todo' });
    expect(lineOf(up, 'upcoming', 'en', NOW)).toBe('Opens Thu 10 Dec');
    // The sentence is said once under the section heading, not on every row.
    expect(lineOf(kItem({ everyDays: null }), 'events', 'en', NOW)).toBe('');
    expect(translate('en', 'kv.line.event')).toBe('Send a photo when it happens');
    expect(translate('hi', 'kv.line.event')).toMatch(DEVANAGARI);
  });

  it('never splits a day off the Indian calendar: 00:30 India time is still that day', () => {
    // 19:00 UTC on the 25th is 00:30 on the 26th in India.
    expect(dayWords('2026-11-25T19:00:00.000Z', 'en', NOW)).toBe('Thu 26 Nov');
    expect(clockWords('2026-11-25T18:29:00.000Z')).toBe('11:59 pm');
  });
});

describe('who sends it', () => {
  it('says so when this reader is not the one, and says nothing when they are', () => {
    const owner = kItem({ uploader: 'owner', canSend: false });
    expect(whoSendsLine(owner, 'en')).toBe('Owner sends this');
    expect(whoSendsLine(owner, 'hi')).toBe('मालिक भेजेंगे');
    expect(whoSendsLine(owner, 'hl')).toBe('Malik bhejenge');
    expect(whoSendsLine(kItem({ uploader: 'manager', canSend: false }), 'en')).toBe('Manager sends this');
    expect(whoSendsLine(kItem({ uploader: 'owner', canSend: true }), 'en')).toBeNull();
    // A data point is nobody's to send.
    expect(whoSendsLine(kItem({ how: 'data', canSend: false }), 'en')).toBeNull();
  });

  it('says nothing once the photo has been sent or the job is done (nobody has to send it any more)', () => {
    expect(whoSendsLine(managerRow({ state: 'sent' }), 'en', 'dealer-owner')).toBeNull();
    expect(whoSendsLine(managerRow({ state: 'done' }), 'en', 'dealer-owner')).toBeNull();
    expect(whoSendsLine(managerRow({ state: 'sent_back' }), 'en', 'dealer-owner')).toBe('Manager sends this');
  });

  it('tells an owner a manager\'s job is the manager\'s, though the owner could send it', () => {
    expect(whoSendsLine(managerRow(), 'en', 'dealer-owner')).toBe('Manager sends this');
    expect(whoSendsLine(managerRow(), 'en', 'dealer-staff')).toBeNull();
  });

  it('never says "Sir"', () => {
    for (const lang of ['en', 'hi', 'hl'] as const) {
      expect(whoSendsLine(kItem({ uploader: 'owner', canSend: false }), lang)).not.toMatch(/\bsir\b|सर/i);
    }
  });
});

describe('the main action', () => {
  it('is Send photo for a photo point, and a sheet point also offers the sheet', () => {
    expect(actionOf(kItem(), 'now')).toBe('photo');
    expect(sheetOf(kItem(), 'now')).toBe(false);
    const sheet = kItem({ how: 'sheet', sheet: 'dsr-book' });
    expect(actionOf(sheet, 'now')).toBe('photo');
    expect(sheetOf(sheet, 'now')).toBe(true);
    expect(actionWord(kItem(), 'photo', 'en')).toBe('Send photo');
    expect(actionWord(kItem(), 'photo', 'hi')).toBe('फ़ोटो भेजें');
  });

  it('asks for the photo again on a sent-back row', () => {
    expect(actionWord(kItem({ state: 'sent_back' }), 'photo', 'en')).toBe('Send again');
  });

  it('is none for a data point, for a member who cannot send it, and for a row that is done or coming up', () => {
    expect(actionOf(kItem({ how: 'data', canSend: false }), 'data')).toBeNull();
    expect(actionOf(kItem({ canSend: false }), 'others')).toBeNull();
    expect(actionOf(kItem({ state: 'done' }), 'done')).toBeNull();
    expect(actionOf(kItem({ checkId: null }), 'upcoming')).toBeNull();
  });

  it('lets a photo already With MDG be replaced (it could not, though the server allows it)', () => {
    const waiting = kItem({ state: 'sent', sentAt: '2026-11-25T04:12:00.000Z' });
    expect(actionOf(waiting, 'waiting')).toBe('replace');
    expect(actionWord(waiting, 'replace', 'en')).toBe('Send a different photo');
    expect(actionWord(waiting, 'replace', 'hi')).toBe('दूसरी फ़ोटो भेजें');
    expect(sheetOf({ ...waiting, how: 'sheet' }, 'waiting')).toBe(false);
    // Not by a member who cannot send that point, and not for a data point.
    expect(actionOf(kItem({ state: 'sent', canSend: false }), 'waiting')).toBeNull();
    expect(actionOf(kItem({ state: 'sent', how: 'data', canSend: false }), 'waiting')).toBeNull();
  });

  it('does not offer the owner a different photo for a manager\'s job that is already With MDG', () => {
    const waiting = managerRow({ state: 'sent', sentAt: '2026-11-25T04:12:00.000Z' });
    expect(actionOf(waiting, 'waiting', 'dealer-owner')).toBeNull();
    expect(actionOf(waiting, 'waiting', 'dealer-staff')).toBe('replace');
  });

  it('is Send photo for a when-it-happens point', () => {
    const event = kItem({ checkId: null, everyDays: null });
    expect(actionOf(event, 'events')).toBe('event');
    expect(actionWord(event, 'event', 'en')).toBe('Send photo');
  });

  it('is loud only for a late or sent-back row', () => {
    expect(isLoud(kItem())).toBe(false);
    expect(isLoud(kItem({ late: true }))).toBe(true);
    expect(isLoud(kItem({ state: 'sent_back' }))).toBe(true);
    expect(isLoud(kItem({ state: 'sent' }))).toBe(false);
  });
});

describe('the tag: a shape and a word, never colour alone', () => {
  it('gives each state its own shape and word', () => {
    expect(tagOf(kItem(), 'now', 'en')).toEqual({ status: 'info', word: 'To do' });
    expect(tagOf(kItem({ late: true }), 'needs', 'en')).toEqual({ status: 'problem', word: 'Late' });
    expect(tagOf(kItem({ state: 'sent_back' }), 'needs', 'en')).toEqual({ status: 'attention', word: 'Send again' });
    // Under "With MDG" the pill would only repeat the heading; anywhere else the word is kept.
    expect(tagOf(kItem({ state: 'sent' }), 'waiting', 'en')).toBeNull();
    expect(tagOf(kItem({ state: 'sent' }), 'now', 'en')).toEqual({ status: 'waiting', word: 'With MDG' });
    expect(tagOf(kItem({ state: 'done' }), 'done', 'en')).toEqual({ status: 'ok', word: 'Done' });
    expect(tagOf(kItem(), 'upcoming', 'en')).toEqual({ status: 'info', word: 'Coming up' });
    expect(tagOf(kItem(), 'events', 'en')).toBeNull();
    expect(tagOf(kItem({ late: true }), 'needs', 'hi')!.word).toMatch(DEVANAGARI);
  });
});

describe('the extra figures the server may add later (N5), absent today', () => {
  it('shows "worth N%" only when the server says the point counts, using its total', () => {
    const view = kView();
    view.summary!.totalPoints = 3740;
    const big = kItem({ points: 460 });
    expect(worthOf(big, view)).toBeNull(); // no `counted` flag: no claim
    expect(worthOf({ ...big, counted: true } as typeof big, view)).toBe(12);
    expect(worthOf({ ...kItem({ points: 1 }), counted: true } as typeof big, view)).toBe(1);
    expect(worthOf({ ...big, counted: false } as typeof big, view)).toBeNull();
  });

  it('names who sent a photo only when the server says', () => {
    expect(sentByOf(kItem())).toBeNull();
    expect(sentByOf({ ...kItem(), sentByName: ' Ramesh ' } as ReturnType<typeof kItem>)).toBe('Ramesh');
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

// ── one home for the Kavach numbers ─────────────────────────────────────────
// The rich local data showed Today saying "Kavach work is late: First aid box" while the Kavach tab said "0 late,
// 0 to do today". Today's Needs-you list and the tab bar's badge read `kavachNeeds` / `countsOf`; the page reads
// `sectionsOf`. They must be the one list.
describe('Today and the Kavach page count the same points', () => {
  const AT = new Date('2026-11-27T03:00:00.000Z');
  const view = kView({
    now: [
      kItem({ code: 'first-aid', checkId: 'k1', uploader: 'manager', late: true, everyDays: 365, dueAt: '2026-11-24T01:37:00.000Z' }),
      kItem({ code: 'toilet', checkId: 'k2', uploader: 'manager', state: 'sent_back', sentBack: { reason: 'not_clear', note: null, at: '2026-11-27T00:37:00.000Z' } }),
      kItem({ code: 'forecourt', checkId: 'k3', uploader: 'any', late: true }),
      kItem({ code: 'owner-sheet', checkId: 'k4', uploader: 'owner', state: 'sent_back', sentBack: { reason: 'blurred', note: null, at: '2026-11-27T01:00:00.000Z' } }),
      kItem({ code: 'owner-late', checkId: 'k5', uploader: 'owner', late: true }),
      kItem({ code: 'stock-variation', checkId: 'k6', how: 'data', late: true, canSend: false }),
      kItem({ code: 'cannot', checkId: 'k7', uploader: 'owner', late: true, canSend: false }),
      kItem({ code: 'today-only', checkId: 'k8', uploader: 'any' }),
    ],
  });

  it.each([
    ['owner', 'dealer-owner'],
    ['manager', 'dealer-staff'],
  ] as const)('the %s: the Needs-you list, the badge and the page\'s own counts agree', (glanceRole, authRole) => {
    const page = sectionsOf(view, new Set(), AT, { role: authRole });
    const counts = countsOfSections(page);
    const today = kavachNeeds(view, glanceRole, []);
    // The same points, in the same terms.
    expect(new Set(today.map((i) => i.code))).toEqual(new Set(page.needs.map((i) => i.code)));
    expect(kavachNeedCount(view, glanceRole, [])).toBe(page.needs.length);
    expect(counts.sentBack + counts.late).toBe(page.needs.length);
    // And the count the tab bar's Kavach badge and the score tile read.
    expect(readerCountsOf(view, new Set(), AT, [], kavachRoleOf(glanceRole))).toEqual(counts);
    expect(todoCount(view, AT, authRole)).toBe(page.needs.length + page.now.length);
  });

  it('the owner is not asked for the manager\'s jobs, nor for MDG\'s data points, nor for what he cannot send', () => {
    const codes = kavachNeeds(view, 'owner', []).map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(['forecourt', 'owner-sheet', 'owner-late']));
    expect(codes).not.toEqual(expect.arrayContaining(['first-aid']));
    expect(codes).not.toContain('toilet');
    expect(codes).not.toContain('stock-variation');
    expect(codes).not.toContain('cannot');
  });

  it('the manager is asked for his own jobs, not the owner\'s (the server tells him `canSend: false` for those)', () => {
    const forManager = { ...view, now: view.now.map((i) => (i.uploader === 'owner' ? { ...i, canSend: false } : i)) };
    const codes = kavachNeeds(forManager, 'manager', []).map((i) => i.code);
    expect(codes.sort()).toEqual(['first-aid', 'forecourt', 'toilet']);
  });

  it('a late point that was already sent is not a need', () => {
    expect(isNeed(kItem({ state: 'sent', late: true }))).toBe(false);
    expect(isNeed(kItem({ state: 'todo', late: true }))).toBe(true);
    expect(isNeed(kItem({ state: 'sent_back', late: false }))).toBe(true);
  });
});
