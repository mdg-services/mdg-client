import type { LangMessage } from '../i18n';

import type { AreaHl } from './_types';

/**
 * The `reportViews1` area's words (spec section 8): the report overlay's shell. Keys start with
 * `rv1.` (see `AREA_PREFIXES` in `_types.ts`).
 *
 * The overlay's older words (`report.close`, `report.share`, `report.seeInChat`, the banners and the
 * empty screens) are still read from the base catalog: reusing an old key is fine, deleting it is
 * group Z's job. Only what the new footer needs is new.
 */
export const reportViews1Messages = {
  // The footer holds one main button and "More". "More" opens a short list of the rest.
  'rv1.more': { en: 'More', hi: 'और विकल्प' },
  'rv1.more.label': { en: 'More: {items}', hi: 'और विकल्प: {items}' },
  'rv1.more.sheet': { en: 'More for this report', hi: 'इस रिपोर्ट के लिए और विकल्प' },
  'rv1.more.close': { en: 'Close this list', hi: 'यह सूची बंद करें' },
} satisfies Record<string, LangMessage>;

export const reportViews1Hl: AreaHl<typeof reportViews1Messages> = {
  'rv1.more': 'Aur vikalp',
  'rv1.more.label': 'Aur vikalp: {items}',
  'rv1.more.sheet': 'Is report ke liye aur vikalp',
  'rv1.more.close': 'Yeh list band karein',
};
