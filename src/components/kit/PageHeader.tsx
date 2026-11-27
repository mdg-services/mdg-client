import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { useGoBack } from '@/lib/useGoBack';
import { useLargeText } from '@/lib/useLargeText';

import { MyPumpButton } from './MyPumpButton';

export interface PageHeaderProps {
  /** `tab`: a door's bar (title and "My pump"). `sub`: a page reached from somewhere (back arrow and title). */
  variant: 'tab' | 'sub';
  /** The screen's name. It wraps; it is never cut off. */
  title: string;
  /** Usually `<AsOf/>`. */
  subtitle?: ReactNode;
  /**
   * Sub-pages only. `label` names where the arrow goes ("Today"), so the arrow's spoken name is
   * "Back to Today". `to` is where it goes when the page was opened cold with nothing behind it;
   * left out, the address's own parent decides (`fallbackParentOf`). With no `label` the arrow says
   * "Back".
   */
  back?: { to?: string; label?: string };
  /** One action on a sub-page; on a door's bar, drawn before "My pump". */
  right?: ReactNode;
  /** A door's bar adds "My pump" by itself; set this where it must not. */
  hidePump?: boolean;
  className?: string;
}

/**
 * The top bar of every screen (spec section 5). Plain, white, one hairline under it, sticky. It is a
 * component of its own so a page can draw it on its loading and failed screens too: a failed load
 * must still have a title and a way out. The arrow and every button on it are at least 44px.
 *
 * At large text (140% or more, `useLargeText`) a door's bar drops its sub-line, stops being pinned, and
 * lets "My pump" WRAP: the title keeps its natural width (it is never squeezed), and "My pump" (and
 * any button of the page) shares the row with it only if both fit; when they do not ("Services",
 * "Namaste, Ramesh ji" at 200%) the buttons drop under the title as their own 44 px row and the title
 * gets the whole width. Before this the title was squeezed to a sliver beside the button and broke in
 * the middle of a word ("Ser/vice/s"), and the button took 70 percent of a 360 px bar (photos). A
 * pinned bar of 100 to 400 px also left a strip of the screen for the page, so at large text the bar
 * scrolls away with the page; the phone's own Back button and the bottom bar stay. A sub-page's bar
 * keeps its arrow beside the title. The bottom bar is the one thing that stays pinned.
 *
 * The side gutter is 16 px on both sides, the same as the cards below it.
 */
export function PageHeader({ variant, title, subtitle, back, right, hidePump, className }: PageHeaderProps) {
  const t = useT();
  const goBack = useGoBack(back?.to);
  const large = useLargeText();
  const isSub = variant === 'sub';
  const showSubtitle = subtitle && !(large && !isSub);
  return (
    <header
      className={cn(
        'z-30 shrink-0 border-b border-border bg-surface',
        // Pinned at normal size only: at large text the bar scrolls away with the page.
        large ? 'relative' : 'sticky top-0',
        className,
      )}
    >
      <div
        className={cn(
          'mx-auto flex w-full max-w-md gap-2 md:max-w-2xl lg:max-w-3xl',
          isSub ? 'pl-2 pr-2' : 'px-4',
          large ? 'min-h-tap flex-wrap items-center gap-y-0 py-1' : 'min-h-14 items-center py-1.5',
        )}
      >
        {isSub ? (
          <button
            type="button"
            onClick={goBack}
            aria-label={back?.label ? t('kit.backTo', { place: back.label }) : t('common.back')}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-text active:bg-surface-2"
          >
            <ArrowLeft aria-hidden className="h-6 w-6" strokeWidth={2} />
          </button>
        ) : null}
        <div
          className={cn(
            // At large text the title's width is its own (`flex-auto`), so a long one takes the whole row
            // and pushes the buttons under it; at normal size it fills what the buttons leave.
            'flex min-w-0 flex-col justify-center',
            large && !isSub ? 'flex-auto' : 'flex-1',
            isSub ? (large ? 'min-h-11 pr-1' : 'py-1 pr-1') : 'py-1',
          )}
        >
          <h1 className={cn('break-words hyphens-none text-text', isSub || large ? 'text-heading' : 'text-title')}>
            {title}
          </h1>
          {showSubtitle ? <div className="break-words text-meta text-text-muted">{subtitle}</div> : null}
        </div>
        {right ? <div className="flex shrink-0 items-center gap-1">{right}</div> : null}
        {!isSub && !hidePump ? <MyPumpButton /> : null}
      </div>
    </header>
  );
}
