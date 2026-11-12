/**
 * Nothing the dealer gave us, or we made for them, opens outside the app —
 * checked before every build and every test run.
 *
 * WHY THIS EXISTS
 * ---------------
 * Inside the phone app, the shell hands every address that is not the app's own
 * to the phone's browser — that is how a web link in chat opens, and it is right
 * for a web link. But photos and papers live at a storage address, so a plain
 * `<a href={photo.url} target="_blank">` on a Mock Drill photo threw the owner
 * out of the app into Chrome to look at their own picture (12 Nov 2026), and
 * opened a stray tab on the web. The washroom declaration photo and the DU OTP
 * paper did the same.
 *
 * So every way of leaving the page — a new tab, `window.open`, a computed
 * `href`, `location.assign` — is allowed only where it is on purpose, and each
 * allowed place is counted. A new one stops the build. Use instead:
 *
 *  - a photo:        `PhotoThumb` / `PhotoViewer` (`@/components/PhotoViewer`)
 *  - a PDF:          `PdfViewer` (`@/components/PdfViewer`)
 *  - any other file: `deliverDownload` / `useAttachmentDownload` (`@/lib/downloadAttachment`)
 *  - a website page: `openWebPage` (`@/lib/legalLinks`) — and add it below, with why
 *
 * Plain Node, no packages, so it runs before the build anywhere (Vercel too):
 *
 *   cd mdg-client && npm run check:leaving-the-app
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');

/** The places that leave the page on purpose, how many times each, and why. */
const ALLOWED = {
  'src/lib/legalLinks.ts': {
    count: 1,
    why: 'openWebPage: the one road for a page of the website (privacy, terms) to the browser',
  },
  'src/components/PrivacyLink.tsx': {
    count: 2,
    why: 'the privacy policy is a website page; the tap goes through openWebPage',
  },
  'src/lib/linkify.tsx': {
    count: 2,
    why: 'a web link someone typed in chat opens in the browser, as on WhatsApp',
  },
  'src/pages/ChatMediaPage.tsx': { count: 2, why: 'the Links tab lists those same typed web links' },
  'src/pages/LoginPage.tsx': { count: 1, why: 'the helpline number is a tel: link — it opens the dialler' },
  'src/lib/nativeBridge.ts': {
    count: 2,
    why: 'an oil-company portal page cannot be shown in the app; old shells and browsers get it outside',
  },
  'src/lib/downloadAttachment.ts': {
    count: 1,
    why: 'the file road itself: the last fallback for a plain browser or an old shell',
  },
  'src/features/embed/embedBridge.ts': {
    count: 1,
    why: 'the chat embedded in another site: a web link leaves the panel, not replaces it',
  },
  'src/features/outlets/useOutlets.ts': {
    count: 1,
    why: "a reload of the app's own /chat after switching outlets — it never leaves the app",
  },
};

/** Comments explain the rule and quote the bad pattern; only code counts. */
function code(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** How many times a file leaves the page. A `target="_blank"` with its `'_blank'` counts once. */
export function exits(text) {
  const c = code(text);
  const count = (re) => c.match(re)?.length ?? 0;
  const target = count(/\btarget\s*[=:]\s*\{?\s*["'`]_blank/g);
  const blank = count(/['"`]_blank['"`]/g);
  const open = count(/\bwindow\.open\s*\(/g);
  const assign = count(/\blocation\.(assign|replace)\s*\(/g);
  // Any link built from a value. The dealer app has few, so all of them count.
  const href = count(/\bhref=\{/g);
  return target + open + assign + href + Math.max(0, blank - target - open);
}

function sources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sources(p);
    return /\.tsx?$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });
}

describe('nothing of ours opens outside the app', () => {
  const files = sources(SRC);

  it("is actually looking at the app's source", () => {
    assert.ok(files.length > 100, `only ${files.length} files found under ${SRC}`);
    const seen = new Set(files.map((f) => relative(ROOT, f)));
    for (const path of Object.keys(ALLOWED)) assert.ok(seen.has(path), `${path} is gone: drop it from ALLOWED`);
  });

  it('leaves the page only in the places listed, as many times as listed', () => {
    const found = {};
    for (const f of files) {
      const n = exits(readFileSync(f, 'utf8'));
      if (n > 0) found[relative(ROOT, f)] = n;
    }
    const expected = Object.fromEntries(Object.entries(ALLOWED).map(([p, a]) => [p, a.count]));
    // A file here that is not in ALLOWED opens something outside the app. A photo
    // belongs in PhotoViewer, a PDF in PdfViewer — see the top of this file.
    assert.deepEqual(found, expected);
  });

  it('counts the patterns it is meant to catch', () => {
    assert.equal(exits('<a href={photo.url} target="_blank" rel="noopener">x</a>'), 2);
    assert.equal(exits("window.open(file.url, '_blank', 'noopener');"), 1);
    assert.equal(exits("const a = { target: '_blank' };"), 1);
    assert.equal(exits('window.location.assign(url);'), 1);
    assert.equal(exits('// <a href={photo.url} target="_blank">\n/* window.open(x) */'), 0);
  });
});
