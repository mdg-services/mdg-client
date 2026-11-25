import type { ReportStatusKey } from '@/features/reports/types';
import { localeOf, pick, translate, type MessageKey } from '@/lib/i18n';
import type { Lang } from '@/store/lang';
import type { KavachDealerItem, KavachDealerView, KavachSendBackReason } from '@dk/shared/types';

/**
 * What the Kavach tab says, decided without drawing anything (ADR 0057 §5). Every sentence
 * is built here, in the reader's language, from the server's facts; the page only lays them out.
 */

const IST = 'Asia/Kolkata';

/** "12 Mar" / "12 मार्च": the day, in the Indian calendar. */
export function dayWords(iso: string, lang: Lang): string {
  return new Date(iso).toLocaleDateString(localeOf(lang), { day: 'numeric', month: 'short', timeZone: IST });
}

/** "9:42 am": the clock, in Indian time. Always Latin digits, so a figure never changes shape. */
export function clockWords(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: IST })
    .replace(/\u202f/g, ' ')
    .toLowerCase();
}

/** The Indian calendar day (YYYY-MM-DD) of an instant. */
export function istDay(iso: string): string {
  return new Date(new Date(iso).getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

/** Does the item still need the dealer? (A late or sent-back one does too.) */
const isOpen = (i: KavachDealerItem) => i.state === 'todo' || i.state === 'sent_back' || i.state === 'missed';

/**
 * "Do now", in the order the dealer should act: sent back first, then late, then the one due soonest.
 * The server already sends them so; sorting again costs nothing and keeps the page right if a
 * row is moved here by an optimistic send.
 */
export function orderNow(items: readonly KavachDealerItem[]): KavachDealerItem[] {
  const rank = (i: KavachDealerItem) => (i.state === 'sent_back' ? 0 : i.late ? 1 : 2);
  const due = (i: KavachDealerItem) => (i.dueAt ? new Date(i.dueAt).getTime() : Number.MAX_SAFE_INTEGER);
  return items
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => rank(a.item) - rank(b.item) || due(a.item) - due(b.item) || a.idx - b.idx)
    .map((x) => x.item);
}

export interface KavachSections {
  /** What this reader should do today: sent back, late, daily, or due today. */
  now: KavachDealerItem[];
  /** This reader's longer points, due on a later day. */
  week: KavachDealerItem[];
  /** Points the other member sends (owner-only points, for a manager). No button. */
  others: KavachDealerItem[];
  /** Points MDG proves from its own data. No button. */
  data: KavachDealerItem[];
  waiting: KavachDealerItem[];
  done: KavachDealerItem[];
  upcoming: KavachDealerItem[];
  events: KavachDealerItem[];
}

/** Is this open item for today (rather than a later day this week)? */
function isForToday(i: KavachDealerItem, today: string): boolean {
  if (i.state === 'sent_back' || i.late || i.everyDays === 1) return true;
  return !!i.dueAt && istDay(i.dueAt) <= today;
}

/**
 * What marks one ask as "the dealer just sent this": the check, and the send-back it answers. If MDG
 * sends the same check back again later, the key is different, so the row comes back to "Do now".
 */
export function sentKey(item: Pick<KavachDealerItem, 'checkId' | 'sentBack' | 'dueAt'>): string {
  return `${item.checkId ?? ''}|${item.sentBack?.at ?? ''}|${item.dueAt ?? ''}`;
}

/**
 * The five sections, with the dealer's own just-sent photos applied: a check whose key is in
 * `sent` moves from "Do now" to "With MDG" at once, before the server's answer comes back.
 */
export function sectionsOf(
  view: KavachDealerView,
  sent: ReadonlySet<string> = new Set(),
  at: Date = new Date(),
): KavachSections {
  const today = istDay(at.toISOString());
  const moved: KavachDealerItem[] = [];
  const now: KavachDealerItem[] = [];
  const week: KavachDealerItem[] = [];
  const others: KavachDealerItem[] = [];
  const data: KavachDealerItem[] = [];
  for (const item of view.now) {
    if (item.checkId && sent.has(sentKey(item))) moved.push({ ...item, state: 'sent', late: false, sentBack: null });
    else if (item.how === 'data') data.push(item);
    else if (!item.canSend) others.push(item);
    else if (isForToday(item, today)) now.push(item);
    else week.push(item);
  }
  // A server row can arrive in "With MDG" already: it is not listed twice.
  const known = new Set(moved.map((m) => m.checkId));
  return {
    now: orderNow(now),
    week: orderNow(week),
    others: orderNow(others),
    data,
    waiting: [...moved, ...view.waiting.filter((w) => !known.has(w.checkId))],
    done: view.done,
    upcoming: view.upcoming,
    events: view.events,
  };
}

/** What this reader should do today: what the tab's badge counts. */
export function todayOf(view: KavachDealerView, at: Date = new Date()): KavachDealerItem[] {
  const today = istDay(at.toISOString());
  return mineOf(view).filter((i) => isForToday(i, today));
}

/** How many things wait on the dealer today: what the tab's badge shows. */
export function todoCount(view: KavachDealerView | undefined, at: Date = new Date()): number {
  return view?.on ? todayOf(view, at).length : 0;
}

/** What this reader can do now: not MDG's data points, not what only the other member sends. */
export function mineOf(view: KavachDealerView): KavachDealerItem[] {
  return view.now.filter((i) => i.canSend && i.how !== 'data');
}

/** The tab shows only where Kavach is on for the outlet. */
export function tabVisible(view: KavachDealerView | undefined): boolean {
  return view?.on === true;
}

/** The ring's number, whole. Null when the server has not scored the outlet yet. */
export function pctOf(view: KavachDealerView): number | null {
  const pct = view.summary?.pct;
  return typeof pct === 'number' && Number.isFinite(pct) ? Math.max(0, Math.min(100, Math.round(pct))) : null;
}

/** The one plain sentence under the ring: today's work first, then the rest of the week. */
export function sentenceOf(view: KavachDealerView, lang: Lang, at: Date = new Date()): string {
  if (!view.summary && view.now.length === 0 && view.waiting.length === 0 && view.done.length === 0) {
    return translate(lang, 'kavach.sentence.none');
  }
  const today = todayOf(view, at);
  const n = today.length;
  if (n === 0) {
    const later = mineOf(view).length;
    if (later > 0) return translate(lang, 'kavach.sentence.week', { n: later });
    return view.waiting.length > 0
      ? translate(lang, 'kavach.sentence.waiting', { n: view.waiting.length })
      : translate(lang, 'kavach.sentence.allDone');
  }
  const late = today.filter((i) => i.late).length;
  return late > 0
    ? translate(lang, 'kavach.sentence.late', { n, late })
    : translate(lang, 'kavach.sentence.todo', { n });
}

export interface KavachCountsView {
  done: number;
  sent: number;
  todo: number;
}

/** Done · With MDG · To do. From the server's score when it has one, else from the lists. */
export function countsOf(view: KavachDealerView): KavachCountsView {
  const c = view.summary?.counts;
  if (c) return { done: c.done, sent: c.sent, todo: mineOf(view).length };
  return { done: view.done.length, sent: view.waiting.length, todo: mineOf(view).length };
}

/** The tag a row wears: a shape (from the report StatusBadge set) and a word. Null for none. */
export function tagOf(item: KavachDealerItem, section: keyof KavachSections, lang: Lang): { status: ReportStatusKey; word: string } | null {
  if (section === 'events') return null;
  if (section === 'upcoming') return { status: 'info', word: translate(lang, 'kavach.tag.upcoming') };
  switch (item.state) {
    case 'sent_back':
      return { status: 'attention', word: translate(lang, 'kavach.tag.sentBack') };
    case 'sent':
      return { status: 'waiting', word: translate(lang, 'kavach.tag.sent') };
    case 'done':
      return { status: 'ok', word: translate(lang, 'kavach.tag.done') };
    case 'missed':
      return { status: 'problem', word: translate(lang, 'kavach.tag.missed') };
    case 'excused':
      return { status: 'info', word: translate(lang, 'kavach.tag.excused') };
    case 'todo':
      return item.late
        ? { status: 'problem', word: translate(lang, 'kavach.tag.late') }
        : { status: 'info', word: translate(lang, 'kavach.tag.todo') };
  }
}

/** The title in the reader's language (the server sends English and Hindi). */
export function titleOf(item: KavachDealerItem, lang: Lang): string {
  return pick(lang, item.titleEn, item.titleHi);
}

/** What to do, in the reader's language. */
export function howToOf(item: KavachDealerItem, lang: Lang): string {
  return pick(lang, item.howToEn, item.howToHi);
}

/** The reason chip as plain words. `other` has none: its note is the whole reason. */
export function reasonWords(reason: KavachSendBackReason, lang: Lang): string {
  if (reason === 'other') return '';
  return translate(lang, `kavach.reason.${reason}` as MessageKey);
}

/** The sent-back line: the reason, and the admin's note when there is one. */
export function sentBackLine(sentBack: NonNullable<KavachDealerItem['sentBack']>, lang: Lang): string {
  const note = (sentBack.note ?? '').trim();
  const reason = reasonWords(sentBack.reason, lang);
  // Next to a chip the note is labelled, so it is clear whose words it is; alone it is the whole reason.
  const said = reason && note ? `${reason}. ${translate(lang, 'kavach.line.noteFrom', { note })}` : reason || note;
  return said ? translate(lang, 'kavach.line.sentBack', { reason: said }) : translate(lang, 'kavach.line.sentBackPlain');
}

/** Who has to send it, when this member cannot. Null when this member can. */
export function whoSendsLine(item: KavachDealerItem, lang: Lang): string | null {
  if (item.canSend || item.how === 'data') return null;
  return translate(lang, item.uploader === 'owner' ? 'kavach.line.ownerSends' : 'kavach.line.managerSends');
}

/**
 * The one line under a row's title, by what the row needs:
 * sent back → why; late → how late; due → when; sent → when it went; done → how long it holds;
 * data → our words; coming up → when it opens. `now` is passed in so the words can be tested.
 */
export function lineOf(item: KavachDealerItem, section: keyof KavachSections, lang: Lang, now: Date = new Date()): string {
  if (section === 'events') return translate(lang, 'kavach.line.event');
  if (section === 'upcoming') {
    return item.opensAt ? translate(lang, 'kavach.line.opens', { date: dayWords(item.opensAt, lang) }) : '';
  }
  if (item.state === 'sent_back' && item.sentBack) return sentBackLine(item.sentBack, lang);
  if (item.state === 'sent') {
    if (!item.sentAt) return '';
    return istDay(item.sentAt) === istDay(now.toISOString())
      ? translate(lang, 'kavach.line.sentAt', { time: clockWords(item.sentAt) })
      : translate(lang, 'kavach.line.sentOn', { date: dayWords(item.sentAt, lang) });
  }
  if (item.state === 'done') {
    return item.validUntil
      ? translate(lang, 'kavach.line.valid', { date: dayWords(item.validUntil, lang) })
      : translate(lang, 'kavach.line.doneToday');
  }
  if (item.how === 'data') {
    const words = pick(lang, item.dataEn ?? '', item.dataHi ?? '').trim();
    return words || translate(lang, 'kavach.line.data');
  }
  if (!item.dueAt) return item.late ? translate(lang, 'kavach.line.lateNoTime') : '';
  const sameDay = istDay(item.dueAt) === istDay(now.toISOString());
  if (item.late) {
    return sameDay || item.everyDays === 1
      ? translate(lang, 'kavach.line.lateTime', { time: clockWords(item.dueAt) })
      : translate(lang, 'kavach.line.lateDate', { date: dayWords(item.dueAt, lang) });
  }
  return sameDay
    ? translate(lang, 'kavach.line.dueTime', { time: clockWords(item.dueAt) })
    : translate(lang, 'kavach.line.dueDate', { date: dayWords(item.dueAt, lang) });
}

/** The row's main action, or none. A data point never has one; a member who cannot send has none. */
export type KavachAction = 'photo' | 'sheet' | 'event' | null;

export function actionOf(item: KavachDealerItem, section: keyof KavachSections): KavachAction {
  if (item.how === 'data' || !item.canSend) return null;
  if (section === 'events') return 'event';
  if ((section === 'now' || section === 'week') && isOpen(item) && item.checkId) return item.how === 'sheet' ? 'sheet' : 'photo';
  return null;
}

/** The word on the action's button. A sent-back row asks for the photo again. */
export function actionWord(item: KavachDealerItem, action: Exclude<KavachAction, null>, lang: Lang): string {
  if (action === 'sheet') return translate(lang, 'kavach.act.sheet');
  if (action === 'event') return translate(lang, 'kavach.act.sendPhoto');
  return translate(lang, item.state === 'sent_back' ? 'kavach.act.again' : 'kavach.act.photo');
}
