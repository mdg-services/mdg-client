import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StaffDraftSync } from '@/hooks/api/useStaffDraftSync';
import { useLangStore } from '@/store/lang';
import { useStaffDraftStore } from '@/store/staffDraft';
import { renderWithProviders, resetStores } from '@/test/utils';
import type { EffectiveWorkItem } from '@dk/shared/types';

import { PendingSubmissionPanel } from './PendingSubmissionPanel';

const work = (over: Partial<EffectiveWorkItem>): EffectiveWorkItem =>
  ({
    code: 'du-clean',
    srNo: 1,
    labelEn: 'DU island cleaning',
    labelHi: 'DU आईलैंड की सफाई',
    domain: 'cleaning',
    distribution: 'EACH',
    points: 31,
    active: true,
    source: 'global',
    ...over,
  }) as EffectiveWorkItem;

const WORK = [
  work({}),
  work({
    code: 'unload',
    labelEn: 'Tanker unloading help',
    labelHi: 'टैंकर उतारना',
    distribution: 'PER_UNIT',
    unit: 'kl',
    points: 2,
  }),
];
const PEOPLE = [
  { id: 's', name: 'Suresh' },
  { id: 'a', name: 'Asha' },
];

const sync: StaffDraftSync = {
  syncState: 'saved',
  dirty: false,
  flush: vi.fn().mockResolvedValue({ ok: true }),
  suppressAutosave: vi.fn(),
};

function seed(entries: { employeeId: string; workItemCode: string; quantity?: number }[]) {
  useStaffDraftStore.setState({
    byDealer: {
      d1: {
        entries,
        workDate: '2026-11-24',
        note: '',
        dirty: false,
        serverLines: [],
        updatedAt: '2026-11-24T05:00:00.000Z',
      },
    },
    sync: {},
  });
}

function open() {
  useLangStore.setState({ lang: 'en', explicit: true });
  return renderWithProviders(
    <PendingSubmissionPanel dealerId="d1" workItems={WORK} employees={PEOPLE} sync={sync} />,
  );
}

beforeEach(() => {
  resetStores();
  useStaffDraftStore.setState({ byDealer: {}, sync: {} });
});

describe('Waiting to send', () => {
  it('draws nothing for an empty draft', () => {
    const { container } = open();
    expect(container.textContent).toBe('');
  });

  it('says how many warriors and how many points are not sent yet, and holds the send button', () => {
    seed([
      { employeeId: 's', workItemCode: 'du-clean' },
      { employeeId: 'a', workItemCode: 'du-clean' },
    ]);
    open();
    const card = screen.getByRole('region', { name: 'Waiting to send' });
    expect(within(card).getByText('2 warriors, 62 points not sent yet')).toBeTruthy();
    const send = within(card).getByRole('button', { name: "Send today's sheet" });
    expect(send.className).toContain('min-h-12');
  });

  it('says "1 warrior" for one', () => {
    seed([{ employeeId: 's', workItemCode: 'du-clean' }]);
    open();
    expect(screen.getByText('1 warrior, 31 points not sent yet')).toBeTruthy();
  });

  it('keeps the draft list under one tap, and opens it with the state announced', () => {
    seed([{ employeeId: 's', workItemCode: 'unload', quantity: 2 }]);
    open();
    const see = screen.getByRole('button', { name: 'See the list' });
    expect(see.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('button', { name: /One more of/ })).toBeNull();
    fireEvent.click(see);
    expect(
      screen.getByRole('button', { name: 'Hide the list' }).getAttribute('aria-expanded'),
    ).toBe('true');
  });

  it('names the small buttons after the work and the warrior, each 44px', () => {
    seed([{ employeeId: 's', workItemCode: 'unload', quantity: 2 }]);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'See the list' }));
    const more = screen.getByRole('button', {
      name: 'One more of Tanker unloading help for Suresh',
    });
    const less = screen.getByRole('button', {
      name: 'One less of Tanker unloading help for Suresh',
    });
    const remove = screen.getByRole('button', { name: 'Remove Tanker unloading help for Suresh' });
    for (const b of [more, less, remove]) expect(b.className).toContain('h-11');
    expect(screen.queryByRole('button', { name: /^[-+]$/ })).toBeNull();
  });

  it('changes a count and removes a line from the draft', async () => {
    seed([{ employeeId: 's', workItemCode: 'unload', quantity: 2 }]);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'See the list' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'One more of Tanker unloading help for Suresh' }),
    );
    await waitFor(() =>
      expect(useStaffDraftStore.getState().byDealer.d1?.entries[0]?.quantity).toBe(3),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove Tanker unloading help for Suresh' }),
    );
    await waitFor(() => expect(useStaffDraftStore.getState().byDealer.d1?.entries).toHaveLength(0));
  });

  it('opens the final sheet from the send button, which still needs the paper photo', () => {
    seed([{ employeeId: 's', workItemCode: 'du-clean' }]);
    open();
    fireEvent.click(screen.getByRole('button', { name: "Send today's sheet" }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();
    // No photo yet: the final submit stays shut and says why.
    expect(within(dialog).getAllByText(/photo/i).length).toBeGreaterThan(0);
    const submit = within(dialog)
      .getAllByRole('button')
      .find((b) => b.hasAttribute('disabled'));
    expect(submit).toBeTruthy();
  });
});
