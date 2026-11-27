import { Fuel } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { hasOtherOutlets, useOutlets } from '@/features/outlets/useOutlets';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { useLargeText } from '@/lib/useLargeText';
import { dealerCodeLabel } from '@dk/shared';

/**
 * The labelled door to the pump's own page (`/pump`), on every top bar of a door. It says "My pump"
 * in words, and for a person with more than one pump the pump they are in ("15E") as well: never a
 * bare icon, never a bare code. It reads the signed-in person itself, so a page passes nothing.
 * Someone with one pump makes no extra request (`useOutlets` stays off without a `personId`).
 *
 * At large text the icon goes and the button's floor is the 44 px tap size, so the words get the
 * room: "My pump" is about 105 px wide at 200% and the icon would take a third of a 360 px bar.
 */
export function MyPumpButton() {
  const t = useT();
  const navigate = useNavigate();
  const q = useOutlets();
  const large = useLargeText();
  const code = hasOtherOutlets(q.data) ? dealerCodeLabel(q.data.current.code) : null;
  return (
    <button
      type="button"
      onClick={() => navigate('/pump')}
      {...(code ? { 'aria-label': t('shell.door.pumpWith', { code }) } : {})}
      className={cn(
        'flex shrink-0 items-center gap-2 rounded-md border border-border bg-surface py-1 text-left text-cta text-text shadow-sm active:bg-surface-2',
        large ? 'min-h-tap px-2' : 'min-h-11 px-3',
      )}
    >
      {large ? null : <Fuel aria-hidden className="h-5 w-5 shrink-0" strokeWidth={1.75} />}
      <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
        <span className="break-words">{t('shell.door.pump')}</span>
        {code ? <span className="text-meta font-semibold text-text-muted">{code}</span> : null}
      </span>
    </button>
  );
}
