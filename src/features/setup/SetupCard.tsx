import * as React from 'react';

import type { SetupCardKind } from '@dk/shared/types';

import { CardPending } from './CardParts';
import { LazyCardView } from './LazyCardView';
import { useOutletSetup } from './useOutletSetup';

/**
 * Which card kinds draw something under their words. `welcome` is only words (the
 * intro video is a message of its own) and `logins` is the portal login box,
 * which its message carries separately (`message.portalLogin`) — so neither adds
 * anything here, and a bubble with only those keeps its ordinary shape.
 */
export function setupCardHasBody(card: SetupCardKind): boolean {
  return card === 'services' || card === 'billing' || card === 'payment' || card === 'started';
}

/**
 * The card inside an MDG message (`message.setupCard`).
 *
 * A message cannot be edited, so the card is never what the message said when it
 * was posted: it asks for the outlet's state now (`GET /me/setup`) and draws
 * that. An outlet that is not part of onboarding v2, or is already live, has
 * nothing to show and the message is just its words.
 *
 * Only a card that has a body asks at all, so a chat with a plain welcome in it
 * makes no call — and an outlet with nothing to draw never loads the cards.
 */
export function SetupCard({ card }: { card: SetupCardKind }) {
  if (!setupCardHasBody(card)) return null;
  return <SetupCardBody card={card} />;
}

function SetupCardBody({ card }: { card: SetupCardKind }) {
  const q = useOutletSetup();
  const view = q.data;
  const { refetch } = q;
  const retry = React.useCallback(() => void refetch(), [refetch]);

  if (!view) return <CardPending failed={q.isError} onRetry={retry} />;
  if (!view.active) return null;
  return <LazyCardView card={card} view={view} />;
}
