import type { KindFamily } from './kindStyle';

/**
 * A family colour as a CSS variable reference, for an inline style. The variables are
 * defined with a dark-mode pair in `index.css` (`--kind-dsr`, `--kind-dsr-soft`,
 * `--kind-dsr-ink`), so a colour set through this follows the phone's theme; the hex values in
 * `kindStyle.ts` do not. Use a Tailwind class (`bg-kind-dsr`) where the family is fixed in the
 * source, and this where it comes from the report's kind at run time.
 */
export function familyVar(family: KindFamily, part: 'soft' | 'ink' | '' = ''): string {
  return `var(--kind-${family}${part ? `-${part}` : ''})`;
}
