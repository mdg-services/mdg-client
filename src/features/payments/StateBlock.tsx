import type { ReactNode } from 'react';

/**
 * An empty, failed or not-found screen, drawn at the payment screens' 16px
 * floor. The shared `EmptyState` sets its description at 14px, which is too
 * small for a figure of money, so these screens carry their own.
 */
export function StateBlock({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
      <div
        className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-2 text-text-muted"
        aria-hidden
      >
        {icon}
      </div>
      <p className="text-lg font-semibold text-text">{title}</p>
      {description ? <p className="max-w-xs text-base text-text-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
