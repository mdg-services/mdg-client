import { ChevronDown } from 'lucide-react';

import { useT } from '@/lib/i18n';
import { dealerCodeLabel } from '@dk/shared';

import { hasOtherOutlets, useOutlets } from './useOutlets';

/**
 * "15E ▾" in the chat list's top bar: which pump this is, and the way to another.
 * Drawn only for a person who has another pump — everyone else sees no chip and
 * makes no request (`useOutlets` stays off without a `personId`).
 */
export function OutletChip({ onOpen }: { onOpen: () => void }) {
  const t = useT();
  const q = useOutlets();
  if (!hasOtherOutlets(q.data)) return null;
  const code = dealerCodeLabel(q.data.current.code);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t('outlets.chipLabel', { code })}
      className="mr-1 flex h-8 shrink-0 items-center gap-0.5 rounded-full bg-wa-row-active pl-3 pr-2 text-[14px] font-semibold text-wa-accent-strong"
    >
      {code}
      <ChevronDown width={16} height={16} strokeWidth={2.25} aria-hidden />
    </button>
  );
}
