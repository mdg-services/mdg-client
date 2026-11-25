import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { FuelOrderData } from '@dk/shared/types';

import { fuelOrderData, reportOf } from './_tankerMoney.fixtures';
import { eventLook, railOf, stageWords, view } from './fuel_order';

function open(data: FuelOrderData, lang: 'hi' | 'hl' | 'en' = 'en') {
  const Overlay = view.Overlay;
  return render(<Overlay data={data} report={reportOf('fuel_order')} lang={lang} />);
}

function stops(): Array<{ stop: string | null; state: string | null }> {
  return within(screen.getByTestId('fuel-rail'))
    .getAllByRole('listitem')
    .map((li) => ({ stop: li.getAttribute('data-stop'), state: li.getAttribute('data-state') }));
}

describe('fuel_order: the rail', () => {
  it.each([
    ['being_placed', -1],
    ['waiting', 0],
    ['tanker_assigned', 1],
    ['invoiced', 2],
  ] as const)('%s puts the truck on stop %i', (stage, current) => {
    expect(railOf(stage, 'BR01GA1234')).toEqual({ current, stopped: null });
  });

  it('closed with a tanker is delivered; closed with none is a stopped order', () => {
    expect(railOf('closed', 'BR01GA1234')).toEqual({ current: 3, stopped: null });
    expect(railOf('closed', null)).toEqual({ current: -1, stopped: 'closed' });
    expect(railOf('refused', null).stopped).toBe('refused');
    expect(railOf('cancelled', null).stopped).toBe('cancelled');
    expect(railOf('never_sent', null).stopped).toBe('not_placed');
  });

  it('draws four stops: done ones ticked, the truck on the current one, the rest empty', () => {
    open(fuelOrderData({ stage: 'invoiced' }));
    expect(stops()).toEqual([
      { stop: '0', state: 'done' },
      { stop: '1', state: 'done' },
      { stop: '2', state: 'current' },
      { stop: '3', state: 'todo' },
    ]);
    const rail = screen.getByTestId('fuel-rail');
    expect(rail.tagName).toBe('OL');
    expect(rail.querySelectorAll('[data-marker="done"]')).toHaveLength(2);
    expect(rail.querySelectorAll('[data-marker="current"] svg.lucide-truck')).toHaveLength(1);
    expect(rail.querySelectorAll('[data-marker="todo"]')).toHaveLength(1);
  });

  it('announces the step, current or done, in words', () => {
    open(fuelOrderData({ stage: 'tanker_assigned' }));
    const items = within(screen.getByTestId('fuel-rail')).getAllByRole('listitem');
    expect(items[1]).toHaveAttribute('aria-current', 'step');
    expect(items[1]).toHaveTextContent('Step 2 of 4, current');
    expect(items[0]).toHaveTextContent('Step 1 of 4, done');
    expect(items[3]).toHaveTextContent('Step 4 of 4, not yet');
  });

  it('labels the four stops in the reader language', () => {
    const { unmount } = open(fuelOrderData());
    const rail = screen.getByTestId('fuel-rail');
    for (const w of ['Order placed', 'Tanker assigned', 'Loaded', 'Delivered']) expect(within(rail).getByText(w)).toBeInTheDocument();
    unmount();
    open(fuelOrderData(), 'hi');
    expect(within(screen.getByTestId('fuel-rail')).getByText('पहुँच गया')).toBeInTheDocument();
  });

  it('prints the delivery date under the lit Delivered stop', () => {
    open(fuelOrderData({ stage: 'closed', event: 'closed_on_portal' }));
    expect(within(screen.getByTestId('fuel-rail')).getByText('25 Nov')).toBeInTheDocument();
  });

  it('shows a refused order as stopped at the first stop, not as progress', () => {
    open(fuelOrderData({ event: 'refused', stage: 'refused', ttNo: null, reasonCode: 'min_tt_capacity', suggestKl: 12 }));
    const rail = screen.getByTestId('fuel-rail');
    expect(rail).toHaveAttribute('aria-label', 'This order did not go further');
    expect(rail.querySelector('[data-marker="stopped"] svg.lucide-octagon')).not.toBeNull();
    expect(rail.querySelectorAll('[data-marker="done"], [data-marker="current"]')).toHaveLength(0);
  });

  it('shows a cancelled order with a cross, not an octagon', () => {
    open(fuelOrderData({ event: 'cancelled', stage: 'cancelled', cancelState: 'confirmed', ttNo: null }));
    const rail = screen.getByTestId('fuel-rail');
    expect(rail.querySelector('[data-marker="stopped"] svg.lucide-circle-x')).not.toBeNull();
    expect(screen.getByText('Your fuel order is cancelled.')).toBeInTheDocument();
  });
});

describe('fuel_order: the TT plate and the order', () => {
  it('puts the TT number on a yellow plate', () => {
    open(fuelOrderData());
    expect(screen.getByTestId('number-plate')).toHaveTextContent('BR01GA1234');
  });

  it('says the tanker is not assigned yet while the order only waits', () => {
    open(fuelOrderData({ event: 'placed', stage: 'waiting', ttNo: null }));
    expect(screen.queryByTestId('number-plate')).toBeNull();
    expect(screen.getByTestId('number-plate-empty')).toHaveTextContent('Tanker not assigned yet');
  });

  it('draws no plate at all for a refused or unplaced order', () => {
    open(fuelOrderData({ event: 'not_placed', stage: 'never_sent', ttNo: null }));
    expect(screen.queryByTestId('number-plate')).toBeNull();
    expect(screen.queryByTestId('number-plate-empty')).toBeNull();
  });

  it('strikes the earlier tanker out and still says it in words', () => {
    open(fuelOrderData({ event: 'tanker_changed', ttNo: 'BR01GA9999', prevTtNo: 'BR01GA0001' }));
    expect(screen.getByTestId('number-plate')).toHaveTextContent('BR01GA9999');
    const old = screen.getByText('BR01GA0001');
    expect(old.tagName).toBe('S');
    expect(old.parentElement).toHaveTextContent('Earlier tanker: BR01GA0001');
    expect(screen.getByText('Your tanker has changed. The new tanker is BR01GA9999.')).toBeInTheDocument();
  });

  it('sizes the fuel blocks by litres and totals them', () => {
    open(
      fuelOrderData({
        lines: [
          { product: 'HSD', material: 'HSD', kl: 12 },
          { product: 'MS', material: 'MS', kl: 6 },
        ],
        totalKl: 18,
      }),
    );
    const blocks = within(screen.getByTestId('compartments')).getAllByRole('listitem');
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.style.flexGrow).toBe('12');
    expect(blocks[1]!.style.flexGrow).toBe('6');
    expect(blocks[0]).toHaveTextContent('Diesel');
    expect(blocks[0]).toHaveTextContent('12 KL');
    expect(blocks[1]).toHaveTextContent('Petrol');
    expect(screen.getByText('Total 18 KL')).toBeInTheDocument();
  });

  it('lists delivery day, shipment, order number and who placed it', () => {
    open(fuelOrderData());
    const facts = screen.getByTestId('order-facts');
    expect(within(facts).getByText('Delivery day').nextSibling).toHaveTextContent('Wed 25 Nov');
    expect(within(facts).getByText('Shipment').nextSibling).toHaveTextContent('24 Nov, 3:20 pm');
    expect(within(facts).getByText('4500012345').className).toContain('select-all');
    expect(within(facts).getByText('Placed by you')).toBeInTheDocument();
    open(fuelOrderData({ source: 'chat' }));
    expect(screen.getAllByText('MDG placed this for you').length).toBeGreaterThan(0);
  });

  it('notes a tanker seen late and speaks in the past', () => {
    open(fuelOrderData({ seenLate: true }));
    expect(screen.getByText('Your tanker BR01GA1234 was assigned earlier.')).toBeInTheDocument();
    expect(screen.getByText('Seen on the portal just now.')).toBeInTheDocument();
  });
});

describe('fuel_order: the event banner', () => {
  it('pairs a shape with a word and one sentence', () => {
    open(fuelOrderData());
    const banner = screen.getByTestId('event-banner');
    expect(banner).toHaveAttribute('role', 'status');
    expect(banner.querySelector('[data-status="ok"]')).not.toBeNull();
    expect(banner).toHaveTextContent('Tanker assigned');
    expect(banner).toHaveTextContent('Your tanker is assigned: BR01GA1234. Delivery Wed 25 Nov.');
  });

  it.each([
    ['placed', 'waiting'],
    ['refused', 'problem'],
    ['unclear', 'attention'],
    ['not_placed', 'attention'],
    ['tanker_assigned', 'ok'],
    ['cancelled', 'info'],
    ['not_executed_reason', 'attention'],
    ['no_tanker_by_afternoon', 'attention'],
    ['lapsed_not_executed', 'attention'],
    ['closed_on_portal', 'info'],
    ['tanker_changed', 'attention'],
    ['tanker_details_added', 'ok'],
    ['possible_duplicate', 'attention'],
    ['delayed', 'waiting'],
    ['check_result', 'info'],
    ['tracking_stopped', 'attention'],
  ] as const)('%s reads as %s', (event, status) => {
    expect(eventLook(fuelOrderData({ event })).status).toBe(status);
  });

  it('tells an unfinished cancel from a finished one', () => {
    expect(eventLook(fuelOrderData({ event: 'cancelled', cancelState: 'cancelling' })).status).toBe('waiting');
    expect(eventLook(fuelOrderData({ event: 'cancelled', cancelState: 'refused' })).status).toBe('attention');
    open(fuelOrderData({ event: 'cancelled', cancelState: 'refused', stage: 'waiting' }));
    expect(screen.getByText('The portal did not let us cancel. The order is still on.')).toBeInTheDocument();
  });

  it('does not claim an hour for the missing tanker', () => {
    open(fuelOrderData({ event: 'no_tanker_by_afternoon', stage: 'waiting', ttNo: null }));
    expect(screen.getByText('No tanker has been assigned to this order by the afternoon.')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\b3 pm\b/);
  });

  it('says why placing is slow and until when we try', () => {
    open(fuelOrderData({ event: 'delayed', stage: 'being_placed', ttNo: null, delayWhy: 'busy', retryUntil: '18:30' }));
    expect(screen.getByText("IndianOil's site is busy. We will try again. We will keep trying until 6:30 pm.")).toBeInTheDocument();
  });

  it('says why tracking stopped', () => {
    open(fuelOrderData({ event: 'tracking_stopped', trackingBreak: 'login' }));
    expect(screen.getAllByText('IndianOil login is not working, so we cannot follow this order.').length).toBeGreaterThan(0);
  });

  it('names the order a possible repeat is of', () => {
    open(fuelOrderData({ event: 'possible_duplicate', duplicateOf: '4500099999' }));
    expect(screen.getByText('This looks like the same order as 4500099999.')).toBeInTheDocument();
  });
});

describe('fuel_order: IndianOil\'s own words and the money', () => {
  it('prints IndianOil\'s status and sentence verbatim in a labelled quote', () => {
    open(fuelOrderData({ event: 'not_executed_reason', stage: 'waiting', portalStatus: 'Not Executed', portalReason: 'Plant closed for stock taking' }));
    const quote = screen.getByTestId('indianoil-says');
    expect(quote).toHaveTextContent('IndianOil says');
    expect(quote).toHaveTextContent('Status: Not Executed');
    expect(quote).toHaveTextContent('Plant closed for stock taking');
    expect(quote.querySelector('blockquote')).not.toBeNull();
  });

  it('shows no quote when IndianOil said nothing', () => {
    open(fuelOrderData());
    expect(screen.queryByTestId('indianoil-says')).toBeNull();
  });

  it('a refusal for funds shows how much was short, and the credit read it came from', () => {
    open(
      fuelOrderData({
        event: 'refused',
        stage: 'refused',
        ttNo: null,
        reasonCode: 'shortage_of_funds',
        shortByRs: 40000,
        credit: {
          capturedAt: '2026-11-24T08:00:00.000Z',
          availableLimit: 85000,
          dueAmount: 124000,
          dueDate: '2026-11-27',
          overdueAmount: null,
          side: 'due',
          advanceAmount: null,
          cashAndCarry: false,
          reviewLapsed: false,
        },
      }),
    );
    expect(screen.getByTestId('short-by')).toHaveTextContent('Short by ₹40,000');
    const credit = screen.getByTestId('credit-position');
    expect(credit).toHaveTextContent('Your credit position (24 Nov)');
    expect(credit).toHaveTextContent('Limit left ₹85,000');
    expect(credit).toHaveTextContent('To deposit ₹1,24,000 by 27 Nov');
  });

  it('for a manager the money is simply absent and the page still reads', () => {
    open(fuelOrderData({ event: 'refused', stage: 'refused', ttNo: null, reasonCode: 'shortage_of_funds' }));
    expect(screen.queryByTestId('short-by')).toBeNull();
    expect(screen.queryByTestId('credit-position')).toBeNull();
    expect(screen.getByText('Your credit limit was not enough for this order.')).toBeInTheDocument();
  });

  it('a refusal for tanker size names the usual size', () => {
    open(fuelOrderData({ event: 'refused', stage: 'refused', ttNo: null, reasonCode: 'min_tt_capacity', suggestKl: 12 }));
    expect(screen.getByTestId('usual-size')).toHaveTextContent('Your usual tanker size is 12 KL.');
  });
});

describe('fuel_order: several orders (check result)', () => {
  const check = fuelOrderData({
    event: 'check_result',
    stage: 'waiting',
    ttNo: null,
    orders: [
      { orderNo: '4500012345', stage: 'tanker_assigned', deliveryDay: '2026-11-25', ttNo: 'BR01GA1234' },
      { orderNo: '4500012346', stage: 'waiting', deliveryDay: '2026-11-26', ttNo: null },
    ],
    nextCheckAt: '2026-11-24T15:35:00.000Z',
  });

  it('lists each order with a mini rail and its stage word', () => {
    open(check);
    const rows = within(screen.getByTestId('orders-list')).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('4500012345');
    expect(rows[0]).toHaveTextContent('Tanker assigned');
    expect(rows[0]).toHaveTextContent('BR01GA1234');
    expect(rows[1]).toHaveTextContent('Order placed');
    expect(screen.queryByTestId('fuel-rail')).toBeNull();
    expect(screen.getByText(/Next check/)).toHaveTextContent('Next check 24 Nov, 9:05 pm');
  });

  it('says so when no order is open', () => {
    open(fuelOrderData({ event: 'check_result', orders: [] }));
    expect(screen.getByText('You have no open fuel orders right now.')).toBeInTheDocument();
  });

  it('has a tile that counts them', () => {
    expect(view.tile(check, 'en')).toEqual({ value: '2 orders', status: 'info' });
    expect(view.tile(fuelOrderData({ event: 'check_result', orders: [] }), 'en')).toBeNull();
  });
});

describe('fuel_order: tile, alert, headline and share', () => {
  it('has the stage word as the big value and tanker, fuel and day under it', () => {
    expect(view.tile(fuelOrderData(), 'en')).toEqual({
      value: 'Tanker assigned',
      sub: 'BR01GA1234, Diesel 12 KL, Wed 25 Nov',
      status: 'ok',
    });
    expect(view.tile(fuelOrderData({ stage: 'invoiced' }), 'en')?.value).toBe('Tanker on the way');
    expect(view.tile(fuelOrderData({ event: 'closed_on_portal', stage: 'closed' }), 'en')?.value).toBe('Delivered');
    expect(view.tile(fuelOrderData({ event: 'placed', stage: 'waiting', ttNo: null }), 'en')?.status).toBe('waiting');
    expect(view.tile(fuelOrderData({ stage: 'invoiced' }), 'hi')?.value).toBe('टैंकर रास्ते में');
  });

  it('has no tile for an order that stopped: that is an alert', () => {
    expect(view.tile(fuelOrderData({ event: 'refused', stage: 'refused' }), 'en')).toBeNull();
    expect(view.tile(fuelOrderData({ event: 'cancelled', stage: 'cancelled' }), 'en')).toBeNull();
    expect(view.tile(fuelOrderData({ event: 'tracking_stopped' }), 'en')).toBeNull();
  });

  it('flags a changed tanker as a look, not a problem', () => {
    expect(view.tile(fuelOrderData({ event: 'tanker_changed' }), 'en')?.status).toBe('attention');
  });

  it('raises a problem alert for a refusal, with the shortfall when it is known', () => {
    expect(view.alert(fuelOrderData({ event: 'refused', stage: 'refused', reasonCode: 'shortage_of_funds', shortByRs: 40000 }), 'en')).toEqual({
      headline: 'Fuel order not placed: short of funds',
      line: 'Short by ₹40,000.',
      severity: 'problem',
    });
    expect(view.alert(fuelOrderData({ event: 'refused', stage: 'refused', reasonCode: 'shortage_of_funds' }), 'en')?.line).toBe(
      'Your credit limit was not enough for this order.',
    );
    expect(view.alert(fuelOrderData({ event: 'refused', stage: 'refused', reasonCode: 'min_tt_capacity', suggestKl: 12 }), 'en')).toEqual({
      headline: 'IndianOil did not take your fuel order',
      line: 'Your usual tanker size is 12 KL.',
      severity: 'problem',
    });
  });

  it.each(['not_placed', 'unclear', 'tanker_changed', 'no_tanker_by_afternoon', 'not_executed_reason', 'lapsed_not_executed', 'possible_duplicate', 'tracking_stopped'] as const)(
    '%s is an attention alert',
    (event) => {
      expect(view.alert(fuelOrderData({ event }), 'en')?.severity).toBe('attention');
    },
  );

  it.each(['placed', 'tanker_assigned', 'cancelled', 'closed_on_portal', 'delayed', 'check_result', 'tanker_details_added'] as const)('%s raises no alert', (event) => {
    expect(view.alert(fuelOrderData({ event }), 'en')).toBeNull();
  });

  it('has a one-line headline', () => {
    expect(view.headline(fuelOrderData(), 'en')).toBe('Tanker assigned: BR01GA1234, Diesel 12 KL, Wed 25 Nov');
    expect(view.headline(fuelOrderData({ event: 'check_result', orders: [{ orderNo: null, stage: 'waiting', deliveryDay: null, ttNo: null }] }), 'en')).toBe('Open orders: 1 order');
  });

  it('shares plain text without the owner-only credit figures', () => {
    const text = view.share(
      fuelOrderData({
        credit: {
          capturedAt: '2026-11-24T08:00:00.000Z',
          availableLimit: 85000,
          dueAmount: null,
          dueDate: null,
          overdueAmount: null,
          side: 'clear',
          advanceAmount: null,
          cashAndCarry: false,
          reviewLapsed: false,
        },
      }),
      'en',
    );
    expect(text).toContain('Fuel order: Order 4500012345');
    expect(text).toContain('Tanker number: BR01GA1234');
    expect(text).toContain('Diesel 12 KL');
    expect(text).toContain('Delivery day: Wed 25 Nov');
    expect(text).not.toContain('85,000');
  });

  it('knows the plain word of every stage', () => {
    expect(stageWords('closed', null).en).toBe('Order closed');
    expect(stageWords('never_sent', null).en).toBe('Order not placed');
  });

  it('draws a rail glyph', () => {
    const G = view.Glyph;
    const { container } = render(<G size={28} />);
    expect(container.querySelector('svg')).toHaveAttribute('height', '28');
    expect(view.kind).toBe('fuel_order');
  });
});
