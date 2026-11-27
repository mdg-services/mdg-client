import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useLangStore } from '@/store/lang';
import { resetStores } from '@/test/utils';
import type { LedgerWatchData } from '@dk/shared/types';

import { ledgerData, reportOf } from './_tankerMoney.fixtures';
import { view } from './ledger_watch';

afterEach(() => resetStores());

function open(data: LedgerWatchData, lang: 'hi' | 'hl' | 'en' = 'en') {
  // The kit's own words follow the app's language.
  useLangStore.setState({ lang });
  const Overlay = view.Overlay;
  return render(<Overlay data={data} report={reportOf('ledger_watch')} lang={lang} />);
}

const alertData = ledgerData({
  topSeverity: 'ALERT',
  movements: [
    {
      date: '2026-11-20',
      amount: 5000,
      direction: 'CHARGED',
      class: 'UNCLASSIFIED',
      flagKind: 'UNKNOWN_ENTRY',
      severity: 'ALERT',
      title: { en: 'Unrecognised ledger entry', hi: 'अनजानी एंट्री' },
    },
  ],
  totalMovements: 1,
  charged: 5000,
  received: 0,
});

describe('ledger_watch: the passbook', () => {
  it('leads with a count in plain words', () => {
    open(ledgerData());
    expect(screen.getByTestId('report-lead')).toHaveTextContent(
      '2 entries on your account that are not fuel and not your deposits.',
    );
    open(alertData);
    expect(screen.getAllByTestId('report-lead')[1]).toHaveTextContent(
      '1 entry on your account that is not fuel and not your deposit.',
    );
  });

  it('is a real table with column and row headers', () => {
    open(ledgerData());
    const table = within(screen.getByTestId('passbook')).getByRole('table');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Date', 'What it was', 'Amount']);
    const rows = within(table).getAllByTestId('ledger-row');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByRole('rowheader')).toHaveTextContent('14 Nov');
  });

  it('puts a direction arrow and a word on every line, never a minus sign or a colour alone', () => {
    open(ledgerData());
    const [charged, received] = screen.getAllByTestId('ledger-row');
    expect(charged).toHaveAttribute('data-direction', 'CHARGED');
    expect(within(charged!).getByText('Charged')).toBeInTheDocument();
    expect(charged!.querySelector('svg.lucide-arrow-up-right')).not.toBeNull();
    expect(within(received!).getByText('Paid to you')).toBeInTheDocument();
    expect(received!.querySelector('svg.lucide-arrow-down-left')).not.toBeNull();
    expect(within(charged!).getByText('₹1,062')).toBeInTheDocument();
    expect(within(received!).getByText('₹63,877')).toBeInTheDocument();
    expect(screen.getByTestId('passbook').textContent).not.toMatch(/[−-]₹/);
  });

  it('gives each entry its own class icon', () => {
    open(ledgerData());
    const [interest, commission] = screen.getAllByTestId('ledger-row');
    expect(interest!.querySelector('svg.lucide-percent')).not.toBeNull();
    expect(commission!.querySelector('svg.lucide-hand-coins')).not.toBeNull();
  });

  it('draws binding holes and a dashed tear-off strip', () => {
    const { container } = open(ledgerData());
    expect(screen.getByTestId('tear-off').className).toContain('border-dashed');
    expect(
      container.querySelectorAll('[data-testid="passbook"] > div[aria-hidden="true"] span'),
    ).toHaveLength(3);
  });

  it('shows both totals, charged and paid to you, with how many entries they cover', () => {
    open(ledgerData());
    const tear = screen.getByTestId('tear-off');
    expect(within(tear).getByText('Charged (of these 2)')).toBeInTheDocument();
    expect(within(tear).getByText('Paid to you (of these 2)')).toBeInTheDocument();
    expect(screen.getByTestId('total-charged')).toHaveTextContent('₹1,062');
    expect(screen.getByTestId('total-received')).toHaveTextContent('₹63,877');
  });

  it('shows a total of zero rather than hiding it', () => {
    open(alertData);
    expect(screen.getByTestId('total-received')).toHaveTextContent('₹0');
    expect(screen.getByText('Paid to you (of these 1)')).toBeInTheDocument();
  });

  it('says plainly that this is not the deposit amount', () => {
    open(ledgerData());
    expect(screen.getByText('This is not your DOD deposit amount.')).toBeInTheDocument();
    expect(screen.getByText('Read from the IndianOil portal: 24 Nov, 3:16 pm')).toBeInTheDocument();
  });

  it('writes the titles in the reader language and the page in Hindi', () => {
    const { unmount } = open(ledgerData(), 'hi');
    expect(screen.getByText('बकाया पर ब्याज लगा')).toBeInTheDocument();
    expect(screen.getAllByText('आपसे लिया गया').length).toBeGreaterThan(0);
    expect(screen.getAllByText('आपको मिला').length).toBeGreaterThan(0);
    unmount();
    open(ledgerData(), 'hl');
    expect(screen.getByText('Interest charged on the outstanding')).toBeInTheDocument();
    expect(screen.getAllByText('Aapko mila').length).toBeGreaterThan(0);
  });
});

describe('ledger_watch: unknown and alert entries', () => {
  it('draws an unrecognised entry in neutral words with a question mark, not an error', () => {
    open(alertData);
    const row = screen.getByTestId('ledger-row');
    expect(within(row).getByText('Entry we do not know yet')).toBeInTheDocument();
    expect(within(row).getByText('We are looking into it')).toBeInTheDocument();
    expect(row.querySelector('svg.lucide-circle-help')).not.toBeNull();
    expect(within(row).queryByText('Unrecognised ledger entry')).toBeNull();
  });

  it('marks an ALERT row with a triangle badge and its word', () => {
    open(alertData);
    const row = screen.getByTestId('ledger-row');
    expect(row.querySelector('[data-status="attention"]')).not.toBeNull();
    expect(within(row).getByText('Needs a look')).toBeInTheDocument();
  });

  it('does not badge a routine row', () => {
    open(ledgerData());
    expect(screen.getByTestId('passbook').querySelector('[data-status]')).toBeNull();
  });
});

describe('ledger_watch: a dated window and a long list', () => {
  const window = ledgerData({
    window: { from: '2026-08-01', to: '2026-08-31' },
    totalMovements: 47,
    totalsScope: 'window',
    charged: 90000,
    received: 120000,
  });

  it('prints the dates in their own band', () => {
    open(window);
    expect(screen.getByTestId('ledger-window')).toHaveTextContent('1 Aug to 31 Aug');
  });

  it('says one day as "on"', () => {
    open(ledgerData({ window: { from: '2026-11-14', to: '2026-11-14' } }));
    expect(screen.getByTestId('ledger-window')).toHaveTextContent('on 14 Nov');
  });

  it('says when the list is cut and that the totals cover all', () => {
    open(window);
    expect(screen.getByTestId('ledger-truncated')).toHaveTextContent(
      'Showing the 2 newest of 47. Totals cover all 47.',
    );
    expect(screen.getByText('Charged (all 47)')).toBeInTheDocument();
    expect(screen.getByText('Paid to you (all 47)')).toBeInTheDocument();
  });

  it('says the rolling totals are of the shown rows only', () => {
    open(ledgerData({ totalMovements: 37 }));
    expect(screen.getByTestId('ledger-truncated')).toHaveTextContent(
      'Showing the 2 newest of 37. The totals below are of these 2.',
    );
  });

  it('prints the year for a window in another year', () => {
    open(ledgerData({ window: { from: '2025-12-01', to: '2025-12-31' } }));
    expect(screen.getByTestId('ledger-window')).toHaveTextContent('1 Dec 2025 to 31 Dec 2025');
  });
});

describe('ledger_watch: tile, alert, headline and share', () => {
  it('is not a Today tile', () => {
    expect(view.tile(ledgerData(), 'en')).toBeNull();
  });

  it('is lifted to Today only when an entry is graded ALERT, and then as a look', () => {
    expect(view.alert(ledgerData(), 'en')).toBeNull();
    expect(view.alert(alertData, 'en')).toEqual({
      headline: '1 more transaction on your account',
      line: '₹5,000 charged, ₹0 paid to you.',
      severity: 'attention',
    });
    expect(view.alert({ ...alertData, totalMovements: 4 }, 'hl')?.headline).toBe(
      'Aapke khate mein 4 aur len-den',
    );
  });

  it('writes a one-line headline with both amounts', () => {
    expect(view.headline(ledgerData(), 'en')).toBe(
      '2 more transactions: ₹1,062 charged, ₹63,877 paid to you',
    );
    expect(view.headline(alertData, 'en')).toBe(
      '1 more transaction: ₹5,000 charged, ₹0 paid to you',
    );
    expect(view.headline(ledgerData(), 'hi')).toBe('2 और लेन-देन: ₹1,062 कटा, ₹63,877 जमा हुआ');
  });

  it('rounds the one-line amounts to the whole rupee', () => {
    expect(view.headline({ ...ledgerData(), charged: 1062.4, received: 63876.6 }, 'hi')).toBe(
      '2 और लेन-देन: ₹1,062 कटा, ₹63,877 जमा हुआ',
    );
  });

  it('shares each entry with its direction in words, and the not-DOD line', () => {
    const text = view.share(ledgerData(), 'en');
    expect(text).toContain('Other ledger entries');
    expect(text).toContain('14 Nov: Interest charged on the outstanding, ₹1,062 (Charged)');
    expect(text).toContain('9 Nov: Dealer commission paid, ₹63,877 (Paid to you)');
    expect(text).toContain('₹1,062 charged, ₹63,877 paid to you');
    expect(text).toContain('This is not your DOD deposit amount.');
  });

  it('draws a ruled-page glyph', () => {
    const G = view.Glyph;
    const { container } = render(<G size={28} />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(view.kind).toBe('ledger_watch');
  });
});

describe('ledger_watch: the kit parts', () => {
  it('says how many entries need a look, as a row with a shape and a word, only when one is graded ALERT', () => {
    open(alertData);
    const row = screen.getByText('1 entry needs a look');
    expect(row).toBeInTheDocument();
    expect(screen.getByText('They are marked in the list below')).toBeInTheDocument();
    expect(
      row.closest('div.flex')!.parentElement!.querySelector('[data-status="attention"]'),
    ).not.toBeNull();
  });

  it('counts several entries in the plural', () => {
    const two = {
      ...alertData,
      totalMovements: 2,
      movements: [alertData.movements[0]!, { ...alertData.movements[0]!, amount: 700 }],
    };
    open(two);
    expect(screen.getByText('2 entries need a look')).toBeInTheDocument();
  });

  it('says nothing about a look when no entry is graded ALERT', () => {
    open(ledgerData());
    expect(screen.queryByText(/need a look|needs a look/)).toBeNull();
  });

  it('says it in Hindi and in Hinglish without Devanagari', () => {
    const hi = open(alertData, 'hi');
    expect(hi.container.textContent).toContain('1 एंट्री पर ध्यान दें');
    hi.unmount();
    const hl = open(alertData, 'hl');
    expect(hl.container.textContent).toContain('1 entry par dhyaan dein');
  });

  it('uses no fixed pixel width or height anywhere in the passbook', () => {
    const { container } = open(alertData);
    expect(container.innerHTML).not.toMatch(/h-\[\d+px|w-\[\d+px|text-\[\d/);
  });
});
