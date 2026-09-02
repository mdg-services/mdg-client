import {
  documentPeriodBaseKey,
  type DealerDocumentAskList,
  type DealerDocumentAskRow,
  type DealerDocumentKindOption,
} from '@dk/shared/types';

/**
 * Every decision the ask bar and the ask sheet make, as functions with no React
 * in them.
 *
 * They live here rather than inside the components because each one is a rule a
 * person argued about — which face the bar shows, whether a tap opens the camera
 * or the list, which day a photograph is offered as — and a rule that can only be
 * exercised by rendering a component is a rule nobody checks. The components
 * below this file are then almost entirely markup.
 */

/**
 * The stable identity of a row, for matching a locally queued photograph to the
 * card it belongs to.
 *
 * NOT `row.id`, and that is the whole point. An `owed` row's id is
 * `owed:<kindCode>:<periodKey>` — a label for a row that does not exist yet —
 * and the moment the dealer answers it, the server mints a real ask with a
 * completely different id. A queue keyed on `row.id` would lose track of the
 * photograph at exactly that moment, and the card would sprout a live camera
 * button over bytes that were already waiting to go.
 *
 * `(kindCode, periodKey)` survives that transition, because the ask the server
 * mints is filed under the very period the owed row named. A freeform ask
 * carries its `:<slug>` suffix in `periodKey`, so two "other document" asks made
 * on the same day stay two different keys here as well as in the database.
 */
export function askMatchKey(
  row: Pick<DealerDocumentAskRow, 'kindCode' | 'periodKey'>,
): string {
  return `${row.kindCode}|${row.periodKey}`;
}

/**
 * The rows it is the DEALER's turn on, minus anything already sitting in the
 * local queue.
 *
 * The subtraction is not cosmetic. A photograph that is saved on the phone and
 * waiting for a network has, as far as the dealer is concerned, been dealt with;
 * counting it as outstanding would keep a bar on their screen telling them to do
 * a thing they have just done, and the obvious response to that bar is to take
 * the photograph a second time.
 */
export function outstandingRows(
  rows: readonly DealerDocumentAskRow[],
  queuedKeys: ReadonlySet<string>,
): DealerDocumentAskRow[] {
  return rows.filter((r) => r.waitingOn === 'dealer' && !queuedKeys.has(askMatchKey(r)));
}

/**
 * Which of the bar's three faces to draw, or `null` for no bar at all.
 *
 * ONE FACE, NEVER TWO, and the priority below is the reason it stays one. A
 * dealer with three outstanding papers of which one is overdue is shown the
 * count, not the overdue one: the count is the thing that tells them how big the
 * job is, and a bar that named one late paper would hide the other two behind a
 * sentence about a single day.
 *
 * "Late" only ever appears when there is exactly one thing to do, where it is
 * the extra fact worth 44 pixels.
 */
export type AskBarFace =
  | { face: 'one'; row: DealerDocumentAskRow }
  | { face: 'late'; row: DealerDocumentAskRow }
  | { face: 'many'; count: number };

export function askBarFace(rows: readonly DealerDocumentAskRow[]): AskBarFace | null {
  if (rows.length === 0) return null;
  if (rows.length > 1) return { face: 'many', count: rows.length };
  const only = rows[0];
  if (!only) return null;
  // `late` is computed on the SERVER (`isLate` in services/documents/list.ts):
  // a due date that has gone by while it is still the dealer's turn. It is not
  // recomputed here, because the server's IST day is the authority on what
  // "gone by" means and a phone's clock is not.
  return only.late ? { face: 'late', row: only } : { face: 'one', row: only };
}

/**
 * What a tap on the bar does.
 *
 * THE CAMERA CASE IS THE POINT OF THE WHOLE BAR. One outstanding photograph of
 * one page means the dealer's entire job is "take a picture", and making them
 * cross a list screen to do it is the difference between a chore that gets done
 * on the forecourt and one that gets done never. The bar tap IS the user
 * gesture, which is what makes opening the file input legal: a picker opened
 * from anywhere but inside the tap that asked for it is dropped by the Android
 * System WebView (the constraint `DensityTodayCard.tsx` documents).
 *
 * Everything else goes to the list, and each exclusion has its own reason:
 *
 *  - REJECTED. MDG sent it back with a sentence saying what was wrong, and that
 *    sentence is the only thing that makes the second photograph different from
 *    the first. Opening the camera would skip it, and the dealer would send the
 *    same unreadable page again.
 *  - MORE THAN ONE. A two-way choice cannot be made by a bar.
 *  - A KIND THAT MIGHT BE A PDF. A fire NOC is usually a scan and an "other
 *    document" is whatever MDG named; pointing a camera at either is a guess.
 *    The list offers both a camera and the phone's files.
 *  - A KAVACH ROW. It is answered through the Kavach screen, which owns that
 *    exchange; the list routes them there rather than reimplementing it.
 */
export type AskBarTap =
  | { action: 'camera'; row: DealerDocumentAskRow }
  | { action: 'list' };

export function askBarTap(
  rows: readonly DealerDocumentAskRow[],
  kinds: readonly DealerDocumentKindOption[],
): AskBarTap {
  const only = rows.length === 1 ? rows[0] : undefined;
  if (!only) return { action: 'list' };
  if (!canShootDirectly(only, kinds)) return { action: 'list' };
  return { action: 'camera', row: only };
}

/**
 * May this row be answered with the camera, with no screen in between?
 *
 * The "is it image-only?" question is answered from the CATALOG that rides along
 * in the same payload (`DealerDocumentAskList.kinds`), not from the row and not
 * from a list of codes written into this app. A dated, non-freeform kind is a
 * page of something that exists today and is photographed today — the register
 * page. A kind with no period (a fire NOC) or a freeform one (whatever MDG
 * named) can perfectly well be a PDF.
 *
 * A kind that does not resolve — retired, or not offered to this dealer — falls
 * through to the list. That is the safe direction: the list can do everything
 * the camera can, and the camera cannot do everything the list can.
 */
export function canShootDirectly(
  row: DealerDocumentAskRow,
  kinds: readonly DealerDocumentKindOption[],
): boolean {
  // `source` decides whether a server row EXISTS, which is a different question
  // from where the answer is posted — that is always `row.submitVia`, read
  // straight out of the payload and never chosen by an `if` in this app.
  if (row.source === 'kavach') return false;
  if (row.state === 'REJECTED') return false;
  const kind = kinds.find((k) => k.code === row.kindCode);
  if (!kind) return false;
  return kind.periodKind === 'DAY' && !kind.freeform;
}

/**
 * The hour of the day in India, from the phone's clock.
 *
 * IST is a fixed +5:30 with no daylight saving, so the offset is arithmetic
 * rather than a time-zone lookup — `Intl` with an Asia/Kolkata zone would be the
 * tidier spelling and throws on an Android WebView whose ICU data does not carry
 * the zone.
 *
 * This is the phone's clock and it may be wrong. That is tolerable HERE and
 * nowhere else in this feature: the hour only decides which of two days is
 * offered FIRST in a list the dealer can overrule, whereas every date that is
 * printed or sent comes from the server's own IST day.
 */
export function istHour(now: Date = new Date()): number {
  return new Date(now.getTime() + 5.5 * 60 * 60 * 1000).getUTCHours();
}

/** Before this hour, IST, a forecourt's "today" and the app's "today" disagree. */
export const EARLY_MORNING_UNTIL_HOUR = 6;

/**
 * The days this photograph could reasonably belong to, best first.
 *
 * A PUMP DOES NOT CLOSE AT MIDNIGHT. The man doing the night shift at half past
 * two writes on the page he has had open since eight in the evening, and calls
 * it yesterday's page — while the app, correctly, calls it today. For the first
 * six hours of every IST day those two are different words for the same piece of
 * paper, and a screen that quietly picks one of them will file a night shift's
 * page under the wrong date about half the time.
 *
 * So before six in the morning, if yesterday's period is ALSO outstanding, it is
 * offered first. It is only an ordering — the dealer can pick either — but the
 * first option is the one a tired person takes, and at 02:30 the right answer is
 * usually yesterday.
 */
export function dayOptions(
  rows: readonly DealerDocumentAskRow[],
  kindCode: string,
  today: string,
  now: Date = new Date(),
): DealerDocumentAskRow[] {
  const days = rows
    .filter((r) => r.kindCode === kindCode && r.periodKind === 'DAY' && r.waitingOn === 'dealer')
    // Newest first: an ordinary morning's answer is today's page, and the
    // pre-dawn exception below is the only thing that changes it.
    .sort((a, b) => documentPeriodBaseKey(b.periodKey).localeCompare(documentPeriodBaseKey(a.periodKey)));

  if (istHour(now) >= EARLY_MORNING_UNTIL_HOUR) return days;
  const yesterday = previousDay(today);
  const idx = days.findIndex((r) => documentPeriodBaseKey(r.periodKey) === yesterday);
  if (idx <= 0) return days;
  const moved = days[idx];
  if (!moved) return days;
  return [moved, ...days.slice(0, idx), ...days.slice(idx + 1)];
}

/**
 * The IST calendar day before `istDate`.
 *
 * Midday-anchored, exactly as `documentPeriodLabel` and `densityDayLabel` are:
 * from midnight, every piece of date arithmetic starts half a day from a
 * boundary it can fall over, and from midday no offset in use anywhere can move
 * the date.
 */
export function previousDay(istDate: string): string {
  const t = Date.parse(`${istDate}T12:00:00Z`);
  if (Number.isNaN(t)) return '';
  return new Date(t - 86_400_000).toISOString().slice(0, 10);
}

/**
 * Rows grouped by whose turn it is, in the order the dealer's screen reads them.
 *
 * Three groups, not the two the brief names, and the third is deliberate: the
 * server keeps an ACCEPTED row on this list for a few days
 * (`DEALER_SETTLED_VISIBLE_DAYS`) precisely so the dealer gets to SEE that it
 * landed. Dropping those rows on the floor here would undo that — a request that
 * vanishes the instant it is answered reads as a request that was lost.
 */
export interface AskGroups {
  todo: DealerDocumentAskRow[];
  sent: DealerDocumentAskRow[];
  done: DealerDocumentAskRow[];
}

export function groupAsks(rows: readonly DealerDocumentAskRow[]): AskGroups {
  const groups: AskGroups = { todo: [], sent: [], done: [] };
  for (const row of rows) {
    if (row.waitingOn === 'dealer') groups.todo.push(row);
    else if (row.waitingOn === 'mdg') groups.sent.push(row);
    else groups.done.push(row);
  }
  return groups;
}

/** An empty list, so a screen can render before the first payload arrives. */
export const EMPTY_ASK_LIST: DealerDocumentAskList = { rows: [], kinds: [], today: '' };
