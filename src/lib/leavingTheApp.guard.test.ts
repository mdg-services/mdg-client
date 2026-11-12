import { describe, expect, it } from 'vitest';

/**
 * Nothing the dealer gave us, or we made for them, opens outside the app.
 *
 * WHY THIS EXISTS
 * ---------------
 * Inside the phone app, the shell hands every address that is not the app's own
 * to the phone's browser — that is how a web link in chat opens, and it is right
 * for a web link. But photos and papers live at a storage address, so a plain
 * `<a href={photo.url} target="_blank">` on a Mock Drill photo threw the owner
 * out of the app into Chrome to look at their own picture (and opened a stray tab
 * on the web). The washroom declaration photo and the DU OTP paper did the same.
 *
 * So every way of leaving the page — a new tab, `window.open`, a computed
 * `href`, `location.assign` — is allowed only where it is on purpose, and each
 * allowed place is counted. A new one fails here. Use instead:
 *
 *  - a photo:        `PhotoThumb` / `PhotoViewer` (`@/components/PhotoViewer`)
 *  - a file or PDF:  `deliverDownload` or `useAttachmentDownload` (`@/lib/downloadAttachment`)
 *  - a website page: `openWebPage` (`@/lib/legalLinks`) — and add it below, with why
 */

const sources = import.meta.glob(['/src/**/*.ts', '/src/**/*.tsx', '!/src/**/*.test.*'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** The places that leave the page on purpose, how many times each, and why. */
const ALLOWED: Record<string, { count: number; why: string }> = {
  '/src/lib/legalLinks.ts': {
    count: 1,
    why: 'openWebPage: the one road for a page of the website (privacy, terms) to the browser',
  },
  '/src/components/PrivacyLink.tsx': {
    count: 2,
    why: 'the privacy policy is a website page; the tap goes through openWebPage',
  },
  '/src/lib/linkify.tsx': {
    count: 2,
    why: 'a web link someone typed in chat opens in the browser, as on WhatsApp',
  },
  '/src/pages/ChatMediaPage.tsx': {
    count: 2,
    why: 'the Links tab lists those same typed web links',
  },
  '/src/pages/LoginPage.tsx': {
    count: 1,
    why: 'the helpline number is a tel: link — it opens the dialler',
  },
  '/src/lib/nativeBridge.ts': {
    count: 2,
    why: 'an oil-company portal page cannot be shown in the app; old shells and browsers get it outside',
  },
  '/src/lib/downloadAttachment.ts': {
    count: 1,
    why: 'the file road itself: the last fallback for a plain browser or an old shell',
  },
  '/src/features/embed/embedBridge.ts': {
    count: 1,
    why: 'the chat embedded in another site: a web link leaves the panel, not replaces it',
  },
  '/src/features/outlets/useOutlets.ts': {
    count: 1,
    why: "a reload of the app's own /chat after switching outlets — it never leaves the app",
  },
};

const LEAVES_THE_PAGE = [
  /\btarget\s*[=:]\s*\{?\s*["'`]_blank/g,
  /['"`]_blank['"`]/g,
  /\bwindow\.open\s*\(/g,
  /\blocation\.(assign|replace)\s*\(/g,
  /\bhref=\{/g,
];

/** Comments explain the rule and quote the bad pattern; only code counts. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** How many times a file leaves the page: a `target="_blank"` with its `'_blank'` counts once. */
function exits(text: string): number {
  const c = code(text);
  const count = (re: RegExp) => c.match(re)?.length ?? 0;
  const [target, blank, open, assign, href] = LEAVES_THE_PAGE.map(count);
  // `window.open(url, '_blank')` matches both `open` and `blank`; `target="_blank"`
  // matches both `target` and `blank`. Count each place once.
  return target + open + assign + href + Math.max(0, blank - target - open);
}

describe('nothing of ours opens outside the app', () => {
  // A guard that scanned nothing would pass for ever.
  it("is actually looking at the app's source", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(100);
    for (const path of Object.keys(ALLOWED)) expect(Object.keys(sources)).toContain(path);
  });

  it('leaves the page only in the places listed, as many times as listed', () => {
    const found: Record<string, number> = {};
    for (const [path, text] of Object.entries(sources)) {
      const n = exits(text);
      if (n > 0) found[path] = n;
    }
    const expected = Object.fromEntries(Object.entries(ALLOWED).map(([p, a]) => [p, a.count]));
    // A file here that is not in ALLOWED opens something outside the app. A photo
    // belongs in PhotoViewer, a file in deliverDownload — see the top of this file.
    expect(found).toEqual(expected);
  });

  it('counts the patterns it is meant to catch', () => {
    expect(exits('<a href={photo.url} target="_blank" rel="noopener">x</a>')).toBe(2);
    expect(exits("window.open(file.url, '_blank', 'noopener');")).toBe(1);
    expect(exits("const a = { target: '_blank' };")).toBe(1);
    expect(exits('window.location.assign(url);')).toBe(1);
    expect(exits('// <a href={photo.url} target="_blank">\n/* window.open(x) */')).toBe(0);
  });
});
