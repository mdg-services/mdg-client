import type { Lang } from '@/store/lang';
import type {
  OutletDetailKind,
  OutletDetailOption,
  OutletDetailValue,
  OutletDetailWords,
  OutletDetailsQuestionView,
  OutletDetailsView,
} from '@dk/shared/types';

/**
 * The Pump details form, worked out from what the server sent.
 *
 * NOTHING HERE NAMES A QUESTION. The server owns the list (kind, words, options,
 * limits) and sends it with every read, so a question added there shows up on
 * the dealer's phone with no release of this app. Everything below goes by the
 * question's `kind` only, and a kind this app has never heard of is drawn as its
 * label and its saved value — never a crash.
 */

/** The kinds this app can draw an input for. Any other kind is shown as text. */
const DRAWN_KINDS: ReadonlySet<string> = new Set<OutletDetailKind>([
  'state',
  'choice',
  'text',
  'number',
  'yesno',
  'date',
]);

export function isDrawnKind(kind: string): kind is OutletDetailKind {
  return DRAWN_KINDS.has(kind);
}

/** A server answer worth drawing: a form with a list of questions. */
export function isOutletDetailsView(data: unknown): data is OutletDetailsView {
  if (!data || typeof data !== 'object') return false;
  return Array.isArray((data as Partial<OutletDetailsView>).questions);
}

/** The words in the reader's language, falling back to the other one rather than to nothing. */
export function pickWords(words: OutletDetailWords | undefined, lang: Lang): string {
  if (!words) return '';
  return (lang === 'hi' ? words.hi || words.en : words.en || words.hi) ?? '';
}

/**
 * One option's label. A state reads "हरियाणा (Haryana)" on the Hindi screen and
 * "Haryana" on the English one (the same as the bill-to card's list), so a dealer
 * who knows the English name can still find it.
 */
export function optionLabel(kind: OutletDetailKind, option: OutletDetailOption, lang: Lang): string {
  if (kind === 'state' && lang === 'hi') {
    const { hi, en } = option.label;
    return hi && en && hi !== en ? `${hi} (${en})` : hi || en || option.value;
  }
  return pickWords(option.label, lang) || option.value;
}

/** A state's options in the reader's alphabet (a Hindi reader finds "हरियाणा" under ह). Others keep the server's order. */
export function orderedOptions(
  question: Pick<OutletDetailsQuestionView, 'kind' | 'options'>,
  lang: Lang,
): Array<{ value: string; label: string }> {
  const rows = (question.options ?? []).map((o) => ({
    value: o.value,
    label: optionLabel(question.kind, o, lang),
  }));
  if (question.kind !== 'state') return rows;
  let collator: Intl.Collator;
  try {
    collator = new Intl.Collator(lang === 'hi' ? 'hi' : 'en');
  } catch {
    collator = new Intl.Collator();
  }
  return rows.sort((a, b) => collator.compare(a.label, b.label));
}

/** How many options may be big buttons; more than this is a list to pick from. */
export const MAX_BUTTON_OPTIONS = 4;

/**
 * A value as the form compares it: text trimmed, a number as a number, an empty
 * box as "no answer". Two spellings of the same answer must compare equal, or
 * Save would send answers nobody changed.
 */
export function canonical(kind: string, value: OutletDetailValue | undefined): OutletDetailValue {
  if (value === undefined || value === null) return null;
  if (kind === 'number') {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') {
      const text = value.trim().replace(',', '.');
      if (text === '') return null;
      const n = Number(text);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }
  if (kind === 'yesno') return typeof value === 'boolean' ? value : null;
  if (typeof value === 'string') {
    const text = value.trim();
    return text === '' ? null : text;
  }
  if (typeof value === 'number') return String(value);
  return null;
}

/**
 * What a question's form control starts as: the saved answer, else the value MDG
 * already holds and suggests (which is NOT an answer — it only becomes one when
 * the owner presses Save).
 */
export function startingValue(q: OutletDetailsQuestionView): OutletDetailValue {
  const { value, suggested } = q.answer;
  if (value !== null && value !== undefined) return value;
  return suggested ?? null;
}

/** The unanswered question whose form control is showing MDG's suggestion. */
export function showsSuggestion(
  q: OutletDetailsQuestionView,
  current: OutletDetailValue | undefined,
): boolean {
  const { value, suggested } = q.answer;
  if (value !== null && value !== undefined) return false;
  if (suggested === null || suggested === undefined) return false;
  return canonical(q.kind, current) === canonical(q.kind, suggested);
}

/**
 * Only what the owner changed, ready for the PUT body — or null when nothing was.
 *
 * `edits` holds the controls the owner touched; the rest stay as the server has
 * them. A suggestion left in place counts as a change (it is not saved yet), so
 * pressing Save confirms it. An optional answer emptied is sent as null (clears
 * it); a required one emptied is left out, because the server refuses to clear a
 * required answer and the old one stays.
 */
export function changedAnswers(
  view: OutletDetailsView,
  edits: Readonly<Record<string, OutletDetailValue>>,
): Record<string, OutletDetailValue> | null {
  const out: Record<string, OutletDetailValue> = {};
  for (const q of view.questions) {
    if (!isDrawnKind(q.kind)) continue;
    const current = canonical(q.kind, q.id in edits ? edits[q.id] : startingValue(q));
    const saved = canonical(q.kind, q.answer.value);
    if (current === saved) continue;
    if (current === null && q.required) continue;
    out[q.id] = current;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Whether any question has a saved answer (an untouched, unanswered form is asked, not summarised). */
export function hasAnyAnswer(view: OutletDetailsView): boolean {
  return view.questions.some((q) => q.answer.value !== null && q.answer.value !== undefined);
}

/** "5 Nov 2026" / "5 नव॰ 2026" from "2026-11-05", read as that calendar day wherever the phone is. */
export function formatDay(day: string, lang: Lang): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(date.getTime())) return day;
  try {
    return date.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return day;
  }
}

/**
 * A saved answer as plain text, or null when there is none. `yes`/`no` are the
 * reader's words for a yes/no answer (the caller owns the catalog).
 */
export function answerText(
  q: OutletDetailsQuestionView,
  lang: Lang,
  words: { yes: string; no: string },
): string | null {
  const value = q.answer.value;
  if (value === null || value === undefined) return null;
  switch (q.kind) {
    case 'state':
    case 'choice': {
      const hit = (q.options ?? []).find((o) => o.value === String(value));
      return hit ? optionLabel(q.kind, hit, lang) : String(value);
    }
    case 'yesno':
      return typeof value === 'boolean' ? (value ? words.yes : words.no) : String(value);
    case 'date':
      return typeof value === 'string' ? formatDay(value, lang) : String(value);
    default:
      // A kind from a newer server: show whatever was saved, in plain words.
      if (typeof value === 'boolean') return value ? words.yes : words.no;
      return String(value);
  }
}
