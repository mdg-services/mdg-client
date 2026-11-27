import * as React from 'react';

import { buildDraftLines, draftLinesTotal, type NamedEmployee } from '@/lib/staff';
import { useStaffDraftStore } from '@/store/staffDraft';
import type { EffectiveWorkItem } from '@dk/shared/types';

export interface DraftSummary {
  /** How many different warriors have lines waiting. */
  warriors: number;
  /** The points waiting, worked out here from the work list (the server works them out again when the sheet is sent). */
  points: number;
  /** Whether any line is waiting at all. */
  waiting: boolean;
}

/**
 * What is waiting to be sent, read from the phone's own copy of the draft (the persisted store under
 * `mdg.client.staffDraft`), so it is right at once and offline. The same resolving the "Waiting to
 * send" card does, so the page's other lines (an empty Today says "Waiting to send: 62") quote the
 * number the card shows.
 */
export function useDraftSummary(
  dealerId: string | undefined,
  workItems: EffectiveWorkItem[],
  employees: NamedEmployee[],
): DraftSummary {
  const slice = useStaffDraftStore((s) => (dealerId ? s.byDealer[dealerId] : undefined));
  return React.useMemo(() => {
    const entries = slice?.entries ?? [];
    if (entries.length === 0) return { warriors: 0, points: 0, waiting: false };
    const lines = buildDraftLines(entries, workItems, employees, slice?.serverLines);
    return {
      warriors: new Set(lines.map((l) => l.employeeId)).size,
      points: draftLinesTotal(lines),
      waiting: true,
    };
  }, [slice?.entries, slice?.serverLines, workItems, employees]);
}
