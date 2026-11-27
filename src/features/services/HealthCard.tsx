import { AsOf } from '@/components/kit/AsOf';
import { VerdictCard } from '@/components/kit/VerdictCard';
import { useLang, useT } from '@/lib/i18n';
import { useTn } from '@/lib/messages/_plural';

import type { Hub } from './servicesModel';
import { serviceStateWord } from './serviceState';

/**
 * The health card (spec 4.2.3). Drawn ONLY from the server's own word on how each service runs: the
 * caller draws it when `GET /v1/me/services` answered and not otherwise, so a guessed "Working" never
 * appears.
 *
 * The headline leads with the WORST fact, as a sentence ("1 service has stopped"), because an owner
 * who reads "6 of 14 running" in red reads "my pump is mostly broken" when one thing is down. "N of M
 * running" is only said when nothing is wrong. Under it, every state is counted, so the numbers add up
 * to the services listed (running, need you, to look at, stopped, getting ready, when you ask). The
 * sentence under the headline names the first service that is not working. The shape follows the
 * worst fact: the stop sign only while something is stopped, else amber, else the tick.
 */
export function HealthCard({
  health,
  asOf,
}: {
  health: NonNullable<Hub['health']>;
  asOf: string | null;
}) {
  const t = useT();
  const tn = useTn();
  const lang = useLang();
  const counts = [
    { label: t('svc.health.working'), n: health.running },
    { label: t('svc.health.needsYou'), n: health.needsYou },
    { label: t('svc.health.look'), n: health.lookAt },
    { label: t('svc.health.stopped'), n: health.stopped },
    { label: t('svc.health.notYet'), n: health.notYet },
    { label: t('svc.health.onRequest'), n: health.onRequest },
  ].filter((c) => c.n > 0);
  const first = health.first;
  const word =
    health.stopped > 0
      ? tn('svc.health.h.stopped', health.stopped)
      : health.needsYou > 0
        ? tn('svc.health.h.needs', health.needsYou)
        : health.lookAt > 0
          ? tn('svc.health.h.look', health.lookAt)
          : health.running === health.total
            ? tn('svc.health.h.all', health.total)
            : tn('svc.health.word', health.total, { running: health.running, total: health.total });
  return (
    <VerdictCard
      status={health.status}
      word={word}
      {...(first && first.state
        ? {
            sentence: t('svc.health.first', {
              name: first.name,
              state: serviceStateWord(first.state, lang),
            }),
          }
        : {})}
      counts={counts}
      {...(asOf ? { asOf: <AsOf at={asOf} /> } : {})}
    />
  );
}
