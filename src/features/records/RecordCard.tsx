import type { RecordType } from '@dk/shared/types';
import { RECORD_TYPE_LABELS } from '@dk/shared/types';
import {
  FileBarChart,
  FileCheck2,
  FileText,
  Receipt,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/cn';

interface TypeStyle {
  icon: LucideIcon;
  chip: string;
  iconWrap: string;
}

const TYPE_STYLES: Record<RecordType, TypeStyle> = {
  dsr: {
    icon: FileBarChart,
    chip: 'bg-info-soft text-info',
    iconWrap: 'bg-info-soft text-info',
  },
  invoice: {
    icon: Receipt,
    chip: 'bg-amber-100 text-amber-700',
    iconWrap: 'bg-amber-100 text-amber-700',
  },
  compliance: {
    icon: FileCheck2,
    chip: 'bg-emerald-100 text-emerald-700',
    iconWrap: 'bg-emerald-100 text-emerald-700',
  },
  statement: {
    icon: Wallet,
    chip: 'bg-violet-100 text-violet-700',
    iconWrap: 'bg-violet-100 text-violet-700',
  },
  other: {
    icon: FileText,
    chip: 'bg-surface-2 text-text-muted',
    iconWrap: 'bg-surface-2 text-text-muted',
  },
};

export interface RecordCardData {
  recordType: RecordType;
  title: string;
  periodLabel?: string;
}

export function RecordCard({
  record,
  url,
  compact = false,
}: {
  record: RecordCardData;
  /** Signed file URL. When present, tapping the card opens it. */
  url?: string;
  compact?: boolean;
}) {
  const style = TYPE_STYLES[record.recordType] ?? TYPE_STYLES.other;
  const Icon = style.icon;

  const open = () => {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <button
      type="button"
      onClick={open}
      disabled={!url}
      className={cn(
        'flex w-full items-center gap-3 rounded-2xl border border-border bg-surface text-left shadow-sm transition-colors',
        url ? 'hover:bg-surface-2 active:bg-surface-2' : 'cursor-default',
        compact ? 'min-h-[44px] p-3' : 'min-h-[44px] p-4',
      )}
    >
      <span
        className={cn(
          'flex shrink-0 items-center justify-center rounded-xl',
          compact ? 'h-10 w-10' : 'h-11 w-11',
          style.iconWrap,
        )}
        aria-hidden
      >
        <Icon width={compact ? 18 : 20} strokeWidth={1.75} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span
            className={cn(
              'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
              style.chip,
            )}
          >
            {RECORD_TYPE_LABELS[record.recordType]}
          </span>
        </span>
        <span className="mt-1 block truncate text-[15px] font-semibold leading-snug text-text">
          {record.title}
        </span>
        {record.periodLabel ? (
          <span className="mt-0.5 block truncate text-xs text-text-muted">
            {record.periodLabel}
          </span>
        ) : null}
        <span className="mt-1 block text-xs font-medium text-brand">
          {url ? 'Tap to view' : 'Preparing…'}
        </span>
      </span>
    </button>
  );
}
