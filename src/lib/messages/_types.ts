import type { LangMessage } from '../i18n';

/**
 * Shapes shared by every per-area message file (spec section 8).
 *
 * An area file exports its keys and its Hinglish side by side:
 *
 *   export const todayMessages = { 'today.x': { en: '…', hi: '…' } } satisfies Record<string, LangMessage>;
 *   export const todayHl: AreaHl<typeof todayMessages> = { 'today.x': '…' };
 *
 * `i18n.ts` spreads every `*Messages` into `messages` and `i18n.hl.ts` spreads every `*Hl` into `hl`,
 * so a key without Hinglish is still a compile error.
 */
export type AreaMessages = Record<string, LangMessage>;

/** The Hinglish side of an area: every key of the area, once. */
export type AreaHl<M extends AreaMessages> = Record<keyof M, string>;

/**
 * Which key prefixes belong to which area file. A prefix belongs to exactly one file, so two builders
 * can never write the same key. Read by `i18n.areas.test.ts`.
 */
export const AREA_PREFIXES = {
  kit: ['kit.'],
  shell: ['shell.'],
  glance: ['glance.'],
  today: ['today.'],
  services: ['svc.', 'serviceAbout.'],
  reports: ['rep.'],
  reportViews1: ['rv1.'],
  reportViews2: ['rv2.'],
  reportViews3: ['rv3.'],
  kavach: ['kv.'],
  pump: ['pump.'],
  staff: ['warr.'],
  bill: ['bill.'],
  chat: ['chatl.'],
  firstrun: ['first.'],
} as const;

export type AreaName = keyof typeof AREA_PREFIXES;
