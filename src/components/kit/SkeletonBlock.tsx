import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';

/** Grey lines where text will be, while it loads. Sizes in rem; announced once as "Loading". */
export function SkeletonBlock({ lines = 3, className }: { lines?: number; className?: string }) {
  const t = useT();
  return (
    <div role="status" aria-busy="true" aria-label={t('common.loading')} className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          aria-hidden
          className={cn('h-4 animate-pulse rounded-md bg-surface-2', i === lines - 1 && lines > 1 ? 'w-2/3' : 'w-full')}
        />
      ))}
    </div>
  );
}
