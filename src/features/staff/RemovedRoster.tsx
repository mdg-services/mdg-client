import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui';
import { useT } from '@/lib/i18n';
import type { EmployeeWithPoints } from '@dk/shared/types';

import { WarriorAvatar } from './WarriorAvatar';

/**
 * The warriors who were removed (their history stays), folded away at the foot of the page: seen
 * rarely, brought back in one tap. The fold button and each "Bring back" are 44px or more and the
 * names wrap.
 */
export function RemovedRoster({
  employees,
  onReactivate,
  pendingId,
}: {
  employees: EmployeeWithPoints[];
  onReactivate: (e: EmployeeWithPoints) => void;
  pendingId: string | null;
}) {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  if (employees.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="ghost"
        className="self-start"
        aria-expanded={open}
        leftIcon={
          open ? (
            <ChevronUp aria-hidden className="h-5 w-5" strokeWidth={2} />
          ) : (
            <ChevronDown aria-hidden className="h-5 w-5" strokeWidth={2} />
          )
        }
        onClick={() => setOpen((v) => !v)}
      >
        {open ? t('staff.hideRemoved') : t('staff.showRemoved', { n: employees.length })}
      </Button>
      {open ? (
        <ul className="flex flex-col gap-2">
          {employees.map((e) => (
            <li
              key={e.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-2/60 px-3 py-2"
            >
              <WarriorAvatar name={e.name} />
              <span className="min-w-0 flex-1 break-words text-body font-medium text-text-muted">
                {e.name}
              </span>
              <Button
                variant="secondary"
                leftIcon={<RotateCcw aria-hidden className="h-5 w-5" strokeWidth={1.75} />}
                loading={pendingId === e.id}
                aria-label={`${t('staff.reactivate')}: ${e.name}`}
                onClick={() => onReactivate(e)}
              >
                {t('staff.reactivate')}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
