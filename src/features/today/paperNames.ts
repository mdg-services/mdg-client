import { docName } from '@/features/reports/kinds/paper_expiry';
import { sayWords, type Words } from '@/features/reports/types';
import { daysUntil } from '@/lib/fmt';
import type { Lang } from '@/store/lang';
import type { PaperExpiryData } from '@dk/shared/types';

/**
 * One rule and one set of names for a paper ("Fire NOC"), so Today says the same as the Services door
 * and Reports (owner defect: "9 days left" was a green tick on Today and a triangle elsewhere).
 */

type PaperItem = PaperExpiryData['items'][number];

/** A paper with fewer days left than this is "have a look" (a triangle); a lapsed one is a problem. */
export const PAPER_ATTENTION_DAYS = 30;

/** The status of a paper from its days left, counted again from its date. The one rule. */
export function paperStatusOf(days: number): 'ok' | 'attention' | 'problem' {
  return days < 0 ? 'problem' : days < PAPER_ATTENTION_DAYS ? 'attention' : 'ok';
}

const w = (hi: string, hl: string, en: string): Words => ({ hi, hl, en });

/**
 * Names the server's own label leaves in English. Keyed by the portal's paper code, written with
 * hyphens (`fire_noc`, `fire-noc` and `Fire NOC` are the same paper).
 */
const PAPER_NAMES: Record<string, Words> = {
  'fire-noc': w('फ़ायर एनओसी', 'Fire NOC', 'Fire NOC'),
  'wm-licence': w('वज़न-माप का लाइसेंस', 'Wazan-maap ka licence', 'Weights & Measures licence'),
  'wm-license': w('वज़न-माप का लाइसेंस', 'Wazan-maap ka licence', 'Weights & Measures licence'),
  'weights-and-measures-licence': w('वज़न-माप का लाइसेंस', 'Wazan-maap ka licence', 'Weights & Measures licence'),
  'weights-and-measures-license': w('वज़न-माप का लाइसेंस', 'Wazan-maap ka licence', 'Weights & Measures licence'),
};

const keyOf = (s: string): string =>
  s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** The paper's name in the reader's language: our own table first, then the paper view's, then the portal's label. */
export function paperNameOf(item: Pick<PaperItem, 'docType' | 'docLabel'>, lang: Lang): string {
  const known = PAPER_NAMES[keyOf(item.docType)] ?? PAPER_NAMES[keyOf(item.docLabel || '')];
  if (known) return sayWords(known, lang);
  return docName(item, lang);
}

/** Days left of the paper that ends soonest, counted again from its date; null with no papers. */
export function soonestPaperDays(data: PaperExpiryData, now: Date): number | null {
  let best: number | null = null;
  for (const item of data.items) {
    const days = (item.validUntil ? daysUntil(item.validUntil, now) : null) ?? item.daysLeft;
    if (best === null || days < best) best = days;
  }
  return best;
}
