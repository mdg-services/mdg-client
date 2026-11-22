import type {
  ComplaintDealerView,
  ComplaintOption,
  ComplaintQuestion,
  ComplaintStep,
  ComplaintsMeView,
} from '@dk/shared/types';

/** Builders for the complaint view (ADR 0052), as `GET /me/complaints` answers it. */

export const makeComplaintOption = (id: string, en: string, over: Partial<ComplaintOption> = {}): ComplaintOption => ({
  id,
  label: { en, hi: `${en} (hi)`, hl: `${en} (hl)` },
  ...over,
});

export function makeComplaintQuestion(over: Partial<ComplaintQuestion> = {}): ComplaintQuestion {
  return {
    id: 'q1',
    field: 'tid',
    prompt: { en: 'Which card machine?', hi: 'कौन सी कार्ड मशीन?', hl: 'Kaunsi card machine?' },
    options: [
      makeComplaintOption('t1', 'Machine ending 773', { hint: { en: 'Pine Labs' } }),
      makeComplaintOption('t2', 'Machine ending 774'),
    ],
    ...over,
  };
}

export const makeComplaintSteps = (
  states: Array<ComplaintStep['state']> = ['current', 'todo', 'todo', 'todo'],
  times: Array<string | undefined> = [],
): ComplaintStep[] => {
  const keys = ['filed', 'assigned', 'fixed', 'closed'] as const;
  const names = ['Filed', 'Engineer assigned', 'Fixed', 'Closed'];
  return keys.map((key, i) => ({
    key,
    label: { en: names[i], hi: `${names[i]} (hi)`, hl: `${names[i]} (hl)` },
    state: states[i] ?? 'todo',
    at: times[i],
  }));
};

export function makeComplaintView(over: Partial<ComplaintDealerView> = {}): ComplaintDealerView {
  return {
    id: 'c1',
    route: 'eicts',
    routeLabel: { en: 'Card machine', hi: 'कार्ड मशीन', hl: 'Card machine' },
    title: { en: 'Card machine not working', hi: 'कार्ड मशीन बंद है', hl: 'Card machine band hai' },
    stage: 'drafting',
    screen: 'asking',
    question: makeComplaintQuestion(),
    steps: [],
    statusLine: { en: 'Asking', hi: 'पूछ रहे हैं', hl: 'Pooch rahe hain' },
    canCancel: true,
    canCheckNow: false,
    liveMessageId: 'm1',
    updatedAt: '2026-11-22T06:00:00.000Z',
    ...over,
  };
}

export const makeComplaintsMe = (...complaints: ComplaintDealerView[]): ComplaintsMeView => ({ complaints });
