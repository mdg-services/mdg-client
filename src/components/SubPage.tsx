import type { ReactNode } from 'react';

import { OverflowMenu, type AppBarMenuItem } from '@/components/AppBar';
import { PageHeader } from '@/components/kit/PageHeader';
import { cn } from '@/lib/cn';

/**
 * The top bar of every screen that is reached FROM somewhere — My pump and what hangs off it, a
 * service page, the warriors, the bill: the title, and a ← that goes back. Built on the kit's
 * `PageHeader` (spec section 5), with the props it always had.
 *
 * A component of its own rather than a hook in each page, because those pages return early for
 * loading, failed and empty states, and the bar has to be on every one of them — a failed load must
 * still have a way out. As a child component it keeps its place in the tree across those returns,
 * and the pages keep every one of THEIR hooks above their decisions.
 *
 * `fallback` is where ← goes when the screen was opened cold and there is nothing behind it. Left
 * out, the address's own parent decides (`fallbackParentOf` in `useGoBack.ts`): a service page goes
 * to Services, anything under Settings to My pump. `backLabel` names the place, so the arrow says
 * "Back to Today" to a screen reader; without it, "Back".
 */
export function SubPageBar({
  title,
  fallback,
  backLabel,
  menu,
}: {
  title: string;
  fallback?: string;
  backLabel?: string;
  menu?: AppBarMenuItem[];
}) {
  return (
    <PageHeader
      variant="sub"
      title={title}
      back={{ ...(fallback ? { to: fallback } : {}), ...(backLabel ? { label: backLabel } : {}) }}
      {...(menu && menu.length > 0 ? { right: <OverflowMenu items={menu} /> } : {})}
    />
  );
}

/**
 * The bar plus the padded column under it — what each of those screens used to draw as its own
 * root `div`, so a page swaps that `div` for this and keeps its body exactly as it was.
 */
export function SubPage({
  title,
  fallback,
  backLabel,
  menu,
  className,
  children,
}: {
  title: string;
  fallback?: string;
  backLabel?: string;
  menu?: AppBarMenuItem[];
  /** Extra classes for the column (gap, background). The 16px padding is built in. */
  className?: string;
  children: ReactNode;
}) {
  return (
    <>
      <SubPageBar
        title={title}
        {...(fallback ? { fallback } : {})}
        {...(backLabel ? { backLabel } : {})}
        {...(menu ? { menu } : {})}
      />
      <div className={cn('flex flex-1 flex-col p-4', className)}>{children}</div>
    </>
  );
}
