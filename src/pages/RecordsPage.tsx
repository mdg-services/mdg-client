import { FileText } from 'lucide-react';
import * as React from 'react';


import { EmptyState, Spinner } from '@/components/ui';
import { RecordCard } from '@/features/records/RecordCard';
import { useRecords } from '@/hooks/api/useRecords';
import { useT } from '@/lib/i18n';
import { RECORD_TYPES } from '@dk/shared/types';
import type { DealerRecord, RecordType } from '@dk/shared/types';

function byNewest(a: DealerRecord, b: DealerRecord): number {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

export function RecordsPage() {
  const t = useT();
  const recordsQuery = useRecords();

  const grouped = React.useMemo(() => {
    const map = new Map<RecordType, DealerRecord[]>();
    for (const rec of recordsQuery.data ?? []) {
      const list = map.get(rec.type) ?? [];
      list.push(rec);
      map.set(rec.type, list);
    }
    for (const list of map.values()) list.sort(byNewest);
    return map;
  }, [recordsQuery.data]);

  const total = recordsQuery.data?.length ?? 0;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <h1 className="text-lg font-semibold tracking-tight text-text">
        {t('records.title')}
      </h1>

      {recordsQuery.isLoading ? (
        <div className="flex flex-1 items-center justify-center py-12">
          <Spinner size={20} />
        </div>
      ) : recordsQuery.isError ? (
        <EmptyState
          icon={<FileText width={28} strokeWidth={1.5} />}
          title={t('records.errorTitle')}
          description={t('common.helpDesc')}
        />
      ) : total === 0 ? (
        <EmptyState
          icon={<FileText width={28} strokeWidth={1.5} />}
          title={t('records.emptyTitle')}
          description={t('records.emptyDesc')}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {RECORD_TYPES.map((type) => {
            const items = grouped.get(type);
            if (!items || items.length === 0) return null;
            return (
              <section key={type} className="flex flex-col gap-2">
                <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-text-subtle">
                  {t(`record.type.${type}`)}
                </h2>
                <div className="flex flex-col gap-2">
                  {items.map((rec) => (
                    <RecordCard
                      key={rec.id}
                      record={{
                        recordType: rec.type,
                        title: rec.title,
                        periodLabel: rec.periodLabel,
                      }}
                      url={rec.attachment.url}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
