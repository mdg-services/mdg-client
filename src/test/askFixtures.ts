import type {
  DealerDocumentAskList,
  DealerDocumentAskRow,
  DealerDocumentKindOption,
} from '@dk/shared/types';

/**
 * Fixtures for the Document Ask screens.
 *
 * KEPT OUT OF `src/test/utils.tsx` DELIBERATELY. That file is imported by the
 * whole suite, including `setup.ts`, so a type it cannot resolve takes every
 * test in the app down with it — and `@dk/shared` is vendored per app, so a
 * mirror that has not run yet is exactly that situation. Here, the blast radius
 * of a stale copy is the ask tests and nothing else.
 *
 * Every date is fixed. `documentPeriodLabel` takes "today" as an argument rather
 * than reading a clock, so an assertion about the word "आज" stays true tomorrow.
 */

/** The day the ask tests pretend it is. */
export const TODAY = '2026-09-02';
export const YESTERDAY = '2026-09-01';

/**
 * A dated, non-freeform kind — the register page. This is the ONE shape that
 * earns a direct camera from the bar; see `canShootDirectly`.
 */
export const REGISTER_KIND: DealerDocumentKindOption = {
  code: 'tt-register-page',
  titleEn: "Today's register page",
  titleHi: 'आज के रजिस्टर का पन्ना',
  hintEn: 'One flat photo of the page.',
  hintHi: 'पन्ने की एक साफ़ फोटो।',
  confirmEn: "Send today's register page?",
  confirmHi: 'आज के रजिस्टर का पन्ना भेजें?',
  periodKind: 'DAY',
  freeform: false,
  srNo: 1,
};

/** A paper with no period at all, which arrives as a scan as often as a photo. */
export const NOC_KIND: DealerDocumentKindOption = {
  code: 'fire-noc',
  titleEn: 'Fire NOC',
  titleHi: 'फायर एनओसी',
  hintEn: 'Every page of the fire NOC.',
  hintHi: 'फायर एनओसी के सारे पन्ने।',
  confirmEn: 'Send your fire NOC?',
  confirmHi: 'अपनी फायर एनओसी भेजें?',
  periodKind: 'NONE',
  freeform: false,
  srNo: 2,
};

/** Whatever MDG named. Freeform, so it could be anything, including a PDF. */
export const OTHER_KIND: DealerDocumentKindOption = {
  code: 'other-document',
  titleEn: 'A document MDG asked for',
  titleHi: 'MDG ने जो माँगा',
  hintEn: 'Photograph the whole paper.',
  hintHi: 'पूरे काग़ज़ की फोटो लें।',
  confirmEn: 'Send this document?',
  confirmHi: 'यह काग़ज़ भेजें?',
  periodKind: 'DAY',
  freeform: true,
  srNo: 3,
};

/** One row on the dealer's list. Defaults to "today's register page, their turn". */
export function makeAskRow(over: Partial<DealerDocumentAskRow> = {}): DealerDocumentAskRow {
  const periodKey = over.periodKey ?? TODAY;
  const id = over.id ?? `ask-${periodKey}`;
  return {
    id,
    source: 'ask',
    submitVia: `/v1/asks/me/${id}/submit`,
    kindCode: REGISTER_KIND.code,
    titleEn: REGISTER_KIND.titleEn,
    titleHi: REGISTER_KIND.titleHi,
    hintEn: REGISTER_KIND.hintEn,
    hintHi: REGISTER_KIND.hintHi,
    confirmEn: REGISTER_KIND.confirmEn,
    confirmHi: REGISTER_KIND.confirmHi,
    periodKind: 'DAY',
    periodKey,
    // The server sends this already formatted; the screens re-format it
    // themselves so the dealer's on-device language wins. A deliberately WRONG
    // value here would catch a screen that printed the server's copy instead —
    // but a raw ISO day is the sharper trap, because that is the failure the
    // whole `documentPeriodLabel` rule exists to prevent.
    periodLabel: periodKey,
    state: 'ASKED',
    waitingOn: 'dealer',
    late: false,
    askedCount: 1,
    ...over,
  };
}

/** The whole payload, with the catalog the sheet cannot draw itself without. */
export function makeAskList(over: Partial<DealerDocumentAskList> = {}): DealerDocumentAskList {
  return {
    rows: [],
    kinds: [REGISTER_KIND, NOC_KIND, OTHER_KIND],
    today: TODAY,
    ...over,
  };
}
