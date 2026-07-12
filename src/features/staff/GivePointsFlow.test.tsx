import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useStaffDraftStore } from '@/store/staffDraft';
import type { EffectiveWorkItem, EmployeeWithPoints } from '@dk/shared/types';

import { renderWithProviders } from '../../test/utils';

import { GivePointsFlow } from './GivePointsFlow';

/**
 * The catch-all works ("Other cleaning work" …) don't say what was done, so the
 * flow must not let one into the submission without a description. The server
 * rejects it regardless; these tests pin the client half — that the dealer is
 * stopped at the field rather than at a failed save.
 */

const work = (over: Partial<EffectiveWorkItem>): EffectiveWorkItem =>
  ({
    code: 'du-island-clean',
    srNo: 1,
    labelEn: 'DU island cleaning',
    labelHi: 'DU आईलैंड की सफाई',
    domain: 'cleaning',
    distribution: 'EACH',
    points: 4,
    active: true,
    source: 'global',
    ...over,
  }) as EffectiveWorkItem;

const NAMED = work({});
const OTHER = work({
  code: 'other-cleaning-work',
  srNo: 2,
  labelEn: 'Other cleaning work',
  labelHi: 'अन्य सफाई से जुड़ा काम',
  points: 4.5,
});

const CATALOG = [NAMED, OTHER];

vi.mock('@/hooks/api/useDealerWorkItems', () => ({
  useDealerWorkItems: () => ({ data: CATALOG, isLoading: false }),
}));

const EMPLOYEES = [
  { id: 'e1', name: 'रमेश', pointsInWindow: 10 },
] as unknown as EmployeeWithPoints[];

const DEALER = 'd1';

function open() {
  renderWithProviders(
    <GivePointsFlow dealerId={DEALER} employees={EMPLOYEES} onClose={() => {}} />,
  );
}

/** Walk the sheet: pick the worker, tick a work, continue to the configure step. */
async function pickWork(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByText('रमेश'));
  await user.click(await screen.findByText(label));
  await user.click(screen.getByRole('button', { name: /आगे बढ़ें|Continue/ }));
}

const entriesInDraft = () =>
  useStaffDraftStore.getState().byDealer[DEALER]?.entries ?? [];

beforeEach(() => {
  useStaffDraftStore.setState({ byDealer: {}, sync: {} });
});

describe('GivePointsFlow — description for the "Other …" works', () => {
  it('asks what was done, and refuses to add it until you say', async () => {
    const user = userEvent.setup();
    open();
    await pickWork(user, 'अन्य सफाई से जुड़ा काम');

    const box = screen.getByRole('textbox', { name: /उन्होंने क्या काम किया/ });
    expect(box).toBeInTheDocument();

    // Try to submit with the description empty.
    await user.click(screen.getByRole('button', { name: /सूची में जोड़ें/ }));

    // Shown inline on the field AND as a toast (the field may be scrolled away).
    expect(await screen.findAllByText(/इसे जोड़ने के लिए लिखिए/)).not.toHaveLength(0);
    expect(entriesInDraft()).toHaveLength(0);
  });

  it('adds it once a description is written, and carries the text through', async () => {
    const user = userEvent.setup();
    open();
    await pickWork(user, 'अन्य सफाई से जुड़ा काम');

    await user.type(
      screen.getByRole('textbox', { name: /उन्होंने क्या काम किया/ }),
      'छत की सफाई की',
    );
    await user.click(screen.getByRole('button', { name: /सूची में जोड़ें/ }));

    await waitFor(() => expect(entriesInDraft()).toHaveLength(1));
    expect(entriesInDraft()[0]).toMatchObject({
      employeeId: 'e1',
      workItemCode: 'other-cleaning-work',
      note: 'छत की सफाई की',
    });
  });

  it('does not ask for a description on a normal work', async () => {
    const user = userEvent.setup();
    open();
    await pickWork(user, 'DU आईलैंड की सफाई');

    // The common path stays one tap — no extra field, no extra friction.
    expect(
      screen.queryByRole('textbox', { name: /उन्होंने क्या काम किया/ }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /सूची में जोड़ें/ }));
    await waitFor(() => expect(entriesInDraft()).toHaveLength(1));
    expect(entriesInDraft()[0]?.note).toBeUndefined();
  });

  it('blocks the whole submission when only one of several works is undescribed', async () => {
    const user = userEvent.setup();
    open();

    await user.click(screen.getByText('रमेश'));
    await user.click(await screen.findByText('DU आईलैंड की सफाई'));
    await user.click(screen.getByText('अन्य सफाई से जुड़ा काम'));
    await user.click(screen.getByRole('button', { name: /आगे बढ़ें|Continue/ }));

    await user.click(screen.getByRole('button', { name: /सूची में जोड़ें/ }));

    // Neither work goes in — a partial add would silently drop the one that failed.
    // Shown inline on the field AND as a toast (the field may be scrolled away).
    expect(await screen.findAllByText(/इसे जोड़ने के लिए लिखिए/)).not.toHaveLength(0);
    expect(entriesInDraft()).toHaveLength(0);
  });

  it('treats a whitespace-only description as empty', async () => {
    const user = userEvent.setup();
    open();
    await pickWork(user, 'अन्य सफाई से जुड़ा काम');

    await user.type(
      screen.getByRole('textbox', { name: /उन्होंने क्या काम किया/ }),
      '    ',
    );
    await user.click(screen.getByRole('button', { name: /सूची में जोड़ें/ }));

    // Shown inline on the field AND as a toast (the field may be scrolled away).
    expect(await screen.findAllByText(/इसे जोड़ने के लिए लिखिए/)).not.toHaveLength(0);
    expect(entriesInDraft()).toHaveLength(0);
  });
});

describe('GivePointsFlow — the sheet still says "warrior"', () => {
  it('offers the roster by name', async () => {
    open();
    const sheet = screen.getByText('काम किसने किया?').closest('div');
    expect(within(sheet as HTMLElement).getByText('रमेश')).toBeInTheDocument();
  });
});
