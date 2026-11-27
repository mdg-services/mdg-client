import * as React from 'react';

import { getLang, useLangStore, type Lang } from '@/store/lang';

import { translate, type MessageKey, type TVars } from '../i18n';

/**
 * Plural keys (spec 3.3, section 7). Hindi and English agree differently ("1 thing waits" against
 * "आपके लिए 1 काम है"), so a counted sentence is written as TWO keys in every language,
 * `<key>.one` and `<key>.many`, and the number picks one. Zero uses `.many`.
 */

/** The base of every key that has a `.one` twin: `tn('kit.more', 3)` is only offered what exists. */
export type PluralBase = MessageKey extends infer K
  ? K extends `${infer B}.one`
    ? B
    : never
  : never;

/** The key for a count: `.one` for exactly 1, otherwise `.many`. */
export function pluralKey<B extends PluralBase>(base: B, n: number): MessageKey {
  return `${base}.${n === 1 ? 'one' : 'many'}` as MessageKey;
}

/** The counted sentence in `lang`. `{n}` is filled in; any further `vars` ride along. */
export function tnIn(lang: Lang, base: PluralBase, n: number, vars?: TVars): string {
  return translate(lang, pluralKey(base, n), { ...vars, n });
}

/** The counted sentence in the reader's current language. Not reactive: use `useTn` inside a component. */
export function tn(base: PluralBase, n: number, vars?: TVars): string {
  return tnIn(getLang(), base, n, vars);
}

/** `tn` for a component: re-renders when the reader changes language. */
export function useTn(): (base: PluralBase, n: number, vars?: TVars) => string {
  const lang = useLangStore((s) => s.lang);
  return React.useCallback((base, n, vars) => tnIn(lang, base, n, vars), [lang]);
}
