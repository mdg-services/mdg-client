import type { DealerStatus, OnboardingStepId, OnboardingStepStatus, SlaTier } from './enums';

export interface OwnerContact {
  name: string;
  phone: string;
  email: string;
}

export interface PumpLocation {
  address: string;
  city?: string;
  state?: string;
  pincode?: string;
  lat: number;
  lng: number;
}

export interface BankDetails {
  accountHolder: string;
  accountNumber: string;
  ifsc: string;
  bankName: string;
  branch?: string;
}

export interface ComplianceDoc {
  label: string;
  url: string;
}

export interface DealerAuditEntry {
  at: string;
  actorId: string;
  action: string;
  note?: string;
}

export interface DealerPortalCredentials {
  username: string;
  setAt: string;
  issuedBy: string;
  mustChangeOnFirstLogin: boolean;
}

export interface OnboardingStepEntry {
  id: OnboardingStepId;
  status: OnboardingStepStatus;
  completedAt?: string;
  completedBy?: string;
  data?: Record<string, unknown>;
  note?: string;
}

export interface DealerOnboarding {
  currentStepId: OnboardingStepId | null;
  completedStepCount: number;
  steps: OnboardingStepEntry[];
}

export interface Dealer {
  id: string;

  /**
   * The dealer's code, e.g. `15E` — the ONLY thing that identifies a dealer.
   *
   * Captured at creation and required from then on, because a dealer with no
   * code cannot be told apart from any other in a list, a picker, a report
   * header or a conversation. Deliberately not a name: an outlet's trading name
   * is long, duplicated between neighbouring pumps, and (unlike the code) not
   * something either side quotes when talking about a site.
   *
   * Unique among live dealers only — archiving a dealer vacates its code so the
   * number can be reissued.
   */
  code: string;

  // Normally captured at step 1 (collect-phone), but optional: a dealer record
  // can be opened before a phone number is known, and the number is then
  // captured through the collect-phone onboarding step.
  phone?: string;

  // Optional / collected over the journey or via ad-hoc PATCH
  ownerContact?: OwnerContact;
  pumpLocation?: PumpLocation;
  gst?: string;
  pan?: string;
  onboardingDate: string;
  status: DealerStatus;

  /**
   * Set (ISO timestamp) when a super-admin archives (soft-deletes) the dealer:
   * status flips to SUSPENDED, attached services are paused, members can no
   * longer sign in and the dealer drops out of every roster and counter — but
   * the record and its history are retained and it is reversible via restore.
   * Null/absent for a live dealer.
   */
  archivedAt?: string | null;

  // Step 5
  paymentNote?: string;
  paymentReceivedAt?: string;

  // Step 7 (portal creds: never includes hash in serialized form)
  portalCredentials?: DealerPortalCredentials;

  // Optional business data, no longer gating ACTIVE
  bankDetails?: BankDetails;
  complianceDocs?: ComplianceDoc[];
  slaTier?: SlaTier;

  onboarding: DealerOnboarding;
  audit: DealerAuditEntry[];
  createdAt: string;
  updatedAt: string;
}

export type DealerCreateInput = {
  code: string;
  phone?: string;
};
