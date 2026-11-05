/**
 * DU OTP Acknowledgement (ADR 0033).
 *
 * When a dispensing unit (DU) is opened up — re-calibrated, a pulser repaired, a
 * part replaced — its electronic seal is broken with an OTP, and IndianOil's
 * portal lists the event under ATR ▸ DU OTP Acknowledgement. The dealer must
 * acknowledge each one: tick why it happened, upload the calibration certificate
 * and the DU service report (PDF only), write a remark and give the calibration
 * date. An event left unacknowledged blocks the outlet's supply in SAP ("Pending
 * OTP" on the RO Supply Status screen) — 2E was blocked this way on 2 Nov 2026.
 *
 * MDG reads the list on every water-ingress login (it rides that session, like RO
 * Supply Status), tells the owners and the admins the moment an event appears,
 * collects what the portal needs from the owner step by step inside the chat, and
 * then fills and submits the portal's row for them.
 *
 * WHAT THE PORTAL'S PAGE IS (read live on 2E, 5 Nov 2026): `ioconline/OTP/
 * OTPDealer.jsp`, one table row per event, keyed by a hidden `otpid` (the RO code
 * followed by the event's date-time). Row `i` posts reasons `reason{i}` (any of
 * the four values below, ticked), files `calibration{i}` / `oem{i}` / `other{i}`
 * (PDF only), `remark{i}` and `datepicker_{i}` (dd/mm/yyyy, not after today), and
 * the portal answers "Successfully Submitted." when it took it.
 */

export const DU_OTP_SERVICE_ID = 'du-otp-acknowledgement';

/** The four reasons the portal offers, spelled as the portal's checkbox values. */
export const DU_OTP_REASONS = ['e_calibration', 'Pulsar Repair', 'Replacement', 'Others'] as const;
export type DuOtpReason = (typeof DU_OTP_REASONS)[number];

/**
 * Where one event stands at MDG.
 *
 *  - `pending`    seen on the portal; the owners have been told; nobody has said "do it" yet
 *  - `collecting` the owner said "do it for me" and is giving the inputs
 *  - `ready`      every input is in and the owner pressed Submit; a run will file it
 *  - `submitting` a run is filling the portal's row now
 *  - `submitted`  the portal said "Successfully Submitted." (or the row left the
 *                 list while our submit was in flight)
 *  - `failed`     our submit did not go through; `failure` says why, in plain words
 *  - `gone`       the row left the portal's list without MDG filing it (done at the outlet)
 */
export const DU_OTP_STATES = [
  'pending',
  'collecting',
  'ready',
  'submitting',
  'submitted',
  'failed',
  'gone',
] as const;
export type DuOtpState = (typeof DU_OTP_STATES)[number];

/** States in which an event still needs something done. */
export const DU_OTP_OPEN_STATES: readonly DuOtpState[] = ['pending', 'collecting', 'ready', 'submitting', 'failed'];

/** One row of the portal's OTP Acknowledgement table, as it was read. Text fields are verbatim. */
export interface DuOtpPortalRow {
  /** The hidden `otpid` — the RO code and the event's date-time. The row's identity. */
  otpId: string;
  /** "OTP event id" (also posted back as `event{i}`). */
  eventId: string;
  /** "OTP Transaction date" as printed, e.g. "22-OCT-26". */
  transactionDateText: string;
  /** The same date as YYYY-MM-DD, or null when it did not read. */
  transactionDate: string | null;
  /** "OTP Transaction id", as printed (can hold two ids, comma-separated). */
  transactionIds: string;
  startText: string;
  finishText: string;
  duMake: string;
  duModel: string;
  duSerial: string;
  nozzleNo: string;
  /** "Reason by System" — the DU's own code, e.g. "TIPL Data,14|default 0,2|default 000000". */
  systemReason: string;
  /** "Record Type", e.g. "DUOTP". */
  recordType: string;
  /** "Status", e.g. "New OTP Event". */
  portalStatus: string;
}

/** Where a paper came from. */
export const DU_OTP_FILE_SOURCES = ['dealer', 'admin', 'emaaptaul', 'on_file'] as const;
export type DuOtpFileSource = (typeof DU_OTP_FILE_SOURCES)[number];

/** A paper given for the acknowledgement. Always a PDF by the time it is stored. */
export interface DuOtpFileRef {
  key: string;
  filename: string;
  size: number;
  source: DuOtpFileSource;
  /** A calibration certificate that read: its number and the calibration date printed on it. */
  vcNumber?: string | null;
  /** YYYY-MM-DD. */
  calibrationDate?: string | null;
  at: string;
}

/** A paper as a screen shows it: the reference plus a short-lived link to open it. */
export interface DuOtpFileView extends DuOtpFileRef {
  url: string | null;
}

/** What the portal's row needs, as gathered so far. */
export interface DuOtpInputs {
  reasons: DuOtpReason[];
  certificate: DuOtpFileView | null;
  serviceReport: DuOtpFileView | null;
  other: DuOtpFileView | null;
  /** The owner said there is no other document. */
  otherSkipped: boolean;
  remarks: string | null;
}

/** The step a group is on, in the order the box asks them. `review` = everything is in. */
export const DU_OTP_STEPS = ['reasons', 'certificate', 'serviceReport', 'other', 'remarks', 'review'] as const;
export type DuOtpStep = (typeof DU_OTP_STEPS)[number];

/** One event as a screen shows it. */
export interface DuOtpEntryView extends DuOtpPortalRow {
  id: string;
  state: DuOtpState;
  /** The date the portal's "Calibration Date" will be given: the OTP transaction date. YYYY-MM-DD. */
  calibrationDate: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  submittedAt: string | null;
  /** What the portal said back on our submit, verbatim. */
  portalReply: string | null;
  /** Why the submit failed, in plain words. Only on `failed`. */
  failure: string | null;
}

/**
 * The events of one dispensing unit, answered together. The papers are per DU
 * (one service report covers every nozzle the engineer opened), so the box asks
 * once per group and every event in it is filed with the same answers.
 */
export interface DuOtpGroupView {
  /** Stable id of the group: the DU's serial number (or make + model when there is none). */
  key: string;
  duMake: string;
  duModel: string;
  duSerial: string;
  entries: DuOtpEntryView[];
  inputs: DuOtpInputs;
  /** The step the box should show; null while the owner has not said "do it" (`pending`). */
  step: DuOtpStep | null;
  /** The group's state, the least advanced of its entries' open states. */
  state: DuOtpState;
  /** A remark the box offers to start from, built from the reasons ticked. */
  suggestedRemarks: string;
}

/** The calibration certificate MDG holds for the outlet. */
export interface DuOtpCertificateOnFile {
  vcNumber: string | null;
  calibrationDate: string | null;
  filename: string;
  url: string | null;
  /** Where it came from: an owner's upload, eMaaptaul, or a calibration claim. */
  source: 'dealer' | 'admin' | 'emaaptaul' | 'claim';
}

/** Fetching the certificate from eMaaptaul for the owner. */
export const DU_OTP_FETCH_STATES = ['idle', 'working', 'needs_login', 'failed', 'done'] as const;
export type DuOtpFetchState = (typeof DU_OTP_FETCH_STATES)[number];
export interface DuOtpFetchView {
  state: DuOtpFetchState;
  /** Plain words for the box, when there is something to say. */
  message: string | null;
  at: string | null;
}

/**
 * Everything the owner's box and the admin's pane draw, for one outlet, NOW. The
 * box is posted once and always draws this live view, never what was true when
 * the message was posted.
 */
export interface DuOtpAckView {
  dealerId: string;
  /** Is the service attached and switched on for this outlet. */
  active: boolean;
  /** Open groups (any entry in an open state), oldest event first. */
  groups: DuOtpGroupView[];
  /** Events closed in the last 14 days (submitted or gone), newest first. */
  recent: DuOtpEntryView[];
  certificateOnFile: DuOtpCertificateOnFile | null;
  fetch: DuOtpFetchView;
  /** From the last RO Supply Status read: is supply blocked with "Pending OTP" ticked as a problem. Null = not known. */
  supplyBlockedForOtp: boolean | null;
  /** When the portal's list was last read successfully. */
  lastCheckedAt: string | null;
  /** Why the last read failed, when it did and nothing has read since. */
  lastCheckFailure: string | null;
}

/** One run of the service, as the admin's pane lists it. */
export interface DuOtpRunSummary {
  id: string;
  /** What the run was for. A ride on the water-ingress login is a `check`. */
  action: DuOtpAction;
  trigger: string;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'PENDING' | 'CANCELLED';
  startedAt: string;
  finishedAt: string | null;
  /** Plain words: what it found or did, or why it failed. */
  summary: string | null;
  /** A fill that stopped before Submit on purpose (an admin's test). */
  dryRun: boolean;
}

/** The admin's pane: the owner's view plus the service's recent runs. */
export interface DuOtpAdminView extends DuOtpAckView {
  runs: DuOtpRunSummary[];
  /** Config switch: file a group by itself the moment the owner presses Submit. */
  autoSubmit: boolean;
}

/** On a message: draw the DU OTP box. It reads the outlet's live view; the message carries nothing else. */
export type MessageDuOtpAck = Record<string, never>;

/** The plugin's run actions (`config.action`). */
export const DU_OTP_ACTIONS = ['check', 'submit', 'fetch_certificate'] as const;
export type DuOtpAction = (typeof DU_OTP_ACTIONS)[number];
