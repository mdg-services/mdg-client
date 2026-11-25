import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { DEVANAGARI, kavach, renderOverlay } from './_supplyTestKit';
import { stateOf, view } from './kavach';

afterEach(cleanup);

const shield = () => screen.getByTestId('kavach-shield');

describe('Kavach: the shield', () => {
  it('fills to the score, prints the number and says the tier in words', () => {
    renderOverlay(view, kavach());
    expect(screen.getByTestId('report-lead')).toHaveTextContent('Your Kavach score is 87% today.');
    expect(shield()).toHaveAttribute('data-state', 'score');
    expect(shield()).toHaveAttribute('data-level', '87');
    expect(shield().textContent).toContain('87%');
    expect(screen.getByTestId('kavach-tier')).toHaveTextContent('Good');
    // the fill's top edge is at 87% of the shield's height
    const rect = screen.getByTestId('kavach-fill');
    expect(Number(rect.getAttribute('y'))).toBeCloseTo(194 - 186 * 0.87, 1);
  });

  it('puts a ring of dots round it, one in twenty lit per five percent', () => {
    renderOverlay(view, kavach());
    const dots = screen.getByTestId('kavach-dots').querySelectorAll('circle');
    expect(dots).toHaveLength(20);
    expect(Array.from(dots).filter((d) => d.getAttribute('data-on') === 'true')).toHaveLength(17);
  });

  it('names the four tiers in words, never with a red alarm', () => {
    const tiers: Array<[number, string]> = [
      [95, 'Excellent'],
      [80, 'Good'],
      [60, 'Needs attention'],
      [20, 'Work outstanding'],
    ];
    for (const [pct, word] of tiers) {
      const { unmount } = renderOverlay(view, kavach({ pct }));
      expect(screen.getByTestId('kavach-tier')).toHaveTextContent(word);
      unmount();
    }
  });

  it('draws an hourglass and NO number while the score is withheld (settling in)', () => {
    renderOverlay(view, kavach({ scored: true, scorePublishable: false, pct: undefined, validPoints: undefined, totalPoints: undefined }));
    expect(stateOf(kavach({ scorePublishable: false }))).toBe('settling');
    expect(shield()).toHaveAttribute('data-state', 'settling');
    expect(screen.getByTestId('report-lead')).toHaveTextContent('We are checking your pump.');
    expect(shield().textContent).not.toMatch(/\d/);
    expect(document.body.textContent).not.toContain('%');
    expect(screen.queryByTestId('kavach-fill')).toBeNull();
  });

  it('shows a number never when a withheld score still carries a stray pct', () => {
    renderOverlay(view, kavach({ scorePublishable: false, pct: 0 }));
    expect(document.body.textContent).not.toContain('0%');
  });

  it('draws an empty outline with a question mark when there is no score yet', () => {
    renderOverlay(view, kavach({ scored: false, scorePublishable: false, pct: undefined, asks: [], pending: [] }));
    expect(shield()).toHaveAttribute('data-state', 'unscored');
    expect(shield().textContent).toContain('?');
    expect(screen.getByTestId('report-lead')).toHaveTextContent('No score yet. We have not started checking.');
    expect(document.body.textContent).not.toContain('%');
  });

  it('says in words how many items are not checked yet', () => {
    renderOverlay(view, kavach());
    expect(screen.getByTestId('kavach-unchecked')).toHaveTextContent('We have not checked 11 items yet.');
    cleanup();
    renderOverlay(view, kavach({ unverifiedCount: 0 }));
    expect(screen.queryByTestId('kavach-unchecked')).toBeNull();
  });

  it('ticks the shield and says well done when everything is checked', () => {
    renderOverlay(view, kavach({ pct: 100, asks: [], pending: [], unverifiedCount: 0, pendingOverflow: 0 }));
    expect(screen.getByTestId('kavach-tick')).toBeInTheDocument();
    expect(screen.getByTestId('kavach-all-checked')).toHaveTextContent('Everything is checked. Well done.');
  });
});

describe('Kavach: what we need from the dealer', () => {
  it('lists every ask, uncapped, each with a 48 px Send photo button that opens the chat', () => {
    const asks = Array.from({ length: 7 }, (_, i) => ({
      code: `c${i}`,
      itemId: `it-${i}`,
      label: { en: `Photo ${i}`, hi: `फ़ोटो ${i}` },
      points: 10 + i,
      state: 'asked' as const,
    }));
    renderOverlay(view, kavach({ asks }));
    const section = screen.getByTestId('kavach-asks');
    expect(section).toHaveTextContent('We need 7 photos from you');
    const rows = within(section).getAllByTestId('kavach-ask');
    expect(rows).toHaveLength(7);
    const button = within(rows[0]!).getByRole('button');
    expect(button).toHaveTextContent('Send photo');
    expect(button).toHaveAttribute('aria-label', 'Send photo for Photo 0');
    expect(button.className).toContain('min-h-[48px]');
    fireEvent.click(button);
    expect(screen.getByTestId('where')).toHaveAttribute('data-path', '/chat/conv-1');
    expect(screen.getByTestId('where')).toHaveAttribute('data-jump', 'msg-1');
  });

  it('asks the dealer to send a rejected photo again, calmly', () => {
    renderOverlay(
      view,
      kavach({ asks: [{ code: 'c', itemId: 'i', label: { en: 'Forecourt photo', hi: 'फोरकोर्ट' }, points: 30, state: 'rejected' }] }),
    );
    expect(screen.getByTestId('kavach-ask')).toHaveTextContent('Please send the photo again.');
  });

  it('draws the asks above the shield', () => {
    renderOverlay(view, kavach());
    const asks = screen.getByTestId('kavach-asks');
    expect(asks.compareDocumentPosition(shield()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('uses the Hindi names of the tasks for a Hindi reader', () => {
    renderOverlay(view, kavach(), 'hi');
    expect(screen.getByTestId('kavach-ask')).toHaveTextContent('फोरकोर्ट की फ़ोटो');
    expect(screen.getByTestId('kavach-ask')).toHaveTextContent('30 अंक');
    expect(screen.getByTestId('report-lead')).toHaveTextContent('आज आपका कवच स्कोर 87% है।');
  });
});

describe('Kavach: still pending', () => {
  it('lists the work with MDG with a word for each status', () => {
    renderOverlay(view, kavach());
    const rows = screen.getAllByTestId('kavach-pending');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Licence copy');
    expect(rows[0]).toHaveTextContent('20 points');
    expect(rows[0]).toHaveTextContent('Ends soon');
    expect(rows[1]).toHaveTextContent('Not checked yet');
  });

  it('says how many more there are and links to the chat', () => {
    renderOverlay(view, kavach({ pendingOverflow: 3 }));
    expect(screen.getByTestId('kavach-overflow')).toHaveTextContent('and 3 more');
    fireEvent.click(screen.getByTestId('kavach-see-all'));
    expect(screen.getByTestId('where')).toHaveAttribute('data-path', '/chat/conv-1');
  });

  it('says every status in words in all three languages', () => {
    for (const status of ['EXPIRED', 'EXPIRING_SOON', 'NOT_YET_VERIFIED', 'SOS_FLAGGED'] as const) {
      for (const lang of ['hi', 'hl', 'en'] as const) {
        const { unmount } = renderOverlay(
          view,
          kavach({ asks: [], pending: [{ code: 'x', label: { en: 'X', hi: 'एक्स' }, points: 5, status }] }),
          lang,
        );
        expect(screen.getByTestId('kavach-pending').textContent!.length).toBeGreaterThan(8);
        if (lang === 'hi') expect(screen.getByTestId('kavach-pending').textContent).toMatch(DEVANAGARI);
        unmount();
      }
    }
  });
});

describe('Kavach: tile, alert, headline, share', () => {
  it('has a tile with the score and, when a photo is owed, says so', () => {
    expect(view.tile(kavach({ asks: [] }), 'en')).toEqual({ value: '87%', sub: 'Good · 11 not checked yet', status: 'waiting' });
    expect(view.tile(kavach(), 'en')).toEqual({ value: '87%', sub: '1 photo needed', status: 'waiting' });
    expect(view.tile(kavach({ pct: 92, asks: [], unverifiedCount: 0 }), 'en')).toEqual({ value: '92%', sub: 'Excellent', status: 'ok' });
  });

  it('has a tile with no number while settling in or unscored', () => {
    expect(view.tile(kavach({ scorePublishable: false, pct: undefined, asks: [] }), 'en')).toEqual({
      value: 'Checking',
      sub: 'We are checking your pump',
      status: 'waiting',
    });
    // A short word for the big text in every language; the sentence is the small line.
    expect(view.tile(kavach({ scorePublishable: false, pct: undefined, asks: [] }), 'hi')).toMatchObject({
      value: 'जाँच जारी',
      sub: 'हम आपके पंप को जाँच रहे हैं',
    });
    expect(view.tile(kavach({ scorePublishable: false, pct: undefined, asks: [] }), 'hl')).toMatchObject({
      value: 'Jaanch jaari',
      sub: 'Hum aapke pump ko jaanch rahe hain',
    });
    expect(view.tile(kavach({ scored: false, scorePublishable: false, pct: undefined, asks: [] }), 'en')).toMatchObject({
      value: 'Not scored yet',
      status: 'info',
    });
  });

  it('never raises an alert', () => {
    expect(view.alert(kavach({ pct: 10 }), 'en')).toBeNull();
  });

  it('writes a headline and a share that name the photos owed', () => {
    expect(view.headline(kavach(), 'en')).toBe('Kavach score 87% · 1 photo needed');
    expect(view.headline(kavach({ asks: [], pct: 100 }), 'hl')).toBe('Kavach score 100%');
    const text = view.share(kavach(), 'en');
    expect(text).toContain('Your Kavach score is 87% today.');
    expect(text).toContain('- Forecourt photo (30 points)');
    expect(text).toContain('We have not checked 11 items yet.');
  });
});
