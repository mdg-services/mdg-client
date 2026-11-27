import { Button } from '@/components/ui/Button';
import { StatusShape } from '@/features/reports/StatusBadge';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';

export interface ErrorCardProps {
  text: string;
  onRetry: () => void;
  className?: string;
}

/**
 * A section that could not load: what happened in a sentence, and "Try again". It is announced to a
 * screen reader. A failed section never hides the sections that did load; each draws its own.
 */
export function ErrorCard({ text, onRetry, className }: ErrorCardProps) {
  const t = useT();
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-start gap-3 rounded-xl border border-status-attention bg-status-attention-soft p-4',
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <span aria-hidden className="mt-0.5 flex [&>svg]:h-6 [&>svg]:w-6">
          <StatusShape status="attention" />
        </span>
        <p className="min-w-0 break-words text-body text-text">{text}</p>
      </div>
      <Button variant="secondary" onClick={onRetry}>
        {t('kit.retry')}
      </Button>
    </div>
  );
}
