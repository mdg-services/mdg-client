import { ArrowLeft, MoreVertical } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { useBackToClose } from '@/lib/useBackToClose';

/**
 * The one top bar every screen has — WhatsApp's, because that is the screen a
 * dealer already knows how to read.
 *
 * There is no bottom tab bar any more and no app-wide header above this: each
 * screen draws exactly one bar, with a back arrow when there is somewhere to go
 * back to and a ⋮ menu for whatever does not deserve an icon of its own.
 * Nothing hangs underneath it: what MDG needs from the dealer is asked in the
 * chat itself, on the message that asks.
 *
 * Sticky, `shrink-0`: in a conversation the frame is a fixed height (`--vvh`)
 * and a flex child that is allowed to shrink gets squeezed towards zero.
 */
export interface AppBarMenuItem {
  key: string;
  label: string;
  onSelect: () => void;
  icon?: React.ReactNode;
  danger?: boolean;
}

export interface AppBarProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Shows the ← arrow. Omit on the home screen (the chat list). */
  onBack?: () => void;
  backLabel?: string;
  /** Drawn between the arrow and the title, e.g. a chat's avatar. */
  leading?: React.ReactNode;
  /** Makes the title block (and `leading`) one button — "tap for chat info". */
  onTitleClick?: () => void;
  titleLabel?: string;
  /** Icon buttons drawn before the ⋮ — use `AppBarIconButton`. */
  actions?: React.ReactNode;
  /** The ⋮ overflow menu. Omitted or empty: no ⋮. */
  menu?: AppBarMenuItem[];
  /**
   * `home`: the chat list's bar — the app's name large, in the accent colour,
   * the way WhatsApp prints "WhatsApp" on its first screen.
   */
  variant?: 'default' | 'home';
  className?: string;
}

export function AppBar({
  title,
  subtitle,
  onBack,
  backLabel,
  leading,
  onTitleClick,
  titleLabel,
  actions,
  menu,
  variant = 'default',
  className,
}: AppBarProps) {
  const t = useT();
  const titleBlock = (
    <>
      {leading ? <span className="shrink-0">{leading}</span> : null}
      <span className="flex min-w-0 flex-1 flex-col justify-center">
        <span
          className={cn(
            'truncate leading-tight',
            variant === 'home'
              ? 'text-[22px] font-semibold tracking-tight text-wa-accent-strong'
              : 'text-[17px] font-medium text-wa-bar-text',
          )}
        >
          {title}
        </span>
        {subtitle ? (
          <span className="truncate text-[13px] leading-tight text-wa-meta">
            {subtitle}
          </span>
        ) : null}
      </span>
    </>
  );

  return (
    <div className={cn('sticky top-0 z-30 shrink-0', className)}>
      <div className="border-b border-wa-divider bg-wa-bar">
        <div
          className={cn(
            'mx-auto flex h-14 w-full max-w-md items-center gap-1 md:max-w-2xl lg:max-w-3xl',
            onBack ? 'pl-1 pr-1' : 'pl-4 pr-1',
          )}
        >
          {onBack ? (
            <AppBarIconButton
              label={backLabel ?? t('common.back')}
              onClick={onBack}
              icon={<ArrowLeft width={24} strokeWidth={2} />}
            />
          ) : null}
          {onTitleClick ? (
            <button
              type="button"
              onClick={onTitleClick}
              aria-label={titleLabel}
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg py-1 pr-2 text-left active:bg-wa-row-active"
            >
              {titleBlock}
            </button>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-2.5 py-1 pr-2">
              {titleBlock}
            </div>
          )}
          {actions ? (
            <div className="flex shrink-0 items-center">{actions}</div>
          ) : null}
          {menu && menu.length > 0 ? <OverflowMenu items={menu} /> : null}
        </div>
      </div>
    </div>
  );
}

/** A 40px round icon button in the bar's grey — WhatsApp's header icons. */
export function AppBarIconButton({
  label,
  icon,
  onClick,
  disabled,
  pressed,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      disabled={disabled}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-wa-bar-icon active:bg-wa-row-active disabled:opacity-40"
    >
      {icon}
    </button>
  );
}

/**
 * The ⋮ menu: a white card dropped from the top-right corner, closed by a tap
 * anywhere else or by the phone's Back button — never by navigating away from
 * the screen underneath it.
 */
export function OverflowMenu({
  items,
  label,
}: {
  items: AppBarMenuItem[];
  label?: string;
}) {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  const close = React.useCallback(() => setOpen(false), []);
  useBackToClose(close, open);

  // CLOSE, THEN ACT. The open menu owns one history entry (`useBackToClose`),
  // and closing it any way but Back rewinds that entry with `history.back()` —
  // which is asynchronous. An item that navigated straight away ("Settings")
  // would push its route on top of the menu's entry and leave the rewind
  // nowhere to land, so the dealer would need one extra Back press to get home
  // from Settings, every time. So the item runs once the rewind has landed
  // (its `popstate`), with a short fallback for a WebView that never sends one.
  const select = (item: AppBarMenuItem) => {
    const state = window.history.state as { __dkSheet?: number } | null;
    setOpen(false);
    if (state?.__dkSheet === undefined) {
      item.onSelect();
      return;
    }
    let done = false;
    const run = () => {
      if (done) return;
      done = true;
      window.removeEventListener('popstate', run);
      window.clearTimeout(timer);
      item.onSelect();
    };
    window.addEventListener('popstate', run);
    const timer = window.setTimeout(run, 400);
  };

  return (
    <div className="relative shrink-0">
      <AppBarIconButton
        label={label ?? t('common.moreOptions')}
        onClick={() => setOpen((v) => !v)}
        pressed={open}
        icon={<MoreVertical width={22} strokeWidth={2} />}
      />
      {open ? (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={close}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            role="menu"
            className="absolute right-1 top-1 z-50 min-w-[200px] overflow-hidden rounded-lg bg-wa-bar py-2 shadow-lg animate-in"
          >
            {items.map((item) => (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                onClick={() => select(item)}
                className={cn(
                  'flex w-full items-center gap-3 px-5 py-3 text-left text-[15px] active:bg-wa-row-active',
                  item.danger ? 'text-danger' : 'text-wa-bar-text',
                )}
              >
                {item.icon ? (
                  <span className="shrink-0 text-wa-bar-icon">{item.icon}</span>
                ) : null}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
