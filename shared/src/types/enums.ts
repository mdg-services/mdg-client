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
  // ADR 0011 — admin- and automation-verified compliance.
  /** An admin certified a task, with (or explicitly without) the required evidence. */
  'KAVACH_ADMIN_VERIFY',
  /** A portal/vault signal certified a task; the row names the proving artifact. */
  'KAVACH_AUTOMATION_MARK',
  'KAVACH_EVIDENCE_REQUEST',
  'KAVACH_EVIDENCE_SUBMIT',
  'KAVACH_EVIDENCE_REJECT',
  /** Global catalog edits — these move every dealer's score, so they are audited hard. */
  'KAVACH_CATALOG_CREATE',
  'KAVACH_CATALOG_UPDATE',
  'KAVACH_CATALOG_DELETE',
  /** A dealer's overlay (hidden tasks, custom tasks, per-dealer overrides). */
  'KAVACH_WORK_LIST_UPDATE',
  'KAVACH_DIGEST_SHARE',
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
  'STAFF_LEAVE_SET',
  'STAFF_LEAVE_CLEAR',
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
  'IRAS_CREDENTIALS_REVEAL',
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
  // IndianOil SDMS — Credit & DOD Monitoring
  'SDMS_CREDENTIALS_SET',
  'SDMS_CREDENTIALS_CLEAR',
  'SDMS_CREDENTIALS_REVEAL',
  'CREDIT_DOD_SHARE',
  // IndianOil SDMS — Inspection Reports aggregation
  'INSPECTION_REPORTS_COLLECT',
  // Daily Sales Report — admin-approved share of the cards with the dealer
  'DSR_SHARE',
  // Daily Sales Report — hand-entered receipt. Superseded by IRAS_DATA_EDIT
  // below; kept because audit entries written before that change still name it.
  'DSR_RECEIPT_SET',
  'DSR_RECEIPT_CLEAR',
  // IRAS shift data — hand corrections to collected portal figures. One entry
  // per commit, not per cell, so the log reads as a list of decisions.
  'IRAS_DATA_EDIT',
  'IRAS_DATA_REVERT',
  // IRAS shift data — a named admin accepting a day whose figures do not add
  // up, and withdrawing that acceptance. The entry carries the litre figures
  // signed for, because the verification row itself holds only the current
  // answer and a superseded signature is exactly what an auditor asks about.
  'IRAS_DAY_VERIFY',
  'IRAS_DAY_UNVERIFY',
  // File egress + staff draft
  'ATTACHMENT_DOWNLOAD',
  'STAFF_DRAFT_CLEAR',
  // Bank / national holiday calendar (drives DOD due-date roll-forward)
  'BANK_HOLIDAY_CONFIRM',
  // Dealer lifecycle (super-admin soft delete)
  'DEALER_ARCHIVE',
  'DEALER_RESTORE',
  // Festival greeting band on dealer-facing report images
  'FESTIVAL_UPDATE',
  // Landing-page assistant (ADR 0009)
  'ASSIST_BLOCK',
  'ASSIST_UNBLOCK',
  'ASSIST_FOLLOWUP_UPDATE',
  'ASSIST_KB_RELOAD',
  // TT Density (ADR 0010) — file egress and the register-day mark. The two VIEW
  // rows are what make an invoice PDF read and a register photo read auditable;
  // UPLOAD records who marked the day, which matters because an account manager
  // may mark it on the dealer's behalf.
  'TT_INVOICE_PDF_VIEW',
  'TT_REGISTER_PHOTO_VIEW',
  'TT_REGISTER_PHOTO_UPLOAD',
  // Document Ask — "this dealer owes this paper for this period". Every one of
  // these is written from inside `services/documents/transition.ts`, the single
  // writer of an ask's state, so no state change can reach the database without
  // one. They are listed HERE, canonically, because an action name that is only
  // ever a string literal at a call site compiles perfectly and then cannot be
  // filtered for on the admin Activity page — the row exists and nobody can find
  // it. (Two actions already ship in production having skipped this list; do not
  // add a third.)
  /** The row was made: MDG asked, or the dealer sent something unprompted. */
  'DOCUMENT_ASK_CREATE',
  /** We asked again. A nudge moves `askedCount`, never the state. */
  'DOCUMENT_ASK_NUDGE',
  /** The dealer sent the paper. */
  'DOCUMENT_ASK_SUBMIT',
  /** A named person at MDG looked at it and it is good. */
  'DOCUMENT_ASK_ACCEPT',
  /**
   * A machine signal settled it and NOBODY looked — today only the TT Density
   * register day log. Kept apart from `DOCUMENT_ASK_ACCEPT` on purpose: the
   * Activity page must be able to tell an acceptance a person made from one an
   * automation made, which is the same distinction `reviewedByKind` draws on the
   * row and the dealer's card draws in words (ADR 0011).
   */
  'DOCUMENT_ASK_AUTO_ACCEPT',
  /** Looked at, and it will not do. The row carries the reason shown to the dealer. */
  'DOCUMENT_ASK_REJECT',
  /** MDG no longer needs it. Closed with no fault on anyone. */
  'DOCUMENT_ASK_WITHDRAW',
  /** The period went by unanswered and the ask was closed unsatisfied. */
  'DOCUMENT_ASK_EXPIRE',
  /** File egress: somebody opened the paper. Same posture as the two TT VIEW rows. */
  'DOCUMENT_ASK_FILE_VIEW',
  /**
   * The bytes behind a submission are NOT the bytes we recorded — the stored
   * ETag and the bucket's current one disagree.
   *
   * Its own action rather than a flag on `DOCUMENT_ASK_FILE_VIEW`, because a
   * presigned PUT URL is reusable until it expires, so this is the one row that
   * says a paper was replaced after MDG looked at it. It has to be findable on
   * the Activity page by itself; buried as a field inside a view row it would be
   * discoverable only by somebody who already suspected it.
   */
  'DOCUMENT_ASK_FILE_MISMATCH',
  /** Catalog edits — these change what every dealer can be asked for. */
  'DOCUMENT_KIND_CREATE',
  'DOCUMENT_KIND_UPDATE',
  // AI first line on dealer support. Listed here for the same reason the
  // DOCUMENT_ASK_* block above spells out: an action name that only ever exists
  // as a string literal at a call site compiles perfectly and then cannot be
  // filtered for on the Activity page — the row is written, and nobody can find
  // it. Two actions already ship in production having skipped this list.
  /** The machine answered a dealer. The row names the turn, the intent and the template. */
  'AI_FIRSTLINE_ANSWER',
  /** The machine stood down and left the thread for a person. The row names the reason. */
  'AI_FIRSTLINE_HANDOFF',
  /** The machine re-sent something MDG had already sent. Egress, so audited like one. */
  'AI_FIRSTLINE_RESHARE',
  /**
   * An admin judged one turn right or wrong. Audited because these verdicts are
   * what trips the breaker, so "who decided the machine was lying" has to be a
   * question with an answer.
   */
  'AI_FIRSTLINE_REVIEW',
  /** The global kill switch moved. Before/after carry which way. */
  'AI_FIRSTLINE_KILL_SWITCH',
  /** One dealer was moved between OFF, SHADOW and ON. */
  'AI_FIRSTLINE_MODE_SET',
  /** An admin asked for this outlet's supply-block state to be re-read now. */
  'RO_SUPPLY_STATUS_COLLECT',
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
  'StaffWorkItem',
  'Conversation',
  'BankHoliday',
  'InspectionReport',
  'FestivalSetting',
  'AssistSession',
  'AssistBlock',
  'AssistKnowledgeBase',
  'TtInvoice',
  'TtDensityDayLog',
  'DocumentAsk',
  'DocumentKind',
  /** One turn of the AI first line — what a review row is written against. */
  'AiTurn',
  /** Whether the portal is currently blocking supply to an outlet. */
  'RoSupplyStatus',
] as const;
export type AuditEntity = (typeof AUDIT_ENTITIES)[number];

/**
 * Where a bank/national holiday row came from: `library` = suggested by the
 * date-holidays calendar; `manual` = added by an admin (e.g. a state bank holiday
 * the national calendar doesn't carry).
 */
export const BANK_HOLIDAY_SOURCES = ['library', 'manual'] as const;
export type BankHolidaySource = (typeof BANK_HOLIDAY_SOURCES)[number];
