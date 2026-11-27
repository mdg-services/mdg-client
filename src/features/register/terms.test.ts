import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { TERMS_EN, TERMS_HI, TERMS_NEW_PUMP_EN, TERMS_NEW_PUMP_HI } from './terms';

/**
 * The app shows these clauses, but the website records what the person agreed to:
 * a fingerprint of ITS copy of the clauses (mdg-landing `server/terms.ts`). If the
 * two copies drift, a registration made in the app claims agreement to text the
 * person never saw. The two repos are checked out apart, so this test cannot read
 * the website's file; it pins the same fingerprints the website pins in the newest
 * entry of `TERMS_HISTORY` (mdg-landing `scripts/enroll.check.ts`) instead.
 *
 * When the website's clauses change: copy them here word for word and put the new
 * fingerprints below, the same ones added to TERMS_HISTORY.
 */
const WEBSITE = {
  outlet: {
    en: '3966eee24caa725648a3784c765a606d2e9ee0aaa6ffe673e080076ba00cc578',
    hi: '8d0d791f372d07c7888675508ec0b28b3df33e9601de35e0ccfe6bdf7c831127',
  },
  planner: {
    en: '86e597871733953a5eee9efe0c41de2dd4a28bc07a4aaab42d01971fe97b9265',
    hi: '46eb8a04357493e13f465aaa089d0654694713aaa7230253a137ba7a2652cf6d',
  },
};

/** Same recipe as the website: SHA-256 of each clause followed by a line feed. */
function fingerprint(clauses: readonly string[]): string {
  const hash = createHash('sha256');
  for (const clause of clauses) hash.update(`${clause}\n`, 'utf8');
  return hash.digest('hex');
}

describe('the app shows the same terms the website records', () => {
  it('outlet terms, English and Hindi', () => {
    expect(fingerprint(TERMS_EN)).toBe(WEBSITE.outlet.en);
    expect(fingerprint(TERMS_HI)).toBe(WEBSITE.outlet.hi);
  });

  it('Kavach Shuruaat terms, English and Hindi', () => {
    expect(fingerprint(TERMS_NEW_PUMP_EN)).toBe(WEBSITE.planner.en);
    expect(fingerprint(TERMS_NEW_PUMP_HI)).toBe(WEBSITE.planner.hi);
  });
});
