import { cn } from '@/lib/cn';

import { fileFlavour, fileTypeLabel } from './fileKind';

const TONE = {
  pdf: 'bg-danger',
  doc: 'bg-info',
  xls: 'bg-success',
  other: 'bg-neutral',
} as const;

/**
 * The coloured square that says what a document is — red for a PDF, blue for a
 * Word file, green for a spreadsheet, grey for the rest. The same badge sits on
 * a document bubble in the thread and on a row of the gallery's Docs tab, so a
 * paper looks the same wherever the dealer meets it.
 */
export function FileTypeBadge({
  filename,
  contentType,
  className,
}: {
  filename: string;
  contentType?: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold tracking-wide text-text-inverse',
        TONE[fileFlavour(filename, contentType)],
        className,
      )}
    >
      {fileTypeLabel(filename, contentType)}
    </span>
  );
}
