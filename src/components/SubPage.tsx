import type { ReactNode } from 'react';

import { AppBar, type AppBarMenuItem } from '@/components/AppBar';
import { cn } from '@/lib/cn';
import { useGoBack } from '@/lib/useGoBack';

/**
 * The top bar of every screen that is reached FROM somewhere — Settings and
 * what hangs off it, and the five feature pages (services, warriors, density,
 * papers, pump health): the title, and a ← that goes back.
 *
 * A component of its own rather than `AppBar` plus a hook in each page, because
 * those pages return early for loading, failed and empty states, and the bar
 * has to be on every one of them — a failed load must still have a way out. As
 * a child component it keeps its place in the tree across those returns, and
 * the pages keep every one of THEIR hooks above their decisions.
 */
export function SubPageBar({
  title,
  fallback = '/settings',
  menu,
}: {
  title: string;
  /** Where ← goes when the screen was opened cold and there is nothing behind it. */
  fallback?: string;
  menu?: AppBarMenuItem[];
}) {
  const goBack = useGoBack(fallback);
  return <AppBar title={title} onBack={goBack} {...(menu ? { menu } : {})} />;
}

/**
 * The bar plus the padded column under it — what each of those screens used to
 * draw as its own root `div`, so a page swaps that `div` for this and keeps its
 * body exactly as it was.
 */
export function SubPage({
  title,
  fallback,
  menu,
  className,
  children,
}: {
  title: string;
  fallback?: string;
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
        {...(menu ? { menu } : {})}
      />
      <div className={cn('flex flex-1 flex-col p-4', className)}>{children}</div>
    </>
  );
}
