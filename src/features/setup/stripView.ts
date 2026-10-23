import type { MessageKey } from '@/lib/i18n';
import type { OutletSetupView, SetupStage, SetupStripStep } from '@dk/shared/types';

/**
 * The small decisions behind the setup strip, kept apart from the drawing so
 * they can be tested without a screen. Deliberately light: the strip is part of
 * the chat's own code, the cards it opens are not.
 */

// ── The strip ──────────────────────────────────────────────────────────────

export const STRIP_LABEL_KEYS: Record<SetupStripStep, MessageKey> = {
  services: 'setup.stepServices',
  billing: 'setup.stepBilling',
  payment: 'setup.stepPayment',
  logins: 'setup.stepLogins',
  start: 'setup.stepStart',
};

/** The steps the dealer does themselves: the only ones a tap opens. `start` is MDG's. */
export const DEALER_STEPS: readonly SetupStripStep[] = ['services', 'billing', 'payment', 'logins'];

/** Whether the strip is drawn at all: only while an outlet is on its way to live. */
export function stripVisible(view: OutletSetupView | undefined): view is OutletSetupView {
  return !!view && view.active && view.stage !== 'live' && view.stage !== 'lost';
}

/** The strip step that is current now, if any. */
export function currentStep(view: OutletSetupView): SetupStripStep | null {
  return view.strip.find((s) => s.state === 'current')?.step ?? null;
}

/**
 * The one line under the strip: what is happening now, and whose move it is.
 * Never about paying — only that a bill exists (the Play rule).
 */
export function stripCaptionKey(view: OutletSetupView): MessageKey | null {
  const stage: SetupStage = view.stage;
  switch (stage) {
    case 'services':
      return 'setup.nowServices';
    case 'billing':
      return 'setup.nowBilling';
    case 'payment':
      return view.payment.state === 'not_sent' ? 'setup.nowBillPrep' : 'setup.nowBillSent';
    case 'logins':
      return 'setup.nowLogins';
    case 'setup':
      return 'setup.nowSetup';
    case 'watch':
      return 'setup.nowWatch';
    default:
      return null;
  }
}
