import { z } from 'zod';

import {
  DOCUMENT_ASK_OPENED_BY,
  DOCUMENT_ASK_STATES,
  DOCUMENT_PERIOD_KINDS,
  DOCUMENT_PERIOD_SLUG_MAX,
  DOCUMENT_SOURCES,
  documentPeriodBaseKey,
  isValidPeriodKey,
  type DocumentPeriodKind,
} from '../types/documentAsk';

import { attachmentSchema } from './chat';
import { ttBusinessDateSchema } from './ttDensity';

/**
 * Wire shapes for the Document Ask routes — "this dealer owes this paper for
 * this period".
 *
 * TWO THINGS THIS FILE DELIBERATELY DOES NOT DO
 * ---------------------------------------------
 *  1. It does NOT validate dates itself. `ttBusinessDateSchema` in
 *     `./ttDensity` is the repo's one date validator: it round-trips a
 *     `YYYY-MM-DD` through IST midday so `2026-06-31` cannot slide through as
 *     1 July, and it refuses a day that has not happened. Every period here is
 *     checked by feeding it to that schema. A second date validator is how a
 *     screen and a route come to disagree about which days exist.
 *  2. It does NOT let a client compose an ask's identity. A body carries the
 *     BASE period key and, separately, the admin's words; the route builds the
 *     final key with `periodKeyFor`. A client that composed its own key would
 *     be shipping its own slugifier, and an older bundle's slugifier putting
 *     two asks into one row (or one ask into two) is silent data loss, not an
 *     error anybody sees.
 */

/** Mirrors {@link DocumentAskState}. */
export const documentAskStateSchema = z.enum(DOCUMENT_ASK_STATES);

/** Mirrors {@link DocumentPeriodKind}. */
export const documentPeriodKindSchema = z.enum(DOCUMENT_PERIOD_KINDS);

/**
 * Mirrors {@link DocumentSourceId}. Present so the SEED can be validated; it is
 * deliberately absent from every schema an admin's request is parsed with.
 */
export const documentSourceSchema = z.enum(DOCUMENT_SOURCES);

/** Whose move it is. Derived from the state, never stored — see `documentAskWaitingOn`. */
export const documentAskWaitingOnSchema = z.enum(['dealer', 'mdg', 'none']);

/**
 * What may be attached to an ask, and how big.
 *
 * Enumerated rather than accepted as `image/*` for the same reason
 * `SLIP_PHOTO_MIME_TYPES` is: a browser canvas cannot decode HEIC, so a HEIC
 * photograph can neither be shrunk before it is sent nor shown back to whoever
 * has to check it. `application/pdf` is here because a Fire NOC arrives as a
 * scan far more often than as a photograph.
 *
 * Ten megabytes, not the route's general twenty-five. A phone photograph is
 * compressed to about a megabyte before it leaves the app; a multi-page scan is
 * not compressed at all, and past ten megabytes an upload from a forecourt
 * connection does not finish — it just fails slowly, twice, before anybody asks
 * why. Both constants live here, in the one declaration the presign route and
 * the submit route both read, so the two can never come to disagree about what
 * may be sent.
 */
export const DOCUMENT_ASK_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

/** Ten megabytes. See {@link DOCUMENT_ASK_MIME_TYPES}. */
export const DOCUMENT_ASK_MAX_BYTES = 10 * 1024 * 1024;

/**
 * The attachment on a submission: the shared chat attachment, narrowed.
 *
 * `.extend`ed rather than re-declared, so a field added to `attachmentSchema`
 * arrives here too. `audio` is dropped from `kind` because a voice note is not
 * a document, and the caps above replace the general ones.
 */
export const documentAskAttachmentSchema = attachmentSchema.extend({
  contentType: z.enum(DOCUMENT_ASK_MIME_TYPES),
  size: z.number().int().positive().max(DOCUMENT_ASK_MAX_BYTES),
  kind: z.enum(['image', 'file']),
});
export type DocumentAskAttachmentInput = z.infer<typeof documentAskAttachmentSchema>;

/** A catalog code: kebab-case slug, the only link between an ask and what it is. */
const kindCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9-]+$/, 'Code must be a slug (lower-case letters, digits, hyphens)');

/**
 * The period half of every "ask for this paper" body.
 *
 * `periodKey` is the BASE key only — `2026-09-02`, `2026-09`, `2026`, or the
 * empty string for a kind with no period. The `:<slug>` suffix that keeps two
 * freeform asks apart is composed on the server from `label`; see the file
 * header for why a client may not send it.
 */
const documentPeriodShape = {
  periodKind: documentPeriodKindSchema,
  periodKey: z.string().trim().max(32),
};

/**
 * Check a submitted period against the shipped rules.
 *
 * Three separate questions, in order, because the messages have to be
 * distinguishable to whoever is looking at a 400:
 *  - is it the right SHAPE for that kind (`isValidPeriodKey`);
 *  - is it free of the server-composed `:<slug>` suffix;
 *  - is it a real period that has already begun (the one date validator).
 */
function refineDocumentPeriod(
  v: { periodKind: DocumentPeriodKind; periodKey: string },
  ctx: z.RefinementCtx,
): void {
  if (v.periodKey.includes(':')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['periodKey'],
      message: 'Send the plain period; the server adds the rest',
    });
    return;
  }
  if (!isValidPeriodKey(v.periodKind, v.periodKey)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['periodKey'],
      message: `Not a ${v.periodKind} period`,
    });
    return;
  }
  // Realness and "has it happened yet", decided by `ttBusinessDateSchema` and
  // nothing else. A MONTH is probed by its first day and a YEAR by 1 January,
  // so asking in September for October's statement is refused for the same
  // reason, in the same place, as asking today for tomorrow's register page.
  const base = documentPeriodBaseKey(v.periodKey);
  const probe =
    v.periodKind === 'DAY'
      ? base
      : v.periodKind === 'MONTH'
        ? `${base}-01`
        : v.periodKind === 'YEAR'
          ? `${base}-01-01`
          : null;
  if (probe === null) return;
  if (!ttBusinessDateSchema.safeParse(probe).success) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['periodKey'],
      message: 'That period is not a real one, or it has not happened yet',
    });
  }
}

/**
 * What was actually asked for, in the admin's own words.
 *
 * REQUIRED by the route for a freeform kind, which the schema cannot see —
 * "A document MDG asked for" tells a dealer nothing, and that is precisely the
 * hole the staff-points catch-all works had before their merge key grew a
 * description. Capped at the slug length so the words and the key that is built
 * from them stay recognisably the same thing.
 */
const documentLabelSchema = z.string().trim().min(3).max(DOCUMENT_PERIOD_SLUG_MAX);

/**
 * THE LONGEST MESSAGE AN ADMIN MAY SEND WITH AN ASK — the one number.
 *
 * Five hundred characters, and this declaration is the only place that says so.
 * Three layers have to agree on it — the route parses with it, the textarea in
 * `AskDocumentDialog` limits to it, and `models/DocumentAsk.ts` sets
 * `maxlength` to it — and the number reached each of them by import rather than
 * by being typed again, because the failure of a second literal is asymmetric
 * and nasty:
 *
 *  - a model LOOSER than the route is merely unreachable code;
 *  - a model TIGHTER than the route accepts the body at validation and then
 *    throws a mongoose `ValidationError` at `save()`, which reaches the admin as
 *    a 500 on a request that had already passed every check it could see. The
 *    note is gone, the ask was never made, and nothing on the screen says why.
 *
 * So the two must be EQUAL, not merely compatible, and `models/DocumentAsk.test.ts`
 * asserts that they still are. 500 rather than the 400 first sketched: the note
 * is where an admin writes the one sentence that saves a phone call ("the July
 * page is missing the density column — resend that page only"), and a cap that
 * cuts such a sentence off mid-word costs more than the bytes it saves.
 */
export const DOCUMENT_ASK_NOTE_MAX = 500;

/**
 * Body for the admin's "we need this paper from you".
 *
 * `dueInDays` and not `dueOn`. The due date is an IST calendar day and the
 * server computes it, because a phone in a different time zone — or a laptop
 * whose clock is a day out — is not the authority on what "in three days" means
 * in India. Zero is legal and means today.
 */
export const createDocumentAskSchema = z
  .object({
    kindCode: kindCodeSchema,
    ...documentPeriodShape,
    label: documentLabelSchema.optional(),
    /**
     * The admin's message, shown to the dealer under the title. `.trim()` runs
     * before `.max()`, so what the model is asked to store is what was measured
     * here — a body that passes with 500 characters of whitespace padding is not
     * a 512-character note by the time it reaches `save()`.
     */
    note: z.string().trim().max(DOCUMENT_ASK_NOTE_MAX).optional(),
    dueInDays: z.number().int().min(0).max(365).optional(),
  })
  .superRefine(refineDocumentPeriod);
export type CreateDocumentAskInput = z.infer<typeof createDocumentAskSchema>;

/**
 * Body for the dealer's "here it is".
 *
 * `attachment` is REQUIRED, unlike `submitKavachEvidenceSchema`, where an empty
 * body is the legal "I've done this" claim. A Kavach submission claims an ACT
 * and can stand on the dealer's word; this one claims a PAPER, and a submission
 * with no paper on it is not a smaller version of the same event.
 */
export const submitDocumentAskSchema = z.object({
  attachment: documentAskAttachmentSchema,
  note: z.string().trim().max(1000).optional(),
  /**
   * THE RETRY KEY. One value the client mints once per send attempt and replays
   * unchanged on every retry of that same send.
   *
   * A send is three calls — presign, PUT, submit — over a forecourt connection
   * that drops. The dangerous failure is not the upload failing; it is the
   * SUBMIT succeeding and its response never arriving, so the app retries, the
   * ask is already `SENT`, and the dealer is shown a conflict about a paper they
   * successfully sent. With this, the second call recognises its own first call
   * and answers with the row it already made.
   *
   * Optional, because the storage key is a second, weaker line of defence: a
   * replayed body carries the same `ask/<dealerId>/<askId>/<uuid>` key, so an
   * identical re-post is recognised even from a client that sends no `clientRef`
   * at all. Give it anyway — a client that re-presigns before retrying gets a
   * fresh uuid, and then this is the only thing that knows the two are one send.
   */
  clientRef: z.string().trim().min(8).max(64).optional(),
});
export type SubmitDocumentAskInput = z.infer<typeof submitDocumentAskSchema>;

/**
 * Body for the admin's "this will not do".
 *
 * Ten characters, where Kavach's rejection takes four. The difference is
 * deliberate: this string is shown to the dealer VERBATIM and is the only thing
 * telling them what to do next, and "no", "blur" or "wrong" is not a sentence
 * anybody can act on. Ten is roughly "too dark, resend" — the shortest useful
 * instruction — so the floor refuses the useless without demanding an essay.
 */
export const rejectDocumentAskSchema = z.object({
  reason: z.string().trim().min(10).max(500),
});
export type RejectDocumentAskInput = z.infer<typeof rejectDocumentAskSchema>;

/**
 * Body for the dealer's "I am sending you something nobody asked for".
 *
 * It carries NO attachment, and that is a consequence of the storage key rather
 * than an oversight: an upload is filed under `ask/<dealerId>/<askId>/`, so the
 * row has to exist before there is anywhere to put the file. The order is
 * therefore: volunteer (the row is created `ASKED`, `openedBy: 'dealer'`),
 * presign, PUT, then submit. A dealer who abandons it half way leaves a row
 * nobody asked for and nobody sent — which is a true statement of what
 * happened, and one the admin list can filter on (`openedBy: 'dealer'` with
 * `askedCount: 0`).
 */
export const volunteerDocumentAskSchema = z
  .object({
    kindCode: kindCodeSchema,
    ...documentPeriodShape,
    label: documentLabelSchema.optional(),
  })
  .superRefine(refineDocumentPeriod);
export type VolunteerDocumentAskInput = z.infer<typeof volunteerDocumentAskSchema>;

/** Parses a query-string boolean ("true"/"false") without z.coerce's truthiness trap. */
const queryBoolean = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();

/**
 * Query for the estate list — "who has not sent what".
 *
 * This is the view `TtDensityDayLog`'s third index was built to allow and that
 * no route or page has ever used. It is keyset paginated — on `(periodKey desc,
 * _id asc)`, the order `GET /v1/asks` sorts and its cursor encodes — rather than
 * offset, for the same reason the Kavach work queue is: rows are being accepted
 * while an admin pages through them, and an offset silently skips the work that
 * shifted under the cursor.
 *
 * Naming `kindCode` AND `periodKey` together switches the route to the estate
 * anti-join instead, and returns one row per live dealer with no cursor at all.
 * An empty `periodKey` is a real value there (a fire NOC has no period), which
 * is why it must reach the server as a present-but-empty parameter.
 *
 * `from`/`to` bound DAY period keys only. A MONTH key (`2026-09`) sorts before
 * that month's first day as a string, so folding it into the same range would
 * quietly drop every monthly ask from an otherwise correct-looking month view —
 * filter those with an exact `periodKey` instead.
 */
export const documentAskListQuerySchema = z
  .object({
    dealerId: z.string().trim().length(24).optional(),
    /**
     * DEALER SEARCH, and it searches the CODE because a dealer IS its code —
     * the name was deleted from this product. Matched case-insensitively and by
     * prefix against the live roster, then turned into an id set, so the ask
     * query stays on an indexed `dealerId` rather than growing a `$regex` over a
     * denormalised string.
     */
    dealerCode: z.string().trim().min(1).max(24).optional(),
    kindCode: kindCodeSchema.optional(),
    state: documentAskStateSchema.optional(),
    /**
     * `admin` = we asked for it. `dealer` = they sent it unprompted. The pair
     * `openedBy: 'dealer'` + `askedCount: 0` is how the abandoned half of a
     * volunteer — a row created, then never sent — is found; see
     * `volunteerDocumentAskSchema`.
     */
    openedBy: z.enum(DOCUMENT_ASK_OPENED_BY).optional(),
    /** The distinction both apps render: whose move is it. */
    waitingOn: documentAskWaitingOnSchema.optional(),
    /** Exact match, for a MONTH, YEAR or freeform ask. */
    periodKey: z.string().trim().max(96).optional(),
    from: ttBusinessDateSchema.optional(),
    to: ttBusinessDateSchema.optional(),
    /** Only rows whose due date has gone by and that are still the dealer's turn. */
    late: queryBoolean,
    cursor: z.string().trim().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .refine((q) => !(q.from && q.to) || q.from <= q.to, {
    message: 'from must not be after to',
    path: ['to'],
  });
export type DocumentAskListQuery = z.infer<typeof documentAskListQuerySchema>;

/* ─────────────────────────────── The catalog ─────────────────────────────── */

/**
 * Everything about a catalog row that a person may author — the words, the
 * period, whether it repeats. Shared by the seed schema and the admin editor so
 * the two cannot drift.
 */
const documentKindAuthorShape = {
  srNo: z.number().int().min(0).max(100_000),
  titleEn: z.string().trim().min(1).max(200),
  /**
   * REQUIRED, not optional, exactly as in the Kavach catalog. Every
   * dealer-facing surface is Hindi-first, and a kind with no Hindi title renders
   * as an English line in the middle of a Hindi list — which is where a
   * non-technical reader stops reading.
   */
  titleHi: z.string().trim().min(1).max(200),
  hintEn: z.string().trim().min(1).max(300),
  hintHi: z.string().trim().min(1).max(300),
  confirmEn: z.string().trim().min(1).max(200),
  confirmHi: z.string().trim().min(1).max(200),
  periodKind: documentPeriodKindSchema,
  freeform: z.boolean(),
  recurring: z.boolean(),
  serviceId: z.string().trim().min(1).max(120).optional(),
  requiresService: z.boolean().optional(),
  /**
   * Whether this paper appears on the dealer's own list at all — a different
   * question from `active`, which is about retirement. See the field's comment
   * in `types/documentAsk.ts`: the gate it feeds lives in the SERVICE-LAYER
   * QUERY (`services/documents/list.ts`), not in a page, so a hidden kind's rows
   * never leave the database. Kavach put the equivalent gate in `KavachPage.tsx`
   * and consequently shipped `overallPct` to every caller until the rule was
   * moved into `kavach/dealerFacing.ts` and applied server-side.
   */
  dealerVisible: z.boolean(),
  active: z.boolean(),
};

/** A kind may only be gated on a service if it names one. */
const refineServiceGate = (k: { serviceId?: string; requiresService?: boolean }): boolean =>
  !k.requiresService || Boolean(k.serviceId);
const serviceGateIssue = {
  message: 'requiresService needs a serviceId to require',
  path: ['requiresService'],
};

/**
 * THE AUTO-ACCEPT GUARD.
 *
 * `reviewRequired: false` says an acceptance can be published without a person
 * at MDG making it. That is only ever honest when something else made it — the
 * machine signal named by `source`. A kind with `source: 'own'` and auto-accept
 * switched on would publish an acceptance MDG never made, which is an ADR 0011
 * violation ("admin or automation certifies, never the dealer") with a nice UI
 * on it.
 *
 * The guard is real rather than a tooltip because of what surrounds it:
 * `DocumentSourceId` is a CLOSED two-value enum, only the shipped seed sets it,
 * and `createDocumentKindSchema` below does not accept the field at all — so
 * every kind an admin can create is `source: 'own'`, and this refine then makes
 * `reviewRequired: false` unreachable for it. A third adapter cannot be added
 * without editing the enum, which stops the build until every switch over it is
 * updated.
 */
const refineAutoAccept = (k: { source: string; reviewRequired: boolean }): boolean =>
  k.reviewRequired || k.source !== 'own';
const autoAcceptIssue = {
  message:
    'Auto-accept needs a machine signal behind it. A kind MDG reads by hand must be reviewed.',
  path: ['reviewRequired'],
};

/**
 * A FULL catalog row, `source` included. This is what the shipped seed is
 * validated against; no request body is ever parsed with it.
 */
export const documentKindSchema = z
  .object({
    code: kindCodeSchema,
    ...documentKindAuthorShape,
    source: documentSourceSchema,
    reviewRequired: z.boolean(),
  })
  .refine(refineServiceGate, serviceGateIssue)
  .refine(refineAutoAccept, autoAcceptIssue);
export type DocumentKindInput = z.infer<typeof documentKindSchema>;

/**
 * Body for an admin adding a kind to the catalog — the whole point of the
 * catalog being three rows and not ten.
 *
 * `source` is absent and `reviewRequired` is `z.literal(true)`. Between them
 * those two lines are the auto-accept guard's teeth: an admin-created kind is
 * always `source: 'own'`, so it always needs a person to accept it, and the
 * type system says so rather than a validator catching it later.
 */
export const createDocumentKindSchema = z
  .object({
    code: kindCodeSchema,
    ...documentKindAuthorShape,
    srNo: documentKindAuthorShape.srNo.optional(),
    freeform: z.boolean().optional().default(false),
    recurring: z.boolean().optional().default(false),
    /**
     * Defaults to TRUE. A paper MDG asks a dealer for is, by default, a paper
     * the dealer is told about; hiding one has to be the deliberate act, because
     * the failure mode of the other default is a dealer being marked down for a
     * request they were never shown.
     */
    dealerVisible: z.boolean().optional().default(true),
    active: z.boolean().optional().default(true),
    reviewRequired: z.literal(true).optional().default(true),
  })
  .refine(refineServiceGate, serviceGateIssue);
export type CreateDocumentKindInput = z.infer<typeof createDocumentKindSchema>;

/**
 * Body for an admin editing a kind.
 *
 * `code` is absent on purpose: renaming it would orphan every ask filed under
 * it, exactly as renaming a Kavach template code would orphan every dealer's
 * state. Retire the row (`active: false`) and add a new one.
 *
 * `periodKind` is absent for the same reason one layer down — every existing ask
 * of this kind carries a key in the old shape, and changing the shape would make
 * those keys unreadable by the formatter that turns them into words.
 */
export const updateDocumentKindSchema = z
  .object({
    srNo: z.number().int().min(0).max(100_000).optional(),
    titleEn: z.string().trim().min(1).max(200).optional(),
    titleHi: z.string().trim().min(1).max(200).optional(),
    hintEn: z.string().trim().min(1).max(300).optional(),
    hintHi: z.string().trim().min(1).max(300).optional(),
    confirmEn: z.string().trim().min(1).max(200).optional(),
    confirmHi: z.string().trim().min(1).max(200).optional(),
    recurring: z.boolean().optional(),
    serviceId: z.string().trim().min(1).max(120).nullable().optional(),
    requiresService: z.boolean().optional(),
    dealerVisible: z.boolean().optional(),
    active: z.boolean().optional(),
    /** Only ever true — see `createDocumentKindSchema`. */
    reviewRequired: z.literal(true).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export type UpdateDocumentKindInput = z.infer<typeof updateDocumentKindSchema>;
