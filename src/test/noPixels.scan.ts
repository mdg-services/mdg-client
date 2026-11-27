import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * The scanner behind the build-time guard (spec 5, `noPixels.test.ts`). Plain functions with no
 * test framework in them, so the guard and its frozen list are made from the same code.
 */

/** The patterns the redesign forbids in a source file (spec 3.1 and 5). */
export const RULES = {
  /** `text-[13px]`: only the named sizes (`text-body`, `text-meta`, ...) are used. */
  textPx: /text-\[\d/g,
  /** `h-[72px]`, `min-h-[64px]`, `max-h-[...px]`: rows grow with the text, so heights are `min-h-*` in rem. */
  heightPx: /h-\[\d+px/g,
  /** `w-[200px]`, `min-w-[..px]`, `max-w-[..px]`: nothing around text is a fixed number of pixels wide. */
  widthPx: /w-\[\d+px/g,
  /** Names wrap: a name cut to "Ram…" greets nobody. */
  truncate: /\btruncate\b/g,
  lineClamp: /line-clamp/g,
  /** No dark mode (ADR 0060). */
  dark: /\bdark:/g,
  /** Nothing opens outside the app. */
  blank: /target=["{'`]*_blank/g,
} as const;

export type RuleName = keyof typeof RULES;
export type Counts = Partial<Record<RuleName, number>>;

/** The source with `/* *\/` and `//` comments removed, so a sentence about a rule is not a breach of it. */
export function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`\w\\])\/\/.*$/gm, '$1');
}

/** How many times each rule is broken in a piece of source. Only the rules that are broken appear. */
export function scanText(src: string): Counts {
  const code = stripComments(src);
  const out: Counts = {};
  for (const [name, re] of Object.entries(RULES) as [RuleName, RegExp][]) {
    const n = (code.match(re) ?? []).length;
    if (n > 0) out[name] = n;
  }
  return out;
}

/** `src/` of the client. */
export const SRC_ROOT = join(__dirname, '..');

/**
 * Every source file the guard reads, as paths relative to `src/` with forward slashes. Not read:
 * tests and test helpers (they quote the patterns on purpose), type declarations, and the two sentence
 * catalogs (`i18n*.ts`, `lib/messages/`), whose text may use the word "truncate" in a sentence.
 */
export function sourceFiles(root: string = SRC_ROOT): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const rel = relative(root, full).split(sep).join('/');
      if (statSync(full).isDirectory()) {
        if (rel === 'test' || rel === 'lib/messages') continue;
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(name)) continue;
      if (/\.(test|spec)\.(ts|tsx)$/.test(name) || name.endsWith('.d.ts')) continue;
      if (/^lib\/i18n(\.[a-z]+)?\.ts$/.test(rel)) continue;
      out.push(rel);
    }
  };
  walk(root);
  return out.sort();
}

export function scanFile(rel: string, root: string = SRC_ROOT): Counts {
  return scanText(readFileSync(join(root, rel), 'utf8'));
}

export function fileExists(rel: string, root: string = SRC_ROOT): boolean {
  return existsSync(join(root, rel));
}
