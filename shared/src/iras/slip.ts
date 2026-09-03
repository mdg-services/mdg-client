/**
 * Reading the slip — the rules that turn a photographed pump-console slip into
 * figures a person can check against the paper in their hand.
 *
 * Every morning at 16E somebody types the whole shift in by hand: six meter
 * readings of six digits and three decimals each, off thermal paper, into a
 * phone. This module is the half of that job a machine may do — read the paper —
 * and, much more importantly, the half that decides WHICH of those readings has
 * been PROVED and which a person still has to check one at a time.
 *
 * Three layers stand between a photograph and a box on the sheet, and they are
 * deliberately of three different kinds, because a fault that gets past one of
 * them must not be the kind of fault that gets past the next.
 *
 *   1. TWO READERS, NOT ONE. The slip is read twice by two engines that fail in
 *      different ways. One of them fails by returning nothing; the other fails
 *      by returning a confident wrong number. Measured on one real blurred
 *      photograph of this very slip: the first returned nothing at all, and the
 *      second returned 54,979.890 and called it legible — the same wrong number
 *      four times running, so retrying does not catch it, and neither does
 *      asking that engine to check its own answer, because both halves of its
 *      answer come out of the one misread. Agreement between the two is
 *      therefore never treated as evidence of anything. DISAGREEMENT is the
 *      whole point: where the two differ, the reading is unprovable and is put
 *      in front of a person on its own.
 *
 *   2. THE RUPEE IDENTITY, which is the actual proof. Every nozzle block prints
 *      TWO lifetime counters one line apart — the litres and the rupees. Both
 *      are cumulative, so both are independent of when the slip was printed, and
 *      subtracting yesterday's accepted pair gives the same window twice: once
 *      in litres off the meter, and once in rupees divided by the price the slip
 *      itself prints. Those two litre figures must agree. That is arithmetic the
 *      operator can redo by hand on the dealer's own paper, and it is the only
 *      layer that catches a wrong digit using nothing but the evidence in front
 *      of them. See {@link proveWithTheMoney}.
 *
 *   3. A PERSON, always. Nothing here fills a box. This module answers "what
 *      does the paper say, and what can be proved about it"; a named admin then
 *      accepts each figure with the slip, the transcript and the arithmetic on
 *      screen, and presses Save exactly as they do today. Typing by hand always
 *      wins, and a bad slip must never block the morning.
 *
 * It lives in `@dk/shared` for the same reason the rest of this area does:
 * `mdg-admin` has no test runner at all, so a rule decided in a React component
 * is a rule nothing can pin. Everything below is pure — no clock, no IO, no
 * network — so a slip resolves the same way on the phone, on the server and in a
 * test.
 *
 * On names: to everybody who uses this, the feature is "reading the slip". No
 * vendor, product or model name appears in a single string this file can put in
 * front of a person, and none should ever be added.
 */
import { irasDayDateLabel, irasNozzleSold, irasRowIdentity } from './dayPlan';
import { validateIrasCell } from './fields';

/* ───────────────────────── what a slip block prints ─────────────────────── */

/**
 * The six figures worth reading off one nozzle's block.
 *
 * Two of them are the answer — the lifetime litres and the lifetime rupees —
 * and the other four exist only to work out the price the slip itself was
 * printed at, which is what turns the rupees into litres.
 */
export type SlipFigureKey =
  | 'cumVolume'
  | 'cumSale'
  | 'shDayVol'
  | 'shDaySale'
  | 'shMthVol'
  | 'shMthSale';

export interface SlipFigure {
  /** The digits exactly as printed, commas stripped. Never rounded, never shortened. */
  value: string | null;
  /** 0-based index into the transcript, or null. */
  lineNo: number | null;
  /** True when the number sat on the line below its label. */
  onNextLine: boolean;
}

export type SlipBlockProblem =
  | 'NOZZLE_NUMBER_UNREADABLE'
  | 'NO_CUM_VOLUME'
  | 'FIGURE_TWICE'
  | 'VALUE_MISSING'
  | 'VALUE_UNREADABLE'
  | 'RAN_OFF_THE_END'
  | 'DUPLICATE_NOZZLE';

export interface SlipBlock {
  index: number;
  headerLine: string;
  headerLineNo: number;
  nozzleNo: number | null;
  figures: Record<SlipFigureKey, SlipFigure>;
  problems: SlipBlockProblem[];
  /** Every transcript line belonging to this block, verbatim. */
  lines: string[];
}

export interface SlipParse {
  blocks: SlipBlock[];
  preamble: string[];
  looksLikeASlip: boolean;
  lineCount: number;
}

/* ───────────────────────────── folding a label ──────────────────────────── */

/**
 * The folded form of each label that matters, and of the block header's stem.
 *
 * These are the strings a folded label is compared against, and they are
 * compared by EXACT equality — never by `includes`. `CUMV01UME` ends `V01UME`;
 * every decoy on the slip ends `V01` and stops there. That one rule is what
 * keeps six lookalike labels out of the answer.
 */
export const SLIP_KNOWN_LABELS: Readonly<Record<SlipFigureKey | 'nozzle', string>> = Object.freeze({
  cumVolume: 'CUMV01UME',
  cumSale: 'CUMSA1E',
  shDayVol: 'SHDAYV01',
  shDaySale: 'SHDAYSA1E',
  shMthVol: 'SHMTHV01',
  shMthSale: 'SHMTHSA1E',
  /** The header's stem only — a header carries its number and is matched by shape. */
  nozzle: 'N0ZZ1E',
});

/**
 * The six labels on the same block that must never be mistaken for a wanted one.
 *
 * They are listed rather than ignored because the one-lost-character tolerance
 * below has to see them: a smudged `Shif2Vol` must resolve to `Shif2Vol` and
 * stop, not drift onto `ShDayVol` and put one shift's litres where a whole day's
 * belong.
 */
export const SLIP_DECOY_LABELS: readonly string[] = Object.freeze([
  'SH1F1V01',
  'SH1F2V01',
  'SH1F3V01',
  'SH1F1SA1E',
  'SH1F2SA1E',
  'SH1F3SA1E',
]);

/** The wanted six, in the order a block prints them. */
const WANTED_KEYS: readonly SlipFigureKey[] = [
  'shDaySale',
  'shDayVol',
  'shMthSale',
  'shMthVol',
  'cumVolume',
  'cumSale',
];

/** Every folded label the matcher knows: the six wanted and the six decoys. */
const ALL_KNOWN_LABELS: readonly string[] = [
  ...WANTED_KEYS.map((k) => SLIP_KNOWN_LABELS[k]),
  ...SLIP_DECOY_LABELS,
];

/**
 * A printed label reduced to the one form two different thermal heads agree on.
 *
 * A dot-matrix head on 58 mm paper cannot separate `I` from `1` from `l`, or `O`
 * from `0`, and neither can any reader looking at its output — the real reading
 * of this outlet's own slip came back as `CumVoTume`, `Nozzle Nol`, `Shif25a1e`
 * and `ShDayVo1` in one pass. So the letters are folded onto the digits they are
 * confusable with and matching happens on the folded form. The raw line is
 * always kept beside it and is what the operator is shown: the fold is for
 * deciding WHICH figure this is, never for deciding what it says.
 *
 * The digits themselves are never folded and never guessed. A digit is an
 * unambiguous glyph on this paper and a letter is not, which is the whole shape
 * of this module: fuzzy on the label, exact on the number.
 */
export function foldSlipLabel(raw: string): string {
  return (
    String(raw ?? '')
      .toUpperCase()
      // Before the strip, or the pipe is deleted rather than folded. A broken `1`
      // prints as a bare vertical stroke often enough to matter.
      .replace(/\|/g, '1')
      .replace(/[^A-Z0-9]/g, '')
      .replace(/[IL]/g, '1')
      .replace(/O/g, '0')
  );
}

/**
 * Which of the six wanted figures this label is, or `null`.
 *
 * Exact equality first. Then, and only when nothing matched exactly, ONE lost or
 * swapped character is forgiven — but only when the folded label is at least six
 * characters long and only when exactly one known label is that close. Within
 * one of two labels is not a near miss, it is an ambiguity, and an ambiguity
 * never resolves itself here: the figure is simply not found, the block reports
 * it missing, and a person types it.
 *
 * The decoys are in the comparison set for exactly that reason. `SH1F1V01` and
 * `SH1F2V01` are one character apart, so a damaged shift label sits within one
 * of two known labels and matches nothing — which is right. A rule that only
 * knew the wanted labels would have pulled it onto `SHDAYV01`.
 */
function slipFigureKeyForLabel(folded: string): SlipFigureKey | null {
  for (const key of WANTED_KEYS) {
    if (SLIP_KNOWN_LABELS[key] === folded) return key;
  }
  if (SLIP_DECOY_LABELS.includes(folded)) return null;
  if (folded.length < 6) return null;

  let onlyMatch: string | null = null;
  for (const known of ALL_KNOWN_LABELS) {
    if (editDistanceAtMostOne(folded, known)) {
      if (onlyMatch !== null) return null;
      onlyMatch = known;
    }
  }
  if (onlyMatch === null) return null;
  for (const key of WANTED_KEYS) {
    if (SLIP_KNOWN_LABELS[key] === onlyMatch) return key;
  }
  return null;
}

/**
 * Whether two strings are at most one edit apart — one substitution, one
 * insertion or one deletion.
 *
 * Written out rather than a full Levenshtein matrix because the answer needed is
 * only ever "is it 0 or 1", the strings are short and this runs once per printed
 * line on a phone.
 */
function editDistanceAtMostOne(a: string, b: string): boolean {
  if (a === b) return true;
  const diff = a.length - b.length;
  if (diff > 1 || diff < -1) return false;
  if (diff === 0) {
    let seen = 0;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i] && (seen += 1) > 1) return false;
    }
    return seen === 1;
  }
  const longer = diff === 1 ? a : b;
  const shorter = diff === 1 ? b : a;
  let i = 0;
  let j = 0;
  let skipped = false;
  while (i < longer.length && j < shorter.length) {
    if (longer[i] === shorter[j]) {
      i += 1;
      j += 1;
      continue;
    }
    if (skipped) return false;
    skipped = true;
    i += 1;
  }
  return true;
}

/* ────────────────────────────── block headers ───────────────────────────── */

/**
 * The shape a block header folds to. Anchored, never scanned.
 *
 * `N0ZZ1E` contains a `1` of its own, so a "trailing digits" rule would read the
 * bare word `Nozzle` as nozzle 1 and hang a whole block of figures on a nozzle
 * nobody named. The optional `N` and `0` absorb the `No` / `No.` / `No ` the
 * console prints between the word and the number.
 */
const SLIP_HEADER_RE = /^N0ZZ1EN?0?(\d{1,3})$/;

/** True when this line opens a nozzle block, whatever its number turns out to be. */
function isSlipHeaderLine(raw: string): boolean {
  return SLIP_HEADER_RE.test(foldSlipLabel(raw));
}

/**
 * The nozzle number a block header claims, or `null`.
 *
 * `null` for a header whose number cannot be used — `Nozzle No` with the digit
 * rubbed off folds to `N0ZZ1EN0` and would otherwise read as nozzle 0. Such a
 * line still OPENS a block (see {@link parseSlipText}): swallowing it into the
 * block above would silently merge two nozzles' figures into one block, and a
 * block that says "this is a nozzle and I cannot tell you which" is a far better
 * answer than a block quietly carrying the wrong nozzle's litres.
 *
 * Remember what this is: a CLAIM printed on paper, not a fact. Whether the
 * slip's "Nozzle No1" is this outlet's IRAS nozzle 1 is settled by the money,
 * not by the label — see {@link mapSlipToNozzles}.
 */
export function slipNozzleNoFromHeader(raw: string): number | null {
  const match = SLIP_HEADER_RE.exec(foldSlipLabel(raw));
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isInteger(n) || n < 1 || n > 999) return null;
  return n;
}

/* ─────────────────────────────── the numbers ────────────────────────────── */

/** The largest a litre counter may be, matching `TOT_READING`'s own ceiling. */
export const SLIP_MAX_LITRES = 99_999_999;

/** The largest a rupee counter may be. A lifetime till is bigger than a lifetime meter. */
export const SLIP_MAX_MONEY = 999_999_999.999;

/** The shape a cleaned number must have: digits, and at most three decimals. */
const SLIP_NUMBER_RE = /^\d+(\.\d{1,3})?$/;

/** Western grouping — `48,615.550`. */
const WESTERN_GROUPING_RE = /^\d{1,3}(,\d{3})+(\.\d+)?$/;

/** Indian grouping — `53,25,771.850`. */
const INDIAN_GROUPING_RE = /^\d{1,2}(,\d{2})+,\d{3}(\.\d+)?$/;

/**
 * A printed number as digits, exactly as printed — or `null`, which means "not
 * sure", and "not sure" is always the better answer.
 *
 * Every refusal below is a place where a wrong number could otherwise reach a
 * box, and each one is worth its line:
 *
 *   - Any character that is not a digit, a dot or a comma refuses the whole
 *     value. A question mark stands for a glyph nothing could read, so
 *     `486?5.550` is refused rather than repaired — repairing it is exactly the
 *     guess this module exists not to make.
 *   - Commas are accepted only as well-formed grouping, then stripped. A comma
 *     in the wrong place is a misread of a decimal point or of a digit, and
 *     `4,8615.550` is not a number this paper prints.
 *   - More than three decimals is refused rather than shortened. `TOT_READING`
 *     legally holds three, so a fourth is not a value to round — it is evidence
 *     that the reader saw something that is not there.
 *   - Trailing zeros are PRESERVED. `48615.550` comes back as `"48615.550"`,
 *     because the operator's only real check is holding the box against the
 *     paper character for character, and `48615.55` breaks that check on every
 *     figure of every morning until they stop making it.
 */
export function cleanSlipNumber(raw: string, opts?: { max?: number }): string | null {
  const max = opts?.max ?? SLIP_MAX_LITRES;
  const squashed = String(raw ?? '').replace(/\s+/g, '');
  if (!squashed) return null;
  if (/[^0-9.,]/.test(squashed)) return null;

  let cleaned = squashed;
  if (cleaned.includes(',')) {
    if (!WESTERN_GROUPING_RE.test(cleaned) && !INDIAN_GROUPING_RE.test(cleaned)) return null;
    cleaned = cleaned.replace(/,/g, '');
  }
  if (!SLIP_NUMBER_RE.test(cleaned)) return null;

  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0 || n > max) return null;
  return cleaned;
}

/**
 * The slip's figure as it goes into the box.
 *
 * Today this is the identity function on a cleaned value — and it exists ANYWAY,
 * so that if the rule ever changes it changes in one place a test already
 * covers, rather than in a React component the test runner cannot reach.
 *
 * The rule is: every digit the slip prints, `48615.550`, with no truncation, no
 * rounding and no trailing-zero tidying. Truncating to `48615` would put up to
 * one litre per nozzle into the day's variation every single morning; worse, it
 * would inject a litre of noise into a proof whose floor is half a litre, so
 * correct readings on a low-volume nozzle would start flagging as wrong. The
 * safety check and the truncation cannot coexist, and the safety check is the
 * point.
 */
export function slipValueForCell(cleaned: string): string {
  return String(cleaned ?? '').trim();
}

/* ─────────────────────────────── the parser ─────────────────────────────── */

const MAX_FOR_KEY: Readonly<Record<SlipFigureKey, number>> = {
  cumVolume: SLIP_MAX_LITRES,
  shDayVol: SLIP_MAX_LITRES,
  shMthVol: SLIP_MAX_LITRES,
  cumSale: SLIP_MAX_MONEY,
  shDaySale: SLIP_MAX_MONEY,
  shMthSale: SLIP_MAX_MONEY,
};

function emptyFigures(): Record<SlipFigureKey, SlipFigure> {
  const out = {} as Record<SlipFigureKey, SlipFigure>;
  for (const key of WANTED_KEYS) out[key] = { value: null, lineNo: null, onNextLine: false };
  return out;
}

/**
 * Turn a transcript of a slip into blocks of figures.
 *
 * The transcript is the authority and this function is the only thing allowed to
 * produce a number that can reach a box. Everything it does not understand it
 * keeps and ignores; nothing it is unsure of survives.
 *
 * Two guards protect the single most dangerous confusion on this paper, and both
 * are tested on their own. The console prints
 *
 *     CumVolume:
 *     48615.550
 *     CumSale :5325771.850
 *
 * so the wanted number is on the line BELOW its label while a different lifetime
 * counter — the rupees — sits directly under it. The guards are the exact folded
 * label match, which stops `CumSale` being read as `CumVolume`, and the rule
 * that a label with nothing after its colon may only take a NEXT LINE THAT IS A
 * BARE NUMBER WITH NO COLON IN IT, which stops the rupee line being swallowed as
 * the litre line's value. Either one alone would be enough on a clean slip.
 * Neither one alone is enough on a smudged one.
 */
export function parseSlipText(lines: readonly string[]): SlipParse {
  const all = (lines ?? []).map((line) => String(line ?? ''));
  const headerAt: number[] = [];
  for (let i = 0; i < all.length; i += 1) {
    if (isSlipHeaderLine(all[i]!)) headerAt.push(i);
  }

  const preamble = headerAt.length > 0 ? all.slice(0, headerAt[0]!) : all.slice();
  const blocks: SlipBlock[] = [];
  const consumed = new Set<number>();

  headerAt.forEach((start, index) => {
    const end = index + 1 < headerAt.length ? headerAt[index + 1]! : all.length;
    const figures = emptyFigures();
    const problems: SlipBlockProblem[] = [];
    const seen = new Set<SlipFigureKey>();
    const nozzleNo = slipNozzleNoFromHeader(all[start]!);
    if (nozzleNo === null) problems.push('NOZZLE_NUMBER_UNREADABLE');

    for (let i = start + 1; i < end; i += 1) {
      if (consumed.has(i)) continue;
      const line = all[i]!;
      const colon = line.indexOf(':');
      if (colon < 0) continue;

      const key = slipFigureKeyForLabel(foldSlipLabel(line.slice(0, colon)));
      if (!key) continue;

      let rawValue: string | null = null;
      let valueLineNo = i;
      let onNextLine = false;
      let problem: SlipBlockProblem | null = null;

      const sameLine = line.slice(colon + 1).trim();
      if (sameLine) {
        rawValue = sameLine;
      } else {
        const next = nextNonBlank(all, i + 1);
        if (next < 0) {
          problem = 'RAN_OFF_THE_END';
        } else if (all[next]!.includes(':') || isSlipHeaderLine(all[next]!)) {
          // Another label, or the next nozzle. This figure simply has no value,
          // and — this is the load-bearing half — the line is NOT consumed, so
          // it still parses as whatever it is in its own right.
          problem = 'VALUE_MISSING';
        } else {
          rawValue = all[next]!.trim();
          valueLineNo = next;
          onNextLine = true;
          consumed.add(next);
        }
      }

      const cleaned =
        rawValue === null ? null : cleanSlipNumber(rawValue, { max: MAX_FOR_KEY[key] });
      if (rawValue !== null && cleaned === null) problem = 'VALUE_UNREADABLE';

      if (seen.has(key)) {
        // One block printing the same label twice is a block nothing can read
        // with confidence. Picking either one is a coin toss with somebody's
        // fuel stock on it, so neither is kept.
        pushProblem(problems, 'FIGURE_TWICE');
        figures[key] = { value: null, lineNo: null, onNextLine: false };
        continue;
      }
      seen.add(key);
      figures[key] = {
        value: cleaned,
        lineNo: rawValue === null ? null : valueLineNo,
        onNextLine,
      };
      if (problem) pushProblem(problems, problem);
    }

    if (figures.cumVolume.value === null) pushProblem(problems, 'NO_CUM_VOLUME');

    blocks.push({
      index,
      headerLine: all[start]!,
      headerLineNo: start,
      nozzleNo,
      figures,
      problems,
      lines: all.slice(start, end),
    });
  });

  markDuplicateNozzles(blocks);

  return {
    blocks,
    preamble,
    looksLikeASlip: blocks.length > 0,
    lineCount: all.length,
  };
}

/**
 * Two blocks claiming one nozzle.
 *
 * Character-identical litre counters are one block printed twice — the paper
 * jammed, the photograph caught both — and collapse harmlessly, because the
 * mapper reads the first and they say the same thing. Anything else is two
 * different claims about one pump on one morning, and nothing on the paper says
 * which is this morning's. Both are marked, and the mapper then supplies no
 * value from either; the block records the problem rather than blanking the
 * figures, so the card can still print the two numbers it is refusing to choose
 * between.
 */
function markDuplicateNozzles(blocks: readonly SlipBlock[]): void {
  const byNozzle = new Map<number, SlipBlock[]>();
  for (const block of blocks) {
    if (block.nozzleNo === null) continue;
    const found = byNozzle.get(block.nozzleNo);
    if (found) found.push(block);
    else byNozzle.set(block.nozzleNo, [block]);
  }
  for (const group of byNozzle.values()) {
    if (group.length < 2) continue;
    const first = group[0]!.figures.cumVolume.value;
    const identical = first !== null && group.every((b) => b.figures.cumVolume.value === first);
    if (identical) continue;
    for (const block of group) pushProblem(block.problems, 'DUPLICATE_NOZZLE');
  }
}

function pushProblem(problems: SlipBlockProblem[], problem: SlipBlockProblem): void {
  if (!problems.includes(problem)) problems.push(problem);
}

function nextNonBlank(lines: readonly string[], from: number): number {
  for (let i = from; i < lines.length; i += 1) {
    if (lines[i]!.trim()) return i;
  }
  return -1;
}

/* ───────────────────────────── the slip's date ──────────────────────────── */

/** `31/08/2026` or `31-08-26`, anywhere in a preamble line. Separators only, never a decimal point. */
const SLIP_DATE_RE = /(\d{1,2})[-/](\d{1,2})[-/](\d{4}|\d{2})/g;

/**
 * Every date the slip prints above its first nozzle block, as `YYYY-MM-DD`.
 *
 * Only `-` and `/` are accepted as separators, so `48615.550` can never be read
 * as a date, and the characters either side of a match must not be digits, so a
 * long counter cannot have a date carved out of its middle.
 *
 * A two-digit year is read as this century. These consoles print `26`, and the
 * alternative — refusing the token — loses the one check that catches an
 * operator photographing yesterday's slip.
 */
export function slipHeaderDates(preamble: readonly string[]): string[] {
  const out: string[] = [];
  for (const line of preamble ?? []) {
    const text = String(line ?? '');
    SLIP_DATE_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = SLIP_DATE_RE.exec(text)) !== null) {
      const before = match.index > 0 ? text[match.index - 1]! : '';
      const after = text[match.index + match[0]!.length] ?? '';
      if (/\d/.test(before) || /\d/.test(after)) continue;
      const day = Number(match[1]);
      const month = Number(match[2]);
      const rawYear = match[3]!;
      const year = rawYear.length === 2 ? 2000 + Number(rawYear) : Number(rawYear);
      const iso = isoIfRealDate(year, month, day);
      if (iso && !out.includes(iso)) out.push(iso);
    }
  }
  return out;
}

/**
 * `YYYY-MM-DD`, or `''` for a token that is not a real calendar day.
 *
 * Round-tripped through the date rather than range-checked, because `31-09-2026`
 * passes every range check and is not a day. Built at UTC midday so no machine's
 * own timezone can move it — a business date here is a calendar day, never an
 * instant.
 */
function isoIfRealDate(year: number, month: number, day: number): string {
  if (!Number.isInteger(year) || year < 2000 || year > 2099) return '';
  if (!(month >= 1 && month <= 12) || !(day >= 1 && day <= 31)) return '';
  const probe = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return '';
  }
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

/* ──────────────────── the second reader's own answer ────────────────────── */

export interface SlipModelBlock {
  nozzleLabel: string;
  cumVolume: string | null;
  cumSale: string | null;
  unreadable: boolean;
}

export interface SlipModelAnswer {
  lines: string[];
  blocks: SlipModelBlock[];
  notASlip: boolean;
}

/**
 * The second reader's answer, validated — `null` when the text is not the shape
 * that was asked for. Never throws.
 *
 * Strict at the top and forgiving per block, on purpose. A missing `blocks`
 * array means the answer is unusable and the whole second opinion is dropped; a
 * single malformed block is dropped on its own, which costs nothing worse than
 * one nozzle having no second reading and therefore never being batchable. A
 * block whose `unreadable` flag is not a boolean is read as unreadable, because
 * "when in doubt, true" is the instruction that engine was given and it is the
 * safe way to read a garbled answer as well.
 */
export function parseSlipModelAnswer(raw: string): SlipModelAnswer | null {
  const text = stripCodeFence(String(raw ?? '').trim());
  if (!text) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

  const record = parsed as Record<string, unknown>;
  if (!Array.isArray(record.lines) || !Array.isArray(record.blocks)) return null;
  if (typeof record.notASlip !== 'boolean') return null;

  const blocks: SlipModelBlock[] = [];
  for (const entry of record.blocks) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const block = entry as Record<string, unknown>;
    if (typeof block.nozzleLabel !== 'string') continue;
    blocks.push({
      nozzleLabel: block.nozzleLabel,
      cumVolume: typeof block.cumVolume === 'string' ? block.cumVolume : null,
      cumSale: typeof block.cumSale === 'string' ? block.cumSale : null,
      unreadable: block.unreadable !== false,
    });
  }

  return {
    lines: record.lines.filter((line): line is string => typeof line === 'string'),
    blocks,
    notASlip: record.notASlip,
  };
}

/** A fenced JSON body, unwrapped. Cheap, and the failure it prevents is total. */
function stripCodeFence(text: string): string {
  if (!text.startsWith('```')) return text;
  const firstBreak = text.indexOf('\n');
  if (firstBreak < 0) return text;
  const end = text.lastIndexOf('```');
  return text.slice(firstBreak + 1, end > firstBreak ? end : undefined).trim();
}

/* ─────────────────────────── mapping, and proof ─────────────────────────── */

/** Half a litre, the floor under the tolerance. Below this nothing is measurable. */
export const SLIP_TOLERANCE_FLOOR_LITRES = 0.5;

/** Two per cent of the litres the money says, the tolerance above the floor. */
export const SLIP_TOLERANCE_FRACTION = 0.02;

/** No fuel in this country is sold below this, so a price under it is a misread. */
export const SLIP_PRICE_MIN = 20;

/** Nor above this. Both bounds exist to refuse a proof, never to make one. */
export const SLIP_PRICE_MAX = 250;

export interface SlipNozzleReference {
  nozzleNo: number;
  /** Yesterday's stored reading, exactly as the day plan carries it. */
  previousReading: string | null;
  /** From the product config. 14E's nozzles 6 and 9 report at 0.1. */
  meterScale?: number;
  /**
   * The rupee counter printed beside `previousReading` on the slip it came off.
   * The caller MUST pass this only when it is anchored to the same instant —
   * that is, when that slip's CumVolume for this nozzle is the identical string
   * to `previousReading`. Anything else makes the proof a lie.
   */
  previousCumSale?: string | null;
  productName?: string;
}

export type SlipProof =
  | {
      kind: 'PROVED';
      meterLitres: number;
      moneyLitres: number;
      apart: number;
      tolerance: number;
      price: number;
    }
  | {
      kind: 'DISAGREES';
      meterLitres: number;
      moneyLitres: number;
      apart: number;
      tolerance: number;
      price: number;
    }
  /** First slip for this dealer, or the stored reading was hand-corrected. */
  | { kind: 'NO_ANCHOR' }
  /** The slip's own volume figures are zero or unreadable. */
  | { kind: 'NO_PRICE' }
  /** CumSale missing on this block. */
  | { kind: 'NO_MONEY' };

/**
 * Which readers produced the digits that are being offered.
 *
 * The UI treats the three differently and so does the batch rule, so it is data
 * rather than a sentence. `null` means there is no single provenance: nothing
 * was read at all, or the two readers read different numbers.
 */
export type SlipSource = 'BOTH_AGREED' | 'OCR_ONLY' | 'MODEL_ONLY';

export type SlipNozzleOutcome =
  | 'PROVED'
  /** Read cleanly, nothing proves it. */
  | 'NEEDS_A_LOOK'
  /** The two readers differ on the digits. */
  | 'READINGS_DISAGREE'
  | 'MONEY_DISAGREES'
  | 'BACKWARDS'
  | 'UNCHANGED'
  | 'IDENTITY_CONFLICT'
  | 'DUPLICATE'
  | 'UNREADABLE'
  | 'MISSING_FROM_SLIP';

export interface SlipReadingForNozzle {
  nozzleNo: number;
  productName: string | null;
  outcome: SlipNozzleOutcome;
  /** Batchable only when this is true. True only for outcome 'PROVED'. */
  batchable: boolean;
  /**
   * Whether this card may offer "Use this reading" at all — the one place that
   * question is answered, so the button, the batch list and
   * {@link slipFillsForSheet} cannot disagree about it.
   *
   * False when there is no figure to offer, when the card is one the screen puts
   * no accept button under (a meter that ran backwards, two blocks for one
   * nozzle, a figure that fits a different pump) and — the reason this flag
   * exists rather than a set of outcomes — when the ONLY reader that produced
   * these digits was the second one and nothing on the paper checked them. See
   * {@link canBeAcceptedAsRead}.
   *
   * Typing is offered on every card whatever this says, so refusing one figure
   * the button costs nobody their morning — it costs the keystrokes they would
   * have spent anyway had the slip photographed badly.
   */
  acceptable: boolean;
  /** The digits exactly as the slip prints them, or null. Never rounded. */
  value: string | null;
  previousReading: string | null;
  soldLitres: number | null;
  proof: SlipProof;
  /**
   * Which readers produced the digits on this card, so the screen can say so on
   * every one of them. `null` when the two readers read different digits, or
   * when neither could read the block at all.
   *
   * Set on EVERY reading, including the ones that fill nothing: where a figure
   * came from is the first thing a person needs to know about it, and a card
   * that shows digits without saying who read them is how a number nothing saw
   * comes to look like a number off the paper.
   */
  source: SlipSource | null;
  /** The second reader's own reading, so the card can print both when they differ. */
  modelValue: string | null;
  /** Verbatim transcript lines for this block. */
  lines: string[];
  fromLineNos: number[];
  /** Plain words. Always non-empty when outcome is not 'PROVED'. */
  message: string;
  /**
   * Whether this reading goes into its box. See {@link fillsItsBox} — this is
   * the ONLY thing the screen has to look at, decided once, here.
   */
  fills: boolean;
  /** Why the box was left alone, for the diagnostics block. Null when it fills. */
  whyNotFilled: string | null;
}

export type SlipProblem =
  | 'NOT_A_SLIP'
  | 'NUMBERING_SUSPECT'
  | 'NOTHING_READ'
  | 'ANSWER_UNUSABLE'
  | 'ALL_UNCHANGED'
  | 'DATED_ANOTHER_DAY'
  /** No date could be read at the top of the slip, so nothing dates it at all. */
  | 'DATE_NOT_READ';

export interface SlipReading {
  readings: SlipReadingForNozzle[];
  notInLayout: Array<{ nozzleNo: number; value: string | null; message: string }>;
  preamble: string[];
  headerDates: string[];
  problems: SlipProblem[];
  /** True when nothing at all may be filled in. */
  refuseWholeSlip: boolean;
  /** One sentence for the panel heading. */
  summary: string;
}

export interface SlipMapInput {
  parse: SlipParse;
  /** null when the second reader's answer was missing or unusable. */
  model: SlipModelAnswer | null;
  nozzles: readonly SlipNozzleReference[];
  businessDate: string;
  previousDate: string | null;
}

/**
 * What the slip says about each of this outlet's nozzles, and what can be proved
 * about it.
 *
 * The order below is the order the operator's questions come in, and it is not
 * arbitrary: a reading that is not there cannot be backwards, a backwards
 * reading is wrong whoever read it and whatever the money says, and a figure the
 * two readers disagree about is not a figure at all yet. Only once none of those
 * apply does the money get asked, because only then is there one number to ask
 * about.
 *
 * Nothing here decides on its own that a slip is good. `batchable` — the only
 * flag that lets a figure be accepted in a batch rather than one card at a time
 * — is true only when BOTH readers produced the identical digits AND the rupees
 * printed on the same block prove them. One reader agreeing with itself, or one
 * reader with no second opinion at all, is never enough for a batch; those
 * readings are still offered, one at a time, with the arithmetic on screen.
 */
export function mapSlipToNozzles(input: SlipMapInput): SlipReading {
  const parse = input.parse ?? { blocks: [], preamble: [], looksLikeASlip: false, lineCount: 0 };
  const model = input.model ?? null;
  const references = input.nozzles ?? [];
  const previousLabel = irasDayDateLabel(input.previousDate ?? '') || 'the previous day';

  const blocksByNozzle = new Map<number, SlipBlock[]>();
  for (const block of parse.blocks ?? []) {
    if (block.nozzleNo === null) continue;
    const found = blocksByNozzle.get(block.nozzleNo);
    if (found) found.push(block);
    else blocksByNozzle.set(block.nozzleNo, [block]);
  }

  const modelByNozzle = new Map<number, SlipModelBlock[]>();
  for (const block of model?.blocks ?? []) {
    const nozzleNo = slipNozzleNoFromHeader(block.nozzleLabel);
    if (nozzleNo === null) continue;
    const found = modelByNozzle.get(nozzleNo);
    if (found) found.push(block);
    else modelByNozzle.set(nozzleNo, [block]);
  }

  /* Every nozzle's own facts, gathered before a word is written about any of
   * them, because the identity check has to run one nozzle's figure against
   * every other nozzle's history. */
  const resolved = references.map((reference) =>
    resolveOneNozzle(reference, blocksByNozzle, modelByNozzle),
  );

  const readings: SlipReadingForNozzle[] = resolved.map((entry) =>
    describeOneNozzle(entry, resolved, model, previousLabel),
  );

  /* ── the whole-slip guards ──────────────────────────────────────────────── */

  const problems: SlipProblem[] = [];
  let refuseWholeSlip = false;

  if (model?.notASlip === true) {
    // The second reader is only ever allowed to veto, and this is the one veto
    // it can cast over the whole photograph. It costs an operator one retake and
    // it is the cheapest thing in this file.
    problems.push('NOT_A_SLIP');
    refuseWholeSlip = true;
  }
  /*
   * Asked of the PAPER, not of what survived the checks below it. A slip whose
   * every figure is refused for a reason has been read and has something to
   * show; a slip nothing came off at all has not, and only the second of those
   * is "we could not read this".
   *
   * And asked of the TRANSCRIPT alone, which is the half of this that is
   * load-bearing. The second reader is a veto and never a source, so it may not
   * talk this guard out of firing either. The measurement: on one real blurred
   * photograph the on-box reader replaced every low-confidence line with a
   * question mark and left one nozzle heading standing, so the paper still
   * parsed as a slip with one block on it and not one digit in it — while the
   * second reader returned 54,979.890 for every nozzle, the same wrong number
   * four times running, against a truth of 48,615.550. Letting its digits
   * satisfy "something was read" put six invented figures in front of an
   * operator under a sentence blaming the dealer's paper.
   *
   * A single block nobody could read is a smudge and is handled one card at a
   * time. Not one litre counter off the whole paper is a photograph that was not
   * read, and the honest answer to that is a retake.
   */
  const anyDigits = (parse.blocks ?? []).some((b) => b.figures.cumVolume.value !== null);
  if (!parse.looksLikeASlip || !anyDigits) {
    problems.push('NOTHING_READ');
    refuseWholeSlip = true;
  }
  if (model === null) problems.push('ANSWER_UNUSABLE');

  const withValue = readings.filter((r) => r.value !== null);
  if (withValue.length > 0 && withValue.every((r) => r.outcome === 'UNCHANGED')) {
    // The wrong-shift guard. Six readings accepted off a stale slip
    // would report the outlet's entire day's throughput as stock gone missing —
    // the single largest number anything here can move — so the escape is not
    // offered on any of them and nothing may be filled in.
    problems.push('ALL_UNCHANGED');
    refuseWholeSlip = true;
  }

  /*
   * A permutation is a SYSTEMATIC error, and filling in only the subset that
   * happens to look plausible is exactly how one gets baked in. So the whole
   * slip is weighed, not just the blocks that failed.
   *
   * Counted over the readings the MONEY actually decided, and only those. On a
   * first morning nothing is decisive at all — a slip nothing can check is not a
   * slip that has failed, and refusing it would mean an outlet could never read
   * its first slip. And a block already refused for a more specific reason — a
   * meter that ran backwards, two readers who disagree, a nozzle printed twice —
   * never reached the identity test at all: it fills nothing on its own account
   * already, and letting one such block condemn five good ones would be a
   * punishment rather than a check.
   */
  const conflicts = readings.filter((r) => r.outcome === 'IDENTITY_CONFLICT').length;
  const decided = readings.filter((r) => IDENTITY_WAS_TESTED.has(r.outcome));
  const passing = decided.filter((r) => r.outcome === 'PROVED').length;
  const failing = decided.length - passing;
  if (conflicts >= 2 || (decided.length > 0 && failing >= passing)) {
    problems.push('NUMBERING_SUSPECT');
    refuseWholeSlip = true;
  }

  /*
   * Which morning this paper was printed on — and the case where nobody knows.
   *
   * "No date read" is its own answer and it is emphatically NOT agreement. The
   * date line coming back as question marks, or the photograph being cropped
   * above it, both leave this empty, and on the old rule that silently passed
   * the whole wrong-day check: last night's slip came back PROVED and
   * pre-ticked.
   *
   * Nothing else on the slip can stand in for it. The money identity is the one
   * real proof here and it cannot tell one printing instant from another —
   * BOTH counters come off the same block, so yesterday's slip proves itself
   * perfectly, every nozzle, at any hour. The date is the only thing on the
   * paper that says which morning it is.
   *
   * Neither case refuses the slip on its own: the console's clock can be wrong
   * and only the operator can say. The screen asks, and every accept stays
   * disabled until they answer — the same gate for both.
   */
  const headerDates = slipHeaderDates(parse.preamble ?? []);
  const businessDate = String(input.businessDate ?? '').trim();
  if (headerDates.length === 0) {
    problems.push('DATE_NOT_READ');
  } else if (businessDate && !headerDates.includes(businessDate)) {
    problems.push('DATED_ANOTHER_DAY');
  }

  const configured = new Set(references.map((r) => r.nozzleNo));
  const notInLayout: SlipReading['notInLayout'] = [];
  for (const nozzleNo of blocksByNozzle.keys()) {
    if (configured.has(nozzleNo)) continue;
    const block = blocksByNozzle.get(nozzleNo)![0]!;
    notInLayout.push({
      nozzleNo,
      value: block.figures.cumVolume.value,
      message: `The slip has a block for nozzle ${nozzleNo}, and this outlet’s report has no nozzle ${nozzleNo}. That reading has been left out. If nozzle ${nozzleNo} is real, add it to the dealer’s report layout on the Services tab first, then read the slip again.`,
    });
  }

  return {
    readings,
    notInLayout,
    preamble: parse.preamble ?? [],
    headerDates,
    problems,
    refuseWholeSlip,
    summary: summarise(readings, problems, refuseWholeSlip, headerDates, businessDate),
  };
}

/* ── one nozzle's facts ───────────────────────────────────────────────────── */

interface ResolvedNozzle {
  reference: SlipNozzleReference;
  block: SlipBlock | null;
  duplicate: boolean;
  /** The two blocks' differing readings, for the sentence that refuses to choose. */
  duplicateValues: string[];
  ocrValue: string | null;
  modelValue: string | null;
  /** Something was printed against CumVolume but could not be read. */
  rawUnreadable: string | null;
  source: SlipSource | null;
  value: string | null;
  price: number | null;
}

function resolveOneNozzle(
  reference: SlipNozzleReference,
  blocksByNozzle: Map<number, SlipBlock[]>,
  modelByNozzle: Map<number, SlipModelBlock[]>,
): ResolvedNozzle {
  const group = blocksByNozzle.get(reference.nozzleNo) ?? [];
  const duplicate = group.some((b) => b.problems.includes('DUPLICATE_NOZZLE'));
  const block = group[0] ?? null;

  const ocrValue = block && !duplicate ? block.figures.cumVolume.value : null;
  const modelValue = duplicate ? null : modelReadingFor(modelByNozzle.get(reference.nozzleNo));

  let source: SlipSource | null = null;
  let value: string | null = null;
  if (ocrValue !== null && modelValue !== null) {
    if (ocrValue === modelValue) {
      source = 'BOTH_AGREED';
      value = ocrValue;
    } else {
      // No provenance, because there is no agreed reading. The transcript's own
      // figure is still offered so the card has something to show and to type
      // over — it is never batchable and it is never quietly resolved.
      source = null;
      value = ocrValue;
    }
  } else if (ocrValue !== null) {
    source = 'OCR_ONLY';
    value = ocrValue;
  } else if (modelValue !== null) {
    source = 'MODEL_ONLY';
    value = modelValue;
  }

  return {
    reference,
    block,
    duplicate,
    duplicateValues: duplicate
      ? group.map((b) => b.figures.cumVolume.value).filter((v): v is string => v !== null)
      : [],
    ocrValue,
    modelValue,
    rawUnreadable:
      block && !duplicate && block.figures.cumVolume.value === null
        ? rawCumVolumeText(block)
        : null,
    source,
    value,
    price: block ? priceFromBlock(block) : null,
  };
}

/**
 * The second reader's reading of one nozzle, put through the same cleaner the
 * transcript's own figures go through.
 *
 * Its digits get no easier a ride than anybody else's: a `?`, a fourth decimal
 * or a stray character refuses it exactly as it would refuse the transcript, and
 * a block it flagged as not certain supplies nothing at all. Two blocks for one
 * nozzle that do not say the same thing supply nothing either.
 */
function modelReadingFor(blocks: readonly SlipModelBlock[] | undefined): string | null {
  const usable = (blocks ?? [])
    .filter((b) => !b.unreadable)
    .map((b) => (b.cumVolume === null ? null : cleanSlipNumber(b.cumVolume)))
    .filter((v): v is string => v !== null);
  if (usable.length === 0) return null;
  return usable.every((v) => v === usable[0]) ? usable[0]! : null;
}

function rawCumVolumeText(block: SlipBlock): string | null {
  const figure = block.figures.cumVolume;
  if (figure.lineNo === null) return null;
  const line = block.lines[figure.lineNo - block.headerLineNo];
  if (line === undefined) return null;
  const colon = line.indexOf(':');
  const text = (colon >= 0 ? line.slice(colon + 1) : line).trim();
  return text || null;
}

/**
 * What one litre cost, from the slip's own money.
 *
 * Today's shift first, this month second. The two windows are not
 * interchangeable and the fallback is only reached when today's is zero or
 * unreadable — a nozzle that has not sold anything yet this morning prints
 * `0.000` against both of its day figures, and dividing by that is how a screen
 * comes to print `Infinity` beside a fuel price.
 *
 * Rounded to paise, deliberately. A fuel price IS quoted in paise, and the whole
 * value of this check is that the operator can redo the division on the back of
 * the slip and get the number the screen is showing them. An unrounded price
 * moves the answer by four thousandths of a litre on a 330 litre day, against a
 * tolerance of six and a half litres.
 */
function priceFromBlock(block: SlipBlock): number | null {
  const price =
    ratio(block.figures.shDaySale.value, block.figures.shDayVol.value) ??
    ratio(block.figures.shMthSale.value, block.figures.shMthVol.value);
  if (price === null) return null;
  const paise = Math.round(price * 100) / 100;
  if (paise < SLIP_PRICE_MIN || paise > SLIP_PRICE_MAX) return null;
  return paise;
}

function ratio(sale: string | null, volume: string | null): number | null {
  if (sale === null || volume === null) return null;
  const rupees = Number(sale);
  const litres = Number(volume);
  if (!Number.isFinite(rupees) || !Number.isFinite(litres) || litres <= 0) return null;
  const price = rupees / litres;
  return Number.isFinite(price) ? price : null;
}

/* ── the proof ────────────────────────────────────────────────────────────── */

/**
 * The rupee identity, run on one nozzle.
 *
 * Two lifetime counters printed one line apart measure the same window in two
 * currencies. Take yesterday's accepted pair off both and they must tell the
 * same story:
 *
 *     litres by the meter   = today's CumVolume − the accepted previous read
 *     rupees taken          = today's CumSale   − the accepted previous CumSale
 *     litres the money says = rupees ÷ the price this slip itself prints
 *
 * On this outlet's own slip, against a self-consistent yesterday: 330.330 L by
 * the meter and 329.98 L by the money, 0.35 L apart, inside a tolerance of
 * 6.60 L — proved. Misread the third digit, 48,615 as 48,915, and the meter says
 * 630.330 L while the money still says 329.98 L: 300.35 L apart, caught by a
 * factor of forty-five, at seven in the morning, before the figure reaches a
 * box.
 *
 * What it does not catch, stated plainly: the tolerance is
 * `max(0.5 L, 2% of the litres the money says)`, so on a 330 L day a misread of
 * the last whole digit — one litre — passes. One litre is not a suspension.
 * Anything from ten litres upward is caught, and on a low-volume nozzle the
 * floor of half a litre catches everything from one litre up.
 *
 * `previousCumSale` is the caller's promise that the rupee counter it hands over
 * came off the very slip whose litre counter is `previousReading`. The backend
 * proves that promise by string equality before it makes it; a rupee counter
 * anchored to a different instant would not weaken this check, it would invert
 * it, quietly proving wrong figures.
 */
function proveWithTheMoney(entry: ResolvedNozzle, value: string): SlipProof {
  const reference = entry.reference;
  const previousReading = trimmedOrNull(reference.previousReading);
  const previousCumSale = trimmedOrNull(reference.previousCumSale);
  const cumSale = entry.block?.figures.cumSale.value ?? null;

  const meterLitres = irasNozzleSold(value, previousReading, reference.meterScale);
  if (previousReading === null || previousCumSale === null || meterLitres === null) {
    return { kind: 'NO_ANCHOR' };
  }
  if (cumSale === null) return { kind: 'NO_MONEY' };
  if (entry.price === null) return { kind: 'NO_PRICE' };

  const rupees = Number(cumSale) - Number(previousCumSale);
  if (!Number.isFinite(rupees)) return { kind: 'NO_MONEY' };

  const moneyLitres = rupees / entry.price;
  if (!Number.isFinite(moneyLitres)) return { kind: 'NO_PRICE' };

  const tolerance = Math.max(
    SLIP_TOLERANCE_FLOOR_LITRES,
    SLIP_TOLERANCE_FRACTION * Math.abs(moneyLitres),
  );
  const apart = Math.abs(meterLitres - moneyLitres);
  return {
    kind: apart <= tolerance ? 'PROVED' : 'DISAGREES',
    meterLitres,
    moneyLitres,
    apart,
    tolerance,
    price: entry.price,
  };
}

/**
 * The one other nozzle this figure fits, when it does not fit its own.
 *
 * "Nozzle No1" on the slip is a claim, and the re-baseline work already found
 * one outlet whose inspection form relabels all six of its nozzles. So the label
 * gets a second opinion from the same arithmetic that proved the figure: a wrong
 * assignment produces a wrong litre delta and therefore a wrong implied price,
 * and the check is free.
 *
 * Exactly one other nozzle, or nothing. Two nozzles it could be is not an
 * identification, and a figure that fits several is a figure that fits none.
 */
function fitsAnotherNozzle(entry: ResolvedNozzle, all: readonly ResolvedNozzle[]): number | null {
  if (entry.value === null) return null;
  let found: number | null = null;
  for (const other of all) {
    if (other.reference.nozzleNo === entry.reference.nozzleNo) continue;
    const proof = proveWithTheMoney({ ...entry, reference: other.reference }, entry.value);
    if (proof.kind !== 'PROVED') continue;
    if (found !== null) return null;
    found = other.reference.nozzleNo;
  }
  return found;
}

/* ── the sentences ────────────────────────────────────────────────────────── */

/** One nozzle's answer, and then the one question about it asked in one place. */
function describeOneNozzle(
  entry: ResolvedNozzle,
  all: readonly ResolvedNozzle[],
  model: SlipModelAnswer | null,
  previousLabel: string,
): SlipReadingForNozzle {
  const reading = readingForOneNozzle(entry, all, model, previousLabel);
  const withAccept = { ...reading, acceptable: canBeAcceptedAsRead(reading) };
  // The one decision, made here and nowhere else. The screen reads `fills` and
  // has nothing left to work out.
  return {
    ...withAccept,
    fills: fillsItsBox(withAccept),
    whyNotFilled: whyItWasLeft(withAccept),
  };
}

/**
 * Whether this figure may be accepted AS READ OFF THE SLIP — the card's button,
 * and the same test {@link slipFillsForSheet} applies to what comes back.
 *
 * Three refusals, and the third is the one that had to be added:
 *
 *   - there is no figure to accept;
 *   - the card is one no accept button is drawn under. A meter that ran
 *     backwards is wrong whoever read it; two blocks for one nozzle is a choice
 *     nothing on the paper can make; a figure that fits a different pump moves
 *     litres onto the wrong meter;
 *   - the ONLY reader that produced these digits was the second one, and
 *     nothing on the paper checked them. That is the exact shape of the measured
 *     failure this module is built around: given a photograph the on-box reader
 *     could not read, the second reader returned 54,979.890 confidently and
 *     repeatedly against a truth of 48,615.550. When the money on the same block
 *     turns those digits back into the litres the meter says, the paper HAS
 *     checked them and the figure may be accepted one card at a time — the
 *     rupee identity is the proof here, and it does not care which reader
 *     produced the litres. With no such proof there is nothing behind the
 *     digits but one reader's confidence, and confidence is not evidence.
 *
 * A refused figure is still shown, still explained and still typeable. Typing
 * always beats the photograph.
 */
function canBeAcceptedAsRead(
  reading: Omit<SlipReadingForNozzle, 'acceptable' | 'fills' | 'whyNotFilled'>,
): boolean {
  if (reading.value === null) return false;
  if (!OFFERS_THE_READ_FIGURE.has(reading.outcome)) return false;
  if (reading.source === 'MODEL_ONLY' && reading.proof.kind !== 'PROVED') return false;
  return true;
}

/**
 * THE ONE DECISION: does this reading go into its box, or is the box left alone?
 *
 * The whole feature is this rule and nothing else. A reading fills when both
 * readers produced the same digits and the money printed on the same block did
 * not contradict them. Anything else leaves the box exactly as it was, and the
 * screen says NOTHING about it — the operator types that one as they always did.
 *
 * Stricter than what it replaces, not looser. The review this removes would let
 * a figure only ONE reader had seen be accepted a card at a time; here such a
 * figure never lands. That matters because the readers fail differently: on a
 * blurred slip the on-box reader returns nothing while the second returns a
 * confident, stable 54,979.890 where the truth is 48,615.550. They disagree, so
 * nothing is filled and nothing is said.
 *
 * The money is a VETO, not a requirement. `DISAGREES` refuses; `NO_ANCHOR`,
 * `NO_PRICE` and `NO_MONEY` still fill. Requiring a proof that cannot exist yet
 * would make the feature do nothing on a dealer's very first morning, which is
 * the day somebody is most likely to be watching it.
 */
function fillsItsBox(reading: Omit<SlipReadingForNozzle, 'fills' | 'whyNotFilled'>): boolean {
  if (!reading.acceptable) return false;
  if (reading.source !== 'BOTH_AGREED') return false;
  return reading.proof.kind !== 'DISAGREES';
}

/**
 * Why a box was left alone, in a few plain words, for the diagnostics block.
 *
 * Never shown beside the box and never as a warning — it is written down so the
 * next person debugging a slip that filled nothing can see what happened, and
 * for no other reason.
 */
function whyItWasLeft(
  reading: Omit<SlipReadingForNozzle, 'fills' | 'whyNotFilled'>,
): string | null {
  if (fillsItsBox(reading)) return null;
  if (reading.value === null) return 'nothing was read for this nozzle';
  if (reading.outcome === 'BACKWARDS') return 'the reading is below yesterday’s';
  if (reading.outcome === 'DUPLICATE') return 'the slip prints this nozzle twice';
  if (reading.outcome === 'IDENTITY_CONFLICT') return 'the reading fits a different pump';
  if (reading.outcome === 'UNREADABLE') return 'the figure could not be read';
  if (reading.proof.kind === 'DISAGREES') {
    return 'the money on the slip does not agree with the litres';
  }
  if (reading.source === 'OCR_ONLY') return 'only one of the two readings found it';
  if (reading.source === 'MODEL_ONLY') return 'only one of the two readings found it';
  if (reading.source === null) return 'the two readings of the slip differ';
  return 'it could not be checked';
}

function readingForOneNozzle(
  entry: ResolvedNozzle,
  all: readonly ResolvedNozzle[],
  model: SlipModelAnswer | null,
  previousLabel: string,
): Omit<SlipReadingForNozzle, 'acceptable' | 'fills' | 'whyNotFilled'> {
  const nozzleNo = entry.reference.nozzleNo;
  const previousReading = trimmedOrNull(entry.reference.previousReading);
  const lines = entry.block?.lines ?? [];
  const fromLineNos = entry.block
    ? lines.map((_line, offset) => entry.block!.headerLineNo + offset)
    : [];

  const base = {
    nozzleNo,
    productName: entry.reference.productName ?? null,
    previousReading,
    source: entry.source,
    modelValue: entry.modelValue,
    lines,
    fromLineNos,
  };

  /* Nothing to offer at all. */
  if (entry.duplicate) {
    const [first, second] = entry.duplicateValues;
    const both =
      first && second
        ? ` reading ${printedDigits(first)} and ${printedDigits(second)}`
        : ' with different readings';
    return {
      ...base,
      outcome: 'DUPLICATE',
      batchable: false,
      value: null,
      soldLitres: null,
      proof: { kind: 'NO_ANCHOR' },
      message: `The slip has two blocks for nozzle ${nozzleNo},${both}. We cannot tell which is this morning’s, so nozzle ${nozzleNo} has been left out — type it in yourself.`,
    };
  }

  if (entry.value === null) {
    if (entry.block === null) {
      return {
        ...base,
        outcome: 'MISSING_FROM_SLIP',
        batchable: false,
        value: null,
        soldLitres: null,
        proof: { kind: 'NO_ANCHOR' },
        message: `Nozzle ${nozzleNo} is not on this slip. Its box still holds ${previousLabel}’s figure — type this morning’s in yourself, or read a second slip.`,
      };
    }
    return {
      ...base,
      outcome: 'UNREADABLE',
      batchable: false,
      value: null,
      soldLitres: null,
      proof: { kind: 'NO_ANCHOR' },
      message: entry.rawUnreadable
        ? `We read “${entry.rawUnreadable}” off the slip for nozzle ${nozzleNo} and cannot be sure of it. Type the reading in yourself.`
        : `Nozzle ${nozzleNo}’s reading could not be read off this slip. Type it in yourself.`,
    };
  }

  const value = entry.value;

  /* A value that the boxes themselves would refuse never becomes a reading.
   * `cleanSlipNumber` already refuses everything `validateIrasCell` refuses;
   * this is the belt under those braces, and it is cheap. */
  const cellProblem = validateIrasCell('TOT', 'TOT_READING', value);
  if (cellProblem) {
    return {
      ...base,
      outcome: 'UNREADABLE',
      batchable: false,
      value: null,
      soldLitres: null,
      proof: { kind: 'NO_ANCHOR' },
      message: `We read “${printedDigits(value)}” off the slip for nozzle ${nozzleNo} and cannot be sure of it. Type the reading in yourself.`,
    };
  }

  const soldLitres = irasNozzleSold(value, previousReading, entry.reference.meterScale);
  const proof = proveWithTheMoney(entry, value);

  if (soldLitres !== null && soldLitres < 0) {
    return {
      ...base,
      outcome: 'BACKWARDS',
      batchable: false,
      value,
      soldLitres,
      proof,
      message: `Lower than yesterday. A meter only ever goes up, so this cannot be right: ${printedDigits(
        value,
      )} is ${litres(-soldLitres, 3)} below ${previousLabel}’s ${printedDigits(
        previousReading ?? '',
      )}. Check the paper and type what it says.`,
    };
  }

  if (soldLitres === 0) {
    return {
      ...base,
      outcome: 'UNCHANGED',
      batchable: false,
      value,
      soldLitres,
      proof,
      message: `Exactly the same as yesterday. If nozzle ${nozzleNo} really did not run, accept it as it stands — the report will show it sold nothing and it will not be charged its 5 litre test draw. If it did run, check the paper and type this morning’s reading.`,
    };
  }

  if (entry.source === null) {
    // The two readers read the same block and got different digits. One of them
    // invented a number, and nothing on this paper says which — so this is not a
    // figure yet, it is a question for the person holding the paper.
    return {
      ...base,
      outcome: 'READINGS_DISAGREE',
      batchable: false,
      value,
      soldLitres,
      proof,
      message: `This slip was read twice and the two readings do not match — ${printedDigits(
        value,
      )} and ${printedDigits(
        entry.modelValue ?? '',
      )}. Only one of them can be right, so nothing has been proved for nozzle ${nozzleNo}. Check the paper and type what it says.`,
    };
  }

  if (proof.kind === 'DISAGREES') {
    const fits = fitsAnotherNozzle(entry, all);
    if (fits !== null) {
      return {
        ...base,
        outcome: 'IDENTITY_CONFLICT',
        batchable: false,
        value: null,
        soldLitres,
        proof,
        message: `The slip’s Nozzle ${nozzleNo} shows ${printedDigits(
          value,
        )}. Against nozzle ${nozzleNo}’s own figures that works out to ${litres(
          proof.meterLitres,
          3,
        )} litres sold, and the money on the slip says ${litres(
          proof.moneyLitres,
          2,
        )}. The same figure fits nozzle ${fits} exactly. This slip’s numbering may not match this outlet’s — check the pump.`,
      };
    }
    return {
      ...base,
      outcome: 'MONEY_DISAGREES',
      batchable: false,
      value,
      soldLitres,
      proof,
      message: `These do not agree. ${printedDigits(value)} less ${previousLabel}’s ${printedDigits(
        previousReading ?? '',
      )} is ${litres(proof.meterLitres, 3)} L, and the money the slip prints for this nozzle works out to ${litres(
        proof.moneyLitres,
        2,
      )} L — ${litres(proof.apart, 2)} L apart. One of the two was read wrong. Check the paper and type what it says.`,
    };
  }

  if (proof.kind === 'PROVED' && entry.source === 'BOTH_AGREED') {
    return { ...base, outcome: 'PROVED', batchable: true, value, soldLitres, proof, message: '' };
  }

  return {
    ...base,
    outcome: 'NEEDS_A_LOOK',
    batchable: false,
    value,
    soldLitres,
    proof,
    message: needsALookMessage(entry, proof, model, nozzleNo),
  };
}

/**
 * Why a reading that reads perfectly well still cannot be filled in as part of a
 * batch — and it is always one honest reason, never a hedge.
 *
 * The ORDER is the whole point of this function, and it is the order of what is
 * actually known rather than the order the checks happen to run in.
 *
 * "Only one reader saw this" is asked BEFORE anything is said about what the
 * slip does or does not print, because the two are not the same fact and the
 * older order printed the wrong one. A block the on-box reader could not read at
 * all has no rupee counter IN THE TRANSCRIPT — so the proof came back NO_MONEY
 * or NO_PRICE, and the sentence told the operator "this slip does not print the
 * rupee counter for nozzle 1". The slip prints it perfectly well. The reader
 * failed to see it, and there is a hard rule in this area about the difference:
 * never assert something the reader merely failed to see. An operator told their
 * dealer's paper is deficient goes and looks at the paper for a fault that is
 * not there, and comes back trusting the figure on the screen — which, in this
 * exact case, is the one number on the morning nothing checked.
 */
function needsALookMessage(
  entry: ResolvedNozzle,
  proof: SlipProof,
  model: SlipModelAnswer | null,
  nozzleNo: number,
): string {
  if (proof.kind === 'PROVED') {
    if (model === null) {
      return `The money on the slip agrees with this reading, but the slip was only read once this morning, so it cannot be filled in as part of a batch. Check it against the paper.`;
    }
    return `The money on the slip agrees with this reading, but only one reading of nozzle ${nozzleNo}’s block came back, so it cannot be filled in as part of a batch. Check it against the paper.`;
  }
  if (entry.source === 'MODEL_ONLY') {
    return `The slip was read twice and only one of the two came back with a figure for nozzle ${nozzleNo} — ${printedDigits(
      entry.value ?? '',
    )} — and nothing on the slip could check it. Read nozzle ${nozzleNo} off the paper and type what it says.`;
  }
  if (proof.kind === 'NO_ANCHOR') {
    return `There is nothing to check this against yet — nozzle ${nozzleNo} has no figure from an earlier slip to measure against. Check it against the paper yourself.`;
  }
  if (proof.kind === 'NO_MONEY') {
    return `This slip does not print the rupee counter for nozzle ${nozzleNo}, so the reading cannot be checked against the money. Check it against the paper yourself.`;
  }
  return `The slip’s own litres for nozzle ${nozzleNo} are zero or could not be read, so there is no price to turn the money into litres. Check it against the paper yourself.`;
}

/** The one sentence at the top of the panel. */
function summarise(
  readings: readonly SlipReadingForNozzle[],
  problems: readonly SlipProblem[],
  refuseWholeSlip: boolean,
  headerDates: readonly string[],
  businessDate: string,
): string {
  if (problems.includes('NOT_A_SLIP') || problems.includes('NOTHING_READ')) {
    return 'We could not read this slip. Nothing has been filled in.';
  }
  if (problems.includes('ALL_UNCHANGED')) {
    return 'Every reading on this slip matches yesterday. Check you have photographed this morning’s slip.';
  }
  if (problems.includes('NUMBERING_SUSPECT')) {
    return 'The figures on this slip do not line up with this outlet’s nozzles. Nothing has been filled in. Check that this slip is from this pump, then type the figures yourself.';
  }
  if (refuseWholeSlip) {
    return 'Nothing on this slip can be filled in. Type this morning’s figures in yourself.';
  }
  if (problems.includes('DATED_ANOTHER_DAY') && headerDates.length > 0) {
    return `This slip is dated ${dayLabel(headerDates[0]!)}. You are entering ${dayLabel(
      businessDate,
    )}. Filling these in would put one morning’s readings on another morning’s report.`;
  }
  if (problems.includes('DATE_NOT_READ')) {
    // Says what is true — no date was READ — and never that the slip carries
    // none. Nothing else on the paper can date it: both counters the money
    // check uses come off the same block, so yesterday's slip proves itself
    // perfectly.
    const entering = businessDate ? ` — ${dayLabel(businessDate)} —` : '';
    return `No date could be read at the top of this slip, so nothing here can tell this morning’s slip from yesterday’s. Check the paper is this morning’s${entering} before you fill anything in.`;
  }

  /*
   * ONE sentence, and it says only what was FILLED.
   *
   * It used to name the nozzles the slip did not carry and tell the operator to
   * check the unproved ones against the paper — a list of chores for figures
   * they were about to type anyway. A slip that fills four of six boxes is a
   * good outcome and the sentence reads like one; what it did not fill is left
   * to the boxes, which are already empty and already asking.
   *
   * Everything not said here is in the diagnostics block, per reading, with the
   * reason it was left. That is a record for whoever debugs a slip, not a
   * conversation with the person holding the phone.
   */
  const filled = readings.filter((r) => r.fills).length;
  const asked = readings.length;

  if (filled === 0)
    return 'Nothing on this slip could be filled in. Type this morning’s figures in yourself.';
  if (filled === asked) {
    return `All ${filled} ${filled === 1 ? 'reading' : 'readings'} filled in from the slip.`;
  }
  return `${filled} of ${asked} readings filled in from the slip. Type the rest in yourself.`;
}

/* ─────────────────────── the one write to the sheet ─────────────────────── */

/**
 * The ONE array the sheet writes in a single undoable step.
 *
 * One call, one history frame, one carried map and one read map. Writing these
 * cell by cell would leave the operator undoing a slip one nozzle at a time on a
 * fifty-deep stack, and — far worse — each call computing its map from the same
 * render snapshot would leave only the last map standing, so five boxes would
 * hold the slip's figures while still being painted as untouched, still
 * uncounted, and still blocking the save.
 *
 * Every rule the screen states is enforced here rather than trusted to the
 * screen, because this is the last place before a figure moves litres:
 *
 *   - a slip the whole-slip guards refused fills NOTHING, whatever acceptances
 *     are passed in;
 *   - a figure marked as read off the slip must be character-identical to what
 *     the slip was read as, and must belong to a nozzle whose card actually
 *     offers that button. A backwards reading has no accept button on screen, so
 *     it cannot be accepted as read here either;
 *   - a figure the operator typed is accepted on any nozzle the day has, because
 *     typing must always beat the photograph;
 *   - and nothing at all passes that the boxes themselves would refuse.
 */
export function slipFillsForSheet(
  reading: SlipReading,
  /**
   * The operator's answer to a question only they can settle: yes, this is the
   * right morning's paper.
   *
   * Required whenever the slip's date could not be matched — either it names a
   * different day, or no date could be read at all. Those two were enforced in
   * React alone, which made this function, whose whole job is to be the last
   * place before a figure moves litres, the one place that did not ask. And the
   * money cannot stand in for it: both counters come off the same block, so last
   * night's slip proves itself perfectly on every nozzle at any hour.
   *
   * Read figures only. A figure the operator typed is theirs whatever the paper
   * is dated.
   */
  opts: {
    dayConfirmed?: boolean;
    /**
     * The only nozzles whose box may be written, when the caller wants to
     * narrow it — the ones still holding what the system carried in.
     *
     * A figure a person typed is never replaced by a photograph without being
     * asked, and it is this list that keeps "read another slip" filling only the
     * boxes the first one missed. Left off, every reading that fills is filled.
     */
    onlyNozzleNos?: readonly number[];
  } = {},
): Array<{ nozzleNo: number; field: 'TOT_READING'; value: string; source: 'read' | 'typed' }> {
  if (!reading || reading.refuseWholeSlip) return [];
  const dayConfirmed = opts.dayConfirmed === true;
  const only =
    opts.onlyNozzleNos === undefined
      ? null
      : new Set(opts.onlyNozzleNos.map((n) => irasRowIdentity(n)));

  const dateUnsettled =
    (reading.problems ?? []).includes('DATED_ANOTHER_DAY') ||
    (reading.problems ?? []).includes('DATE_NOT_READ');

  // The day is the one thing no reading can answer for itself, so it gates the
  // lot rather than any one of them.
  if (dateUnsettled && !dayConfirmed) return [];

  const out: Array<{
    nozzleNo: number;
    field: 'TOT_READING';
    value: string;
    source: 'read' | 'typed';
  }> = [];
  const seen = new Set<string>();
  for (const entry of reading.readings ?? []) {
    // `fills` IS the decision — made once, in `fillsItsBox`, and not re-derived
    // here or anywhere on the screen. Nothing is passed in to be trusted.
    if (!entry.fills || entry.value === null) continue;
    const identity = irasRowIdentity(entry.nozzleNo);
    if (!identity || seen.has(identity)) continue;
    if (only && !only.has(identity)) continue;
    const value = slipValueForCell(entry.value);
    // The box's own validator has the last word, as it does for a typed figure.
    if (!value || validateIrasCell('TOT', 'TOT_READING', value)) continue;
    seen.add(identity);
    out.push({ nozzleNo: entry.nozzleNo, field: 'TOT_READING', value, source: 'read' });
  }
  return out;
}

/**
 * The outcomes the money had the last word on — the only ones the whole-slip
 * numbering guard counts. Everything else was settled before the money was asked.
 */
const IDENTITY_WAS_TESTED: ReadonlySet<SlipNozzleOutcome> = new Set([
  'PROVED',
  'MONEY_DISAGREES',
  'IDENTITY_CONFLICT',
]);

/**
 * The outcomes whose card could carry an accept button at all — half of the
 * answer, and never the whole of it. {@link canBeAcceptedAsRead} is the whole of
 * it, and `acceptable` on each reading is what the screen and
 * {@link slipFillsForSheet} both read.
 *
 * Everything left out either has no figure to offer or has one no button is
 * drawn under: a meter that ran backwards, two blocks for one nozzle, a figure
 * that fits a different pump. Those can still be TYPED; they cannot be accepted
 * as read.
 */
const OFFERS_THE_READ_FIGURE: ReadonlySet<SlipNozzleOutcome> = new Set([
  'PROVED',
  'NEEDS_A_LOOK',
  'MONEY_DISAGREES',
  'READINGS_DISAGREE',
  'UNCHANGED',
]);

/* ─────────────────────────────── internals ──────────────────────────────── */

function trimmedOrNull(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text ? text : null;
}

/**
 * A printed figure grouped the way this platform prints figures, with every
 * decimal the paper shows kept exactly as it is.
 *
 * Grouped off the STRING rather than through a number, because the whole point
 * of the figure on screen is that it can be held against the paper character for
 * character — and `Number('48615.550').toLocaleString()` quietly drops the last
 * zero, which is the one digit the operator would then be unable to match.
 */
function printedDigits(value: string): string {
  const text = String(value ?? '').trim();
  if (!text) return text;
  const dot = text.indexOf('.');
  const whole = dot < 0 ? text : text.slice(0, dot);
  const fraction = dot < 0 ? '' : text.slice(dot);
  if (!/^\d+$/.test(whole)) return text;
  if (whole.length <= 3) return `${whole}${fraction}`;
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${last3}${fraction}`;
}

/** A computed litre figure, to a fixed number of decimals, Indian grouping. */
function litres(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function dayLabel(businessDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(businessDate ?? '').trim());
  return match ? `${match[3]}-${match[2]}-${match[1]}` : String(businessDate ?? '');
}

function joinList(parts: readonly string[]): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
