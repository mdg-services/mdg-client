import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';


import { useLangStore } from '@/store/lang';
import { makeMessage } from '@/test/utils';
import type { FuelOrderCard } from '@dk/shared/types';

import { MessageBubble } from './MessageBubble';

beforeEach(() => {
  useLangStore.setState({ lang: 'hl', explicit: true });
});
afterEach(cleanup);

/** The tanker card for 5E's order of 23 Nov 2026, as the server builds it. */
const CARD: FuelOrderCard = {
  kind: 'tanker_assigned',
  title: { hi: 'टैंकर लग गया', hl: 'Tanker lag gaya', en: 'Tanker assigned' },
  hero: 'BR10GC5000',
  heroLabel: { hi: 'टैंकर नंबर', hl: 'Tanker number', en: 'Tanker number' },
  rows: [
    { label: { hi: 'ऑर्डर नंबर', hl: 'Order number', en: 'Order number' }, value: '0916430987' },
    { label: { hi: 'डीज़ल (HSD)', hl: 'Diesel (HSD)', en: 'Diesel (HSD)' }, value: '14 KL', strong: true },
    { label: { hi: 'शिपमेंट', hl: 'Shipment', en: 'Shipment' }, value: { hi: '23 नवंबर, 07:48', hl: '23 Nov, 07:48', en: '23 Nov, 07:48' } },
    {
      label: { hi: 'डिलीवरी', hl: 'Delivery', en: 'Delivery' },
      value: { hi: '23 नवंबर (सोमवार)', hl: '23 Nov (Monday)', en: '23 Nov (Monday)' },
      strong: true,
    },
  ],
};

const tanker = (over: Partial<Parameters<typeof makeMessage>[0]> = {}) =>
  makeMessage({
    id: 't1',
    senderId: 'mdg',
    system: true,
    body: 'Tanker lag gaya — order number 0916430987.\nTanker number: *BR10GC5000*',
    fuelCard: CARD,
    ...over,
  });

describe('a tanker message', () => {
  it('is drawn as a card: strip, the tanker number large, then one fact per line', () => {
    render(<MessageBubble message={tanker()} mine={false} first />);
    expect(screen.getByTestId('fuel-order-card-strip')).toHaveTextContent('Tanker lag gaya');
    const hero = screen.getByTestId('fuel-order-card-hero');
    expect(hero).toHaveTextContent('BR10GC5000');
    expect(hero.className).toContain('font-bold');
    const card = screen.getByTestId('fuel-order-card');
    for (const text of ['Order number', '0916430987', 'Diesel (HSD)', '14 KL', '23 Nov, 07:48', '23 Nov (Monday)']) {
      expect(card).toHaveTextContent(text);
    }
    expect(within(card).getByText('14 KL').className).toContain('font-bold');
  });

  it('shows the card instead of the words, never both, and no stray stars', () => {
    render(<MessageBubble message={tanker()} mine={false} first />);
    expect(screen.queryByText(/Tanker lag gaya —/)).toBeNull();
    expect(screen.getByTestId('fuel-order-card')).not.toHaveTextContent('*');
  });

  it("speaks the reader's own language", () => {
    useLangStore.setState({ lang: 'hi', explicit: true });
    render(<MessageBubble message={tanker()} mine={false} first />);
    expect(screen.getByTestId('fuel-order-card-strip')).toHaveTextContent('टैंकर लग गया');
    expect(screen.getByTestId('fuel-order-card')).toHaveTextContent('23 नवंबर (सोमवार)');
  });

  it('without a card, is the ordinary message it always was', () => {
    render(<MessageBubble message={tanker({ fuelCard: undefined })} mine={false} first />);
    expect(screen.queryByTestId('fuel-order-card')).toBeNull();
    expect(screen.getByText(/Tanker lag gaya —/)).toBeInTheDocument();
  });
});
