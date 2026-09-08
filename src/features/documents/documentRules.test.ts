import { describe, expect, it } from 'vitest';

import { TODAY, YESTERDAY, makeAskRow, makeOnFileRow } from '@/test/askFixtures';

import {
  askIdFromSearch,
  findAskRow,
  hasValidity,
  renewalPointer,
  validityTone,
} from './documentRules';

/**
 * The decidable half of the papers screen.
 *
 * Exercised here rather than by rendering the page, for the reason
 * `askRules.ts` gives about itself: each of these is a rule somebody argued
 * about, and a rule that can only be reached through a component is a rule
 * nobody checks. Two of them are load-bearing in ways a screenshot would not
 * show — the deep-link reader has to survive three different shapes of row id,
 * and the renewal pointer has to stay silent about a job that is already done.
 */

describe('askIdFromSearch — the link a notification opens', () => {
  it('reads the id the server put in the push', () => {
    expect(askIdFromSearch('?ask=65f0000000000000000000aa')).toBe('65f0000000000000000000aa');
  });

  /**
   * A derived line's id is `owed:<kindCode>:<periodKey>` — a label, not a
   * handle — and the server percent-encodes it into the query. Nothing here
   * knows the three shapes apart on purpose: a decoder that did would break on
   * the fourth.
   */
  it('decodes an owed line, colons and all', () => {
    const id = `owed:tt-register-page:${YESTERDAY}`;
    expect(askIdFromSearch(`?ask=${encodeURIComponent(id)}`)).toBe(id);
  });

  it('decodes a Kavach row’s prefixed id', () => {
    expect(askIdFromSearch('?ask=kavach%3A65f0000000000000000000bb')).toBe(
      'kavach:65f0000000000000000000bb',
    );
  });

  it('reads nothing out of a plain visit, and nothing out of an empty parameter', () => {
    expect(askIdFromSearch('')).toBeNull();
    expect(askIdFromSearch('?c=1')).toBeNull();
    expect(askIdFromSearch('?ask=')).toBeNull();
    expect(askIdFromSearch('?ask=%20%20')).toBeNull();
  });
});

describe('findAskRow — which card the push meant', () => {
  const rows = [
    makeAskRow({ id: 'a', periodKey: TODAY }),
    makeAskRow({ id: 'b', periodKey: YESTERDAY }),
  ];

  it('matches on the id, which is what a push carries', () => {
    expect(findAskRow(rows, 'b')?.periodKey).toBe(YESTERDAY);
  });

  /**
   * A miss is ordinary and is not an error: the ask may have been withdrawn,
   * settled and aged off the list, or answered from the other phone at the same
   * outlet since the notification went out.
   */
  it('finds nothing without complaining when the ask has gone', () => {
    expect(findAskRow(rows, 'long-gone')).toBeUndefined();
    expect(findAskRow(rows, null)).toBeUndefined();
  });
});

describe('renewalPointer — the job, not just the news', () => {
  const filed = makeOnFileRow({ renewedByAskId: 'renewal-1' });

  it('points at the renewal while it is still the dealer’s move', () => {
    const renewal = makeAskRow({ id: 'renewal-1' });
    expect(renewalPointer(filed, [renewal])?.id).toBe('renewal-1');
  });

  /**
   * `renewedByAskId` says a renewal WAS opened, not that there is anything left
   * to do. A card that kept saying "MDG has asked you for the new one" after the
   * photograph had gone would be asking for a thing already sent — which is how
   * one page gets photographed twice.
   */
  it('says nothing once the renewal is with MDG', () => {
    const sent = makeAskRow({ id: 'renewal-1', state: 'SENT', waitingOn: 'mdg' });
    expect(renewalPointer(filed, [sent])).toBeUndefined();
  });

  it('says nothing once MDG has accepted it', () => {
    const done = makeAskRow({ id: 'renewal-1', state: 'ACCEPTED', waitingOn: 'none' });
    expect(renewalPointer(filed, [done])).toBeUndefined();
  });

  /** Aged off the to-do list entirely — there is no job to point at. */
  it('says nothing when the named ask is not on the list at all', () => {
    expect(renewalPointer(filed, [])).toBeUndefined();
  });

  it('says nothing for a paper no renewal was ever opened for', () => {
    expect(renewalPointer(makeOnFileRow(), [makeAskRow({ id: 'renewal-1' })])).toBeUndefined();
  });
});

describe('validityTone — how loudly to draw a date', () => {
  it('maps the server’s verdict, and only the server’s verdict', () => {
    expect(validityTone('expired')).toBe('gone');
    expect(validityTone('expiring')).toBe('soon');
    expect(validityTone('valid')).toBe('fine');
  });

  /**
   * A register page has no expiry and never will. `none` is what stops the card
   * printing "valid until —" and sending a dealer hunting for a date that was
   * never on the paper.
   */
  it('draws nothing at all for a paper with no verdict', () => {
    expect(validityTone(undefined)).toBe('none');
  });
});

describe('hasValidity — both halves or neither', () => {
  it('is true only when the day and the verdict arrived together', () => {
    expect(hasValidity(makeOnFileRow())).toBe(true);
  });

  /**
   * A `validUntil` the server could not read carries no `validityState`, and no
   * verdict beats a green one.
   */
  it('is false for a date the server passed no judgement on', () => {
    expect(
      hasValidity({ validUntil: '2027-12-31', validityState: undefined }),
    ).toBe(false);
    expect(hasValidity({ validUntil: undefined, validityState: 'valid' })).toBe(false);
  });
});
