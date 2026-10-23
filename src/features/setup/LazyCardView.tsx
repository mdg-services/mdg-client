import * as React from 'react';

import { useT } from '@/lib/i18n';
import { lazyWithRetry } from '@/lib/lazyWithRetry';
import type { OutletSetupView, SetupCardKind } from '@dk/shared/types';

import { CardPending, LinkButton } from './CardParts';

/**
 * The setup cards, brought down the first time one is needed (`SetupCardView`
 * is what pulls in all four cards and the state and GST lists). Used by a card in
 * a message and by the strip's sheet, so neither makes a dealer who is long past
 * setup download any of it.
 *
 * ITS OWN BOUNDARY, in two senses. A card still downloading must not hand the
 * whole app frame's spinner to the screen, so it suspends here. And a card whose
 * download failed (a 2G link, three tries) must not take the chat down with the
 * app-wide "something didn't load" screen: it says so in place, with a "Try
 * again" that fetches it afresh — a new lazy component per try, because React
 * remembers a failed one for good.
 */
type CardViewModule = { default: React.ComponentType<{ card: SetupCardKind; view: OutletSetupView }> };
const load = (): Promise<CardViewModule> =>
  import('./SetupCardView').then((m) => ({ default: m.SetupCardView }));

class LoadFailed extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function LazyCardView({
  card,
  view,
  loader = load,
}: {
  card: SetupCardKind;
  view: OutletSetupView;
  /** Where the cards come from. Only a test passes one: a download that can fail. */
  loader?: () => Promise<CardViewModule>;
}) {
  const t = useT();
  const [Card, setCard] = React.useState(() => lazyWithRetry(loader));
  const [attempt, setAttempt] = React.useState(0);
  const retry = () => {
    setCard(() => lazyWithRetry(loader));
    setAttempt((n) => n + 1);
  };
  return (
    <LoadFailed
      // A new boundary per try, so the failure it caught is forgotten with it.
      key={attempt}
      fallback={
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="text-[13px] leading-snug text-wa-meta">{t('setup.loadFailed')}</span>
          <LinkButton onClick={retry}>{t('common.retry')}</LinkButton>
        </div>
      }
    >
      <React.Suspense fallback={<CardPending failed={false} onRetry={retry} />}>
        <Card card={card} view={view} />
      </React.Suspense>
    </LoadFailed>
  );
}
