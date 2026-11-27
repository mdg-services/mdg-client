import { AskMdgButton } from '@/components/kit/AskMdgButton';
import { ErrorCard } from '@/components/kit/ErrorCard';
import { InsightRow } from '@/components/kit/InsightRow';
import { PageHeader } from '@/components/kit/PageHeader';
import { SectionCard } from '@/components/kit/SectionCard';
import { SkeletonBlock } from '@/components/kit/SkeletonBlock';
import { Card } from '@/components/ui';
import { PaperRow } from '@/features/pump/PaperRow';
import {
  filedPapers,
  licencePapers,
  mergePapers,
  paperCounts,
  papersHealth,
  type PaperItem,
} from '@/features/pump/pumpModel';
import { useDocumentsOnFile, useMyOutlet } from '@/features/pump/usePumpData';
import { useT } from '@/lib/i18n';
import { useTn } from '@/lib/messages/_plural';

/**
 * Papers and licences (`/pump/papers`, spec 4.5): the licences with their end dates and the papers MDG
 * has accepted, from endpoints that exist today (`/me/outlet` and `/asks/me/on-file`). Each list draws
 * its own skeleton and fails alone.
 *
 * EACH PAPER ONCE. The two sources both carry the licences, so they are matched by kind (`mergePapers`):
 * one row per licence, the later end date wins, and a small "MDG accepted" mark says MDG holds it. The
 * card at the top COUNTS ("1 expired, 3 ending soon, 1 valid"); it never repeats a paper's name, the
 * rows below carry the names. "All valid" is said only when both lists have arrived: a summary built
 * from half of them would be a claim nobody checked. Pump-details completeness is not here (the form
 * stays in chat).
 */
export function PapersPage() {
  const t = useT();
  const tn = useTn();
  const outlet = useMyOutlet();
  const onFile = useDocumentsOnFile();

  const licenceRows = outlet.data ? licencePapers(outlet.data) : [];
  const filedRows = onFile.data ? filedPapers(onFile.data.rows) : [];
  const merged = mergePapers(licenceRows, filedRows);
  const licences = outlet.data ? merged.licences : null;
  const other = onFile.data ? merged.other : null;
  const health = outlet.data && onFile.data ? papersHealth(merged.all) : null;

  let summaryText = '';
  if (health) {
    const counts = paperCounts(merged.all);
    if (health.kind === 'none') summaryText = t('pump.health.papers.none');
    else if (counts.expired === 0 && counts.expiring === 0) summaryText = t('pump.health.papers.valid');
    else {
      const parts: string[] = [];
      if (counts.expired > 0) parts.push(tn('pump.papers.count.expired', counts.expired));
      if (counts.expiring > 0) parts.push(tn('pump.papers.count.expiring', counts.expiring));
      if (counts.valid > 0) parts.push(tn('pump.papers.count.valid', counts.valid));
      summaryText = parts.join(', ');
    }
  }

  return (
    <>
      <PageHeader variant="sub" title={t('pump.papers.summary')} back={{ to: '/pump' }} />
      <div className="flex flex-1 flex-col gap-3 bg-bg p-4">
        {health ? (
          <Card className="px-4 py-2">
            <InsightRow status={health.status} text={summaryText} />
          </Card>
        ) : null}

        <SectionCard title={t('pump.papers.licences')} variant="list">
          <PaperList
            items={licences}
            pending={outlet.isPending && outlet.fetchStatus !== 'paused'}
            onRetry={() => void outlet.refetch()}
            empty={t('pump.papers.licences.empty')}
            showAccepted
          />
        </SectionCard>

        <SectionCard title={t('pump.papers.onFile')} variant="list">
          <PaperList
            items={other}
            pending={onFile.isPending && onFile.fetchStatus !== 'paused'}
            onRetry={() => void onFile.refetch()}
            empty={t('pump.papers.onFile.empty')}
          />
        </SectionCard>

        <AskMdgButton draft={t('pump.papers.askDraft')} className="self-start" />
      </div>
    </>
  );
}

function PaperList({
  items,
  pending,
  onRetry,
  empty,
  showAccepted = false,
}: {
  items: PaperItem[] | null;
  pending: boolean;
  onRetry: () => void;
  empty: string;
  showAccepted?: boolean;
}) {
  const t = useT();
  if (pending) return <SkeletonBlock lines={3} />;
  if (!items) return <ErrorCard text={t('pump.papers.loadFailed')} onRetry={onRetry} />;
  if (items.length === 0) return <p className="break-words py-3 text-body text-text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-border">
      {items.map((item) => (
        <li key={item.id}>
          <PaperRow item={item} showAccepted={showAccepted} />
        </li>
      ))}
    </ul>
  );
}
