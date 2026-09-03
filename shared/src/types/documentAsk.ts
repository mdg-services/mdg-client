/**
 * Document Ask — one record that answers exactly one question:
 * **this dealer owes this paper for this period.**
 *
 * THE SEAM, STATED ONCE
 * ---------------------
 * `DocumentAsk` owns *is it owed, did we ask, have we accepted.*
 * The service's own model owns *what the artifact means to that service.*
 * There is only ever one fact, so there is nothing to reconcile. A density
 * register page is a `TtDensityDayLog` because that is what the Kavach
 * `tt-register-photo` signal reads; the ask over it is a READ ADAPTER, never a
 * copy, and `TtDensityDayLog` is not migrated, mirrored or touched.
 *
 * WHY A NEW COLLECTION RATHER THAN A FIELD ON SOMETHING EXISTING
 * --------------------------------------------------------------
 * Three candidates were considered and all three are wrong:
 *
 *  - `KavachItem.request` is strictly 1:1 with a task, and a KavachItem is
 *    unique on `(programmeId, templateCode)` — one row per task for all time.
 *    A per-DATE obligation cannot live there: 3 Sept and 4 Sept would collide
 *    on that index and the second would overwrite the first.
 *  - `Record` requires `attachment`, so a Record cannot exist while the document
 *    is still missing — and "still missing" is the entire state an obligation
 *    lives in.
 *  - `TtDensityDayLog` is one service's day log, not a general obligation.
 *
 * And a new collection is the CHEAP option here, not the expensive one.
 * Production never calls `syncIndexes()` — stated three times in the repo
 * (`models/Dealer.ts`, `scripts/migrate-dealer-archive-indexes.ts`,
 * `scripts/drop-dealer-name-text-index.ts`) — so changing an existing index
 * fails with IndexOptionsConflict and needs a script run by hand over SSH
 * against Atlas. A brand-new collection builds its indexes automatically on
 * first model use. Zero migrations.
 */
import { compareDealerCodes } from '../dealer/code';

import type { Attachment } from './conversation';

/**
 * The life of one obligation.
 *
 *   ASKED (their turn) → SENT (our turn) → ACCEPTED | REJECTED
 *
 * plus EXPIRED and WITHDRAWN, which are how an ask stops mattering without
 * anybody sending anything.
 *
 * `OWED` is deliberately NOT a member. "Owed" is not a state a row can be
 * parked in — it is what `ASKED` (and a `REJECTED` row the dealer has not
 * answered yet) MEAN, read through {@link documentAskWaitingOn}. Storing it
 * would create a second place where the same fact lives, and the two would
 * drift the first time a transition forgot to update one of them. Ask
 * `documentAskWaitingOn(state) === 'dealer'` instead.
 *
 * TWO EDGES ARE DELIBERATELY ABSENT
 * ---------------------------------
 *  1. `SENT` never expires. Something waiting on MDG must not time out on the
 *     dealer's side — our review backlog is not their fault, and a dealer who
 *     photographed the paper on Tuesday should never open the app on Friday to
 *     find the request lapsed while it sat in our queue.
 *  2. A due date passing is NOT a transition. The row stays `ASKED` and the
 *     card simply reads late. Nothing sweeps it, so no sweeper race ever gets
 *     to decide whether the dealer's turn has ended — and a dealer sending a
 *     day-late photograph is answering a live request, not reviving a dead one.
 *
 * `REJECTED` → the dealer re-sends → the old submission is pushed onto
 * `superseded[]` and `rejectReason`/`reviewedAt` are cleared, exactly as
 * `TtDensityDayLog` supersedes a blurry photograph. Nothing is ever deleted.
 */
export const DOCUMENT_ASK_STATES = [
  /** MDG asked (or the dealer opened it themselves). Their turn. */
  'ASKED',
  /** The dealer sent something. Our turn. Never expires — see above. */
  'SENT',
  /** MDG looked at it and it is good. The obligation is closed. */
  'ACCEPTED',
  /** MDG looked at it and it will not do. `rejectReason` says why, verbatim. */
  'REJECTED',
  /** The period has gone by unanswered and the ask was closed unsatisfied. */
  'EXPIRED',
  /** MDG no longer needs it. Closed with no fault on anyone. */
  'WITHDRAWN',
] as const;
export type DocumentAskState = (typeof DOCUMENT_ASK_STATES)[number];

/**
 * What kind of period an ask is FOR, which is also what shape its key takes.
 *
 *   DAY   → `YYYY-MM-DD`   a register page, a shift slip
 *   MONTH → `YYYY-MM`      a bank statement, a monthly return
 *   YEAR  → `YYYY`         an annual licence renewal
 *   NONE  → `''`           a Fire NOC: it is either on file or it is not
 */
export const DOCUMENT_PERIOD_KINDS = ['DAY', 'MONTH', 'YEAR', 'NONE'] as const;
export type DocumentPeriodKind = (typeof DOCUMENT_PERIOD_KINDS)[number];

/** `admin` = we asked. `dealer` = they sent it unprompted. Mirrors `KavachItem.request.openedBy`. */
export const DOCUMENT_ASK_OPENED_BY = ['admin', 'dealer'] as const;
export type DocumentAskOpenedBy = (typeof DOCUMENT_ASK_OPENED_BY)[number];

/**
 * Where the ACCEPTANCE of this kind of document can honestly come from.
 *
 *  - `own`                  — nothing but a person at MDG looking at it.
 *  - `tt-density-register`  — the TT Density day log already records whether the
 *                             register page was photographed, so an ask over it
 *                             reads that row instead of asking for a second copy
 *                             of the same photograph.
 *
 * THIS IS A CLOSED TWO-VALUE ENUM AND THAT IS THE POINT. A third adapter must
 * fail compilation rather than appear at runtime, and only the shipped seed may
 * set this field — the catalog editor an admin uses does not expose it at all.
 * That is what makes the auto-accept guard real rather than a tooltip: see
 * {@link DocumentKind.reviewRequired}.
 */
export const DOCUMENT_SOURCES = ['own', 'tt-density-register'] as const;
export type DocumentSourceId = (typeof DOCUMENT_SOURCES)[number];

/**
 * One row of the document catalog — what a paper IS, in both languages.
 *
 * Deliberately flat `…En` / `…Hi` pairs rather than `{ en, hi }` objects,
 * matching `KavachTemplateSeedItem`, because this is seeded into Mongo the same
 * way and a per-field `$setOnInsert` over nested objects is how a half-edited
 * bilingual row ends up with a Hindi title from the seed and an English one from
 * the admin.
 *
 * Nothing here is copied onto a `DocumentAsk`. ADR 0011 settled that argument
 * for Kavach — a per-dealer photocopy of a definition is why a super-admin could
 * edit a task, watch it save, and move nobody — and an ask carries `kindCode`
 * and nothing else for the same reason.
 */
export interface DocumentKind {
  /** Stable slug, kebab-case. The only link between an ask and what it is. */
  code: string;
  /** Display order in the admin catalog and on the dealer's list. */
  srNo: number;
  /** What the paper is called. Both required: every dealer-facing surface is Hindi-first. */
  titleEn: string;
  titleHi: string;
  /** One sentence: what a good photograph of it actually shows. */
  hintEn: string;
  hintHi: string;
  /** The question the confirm sheet asks before it sends. */
  confirmEn: string;
  confirmHi: string;
  /** What period this paper belongs to, and therefore the shape of its key. */
  periodKind: DocumentPeriodKind;
  /**
   * True when one period can carry MORE THAN ONE ask of this kind, and each
   * therefore needs a `:<slug>` suffix on its period key to stay distinct.
   * See {@link periodKeyFor} for the collision this prevents.
   */
  freeform: boolean;
  /** True when this comes round every period by itself rather than being asked for once. */
  recurring: boolean;
  /** Where an acceptance can come from. Only the shipped seed sets this. */
  source: DocumentSourceId;
  /**
   * False means an accepted document needs no human at MDG — the machine signal
   * named by `source` is the acceptance.
   *
   * THE GUARD: `reviewRequired: false` is valid ONLY when `source !== 'own'`,
   * and it is enforced in `schemas/documentAsk.ts`, not merely documented. A
   * kind with no machine signal behind it and auto-accept switched on would
   * publish an acceptance MDG never made — an ADR 0011 violation with a nice UI
   * on it. Because `source` is a closed enum only the seed can set, and the
   * catalog editor's schema fixes `reviewRequired` to `true`, an admin can never
   * create such a kind.
   */
  reviewRequired: boolean;
  /**
   * The service this paper belongs to, keyed exactly as the plugin folder is
   * named (`tt-density`). Absent for papers that belong to no service.
   */
  serviceId?: string;
  /**
   * True when the kind may only be asked of a dealer who actually has
   * `serviceId` attached. Asking a dealer for "today's register page" when we do
   * not run their density register is asking them for homework we set nobody.
   */
  requiresService?: boolean;
  /**
   * Whether this paper appears on the DEALER'S OWN LIST at all.
   *
   * Not the same question as `active`, and the two must never be conflated.
   * `active` is about retirement — a retired kind stops being offerable, but its
   * outstanding asks stay on the dealer's list, because a request MDG has
   * already made does not stop being owed when the catalog is tidied.
   * `dealerVisible` is about the audience: MDG can track a paper internally
   * (something an account manager files on the dealer's behalf, something
   * gathered from a portal) without putting it on a forecourt owner's screen.
   *
   * THE GATE BELONGS IN THE QUERY, NOT THE PAGE, and that is the whole reason
   * this field is documented at this length. Kavach did it the other way and
   * paid for it: `/kavach/me` returned `overallPct` to every dealer
   * unconditionally, and the only thing keeping a settling-in dealer from seeing
   * their score was one `if` in `KavachPage.tsx`. A second client — an older
   * bundle, a WebView that failed to update, anything reading the API directly —
   * saw what the server chose to send, not what the page chose to draw. That
   * hole is closed now (`kavach/dealerFacing.ts`, applied in the serializer),
   * but the lesson stands: the dealer's list route filters on this in the
   * SERVICE-LAYER QUERY (`services/documents/list.ts`), and a hidden kind's rows
   * never leave the database.
   *
   * Defaults to true: a paper MDG asks a dealer for is, by default, a paper the
   * dealer is told about. Hiding one is the deliberate act.
   */
  dealerVisible: boolean;
  /** Retired kinds stay in the catalog so old asks still resolve their name. */
  active: boolean;
}

/**
 * One attempt at satisfying an ask.
 *
 * `attachment` is REQUIRED here, unlike `KavachItem.request.submission.proof`.
 * That difference is deliberate and worth stating: a Kavach submission may be
 * an empty "I've done this" claim, because the thing being claimed is an ACT.
 * Here the thing being claimed is a PAPER, and a submission with no paper on it
 * is not a smaller version of the same event — it is nothing at all.
 */
export interface DocumentAskSubmission {
  /** ISO timestamp of the send. */
  at: string;
  byUserId: string;
  /**
   * The sender's display name, copied in at write time — the same denormalisation
   * `TtDensityDayLog` makes, and for the same reason: who sent that paper on that
   * day is a historical fact that must survive the account being archived.
   */
  byName?: string;
  /** Which side sent it: the dealer's own staff, or an admin filing it for them. */
  byKind: DocumentAskOpenedBy;
  attachment: Attachment;
  note?: string;
  /** Set when a later submission replaced this one. Nothing is ever deleted. */
  supersededAt?: string;
}

/** The public API shape of one obligation. */
export interface DocumentAsk {
  id: string;
  dealerId: string;
  /** Denormalised for the estate list; a dealer IS its code. */
  dealerCode?: string;
  /** The catalog code. The ONLY link to what the paper is — no definition is copied. */
  kindCode: string;
  /** Copied from the kind at creation so the key can be read without the catalog. */
  periodKind: DocumentPeriodKind;
  /** See {@link periodKeyFor}. Unique per (dealer, kind) — that is the whole point. */
  periodKey: string;
  state: DocumentAskState;
  openedBy: DocumentAskOpenedBy;
  /**
   * What was actually asked for, in the admin's own words. Required for a
   * freeform kind: "A document MDG asked for" tells the dealer nothing, which is
   * the same hole the staff-points catch-all works had.
   */
  label?: string;
  /** The admin's message when asking — shown to the dealer under the title. */
  note?: string;
  askedAt?: string;
  /** How many times we have asked. A second ask is a nudge, not a new row. */
  askedCount: number;
  /**
   * IST calendar day (`YYYY-MM-DD`) by which MDG wants it. Passing it is NOT a
   * transition — the row stays `ASKED` and the card reads late. Computed on the
   * server from the admin's `dueInDays`, never sent as a date by a client whose
   * clock is not the authority on what "in three days" means in IST.
   */
  dueOn?: string;
  /** The live submission, if the dealer has sent anything. */
  submission?: DocumentAskSubmission;
  /** Every earlier submission, oldest first. Rejections do not erase evidence. */
  superseded?: DocumentAskSubmission[];
  reviewedAt?: string;
  reviewedByAdminId?: string;
  /** Denormalised, so rendering a screen of history is one query. */
  reviewedByName?: string;
  /** Shown to the dealer VERBATIM, so it has to read as a sentence. */
  rejectReason?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Whose move is it?
 *
 * This is THE distinction the product draws nowhere today, and both apps render
 * it: the dealer's list wants "these three are on you", the admin's estate view
 * wants "these forty are on us". Deriving it in one place is what stops the two
 * screens from disagreeing about who is holding things up.
 *
 * `REJECTED` counts as the dealer's turn, not a closed state: we looked, we said
 * why, and the ball is back with them. `EXPIRED` and `WITHDRAWN` and `ACCEPTED`
 * are nobody's turn — they are over.
 */
export function documentAskWaitingOn(state: DocumentAskState): 'dealer' | 'mdg' | 'none' {
  switch (state) {
    case 'ASKED':
    case 'REJECTED':
      return 'dealer';
    case 'SENT':
      return 'mdg';
    case 'ACCEPTED':
    case 'EXPIRED':
    case 'WITHDRAWN':
      return 'none';
    default: {
      // A state added to DOCUMENT_ASK_STATES with no arm here stops compiling,
      // rather than quietly reporting somebody else's turn on both screens.
      const unhandled: never = state;
      return unhandled;
    }
  }
}

/** Longest a freeform slug may be. Long enough to be recognisable, short enough for an index key. */
export const DOCUMENT_PERIOD_SLUG_MAX = 48;

/**
 * Turn an admin's freeform words into the `:<slug>` half of a period key.
 *
 * `:`, `/` and `\` become a gap — the key is split on its first colon and ends
 * up in a path-shaped index — and every run of gap then collapses to a single
 * hyphen. Everything else survives, INCLUDING Devanagari.
 *
 * That last point is not a nicety. An ASCII-only slugifier turns "बिजली का बिल"
 * into the empty string, and then every Hindi-labelled ask made on the same day
 * carries the identical key and collides on the unique index — which is exactly
 * the bug the suffix exists to prevent, reintroduced by the fix for it.
 *
 * Two asks whose labels slug to the SAME value on the same day are deliberately
 * one row, not two: the same words for the same day is one request asked twice.
 */
export function slugifyDocumentLabel(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[:/\\]+/g, ' ')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, DOCUMENT_PERIOD_SLUG_MAX)
      // The slice can cut mid-gap and a label of nothing but punctuation slugs
      // to hyphens, so both ends are trimmed after the cut, not before it.
      .replace(/^-+|-+$/g, '')
  );
}

/** The part of a period key before the freeform suffix (the whole key when there is none). */
export function documentPeriodBaseKey(periodKey: string): string {
  const i = periodKey.indexOf(':');
  return i < 0 ? periodKey : periodKey.slice(0, i);
}

/** The freeform suffix of a period key, or `''` when it carries none. */
export function documentPeriodSuffix(periodKey: string): string {
  const i = periodKey.indexOf(':');
  return i < 0 ? '' : periodKey.slice(i + 1);
}

/**
 * Build the period key an ask is filed under.
 *
 * `istDate` is an IST calendar day (`YYYY-MM-DD`); MONTH and YEAR keys are its
 * prefixes, so one input answers every kind and there is no second notion of
 * "which month is it".
 *
 *   DAY   → `2026-09-02`
 *   MONTH → `2026-09`
 *   YEAR  → `2026`
 *   NONE  → `''`
 *
 * THE SUFFIX IS LOAD-BEARING. A freeform kind (`other-document`) appends
 * `:<slug>` to its base key. WITHOUT it, two different "other document" asks
 * made on the same day produce the same key, collide on the unique
 * `(dealerId, kindCode, periodKey)` index, and the second silently overwrites
 * the first — the dealer sees one request where MDG made two, and nothing
 * anywhere says a request was lost.
 *
 * This is the same bug and the same fix as the staff-points catch-all works
 * ("Other cleaning work", "Other DU work", "Other office work"), whose merge key
 * had to grow a description for exactly this reason. See
 * `DESCRIPTION_REQUIRED_WORK_CODES` in `types/staff.ts`.
 */
export function periodKeyFor(
  periodKind: DocumentPeriodKind,
  istDate: string,
  slug?: string,
): string {
  const base =
    periodKind === 'DAY'
      ? istDate.slice(0, 10)
      : periodKind === 'MONTH'
        ? istDate.slice(0, 7)
        : periodKind === 'YEAR'
          ? istDate.slice(0, 4)
          : '';
  const suffix = slug ? slugifyDocumentLabel(slug) : '';
  return suffix ? `${base}:${suffix}` : base;
}

/** Whether a freeform suffix is a shape we will store. */
function isValidSlug(slug: string): boolean {
  if (slug.length === 0 || slug.length > DOCUMENT_PERIOD_SLUG_MAX) return false;
  if (slug !== slug.trim()) return false;
  // `:` cannot appear (the key splits on the first one), `/` and `\` are kept
  // out of anything that ends up shaped like a path, and whitespace cannot
  // appear because `slugifyDocumentLabel` turns every run of it into a hyphen —
  // so a key carrying a space did not come from the slugifier.
  return !/[:/\\\s]/.test(slug);
}

/**
 * Whether `key` is the SHAPE of a period key for `periodKind`.
 *
 * Shape only, and that boundary is deliberate: this says nothing about whether
 * `2026-02-31` is a real day or whether the day has happened yet. Those two
 * questions already have exactly one answer in this repo — `ttBusinessDateSchema`
 * in `schemas/ttDensity.ts`, which round-trips the date through IST midday and
 * refuses the future — and `schemas/documentAsk.ts` layers it over this check.
 * Do NOT add a second date validator here; that is how a screen and a route come
 * to disagree about which days exist.
 */
export function isValidPeriodKey(periodKind: DocumentPeriodKind, key: string): boolean {
  // A key with no colon has no suffix to check; a key WITH one must carry a real
  // slug after it, which is why the two cases are told apart before asking
  // `documentPeriodSuffix`, whose empty answer means both things.
  if (key.includes(':') && !isValidSlug(documentPeriodSuffix(key))) return false;
  const base = documentPeriodBaseKey(key);
  switch (periodKind) {
    case 'DAY':
      return /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(base);
    case 'MONTH':
      return /^\d{4}-(0[1-9]|1[0-2])$/.test(base);
    case 'YEAR':
      return /^\d{4}$/.test(base);
    case 'NONE':
      return base === '';
    default: {
      const unhandled: never = periodKind;
      return unhandled;
    }
  }
}

/** The two languages every dealer-facing surface speaks. Mirrors `User.lang`. */
export type DocumentAskLang = 'en' | 'hi';

/**
 * The ONE formatter that turns a period into words a dealer reads.
 *
 * A dealer must NEVER see a raw `2026-09-02`. It is exported from `shared`
 * rather than written in either app because the dealer's card, the admin's
 * estate list and the push-notification body all name the same period, and three
 * implementations is how one screen says "कल" while the notification that opened
 * it said "01-09-2026".
 *
 * Behaviour is `densityDayLabel`'s (`mdg-client/src/hooks/api/useDensity.ts`),
 * deliberately, so the two are one dialect and not two: formatted in UTC against
 * a MIDDAY anchor so the phone's own time zone cannot shift the printed date off
 * the day being named, `hi-IN` / `en-IN` locales, and wrapped in try/catch
 * because a stripped-down Android WebView can throw on a locale its ICU data
 * does not carry. A date that prints as `2026-08-28` is survivable; a screen
 * that does not render is not.
 *
 * TWO DELIBERATE DIVERGENCES FROM `densityDayLabel`, both with a reason:
 *
 *  1. Hindi takes the FULL month name, English the abbreviated one — "28 अगस्त"
 *     against "28 Aug". Hindi's short form is an abbreviation-mark spelling
 *     ("अग॰") that saves two characters and costs legibility, which is a bad
 *     trade on a card a 55-year-old reads once. Hindi runs about 35% longer than
 *     English in general, so everything else here is kept as short as it can be.
 *  2. Today and yesterday get words — "आज"/"Today", "कल"/"Yesterday" — where
 *     `densityDayLabel` always prints the number. Its comment is right that "कल"
 *     means yesterday and tomorrow both; that ambiguity is closed HERE by the
 *     fact that an ask's period can never be in the future (you cannot owe a
 *     paper for a day that has not happened), and by the shape of the function
 *     below: ONLY today and the day before it get a word at all. Every other
 *     key — a future one included, should one ever reach here — prints its
 *     date, so there is no reading of "कल" on this card that could mean
 *     tomorrow.
 *
 * `today` is REQUIRED and is an IST calendar day. There is no default on
 * purpose: the production box runs UTC, and "today" on a UTC box is yesterday
 * for five and a half hours of every Indian evening.
 */
export function documentPeriodLabel(
  periodKind: DocumentPeriodKind,
  periodKey: string,
  lang: DocumentAskLang,
  today: string,
): string {
  // The freeform suffix names the ASK, not the period; the label names the
  // period, so the suffix is dropped before anything is formatted.
  const base = documentPeriodBaseKey(periodKey);
  if (periodKind === 'NONE') return '';
  // A year is the same four digits in both languages, so nothing is gained by
  // sending it through a formatter that can throw.
  if (periodKind === 'YEAR') return base;

  if (periodKind === 'MONTH') {
    // No "this month" / "last month" here, unlike the day words above. A month
    // name is already short and already unambiguous, and a relative word on a
    // card the dealer opens four days later makes them work out which month it
    // meant.
    return formatIst(`${base}-01`, lang, { month: 'long', year: 'numeric' }, base);
  }

  if (base === today) return lang === 'hi' ? 'आज' : 'Today';
  if (base === previousDay(today)) return lang === 'hi' ? 'कल' : 'Yesterday';
  return formatIst(base, lang, { day: 'numeric', month: lang === 'hi' ? 'long' : 'short' }, base);
}

/** The IST calendar day before `istDate`, `YYYY-MM-DD`. Midday-anchored, so no DST or roll-over. */
function previousDay(istDate: string): string {
  const t = Date.parse(`${istDate}T12:00:00Z`);
  if (Number.isNaN(t)) return '';
  return new Date(t - 86_400_000).toISOString().slice(0, 10);
}

/**
 * Format a `YYYY-MM-DD` in the dealer's language, falling back to `fallback`
 * when the date will not parse or the platform has no data for the locale.
 */
function formatIst(
  isoDay: string,
  lang: DocumentAskLang,
  options: Intl.DateTimeFormatOptions,
  fallback: string,
): string {
  const t = Date.parse(`${isoDay}T12:00:00Z`);
  if (Number.isNaN(t)) return fallback;
  try {
    return new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', {
      ...options,
      timeZone: 'UTC',
    }).format(new Date(t));
  } catch {
    return fallback;
  }
}

/* ═══════════════════════════ The HTTP surface ═══════════════════════════════ */

/**
 * Where a row on the dealer's list CAME from.
 *
 * The dealer must never see two lists. "MDG needs this paper from you" is one
 * idea, and it has three sources today — a real `DocumentAsk` row, a Kavach
 * evidence request (`KavachItem.request`, which is strictly 1:1 with a task and
 * therefore cannot be an ask), and a period a recurring kind says is owed but
 * that nobody has made a row for yet. Splitting those across three screens would
 * make a 55-year-old pump owner learn our data model in order to answer a
 * question about a piece of paper.
 *
 *  - `ask`    — a `DocumentAsk`. `id` is its ObjectId.
 *  - `kavach` — a projection of `KavachItem.request`. Read-only here: it is
 *               submitted through the Kavach route, and its `id` is PREFIXED
 *               (`kavach:<itemId>`) so a bare ObjectId from this list can never
 *               be mistaken for an ask id and posted at an ask route.
 *  - `owed`   — DERIVED, not stored. There is no row anywhere; the rule says the
 *               period should have been satisfied and the source says it was
 *               not. `id` is `owed:<kindCode>:<periodKey>`, which is a label,
 *               not a handle — nothing may be looked up by it.
 */
export type DocumentAskRowSource = 'ask' | 'kavach' | 'owed';

/**
 * One line on the dealer's own list.
 *
 * `state` is OPTIONAL and that is deliberate: an `owed` row has no state,
 * because it has no row. Whose turn it is comes from `waitingOn`, which every
 * source can answer — see {@link documentAskWaitingOn}.
 */
export interface DealerDocumentAskRow {
  /** `<objectId>` | `kavach:<itemId>` | `owed:<kindCode>:<periodKey>`. */
  id: string;
  source: DocumentAskRowSource;
  /**
   * WHERE TO POST THE ANSWER — the path this row is sent through, chosen by the
   * SERVER and read straight out of the payload.
   *
   * The client must never decide this with an `if` on `source`. Three sources
   * already post to three different routes, and the moment a fourth arrives
   * (or the Kavach path moves) an older bundle would keep posting to the route
   * it was built against and the dealer's paper would 404 with no way for them
   * to tell why. A path in the payload means the server can move a route and
   * every installed app follows on its next list refresh.
   */
  submitVia: string;
  /** The catalog code, or the Kavach template code for a projected row. */
  kindCode: string;
  /** Frozen at the ask, live from the catalog for a projected or owed row. */
  titleEn: string;
  titleHi: string;
  hintEn: string;
  hintHi: string;
  confirmEn: string;
  confirmHi: string;
  periodKind: DocumentPeriodKind;
  periodKey: string;
  /** The period in words, in this dealer's language. Never a raw `2026-09-02`. */
  periodLabel: string;
  /** Absent on an `owed` row: there is no row, so there is no state. */
  state?: DocumentAskState;
  waitingOn: 'dealer' | 'mdg' | 'none';
  /** What MDG asked for, in the admin's words. Required for a freeform kind. */
  label?: string;
  /** The admin's message, shown under the title, verbatim. */
  note?: string;
  /** IST calendar day. Passing it is NOT a transition — the card just reads late. */
  dueOn?: string;
  /** True when `dueOn` has gone by and it is still the dealer's turn. */
  late: boolean;
  askedCount: number;
  submittedAt?: string;
  /** Shown VERBATIM. It is the only thing telling the dealer what to do next. */
  rejectReason?: string;
  /**
   * `admin` means a person at MDG looked. `system` means a machine signal
   * settled it and nobody did. The card says which — "MDG ने देख लिया" against
   * "मिल गया" — because collapsing them publishes a claim MDG never made.
   */
  reviewedByKind?: 'admin' | 'system';
  reviewedAt?: string;
  updatedAt?: string;
}

/** A kind the dealer may send unprompted, in their own language, in list order. */
export interface DealerDocumentKindOption {
  code: string;
  titleEn: string;
  titleHi: string;
  hintEn: string;
  hintHi: string;
  confirmEn: string;
  confirmHi: string;
  periodKind: DocumentPeriodKind;
  freeform: boolean;
  srNo: number;
}

/**
 * The whole dealer screen in ONE response.
 *
 * The catalog rides along rather than sitting behind a second request because
 * the screen cannot draw its "send something" sheet without it, and a second
 * round trip on a forecourt 2G connection is a second chance to fail.
 */
export interface DealerDocumentAskList {
  rows: DealerDocumentAskRow[];
  /** What this dealer may volunteer. Already filtered by `dealerVisible`. */
  kinds: DealerDocumentKindOption[];
  /** The IST day the labels above were formatted against. */
  today: string;
}

/**
 * What one dealer's cell says in the estate view.
 *
 * `NOT_ON_SERVICE` and `NOT_SENT` are the two answers no collection can give on
 * its own, and they are the reason this view is an ANTI-JOIN rather than a list:
 * a dealer who has sent nothing has no row, so a screen built straight from the
 * rows would show a clean estate that never happened.
 *
 *  - `NOT_ON_SERVICE` — we do not run this service for them, so this paper was
 *                       never theirs to send. A PAUSED attachment counts as not
 *                       attached: a paused service is not running, and chasing a
 *                       dealer for a page from a service we switched off is the
 *                       class of lie this feature exists to prevent.
 *  - `NOT_SENT`       — attached, nothing received, and nobody has even asked.
 *  - `RECEIVED`       — the SOURCE says the period is satisfied although no ask
 *                       was ever made. A dealer photographing their register
 *                       every morning creates no ask at all, and must not be
 *                       shown as missing for doing exactly the right thing.
 *  - anything else    — the real ask's own state.
 */
export type DocumentAskEstateStatus = 'NOT_ON_SERVICE' | 'NOT_SENT' | 'RECEIVED' | DocumentAskState;

/** One dealer's line in the estate view for a single (kind, period). */
export interface DocumentAskEstateRow {
  dealerId: string;
  /** A dealer IS its code. */
  dealerCode: string;
  status: DocumentAskEstateStatus;
  waitingOn: 'dealer' | 'mdg' | 'none';
  /** Present only when a real ask row exists — the handle every admin action takes. */
  askId?: string;
  askedCount: number;
  dueOn?: string;
  late: boolean;
  submittedAt?: string;
  reviewedByKind?: 'admin' | 'system';
}

/** The estate view: one row per LIVE dealer, ordered `2E, 3E, 15E`. */
export interface DocumentAskEstatePage {
  mode: 'estate';
  kindCode: string;
  periodKey: string;
  periodLabel: string;
  rows: DocumentAskEstateRow[];
  /** How many of the rows are somebody's turn — the number the header states. */
  outstanding: number;
}

/** One ask as an admin reads it: the row, plus the dealer it belongs to. */
export interface AdminDocumentAskRow extends DocumentAsk {
  titleEn: string;
  titleHi: string;
  periodLabel: string;
  waitingOn: 'dealer' | 'mdg' | 'none';
  late: boolean;
  /** True when the live submission is an image the reviewer can render in place. */
  hasFile: boolean;
}

/**
 * A keyset page of asks.
 *
 * `nextCursor`, never a page number. Rows are being accepted and rejected while
 * an admin pages through them, and an offset silently skips the work that
 * shifted under the cursor — the lesson `services/kavach/workQueue.ts` records
 * and the reason its own pagination is keyset.
 */
export interface AdminDocumentAskPage {
  mode: 'rows';
  rows: AdminDocumentAskRow[];
  nextCursor?: string;
}

/* ═══════════════════════ How the estate table reads ═════════════════════════ */

/**
 * THE MARK BESIDE A ROW — whose move it is, drawn so that colour is never the
 * only thing carrying it.
 *
 * This is the distinction the product draws NOWHERE today, and it is the whole
 * point of the admin's estate table: MDG's own backlog and the dealer's must not
 * share a colour, or a screen full of amber says "chase forty dealers" when
 * thirty of those rows are sitting in our own review queue. Every mark therefore
 * differs in SHAPE as well as in colour — a filled disc, a hollow ring, a tick,
 * a cross, a dash — because roughly one man in twelve cannot separate the amber
 * from the green, and because a printed or screenshotted list loses colour
 * entirely.
 *
 * Resolved here rather than in either app so the dealer's card and the admin's
 * table cannot come to disagree about who is holding a paper up. The rule is
 * {@link documentAskWaitingOn}'s, widened to the two answers no collection can
 * give on its own (`NOT_ON_SERVICE`, `NOT_SENT`) — see
 * {@link DocumentAskEstateStatus}.
 *
 *  - `THEM`           ● amber   — the dealer's turn. We are waiting on them.
 *  - `US`             ○ slate   — MDG's turn. They have sent it and we have not
 *                                 looked. Deliberately a HOLLOW ring: our own
 *                                 backlog should not read as an alarm about the
 *                                 dealer.
 *  - `HAVE`           ✓ green   — we have the paper. Accepted, or the service's
 *                                 own store says the period is satisfied.
 *  - `CLOSED`         ✕ slate   — over, and nothing came of it: expired
 *                                 unanswered, or withdrawn.
 *  - `NOT_APPLICABLE` — dashed  — this paper was never theirs to send, because
 *                                 we do not run that service for them.
 *
 * `CLOSED` is a FIFTH mark and not a fold into one of the other four, which is
 * worth stating because the first draft of this table had four. An expired ask
 * is not `NOT_APPLICABLE` — the dealer was on the hook and the paper never came,
 * and drawing it as "not on this service" would quietly clear MDG's own record
 * of a request that went unanswered. It is obviously not `HAVE`. And it is not
 * `THEM`, because nobody is waiting any more. It needs its own mark or the table
 * lies about one of those three things.
 */
export type DocumentAskMark = 'THEM' | 'US' | 'HAVE' | 'CLOSED' | 'NOT_APPLICABLE';

/**
 * The mark one estate cell carries. Total over {@link DocumentAskEstateStatus}.
 *
 * The three synthetic statuses are decided here because no collection can
 * produce them; every REAL state is then handed to {@link documentAskWaitingOn},
 * which is the one authority in this repo on whose turn it is. Delegating rather
 * than re-listing the states is the whole point: a second copy of that rule is
 * how the dealer's card and the admin's table come to disagree about who is
 * holding a paper up, and each screen would look right on its own.
 */
export function documentAskMark(status: DocumentAskEstateStatus): DocumentAskMark {
  // This paper was never theirs to send.
  if (status === 'NOT_ON_SERVICE') return 'NOT_APPLICABLE';
  // The dealer's turn even though nobody has asked yet: the recurring kind says
  // the period is owed, and "we have not got round to asking" is not a fact the
  // estate view should hide behind a neutral mark.
  if (status === 'NOT_SENT') return 'THEM';
  // The anti-join's honest answer: no ask was ever made, but the service's own
  // store has the paper. A dealer photographing their register every morning
  // must not read as missing for doing exactly the right thing.
  if (status === 'RECEIVED') return 'HAVE';

  // Held in a const rather than switched on the call directly: the exhaustive
  // `never` check below only narrows a value TypeScript can track, and a second
  // call would be a fresh, unnarrowed expression.
  const turn = documentAskWaitingOn(status);
  switch (turn) {
    case 'dealer':
      return 'THEM';
    case 'mdg':
      return 'US';
    case 'none':
      // Nobody's turn splits two ways and the split is the reason `CLOSED`
      // exists: an accepted paper is one MDG holds, and an expired or withdrawn
      // one is a request that produced nothing. One mark for both would either
      // claim we have a document we do not, or bury an unanswered request among
      // the completed ones.
      return status === 'ACCEPTED' ? 'HAVE' : 'CLOSED';
    default: {
      // A `waitingOn` value added with no arm here stops compiling rather than
      // falling through to some default mark and telling an admin the wrong
      // story about whose desk a paper is sitting on.
      const unhandled: never = turn;
      return unhandled;
    }
  }
}

/**
 * Sort order for the estate table: PROBLEMS FIRST.
 *
 * An admin opens this screen because something is wrong, so the rows that are
 * wrong lead and the rows that are fine sink. The order is deliberate and each
 * step of it is a judgement:
 *
 *   0  ASKED and past its due date — we asked, the day we named has gone, and
 *      nothing has come. The only rank that is about a clock.
 *   1  REJECTED — we looked, we said why, and the ball is back with them. It
 *      leads the rest of the open rows because it is the newest event on its
 *      row: somebody at MDG has already spent time on it.
 *   2  ASKED, and NOT_SENT (the derived "owed") — open, not yet late.
 *   3  SENT — waiting on US. Below the dealer's rows on purpose: this table's
 *      first question is "who has not sent", and the review queue is the same
 *      table with the status filter moved.
 *   4  ACCEPTED and RECEIVED — done.
 *   5  WITHDRAWN and EXPIRED — over, nothing came.
 *   6  NOT_ON_SERVICE — never theirs to send. Last, because it is not a state
 *      of an obligation at all; it is the absence of one, and a screenful of
 *      dealers who were never asked would bury the handful who were.
 *
 * A late REJECTED row stays at 1 rather than being promoted to 0. `dueOn` is not
 * cleared when a submission is sent back — only `expiresAt` is given a fresh
 * window — so a rejected row can carry a due date that has already gone by, and
 * promoting it would push the rows nobody has looked at yet below the rows
 * somebody already has.
 */
export function documentAskStatusRank(status: DocumentAskEstateStatus, late: boolean): number {
  if (status === 'ASKED' && late) return 0;
  switch (status) {
    case 'REJECTED':
      return 1;
    case 'ASKED':
    case 'NOT_SENT':
      return 2;
    case 'SENT':
      return 3;
    case 'ACCEPTED':
    case 'RECEIVED':
      return 4;
    case 'WITHDRAWN':
    case 'EXPIRED':
      return 5;
    case 'NOT_ON_SERVICE':
      return 6;
    default: {
      const unhandled: never = status;
      return unhandled;
    }
  }
}

/**
 * The IST calendar day a period BEGINS on, or `undefined` for a period that has
 * no day at all.
 *
 *   DAY   `2026-09-02`            → `2026-09-02`
 *   DAY   `2026-09-02:bijli-bil`  → `2026-09-02`   (the suffix names the ask)
 *   MONTH `2026-09`               → `2026-09-01`
 *   YEAR  `2026`                  → `2026-01-01`
 *   NONE  `''`                    → undefined
 *
 * This exists for {@link documentAskAge}, which needs a clock for a row that has
 * none: an estate row carries no `askedAt` — the estate is an anti-join over the
 * roster and half its rows have no ask behind them at all — so the only honest
 * answer to "how old is this?" for a missing paper is how long ago the period it
 * is for began.
 */
export function documentPeriodStartDay(
  periodKind: DocumentPeriodKind,
  periodKey: string,
): string | undefined {
  const base = documentPeriodBaseKey(periodKey);
  switch (periodKind) {
    case 'DAY':
      return /^\d{4}-\d{2}-\d{2}$/.test(base) ? base : undefined;
    case 'MONTH':
      return /^\d{4}-\d{2}$/.test(base) ? `${base}-01` : undefined;
    case 'YEAR':
      return /^\d{4}$/.test(base) ? `${base}-01-01` : undefined;
    case 'NONE':
      return undefined;
    default: {
      const unhandled: never = periodKind;
      return unhandled;
    }
  }
}

/** What the Age column may read a clock from, in the order it prefers them. */
export interface DocumentAskAgeInput {
  waitingOn: 'dealer' | 'mdg' | 'none';
  /** ISO instant the dealer sent it. The only clock that matters once it is our turn. */
  submittedAt?: string;
  /** ISO instant MDG last asked. Absent on an estate row and on a volunteered ask. */
  askedAt?: string;
  /** IST day the period begins — {@link documentPeriodStartDay}. The last resort. */
  periodDay?: string;
}

/** How long this row has been somebody's turn, and which clock said so. */
export interface DocumentAskAge {
  /** Whole days, floored, never negative. */
  days: number;
  /** Which clock the number came from, so a screen can say "waiting 4 days" honestly. */
  basis: 'sent' | 'asked' | 'period';
  /** `Today` · `1 day` · `12 days`. */
  label: string;
}

/**
 * How long has this been waiting, and on whose clock?
 *
 * AGE IS NOT ONE NUMBER, and pretending it is would make the review queue lie.
 * A row waiting on MDG has been waiting since the dealer SENT it — that is the
 * wait the admin is accountable for, and it is what the review queue sorts on. A
 * row waiting on the dealer has been waiting since we last ASKED, or, when
 * nobody has asked at all, since the period it is for began. Reading one clock
 * for both would show a register page photographed this morning as "8 days old"
 * because the ask that produced it was opened last week.
 *
 * `nowMs` is passed in rather than read from `Date.now()` so this is testable
 * without freezing a clock, and so a screen that renders a hundred rows resolves
 * "now" once instead of a hundred times and cannot show two rows measured
 * against two different instants.
 *
 * Returns `null` when nobody is waiting (accepted, expired, withdrawn — the
 * column shows a dash) and when no usable clock is on the row. A wrong number
 * here is worse than no number: this one drives which dealer gets phoned.
 */
export function documentAskAge(input: DocumentAskAgeInput, nowMs: number): DocumentAskAge | null {
  if (input.waitingOn === 'none') return null;

  const candidates: { iso: string | undefined; basis: DocumentAskAge['basis'] }[] =
    input.waitingOn === 'mdg'
      ? // Our turn: only the send matters. There is no fall-back to `askedAt`,
        // because a `SENT` row with no submission timestamp is a contradiction
        // the screen should show as a dash rather than paper over with the date
        // we happened to ask on.
        [{ iso: input.submittedAt, basis: 'sent' }]
      : [
          { iso: input.askedAt, basis: 'asked' },
          {
            iso: input.periodDay ? `${input.periodDay}T00:00:00+05:30` : undefined,
            basis: 'period',
          },
        ];

  for (const candidate of candidates) {
    if (!candidate.iso) continue;
    const then = Date.parse(candidate.iso);
    if (Number.isNaN(then)) continue;
    // Clamped at zero. A period that has only just begun, a phone whose clock is
    // a few minutes ahead of the server's, or an ask made at 23:59 all produce a
    // small negative here, and "-1 days" on a compliance screen reads as a bug in
    // the figures rather than as the rounding it is.
    const days = Math.max(0, Math.floor((nowMs - then) / 86_400_000));
    return {
      days,
      basis: candidate.basis,
      label: days === 0 ? 'Today' : days === 1 ? '1 day' : `${days} days`,
    };
  }
  return null;
}

/** The counters above the estate table. */
export interface DocumentAskEstateTally {
  /** Owed and not here: nobody has sent it, whether or not we have asked. */
  notSent: number;
  /** Sent and waiting on MDG. The review queue's size. */
  sent: number;
  /** We have it — accepted by a person, or already in the service's own store. */
  accepted: number;
  /** Sent back with a reason, waiting for them to send again. */
  rejected: number;
  /** Closed with nothing received: expired or withdrawn. */
  closed: number;
  /** Never theirs to send. Not a tile — a footnote, so the four tiles add up. */
  notOnService: number;
  /** Every row in view, so a screen can say "4 of 12" without re-counting. */
  total: number;
}

/**
 * WHAT A CAPPED LIST MAY HONESTLY SAY ABOUT ITSELF.
 *
 * The admin's flat list of requests is keyset paginated, and a page of it is a
 * PAGE — the rows after the last one are not on the screen and no amount of
 * scrolling brings them. A screen that renders that page with no caveat is
 * asserting a completeness the query did not deliver, which is the recurring
 * fault this codebase has already audited twenty-seven findings against: one
 * surface stating a figure while the thing behind it holds another.
 *
 * Two different lies are possible and they need different words:
 *
 *  - the plain cap — the tiles and the list describe the first `shown` requests
 *    and not the estate, so any number read off them is a floor and not a total;
 *  - the cap UNDER A SEARCH — far worse, because "Nothing matches this filter"
 *    over a capped set is indistinguishable on screen from "that dealer has sent
 *    everything", and an admin acts on the second when the truth was the first.
 *
 * Returns the empty string when the page IS everything, so the caller renders
 * nothing at all rather than a reassurance nobody needs to read.
 */
export function documentAskListCaveat(input: {
  /** How many rows have actually been loaded. */
  shown: number;
  /** Whether the server said there are more beyond them (a `nextCursor`). */
  hasMore: boolean;
  /** Whether a search or a filter is hiding some of the loaded rows. */
  searching: boolean;
}): string {
  if (!input.hasMore) return '';
  const head = `Showing the first ${input.shown} request${input.shown === 1 ? '' : 's'}.`;
  return input.searching
    ? `${head} A dealer further down has not been searched, so “nothing found” here does not mean nothing exists — load more, or narrow by document or status.`
    : `${head} Load more, or narrow by document or status to see the rest.`;
}

/**
 * Count the rows in view, once, in one pass.
 *
 * The four TILES are `notSent`, `sent`, `accepted` and `rejected`, and they are
 * built from the same rows the table below them draws — not from a second
 * query — so a tile can never disagree with the list under it. `closed` and
 * `notOnService` are counted here as well precisely so that the four tiles plus
 * these two account for every row: a screen that shows four numbers which do not
 * add up to the number of lines beneath them is a screen an admin stops
 * trusting.
 */
export function documentAskEstateTally(
  rows: readonly { status: DocumentAskEstateStatus }[],
): DocumentAskEstateTally {
  const tally: DocumentAskEstateTally = {
    notSent: 0,
    sent: 0,
    accepted: 0,
    rejected: 0,
    closed: 0,
    notOnService: 0,
    total: rows.length,
  };
  for (const row of rows) {
    switch (row.status) {
      case 'NOT_SENT':
      case 'ASKED':
        tally.notSent += 1;
        break;
      case 'SENT':
        tally.sent += 1;
        break;
      case 'ACCEPTED':
      case 'RECEIVED':
        tally.accepted += 1;
        break;
      case 'REJECTED':
        tally.rejected += 1;
        break;
      case 'EXPIRED':
      case 'WITHDRAWN':
        tally.closed += 1;
        break;
      case 'NOT_ON_SERVICE':
        tally.notOnService += 1;
        break;
      default: {
        const unhandled: never = row.status;
        return unhandled;
      }
    }
  }
  return tally;
}

/** The least a row needs to carry to be ordered by either comparator below. */
export interface DocumentAskTableRowLike {
  status: DocumentAskEstateStatus;
  late: boolean;
  /** A dealer IS its code, so the tie-break is on the code and never on a name. */
  dealerCode: string;
  submittedAt?: string;
}

/**
 * The estate table's own order: problems first, then `2E, 3E, 15E`.
 *
 * The tie-break is {@link compareDealerCodes} and not a plain string compare,
 * which would put `15E` above `2E` because `'1' < '2'` — the same order the
 * backend sorts the estate in, so paging or re-filtering never reshuffles rows
 * an admin has already read past.
 */
export function compareDocumentAskRows(
  a: DocumentAskTableRowLike,
  b: DocumentAskTableRowLike,
): number {
  const rank = documentAskStatusRank(a.status, a.late) - documentAskStatusRank(b.status, b.late);
  if (rank !== 0) return rank;
  return compareDealerCodes(a.dealerCode, b.dealerCode);
}

/**
 * The review queue's order: OLDEST WAIT FIRST.
 *
 * The review queue is not a second screen — it is this table with the status
 * filter moved to "Sent, waiting" — but it is the one view where problems-first
 * is the wrong order, because every row in it has the same status. What
 * separates them is how long the dealer has been waiting on MDG, and the honest
 * queue discipline for a person's backlog is first in, first out: a photograph
 * that has sat unread since Tuesday must not stay unread because a fresher one
 * keeps landing above it.
 *
 * Rows with no submission timestamp sort LAST rather than first. Ascending order
 * would otherwise put "we do not know when this arrived" at the head of the
 * queue, which is the opposite of what an unknown deserves.
 */
export function compareDocumentAskReviewRows(
  a: DocumentAskTableRowLike,
  b: DocumentAskTableRowLike,
): number {
  const left = a.submittedAt ? Date.parse(a.submittedAt) : Number.NaN;
  const right = b.submittedAt ? Date.parse(b.submittedAt) : Number.NaN;
  const leftKnown = !Number.isNaN(left);
  const rightKnown = !Number.isNaN(right);
  if (leftKnown && rightKnown && left !== right) return left - right;
  if (leftKnown !== rightKnown) return leftKnown ? -1 : 1;
  return compareDealerCodes(a.dealerCode, b.dealerCode);
}
