import { ONBOARDING_STEP_IDS, type OnboardingStepId } from '../types/enums';

export interface OnboardingStepDefinition {
  id: OnboardingStepId;
  order: number;
  title: string;
  description: string;
  /** Which dealer-doc fields this step's completion writes to. UI-facing hint. */
  fieldsCaptured: readonly string[];
  /** Whether reopen mutates side-effects on the Dealer document. */
  mutating: boolean;
  /** Whether reopen is permitted at all (false = append-only post-commit). */
  reopenable: boolean;
}

export const ONBOARDING_STEPS: readonly OnboardingStepDefinition[] = [
  {
    id: 'collect-phone',
    order: 1,
    title: 'Collect phone number',
    description: 'Capture the dealer’s phone number so the rest of the journey can reach them.',
    fieldsCaptured: ['phone', 'name'],
    mutating: false,
    reopenable: true,
  },
  {
    id: 'send-welcome',
    order: 2,
    title: 'Send welcome message',
    description: 'Send the introductory welcome message and confirm the dealer received it.',
    fieldsCaptured: [],
    mutating: false,
    reopenable: true,
  },
  {
    id: 'send-terms-link',
    order: 3,
    title: 'Send terms & conditions link',
    description: 'Share https://mdgservices.in/ and confirm the dealer has accepted the terms.',
    fieldsCaptured: [],
    mutating: false,
    reopenable: true,
  },
  {
    id: 'send-pdf',
    order: 4,
    title: 'Send onboarding PDF',
    description: 'Send the PDF that explains next steps and asks for the GST number and payment.',
    fieldsCaptured: [],
    mutating: false,
    reopenable: true,
  },
  {
    id: 'receive-payment-and-gst',
    order: 5,
    title: 'Record GST and payment',
    description: 'Capture the GST number the dealer shared and record that payment was received.',
    fieldsCaptured: ['gst', 'paymentNote', 'paymentReceivedAt'],
    mutating: true,
    reopenable: true,
  },
  {
    id: 'assign-code',
    order: 6,
    title: 'Assign dealer code',
    description: 'Generate or confirm a unique dealer code (e.g. E01) for the organisation.',
    fieldsCaptured: ['code'],
    mutating: true,
    reopenable: false,
  },
  {
    id: 'issue-app-login',
    order: 7,
    title: 'Issue app login',
    description:
      'Create the dealer owner’s app login (email + password) and share the credentials so they can sign in to the MDG app.',
    fieldsCaptured: ['portalCredentials'],
    mutating: true,
    reopenable: false,
  },
];

const STEP_BY_ID = new Map<OnboardingStepId, OnboardingStepDefinition>(
  ONBOARDING_STEPS.map((s) => [s.id, s]),
);

export function stepById(id: OnboardingStepId): OnboardingStepDefinition {
  const step = STEP_BY_ID.get(id);
  if (!step) throw new Error(`Unknown onboarding step: ${id}`);
  return step;
}

export function nextStepId(currentId: OnboardingStepId | null): OnboardingStepId | null {
  if (!currentId) return null;
  const idx = ONBOARDING_STEP_IDS.indexOf(currentId);
  if (idx < 0 || idx >= ONBOARDING_STEP_IDS.length - 1) return null;
  return ONBOARDING_STEP_IDS[idx + 1] ?? null;
}

export const TOTAL_STEPS = ONBOARDING_STEPS.length;
