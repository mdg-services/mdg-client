/**
 * Search over the video library, as the admin types it: in Hindi, in English or
 * in Hindi typed with Latin letters, often half a word ("manag", "रजिस्टर",
 * "variation zyada").
 *
 * WHAT IS SEARCHED. Everything a video says about itself, in both languages
 * whichever one is on screen: the title, the one-line summary, the words people
 * type for it (`aliases`, which carry the romanised Hindi), when to send it
 * (`sendWhen`), every chapter's label and voice line, and an explainer's whole
 * transcript. A word found in the title counts for more than one found in a voice
 * line, so the video that is ABOUT the thing comes first.
 *
 * EVERY WORD MUST BE FOUND, then the ranking decides. Small words that ask rather
 * than name ("how", "kaise", "का", "क्या") are dropped first, so "how to add a
 * manager" means "add manager". When no video has every word, the videos with the
 * most of them are returned instead, so a long question still finds something.
 *
 * THE CHAPTER. A hit inside a chapter names it, so a search for "password bhool
 * gaya" can open the install video at the part about a forgotten password. The
 * first chapter is the start of the video and is never named.
 *
 * Pure: no I/O, no clock. The admin's Videos page and its "Send a video" use it.
 */

export interface SearchableChapter {
  startSec: number;
  label: { hi: string; en: string };
  text?: string;
}

export interface SearchableVideo {
  title: { hi: string; en: string };
  summary: { hi: string; en: string };
  aliases?: readonly string[];
  sendWhen?: readonly string[];
  chapters: readonly SearchableChapter[];
  transcript?: { hi: string; en: string } | null;
}

export interface VideoSearchHit<T> {
  item: T;
  score: number;
  /** The chapter the words were found in, when it is not the first one. */
  chapter: SearchableChapter | null;
}

/** Words that ask rather than name, in English, romanised Hindi and Hindi. */
const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'to',
  'of',
  'in',
  'on',
  'for',
  'and',
  'or',
  'is',
  'are',
  'my',
  'your',
  'how',
  'what',
  'do',
  'i',
  'me',
  'it',
  'with',
  'video',
  'videos',
  'ka',
  'ki',
  'ke',
  'ko',
  'hai',
  'hain',
  'me',
  'mein',
  'se',
  'aur',
  'ya',
  'kaise',
  'kya',
  'kyu',
  'kyun',
  'kab',
  'kahan',
  'karna',
  'karein',
  'kare',
  'karo',
  'ho',
  'tha',
  'thi',
  'wala',
  'wali',
  'bhi',
  'का',
  'की',
  'के',
  'को',
  'है',
  'हैं',
  'में',
  'से',
  'और',
  'या',
  'कैसे',
  'क्या',
  'क्यों',
  'कब',
  'कहाँ',
  'करें',
  'करना',
  'वीडियो',
  'भी',
]);

/**
 * One spelling for the forms a word is typed in: lower case; a Devanagari nukta
 * dropped (ज़ = ज, ड़ = ड), chandrabindu read as anusvara (ँ = ं), the joiners a
 * phone inserts removed; punctuation turned into spaces.
 */
export function normaliseForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/़/g, '')
    .normalize('NFC')
    .replace(/ँ/g, 'ं')
    .replace(/[‌‍]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The words of a query worth looking for: normalised, small asking words and one-letter words dropped. */
export function searchTerms(query: string): string[] {
  const words = normaliseForSearch(query).split(' ').filter(Boolean);
  const kept = words.filter((w) => !STOP_WORDS.has(w) && [...w].length > 1);
  // A query made only of small words ("how to") still means something: keep them then.
  return [...new Set(kept.length > 0 ? kept : words.filter((w) => [...w].length > 1))];
}

/** How much a word found in each field counts. */
const WEIGHT = {
  title: 12,
  alias: 9,
  sendWhen: 6,
  summary: 5,
  chapterLabel: 5,
  chapterText: 3,
  transcript: 2,
} as const;

interface Field {
  weight: number;
  text: string;
}

function fieldsOf(v: SearchableVideo): Field[] {
  const f = (weight: number, text: string | undefined | null): Field[] =>
    text ? [{ weight, text: normaliseForSearch(text) }] : [];
  return [
    ...f(WEIGHT.title, v.title.hi),
    ...f(WEIGHT.title, v.title.en),
    ...(v.aliases ?? []).flatMap((a) => f(WEIGHT.alias, a)),
    ...(v.sendWhen ?? []).flatMap((s) => f(WEIGHT.sendWhen, s)),
    ...f(WEIGHT.summary, v.summary.hi),
    ...f(WEIGHT.summary, v.summary.en),
    ...v.chapters.flatMap((c) => [
      ...f(WEIGHT.chapterLabel, c.label.hi),
      ...f(WEIGHT.chapterLabel, c.label.en),
      ...f(WEIGHT.chapterText, c.text),
    ]),
    ...f(WEIGHT.transcript, v.transcript?.hi),
    ...f(WEIGHT.transcript, v.transcript?.en),
  ];
}

/** The chapter (not the first) holding the most of the words; ties go to the earlier one. */
function bestChapter(v: SearchableVideo, terms: readonly string[]): SearchableChapter | null {
  let best: SearchableChapter | null = null;
  let bestCount = 0;
  for (const c of v.chapters.slice(1)) {
    const text = normaliseForSearch(`${c.label.hi} ${c.label.en} ${c.text ?? ''}`);
    const count = terms.filter((t) => text.includes(t)).length;
    if (count > bestCount) {
      best = c;
      bestCount = count;
    }
  }
  return best;
}

/**
 * The videos that answer a query, best first. An empty query returns every video
 * in its given order with a score of 0, so a list can call this unconditionally.
 */
export function searchVideos<T extends SearchableVideo>(
  items: readonly T[],
  query: string,
): VideoSearchHit<T>[] {
  const terms = searchTerms(query);
  if (terms.length === 0) return items.map((item) => ({ item, score: 0, chapter: null }));
  const phrase = normaliseForSearch(query);

  const scored = items.map((item, index) => {
    const fields = fieldsOf(item);
    let score = 0;
    let found = 0;
    for (const term of terms) {
      const weight = fields.reduce(
        (w, field) => (field.weight > w && field.text.includes(term) ? field.weight : w),
        0,
      );
      if (weight > 0) {
        found += 1;
        score += weight;
      }
    }
    // The whole query as typed, inside a title or an alias: almost certainly the video.
    if (
      terms.length > 1 &&
      fields.some(
        (field) =>
          (field.weight === WEIGHT.title || field.weight === WEIGHT.alias) &&
          field.text.includes(phrase),
      )
    ) {
      score += 10;
    }
    return { item, index, score, found };
  });

  const all = scored.filter((s) => s.found === terms.length);
  const pool = all.length > 0 ? all : scored.filter((s) => s.found > 0);
  return pool
    .sort((a, b) => b.found - a.found || b.score - a.score || a.index - b.index)
    .map((s) => ({ item: s.item, score: s.score, chapter: bestChapter(s.item, terms) }));
}
