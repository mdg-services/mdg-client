import { kindStyle } from '@/features/reports/kindStyle';
import type { ReportKind } from '@dk/shared/types';

/**
 * The family colour of a kind as a CSS variable (`--kind-dsr`, `--kind-dsr-soft`,
 * `--kind-dsr-ink`), for an inline style: the dark theme's pair then applies by itself,
 * which a hex value from `kindStyle` would not.
 */
export const familyVar = (kind: ReportKind, part: '' | '-soft' | '-ink' = ''): string =>
  `var(--kind-${kindStyle(kind).family}${part})`;
