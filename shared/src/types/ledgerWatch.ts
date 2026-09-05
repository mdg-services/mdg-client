/**
 * Ledger Watch — the shared contract for reading a dealer's IndianOil PAD ledger
 * as more than a running balance.
 *
 * A PAD ledger is meant to be a pair. The dealer buys fuel (a DEBIT) and the
 * dealer deposits money to restore the credit (a CREDIT). That pair is what the
 * existing DOD engine already models to the paisa, and it is the only thing on
 * the ledger anybody currently sees.
 *
 * Everything else on that statement — interest on an overdue, a licence-fee
 * recovery, a participation fee, a commission IndianOil pays back, a fleet-card
 * settlement, an EMI recovery — is money moving for a reason that has nothing to
 * do with the pair. It silently changes the outstanding, and therefore the DUE
 * AMOUNT and the DUE DATE, and nobody is told. Ledger Watch classifies every
 * line, keeps the pair as the spine, and flags every other movement with its own
 * money impact and a plain sentence for an admin to review.
 *
 * LEDGER WATCH OBSERVES. IT NEVER ADJUSTS.
 * ----------------------------------------
 * Nothing in this contract feeds `availed`, `dueAmount`, `dueDate` or any other
 * figure the paisa-validated FIFO engine produces. A classification is a label
 * hung beside a row, never an input to it. If a change here can move a DOD
 * figure, the change is wrong.
 *
 * WHY THE MODEL IS `(txnType, signature, side)` AND NOT SOMETHING SIMPLER
 * ----------------------------------------------------------------------
 * This shape was not chosen for elegance. It is the smallest key that survives
 * the 3,163 live rows measured across 11 outlets (codes 0A 0B 1E 2E 3E 5E 9E 12E
 * 14E 15E 16E, Apr–Sep 2026). Three things in that data break every simpler rule
 * anyone reaches for first:
 *
 * 1. `txnType` ALONE IS NOT ENOUGH. `Billing doc.transfer` on the debit side is a
 *    fuel purchase — 573 rows, ₹3,30,235 to ₹25,11,260 — *or* a licence-fee
 *    recovery, 27 rows, ₹9,202.56 to ₹2,69,730.70. Same transaction type, same
 *    side, two classes that must never be confused: one opens a DOD lot, the
 *    other is a charge nobody was told about. Only the description separates
 *    them.
 *
 * 2. SAP NAMES LIE. `Customer credit memo` posts a DEBIT. `K0 MERCHANT CONSENT
 *    INCENTIVE-FL C` reads like income and is a charge against the dealer.
 *    `Customer debit memo` covers three unrelated fees. Never classify from the
 *    words "credit", "debit", "incentive" or "memo" — they describe SAP's own
 *    document type, not the direction the rupees moved. Classify from the triple
 *    and take the direction from {@link MovementRuleSeed.direction}, which was
 *    set by looking at which column the money actually landed in.
 *
 * 3. THE SAME SIGNATURE APPEARS ON BOTH SIDES. `Fleet- Card Posting` is 1,247
 *    credits and exactly one debit of ₹7,118.26. That one debit is a live
 *    anomaly sitting in production right now and it is the first thing this
 *    system has to catch. Which is why `side` is part of the key rather than a
 *    property of the rule: a class posted on a side it does not use is not an
 *    edge case to tolerate, it is the finding.
 *
 * Two further facts from the same measurement, recorded so nobody re-derives
 * them the hard way: `product` is only ever `''`, `BULK-HSD` or `BULK-MS`, and
 * `terminal` only `''` or `Barauni Terminal` — neither carries enough signal to
 * key a rule on. And there are zero negative and zero zero-rupee rows today, but
 * the FIFO engine already treats a negative as a reversal, so the classifier
 * must too: fold a negative amount to the opposite side first, then classify.
 *
 * WHAT A "SIGNATURE" IS
 * ---------------------
 * The stable part of a row's `doc` field, with everything that changes month to
 * month masked out — produced by `movementSignature(doc, txnType)` in
 * `mdg-backend/src/services/ledgerWatch/signature.ts`. `Int./JUN/2026 Int.
 * Post/JUN/2026` and `Int./AUG/2026 Int. Post/AUG/2026` must collapse to one
 * signature, because a rule that only matches June is not a rule. Every
 * `signature` string in this file is an EXACT normaliser output, matched with
 * `===` — none of them is a pattern, a prefix or a regular expression.
 *
 * UNITS AND FORMATS, ONCE, FOR THE WHOLE FILE
 * -------------------------------------------
 * - Every money field is a `number` of RUPEES (not paisa), compared with
 *   {@link sameMoney} and never with `===`.
 * - Every business date is a `dd-mm-yyyy` STRING, matching what
 *   `routes/v1/creditDod.ts`'s `toDmy` already puts on the wire.
 * - Every month is a `yyyy-mm` STRING.
 * - Every timestamp (`*At`) is an ISO string.
 * - Business dates are derived by the repo's IST helpers and passed in as
 *   arguments. Nothing downstream of this contract may call `new Date()` to
 *   decide what day it is.
 */

/**
 * Every class a ledger line can be put in, and nothing else.
 *
 * The list is derived from what the 3,163 measured rows actually contain, not
 * from what an accountant might expect a fuel ledger to hold. Adding a class
 * that no live row falls into buys nothing and costs a branch in every consumer;
 * a new class should arrive the day a real signature needs it.
 */
export const MOVEMENT_CLASSES = [
  /** Product supply invoice — the debit that opens a DOD lot. */
  'FUEL_PURCHASE',
  /** The dealer's own money paid back in — the credit that closes one. */
  'DEALER_DEPOSIT',
  /** Fleet / XtraPower card sales settled into the account. */
  'CARD_SETTLEMENT',
  /** IOC pays the dealer — commission, subsidy, incentive. */
  'COMMISSION',
  /** Interest charged on the outstanding. */
  'INTEREST',
  /** A charge — participation, licence, rental, consent. */
  'FEE',
  /** EMI / loan / corpus recovery. */
  'RECOVERY',
  /** A known class posted on the side it never uses, or a negative amount. */
  'REVERSAL',
  /** No rule matched; the model proposes a name, an admin decides. */
  'UNCLASSIFIED',
] as const;
export type MovementClass = (typeof MOVEMENT_CLASSES)[number];

/**
 * The two classes that ARE the buy/pay pair. Everything else is a movement.
 *
 * This is the spine of the whole product: the pair is what the dealer already
 * understands and what the DOD engine already reports, so the pair is subtracted
 * out and what remains is what nobody has ever been shown.
 */
export const PAIRED_CLASSES = ['FUEL_PURCHASE', 'DEALER_DEPOSIT'] as const;
export type PairedMovementClass = (typeof PAIRED_CLASSES)[number];

/**
 * Which column of the statement the rupees landed in.
 *
 * Read off the row's own `debit` / `credit` amounts — never inferred from the
 * SAP document type, for the reason set out in trap 2 of the header.
 */
export const MOVEMENT_SIDES = ['DEBIT', 'CREDIT'] as const;
export type MovementSide = (typeof MOVEMENT_SIDES)[number];

/**
 * Does this take money off the dealer, or put it back?
 *
 * There is deliberately no third "neither" value: every row on a PAD ledger
 * moves rupees in exactly one direction, and a nullable direction would mean
 * every screen has to render a state the data cannot produce.
 *
 * THE TRAP THIS FIELD SETS, WRITTEN DOWN SO NOBODY WALKS INTO IT: the two paired
 * classes carry a direction as well — `FUEL_PURCHASE` is `CHARGED`,
 * `DEALER_DEPOSIT` is `RECEIVED` — but they are NOT part of
 * {@link LedgerPeriodSummaryDto.charged} or `.received`, which count only the
 * non-pair rows. So "direction is CHARGED" and "included in `charged`" are two
 * different questions and the answer differs for 573 fuel invoices. Anything
 * summing this field must filter on {@link isPairedClass} first.
 */
export const MOVEMENT_DIRECTIONS = ['CHARGED', 'RECEIVED'] as const;
export type MovementDirection = (typeof MOVEMENT_DIRECTIONS)[number];

/**
 * How often this pattern is expected to appear for one dealer.
 *
 * Set from the MEASURED row counts, never from what the description implies.
 * That distinction matters because `MISSING_RECURRING` fires on `MONTHLY` and
 * nothing else: mark something monthly that only arrives when a condition is met
 * and every dealer gets a false alert every month for the rest of time. Interest
 * is the worked example — its signature literally carries a month
 * (`Int./<MON>/<YYYY>`) yet it appears in only 18 of roughly 55 dealer-months,
 * because interest is charged when there is an overdue and not otherwise. It is
 * `IRREGULAR` here, and that is not an oversight.
 *
 * - `DAILY`      — normal trading traffic; absence is meaningless.
 * - `MONTHLY`    — one per dealer per calendar month; absence is reportable.
 * - `IRREGULAR`  — real and repeating, but on no schedule this data can prove.
 * - `ONE_OFF`    — seen once or twice in the whole sample.
 */
export const MOVEMENT_RECURRENCES = ['DAILY', 'MONTHLY', 'IRREGULAR', 'ONE_OFF'] as const;
export type MovementRecurrence = (typeof MOVEMENT_RECURRENCES)[number];

/**
 * The kinds of finding a detector can raise.
 *
 * One flag is one sentence an admin reads. The kind decides which sentence gets
 * assembled and which numbers the evidence object has to carry.
 */
export const LEDGER_FLAG_KINDS = [
  /** Classified, but outside the pair — the everyday flag. */
  'OTHER_MOVEMENT',
  /** No rule matched at all. */
  'UNKNOWN_ENTRY',
  /** A class posted on a side it has never used before. */
  'WRONG_SIDE',
  /** Far from THIS dealer's own history for the same signature. */
  'AMOUNT_OUTLIER',
  /** Far from what every other dealer paid for the same signature. */
  'PEER_OUTLIER',
  /** Same signature, date and amount posted twice for one dealer. */
  'DUPLICATE',
  /** A monthly item that did not arrive this month. */
  'MISSING_RECURRING',
  /** FIFO outstanding disagrees with the portal's closing balance. */
  'RECONCILE_BREAK',
] as const;
export type LedgerFlagKind = (typeof LEDGER_FLAG_KINDS)[number];

/**
 * How hard a flag knocks on the door.
 *
 * `INFO` is the resting state of an ordinary other-movement: worth listing,
 * not worth interrupting anyone for. `NOTICE` means a number is unusual.
 * `ALERT` is reserved for the three findings that mean the ledger itself is
 * saying something impossible — an unnameable line, a class on the wrong side,
 * or a balance that does not reconcile.
 */
export const LEDGER_FLAG_SEVERITIES = ['INFO', 'NOTICE', 'ALERT'] as const;
export type LedgerFlagSeverity = (typeof LEDGER_FLAG_SEVERITIES)[number];

/**
 * Where a flag stands with the admin who owns it.
 *
 * `IGNORED` and `RESOLVED` are terminal by design: re-running detection must
 * refresh a flag's evidence and `lastSeenAt` without dragging it back to `OPEN`.
 * Detection runs on every credit-dod run, so a flag that resurrects is a flag
 * that gets dismissed forever after the second time it reappears.
 */
export const LEDGER_FLAG_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'IGNORED'] as const;
export type LedgerFlagStatus = (typeof LEDGER_FLAG_STATUSES)[number];

/**
 * Who put a rule in the catalogue.
 *
 * The order is also the trust order. `SEEDED` rules are in this file and were
 * measured from production. `ADMIN` rules were confirmed by a person. An
 * `AI_PROPOSED` rule is a suggested NAME for a signature nobody has seen before
 * and is written with `active: false` — it classifies nothing until an admin
 * confirms it, at which point it becomes `ADMIN`. The model never gets to decide
 * what a rupee movement is.
 */
export const MOVEMENT_RULE_SOURCES = ['SEEDED', 'ADMIN', 'AI_PROPOSED'] as const;
export type MovementRuleSource = (typeof MOVEMENT_RULE_SOURCES)[number];

/**
 * The rupee tolerance every money comparison in Ledger Watch uses.
 *
 * Same 0.05 the PAD reconciliation already uses (`automation/sdms/padLedger.ts`,
 * `services/creditDod/ledgerStore.ts`). It is restated here rather than imported
 * because those two files are off limits and `@dk/shared` cannot reach into the
 * backend anyway — but the VALUE must stay identical to theirs, or a row could
 * reconcile for the DOD engine and break for this one.
 */
export const LEDGER_MONEY_EPSILON = 0.05;

/**
 * Are two rupee amounts the same money?
 *
 * Ledger figures arrive as floats parsed out of a portal's HTML, so `===` says
 * no to two amounts that print identically. Every equality test on money in this
 * feature goes through here — duplicate detection especially, where a
 * false negative hides a double posting.
 */
export function sameMoney(a: number, b: number, epsilon: number = LEDGER_MONEY_EPSILON): boolean {
  return Math.abs(a - b) < epsilon;
}

/** Is this one of the two classes that make up the buy/pay pair? */
export function isPairedClass(movementClass: MovementClass): boolean {
  return (PAIRED_CLASSES as readonly string[]).includes(movementClass);
}

/**
 * The catalogue key for one rule, and therefore for the unique index on
 * `LedgerMovementRule`.
 *
 * Exported so the seeder, the classifier and the admin screens all build the
 * same string. The separator is U+001F (unit separator), written as an escape
 * so this file stays plain text, because every PRINTABLE candidate already
 * occurs inside real portal values: the sampled `doc` fields contain spaces,
 * hyphens, colons, slashes and underscores. A separator that can appear inside
 * a field lets two different rules collide onto one key, which classifies rows
 * under the wrong name silently. A control character cannot appear there.
 */
export const MOVEMENT_RULE_KEY_SEPARATOR = '\u001f';

export function movementRuleKey(txnType: string, signature: string, side: MovementSide): string {
  const sep = MOVEMENT_RULE_KEY_SEPARATOR;
  return `${txnType}${sep}${signature}${sep}${side}`;
}

/**
 * One pattern in the seeded rule catalogue.
 *
 * A seed is a MEASUREMENT, not an opinion. Every entry below corresponds to rows
 * that exist in production today, and the comment above each one carries the row
 * count and the rupee range it was measured over so a future reader can tell
 * whether the world has moved.
 */
export interface MovementRuleSeed {
  /** The portal's transaction type, matched EXACTLY — no trimming, no casing. */
  txnType: string;
  /**
   * The exact output of `movementSignature(doc, txnType)`, matched with `===`.
   *
   * Not a pattern. The placeholders (`<bank-ref>`, `<MON>`, `<YYYYMM>` …) are
   * literal characters the normaliser writes, not wildcards this matcher
   * expands.
   */
  signature: string;
  /**
   * The column the money lands in for THIS rule. Part of the key, not a
   * property — see trap 3 in the file header.
   */
  side: MovementSide;
  movementClass: MovementClass;
  /** Which way the rupees moved for the dealer. Read off the live rows. */
  direction: MovementDirection;
  /** What an admin sees. Short enough to be a chip on a ledger row. */
  titleEn: string;
  /** The same, in Hindi. Every dealer-facing surface in this repo is Hindi-first. */
  titleHi: string;
  /** Measured cadence, which is what `MISSING_RECURRING` keys on. */
  recurrence: MovementRecurrence;
}

/**
 * The twelve patterns that account for every one of the 3,163 rows measured on
 * 2026-09-05. Seeded idempotently on boot; an admin may deactivate one but the
 * seeder never edits a rule a person has touched.
 *
 * Ordered by row count, busiest first, so that the common path of the classifier
 * hits early and so that a reader meets the ledger the way a dealer experiences
 * it: cards, deposits and invoices are the ledger; everything below them is what
 * this product exists to surface.
 */
export const MOVEMENT_RULE_SEEDS: readonly MovementRuleSeed[] = [
  /*
   * 1,247 rows, ₹100 – ₹4,02,120. Card sales settling back into the account.
   * Sample doc: `4000569521-0000597 20260605019524` → `<fleet-card-ref>`.
   */
  {
    txnType: 'Fleet- Card Posting',
    signature: '<fleet-card-ref>',
    side: 'CREDIT',
    movementClass: 'CARD_SETTLEMENT',
    direction: 'RECEIVED',
    titleEn: 'Fleet card sales settled',
    titleHi: 'फ्लीट कार्ड की बिक्री का पैसा जमा',
    recurrence: 'DAILY',
  },
  /*
   * 1,196 rows, ₹100 – ₹25,00,000. Half of the pair: the dealer's own money.
   * Sample docs: `SBIN126236953503 SBIN0005725_00000035928648993`,
   * `IN42623356273685 ICIC0SF0002_010205017532` → `<bank-ref>`.
   */
  {
    txnType: 'Customer ECollection',
    signature: '<bank-ref>',
    side: 'CREDIT',
    movementClass: 'DEALER_DEPOSIT',
    direction: 'RECEIVED',
    titleEn: 'Deposit from the dealer',
    titleHi: 'डीलर की ओर से जमा',
    recurrence: 'DAILY',
  },
  /*
   * 573 rows, ₹3,30,235 – ₹25,11,260. The other half of the pair, and the debit
   * that opens a DOD lot.
   *
   * READ THIS BEFORE SIMPLIFYING ANYTHING: this rule and the licence-fee rule
   * below share a txnType AND a side. Drop the signature from the key and 27
   * licence-fee recoveries become fuel purchases — which would put a charge
   * nobody was told about straight into the figure the dealer is judged on.
   * Sample doc: `7009146767 ': PRODUCT SUPPLY INVOICE - SALES`.
   */
  {
    txnType: 'Billing doc.transfer',
    signature: 'PRODUCT SUPPLY INVOICE - SALES',
    side: 'DEBIT',
    movementClass: 'FUEL_PURCHASE',
    direction: 'CHARGED',
    titleEn: 'Fuel purchase invoice',
    titleHi: 'ईंधन ख़रीद का बिल',
    recurrence: 'DAILY',
  },
  /*
   * 58 rows, ₹5,842 – ₹1,58,024. IOC paying the dealer their commission for a
   * named month — roughly one per dealer per month across the sample, which is
   * why this is the one signature confident enough to be `MONTHLY`.
   *
   * Sample doc: `9200013843 ': YVR464-Dealer Commission for Aug'26`. Rule 1 of
   * the normaliser takes the text after `':` and then masks the trailing
   * month-year, so `YVR464` survives verbatim while `Aug'26` does not.
   */
  {
    txnType: 'Billing doc.transfer',
    signature: "YVR464-Dealer Commission for <MON>'<YY>",
    side: 'CREDIT',
    movementClass: 'COMMISSION',
    direction: 'RECEIVED',
    titleEn: 'Dealer commission paid',
    titleHi: 'डीलर कमीशन मिला',
    recurrence: 'MONTHLY',
  },
  /*
   * 27 rows, ₹9,202.56 – ₹2,69,730.70. The licence fee IOC recovers for the
   * site. Same txnType and side as a fuel invoice; only the description differs.
   *
   * `IRREGULAR`, not `MONTHLY`: 27 rows over 11 dealers and five months is about
   * one recovery every second month per outlet, so a monthly expectation would
   * manufacture a missing-item alert half the time.
   * Sample doc: `7009146767 ': LICENSE FEE (SSLF) RECOVERY`.
   */
  {
    txnType: 'Billing doc.transfer',
    signature: 'LICENSE FEE (SSLF) RECOVERY',
    side: 'DEBIT',
    movementClass: 'FEE',
    direction: 'CHARGED',
    titleEn: 'Licence fee (SSLF) recovered',
    titleHi: 'लाइसेंस फ़ीस (SSLF) की वसूली',
    recurrence: 'IRREGULAR',
  },
  /*
   * 26 rows, a flat ₹1,062 every time.
   *
   * The flat amount is the reason `AMOUNT_OUTLIER` needs its MAD-is-zero branch:
   * the spread of this signature's history is exactly zero, so the robust test
   * `|x − median| > 4 × MAD` can never fire, and any deviation at all — ₹1,062
   * becoming ₹1,602 — has to be flagged on the ≥ ₹1 rule instead.
   * Sample doc: `K1 PARTICIPATION FEE`.
   */
  {
    txnType: 'Customer debit memo',
    signature: 'K1 PARTICIPATION FEE',
    side: 'DEBIT',
    movementClass: 'FEE',
    direction: 'CHARGED',
    titleEn: 'K1 participation fee',
    titleHi: 'K1 पार्टिसिपेशन फ़ीस',
    recurrence: 'IRREGULAR',
  },
  /*
   * 18 rows, ₹433.64 – ₹61,565.09. Interest on the outstanding — the single
   * movement most worth telling a dealer about, since it is the price of the
   * days their DOD ran long.
   *
   * `IRREGULAR` despite the month in its own name. See {@link MovementRecurrence}:
   * 18 rows across roughly 55 dealer-months means interest lands when there is an
   * overdue, not every month, and calling it `MONTHLY` would fire
   * `MISSING_RECURRING` at every dealer who simply paid on time.
   * Sample doc: `Int./JUN/2026 Int. Post/JUN/2026`.
   */
  {
    txnType: 'Cust IntrestManually',
    signature: 'Int./<MON>/<YYYY> Int. Post/<MON>/<YYYY>',
    side: 'DEBIT',
    movementClass: 'INTEREST',
    direction: 'CHARGED',
    titleEn: 'Interest charged on the outstanding',
    titleHi: 'बकाया रकम पर ब्याज लगा',
    recurrence: 'IRREGULAR',
  },
  /*
   * 11 rows, ₹63.10 – ₹9,443.12 — a 150-fold spread on what is nominally the
   * same charge, which is exactly what `PEER_OUTLIER` exists to surface.
   *
   * TITLED "charge", NOT "incentive". The portal's own wording says INCENTIVE
   * and the money comes OFF the dealer. Copying the portal's noun here would put
   * a green-sounding word on a debit, on the one screen whose whole job is to
   * say what a dealer is being charged. This is trap 2 of the file header, made
   * concrete.
   * Sample doc: `K0 MERCHANT CONSENT INCENTIVE-FL C`.
   */
  {
    txnType: 'Customer debit memo',
    signature: 'K0 MERCHANT CONSENT INCENTIVE-FL C',
    side: 'DEBIT',
    movementClass: 'FEE',
    direction: 'CHARGED',
    titleEn: 'K0 merchant consent charge',
    titleHi: 'K0 मर्चेंट कंसेंट का शुल्क',
    recurrence: 'IRREGULAR',
  },
  /*
   * 3 rows, a flat ₹4,189. Rent on machinery at the site.
   * Sample doc: `B1 LEASING/RENTAL SERVICES MACHINA` — truncated by the portal,
   * and stored exactly as truncated. Do not "fix" it to MACHINARY; the signature
   * has to match what the portal actually prints.
   */
  {
    txnType: 'Customer debit memo',
    signature: 'B1 LEASING/RENTAL SERVICES MACHINA',
    side: 'DEBIT',
    movementClass: 'FEE',
    direction: 'CHARGED',
    titleEn: 'Machinery lease / rental charge',
    titleHi: 'मशीन के लीज़/किराए का शुल्क',
    recurrence: 'IRREGULAR',
  },
  /*
   * 2 rows, ₹3,965.78 and ₹20,669.81. Recovery of the site-modernisation loan.
   *
   * Sample doc: `2300_219758 B SITE MOD EMI upto Q3 25-26`. The signature below
   * masks `219758` to `<N>` and leaves `2300` alone, because `2300` is four
   * digits and the ≥6-digit mask does not reach it. `219758` is six digits but
   * NOT a year-month (there is no month 58), so it takes `<N>` and not
   * `<YYYYMM>` — the year-month mask must test that the token really reads as
   * `20\d\d` followed by `01`–`12` before claiming it.
   */
  {
    txnType: 'Journal Vouch Entry',
    signature: '2300_<N> B SITE MOD EMI upto Q3 25-26',
    side: 'DEBIT',
    movementClass: 'RECOVERY',
    direction: 'CHARGED',
    titleEn: 'Site modernisation EMI recovered',
    titleHi: 'साइट मॉडर्नाइज़ेशन की EMI कटी',
    recurrence: 'ONE_OFF',
  },
  /*
   * 1 row, ₹9,785. Corpus-fund EMI.
   *
   * THE CLEANEST EXAMPLE OF SAP NAMES LYING: the txnType is `Customer credit
   * memo` and the row is a DEBIT. Anything that reads the word "credit" here and
   * books this as money received puts ₹9,785 on the wrong side of the month.
   *
   * Sample doc: `EMI for Corpus Fund Month202608`. `202608` IS a real year-month,
   * so it masks to `<YYYYMM>` — which only works if the normaliser runs the
   * year-month mask BEFORE the plain `20\d\d` → `<YYYY>` mask. Run them the
   * other way round and you get `Month<YYYY>08`, which matches no rule and turns
   * a known EMI into an `UNKNOWN_ENTRY` alert every month.
   */
  {
    txnType: 'Customer credit memo',
    signature: 'EMI for Corpus Fund Month<YYYYMM>',
    side: 'DEBIT',
    movementClass: 'RECOVERY',
    direction: 'CHARGED',
    titleEn: 'Corpus fund EMI recovered',
    titleHi: 'कॉर्पस फ़ंड की EMI कटी',
    recurrence: 'ONE_OFF',
  },
  /*
   * 1 row, ₹7,118.26 — the live anomaly this product was built to catch.
   *
   * `Fleet- Card Posting` is a credit 1,247 times and a debit once. A settlement
   * clawed back is a real event, so it gets a real name rather than arriving as
   * an unnameable line — but naming it does NOT normalise it. Its class is
   * `REVERSAL`, `REVERSAL` is not a paired class, and any classification landing
   * on `REVERSAL` still raises a `WRONG_SIDE` flag at `ALERT`. The seed buys the
   * admin a sentence they can read; it does not buy the row silence.
   */
  {
    txnType: 'Fleet- Card Posting',
    signature: '<fleet-card-ref>',
    side: 'DEBIT',
    movementClass: 'REVERSAL',
    direction: 'CHARGED',
    titleEn: 'Fleet card settlement reversed',
    titleHi: 'फ्लीट कार्ड की रकम वापस ली गई',
    recurrence: 'ONE_OFF',
  },
];

/**
 * The numbers a flag's sentence was built from.
 *
 * THIS OBJECT IS THE REASON THE SENTENCES CAN BE TRUSTED. Every rupee figure in
 * a `detailEn` / `detailHi` string is formatted in code out of a field below —
 * no model, and no hand-written string, ever supplies a figure. So a sentence
 * can always be checked against the evidence beside it, and a wrong figure is a
 * bug in one formatter rather than a lie nobody can trace.
 *
 * Every field is optional because each detector fills only its own. If a
 * detector needs a number that is not here, ADD THE FIELD — do not smuggle it
 * into the sentence, and do not widen this with an index signature, which would
 * quietly undo the guarantee above.
 */
export interface LedgerFlagEvidence {
  /** The business date the detection ran for, `dd-mm-yyyy`. On every flag. */
  asOf?: string;

  // --- OTHER_MOVEMENT / UNKNOWN_ENTRY: what the portal actually printed ---
  /** The portal's transaction type, verbatim. */
  txnType?: string;
  /** The row's raw `doc` field, before normalisation. Diagnoses a bad signature. */
  rawDoc?: string;
  /** The side the row was posted on, after folding a negative amount. */
  side?: MovementSide;
  /** The `noticeAmount` threshold this flag was weighed against, in rupees. */
  noticeAmount?: number;

  // --- UNKNOWN_ENTRY: how much of this unnameable thing there is ---
  /** How many rows share this signature for this dealer. */
  rowsSeen?: number;
  /** Smallest and largest amount seen for the signature, in rupees. */
  minAmount?: number;
  maxAmount?: number;

  // --- WRONG_SIDE ---
  /** The side the matched rule uses. */
  expectedSide?: MovementSide;
  /** The side this row was actually posted on. */
  observedSide?: MovementSide;

  // --- AMOUNT_OUTLIER: this dealer against its own history ---
  /** Median of this dealer's prior amounts for the signature, in rupees. */
  median?: number;
  /** Median absolute deviation of those amounts. Zero for a flat fee. */
  mad?: number;
  /** How many prior observations the median was taken over. Never below 4. */
  observations?: number;
  /** `|amount − median|`, in rupees — the figure the sentence quotes. */
  deviation?: number;
  /** What `deviation` had to beat: `4 × mad`, or ₹1 when `mad` is zero. */
  threshold?: number;

  // --- PEER_OUTLIER: this dealer against every other dealer, same month ---
  /** Median across the other dealers for the same signature and month. */
  peerMedian?: number;
  /** MAD across those dealers. */
  peerMad?: number;
  /** How many OTHER dealers were compared. Never below 3. */
  peerDealers?: number;
  /** The cheapest and dearest that month across peers, in rupees. */
  peerMin?: number;
  peerMax?: number;

  // --- DUPLICATE ---
  /** How many identical rows share the date, signature and amount. */
  duplicateCount?: number;
  /**
   * The `rowKey` of every row in the duplicate group.
   *
   * They differ only by the store's occurrence ordinal, which exists precisely
   * because a genuine same-day repeat is possible. That is why this flag is a
   * REPORT and never a delete.
   */
  duplicateRowKeys?: string[];

  // --- MISSING_RECURRING ---
  /** The `yyyy-mm` month the item failed to appear in. */
  month?: string;
  /** The last `yyyy-mm` it was seen in for this dealer. */
  lastSeenMonth?: string;
  /** How many of the preceding months carried it. Never below 2. */
  monthsSeen?: number;
  /** What it cost the last time it did arrive, in rupees. */
  lastAmount?: number;

  // --- RECONCILE_BREAK ---
  /** What the FIFO engine computed as outstanding, in rupees. */
  outstanding?: number;
  /** What the portal printed as the closing balance, in rupees. */
  portalBalance?: number;
  /** `outstanding − portalBalance`. Compared with {@link sameMoney}, never `===`. */
  difference?: number;
}

/**
 * One finding, as stored and as served to the admin screens.
 *
 * Identity is `{ dealerId, rowKey, kind }` — a row can raise more than one kind
 * of finding, and re-running detection must update the same document rather than
 * writing a second one. For the two kinds that have no row behind them
 * (`MISSING_RECURRING`, `RECONCILE_BREAK`) the `rowKey` is synthetic:
 * `synthetic:<kind>:<signature|->:<yyyy-mm>`.
 */
export interface LedgerFlagDto {
  id: string;
  dealerId: string;
  /**
   * Denormalised for the cross-dealer inbox — a dealer IS its code, and the list
   * leads with it. Optional because a flag may be read back before the join.
   */
  dealerCode?: string | null;
  /** The ledger row this points at, or a `synthetic:` key. See above. */
  rowKey: string;
  kind: LedgerFlagKind;
  severity: LedgerFlagSeverity;
  status: LedgerFlagStatus;
  movementClass: MovementClass;
  /** The normaliser output that matched (or failed to match) a rule. */
  signature: string;
  /** The ledger row's own date, `dd-mm-yyyy`. Not the detection date. */
  date: string;
  /** Rupees. Zero for a `MISSING_RECURRING` flag, which is about an absence. */
  amount: number;
  direction: MovementDirection;
  /** The rule's name for this movement, or the detector's name for the finding. */
  titleEn: string;
  titleHi: string;
  /**
   * The one sentence an admin reads, assembled in code from
   * {@link LedgerFlagEvidence} — for example: "₹9,443.12 charged on 20-08-2026 —
   * this dealer's usual K0 Merchant Consent charge is ₹63.10."
   */
  detailEn: string;
  detailHi: string;
  evidence: LedgerFlagEvidence;
  /** When this finding first appeared. Never moves on a re-detect. */
  firstSeenAt: string;
  /** When detection last confirmed it. Moves on every run. */
  lastSeenAt: string;
  acknowledgedBy?: string | null;
  acknowledgedAt?: string | null;
  /** Free text the admin left when changing the status. */
  note?: string | null;
}

/**
 * One rule in the catalogue, as served to the admin screens.
 *
 * The `source` / `active` pair is the whole safety model: an `AI_PROPOSED` rule
 * is inert until a person confirms it. A screen that lets someone flip `active`
 * without moving `source` to `ADMIN` has broken the audit trail.
 */
export interface LedgerMovementRuleDto {
  id: string;
  txnType: string;
  /** Exact normaliser output. See {@link MovementRuleSeed.signature}. */
  signature: string;
  side: MovementSide;
  movementClass: MovementClass;
  direction: MovementDirection;
  titleEn: string;
  titleHi: string;
  /** Optional longer explanation shown when an admin opens the rule. */
  noteEn?: string | null;
  noteHi?: string | null;
  recurrence: MovementRecurrence;
  source: MovementRuleSource;
  /** Set on an `AI_PROPOSED` rule: which run produced it. */
  proposedBy?: string | null;
  /** The admin who confirmed it, and when. Both null until they do. */
  confirmedBy?: string | null;
  confirmedAt?: string | null;
  /** A rule classifies nothing while this is false. */
  active: boolean;
  createdAt: string;
  updatedAt: string;

  /**
   * Context an admin needs to judge a proposal, denormalised onto the rule so
   * the confirm screen needs no second query. Absent on seeded rules, where the
   * evidence is this file.
   */
  sampleDoc?: string | null;
  /** How many rows carry this signature, and the rupee range they span. */
  rowsSeen?: number | null;
  minAmount?: number | null;
  maxAmount?: number | null;
  /**
   * The proposing model's own confidence, 0–1. Present only on `AI_PROPOSED`
   * rules, and advisory only — it gates nothing. A confident wrong name is still
   * a wrong name, so a person confirms either way.
   */
  confidence?: number | null;
}

/** One line of the summary's class breakdown. */
export interface LedgerClassTotalDto {
  movementClass: MovementClass;
  direction: MovementDirection;
  /** How many rows of this class fell in the month. */
  rows: number;
  /** Their total, in rupees, always positive. */
  total: number;
}

/**
 * The month summary — the product's headline, and the four numbers an admin
 * reads before anything else.
 *
 * HOW THE FOUR FIGURES RELATE, because the obvious reading is wrong:
 * `fuelPurchased` and `deposited` are the PAIR and stand alone. `charged` and
 * `received` cover only the rows that are NOT the pair — so a month with
 * ₹1.2 crore of fuel invoices reports `charged` of a few thousand rupees, and
 * that is correct, not a missing figure. Adding `fuelPurchased` into `charged`
 * would bury every fee this feature exists to show under the invoices.
 *
 * `netOther = received − charged` is therefore the one number that answers the
 * question the dealer actually has: outside buying fuel and paying for it, did
 * this month take money off me or give it back?
 */
export interface LedgerPeriodSummaryDto {
  dealerId: string;
  /** Denormalised for headings — a dealer IS its code. */
  dealerCode?: string | null;
  /** The calendar month this covers, `yyyy-mm`. */
  month: string;
  /** Every live ledger row dated in the month, pair included. */
  rows: number;
  /** Of those, how many are NOT the pair — the rows this feature is about. */
  otherRows: number;
  /** Σ `FUEL_PURCHASE` debits, in rupees. */
  fuelPurchased: number;
  /** Σ `DEALER_DEPOSIT` credits, in rupees. */
  deposited: number;
  /** Σ debits of every NON-pair class, in rupees. Excludes fuel invoices. */
  charged: number;
  /** Σ credits of every NON-pair class, in rupees. Excludes deposits. */
  received: number;
  /** `received − charged`. Negative means the month took money off the dealer. */
  netOther: number;
  /**
   * The breakdown behind `charged` and `received`, one entry per class present.
   * Classes with no rows in the month are omitted rather than sent as zeroes, so
   * a pane can render the list without filtering.
   */
  byClass: LedgerClassTotalDto[];
  /** Earliest and latest row date in the month, `dd-mm-yyyy`. Null on an empty month. */
  firstDate?: string | null;
  lastDate?: string | null;
  /** When this summary was computed. */
  generatedAt: string;
}

/**
 * One dealer's line on the cross-dealer Ledger Watch page.
 *
 * A roll-up, not a flag: the page sorts by `alerts` and then by `openFlags` so
 * the outlet with an unnameable ledger line rises above the outlet with four
 * ordinary fees. The newest flag's title rides along so the row says WHAT is
 * wrong without the admin opening the dealer.
 */
export interface LedgerWatchDealerRowDto {
  dealerId: string;
  /** The outlet code, e.g. `15E`. Required here — it is the leading column. */
  dealerCode: string;
  /** The `yyyy-mm` the counts and money figures cover. */
  month: string;
  /** Flags in `OPEN` status. `ACKNOWLEDGED` is deliberately not counted here. */
  openFlags: number;
  /** Of the open ones, how many at each severity. */
  alerts: number;
  notices: number;
  infos: number;
  /**
   * Open `UNKNOWN_ENTRY` flags, called out on its own because it is the only
   * finding that means the catalogue itself is incomplete — a rule is missing,
   * not merely a number odd.
   */
  unknownEntries: number;
  /** The month's non-pair totals, in rupees. Same definitions as the summary. */
  charged: number;
  received: number;
  netOther: number;
  /** The newest open flag: when it was raised and what it says. */
  latestFlagAt?: string | null;
  latestFlagTitleEn?: string | null;
  latestFlagTitleHi?: string | null;
  latestFlagSeverity?: LedgerFlagSeverity | null;
  /** The most recent ledger row date held for this dealer, `dd-mm-yyyy`. */
  lastLedgerDate?: string | null;
  /**
   * When detection last ran for this dealer.
   *
   * Kept beside the counts so a quiet row can be told apart from a stale one:
   * zero flags checked an hour ago and zero flags because nothing has run since
   * Tuesday look identical without it.
   */
  lastCheckedAt?: string | null;
}
