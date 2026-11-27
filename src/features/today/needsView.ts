import type { Glance } from '@/features/glance/glanceModel';
import type { NeedsMeItem } from '@/features/glance/needsMe';
import { fuelName } from '@/features/reports/kinds/dsr_sales/fmt';
import { fmtLitres } from '@/lib/fmt';
import { translate } from '@/lib/i18n';
import { tnIn } from '@/lib/messages/_plural';
import type { Lang } from '@/store/lang';

import { usableData } from './todayView';

/**
 * What the verdict card, the "Needs you" heading and the cards say, all read from ONE list (the glance
 * model's Needs-you list) so the owner never meets three different numbers for the same thing (owner
 * defect: the card said 5 + 6, the heading said 8). Pure: no React, no clock.
 */

// ── one list, two counts ────────────────────────────────────────────────────

export interface NeedsCounts {
  /** Open tasks and Kavach points: work only the dealer can do. */
  needYou: number;
  /** Alerts of the reports: something to look at. */
  look: number;
  /** Always `needYou + look`: the length of the list. */
  total: number;
}

/** The two counts of the verdict card, taken from the very list that is drawn. */
export function needsCounts(items: readonly Pick<NeedsMeItem, 'source'>[]): NeedsCounts {
  const needYou = items.filter((i) => i.source !== 'alert').length;
  return { needYou, look: items.length - needYou, total: items.length };
}

// ── one fact, said once ─────────────────────────────────────────────────────

/**
 * A stock variation is two numbers: the stock difference (520 L short) and how far past the limit it is
 * (100 L). The report's own headline prints the first, the tile the second, and the owner could not
 * tell which was true. The Needs-you line says both, in one sentence: "Diesel is 100 L beyond the limit
 * (520 L short)". Every other row is left as the report's view wrote it.
 */
export function refineNeedsMe(items: readonly NeedsMeItem[], lang: Lang, isOwner: boolean): NeedsMeItem[] {
  return items.map((item) => {
    if (item.source !== 'alert' || item.report?.kind !== 'dsr_variation') return item;
    const data = usableData(item.report, isOwner);
    if (data?.kind !== 'dsr_variation' || data.beforeInspection || !Array.isArray(data.products)) return item;
    const worst = data.products
      .filter((p) => p.variation && Math.abs(p.variation.offL) > 0)
      .sort((a, b) => Math.abs(b.variation.offL) - Math.abs(a.variation.offL))[0];
    if (!worst) return item;
    const { offL, variationL } = worst.variation;
    const text = translate(lang, variationL > 0 ? 'today.var.beyondOver' : 'today.var.beyondShort', {
      fuel: fuelName(worst.key, lang),
      off: fmtLitres(Math.abs(Math.round(offL)), lang),
      n: fmtLitres(Math.abs(Math.round(variationL)), lang),
    });
    return { ...item, text };
  });
}

// ── the verdict's words ─────────────────────────────────────────────────────

/** The word of the card. Counted from the list for the two verdicts that count it; else the model's own. */
export function verdictWordOf(glance: Pick<Glance, 'verdict' | 'word'>, counts: NeedsCounts, lang: Lang): string {
  if (glance.verdict === 'needs_you' && counts.needYou > 0) return tnIn(lang, 'glance.verdict.needs', counts.needYou);
  if (glance.verdict === 'look' && counts.look > 0) return tnIn(lang, 'glance.verdict.look', counts.look);
  return glance.word;
}

/** One stop for the language: the Hindi danda, else a full stop. */
export function stopFor(lang: Lang): string {
  return lang === 'hi' ? '।' : '.';
}

const ENDS = /[.।!?\s]+$/;

/**
 * The sentence under the verdict word: the top two reasons joined by a plain word ("and", "और",
 * "aur") with ONE stop, instead of two sentences glued with whatever stop each carried. The same
 * reasons the glance model picks: problems first when there is a problem, the stopped-supply line when
 * no row already says it, then the calm "report has not come" line.
 */
export function verdictSentenceOf(args: {
  glance: Pick<Glance, 'verdict' | 'problems' | 'missingReport' | 'sentence'>;
  items: readonly NeedsMeItem[];
  /** The Pump-now supply row's sentence, when the supply is stopped and no Needs-you row says so. */
  supplyStopped?: string;
  lang: Lang;
}): string | undefined {
  const { glance, items, supplyStopped, lang } = args;
  const counted = glance.verdict === 'problem' || glance.verdict === 'needs_you' || glance.verdict === 'look';
  if (!counted) return glance.sentence;
  const ordered =
    glance.problems > 0 ? [...items].sort((a, b) => Number(b.status === 'problem') - Number(a.status === 'problem')) : [...items];
  const lines = ordered.map((i) => i.text);
  if (supplyStopped) lines.unshift(supplyStopped);
  if (glance.missingReport) lines.push(translate(lang, 'glance.report.missing'));
  const top = lines
    .slice(0, 2)
    .map((l) => l.trim().replace(ENDS, ''))
    .filter(Boolean);
  if (top.length === 0) return glance.sentence;
  return `${top.join(` ${translate(lang, 'today.verdict.and')} `)}${stopFor(lang)}`;
}
