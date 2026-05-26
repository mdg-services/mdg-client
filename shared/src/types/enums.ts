/**
 * Enum-like string unions used across domain models.
 * Kept as const arrays so they can be reused by Zod and runtime checks.
 */

export const DEALER_STATUSES = ['ONBOARDING', 'ACTIVE', 'SUSPENDED'] as const;
export type DealerStatus = (typeof DEALER_STATUSES)[number];

export const SLA_TIERS = ['BRONZE', 'SILVER', 'GOLD'] as const;
export type SlaTier = (typeof SLA_TIERS)[number];

export const DEALER_SERVICE_STATUSES = ['ACTIVE', 'PAUSED'] as const;
export type DealerServiceStatus = (typeof DEALER_SERVICE_STATUSES)[number];

export const SERVICE_RUN_STATUSES = ['PENDING', 'RUNNING', 'SUCCESS', 'FAILED'] as const;
export type ServiceRunStatus = (typeof SERVICE_RUN_STATUSES)[number];

export const CADENCES = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY', 'ON_DEMAND'] as const;
export type Cadence = (typeof CADENCES)[number];

export const ONBOARDING_STEP_IDS = [
  'collect-phone',
  'send-welcome',
  'send-terms-link',
  'send-pdf',
  'receive-payment-and-gst',
  'assign-code',
  'create-admin-group',
  'create-dealer-group',
] as const;
export type OnboardingStepId = (typeof ONBOARDING_STEP_IDS)[number];

export const ONBOARDING_STEP_STATUSES = ['PENDING', 'DONE'] as const;
export type OnboardingStepStatus = (typeof ONBOARDING_STEP_STATUSES)[number];

export const AUDIT_ACTIONS = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'STATUS_CHANGE',
  'SERVICE_ATTACH',
  'SERVICE_DETACH',
  'SERVICE_RUN',
  'LOGIN',
  'STEP_COMPLETE',
  'STEP_REOPEN',
  'STEP_REOPEN_FORCED',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
