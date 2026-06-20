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

  // Captured at step 1 (collect-phone)
  phone: string;
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

export type DealerCreateInput = Pick<Dealer, 'phone'> & {
  name?: string;
};
