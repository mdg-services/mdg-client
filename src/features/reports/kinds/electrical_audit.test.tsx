import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useLangStore } from '@/store/lang';
import { resetStores } from '@/test/utils';
import type { ElectricalAuditData } from '@dk/shared/types';

import { reportOf } from './_paperwork.fixtures';
import { auditState, pointsStillOpen, view } from './electrical_audit';

const submitted: ElectricalAuditData = {
  kind: 'electrical_audit',
  v: 1,
  outcome: 'submitted',
  audits: [
    { auditNo: '4418', auditDate: '24-Nov-2026', points: 4, confirmed: true },
    { auditNo: '4420', auditDate: '24-Nov-2026', points: 2, confirmed: true },
  ],
  pointsTotal: 6,
  filedAt: '2026-11-24T08:30:00.000Z',
};

afterEach(() => resetStores());

function open(data: ElectricalAuditData, lang: 'hi' | 'hl' | 'en' = 'en') {
  // The kit's own words follow the app's language.
  useLangStore.setState({ lang });
  const Overlay = view.Overlay;
  return render(<Overlay data={data} report={reportOf('electrical_audit')} lang={lang} />);
}

describe('electrical_audit', () => {
  it('says what was done in one sentence', () => {
    open(submitted);
    expect(screen.getByText("We marked 6 points as done on IndianOil's portal and submitted them.")).toBeInTheDocument();
  });

  it('draws a clipboard with one ticked line per audit, in words as well', () => {
    const { container } = open(submitted);
    expect(container.querySelector('[data-clipboard]')).not.toBeNull();
    const list = screen.getByRole('list', { name: 'Audit checklist' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.getAttribute('data-state'))).toEqual(['done', 'done']);
    expect(within(rows[0]!).getByText('Audit 4418')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('24-Nov-2026 · 4 points')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Done:')).toBeInTheDocument();
  });

  it('a clean run is not an alert and has nothing still open', () => {
    expect(pointsStillOpen(submitted)).toBe(0);
    expect(view.alert(submitted, 'en')).toBeNull();
    open(submitted);
    expect(screen.queryByText(/Still open/)).toBeNull();
    expect(screen.getByText("Filed by MDG's team on IndianOil's portal for you.")).toBeInTheDocument();
  });

  it('a run that stopped part-way shows a half-done line, what is still open, and asks for a look', () => {
    const partly: ElectricalAuditData = {
      ...submitted,
      outcome: 'partly',
      audits: [
        { auditNo: '4418', auditDate: '24-Nov-2026', points: 4, confirmed: true },
        { auditNo: '4420', auditDate: '24-Nov-2026', points: 2, confirmed: false },
      ],
    };
    expect(auditState(partly, partly.audits[0]!)).toBe('done');
    expect(auditState(partly, partly.audits[1]!)).toBe('partly');
    expect(pointsStillOpen(partly)).toBe(2);
    open(partly);
    expect(screen.getByText('We stopped part-way. Points are saved but the submit is not confirmed. We are looking into it.')).toBeInTheDocument();
    expect(screen.getByText('Still open on the portal: 2 points')).toBeInTheDocument();
    expect(screen.getByText('Saved, not confirmed:')).toBeInTheDocument();
    expect(view.alert(partly, 'en')).toEqual({
      headline: 'The audit stopped part-way',
      line: 'We are looking into it. You do not need to do anything yet.',
      severity: 'attention',
    });
  });

  it('a failed run draws crosses, says nothing was filed, and does not claim MDG filed it', () => {
    const failed: ElectricalAuditData = { ...submitted, outcome: 'failed' };
    expect(auditState(failed, failed.audits[0]!)).toBe('failed');
    open(failed);
    expect(screen.getAllByText('Not done:').length).toBe(2);
    expect(screen.getByText('The audit did not go through. We are looking into it.')).toBeInTheDocument();
    expect(screen.queryByText(/Filed by MDG/)).toBeNull();
    expect(view.alert(failed, 'en')?.severity).toBe('attention');
  });

  it('a rejected login says so plainly', () => {
    open({ ...submitted, outcome: 'login_rejected', audits: [], pointsTotal: 0 });
    expect(screen.getByText("IndianOil's portal did not accept the login, so nothing was filed. We are looking into it.")).toBeInTheDocument();
    expect(view.alert({ ...submitted, outcome: 'login_rejected' }, 'hl')?.headline).toBe('Audit jama nahi hua');
  });

  it('nothing open draws an empty clipboard and is not an alert', () => {
    const none: ElectricalAuditData = { ...submitted, outcome: 'nothing_open', audits: [], pointsTotal: 0 };
    open(none);
    expect(screen.getByText('Nothing was open to do.')).toBeInTheDocument();
    expect(screen.getByText('No audit is open right now.')).toBeInTheDocument();
    expect(view.alert(none, 'en')).toBeNull();
    expect(view.headline(none, 'en')).toBe('Electrical audit: nothing was open');
  });

  it('keeps the checklist inside a scrolling box when there are many audits', () => {
    const many: ElectricalAuditData = {
      ...submitted,
      audits: Array.from({ length: 7 }, (_, i) => ({ auditNo: String(5000 + i), auditDate: '24-Nov-2026', points: 1, confirmed: true })),
      pointsTotal: 7,
    };
    const { container } = open(many);
    expect(within(screen.getByRole('list', { name: 'Audit checklist' })).getAllByRole('listitem')).toHaveLength(7);
    expect(container.querySelector('.overflow-y-auto')).not.toBeNull();
  });

  it('speaks Hindi and Hinglish', () => {
    const { unmount } = open(submitted, 'hi');
    expect(screen.getByText('हमने IndianOil के पोर्टल पर 6 पॉइंट पूरे लिखे और जमा कर दिए।')).toBeInTheDocument();
    unmount();
    open(submitted, 'hl');
    expect(screen.getByText('Humne IndianOil ke portal par 6 point poore likhe aur jama kar diye.')).toBeInTheDocument();
  });

  it('writes the history line and the share text', () => {
    expect(view.headline(submitted, 'en')).toBe('Electrical audit filed: 6 points');
    expect(view.headline({ ...submitted, pointsTotal: 1 }, 'en')).toBe('Electrical audit filed: 1 point');
    expect(view.share(submitted, 'en').split('\n')).toEqual([
      'Electrical audit filed: 6 points',
      'Audit 4418 (24-Nov-2026): 4 points, Done',
      'Audit 4420 (24-Nov-2026): 2 points, Done',
    ]);
    expect(view.tile(submitted, 'en')).toBeNull();
  });

  it('draws a 40 x 28 clipboard glyph', () => {
    const Glyph = view.Glyph;
    const { container } = render(<Glyph size={40} />);
    expect(container.querySelector('svg')).toHaveAttribute('viewBox', '0 0 40 28');
    expect(container.querySelector('svg')).toHaveAttribute('height', '40');
  });
});

describe('electrical_audit: the figures', () => {
  it('shows the audits and the points as two tiles when something was filed', () => {
    open(submitted);
    const audits = screen.getByRole('group', { name: 'Audits: 2' });
    expect(within(audits).getByText('2')).toBeInTheDocument();
    const points = screen.getByRole('group', { name: 'Points: 6' });
    expect(within(points).getByText('6')).toBeInTheDocument();
    // A clean run says nothing but the numbers: no status pill on an ok tile.
    expect(audits.querySelector('[data-status]')).toBeNull();
  });

  it('marks both tiles "Needs a look" with a shape when the run stopped part-way', () => {
    open({
      ...submitted,
      outcome: 'partly',
      audits: [{ auditNo: '4418', auditDate: '24-Nov-2026', points: 4, confirmed: false }],
      pointsTotal: 4,
    });
    expect(screen.getByRole('group', { name: 'Audits: 1' }).querySelector('[data-status="attention"]')).not.toBeNull();
    expect(screen.getByRole('group', { name: 'Points: 4' }).querySelector('[data-status="attention"]')).not.toBeNull();
  });

  it('shows no tiles when nothing was filed or the run failed', () => {
    open({ ...submitted, outcome: 'failed' });
    expect(screen.queryByRole('group', { name: /^Audits/ })).toBeNull();
    expect(screen.queryByRole('group', { name: /^Points/ })).toBeNull();
  });

  it('says the labels in Hindi and keeps the clipboard in rem', () => {
    const { container } = open(submitted, 'hi');
    expect(screen.getByRole('group', { name: 'ऑडिट: 2' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'पॉइंट: 6' })).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/h-\[\d+px|w-\[\d+px|text-\[\d/);
    expect(container.querySelector('.max-w-xs')).not.toBeNull();
  });
});
