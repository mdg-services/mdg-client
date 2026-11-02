/**
 * Calibration subsidy claims (ADR 0029).
 *
 * Once a year an IndianOil outlet's dispensing units are verified and stamped by
 * the state's Legal Metrology office, and the dealer pays the fee. IndianOil pays
 * part of it back: a fixed amount per nozzle, claimed on SDMS under
 * Calibration Claims ▸ New Claim, against the Certificate of Verification and the
 * treasury receipt for the fee, with a signed request letter from the dealer.
 *
 * One claim is one outlet, one financial year. It takes days, not minutes,
 * because it waits on people twice — for the papers (or the Bihar weights and
 * measures login, "eMaaptaul", that lets MDG download them) and for the dealer's
 * signature on the letter — so the claim is a record that moves through
 * {@link CalibrationClaimStage}s, and each visit to a portal is one short service
 * run of the `calibration-claim` plugin.
 *
 * Every date here is an IST calendar date as `YYYY-MM-DD`; every timestamp is an
 * ISO string. Money is whole rupees unless a field says otherwise.
 */

/**
 * Where a claim stands. The order is the order a claim normally moves in.
 *
 *  - `documents`  waiting for the certificate and the receipt
 *  - `review`     papers read, but something needs a person before going on
 *  - `letter`     request letter sent; waiting for the owner's signed copy
 *  - `ready`      signed letter in; waiting for approval, or queued to file
 *  - `filing`     on the IndianOil portal now
 *  - `filed`      saved on the portal, stopped before Finalize
 *  - `finalized`  submitted on the portal; nothing more to do
 *  - `cancelled`  stopped by an admin; nothing was submitted by us after this
 */
export const CALIBRATION_CLAIM_STAGES = [
  'documents',
  'review',
  'letter',
  'ready',
  'filing',
  'filed',
  'finalized',
  'cancelled',
] as const;
export type CalibrationClaimStage = (typeof CALIBRATION_CLAIM_STAGES)[number];

/** Stages from which nothing more will happen. */
export const CALIBRATION_CLAIM_CLOSED_STAGES: readonly CalibrationClaimStage[] = [
  'finalized',
  'cancelled',
];

/**
 * The portal work one run of the plugin does. A run does exactly one of these,
 * chosen by whoever queued it; a "Run now" with none picks the next one the
 * claim needs.
 *
 *  - `wemmis_fetch`   sign in to eMaaptaul, download the certificate + receipt
 *  - `wemmis_reset`   reset the eMaaptaul password with the owner's OTP, then fetch
 *  - `sdms_preflight` read-only look at SDMS: outlet details, units, any claim already there
 *  - `sdms_file`      fill and save the claim on SDMS (and Finalize when approved to)
 *  - `sdms_finalize`  reopen a saved claim from View Claims (RDB) and Finalize it
 */
export const CALIBRATION_CLAIM_ACTIONS = [
  'wemmis_fetch',
  'wemmis_reset',
  'sdms_preflight',
  'sdms_file',
  'sdms_finalize',
] as const;
export type CalibrationClaimAction = (typeof CALIBRATION_CLAIM_ACTIONS)[number];

/** Who supplied a paper. */
export type ClaimDocumentSource = 'wemmis' | 'dealer' | 'admin' | 'generated';

/** The claim's files, by role. */
export const CLAIM_DOCUMENT_SLOTS = [
  'certificate',
  'receipt',
  'letter',
  'signedLetter',
  'signedLetterPdf',
] as const;
export type ClaimDocumentSlot = (typeof CLAIM_DOCUMENT_SLOTS)[number];

/** Slots an admin may upload into by hand. */
export const CLAIM_UPLOAD_SLOTS = ['certificate', 'receipt', 'signedLetter'] as const;
export type ClaimUploadSlot = (typeof CLAIM_UPLOAD_SLOTS)[number];

export interface ClaimDocumentView {
  slot: ClaimDocumentSlot;
  filename: string;
  contentType: string;
  size: number;
  source: ClaimDocumentSource;
  addedAt: string;
}

/** One nozzle row of a dispensing unit on the certificate. */
export interface CertificateNozzle {
  /** As printed: "A1", "B2". */
  label: string;
  /** As printed: "MS", "HSD", "XTRA GREEN". */
  product: string;
  /** As printed: "Verified", "Rejected", "Repairable". */
  status: string;
  verified: boolean;
}

/** One dispensing unit ("DISPENSING PUMP WITH TOTALISER") on the certificate. */
export interface CertificateInstrument {
  /** "Sl No" as printed. The key that matches it to SDMS's "DU Serial No". */
  serialNo: string;
  make: string | null;
  model: string | null;
  /** "Valid Upto Qtr" as printed, e.g. "A/2027". */
  validUptoQuarter: string | null;
  /** The unit's own status column, e.g. "Verified". */
  status: string;
  verified: boolean;
  /** The verification fee charged for this unit, rupees. */
  fee: number | null;
  nozzles: CertificateNozzle[];
}

/** What was read off a Certificate of Verification. */
export interface ParsedCertificate {
  /** "VC No." e.g. V5200012345005 — the certificate number. */
  vcNumber: string;
  districtTraderNo: string | null;
  /** "Trader No." — the eMaaptaul vendor id. */
  traderNo: string | null;
  businessName: string | null;
  natureOfBusiness: string | null;
  /** True when the nature of business is the petrol/diesel pump line. */
  isPetrolPump: boolean;
  /** "on this day DD/MM/YYYY" — the actual calibration date. */
  calibrationDate: string | null;
  /** "Next Verification due on" as printed, e.g. "JANUARY QUARTER/2027". */
  nextVerificationText: string | null;
  /** Last day of that quarter — the "current calibration validity date". */
  validityDate: string | null;
  officerName: string | null;
  inspectorNo: string | null;
  mobile: string | null;
  address: string | null;
  district: string | null;
  state: string | null;
  pin: string | null;
  instruments: CertificateInstrument[];
  /** "Deposited vide T.Receipt/Money receipt Nos." — usually one. */
  receiptNumbers: string[];
  /** The "Dated" beside them. */
  depositDate: string | null;
  grandTotal: number | null;
  /** Lines the reader could not place, in plain words. */
  warnings: string[];
}

/** What was read off the treasury receipt ("RECEIPT BOOK"). */
export interface ParsedReceipt {
  receiptNo: string;
  grnNo: string | null;
  date: string | null;
  amount: number | null;
  traderNo: string | null;
  businessName: string | null;
  proprietorName: string | null;
  /** The signer's designation as printed beside the name (PROPRIETOR, PARTNER, DIRECTOR…). */
  designation: string | null;
  paymentMode: string | null;
  warnings: string[];
}

export type ClaimCheckLevel = 'block' | 'warn' | 'info';

/**
 * One guard rail. A failed `block` stops the claim until it is fixed or an admin
 * acknowledges it; a failed `warn` is shown and asks for a look; `info` is a fact.
 */
export interface ClaimCheck {
  key: string;
  level: ClaimCheckLevel;
  ok: boolean;
  /** Plain words, with the real figures: "12 nozzles × ₹1,500 = ₹18,000, under the ₹20,105 paid". */
  message: string;
  acknowledged?: { byName: string; at: string; note: string } | null;
}

/** One dispensing unit as SDMS lists it under Select DUs. */
export interface PortalDu {
  duNo: string;
  make: string | null;
  model: string | null;
  serialNo: string;
  nozzles: number | null;
  duType: string | null;
  /** "N/A" on the portal is null here. */
  decommissionDate: string | null;
}

/** A row from View Claims (RDB) or Past Claims (SDMS), as text. */
export interface ExistingClaimRow {
  source: 'rdb' | 'sdms';
  cells: string[];
  /** True when the row names this claim's financial year or certificate. */
  matchesThisClaim: boolean;
}

/** One unit in the plan: claimed or not, and why. */
export interface ClaimPlanDu {
  serialNo: string;
  duNo: string | null;
  make: string | null;
  model: string | null;
  nozzles: number;
  nozzleLabels: string[];
  include: boolean;
  /** Why it is in or out, in plain words. */
  reason: string;
}

/** Exactly what will be typed into SDMS. */
export interface ClaimPlan {
  /** "2026-27" */
  financialYear: string;
  /** As SDMS lists it: "April 2026-March 2027". */
  fyLabel: string;
  certificateNo: string;
  validityDate: string;
  receiptNo: string;
  receiptDate: string;
  calibrationDate: string;
  amountPerNozzle: number;
  nozzleCount: number;
  totalAmount: number;
  dus: ClaimPlanDu[];
}

/** Values an admin corrected by hand. Each wins over what was read. */
export interface ClaimOverrides {
  certificateNo?: string;
  validityDate?: string;
  receiptNo?: string;
  receiptDate?: string;
  calibrationDate?: string;
  amountPerNozzle?: number;
  /** Units to leave out, by certificate serial number. */
  excludeSerials?: string[];
}

export const CLAIM_STEP_KEYS = [
  'documents',
  'checks',
  'portal_check',
  'letter',
  'signed_letter',
  'approval',
  'filing',
  'finalize',
] as const;
export type ClaimStepKey = (typeof CLAIM_STEP_KEYS)[number];

export type ClaimStepState = 'pending' | 'running' | 'waiting' | 'blocked' | 'done' | 'skipped';

export interface ClaimStepView {
  key: ClaimStepKey;
  label: string;
  state: ClaimStepState;
  message: string | null;
  at: string | null;
}

export interface ClaimBlocker {
  /** Stable code, for the admin's copy table. */
  code: string;
  /** What happened and what to do, in plain words. */
  message: string;
  at: string;
}

export interface ClaimHistoryEntry {
  at: string;
  actorName: string;
  text: string;
}

export interface CalibrationClaimView {
  id: string;
  dealerId: string;
  dealerCode: string;
  financialYear: string;
  fyLabel: string;
  stage: CalibrationClaimStage;
  blocker: ClaimBlocker | null;
  /** The portal run in flight now, if any. */
  working: { action: CalibrationClaimAction; runId: string | null; since: string } | null;
  /** A portal step waiting to start (the minute loop starts it), if any. Not a live run. */
  queued: { action: CalibrationClaimAction; since: string } | null;
  steps: ClaimStepView[];
  documents: ClaimDocumentView[];
  certificate: ParsedCertificate | null;
  receipt: ParsedReceipt | null;
  portal: {
    checkedAt: string;
    /** SDMS's Vendor Details panel, label → value. */
    vendor: Record<string, string>;
    dealerCodeText: string | null;
    dus: PortalDu[];
    existingClaims: ExistingClaimRow[];
  } | null;
  plan: ClaimPlan | null;
  /**
   * Fingerprint of `plan` as shown. Sent back with Approve, so an approval is
   * refused when the plan changed between the admin's look and the click.
   */
  planHash: string | null;
  checks: ClaimCheck[];
  overrides: ClaimOverrides;
  approval: { byName: string; at: string; finalize: boolean } | null;
  letter: {
    sentAt: string | null;
    askId: string | null;
    /** The DocumentAsk's state: ASKED (owner's turn), SENT (answered), ACCEPTED, REJECTED, … */
    askState: string | null;
    reminders: number;
  };
  filing: {
    savedAt: string | null;
    finalizedAt: string | null;
    /** Whatever reference the portal showed (claim number), verbatim. */
    portalReference: string | null;
    /** True when an admin recorded the outcome by hand. */
    markedByHand: boolean;
  };
  history: ClaimHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

/** The eMaaptaul login MDG holds for an outlet. Never carries the password. */
export interface WemmisLoginStatus {
  status: 'saved' | 'missing' | 'refused';
  username: string | null;
  setAt: string | null;
  setVia: 'admin' | 'dealer' | 'reset' | null;
  /** eMaaptaul vendor ids seen under the login. */
  traderIds: string[];
  /** The one whose certificate is for the petrol/diesel pump. */
  petrolTraderId: string | null;
}

/** A picture code (captcha) the robot could not read, waiting for an admin to type it. */
export interface LiveCaptchaView {
  sessionId: string;
  claimId: string | null;
  imageUrl: string;
  expiresAt: string;
}

/**
 * A picture code waiting for an admin, as every screen of the admin app sees it
 * (`GET /calibration-claim/live`): the pop-up for the admin it is put to, and a
 * banner for everyone else, so a code that has a three-minute limit is not left
 * to whoever happens to have the claim pane open.
 */
export interface LiveCaptchaPrompt extends LiveCaptchaView {
  dealerId: string;
  dealerCode: string | null;
  /** The claim's year ("2026-27") when the sign-in is for a claim. */
  financialYear: string | null;
  /**
   * The admin it is put to first: the last person at MDG who acted on the claim
   * (pressed Run now or Retry, or started it). Null when there is nobody to name,
   * and then it is put to every admin alike.
   */
  askedOf: { id: string; name: string } | null;
}

/** The admin pane's one read. */
export interface CalibrationClaimOverview {
  attached: boolean;
  dealerServiceId: string | null;
  config: { amountPerNozzle: number; autoFinalize: boolean };
  wemmis: WemmisLoginStatus;
  /** Newest first. */
  claims: CalibrationClaimView[];
  liveCaptcha: LiveCaptchaView | null;
  /** Financial years a new claim may be started for, newest first ("2026-27"). */
  startableYears: string[];
}

/** Signed URLs for one of a claim's files. */
export interface ClaimFileUrls {
  viewUrl: string;
  downloadUrl: string;
  filename: string;
  contentType: string;
  expiresIn: number;
}

// ── The dealer's side ─────────────────────────────────────────────────────────

/**
 * Set on an MDG message that asks an owner for the eMaaptaul login. The app
 * draws a small form inside the bubble — user ID and password, or "Forgot
 * password?" which resets it with an OTP sent to the registered mobile. What is
 * typed goes to the outlet's record over its own route and never becomes a
 * message, exactly as the SDMS/IRAS login box (`portalLogin.ts`).
 */
export interface MessageWemmisLogin {
  claimId?: string;
}

/**
 * Where a password reset stands, as the owner's box draws it.
 *
 *  - `starting`    opening the eMaaptaul site; the OTP is not sent yet
 *  - `otp_sent`    the OTP went to the mobile; type it before `expiresAt`
 *  - `checking`    the OTP is being tried
 *  - `wrong_otp`   it did not match; type it again (time permitting)
 *  - `need_captcha` type the letters in the picture as well as the OTP
 *  - `choose_user` several logins share the mobile; pick the pump's
 *  - `resetting`   setting the new password
 *  - `done`        password reset and saved; nothing more to do
 *  - `failed`      stopped; `message` says why, and the box offers to try again
 *  - `expired`     the OTP's time ran out; send a new one
 */
export const WEMMIS_RESET_STATES = [
  'starting',
  'otp_sent',
  'checking',
  'wrong_otp',
  'need_captcha',
  'choose_user',
  'resetting',
  'done',
  'failed',
  'expired',
] as const;
export type WemmisResetState = (typeof WEMMIS_RESET_STATES)[number];

export interface WemmisResetView {
  id: string;
  state: WemmisResetState;
  /** "XXXXXX0102", as the portal itself prints it. */
  mobileMasked: string | null;
  /** When the typed OTP stops being accepted. */
  expiresAt: string | null;
  /** Logins on the mobile, offered when `state === 'choose_user'`. */
  usernames: string[];
  /** Only when `state === 'need_captcha'`. */
  captchaImageUrl: string | null;
  /** Plain words for the box, both languages. */
  message: { en: string; hi: string } | null;
}

/** What the owner's box reads: the saved login, and any reset in progress. */
export interface DealerWemmisLoginView {
  status: 'saved' | 'missing' | 'refused';
  username: string | null;
  canEdit: boolean;
  reset: WemmisResetView | null;
}
