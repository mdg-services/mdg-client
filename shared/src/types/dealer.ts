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

  // Normally captured at step 1 (collect-phone), but optional: a dealer record
  // can be opened before a phone number is known, and the number is then
  // captured through the collect-phone onboarding step.
  phone?: string;
  name?: string;

  // Assigned at step 6 (assign-code)
  code?: string;

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
  phone?: string;
  name?: string;
};
