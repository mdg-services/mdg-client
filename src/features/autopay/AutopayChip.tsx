import { StatusPill } from '@/components/kit';
import { useT } from '@/lib/i18n';
import type { AutopayViewState } from '@dk/shared/types';

import { AUTOPAY_STATE_KEY, AUTOPAY_STATUS } from './autopayView';

/**
 * The state of autopay as a shape AND a word, drawn by the same kit pill as a bill's status so the
 * two read as one family on the Bill and plan page.
 */
export function AutopayChip({ state }: { state: AutopayViewState }) {
  const t = useT();
  return <StatusPill status={AUTOPAY_STATUS[state]} word={t(AUTOPAY_STATE_KEY[state])} />;
}
