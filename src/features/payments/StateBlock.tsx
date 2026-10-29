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
  /** Words, or several short paragraphs when one screen has more than one thing to say. */
  description?: ReactNode;
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
      {description ? (
        <div className="flex max-w-xs flex-col gap-2 text-base text-text-muted">
          {typeof description === 'string' ? <p>{description}</p> : description}
        </div>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
