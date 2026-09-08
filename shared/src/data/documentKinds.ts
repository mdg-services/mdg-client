import type { DocumentKind } from '../types/documentAsk';

/**
 * Document catalog — the shipped seed. THREE rows, and the number is the design.
 *
 * WHY THREE AND NOT TEN
 * ---------------------
 * A resistant 55-year-old whose first open of this screen shows eight
 * outstanding requests has been handed a form, not a chore. Three is small
 * enough that the list reads as "there is one thing to do", which is the only
 * shape of request anybody answers. Everything else — the bank statement, the
 * weights-and-measures certificate, the electricity bill — is a row an admin
 * adds later from the catalog editor, with no deploy and no code change. That is
 * what `createDocumentKindSchema` exists for.
 *
 * WHAT IS AND IS NOT SEEDED ON EVERY BOOT
 * ---------------------------------------
 * The seeder in `mdg-backend` MUST split its upsert the way
 * `seed/kavachTemplate.ts` does, and for the same reason: it runs on every boot,
 * so anything left under `$set` is silently reverted on the next deploy. An
 * admin would fix a clumsy Hindi hint, watch it save, and find the seed's
 * wording back next Tuesday with nothing in any log to explain it.
 *
 *   `$setOnInsert` — everything the catalog editor exposes: `titleEn/Hi`,
 *                    `hintEn/Hi`, `confirmEn/Hi`, `srNo`, `recurring`,
 *                    `serviceId`, `requiresService`, `dealerVisible`, `active`
 *                    and `reviewRequired` (plus `code`, which the filter would
 *                    supply anyway). Shipped once; after that the database wins.
 *   `$set`         — the structural fields no editor exposes and code is
 *                    authoritative for: `periodKind`, `freeform`, `source` and
 *                    `version`. Safe to correct in a release, because there is
 *                    no admin edit of them to overwrite.
 *
 * `reviewRequired` sits under `$setOnInsert` deliberately: an admin CAN turn
 * review on for `tt-register-page` (deciding they want a person to look after
 * all), and that decision must survive a deploy. They can never turn it off for
 * a `source: 'own'` kind — see the guard below.
 *
 * VALIDATION lives in `schemas/documentAsk.ts`, not here. This file stays free
 * of zod so the catalog is plain data, exactly as `data/kavachTemplate.ts` is;
 * the seeder parses each row through `documentKindSchema` before writing it, so
 * a seed row that broke the auto-accept guard would fail the boot rather than
 * ship an acceptance MDG never made.
 */
export const DOCUMENT_KIND_SEED: readonly DocumentKind[] = [
  {
    code: 'tt-register-page',
    srNo: 1,
    /**
     * THE TITLE NAMES THE PAPER; THE PERIOD NAMES THE DAY. It used to say
     * "Today's register page", and every surface that renders one of these
     * prints the title with the period after it — so a dealer four days behind
     * read "Today's register page (28 Aug)", and an ask raised for the current
     * day read "Today's register page (Today)". The day was never the title's to
     * carry: `documentPeriodLabel` already renders "Today", "Yesterday" or the
     * date, and it is right in all three cases.
     *
     * The hint and the confirm follow the title for the same reason — an ask may
     * be raised for any day up to today, so neither may assume it is this one.
     *
     * RENAMING THIS ROW IS A DATA CHANGE, NOT A DEPLOY. The seeder writes every
     * label under `$setOnInsert` so an admin's edit survives a release, which
     * means a catalogue row that already exists ignores this file. The per-ask
     * `labelSnapshot` is frozen as well. `scripts/rename-tt-register-page.ts`
     * does both.
     */
    titleEn: 'Density register page',
    titleHi: 'डेंसिटी रजिस्टर का पन्ना',
    hintEn:
      'One flat photo of that day’s density register page, with the date and every line readable.',
    hintHi: 'उस दिन के डेंसिटी रजिस्टर का पूरा पन्ना — तारीख़ और हर लाइन साफ़ दिखे।',
    confirmEn: 'Send this register page?',
    confirmHi: 'रजिस्टर का यह पन्ना भेजें?',
    periodKind: 'DAY',
    freeform: false,
    recurring: true,
    /**
     * The ONE row in the shipped seed with a machine signal behind it. The TT
     * Density day log already records whether this page was photographed, so
     * this ask is a READ ADAPTER over `TtDensityDayLog` — not a second copy of
     * the same photograph, and not a migration of it. That model, its indexes
     * and both its routers are untouched.
     */
    source: 'tt-density-register',
    reviewRequired: false,
    serviceId: 'tt-density',
    /**
     * Asking a dealer whose density register we do not run for "today's register
     * page" is setting homework nobody assigned. The kind is only offered where
     * the service is attached.
     */
    requiresService: true,
    /**
     * On the dealer's list. All three shipped kinds are — the catalog exists to
     * ask dealers for papers, so the visible case is the ordinary one. The field
     * is here so that a kind an admin adds LATER for MDG's own tracking can be
     * kept off a forecourt owner's screen without a code change, and so the gate
     * lives in the query rather than in a page.
     */
    dealerVisible: true,
    active: true,
  },
  {
    code: 'fire-noc',
    srNo: 2,
    titleEn: 'Fire NOC',
    titleHi: 'फायर एनओसी',
    hintEn: 'Every page of the fire NOC, with the date it is valid until clearly readable.',
    hintHi: 'फायर एनओसी के सारे पन्ने — जिस तारीख़ तक चालू है वह साफ़ पढ़ी जाए।',
    confirmEn: 'Send your fire NOC?',
    confirmHi: 'अपनी फायर एनओसी भेजें?',
    /**
     * NONE, not YEAR. A fire NOC is either on file or it is not; its renewal
     * date is printed on the paper and is nothing like a calendar year. Filing
     * it under `2026` would invent a period the document does not have and would
     * make the same certificate owed again every January.
     */
    periodKind: 'NONE',
    freeform: false,
    recurring: false,
    source: 'own',
    reviewRequired: true,
    dealerVisible: true,
    active: true,
    /**
     * THE WORKED EXAMPLE OF A PAPER THAT RUNS OUT, and the reason `periodKind`
     * above is NONE rather than YEAR. A fire NOC is either on file or it is not;
     * what makes it come round again is the date printed on it, not the
     * calendar. Filing it under `2026` would invent a period the certificate
     * does not have and make it owed again every January whether or not the one
     * we hold is still good.
     *
     * So the renewal is driven by `validUntil` and the ladder below, and the
     * renewal ask lands under its own `:renew-<date>` key — which is how last
     * year's NOC and this year's stay separate rows with separate evidence.
     */
    tracksValidity: true,
    /** A district fire NOC commonly runs a year. A prefill; the paper governs. */
    validityMonths: 12,
    autoRenew: true,
  },
  {
    code: 'other-document',
    srNo: 3,
    titleEn: 'A document MDG asked for',
    titleHi: 'MDG ने जो माँगा',
    hintEn: 'Photograph the whole paper MDG named, flat and in good light.',
    hintHi: 'MDG ने जो काग़ज़ बताया है, उसका पूरा पन्ना — सीधा और अच्छी रोशनी में।',
    confirmEn: 'Send this document?',
    confirmHi: 'यह काग़ज़ भेजें?',
    /**
     * DAY + freeform. The day is when we asked; the freeform slug on the period
     * key is what keeps two different "other document" asks made on the SAME day
     * from collapsing into one row. Without it the second silently overwrites
     * the first and nothing anywhere says a request was lost — the same bug the
     * staff-points catch-all works had before their merge key grew a
     * description. See `periodKeyFor`.
     */
    periodKind: 'DAY',
    freeform: true,
    recurring: false,
    source: 'own',
    reviewRequired: true,
    dealerVisible: true,
    active: true,
  },
  /**
   * THE THREE PAPERS THAT ALREADY HAVE A DATE BOX ON THE INFO TAB.
   *
   * Each names the profile field it OWNS. The Info tab has stored an expiry
   * beside the explosive licence, the DTO trade licence and the W&M licence
   * since long before any of them could be filed as a document, and two homes
   * for one date is the authoritative-figure fault this codebase has been
   * audited against once already — a screen saying a figure matters while the
   * calculation reads another.
   *
   * `profileFieldKey` settles it in the only direction that can be settled:
   * the filed paper wins and the profile entry MIRRORS it. Accepting one of
   * these writes its `validUntil` onto that field's `expiresOn`, so the Info
   * tab, the documents tab, the reminder and the AI's `outlet_profile` answer
   * are all quoting one number that one person read off one certificate.
   *
   * All three are `periodKind: 'NONE'`, `freeform: false`, `source: 'own'` and
   * `reviewRequired: true`, for the reason the fire NOC is: a licence has no
   * period, and nothing but a person at MDG can certify that the scan in front
   * of them is the licence it claims to be.
   */
  {
    code: 'explosive-licence',
    srNo: 4,
    titleEn: 'Explosive (PESO) licence',
    titleHi: 'विस्फोटक (PESO) लाइसेंस',
    hintEn: 'Every page of the PESO licence, with the date it runs to clearly readable.',
    hintHi: 'PESO लाइसेंस के सारे पन्ने — जिस तारीख़ तक चालू है वह साफ़ पढ़ी जाए।',
    confirmEn: 'Send your explosive licence?',
    confirmHi: 'अपना विस्फोटक लाइसेंस भेजें?',
    periodKind: 'NONE',
    freeform: false,
    recurring: false,
    source: 'own',
    reviewRequired: true,
    dealerVisible: true,
    active: true,
    tracksValidity: true,
    /**
     * Three years, and the ladder starts further out than the shipped 15 days
     * for the reason `DEALER_PROFILE_EXPIRY_SOON_DAYS` is sixty: a PESO renewal
     * is a district-office errand with a queue in it, and a fortnight's warning
     * is a warning nobody can act on.
     */
    validityMonths: 36,
    reminderOffsetDays: [60, 30, 15, 7, 3, 1],
    autoRenew: true,
    profileFieldKey: 'explosiveLicenceNo',
  },
  {
    code: 'dto-trade-licence',
    srNo: 5,
    titleEn: 'DTO trade licence',
    titleHi: 'DTO ट्रेड लाइसेंस',
    hintEn: 'The whole trade licence, with the date it runs to clearly readable.',
    hintHi: 'पूरा ट्रेड लाइसेंस — जिस तारीख़ तक चालू है वह साफ़ पढ़ी जाए।',
    confirmEn: 'Send your trade licence?',
    confirmHi: 'अपना ट्रेड लाइसेंस भेजें?',
    periodKind: 'NONE',
    freeform: false,
    recurring: false,
    source: 'own',
    reviewRequired: true,
    dealerVisible: true,
    active: true,
    tracksValidity: true,
    validityMonths: 12,
    reminderOffsetDays: [30, 15, 7, 3, 1],
    autoRenew: true,
    profileFieldKey: 'dtoTradeLicenceNo',
  },
  {
    code: 'wm-licence',
    srNo: 6,
    titleEn: 'Weights & Measures licence',
    titleHi: 'नाप-तौल लाइसेंस',
    hintEn: 'The whole W&M licence, with the date it is valid till clearly readable.',
    hintHi: 'पूरा नाप-तौल लाइसेंस — जिस तारीख़ तक वैध है वह साफ़ पढ़ी जाए।',
    confirmEn: 'Send your Weights & Measures licence?',
    confirmHi: 'अपना नाप-तौल लाइसेंस भेजें?',
    periodKind: 'NONE',
    freeform: false,
    recurring: false,
    source: 'own',
    reviewRequired: true,
    dealerVisible: true,
    active: true,
    tracksValidity: true,
    validityMonths: 12,
    reminderOffsetDays: [30, 15, 7, 3, 1],
    autoRenew: true,
    profileFieldKey: 'wmLicenceNo',
  },
];

/**
 * The shipped catalog version, stamped onto every seeded row.
 *
 * IT IS A STAMP, NOT PART OF THE KEY, and that is the one place this catalog
 * deliberately differs from `KAVACH_TEMPLATE_VERSION`. `DocumentKind` is unique
 * on `code` ALONE and the seeder upserts on `{ code }`, so bumping this number
 * re-stamps the existing rows rather than shipping fresh ones beside them. That
 * is required rather than convenient: `kindCode` is an ask's only link to what
 * it is — `labelSnapshot` freezes the WORDS, but "which catalog row is this"
 * resolves through the code — and two live rows sharing a code would make that
 * lookup have two answers.
 *
 * So a bump does not route around an admin's edits, and it must not be used to
 * try. The `$setOnInsert` split above is the ONLY thing protecting those edits:
 * a field moved to `$set` is reverted on the next deploy no matter what this
 * number says. Bump it to record that the shipped wording changed for outlets
 * seeded after the release, and to make `version` on a row say which release
 * first wrote it.
 */
export const DOCUMENT_KIND_SEED_VERSION = 2;
