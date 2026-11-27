import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { DEVANAGARI, renderOverlay, supply } from './_supplyTestKit';
import { verdictOf, view } from './ro_supply';

afterEach(cleanup);

const gate = () => screen.getByTestId('supply-gate');

describe('supply status: the gate', () => {
  it('draws four different gates for the four verdicts, by arm angle, lamp shape and words', () => {
    const cases = [
      { data: supply({ blocked: true, failingCount: 2 }), verdict: 'stopped', angle: '0', lead: 'Your fuel lifting is stopped.' },
      { data: supply(), verdict: 'pending', angle: '-34', lead: '2 items are pending. Any one can stop your fuel.' },
      { data: supply({ blocked: false, failingCount: 0, rows: [] }), verdict: 'clear', angle: '-68', lead: 'All clear. Your pump can lift fuel.' },
      { data: supply({ blocked: null, failingCount: 0, rows: [] }), verdict: 'unclear', angle: '-18', lead: 'We could not read the supply status. Please check the portal.' },
    ] as const;
    const drawings = new Set<string>();
    for (const c of cases) {
      const { unmount } = renderOverlay(view, c.data);
      expect(gate()).toHaveAttribute('data-verdict', c.verdict);
      expect(gate()).toHaveAttribute('data-angle', c.angle);
      expect(screen.getByTestId('report-lead')).toHaveTextContent(c.lead);
      drawings.add(gate().innerHTML);
      unmount();
    }
    expect(drawings.size).toBe(4);
  });

  it('keeps STOP when the portal says stopped even though no row fails', () => {
    renderOverlay(view, supply({ blocked: true, failingCount: 0, rows: [{ cond: 'pending_otp', mark: 'YES', portalText: 'Pending OTP' }] }));
    expect(verdictOf(supply({ blocked: true, failingCount: 0 }))).toBe('stopped');
    expect(gate()).toHaveAttribute('data-verdict', 'stopped');
    expect(document.body.textContent).toContain('Nothing is listed below, but IndianOil still shows a stop.');
    // the stop sign is the word as well
    expect(gate().textContent).toContain('STOP');
  });

  it('hatches the arm only when stopped, and gives the stopped badge its octagon and words', () => {
    const { container, unmount } = renderOverlay(view, supply({ blocked: true }));
    expect(screen.getByTestId('supply-arm').querySelectorAll('polygon').length).toBeGreaterThan(0);
    expect(screen.getByText('Supply is stopped')).toBeInTheDocument();
    expect(container.querySelector('[data-status="problem"] polygon')).not.toBeNull();
    unmount();
    renderOverlay(view, supply());
    expect(screen.getByTestId('supply-arm').querySelectorAll('polygon')).toHaveLength(0);
  });
});

describe('supply status: the conditions', () => {
  it('lists one lamp per condition, failing first, each with who fixes it', () => {
    renderOverlay(view, supply());
    const rows = screen.getAllByTestId('supply-row');
    expect(rows.map((r) => r.dataset.cond)).toEqual(['pending_otp', 'mock_drill', 'automation_data', 'sdms_dar_block']);
    expect(rows[0]).toHaveAttribute('aria-label', 'Pending OTP, Problem, Who fixes it: You');
    expect(within(rows[0]!).getByTestId('supply-fixer')).toHaveTextContent('Who fixes it: You');
    expect(rows[0]!.textContent).toContain('An OTP approval is waiting');
    expect(rows[0]!.textContent).toContain('On the portal: Pending OTP');
    expect(rows[0]!.textContent).toContain('What to do:');
    // lamp shapes: octagon for a problem, circle for a clear row
    expect(rows[0]!.querySelector('[data-lamp="NO"] polygon')).not.toBeNull();
    expect(rows[2]!.querySelector('[data-lamp="YES"] circle')).not.toBeNull();
  });

  it('says a clear condition in positive words, never the problem beside a tick', () => {
    renderOverlay(view, supply());
    const rows = screen.getAllByTestId('supply-row');
    expect(rows[2]!.textContent).toContain('Automation data is reaching the portal');
    expect(rows[2]!.textContent).not.toContain('has not reached');
    expect(within(rows[2]!).queryByTestId('supply-fixer')).toBeNull();
    expect(rows[3]!.textContent).toContain('No block in SDMS-DAR');
  });

  it('never drops a condition it has not seen: it shows the portal words with no action', () => {
    renderOverlay(
      view,
      supply({ rows: [{ cond: 'other', mark: 'NO', portalText: 'New Rule Not Met' }], failingCount: 1 }),
    );
    const row = screen.getByTestId('supply-row');
    expect(row).toHaveTextContent('New Rule Not Met');
    expect(row).toHaveTextContent("The portal's own words");
    expect(within(row).queryByTestId('supply-fixer')).toBeNull();
    expect(within(row).queryByRole('button')).toBeNull();
  });

  it('marks an unreadable condition with a diamond and a request to check the portal', () => {
    renderOverlay(
      view,
      supply({ unknownCount: 1, failingCount: 0, rows: [{ cond: 'ro_not_auto', mark: 'UNKNOWN', portalText: 'RO not in Auto' }] }),
    );
    expect(screen.getByTestId('supply-row').querySelector('[data-lamp="UNKNOWN"] path')).not.toBeNull();
    expect(screen.getByTestId('supply-row')).toHaveTextContent('We could not read this one. Please check the portal.');
    expect(screen.getByTestId('supply-unknown')).toHaveTextContent('We could not read 1 condition.');
  });

  it('always prints the rule that any one condition can stop the fuel', () => {
    renderOverlay(view, supply({ blocked: false, failingCount: 0, rows: [] }));
    expect(screen.getByTestId('supply-rule')).toHaveTextContent('Any one of these left undone is enough for IndianOil to stop your fuel.');
  });

  it('opens the chat at this message from a row that has work in the chat', () => {
    renderOverlay(view, supply());
    fireEvent.click(screen.getByTestId('supply-go-pending_otp'));
    expect(screen.getByTestId('where')).toHaveAttribute('data-path', '/chat/conv-1');
    expect(screen.getByTestId('where')).toHaveAttribute('data-jump', 'msg-1');
  });

  it('offers the button for a mock drill and an electrical audit too, but not for a vendor job', () => {
    renderOverlay(
      view,
      supply({
        failingCount: 3,
        rows: [
          { cond: 'electrical_audit', mark: 'NO', portalText: 'Electrical Audit Non-Compliance' },
          { cond: 'mock_drill', mark: 'NO', portalText: 'Quaterly Mock Drill Not Conducted' },
          { cond: 'du_tank_comm', mark: 'NO', portalText: 'DU/Tank Not Comunicated in 24 hrs' },
        ],
      }),
    );
    expect(screen.getByTestId('supply-go-electrical_audit')).toHaveTextContent('Ask MDG to file it');
    expect(screen.getByTestId('supply-go-mock_drill')).toHaveTextContent('Open the mock drill work');
    expect(screen.queryByTestId('supply-go-du_tank_comm')).toBeNull();
    for (const b of screen.getAllByRole('button')) expect(b.className).toContain('min-h-12');
  });

  it('says when the list is from the last good check, and when it is only partly read', () => {
    renderOverlay(view, supply({ lastGoodIsOld: true, read: 'partial' }));
    expect(screen.getByTestId('supply-old-good')).toHaveTextContent(
      'The last check could not finish. This list is from the last good check (24 Nov, 10:14 am).',
    );
    expect(screen.getByTestId('supply-partial')).toHaveTextContent('Part of the list could not be read.');
  });

  it('speaks Hindi and Hinglish', () => {
    const { unmount } = renderOverlay(view, supply(), 'hi');
    expect(screen.getByTestId('report-lead')).toHaveTextContent('2 काम बाक़ी हैं।');
    expect(screen.getAllByTestId('supply-row')[0]).toHaveTextContent('कोई OTP मंज़ूरी बाक़ी है');
    unmount();
    renderOverlay(view, supply(), 'hl');
    expect(screen.getByTestId('report-lead')).toHaveTextContent('2 kaam baaki hain.');
    expect(screen.getAllByTestId('supply-row')[0]!.textContent).not.toMatch(DEVANAGARI);
  });
});

describe('supply status: tile, alert, headline, share', () => {
  it('has a tile for each verdict with its own status', () => {
    expect(view.tile(supply({ blocked: true }), 'en')).toEqual({
      value: 'Fuel lifting stopped',
      sub: 'Checked 24 Nov, 10:14 am',
      status: 'problem',
    });
    expect(view.tile(supply(), 'en')).toMatchObject({ value: '2 items pending', status: 'attention' });
    expect(view.tile(supply({ blocked: false, failingCount: 0 }), 'en')).toMatchObject({ value: 'All clear', status: 'ok' });
    expect(view.tile(supply({ blocked: null, failingCount: 0 }), 'en')).toMatchObject({ value: 'Unclear', status: 'attention' });
  });

  it('raises a problem alert when stopped, an attention alert when pending or unclear, nothing when clear', () => {
    expect(view.alert(supply({ blocked: true }), 'hl')).toEqual({
      headline: 'Supply band ho gayi hai',
      line: 'IndianOil ne tel uthana roka hai. Kaam yeh hai.',
      severity: 'problem',
    });
    expect(view.alert(supply(), 'en')).toMatchObject({ headline: '2 supply items are pending', severity: 'attention' });
    expect(view.alert(supply({ blocked: null, failingCount: 0 }), 'en')).toMatchObject({ severity: 'attention' });
    expect(view.alert(supply({ blocked: false, failingCount: 0 }), 'en')).toBeNull();
  });

  it('writes a history headline and a share that lists only what is not clear', () => {
    expect(view.headline(supply({ blocked: true }), 'en')).toBe('Supply status: Fuel lifting stopped');
    const text = view.share(supply(), 'en');
    expect(text).toContain('An OTP approval is waiting');
    expect(text).toContain('The quarterly mock drill has not been done');
    expect(text).not.toContain('Automation data is reaching');
    expect(text).toContain('Checked 24 Nov, 10:14 am');
  });
});
