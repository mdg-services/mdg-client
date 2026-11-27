import type { MessageKey } from '@/lib/i18n';
import type { OutletSetupView, PortalLoginState, SetupStripStep } from '@dk/shared/types';

import { stripVisible } from './stripView';

/**
 * The decisions behind the setup hero on Today (spec 4.9), kept apart from the drawing so they can be
 * tested without a screen.
 */

/** Whether the hero is drawn at all: only while the pump is on its way to live (the verdict card otherwise). */
export function heroShows(view: OutletSetupView | undefined): view is OutletSetupView {
  return stripVisible(view);
}

/** Whose move it is, as the hero says it. `owner` is what a manager reads when it is the dealer's turn. */
export type Turn = 'dealer' | 'owner' | 'mdg' | 'done';

/**
 * `OutletSetupView.waitingOn`, in the reader's own terms: the dealer's turn is "Your turn" for the owner
 * and "Owner's turn" for a manager, who cannot do the step. A server value this app does not know is
 * read as the dealer's turn only while a dealer step is open, otherwise as done.
 */
export function turnOf(view: OutletSetupView): Turn {
  switch (view.waitingOn) {
    case 'dealer':
      return view.canEdit ? 'dealer' : 'owner';
    case 'mdg':
      return 'mdg';
    case 'nobody':
      return 'done';
    default:
      return 'done';
  }
}

export const TURN_WORDS: Record<Turn, MessageKey> = {
  dealer: 'first.setup.turn.dealer',
  owner: 'first.setup.turn.owner',
  mdg: 'first.setup.turn.mdg',
  done: 'first.setup.turn.done',
};

/** The five steps' titles, in words that say what the step is. */
export const STEP_TITLES: Record<SetupStripStep, MessageKey> = {
  company: 'first.setup.step.company',
  billing: 'first.setup.step.billing',
  payment: 'first.setup.step.payment',
  logins: 'first.setup.step.logins',
  start: 'first.setup.step.start',
};

/** One line under a step that is not done yet: what it is for. */
export const STEP_WHY: Record<SetupStripStep, MessageKey> = {
  company: 'first.setup.why.company',
  billing: 'first.setup.why.billing',
  payment: 'first.setup.why.payment',
  logins: 'first.setup.why.logins',
  start: 'first.setup.why.start',
};

/** The form a dealer step opens inside the hero. `start` is MDG's and has none. */
export const STEP_FORM: Partial<Record<SetupStripStep, 'company' | 'billing' | 'payment' | 'logins'>> = {
  company: 'company',
  billing: 'billing',
  payment: 'payment',
  logins: 'logins',
};

/**
 * Is the open step MDG's to do right now? Its own step always is; a dealer step is too while the server
 * says it waits on MDG (the bill not yet sent).
 */
export function mdgIsWorking(view: OutletSetupView, step: SetupStripStep): boolean {
  return !STEP_FORM[step] || view.waitingOn === 'mdg';
}

/** The logins this setup asks for that are saved, in the order the setup lists them. */
export function savedLogins(view: OutletSetupView, portals: readonly PortalLoginState[]): PortalLoginState[] {
  return view.loginsNeeded
    .map((id) => portals.find((p) => p.portal === id))
    .filter((p): p is PortalLoginState => !!p && p.status === 'saved');
}

/** The logins the portal has refused, whatever the setup asked for: a refused login stops a service. */
export function refusedLogins(portals: readonly PortalLoginState[]): PortalLoginState[] {
  return portals.filter((p) => p.status === 'refused');
}
