import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useLangStore } from '@/store/lang';
import { resetStores } from '@/test/utils';

import { ledgerData, reportOf } from './_tankerMoney.fixtures';
import {
  OVER_BLOCK,
  SHORT_BLOCK,
  fakeReport,
  loadPlanData,
  variationData,
} from './dsr_sales/fixtures';
import { view as dsrVariation } from './dsr_variation';
import { view as ledgerWatch } from './ledger_watch';
import { view as loadPlan } from './load_plan';

// At 200% text three columns do not fit a phone, so these three views stack their rows. The meaning must
// survive the stacking: the tables keep their roles and the numbers stay next to their names.
vi.mock('@/lib/useLargeText', () => ({ useLargeText: () => true }));

afterEach(() => {
  cleanup();
  resetStores();
});

describe('large text: tables that stack keep their meaning', () => {
  it('load plan: each chamber is a list item with its number, fuel and litres', () => {
    useLangStore.setState({ lang: 'en' });
    const Overlay = loadPlan.Overlay;
    render(<Overlay data={loadPlanData()} report={fakeReport('load_plan')} lang="en" />);
    expect(screen.queryByRole('table', { name: 'Tanker' })).not.toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Tanker' });
    const items = within(list).getAllByRole('listitem');
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]!.textContent).toMatch(/Chamber 1/);
    expect(items[0]!.textContent).toMatch(/\d,?\d* L/);
  });

  it('dsr variation: the three rows are still rows, name then number', () => {
    useLangStore.setState({ lang: 'en' });
    const Overlay = dsrVariation.Overlay;
    render(
      <Overlay
        data={variationData({
          products: [
            { key: 'HSD', tankNos: [4], variation: SHORT_BLOCK },
            { key: 'MS', tankNos: [1], variation: OVER_BLOCK },
          ],
        })}
        report={fakeReport('dsr_variation')}
        lang="en"
      />,
    );
    const card = document.querySelector('article[data-fuel="HSD"]') as HTMLElement;
    expect(within(card).getByRole('row', { name: /Variation −520 L/ })).toBeInTheDocument();
    expect(within(card).getAllByRole('rowheader')).toHaveLength(3);
    expect(within(card).getAllByRole('cell')).toHaveLength(3);
  });

  it('ledger watch: each entry is a row with its date as the row header, and the column heads stay for a screen reader', () => {
    useLangStore.setState({ lang: 'en' });
    const Overlay = ledgerWatch.Overlay;
    render(<Overlay data={ledgerData()} report={reportOf('ledger_watch')} lang="en" />);
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
});
