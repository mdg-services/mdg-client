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
  'issue-app-login',
] as const;
export type OnboardingStepId = (typeof ONBOARDING_STEP_IDS)[number];

/** Platforms a push-notification device token can come from. */
export const DEVICE_PLATFORMS = ['ios', 'android', 'web'] as const;
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];

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
  // Kavach Programme (ADR 0006)
  'KAVACH_INITIATE',
  'KAVACH_MARK_DONE',
  'KAVACH_ESCALATE',
  'KAVACH_RESOLVE',
  'KAVACH_ITEM_ADD',
  'KAVACH_ITEM_PAUSE',
  'KAVACH_SOS_FLAG',
  'KAVACH_PROGRAMME_UPDATE',
  // Staff Points (ADR 0007)
  'STAFF_EMPLOYEE_ADD',
  'STAFF_EMPLOYEE_UPDATE',
  'STAFF_POINTS_AWARD',
  'STAFF_POINTS_UNDO',
  'STAFF_POINTS_FINALIZE',
  'STAFF_WORK_LIST_UPDATE',
  'STAFF_WORK_ITEM_CREATE',
  'STAFF_WORK_ITEM_UPDATE',
  'STAFF_WORK_ITEM_DELETE',
  // Auth (ADR 0009 — user-level audit)
  'LOGOUT',
  'LOGIN_FAILED',
  // Admin management
  'ADMIN_CREATE',
  'ADMIN_UPDATE',
  'ADMIN_PASSWORD_RESET',
  // Dealer portal credentials (IRAS)
  'IRAS_CREDENTIALS_SET',
  'IRAS_CREDENTIALS_CLEAR',
  // Service execution log
  'SERVICE_LOGGED',
  // Dealer documents / artifacts (data access & egress)
  'RECORD_VIEWED',
  'ARTIFACT_DOWNLOAD',
  // Conversation / support-ticket lifecycle
  'CONVERSATION_STARTED',
  'CONVERSATION_ASSIGNED',
  'CONVERSATION_REASSIGNED',
  'CONVERSATION_TICKET_UPDATED',
  'CONVERSATION_RESOLVED',
  'CONVERSATION_REOPENED',
  'CONVERSATION_AUTO_UNASSIGNED',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/**
 * Entities an audit row can be scoped to. Kept broad (string) at the type level
 * because the set grows with the domain, but these are the canonical names used
 * so the Activity-log filter can offer a consistent list.
 */
export const AUDIT_ENTITIES = [
  'Dealer',
  'User',
  'Admin',
  'Auth',
  'DealerService',
  'Record',
  'ServiceRun',
] as const;
export type AuditEntity = (typeof AUDIT_ENTITIES)[number];
