import type { Status } from '@/components/kit';
import { fmtDay, fmtTime } from '@/lib/fmt';
import { pick, translate, type MessageKey } from '@/lib/i18n';
import { tnIn } from '@/lib/messages/_plural';
import { useAuthStore } from '@/store/auth';
import type { Lang } from '@/store/lang';
import type { KavachDealerItem, KavachDealerView, KavachSendBackReason } from '@dk/shared/types';

/**
 * What the Kavach door says, decided without drawing anything (ADR 0057 §5, spec 4.4). Every
 * sentence is built here, in the reader's language, from the server's facts; the page only lays them
 * out. The percent is the server's: nothing here recomputes it.
 */

/** Who is reading. The owner and a manager share the checklist but not the daily work. */
export type KavachRole = string | null | undefined;

/**
 * Fields the server may one day add to a point (spec 9, N5: `group`, `counted`, `sentByName`). They are
 * NOT built today, so every read below tolerates their absence: with none of them the screen is
 * the one the spec describes for the first pass.
 */
export type KavachItemExtras = KavachDealerItem & {
  group?: string;
  counted?: boolean;
  sentByName?: string | null;
};
const extrasOf = (i: KavachDealerItem): KavachItemExtras => i as KavachItemExtras;

/** How many "This week" rows show before "N more", and how many "Coming up" rows. */
export const WEEK_LIMIT = 5;
export const UPCOMING_LIMIT = 5;
/** MDG's own checks from the dealer's reports: the first few, then "N more". */
export const DATA_LIMIT = 5;

/** "Thu 12 Mar" / "गुरु 12 मार्च" / "today": the day, on the Indian calendar and the dealer's clock. */
export function dayWords(iso: string, lang: Lang, now: Date = new Date()): string {
  return fmtDay(iso, lang, now);
}

/** "9:42 am" / "सुबह 9:42": the clock, in Indian time. */
export function clockWords(iso: string, lang: Lang = 'en'): string {
  return fmtTime(iso, lang);
}

/** The Indian calendar day (YYYY-MM-DD) of an instant. */
export function istDay(iso: string): string {
  return new Date(new Date(iso).getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

/** Does the item still need the dealer? (A late or sent-back one does too.) */
const isOpen = (i: KavachDealerItem) => i.state === 'todo' || i.state === 'sent_back' || i.state === 'missed';

/** Is this a daily job (a point on a one-day clock)? */
const isDaily = (i: KavachDealerItem) => i.everyDays === 1;

/**
 * Is this point THIS reader's job? Never a data point (MDG's), never what this member cannot send.
 * The server lets the owner send everything, so `canSend` alone made a manager's daily work the owner's
 * (audit, pain point 8); the point's `uploader` says whose it is. With no role given the answer is
 * the old one, `canSend`, so a caller that does not know the reader keeps its count.
 */
export function isMine(item: KavachDealerItem, role?: KavachRole): boolean {
  if (item.how === 'data' || !item.canSend) return false;
  return !(role === 'dealer-owner' && item.uploader === 'manager');
}

/**
 * Does this open point cost marks right now (sent back, or late)? The ONE rule for the Kavach page's
 * "Needs you" card, Today's "Needs you" list and every count of them, so no screen can count a point
 * another does not.
 */
export const isNeed = (i: KavachDealerItem): boolean => i.state === 'sent_back' || (i.late && isOpen(i));

/**
 * The Kavach role of the member Today and the glance model call an `owner` or a `manager`. Everywhere
 * that asks "is this point mine?" (`isMine`) reads the signed-in role in this one spelling.
 */
export function kavachRoleOf(role: 'owner' | 'manager'): KavachRole {
  return role === 'owner' ? 'dealer-owner' : 'dealer-staff';
}

/** A point that is the other member's job (not MDG's data, not this reader's). */
export function isOthers(item: KavachDealerItem, role?: KavachRole): boolean {
  return item.how !== 'data' && !isMine(item, role);
}

/**
 * Open rows in the order the dealer should act: sent back first, then late, then the one due soonest.
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
  /** What costs marks right now and is this reader's: sent back, then late. The "Needs you" card. */
  needs: KavachDealerItem[];
  /** The rest of what this reader does today: daily, or due today. */
  now: KavachDealerItem[];
  /** This reader's longer points, due on a later day. */
  week: KavachDealerItem[];
  /** The other member's open points (the manager's, for an owner; the owner's, for a manager). */
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
 * sends the same check back again later, the key is different, so the row comes back to "Needs you".
 */
export function sentKey(item: Pick<KavachDealerItem, 'checkId' | 'sentBack' | 'dueAt'>): string {
  return `${item.checkId ?? ''}|${item.sentBack?.at ?? ''}|${item.dueAt ?? ''}`;
}

export interface SectionOptions {
  /** Who is reading: splits the owner's work from the manager's. */
  role?: KavachRole;
  /**
   * Checks of when-it-happens points this phone sent (`useKavachEventSends`). The server's view
   * never lists them (event rows are built with no check), so a photo sent for one vanished; these
   * put it under With MDG, back in Needs you when MDG sends it back, and under Done when accepted.
   */
  events?: readonly KavachDealerItem[];
}

/**
 * The sections, with the dealer's own just-sent photos applied: a check whose key is in `sent`
 * moves from "to do" to "With MDG" at once, before the server's answer comes back.
 */
export function sectionsOf(
  view: KavachDealerView,
  sent: ReadonlySet<string> = new Set(),
  at: Date = new Date(),
  opts: SectionOptions = {},
): KavachSections {
  const today = istDay(at.toISOString());
  const role = opts.role;

  // A check the server lists itself wins over the phone's own memory of it.
  const listed = new Set<string>();
  for (const i of [...view.now, ...view.waiting, ...view.done, ...view.upcoming]) if (i.checkId) listed.add(i.checkId);
  const remembered = (opts.events ?? []).filter((e) => !e.checkId || !listed.has(e.checkId));
  const nowRows = [...view.now, ...remembered.filter((e) => e.state === 'sent_back')];
  const waitingRows = [...view.waiting, ...remembered.filter((e) => e.state === 'sent')];
  const doneRows = [...view.done, ...remembered.filter((e) => e.state === 'done')];

  const moved: KavachDealerItem[] = [];
  const needs: KavachDealerItem[] = [];
  const now: KavachDealerItem[] = [];
  const week: KavachDealerItem[] = [];
  const others: KavachDealerItem[] = [];
  const data: KavachDealerItem[] = [];
  for (const item of nowRows) {
    if (item.checkId && sent.has(sentKey(item))) moved.push({ ...item, state: 'sent', late: false, sentBack: null });
    else if (item.how === 'data') data.push(item);
    else if (isOthers(item, role)) others.push(item);
    else if (isNeed(item)) needs.push(item);
    else if (isForToday(item, today)) now.push(item);
    else week.push(item);
  }
  // A server row can arrive in "With MDG" already: it is not listed twice.
  const known = new Set(moved.map((m) => m.checkId));
  return {
    needs: orderNow(needs),
    now: orderNow(now),
    week: orderNow(week),
    others: orderNow(others),
    data,
    waiting: [...moved, ...waitingRows.filter((w) => !known.has(w.checkId))],
    done: doneRows,
    upcoming: view.upcoming,
    events: view.events,
  };
}

/** What this reader can do now: not MDG's data points, not the other member's work. */
export function mineOf(view: KavachDealerView, role?: KavachRole): KavachDealerItem[] {
  return view.now.filter((i) => isMine(i, role));
}

/** What this reader should do today: what the door's badge counts. */
export function todayOf(view: KavachDealerView, at: Date = new Date(), role?: KavachRole): KavachDealerItem[] {
  const today = istDay(at.toISOString());
  return mineOf(view, role).filter((i) => isForToday(i, today));
}

/** How many things wait on the dealer today: what the door's badge shows. */
export function todoCount(view: KavachDealerView | undefined, at: Date = new Date(), role?: KavachRole): number {
  // The bar asks with no role. The signed-in reader's own role is the right default, so the badge counts the
  // same jobs the page lists for that reader (Needs you + Do today), not the other member's as well.
  const who = role === undefined ? useAuthStore.getState().user?.role : role;
  return view?.on ? todayOf(view, at, who).length : 0;
}

/** The door shows only where Kavach is on for the outlet. */
export function tabVisible(view: KavachDealerView | undefined): boolean {
  return view?.on === true;
}

/** The ring's number, whole. Null when the server has not scored the outlet yet. */
export function pctOf(view: KavachDealerView): number | null {
  const pct = view.summary?.pct;
  return typeof pct === 'number' && Number.isFinite(pct) ? Math.max(0, Math.min(100, Math.round(pct))) : null;
}

/** "2,320 of 3,740": the points behind the ring, the server's own. Null when it has not scored. */
export function pointsOf(view: KavachDealerView): { done: number; total: number } | null {
  const s = view.summary;
  if (!s || !Number.isFinite(s.donePoints) || !Number.isFinite(s.totalPoints) || s.totalPoints <= 0) return null;
  return { done: s.donePoints, total: s.totalPoints };
}

export interface ScoreCounts {
  sentBack: number;
  /** Late and not sent back, so a job is never counted under both words. */
  late: number;
  /**
   * Everything the page lists as due today for this reader: "Needs you" plus "Do today". It is the very
   * number the bar's badge shows (`todoCount`), and the sent-back and late jobs are part of it.
   */
  todo: number;
}

/**
 * The three counts under the ring, read from the SAME lists the page draws (the reader's own jobs), so the
 * count line, the score sentence, the "Needs you" card and the "Do today" card can never disagree. (They used
 * to be the outlet's server counts plus a second read of the raw list, which counted the other member's
 * jobs and MDG's data points and said "3 to do today" above a card that said "Nothing left".)
 */
export function countsOfSections(sections: Pick<KavachSections, 'needs' | 'now'>): ScoreCounts {
  const sentBack = sections.needs.filter((i) => i.state === 'sent_back').length;
  return {
    sentBack,
    late: sections.needs.length - sentBack,
    todo: sections.needs.length + sections.now.length,
  };
}

/** The reader's counts straight from the view, for a caller that has not built the sections. */
export function readerCountsOf(
  view: KavachDealerView,
  sent: ReadonlySet<string> = new Set(),
  at: Date = new Date(),
  events: readonly KavachDealerItem[] = [],
  role?: KavachRole,
): ScoreCounts {
  return countsOfSections(sectionsOf(view, sent, at, { role, events }));
}

/**
 * The OUTLET's counts, as the Today tile still reads them: sent back and late are the server's own
 * (`summary.counts`), less any the dealer has just sent from this phone; to do today is read from the list
 * (not late, not sent back). The Kavach page does not use this: it counts what it lists, with `countsOfSections`.
 */
export function scoreCountsOf(
  view: KavachDealerView,
  sent: ReadonlySet<string> = new Set(),
  at: Date = new Date(),
  events: readonly KavachDealerItem[] = [],
): ScoreCounts {
  const today = istDay(at.toISOString());
  let listBack = 0;
  let listLate = 0;
  let movedBack = 0;
  let movedLate = 0;
  let todo = 0;
  for (const i of view.now) {
    if (i.how === 'data') continue;
    const moved = !!i.checkId && sent.has(sentKey(i));
    if (i.state === 'sent_back') {
      if (moved) movedBack++;
      else listBack++;
    } else if (i.late) {
      if (moved) movedLate++;
      else listLate++;
    } else if (!moved && isForToday(i, today)) todo++;
  }
  const c = view.summary?.counts;
  const listed = new Set(view.now.map((i) => i.checkId));
  const eventBack = events.filter((e) => e.state === 'sent_back' && !(e.checkId && listed.has(e.checkId))).length;
  return {
    sentBack: (c ? Math.max(0, c.sentBack - movedBack) : listBack) + eventBack,
    late: c ? Math.max(0, c.late - movedLate) : listLate,
    todo,
  };
}

/**
 * Do the server's own counts say something is sent back or late that the lists do not show anywhere (not
 * under Needs you, the other member's jobs or MDG's data points)? Then the view is half-updated and the page
 * must not draw an all-clear tick. Not asked while this phone has just sent something: the server's
 * counts catch up a moment later.
 */
export function countsOutOfStep(
  view: KavachDealerView,
  sections: KavachSections,
  sent: ReadonlySet<string> = new Set(),
): boolean {
  const c = view.summary?.counts;
  if (!c || sent.size > 0) return false;
  const shown = [...sections.needs, ...sections.others, ...sections.data];
  const hasBack = shown.some((i) => i.state === 'sent_back');
  const hasLate = shown.some((i) => i.late);
  return (c.sentBack > 0 && !hasBack) || (c.late > 0 && !hasLate);
}

/** The shape beside the score: what it is about, never a claim that the pump is "fine". */
export function scoreStatusOf(view: KavachDealerView, counts: ScoreCounts): Status {
  if (!view.summary) return 'info';
  if (counts.sentBack > 0 || counts.late > 0) return 'attention';
  if (counts.todo > 0) return 'waiting';
  return 'ok';
}

/**
 * The one plain sentence on the score card, from the sections the page shows: what needs the reader
 * first, then today's work, then the rest of the week, then MDG's checking.
 */
export function sentenceOf(view: KavachDealerView, sections: KavachSections, lang: Lang): string {
  if (!view.summary && sections.needs.length + sections.now.length + sections.week.length === 0 && view.waiting.length === 0 && view.done.length === 0) {
    return translate(lang, 'kv.sentence.none');
  }
  if (sections.needs.length > 0) return tnIn(lang, 'kv.sentence.needs', sections.needs.length);
  if (sections.now.length > 0) return tnIn(lang, 'kv.sentence.todo', sections.now.length);
  if (sections.week.length > 0) return tnIn(lang, 'kv.sentence.week', sections.week.length);
  if (sections.waiting.length > 0) return tnIn(lang, 'kv.sentence.waiting', sections.waiting.length);
  return translate(lang, 'kv.sentence.allDone');
}

/** "1 h 20 min left": how long until `dueAt`, in the reader's language. */
export function leftWords(dueAt: string, at: Date, lang: Lang): string {
  const mins = Math.floor((new Date(dueAt).getTime() - at.getTime()) / 60_000);
  if (!Number.isFinite(mins) || mins < 1) return translate(lang, 'kv.left.soon');
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return translate(lang, 'kv.left.m', { m });
  if (m === 0) return translate(lang, 'kv.left.h', { h });
  return translate(lang, 'kv.left.hm', { h, m });
}

export interface DailyJobs {
  /** All the daily jobs this reader can see that the dealer can do (MDG's data points are not jobs). */
  total: number;
  /** Accepted. A photo with MDG is not done: it does not count in the percent. */
  done: number;
  withMdg: number;
  /** The next daily job of THIS reader's that has a deadline still ahead. */
  next: KavachDealerItem | null;
}

/**
 * "5 of 9 daily jobs done" and the next deadline (spec 4.4, item 4). Daily points are the ones on a
 * one-day clock, counted across to-do, with MDG and done. Null when the pump has no daily job.
 */
export function dailyJobsOf(
  view: KavachDealerView,
  sent: ReadonlySet<string> = new Set(),
  at: Date = new Date(),
  role?: KavachRole,
): DailyJobs | null {
  let open = 0;
  let withMdg = 0;
  let next: KavachDealerItem | null = null;
  const today = istDay(at.toISOString());
  const nextDue = (i: KavachDealerItem) => (i.dueAt ? new Date(i.dueAt).getTime() : Number.MAX_SAFE_INTEGER);
  for (const i of view.now) {
    if (i.how === 'data') continue;
    const moved = !!i.checkId && sent.has(sentKey(i));
    if (isDaily(i)) {
      if (moved) {
        withMdg++;
      } else {
        open++;
      }
    }
    // The next deadline is the soonest of THIS reader's open jobs still due later today (a daily one, or any
    // other point that falls due today), so the card names a job whenever one has a time ahead of it.
    if (
      !moved &&
      i.state === 'todo' &&
      !i.late &&
      i.dueAt &&
      isMine(i, role) &&
      new Date(i.dueAt).getTime() > at.getTime() &&
      istDay(i.dueAt) === today
    ) {
      if (!next || nextDue(i) < nextDue(next)) next = i;
    }
  }
  withMdg += view.waiting.filter((i) => isDaily(i) && i.how !== 'data').length;
  const done = view.done.filter((i) => isDaily(i) && i.how !== 'data').length;
  const total = open + withMdg + done;
  return total === 0 ? null : { total, done, withMdg, next };
}

/** The soonest date of anything still to come (a later job this week, or a renewal opening): for "Next job". */
export function nextJobAt(s: Pick<KavachSections, 'week' | 'upcoming' | 'others'>): string | null {
  const dates: string[] = [];
  for (const i of [...s.week, ...s.others]) if (i.dueAt) dates.push(i.dueAt);
  for (const i of s.upcoming) if (i.opensAt) dates.push(i.opensAt);
  if (dates.length === 0) return null;
  return dates.reduce((a, b) => (new Date(a).getTime() <= new Date(b).getTime() ? a : b));
}

/** "Worth N% of your score": only when the server says the point counts now (N5 `counted`). Null otherwise. */
export function worthOf(item: KavachDealerItem, view: KavachDealerView): number | null {
  if (extrasOf(item).counted !== true) return null;
  const total = view.summary?.totalPoints;
  if (!total || total <= 0 || !Number.isFinite(item.points) || item.points <= 0) return null;
  return Math.max(1, Math.round((item.points / total) * 100));
}

/** Who sent it, when the server says (N5 `sentByName`). Null otherwise. */
export function sentByOf(item: KavachDealerItem): string | null {
  const name = (extrasOf(item).sentByName ?? '').trim();
  return name || null;
}

/** The place a row is drawn. */
export type RowSection = keyof KavachSections;

/** The tag a row wears: a shape (from the report StatusBadge set) and a word. Null for none. */
export function tagOf(item: KavachDealerItem, section: RowSection, lang: Lang): { status: Status; word: string } | null {
  if (section === 'events') return null;
  // A row under "With MDG" would only repeat its heading in a pill.
  if (section === 'waiting' && item.state === 'sent') return null;
  if (section === 'upcoming') return { status: 'info', word: translate(lang, 'kv.tag.upcoming') };
  switch (item.state) {
    case 'sent_back':
      return { status: 'attention', word: translate(lang, 'kv.tag.sentBack') };
    case 'sent':
      return { status: 'waiting', word: translate(lang, 'kv.tag.sent') };
    case 'done':
      return { status: 'ok', word: translate(lang, 'kv.tag.done') };
    case 'missed':
      return { status: 'problem', word: translate(lang, 'kv.tag.missed') };
    case 'excused':
      return { status: 'info', word: translate(lang, 'kv.tag.excused') };
    case 'todo':
      return item.late
        ? { status: 'problem', word: translate(lang, 'kv.tag.late') }
        : { status: 'info', word: translate(lang, 'kv.tag.todo') };
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
  return translate(lang, `kv.reason.${reason}` as MessageKey);
}

/** The sent-back line: the reason, and the admin's note when there is one. */
export function sentBackLine(sentBack: NonNullable<KavachDealerItem['sentBack']>, lang: Lang): string {
  const note = (sentBack.note ?? '').trim();
  const reason = reasonWords(sentBack.reason, lang);
  // Next to a chip the note is labelled, so it is clear whose words it is; alone it is the whole reason.
  const said = reason && note ? `${reason}. ${translate(lang, 'kv.line.noteFrom', { note })}` : reason || note;
  return said ? translate(lang, 'kv.line.sentBack', { reason: said }) : translate(lang, 'kv.line.sentBackPlain');
}

/**
 * Who has to send it, when this reader is not the one. Null when they are, when it is MDG's, and once it
 * has been sent or is done (then nobody has to send anything).
 */
export function whoSendsLine(item: KavachDealerItem, lang: Lang, role?: KavachRole): string | null {
  if (item.how === 'data' || isMine(item, role) || !isOpen(item)) return null;
  return translate(lang, item.uploader === 'owner' ? 'kv.line.ownerSends' : 'kv.line.managerSends');
}

/**
 * The one line under a row's title, by what the row needs:
 * sent back → why; late → how late; due → when and how long is left; sent → when it went and who sent
 * it; done → how long it holds, or MDG's own words for a data point; coming up → when it opens.
 * `now` is passed in so the words can be tested.
 */
export function lineOf(item: KavachDealerItem, section: RowSection, lang: Lang, now: Date = new Date()): string {
  // Every "when it happens" row would say the same sentence, so the page says it once under the heading.
  if (section === 'events') return '';
  if (section === 'upcoming') {
    return item.opensAt ? translate(lang, 'kv.line.opens', { date: dayWords(item.opensAt, lang, now) }) : '';
  }
  if (item.state === 'sent_back' && item.sentBack) return sentBackLine(item.sentBack, lang);
  if (item.state === 'sent') {
    if (!item.sentAt) return '';
    const by = sentByOf(item);
    const today = istDay(item.sentAt) === istDay(now.toISOString());
    const vars = { time: clockWords(item.sentAt, lang), date: dayWords(item.sentAt, lang, now), name: by ?? '' };
    if (today) return translate(lang, by ? 'kv.line.sentAtBy' : 'kv.line.sentAt', vars);
    return translate(lang, by ? 'kv.line.sentOnBy' : 'kv.line.sentOn', vars);
  }
  if (item.state === 'done') {
    if (item.how === 'data') {
      const words = pick(lang, item.dataEn ?? '', item.dataHi ?? '').trim();
      return words || translate(lang, 'kv.line.dataDone');
    }
    return item.validUntil
      ? translate(lang, 'kv.line.valid', { date: dayWords(item.validUntil, lang, now) })
      : translate(lang, 'kv.line.doneToday');
  }
  if (item.how === 'data') {
    const words = pick(lang, item.dataEn ?? '', item.dataHi ?? '').trim();
    return words || translate(lang, 'kv.line.data');
  }
  if (!item.dueAt) return item.late ? translate(lang, 'kv.line.lateNoTime') : '';
  const sameDay = istDay(item.dueAt) === istDay(now.toISOString());
  if (item.late) {
    return sameDay || item.everyDays === 1
      ? translate(lang, 'kv.line.lateTime', { time: clockWords(item.dueAt, lang) })
      : translate(lang, 'kv.line.lateDate', { date: dayWords(item.dueAt, lang, now) });
  }
  if (sameDay) {
    const time = clockWords(item.dueAt, lang);
    return new Date(item.dueAt).getTime() > now.getTime()
      ? translate(lang, 'kv.line.dueIn', { time, left: leftWords(item.dueAt, now, lang) })
      : translate(lang, 'kv.line.dueTime', { time });
  }
  return translate(lang, 'kv.line.dueDate', { date: dayWords(item.dueAt, lang, now) });
}

/**
 * The row's main action, or none. A data point never has one; a member who cannot send has none.
 * `replace` is for a photo already With MDG: the server keeps the first and takes the new one.
 */
export type KavachAction = 'photo' | 'event' | 'replace' | null;

export function actionOf(item: KavachDealerItem, section: RowSection, role?: KavachRole): KavachAction {
  if (item.how === 'data' || !item.canSend) return null;
  if (section === 'events') return 'event';
  // Only the one whose job it is can swap a photo already with MDG (the owner does not for the manager's).
  if (section === 'waiting') return item.state === 'sent' && item.checkId && isMine(item, role) ? 'replace' : null;
  if ((section === 'needs' || section === 'now' || section === 'week' || section === 'others') && isOpen(item) && item.checkId) {
    return 'photo';
  }
  return null;
}

/** Does this row also offer the sheet MDG made (to print and fill in)? Only while it is still open. */
export function sheetOf(item: KavachDealerItem, section: RowSection, role?: KavachRole): boolean {
  return actionOf(item, section, role) === 'photo' && item.how === 'sheet';
}

/** The word on the action's button. A sent-back row asks for the photo again. */
export function actionWord(item: KavachDealerItem, action: Exclude<KavachAction, null>, lang: Lang): string {
  if (action === 'event') return translate(lang, 'kv.act.sendPhoto');
  if (action === 'replace') return translate(lang, 'kv.act.replace');
  return translate(lang, item.state === 'sent_back' ? 'kv.act.again' : 'kv.act.photo');
}

/** Only a sent-back or late row carries the loud button; every other row has the calm one (spec 4.4, item 6). */
export function isLoud(item: KavachDealerItem): boolean {
  return item.state === 'sent_back' || item.late;
}
