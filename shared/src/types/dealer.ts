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

/**
 * One of the outlet-profile fields the catalog defines, as stored.
 *
 * Deliberately thin: the label, the kind, the order and whether a dealer may be
 * told it all come from `dealer/profile.ts` at read time and are NOT copied on
 * to the record. A stored label is a label that goes stale the day the catalog
 * is corrected, and there is then no way to tell a stale copy from a deliberate
 * override.
 *
 * `expiresOn` is a `YYYY-MM-DD` calendar day, not a timestamp: a licence expires
 * on a date printed on a certificate, and putting that through a timezone is how
 * it expires a day early.
 */
export interface DealerProfileEntry {
  /** A key from `DEALER_PROFILE_FIELDS`. */
  key: string;
  value: string;
  /** Only where the catalog says the field carries one. */
  expiresOn?: string;
}

/**
 * A key/value pair an admin added for one dealer, beyond the catalog.
 *
 * `dealerVisible` defaults to FALSE here and TRUE in the catalog, and the
 * asymmetry is the safety property. The twenty-five catalog fields are the
 * dealer's own registration data, which they filed themselves. A pair an admin
 * types by hand is as likely to be MDG's note about the dealer as it is to be a
 * fact belonging to them, so the machine may not repeat it until somebody says
 * it may.
 */
export interface DealerCustomField {
  /** Slug derived from the label — see `dealerCustomFieldKey`. Stable across renames. */
  key: string;
  label: string;
  value: string;
  expiresOn?: string;
  dealerVisible: boolean;
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

  /**
   * The outlet's own paperwork — the catalog fields in `dealer/profile.ts` that
   * are stored here rather than on a canonical field of their own.
   *
   * GST and PAN are NOT in this array. Their catalog rows read `Dealer.gst` and
   * `Dealer.pan`, which already exist, already validate and already carry a
   * unique index. Read the whole profile through `resolveDealerProfile`, never
   * by walking this array — that function is what joins the two homes back into
   * one answer.
   */
  outletProfile?: DealerProfileEntry[];

  /** Admin-authored key/value pairs beyond the catalog. Capped; see `DEALER_CUSTOM_FIELDS_MAX`. */
  customFields?: DealerCustomField[];

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
