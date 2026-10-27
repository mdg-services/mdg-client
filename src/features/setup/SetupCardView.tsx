import { PortalLoginBox } from '@/features/chat/PortalLoginBox';
import type { OutletSetupView, SetupCardKind } from '@dk/shared/types';

import { BillingCard } from './BillingCard';
import { CompanyCard } from './CompanyCard';
import { PaymentCard } from './PaymentCard';
import { StartedCard } from './StartedCard';

/**
 * One card, drawn from an outlet's view: what a chat message carries, and what
 * the strip's sheet opens.
 *
 * Its own file because it is what pulls in the cards (and the state and
 * GST lists behind the billing one). Every dealer's chat has the strip and a
 * message that MAY carry a card, but only an outlet being set up has any to
 * draw — so `SetupCard` and the strip's sheet load this on first use, and a
 * dealer who is long past setup never downloads it.
 */
export function SetupCardView({ card, view }: { card: SetupCardKind; view: OutletSetupView }) {
  switch (card) {
    case 'company':
      return <CompanyCard view={view} />;
    case 'billing':
      return <BillingCard view={view} />;
    case 'payment':
      return <PaymentCard view={view} />;
    case 'started':
      return <StartedCard />;
    case 'logins':
      return view.loginsNeeded.length > 0 ? <PortalLoginBox portals={view.loginsNeeded} /> : null;
    // `welcome` is only words, and `services` is RETIRED (no choice of services any
    // more): a message from before that still carries it, and it draws nothing.
    default:
      return null;
  }
}
