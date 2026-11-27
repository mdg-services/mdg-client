import { DeltaChip } from '@/components/kit/DeltaChip';
import { Num } from '@/components/kit/Num';
import { Card } from '@/components/ui';
import { fmtInt } from '@/lib/fmt';
import { useT } from '@/lib/i18n';
import type { EmployeeWithPoints } from '@dk/shared/types';

import { activeOnly, changeNumber, earnedCount, percentChange, teamTotal } from './staffInsights';

/**
 * The first card of the Warriors page: "Is my crew pulling?" Team points this month, how that stands
 * against the SAME DAYS of last month (twelve days against a whole month would call every early-month
 * total a fall), and how many of the warriors earned any points. It always speaks of this month,
 * whatever the switch below is set to.
 *
 * Active warriors only, summed on the raw numbers and rounded once: the assistant says the same
 * total in chat. `previous` is null while the second call has not come or has failed: the card then
 * simply has no change line, and never a wrong one.
 */
export function TeamStrip({
  month,
  previous,
}: {
  month: EmployeeWithPoints[];
  previous: EmployeeWithPoints[] | null;
}) {
  const t = useT();
  const active = activeOnly(month);
  const total = Math.round(teamTotal(active));
  const earned = earnedCount(active);
  const change = previous
    ? percentChange(teamTotal(active), teamTotal(activeOnly(previous)))
    : null;
  const earnedText = t('warr.team.earned', { n: earned, m: active.length });

  return (
    <Card
      role="group"
      aria-label={t('warr.team.aria', { points: fmtInt(total), earned: earnedText })}
      className="flex flex-col gap-2 p-4"
    >
      <p className="break-words text-meta font-medium text-text-muted">{t('warr.team.label')}</p>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="break-words text-display text-text">
          <Num value={total} />
        </span>
        <span className="text-body text-text-muted">{t('staff.points')}</span>
      </p>
      {change ? (
        <DeltaChip
          dir={change.dir}
          {...changeNumber(change)}
          against={t('warr.team.against')}
          className="self-start"
        />
      ) : null}
      <p className="break-words text-body text-text">{earnedText}</p>
    </Card>
  );
}
