import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

export interface StickyActionProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}

/**
 * The one main action of a page, kept on screen at the bottom: a 48px black button across the
 * width. Inside the page's own column it sits above the tab bar (which is outside it); on a
 * sub-page it sits at the screen's bottom edge, clear of the phone's safe area.
 */
export function StickyAction({ label, onPress, disabled, loading, className }: StickyActionProps) {
  return (
    <div className={cn('safe-bottom sticky bottom-0 z-20 border-t border-border bg-surface px-4 pt-2', className)}>
      <Button size="lg" fullWidth onClick={onPress} disabled={disabled} loading={loading}>
        {label}
      </Button>
    </div>
  );
}
