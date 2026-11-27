import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { DEVANAGARI, duEvent, duOtp, renderOverlay } from './_supplyTestKit';
import { groupEvents, phaseOf, view } from './du_otp';

afterEach(cleanup);

const padlock = () => screen.getByTestId('du-padlock');

describe('DU OTP: the padlock', () => {
  it('is open and says supply is stopped when supply is blocked', () => {
    renderOverlay(view, duOtp());
    expect(padlock()).toHaveAttribute('data-phase', 'stopped');
    expect(padlock()).toHaveAttribute('data-open', 'true');
    expect(screen.getByText('Supply is stopped')).toBeInTheDocument();
    expect(screen.getByTestId('report-lead')).toHaveTextContent(
      'A dispenser was opened or re-checked. IndianOil wants a paper from you.',
    );
  });

  it('is open and amber-worded when supply is running but may stop', () => {
    renderOverlay(view, duOtp({ supplyBlocked: false }));
    expect(padlock()).toHaveAttribute('data-phase', 'risk');
    expect(screen.getByText('Supply may stop if this waits')).toBeInTheDocument();
  });

  it('says we are checking when the supply is not known yet, not amber', () => {
    renderOverlay(view, duOtp({ supplyBlocked: undefined }));
    expect(padlock()).toHaveAttribute('data-phase', 'checking');
    expect(screen.getByText('We are checking the supply')).toBeInTheDocument();
    expect(phaseOf(duOtp({ supplyBlocked: undefined }))).toBe('checking');
  });

  it('draws the open and closed padlocks differently: the shackle, and a keyhole against a tick', () => {
    const { unmount } = renderOverlay(view, duOtp());
    const open = padlock().innerHTML;
    unmount();
    renderOverlay(view, duOtp({ phase: 'submitted', submittedAt: '2026-11-24T08:35:00.000Z' }));
    expect(padlock()).toHaveAttribute('data-open', 'false');
    expect(padlock().innerHTML).not.toBe(open);
    expect(screen.getByTestId('report-lead')).toHaveTextContent(
      'We submitted this to IndianOil at 2:05 pm. Nothing to do.',
    );
    expect(screen.getByText('Submitted')).toBeInTheDocument();
  });

  it('puts the number of dispensers on the seal tag', () => {
    renderOverlay(view, duOtp());
    expect(padlock().textContent).toContain('2');
    expect(screen.getByText('2 dispensers')).toBeInTheDocument();
  });
});

describe('DU OTP: one card per dispenser', () => {
  it('groups the events by dispenser and lists its nozzles once', () => {
    renderOverlay(view, duOtp());
    const cards = screen.getAllByTestId('du-card');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveAttribute('aria-label', 'DU Gilbarco Encore 300');
    expect(within(cards[0]!).getByText('Nozzle 3')).toBeInTheDocument();
    expect(within(cards[0]!).getByText('Nozzle 4')).toBeInTheDocument();
    expect(within(cards[0]!).getByText('Serial 4821')).toBeInTheDocument();
    expect(within(cards[1]!).getByText('Nozzle 1')).toBeInTheDocument();
    expect(cards[0]).toHaveTextContent('Date: 22 Oct 2026');
  });

  it('quotes the portal status as written, under "On the portal"', () => {
    renderOverlay(view, duOtp());
    const q = screen.getAllByTestId('du-card')[0]!.querySelector('q')!;
    expect(q).toHaveTextContent('New OTP Event');
    expect(screen.getAllByTestId('du-card')[0]).toHaveTextContent('On the portal:');
  });

  it('shows six dispensers and then says how many more', () => {
    const events = Array.from({ length: 8 }, (_, i) => duEvent({ otpId: `o${i}`, duSerial: String(i), groupKey: `g${i}` }));
    renderOverlay(view, duOtp({ events, moreCount: 3 }));
    expect(screen.getAllByTestId('du-card')).toHaveLength(6);
    expect(screen.getByTestId('du-more')).toHaveTextContent('and 2 more dispensers');
    expect(screen.getByTestId('du-more-events')).toHaveTextContent('3 more entries are in the chat');
  });

  it('lists what we need from the dealer, with the PDF-or-photo note, while it is pending', () => {
    renderOverlay(view, duOtp());
    const need = screen.getByTestId('du-need');
    expect(need).toHaveTextContent('Why it was opened');
    expect(need).toHaveTextContent('Calibration certificate');
    expect(need).toHaveTextContent('Service report');
    expect(need).toHaveTextContent('A short remark');
    expect(need).toHaveTextContent('A PDF or a photo is fine.');
  });

  it('shows a receipt: papers sent as ticks with words, the reason, the calibration date', () => {
    renderOverlay(
      view,
      duOtp({
        phase: 'submitted',
        submittedAt: '2026-11-24T08:35:00.000Z',
        supplyBlocked: undefined,
        events: [
          duEvent({
            portalStatus: undefined,
            reasons: ['e_calibration', 'Replacement'],
            papers: { certificate: true, serviceReport: false, other: false },
            vcNumber: 'VC-77',
            calibrationDate: '2026-11-20',
          }),
        ],
      }),
    );
    const card = screen.getByTestId('du-card');
    expect(card).toHaveTextContent('Reason: E-calibration, Part replaced');
    expect(card).toHaveTextContent('Calibration certificate: Sent');
    expect(card).toHaveTextContent('Service report: Not sent');
    expect(card).toHaveTextContent('Calibration date: 20 Nov 2026');
    expect(card).toHaveTextContent('VC number: VC-77');
    expect(screen.queryByTestId('du-need')).toBeNull();
  });

  it('copes with a message that carries no events', () => {
    renderOverlay(view, duOtp({ events: [] }));
    expect(screen.getByTestId('du-no-events')).toBeInTheDocument();
    expect(screen.queryByTestId('du-cards')).toBeNull();
  });

  it('speaks Hindi and Hinglish', () => {
    const { unmount } = renderOverlay(view, duOtp(), 'hi');
    expect(screen.getByTestId('report-lead')).toHaveTextContent('इंडियन ऑयल को आपसे कागज़ चाहिए।');
    expect(screen.getByText('सप्लाई बंद है')).toBeInTheDocument();
    unmount();
    renderOverlay(view, duOtp(), 'hl');
    expect(screen.getByTestId('report-lead').textContent).not.toMatch(DEVANAGARI);
    expect(screen.getByTestId('report-lead')).toHaveTextContent('IndianOil ko aapse kagaz chahiye.');
  });
});

describe('DU OTP: no tile, no alert (it is a task), plain headline and share', () => {
  it('has neither tile nor alert', () => {
    expect(view.tile(duOtp(), 'en')).toBeNull();
    expect(view.alert(duOtp(), 'en')).toBeNull();
  });

  it('writes the headline by phase', () => {
    expect(view.headline(duOtp(), 'en')).toBe('Supply is stopped: 2 dispensers need a paper');
    expect(view.headline(duOtp({ supplyBlocked: false }), 'en')).toBe('2 dispensers need a paper from you');
    expect(view.headline(duOtp({ phase: 'submitted' }), 'en')).toBe('DU OTP filed: 2 dispensers');
    expect(view.headline(duOtp({ events: [] }), 'en')).toBe('A dispenser paper is needed');
    expect(view.headline(duOtp({ events: [duEvent()] }), 'hl')).toContain('Supply band hai: 1 dispenser');
  });

  it('shares a short summary with each dispenser', () => {
    const text = view.share(duOtp(), 'en');
    expect(text).toContain('Supply is stopped');
    expect(text).toContain('- DU Gilbarco Encore 300 · Serial 4821 · Nozzle 3, Nozzle 4');
  });

  it('groups events by the portal group key, keeping first-seen order', () => {
    const groups = groupEvents(duOtp().events);
    expect(groups.map((g) => g.key)).toEqual(['du-4821', 'du-9']);
    expect(groups[0]!.events).toHaveLength(2);
  });
});
