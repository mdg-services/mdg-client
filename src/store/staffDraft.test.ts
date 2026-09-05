import { beforeEach, describe, expect, it } from 'vitest';

import { useStaffDraftStore } from './staffDraft';

/**
 * The three catch-all works ("Other cleaning work", and the two like it) each
 * need a description written on them, and that description is what tells two of
 * them apart. A dealer can record, for the same man, on the same day:
 *
 *   Other cleaning work — "washed the forecourt"
 *   Other cleaning work — "cleaned the toilet"
 *
 * Both are real, both are separately paid, and the only thing distinguishing
 * them is the note. Anything that matches a line on (employee, work) alone
 * treats them as one — which is how the bin icon on either row came to delete
 * both, and how a merge of two identically-worded lines came to delete the
 * description the server then demanded.
 */
const DEALER = 'd1';
const EMP = 'e1';
const WORK = 'OTHER_CLEANING';

function reset(): void {
  useStaffDraftStore.getState().clearDraft(DEALER);
}

function lines() {
  return useStaffDraftStore.getState().byDealer[DEALER]?.entries ?? [];
}

beforeEach(reset);

describe('a draft line is identified by its description too', () => {
  it('keeps two differently-described catch-all jobs apart', () => {
    const { addEntries } = useStaffDraftStore.getState();
    addEntries(DEALER, [
      { employeeId: EMP, workItemCode: WORK, note: 'washed the forecourt' },
    ]);
    addEntries(DEALER, [
      { employeeId: EMP, workItemCode: WORK, note: 'cleaned the toilet' },
    ]);
    expect(lines()).toHaveLength(2);
  });

  it('deletes only the row whose bin was tapped', () => {
    const { addEntries, removeLine } = useStaffDraftStore.getState();
    addEntries(DEALER, [
      { employeeId: EMP, workItemCode: WORK, note: 'washed the forecourt' },
      { employeeId: EMP, workItemCode: WORK, note: 'cleaned the toilet' },
    ]);
    expect(lines()).toHaveLength(2);

    removeLine(DEALER, EMP, WORK, 'cleaned the toilet');
    expect(lines()).toHaveLength(1);
    expect(lines()[0]?.note).toBe('washed the forecourt');
  });

  it('edits only the row that was edited', () => {
    const { addEntries, updateLine } = useStaffDraftStore.getState();
    addEntries(DEALER, [
      { employeeId: EMP, workItemCode: WORK, note: 'a', quantity: 1 },
      { employeeId: EMP, workItemCode: WORK, note: 'b', quantity: 1 },
    ]);
    updateLine(DEALER, EMP, WORK, { quantity: 5 }, 'b');
    const byNote = Object.fromEntries(lines().map((l) => [l.note, l.quantity]));
    expect(byNote).toEqual({ a: 1, b: 5 });
  });

  it('carries the description through a merge of two identical lines', () => {
    const { addEntries } = useStaffDraftStore.getState();
    addEntries(DEALER, [
      { employeeId: EMP, workItemCode: WORK, note: 'saaf kiya', quantity: 1 },
    ]);
    addEntries(DEALER, [
      { employeeId: EMP, workItemCode: WORK, note: 'saaf kiya', quantity: 2 },
    ]);
    expect(lines()).toHaveLength(1);
    expect(lines()[0]?.quantity).toBe(3);
    // Without this the merged line reaches the server with no description and
    // is refused — after the dealer has already been told it was saved.
    expect(lines()[0]?.note).toBe('saaf kiya');
  });

  it('still merges ordinary works, which carry no description', () => {
    const { addEntries } = useStaffDraftStore.getState();
    addEntries(DEALER, [{ employeeId: EMP, workItemCode: 'SWEEP', quantity: 2 }]);
    addEntries(DEALER, [{ employeeId: EMP, workItemCode: 'SWEEP', quantity: 3 }]);
    expect(lines()).toHaveLength(1);
    expect(lines()[0]?.quantity).toBe(5);
  });
});
