/**
 * How long a filed paper is good for, and when we chase the dealer about it.
 *
 * WHERE THIS SITS
 * ---------------
 * `DocumentAsk` already owns *is it owed, did we ask, have we accepted.* This
 * module adds the one thing it could not answer: **how long the paper we
 * accepted stays good, and who gets told before it runs out.**
 *
 * It is deliberately NOT a second collection. A filed paper IS an accepted ask —
 * the artifact is already on `submission.attachment`, and `submission.byKind`
 * already distinguishes "the dealer sent it" from "an admin filed it for them",
 * which is exactly the admin-upload case. A parallel store would mean two
 * answers to "what paper do we hold", two download routes to get the access
 * checks right in, and a second place for `assertBytesUnchanged` to be
 * forgotten.
 *
 * A RENEWAL IS A NEW ASK, NOT A REWRITTEN ONE
 * -------------------------------------------
 * `ACCEPTED` is the one closed state that refuses to reopen, because reopening
 * would erase the acceptance, the reviewer's name and the time — the compliance
 * record itself. So a renewal cannot be the same row asked twice. It is a fresh
 * ask under a DISTINCT period key, built with the suffix mechanism that already
 * exists:
 *
 *     periodKeyFor('NONE', today, renewalSlug(validUntil))  →  ':renew-2027-03-31'
 *
 * whose base is `''` and whose suffix passes `isValidSlug`. Two consequences,
 * both wanted: last year's Fire NOC and this year's are separate rows with
 * separate evidence, and — because the unique index's partial filter is
 * `periodKey > ''` — every renewal after the first IS covered by it, so two
 * schedulers on two replicas cannot mint two requests for one certificate.
 *
 * WHAT IS STORED AND WHAT IS DERIVED
 * ----------------------------------
 * `validUntil` and the reminder ledger are stored. **The verdict is not.**
 * `expired` / `expiring` / `valid` is computed on every read by
 * {@link documentValidityState}, for the reason `services/documents/expire.ts`
 * already states about due dates: *a date passing is not a transition.* A stored
 * verdict is a copy of a subtraction, correct only until the clock moves, and
 * every screen reading it between two sweeps would be reading yesterday's
 * arithmetic.
 */
import { daysToExpiry, expiryState, type ExpiryState } from '../lib/expiry';

import { periodKeyFor } from './documentAsk';

/**
 * `EXPIRY_STATES` and `ExpiryState` are DELIBERATELY NOT RE-EXPORTED HERE.
 *
 * They already leave the package from `lib/expiry`, which `shared/src/index.ts`
 * exports directly. Re-exporting them from this module as well put two
 * declarations of one name into the root barrel — legal TypeScript, and caught
 * only by `import/export`'s duplicate-export rule, which is why it survived a
 * clean typecheck. Import the type from `@dk/shared` as everything else does.
 */

/**
 * THE IMPORT DIRECTION IS ONE-WAY AND MUST STAY THAT WAY. This module reads
 * `documentAsk.ts`; `documentAsk.ts` reads nothing here. `DocumentReminderEntry`
 * is declared THERE rather than here for exactly that reason — it is a field on
 * `DocumentAsk`, and moving it would make the two modules import each other,
 * which in a barrel-re-exported package is how one of them ends up `undefined`
 * at module-evaluation time with a stack trace pointing nowhere useful.
 */

/**
 * The shipped reminder ladder: fifteen days out, then three, two and one.
 *
 * Days BEFORE the expiry date, so a bigger number is earlier. Stored biggest
 * first — {@link normaliseReminderOffsets} enforces it — because that is the
 * order a person reads them in and the order they fire in.
 *
 * IT IS A DEFAULT, NOT A CONSTANT. Every kind may carry its own ladder and every
 * individual paper may override its kind's. This array is only what applies when
 * nobody has said otherwise, and it is exported once so the type, the zod
 * schema, the mongoose model and the admin form cannot come to hold four
 * different opinions — the `DOCUMENT_ASK_NOTE_MAX` pattern.
 */
export const DOCUMENT_REMINDER_OFFSETS_DEFAULT: readonly number[] = [15, 3, 2, 1];

/**
 * The most steps one ladder may carry.
 *
 * Eight is not a storage limit, it is an attention limit. A dealer pushed nine
 * times about one certificate stops reading any of them, and the ninth is what
 * teaches them to swipe us away without looking. Enforced in the schema so an
 * admin cannot type a fifteen-step ladder into the cadence editor and quietly
 * train a whole estate to ignore us.
 */
export const DOCUMENT_REMINDER_OFFSETS_MAX = 8;

/** The furthest ahead a step may sit. A year out is not a reminder, it is a diary. */
export const DOCUMENT_REMINDER_OFFSET_MAX_DAYS = 365;

/**
 * Clean a ladder into the one shape the rest of this module may assume: whole
 * numbers in range, no duplicates, biggest first, at most
 * {@link DOCUMENT_REMINDER_OFFSETS_MAX} of them.
 *
 * TOTAL BY CONSTRUCTION — never throws, never returns null. Rubbish in gives the
 * empty ladder, which means *never remind*, which is a setting somebody may
 * legitimately want. What a human is ALLOWED to type is the zod schema's
 * business; this is what both the writer and every reader run through, so a
 * value that reached the database before the schema tightened still reads back
 * sanely. That matters more than usual here: the catalog seeder writes new
 * fields under `$setOnInsert`, so rows seeded before this release carry
 * `undefined` and will keep carrying it until an admin edits them.
 *
 * `0` is permitted and means *on the expiry day itself*.
 */
export function normaliseReminderOffsets(input: unknown): number[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<number>();
  for (const raw of input) {
    // `Number()` IS THE TRAP HERE, AND IT COSTS A REMINDER. `Number(null)`,
    // `Number('')`, `Number([])` and `Number(false)` are all `0` — a legal
    // ladder step meaning "remind on the expiry day itself". So a stray null in
    // a stored array would silently add a step nobody configured, and the dealer
    // would get an extra notification on the worst possible morning. Only a real
    // number, or a string that is entirely a number, is allowed to become one.
    const n =
      typeof raw === 'number'
        ? raw
        : typeof raw === 'string' && raw.trim() !== ''
          ? Number(raw)
          : Number.NaN;
    if (!Number.isInteger(n)) continue;
    if (n < 0 || n > DOCUMENT_REMINDER_OFFSET_MAX_DAYS) continue;
    seen.add(n);
  }
  return [...seen].sort((a, b) => b - a).slice(0, DOCUMENT_REMINDER_OFFSETS_MAX);
}

/**
 * The ladder that actually applies to one paper.
 *
 * ONE FUNCTION, BECAUSE THE PILL AND THE PUSH MUST AGREE. The amber "expiring"
 * badge and the notification that wakes a phone are both derived from the first
 * step of this list. Resolving the override in two places is how a screen comes
 * to say a certificate is fine on the morning a notification says it is not.
 *
 * An override of `[]` is meaningful and is NOT the same as no override: it says
 * *never remind about this particular paper*, which is what an admin wants for
 * the one certificate a dealer has already told them is being replaced. Hence
 * the `undefined` check rather than a truthy one.
 */
export function resolveReminderOffsets(
  askOverride: readonly number[] | undefined,
  kindCadence: readonly number[] | undefined,
): number[] {
  if (askOverride !== undefined) return normaliseReminderOffsets(askOverride);
  if (kindCadence !== undefined) return normaliseReminderOffsets(kindCadence);
  return [...DOCUMENT_REMINDER_OFFSETS_DEFAULT];
}

/**
 * How many days ahead this paper counts as "expiring", given its ladder.
 *
 * The first step, or `0` when reminders are off — in which case nothing is ever
 * "soon" and the verdict goes straight from `valid` to `expired`. That is the
 * honest rendering of the setting rather than a bug: an admin who switched the
 * ladder off asked for no warning.
 */
export function validitySoonDays(cadence: readonly number[]): number {
  return cadence.length ? Math.max(...cadence) : 0;
}

/**
 * Where this paper stands: `expired`, `expiring`, `valid`, or no verdict at all.
 *
 * Delegates to {@link expiryState} so the documents tab and the outlet Info tab
 * cannot disagree, and passes the paper's OWN first ladder step as the "soon"
 * threshold rather than the profile's flat sixty days. That is what makes the
 * amber badge and the first notification the same statement.
 *
 * `undefined` for a paper with no validity, and — the part that matters — also
 * for a `validUntil` that will not parse. No verdict beats a green one.
 */
export function documentValidityState(input: {
  validUntil?: string;
  today: string;
  cadence: readonly number[];
}): ExpiryState | undefined {
  return expiryState(input.validUntil, input.today, validitySoonDays(input.cadence));
}

/** Whole days until this paper lapses; negative once it has. `null` when unknowable. */
export function documentDaysToExpiry(validUntil: string | undefined, today: string): number | null {
  return daysToExpiry(validUntil, today);
}

/**
 * What a person reads on the badge, in their own language.
 *
 * NO RAW DATES, the rule `services/documents/notify.ts` states for pushes,
 * applied here so the card, the estate table and the notification cannot come to
 * name one deadline three different ways. A dealer is told "8 days left", never
 * "2026-09-16".
 *
 * Note this is a COUNT, not a formatted date, which is why it does not go
 * through `dealerProfileDateLabel`. Where a screen genuinely wants to print the
 * date itself — an admin correcting it, a dealer asked to confirm what is
 * printed on the paper — it must use `dealerProfileDateLabel`, which carries the
 * YEAR, and never `documentPeriodLabel`, which deliberately omits it: a licence
 * good until 31 December 2027 shown as "31 Dec" reads as this year to anybody.
 */
export function documentValidityLabel(daysLeft: number | null, lang: 'en' | 'hi'): string {
  if (daysLeft === null) return '—';
  if (daysLeft < 0) {
    const n = Math.abs(daysLeft);
    if (lang === 'hi') return `${n} दिन पहले ख़त्म`;
    return n === 1 ? 'Expired 1 day ago' : `Expired ${n} days ago`;
  }
  if (daysLeft === 0) return lang === 'hi' ? 'आज ख़त्म' : 'Expires today';
  if (daysLeft === 1) return lang === 'hi' ? '1 दिन बाकी' : '1 day left';
  return lang === 'hi' ? `${daysLeft} दिन बाकी` : `${daysLeft} days left`;
}

/**
 * Every step already settled, sent or skipped — what {@link nextDocumentReminder}
 * takes.
 *
 * Typed on the ONE FIELD it reads rather than on `DocumentReminderEntry`, so the
 * server can hand it a mongoose sub-document array straight off a lean document.
 * Those carry `at` as a `Date` where the public type carries an ISO string, and
 * a narrower signature here would push a cast to every call site — which is
 * where a cast stops being read.
 */
export function settledReminderOffsets(
  entries: readonly { offsetDays: number }[] | undefined,
): number[] {
  return (entries ?? []).map((e) => e.offsetDays);
}

/** What one pass of the reminder sweep decided for one paper. A pure value. */
export interface DocumentReminderDecision {
  /** The ladder step to fire NOW, or `null` for none. At most one per paper per pass. */
  fire: number | null;
  /** Steps whose window has gone by, written off so they cannot fire late. */
  skip: number[];
  /** True when the "this has lapsed" notice is due and has not gone out. */
  lapsedNotice: boolean;
}

/**
 * Which reminder, if any, is due for this paper today.
 *
 * THE THREE RULES, AND EACH IS A BUG SOMEBODY WOULD OTHERWISE SHIP:
 *
 *  1. **At most one notification per paper per pass.** Candidates are every
 *     unsettled step whose window has arrived (`offset >= daysLeft`). When four
 *     have piled up we fire the SMALLEST — the one whose message is closest to
 *     the truth — and write the rest off. Firing them all puts four
 *     notifications about one certificate on a phone in one minute.
 *  2. **The message never quotes the step.** `fire` is bookkeeping. What the
 *     dealer reads is built from the real `daysLeft`, so a fifteen-day step
 *     going out on the tenth day says "10 days left". A step is a trigger, not a
 *     sentence.
 *  3. **Past the date the ladder stops.** Once `daysLeft` is negative no step
 *     fires at all; every unsettled step is written off and the single lapsed
 *     notice goes instead. Otherwise a dealer whose NOC ran out on Friday is
 *     told "1 day left" on Saturday, which is both wrong and insulting.
 *
 * `fired` is every step already settled — sent OR skipped. Passing only the sent
 * ones makes every written-off step eligible again the next morning, which is
 * the exact loop rule 1 exists to prevent.
 */
export function nextDocumentReminder(input: {
  cadence: readonly number[];
  fired: readonly number[];
  daysLeft: number;
  lapsedNoticeSent: boolean;
}): DocumentReminderDecision {
  // AN EMPTY LADDER MEANS COMPLETE SILENCE, INCLUDING THE LAPSED NOTICE.
  //
  // The lapsed notice does not come off the ladder, so without this line an
  // admin who emptied the box for one certificate — because the dealer has
  // already told them it is being replaced — would still get a push about it on
  // the day it ran out. "Never remind me about this one" has to mean that, or
  // nobody will trust the setting enough to use it.
  if (input.cadence.length === 0) return { fire: null, skip: [], lapsedNotice: false };

  const settled = new Set(input.fired);
  const unsettled = input.cadence.filter((o) => !settled.has(o));

  if (input.daysLeft < 0) {
    return {
      fire: null,
      skip: [...unsettled].sort((a, b) => b - a),
      lapsedNotice: !input.lapsedNoticeSent,
    };
  }

  const arrived = unsettled.filter((o) => o >= input.daysLeft);
  if (arrived.length === 0) return { fire: null, skip: [], lapsedNotice: false };

  const fire = Math.min(...arrived);
  return {
    fire,
    skip: arrived.filter((o) => o !== fire).sort((a, b) => b - a),
    lapsedNotice: false,
  };
}

/**
 * Is the renewal request due to be opened for this paper?
 *
 * A CONDITION, NOT AN EVENT, and the difference is what makes the nightly pass
 * safe to crash. The obvious rule — "open it at the moment the first reminder
 * fires" — is a rule about one instant, so a process that died between firing
 * the reminder and creating the ask would leave the step marked settled and the
 * upload slot never opened. The next pass would compute no reminder (the step is
 * settled) and therefore no renewal, and a dealer would be told their NOC is
 * expiring with nowhere to put the new one. Silently, once, months later.
 *
 * Stated as a condition instead, it is self-healing: every pass asks "should
 * this paper have an open renewal by now?", and the answer stays true until one
 * exists. The dealer still hears about it with the first reminder, because that
 * is the first pass on which the condition turns true.
 *
 * THE THREE CLAUSES:
 *  - `kindAutoRenews` — off means MDG raises renewals for this paper by hand.
 *  - `renewedByAskId` — already open, so never a second. Two schedulers on two
 *    replicas cannot produce two requests for one certificate.
 *  - inside the window — `daysLeft` has reached the first step of the ladder, or
 *    gone past the date. An EMPTY ladder is never inside anything: "never remind
 *    me about this one" means MDG handles it by hand, slot included.
 */
export function shouldOpenRenewalAsk(input: {
  cadence: readonly number[];
  daysLeft: number;
  /** Already open? Then never again. */
  renewedByAskId?: string;
  /** The kind's setting. Off means MDG raises renewals for this paper by hand. */
  kindAutoRenews: boolean;
}): boolean {
  if (!input.kindAutoRenews) return false;
  if (input.renewedByAskId) return false;
  if (input.cadence.length === 0) return false;
  return input.daysLeft <= validitySoonDays(input.cadence);
}

/**
 * The period-key suffix that keeps one renewal cycle distinct from the last.
 *
 * `renew-2027-03-31` — the date of the validity being replaced, so the key says
 * WHICH cycle it is rather than merely that it is a renewal. Two renewals of the
 * same certificate in one year (a short extension, then the real one) stay
 * separate rows; a second sweep pass on the same day produces the same key and
 * so cannot mint a duplicate even if the idempotency guard were somehow missed.
 *
 * Hyphens and digits only, so it survives `slugifyDocumentLabel` unchanged and
 * passes `isValidSlug`.
 */
export function renewalSlug(replacingValidUntil: string | undefined): string {
  const day = (replacingValidUntil ?? '').slice(0, 10).replace(/[^0-9-]/g, '');
  return day ? `renew-${day}` : 'renew';
}

/**
 * The period key a renewal ask is filed under.
 *
 * Wrapped rather than left to each caller because getting it wrong is silent:
 * a renewal filed under the SAME key as the accepted paper it replaces would try
 * to reopen an `ACCEPTED` row, be refused, and simply never appear — no error on
 * any screen, and a certificate nobody was ever asked to renew.
 */
export function renewalPeriodKey(input: {
  periodKind: Parameters<typeof periodKeyFor>[0];
  today: string;
  replacingValidUntil?: string;
}): string {
  return periodKeyFor(input.periodKind, input.today, renewalSlug(input.replacingValidUntil));
}

/* ────────────────────── The ladder as a person types it ─────────────────── */

/**
 * What a typed ladder came out as: the steps, or the sentence saying why not.
 *
 * Never both. A parser that returned a best-effort list AND a warning would let
 * a caller save the list and render the warning, which is how "15, 3, 2, l" —
 * a lower-case L for a one — silently becomes a three-step ladder.
 */
export interface ReminderLadderParse {
  offsets: number[] | null;
  error: string | null;
}

/**
 * Read a cadence out of a box somebody typed in: `15, 3, 2, 1`.
 *
 * IT REFUSES THE EMPTY STRING, and that is the entire reason it exists rather
 * than the caller reaching for {@link normaliseReminderOffsets}. That function
 * is TOTAL by design — rubbish in gives `[]`, which is the legitimate stored
 * value meaning *never remind about this*. Run it over the box an admin has just
 * cleared in order to retype the numbers, and a slip of the thumb between
 * clearing and typing silences a whole kind, with the save button looking
 * exactly as it always does.
 *
 * So: emptiness is an ERROR here, and switching reminders off has to be a
 * separate, deliberate act with its own words. The two functions are a pair —
 * this one guards the keyboard, that one guards the database — and the split is
 * worth the second function.
 *
 * Lives in `shared` rather than beside the form for the standing reason: the
 * admin app has no test runner at all, so anything decidable that stays there
 * cannot be tested by anybody.
 */
export function parseReminderLadder(text: string): ReminderLadderParse {
  const trimmed = String(text ?? '').trim();
  if (trimmed === '') {
    return {
      offsets: null,
      error:
        'Type at least one step — for example 15, 3, 2, 1. To stop reminding about this altogether, choose “Never remind” instead.',
    };
  }
  const parts = trimmed.split(/[\s,]+/).filter((p) => p !== '');
  const seen: number[] = [];
  for (const part of parts) {
    // Digits only, and at most three of them. A regex rather than `Number()`,
    // which accepts `1e3`, ` 12 `, `0x0f` and `Infinity` — every one of which
    // would pass a range check and none of which is a number of days anybody
    // typed on purpose.
    if (!/^\d{1,3}$/.test(part)) {
      return { offsets: null, error: `“${part}” is not a whole number of days.` };
    }
    const n = Number(part);
    if (n > DOCUMENT_REMINDER_OFFSET_MAX_DAYS) {
      return {
        offsets: null,
        error: `${n} is further out than ${DOCUMENT_REMINDER_OFFSET_MAX_DAYS} days. A year ahead is a diary entry, not a reminder.`,
      };
    }
    if (!seen.includes(n)) seen.push(n);
  }
  if (seen.length > DOCUMENT_REMINDER_OFFSETS_MAX) {
    return {
      offsets: null,
      error: `${DOCUMENT_REMINDER_OFFSETS_MAX} steps is the most one ladder may carry. A dealer pushed nine times about one certificate stops reading any of them.`,
    };
  }
  // Biggest first — the order they fire in and the order a person reads them in.
  // `normaliseReminderOffsets` would sort it server-side anyway; sorting here
  // means the box shows back exactly what was stored.
  return { offsets: seen.sort((a, b) => b - a), error: null };
}

/** A ladder as it goes back into the box a person types in. */
export function formatReminderLadder(offsets: readonly number[]): string {
  return [...offsets].sort((a, b) => b - a).join(', ');
}

/**
 * Whether two ladders say the same thing, whatever order they arrived in.
 *
 * So a form can tell "nothing changed" from "changed back to what it was" and
 * leave the save button alone — a PATCH that writes an identical ladder still
 * writes an audit row, and a trail full of no-op edits is a trail nobody reads.
 */
export function sameReminderLadder(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  const x = [...a].sort((p, q) => q - p);
  const y = [...b].sort((p, q) => q - p);
  return x.every((n, i) => n === y[i]);
}

/**
 * Sort order wherever papers on file are listed: the most urgent first.
 *
 * Expired, then expiring (soonest first), then valid (soonest first), then the
 * ones carrying no date at all. Ties break on the title so the order is stable
 * across renders — an unstable sort on a list somebody is working through moves
 * a row out from under their thumb.
 */
export function compareDocumentValidityRows(
  a: { validityState?: ExpiryState; daysToExpiry?: number | null; title: string },
  b: { validityState?: ExpiryState; daysToExpiry?: number | null; title: string },
): number {
  const band = (s: ExpiryState | undefined): number =>
    s === 'expired' ? 0 : s === 'expiring' ? 1 : s === 'valid' ? 2 : 3;
  const byBand = band(a.validityState) - band(b.validityState);
  if (byBand !== 0) return byBand;
  const da = a.daysToExpiry ?? null;
  const db = b.daysToExpiry ?? null;
  if (da !== null && db !== null && da !== db) return da - db;
  return a.title.localeCompare(b.title);
}

/** The counters above a documents-on-file table. */
export interface DocumentValidityTally {
  /** In force, further out than the first ladder step. */
  valid: number;
  /** Inside the reminder window. The number an account manager is working. */
  expiring: number;
  /** Past its date. The number that should be zero. */
  expired: number;
  /** On file, but with no validity date — or one we cannot read. */
  undated: number;
}

/**
 * Count rows into the tally above.
 *
 * Takes rows that ALREADY carry `validityState` rather than recomputing from
 * `validUntil`, so the tiles cannot disagree with the table beneath them — the
 * same reason `documentAskEstateTally` counts marks rather than states. The four
 * counters therefore always add up to the row count, which is the invariant that
 * makes them trustworthy at a glance.
 */
export function documentValidityTally(
  rows: readonly { validityState?: ExpiryState }[],
): DocumentValidityTally {
  const tally: DocumentValidityTally = { valid: 0, expiring: 0, expired: 0, undated: 0 };
  for (const row of rows) {
    switch (row.validityState) {
      case 'valid':
        tally.valid += 1;
        break;
      case 'expiring':
        tally.expiring += 1;
        break;
      case 'expired':
        tally.expired += 1;
        break;
      case undefined:
        tally.undated += 1;
        break;
      default: {
        const unhandled: never = row.validityState;
        return unhandled;
      }
    }
  }
  return tally;
}
