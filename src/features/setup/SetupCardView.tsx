import { PortalLoginBox } from '@/features/chat/PortalLoginBox';
import type { OutletSetupView, SetupCardKind } from '@dk/shared/types';

import { BillingCard } from './BillingCard';
import { PaymentCard } from './PaymentCard';
import { ServicesCard } from './ServicesCard';
import { StartedCard } from './StartedCard';

/**
 * One card, drawn from an outlet's view: what a chat message carries, and what
 * the strip's sheet opens.
 *
 * Its own file because it is what pulls in all four cards (and the state and
 * GST lists behind the billing one). Every dealer's chat has the strip and a
 * message that MAY carry a card, but only an outlet being set up has any to
 * draw — so `SetupCard` and the strip's sheet load this on first use, and a
 * dealer who is long past setup never downloads it.
 */
export function SetupCardView({ card, view }: { card: SetupCardKind; view: OutletSetupView }) {
  switch (card) {
    case 'services':
      return <ServicesCard view={view} />;
    case 'billing':
      return <BillingCard view={view} />;
    case 'payment':
      return <PaymentCard view={view} />;
    case 'started':
      return <StartedCard />;
    case 'logins':
      return view.loginsNeeded.length > 0 ? <PortalLoginBox portals={view.loginsNeeded} /> : null;
    default:
      return null;
  }
}
