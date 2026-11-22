/**
 * Work permits issued on SDMS ▸ Work Permit ▸ Non-Critical for the dealer (ADR 0053),
 * and the outlet's letterhead kit the Letter of Authorization is printed with.
 *
 * The portal's codes (NW_18, MW_69, status 700…) stay on the record for the admin; the
 * dealer only ever sees plain words: who came, for what, from when to when, the permit
 * number and its PDF.
 */
import type { SomeDealerWords } from './dealerLanguage';

export const WORK_PERMITS_SERVICE_ID = 'work-permits';

/**
 * Where a permit stands.
 *
 *  - `drafting`: MDG is asking the dealer; `confirming`: the summary is shown.
 *  - `issuing`: the dealer said yes; a run is filling and submitting it.
 *  - `issued`: SDMS gave a permit number; the work window is open or ahead.
 *  - `closing` / `extending`: the dealer answered "done" / "more time"; a run is telling SDMS.
 *  - `closed`: closed on SDMS (by MDG, the team or anyone on the portal).
 *  - `extended`: replaced by a newer permit (an extension gives a new number; the new row holds it).
 *  - `lapsed`: the window ended and nobody closed it (SDMS still shows it open).
 *  - `cancelled`: the dealer left it before issuing; `expired`: the yes ran out unissued.
 *  - `not_issued`: SDMS refused it, or a check stopped the press (reason kept).
 *  - `unclear`: Submit was pressed and the answer was lost; settled by a read or a person.
 */
export const WORK_PERMIT_STAGES = [
  'drafting',
  'confirming',
  'issuing',
  'issued',
  'closing',
  'extending',
  'closed',
  'extended',
  'lapsed',
  'cancelled',
  'expired',
  'not_issued',
  'unclear',
] as const;
export type WorkPermitStage = (typeof WORK_PERMIT_STAGES)[number];

export const WORK_PERMIT_FINAL_STAGES: readonly WorkPermitStage[] = [
  'closed',
  'extended',
  'cancelled',
  'expired',
  'not_issued',
];

/** The events a dealer hears about, once each. */
export const WORK_PERMIT_EVENTS = [
  'question',
  'confirm',
  'issued',
  'not_issued',
  'done_ask',
  'closed',
  'extended',
  'failed',
] as const;
export type WorkPermitEvent = (typeof WORK_PERMIT_EVENTS)[number];

/** The marker on a chat message that carries a permit box (the live box is drawn on `liveMessageId` only). */
export interface MessageWorkPermit {
  permitId: string;
  event: WorkPermitEvent;
}

export interface WorkPermitOption {
  id: string;
  label: SomeDealerWords;
  hint?: SomeDealerWords;
}

/**
 * What a question fills: vendor_code | vendor_rep | work | complaint | jsa | work_order |
 * dealer_rep | dealer_rep_extend | rep_name | rep_mobile | rep_dob | rep_gender | rep_email |
 * rep_id_number | letter_way | letterhead_photo | sign_photo | signed_letter_photo | done |
 * more_time.
 */
export interface WorkPermitQuestion {
  id: string;
  field: string;
  prompt: SomeDealerWords;
  options: WorkPermitOption[];
  /** A free answer is accepted: 'date' shows a day picker; 'photo' a camera / gallery button. */
  input?: 'number' | 'text' | 'date' | 'photo' | null;
  /** An option id that swaps in the full list when tapped. */
  moreOptionId?: string;
  /** A small explanatory line under the prompt (e.g. why a photo is needed). */
  help?: SomeDealerWords;
  /** A video that explains this step (the guide video library id). */
  videoId?: string;
}

export type WorkPermitScreen =
  | 'asking'
  | 'looking_up'
  | 'confirm'
  | 'issuing'
  | 'issued'
  | 'done_ask'
  | 'closing'
  | 'done'
  | 'failed'
  | 'cancelled';

export interface WorkPermitDealerView {
  id: string;
  /** "Shubham Engineering — dispenser repair", in plain words. */
  title: SomeDealerWords;
  stage: WorkPermitStage;
  screen: WorkPermitScreen;
  question?: WorkPermitQuestion;
  summary?: Array<{ label: SomeDealerWords; value: SomeDealerWords }>;
  statusLine: SomeDealerWords;
  /** SDMS permit number, once issued. */
  number?: string;
  validFrom?: string;
  validTill?: string;
  /** The permit PDF (signed download through /me/work-permits/:id/pdf). */
  hasPdf: boolean;
  /** The Letter of Authorization MDG made, when there is one (same route, ?doc=letter). */
  hasLetter: boolean;
  canCancel: boolean;
  /** "Kaam ho gaya" / "aur time chahiye" buttons are live. */
  canFinish: boolean;
  liveMessageId?: string;
  updatedAt: string;
}

export interface WorkPermitsMeView {
  permits: WorkPermitDealerView[];
}

// ---------------------------------------------------------------- the letterhead kit

/**
 * How the outlet signs the letters MDG writes for it (owner, 22 Nov 2026):
 *  - `sign_each`: MDG sends the letter, the dealer signs and stamps it and sends a photo back;
 *  - `blank_letterhead`: a photo of a blank sheet of the outlet's printed letterhead; MDG prints onto it;
 *  - `sign_stamp`: a photo of the owner's signature and stamp on a blank page; MDG puts it under the letter.
 */
export const LETTERHEAD_WAYS = ['sign_each', 'blank_letterhead', 'sign_stamp'] as const;
export type LetterheadWay = (typeof LETTERHEAD_WAYS)[number];

export interface LetterheadKitView {
  way: LetterheadWay | null;
  hasBlankLetterhead: boolean;
  hasSignStamp: boolean;
  updatedAt?: string;
}

// ---------------------------------------------------------------- admin

export const WORK_PERMIT_ATTENTION = [
  'unclear_press',
  'refused',
  'form_changed',
  'login_problem',
  'close_failed',
  'rep_update_failed',
  'letter_failed',
  'lookup_failed',
] as const;
export type WorkPermitAttention = (typeof WORK_PERMIT_ATTENTION)[number];

export interface WorkPermitHistoryEntry {
  at: string;
  stage: WorkPermitStage;
  portalStatus?: string;
  note: string;
  by?: 'dealer' | 'robot' | 'admin' | 'portal';
}

export interface WorkPermitAdminRow {
  id: string;
  dealerId: string;
  dealerCode: string;
  dealerName: string;
  stage: WorkPermitStage;
  number?: string;
  portalStatus?: string;
  title: string;
  vendor?: { code: string; name?: string };
  vendorRep?: { id?: string; name: string; mobile?: string };
  dealerRep?: { id?: string; name: string };
  complaint?: { type: string; number?: string; date?: string };
  jsa?: { nature: string; mainWork: string; subWorks: string[] };
  workOrderNumber?: string;
  validFrom?: string;
  validTill?: string;
  /** The values as read back from the form right before Submit (portal labels). */
  readBack?: Record<string, string>;
  hasPdf: boolean;
  hasLetter: boolean;
  raisedBy?: string;
  attention?: WorkPermitAttention;
  attentionDetail?: string;
  history: WorkPermitHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkPermitsAdminList {
  rows: WorkPermitAdminRow[];
  total: number;
  counts: { active: number; attention: number; today: number };
}

export interface WorkPermitsDealerAdminView {
  dealerId: string;
  attached: boolean;
  serviceActive: boolean;
  dealerReps: Array<{ id: string; name: string; mobile?: string; validTill?: string; expired: boolean }>;
  vendors: Array<{ code: string; name?: string; lastUsedAt?: string }>;
  letterhead: LetterheadKitView;
  rows: WorkPermitAdminRow[];
}
