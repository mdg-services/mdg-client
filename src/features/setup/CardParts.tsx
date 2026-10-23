import * as React from 'react';

import { Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';

/**
 * The pieces every setup card is made of, in the chat bubble's own look (the
 * login box's: a pale inset per block, the bubble's text colours, 44px buttons).
 */

/**
 * The card's outer box. A finger held on a card (to tick, to type, to paste)
 * must not select the message or start a reply swipe, so neither gesture may
 * see a touch here — the login box does the same.
 */
export function CardBox({
  kind,
  children,
  className,
}: {
  kind: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      data-no-swipe
      data-setup-card={kind}
      onPointerDown={(e) => e.stopPropagation()}
      className={cn('mt-1 flex flex-col gap-1.5', className)}
    >
      {children}
    </div>
  );
}

/** A pale inset block inside the bubble. */
export function Block({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-md bg-wa-row-active px-2.5 py-2', className)}>{children}</div>
  );
}

/** The small grey line: a note, a hint, who fills this. */
export function Note({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn('text-[13px] leading-snug text-wa-meta', className)}>{children}</p>
  );
}

/** A red-free, amber-backed notice for a save that did not go through. */
export function Alert({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-md bg-wa-notice px-2.5 py-1.5 text-[13px] leading-snug text-wa-bubble-text"
    >
      {children}
    </p>
  );
}

/** The 44px black button at the foot of a card. */
export function SaveButton({
  busy,
  children,
  disabled,
}: {
  busy: boolean;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={busy || disabled}
      aria-busy={busy}
      className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-wa-accent px-3 text-[15px] font-medium text-white active:opacity-90 disabled:opacity-60"
    >
      {busy ? <Spinner size={16} /> : null}
      {children}
    </button>
  );
}

/** The quiet text button beside a saved answer ("Change"). */
export function LinkButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-11 shrink-0 rounded-md px-2 text-[14px] font-medium text-wa-accent-strong active:bg-black/10"
    >
      {children}
    </button>
  );
}

/** What a card shows while the view is loading, or when it could not be had. */
export function CardPending({
  failed,
  onRetry,
}: {
  failed: boolean;
  onRetry: () => void;
}) {
  const t = useT();
  if (!failed) {
    return (
      <div className="mt-1 flex items-center gap-2 text-wa-meta" role="status">
        <Spinner size={14} />
      </div>
    );
  }
  return (
    <div className="mt-1 flex items-center justify-between gap-2">
      <span className="text-[13px] leading-snug text-wa-meta">{t('setup.loadFailed')}</span>
      <LinkButton onClick={onRetry}>{t('common.retry')}</LinkButton>
    </div>
  );
}
