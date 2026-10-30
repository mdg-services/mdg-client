/**
 * Onboarding v2 — one outlet's way from an approved registration to live
 * service (docs/specs/onboarding-v2.md, the plan and its to-do list).
 *
 * THE STAGE IS WORKED OUT, NEVER TICKED
 * -------------------------------------
 * The old seven onboarding steps (`types/onboarding.ts`) were ticks an admin
 * pressed; three of them recorded that something was "sent" when nothing could
 * be. Here every stage is read from a fact that is true or not: the owner has
 * signed in, billing details are saved, a bill was sent, a payment was recorded, the
 * logins the outlet needs are saved. `services/outletSetup/stage.ts` in
 * the backend is the one function that reads them; nothing stores "the current
 * stage" as a field that could disagree with the facts.
 *
 * WHO DOES WHAT
 * -------------
 * The dealer: sign in, confirm billing details, pay (outside the app — see
 * below), type portal logins. MDG: approve the registration, send the bill, record
 * the payment, start the services. Each stage says who it waits on. Any step of
 * the dealer's an admin can also do FOR them (round 3, 24 Oct): the facts then
 * say who did it (`SetupDoneBy`).
 *
 * NO CHOICE OF SERVICES. Every outlet gets the full standard set at the one flat
 * price (D2), so nothing about a choice is asked or stored. The team attaches the
 * services in the Services tab; the logins step asks for both portals
 * (`STANDARD_PORTALS`) except one an admin marked "not needed for this outlet".
 *
 * GOOGLE PLAY AND MONEY
 * ---------------------
 * The Play app may not ask for payment, link to a way of paying or say "pay
 * here" (ADR 0022 §1). So the dealer app shows the bill read-only — amount and
 * due date — and the bill itself, with how to pay, travels on WhatsApp/SMS.
 * Nothing in these types carries payment instructions to the app.
 */

import type { DeviceKind, DeviceSeen } from '../lib/device';

import type { OilCompanyId } from './oilCompany';
import type { PaymentChannel } from './payment';
import type { PortalId } from './portalLogin';

// ── Stages ─────────────────────────────────────────────────────────────────

/**
 * Where an outlet's setup stands — the step that is OPEN now.
 *
 * - `sign_in`   approved, the owner has never signed in
 * - `company`   waiting for the owner to say which oil company the pump is with
 *               (Indian Oil, BPCL, HPCL): it decides which portal logins are asked
 * - `billing`   waiting for the bill name / address / state (GSTIN optional)
 * - `payment`   bill not sent (MDG), sent and unpaid (dealer), or paid
 * - `logins`    a portal login the outlet needs is not saved
 * - `setup`     MDG sets the services up and presses Start services
 * - `watch`     services started; the first days are watched (§5 of the plan)
 * - `live`      done
 * - `lost`      the lead said no, or the team closed it
 */
export const SETUP_STAGES = [
  'sign_in',
  'company',
  'billing',
  'payment',
  'logins',
  'setup',
  'watch',
  'live',
  'lost',
] as const;
export type SetupStage = (typeof SETUP_STAGES)[number];

export const SETUP_WAITING_ON = ['dealer', 'mdg', 'nobody'] as const;
export type SetupWaitingOn = (typeof SETUP_WAITING_ON)[number];

/** The steps on the strip at the top of the owner's chat: four of the dealer's, then "we start". */
export const SETUP_STRIP_STEPS = ['company', 'billing', 'payment', 'logins', 'start'] as const;
export type SetupStripStep = (typeof SETUP_STRIP_STEPS)[number];
export type SetupStripState = 'done' | 'current' | 'todo' | 'skipped';

// ── The services and the portals ───────────────────────────────────────────

/**
 * The ids of the services MDG sells as products. NOT a choice any more: every
 * outlet gets the full set. Kept because the video library tags a video with the
 * service it is about (`service` on a library entry) and checks it against this list.
 */
export const SETUP_SERVICE_IDS = [
  'dsr-report',
  'credit-dod-monitoring',
  'water-ingress-testing',
  'tt-density',
  'load-planner',
  'ro-supply-status',
] as const;
export type SetupServiceId = (typeof SETUP_SERVICE_IDS)[number];

/**
 * The portal logins an INDIAN OIL outlet is asked for, SDMS first. The full standard
 * set needs both. A BPCL or HPCL outlet is asked for its company's portals instead
 * (`COMPANY_PORTALS` in `types/oilCompany.ts`). An admin may mark one "not needed for
 * this outlet" (an outlet with no IRAS automation, say); `setup.portalsNotNeeded`
 * then takes it out of the ask.
 */
export const STANDARD_PORTALS: readonly PortalId[] = ['sdms', 'iras'];

// ── Billing details and the bill ───────────────────────────────────────────

/**
 * Who the bill is made out to. Same four fields as the payments branch's
 * `PaymentBillTo` (ADR 0022 §11), so this feeds it unchanged when it merges.
 */
export interface SetupBilling {
  /** The legal or trade name as it should appear on the invoice. */
  name: string;
  /** One line, as it should appear on the invoice. */
  address: string;
  /** Two-digit GST state code (`GST_STATES`) — the place of supply. From the GSTIN when there is one. */
  stateCode: string;
  /** Null for a dealer who skipped it (not registered for GST, or does not want the credit). */
  gstin: string | null;
}

/**
 * Until the payments branch lands, the bill is recorded here: the team sends it
 * outside the app (WhatsApp/SMS) and records that it went, then records the
 * money when it arrives. After the merge these become Payment rows.
 */
export const SETUP_PAYMENT_STATES = ['not_sent', 'sent', 'paid'] as const;
export type SetupPaymentState = (typeof SETUP_PAYMENT_STATES)[number];

export const SETUP_PAYMENT_MODES = ['upi', 'bank', 'cash', 'cheque', 'other'] as const;
export type SetupPaymentMode = (typeof SETUP_PAYMENT_MODES)[number];

// ── The language of a WhatsApp message ─────────────────────────────────────

/**
 * The two languages a WhatsApp message of the onboarding can be in, one per
 * message — never both. `hi` is Hindi written in English letters (Hinglish: "aapka
 * account taiyaar hai"), `en` is English. The template language code Meta is given
 * stays `hi` for Hinglish and `en` for English. This is ONLY the WhatsApp texts:
 * the app's own screens stay in Devanagari Hindi and English.
 */
export const SETUP_MESSAGE_LANGS = ['hi', 'en'] as const;
export type SetupMessageLang = (typeof SETUP_MESSAGE_LANGS)[number];

/**
 * Where the "your account is ready" WhatsApp stands (`setup.welcomeWhatsApp.state`).
 * `not_sent`: the template could not go and the team has the words to send by hand.
 * `handSent`: a person at MDG says they sent the words themselves. `sent` and
 * `delivered` are Meta's; `failed` is Meta saying it did not arrive.
 */
export const SETUP_WELCOME_STATES = [
  'not_sent',
  'sent',
  'delivered',
  'failed',
  'handSent',
] as const;
export type SetupWelcomeState = (typeof SETUP_WELCOME_STATES)[number];

/**
 * What a try at the welcome WhatsApp came to: it went, or why it could not and the
 * same words for a person to send by hand with a link that opens WhatsApp on them.
 */
export type SetupWelcomeOutcome =
  | { sent: true }
  | {
      sent: false;
      /** Why not, in plain words ("template not approved yet"). */
      reason: string;
      /** The same words, for a person to send by hand. */
      text: string;
      /** A wa.me link that opens WhatsApp with `text` ready to send. */
      waLink: string;
    };

export interface SetupPaymentDealerView {
  state: SetupPaymentState;
  /** What the bill is for, GST included. Null until a bill is sent. */
  amountPaise: number | null;
  /** `YYYY-MM-DD`. */
  dueOn: string | null;
  /** `YYYY-MM-DD`. */
  paidOn: string | null;
  /**
   * The Payment row the bill is (ADR 0022), once it is sent. The app may open
   * that payment's RECEIPT once it is paid (a receipt for something already
   * paid is not a way to pay); never anything that asks for the money.
   */
  paymentId: string | null;
}

// ── What the dealer app reads: GET /me/setup ───────────────────────────────

export interface OutletSetupView {
  /** False for an outlet that predates onboarding v2 or is already live: the app shows nothing. */
  active: boolean;
  stage: SetupStage;
  waitingOn: SetupWaitingOn;
  strip: Array<{ step: SetupStripStep; state: SetupStripState }>;
  /**
   * The oil company the owner chose on the company card. Null until chosen. An outlet
   * that saved its bill details before this step existed reads as `iocl`.
   */
  company: OilCompanyId | null;
  /** Who chose the company: the dealer, or MDG's team for them. Null while none is chosen. */
  companySavedBy: 'dealer' | 'mdg' | null;
  billing: SetupBilling | null;
  /**
   * Who saved the billing details: the dealer, or MDG's team for them (the card says
   * so in a small line). Null while there are none. An outlet saved before round 3
   * reads as the dealer.
   */
  billingSavedBy: 'dealer' | 'mdg' | null;
  /** What the billing card starts from: the registration's name, the outlet's GSTIN. */
  billingPrefill: { name: string | null; stateCode: string | null; gstin: string | null };
  payment: SetupPaymentDealerView;
  /**
   * The portals the logins step asks for: the company's (`COMPANY_PORTALS` — SDMS and
   * IRAS for Indian Oil, the BPCL portal and BROMA/eConnect for BPCL, the HPCL portal
   * for HPCL), minus any an admin marked "not needed for this outlet". Their state is
   * `GET /me/portal-logins`.
   */
  loginsNeeded: PortalId[];
  /** Only an owner may save or type; a manager sees the same cards read-only. */
  canEdit: boolean;
}

/**
 * A chat message that carries one of the setup cards. The card draws from GET /me/setup, never from the message.
 *
 * `services` is RETIRED (round 3, no choice of services any more) and kept only so a
 * message posted before then still parses: the app draws that kind as nothing.
 */
export const SETUP_CARDS = [
  'welcome',
  'services',
  'company',
  'billing',
  'payment',
  'logins',
  'started',
] as const;
export type SetupCardKind = (typeof SETUP_CARDS)[number];

export interface MessageSetupCard {
  card: SetupCardKind;
}

// ── What the admin reads ───────────────────────────────────────────────────

export const SETUP_SOURCES = ['website', 'app', 'admin', 'campaign-auto'] as const;
export type SetupSource = (typeof SETUP_SOURCES)[number];

/** When each fact first became true. Null = not yet. ISO timestamps. */
export interface SetupMilestones {
  approvedAt: string | null;
  firstSignInAt: string | null;
  /** When the oil company was chosen. Null on an outlet that saved its bill details before the step existed. */
  companySavedAt: string | null;
  billingSavedAt: string | null;
  billSentAt: string | null;
  paidAt: string | null;
  loginsDoneAt: string | null;
  servicesStartedAt: string | null;
  watchUntil: string | null;
  liveAt: string | null;
}

/**
 * Who did a step: the dealer, or a person at MDG FOR the dealer (the admin's
 * "do it for them" actions, round 3). A fact written before round 3 has no such
 * trace and reads as the dealer.
 */
export interface SetupDoneBy {
  by: 'dealer' | 'mdg';
  /** The admin's name when `by` is `mdg`. Null for the dealer, and for the logins (the audit log has who typed them). */
  name: string | null;
  /** Only for a sign-in the team marked: the reason they gave ("helped by phone"). Admin-only. */
  reason: string | null;
}

/**
 * Who did each of the dealer's steps, for the milestone rows. A step not done yet is
 * null. `signIn` with `by: 'mdg'` is a STAMP, not a real sign-in: the owner may never
 * have opened the app.
 */
export interface SetupDoneByMap {
  signIn: SetupDoneBy | null;
  company: SetupDoneBy | null;
  billing: SetupDoneBy | null;
  /** `mdg` when ANY needed login that is saved was typed by the team. Null while none is saved. */
  logins: SetupDoneBy | null;
}

/** A portal the team said this outlet does not need, so the logins step does not ask for it. */
export interface SetupPortalNotNeeded {
  portal: PortalId;
  /** Why, in the admin's words. Admin-only. */
  reason: string;
  byName: string | null;
  /** ISO. */
  at: string;
}

/** The welcome WhatsApp, as the admin sees it. `state` is null before anything was tried. */
export interface SetupWelcomeAdminView {
  state: SetupWelcomeState | null;
  /** ISO: when that state was recorded. */
  at: string | null;
}

export interface SetupPaymentAdminView extends SetupPaymentDealerView {
  mode: SetupPaymentMode | null;
  reference: string | null;
  recordedByName: string | null;
  /** The payment's own number (`MDG-2026-00012`) and its Razorpay link, when one was made. */
  paymentNumber: string | null;
  linkUrl: string | null;
  /** How it was paid: Razorpay pop-up, Razorpay link, recorded by hand, or taken by autopay. */
  paidVia: PaymentChannel | null;
}

// ── Reminders and calls (plan §4) ──────────────────────────────────────────

export const SETUP_CALL_OUTCOMES = [
  'answered',
  'no_answer',
  'call_later',
  'not_interested',
] as const;
export type SetupCallOutcome = (typeof SETUP_CALL_OUTCOMES)[number];

/** A call a team member made to a registration or a new outlet, and what came of it. */
export interface SetupCall {
  at: string;
  byName: string;
  outcome: SetupCallOutcome;
  /** One line: "will pay on Monday", "asked us to call his son". */
  note: string | null;
  /** `YYYY-MM-DD`, for `call_later`: the reminders stay quiet until then. */
  nextCallOn: string | null;
}

/** Where the reminder ladder stands for an outlet waiting on its dealer. */
export interface SetupReminderState {
  /** Reminders sent to the dealer for the current stage (at most 3). */
  sent: number;
  lastSentAt: string | null;
  /** When the next one is due, if one is. */
  nextAt: string | null;
}

// ── The setup checklist and the watch (plan §5) ────────────────────────────

export const SETUP_CHECKLIST_KEYS = [
  'logins_working',
  'files_received',
  'services_attached',
  'kavach_started',
  'first_run_ok',
] as const;
export type SetupChecklistKey = (typeof SETUP_CHECKLIST_KEYS)[number];

/** One line of the "ready to start?" checklist the team sees before Start services. */
export interface SetupChecklistItem {
  key: SetupChecklistKey;
  state: 'done' | 'missing' | 'not_needed';
  /** Plain words: "IRAS login not checked yet", "DSR: the two Excel files". */
  detail: string | null;
}

/** What the portal said the last time a saved login was tried (one queued try, never retried on a refusal). */
export interface PortalLoginCheck {
  portal: PortalId;
  result: 'ok' | 'refused' | 'could_not_check' | 'pending';
  at: string | null;
}

// ── The subscription after the first bill (plan phase 9) ───────────────────

export interface SetupSubscriptionView {
  /** `YYYY-MM-DD`: service is paid up to and including this day. */
  paidThrough: string | null;
  /** `YYYY-MM-DD`: when the next month's bill will be raised. */
  nextBillOn: string | null;
  /** A raised bill is past its due date. */
  overdue: boolean;
  /** Services paused by a person for non-payment (not an archive: the dealer still signs in and sees the bill). */
  billingHold: { at: string; byName: string; reason: string } | null;
  /**
   * Billing ended for this outlet: its first month was given back, so no further
   * bill is raised until a super-admin bills it again. Null while billing is on.
   */
  billingEnded: { at: string; reason: string } | null;
}

/**
 * Where a registration was filled in: the website's form or the one inside the
 * Dealer Kavach app, and on what device. Shown on the Onboarding page as "App ·
 * Android" (owner's request, 30 Oct 2026).
 */
export interface SignupOrigin {
  via: 'website' | 'app';
  /** Null for a registration from before 30 Oct 2026, when the device was not recorded. */
  device: DeviceSeen | null;
}

/** The owner's most recent sign-in: which device they use Dealer Kavach on. */
export interface LastSignIn {
  /** Null when that sign-in's browser signature could not be read. */
  device: DeviceSeen | null;
  at: string;
}

/** Registrations over the last 90 days, by form and by device: what the Onboarding page counts on top. */
export interface SignupMix {
  via: { app: number; website: number };
  /** `unknown`: registrations from before the device was recorded. */
  device: Record<DeviceKind | 'unknown', number>;
}

export interface OutletSetupAdmin {
  dealerId: string;
  code: string;
  /** The registration it came from. Null only for an outlet older than onboarding v2. */
  enrolmentId: string | null;
  source: SetupSource;
  /** The registration's form and device; null for an outlet added by hand. */
  origin: SignupOrigin | null;
  /** Null until an owner has signed in. */
  lastSignIn: LastSignIn | null;
  ownerName: string | null;
  mobile: string | null;
  stage: SetupStage;
  waitingOn: SetupWaitingOn;
  /** When the current stage opened. */
  stageSince: string;
  milestones: SetupMilestones;
  /** Who did sign-in, company, billing and logins: the dealer, or the team for them. */
  doneBy: SetupDoneByMap;
  /** The oil company: chosen on the card, `iocl` for an outlet from before the step, null while not chosen. */
  company: OilCompanyId | null;
  billing: SetupBilling | null;
  payment: SetupPaymentAdminView;
  /** The company's portals minus the ones in `portalsNotNeeded`. */
  loginsNeeded: PortalId[];
  /** Portals an admin marked "not needed for this outlet" (undoable until the services start). */
  portalsNotNeeded: SetupPortalNotNeeded[];
  /** The "your account is ready" WhatsApp: whether it went, failed, or was sent by hand. */
  welcome: SetupWelcomeAdminView;
  approvedByName: string | null;
  lost: { at: string; byName: string; reason: string } | null;
  /** Newest first. */
  calls: SetupCall[];
  reminders: SetupReminderState;
  /** Before Start services: what is in and what is missing. */
  checklist: SetupChecklistItem[];
  loginChecks: PortalLoginCheck[];
  /** Messages held for a person while the outlet is watched. */
  heldCount: number;
  /** Somebody replied NO to the account-ready WhatsApp. */
  notMe: { at: string } | null;
  /** After the first bill: renewals, overdue, pause. */
  subscription: SetupSubscriptionView;
  /** The team member handling this onboarding (the approver), who gets its pushes. */
  handlerName: string | null;
  /**
   * The language the outlet's WhatsApp messages start in (the admin may pick the
   * other when sending): the owner's app language, else the language they last
   * wrote to us in, else the registration form's, else Hinglish.
   */
  messageLang: SetupMessageLang;
}

/** One row of the admin Onboarding page: a registration waiting for approval, or an outlet on its way. */
export type OnboardingBoardRow =
  | {
      kind: 'registration';
      /** The registration, as `types/websiteIntake.ts` shapes it. */
      registrationId: string;
      name: string;
      mobile: string;
      sapCode: string;
      siteType: string;
      pumpName: string | null;
      submittedAt: string;
      /** NEW / CONTACTED on the Open tab; LOST on the Lost tab. */
      state: 'NEW' | 'CONTACTED' | 'LOST';
      /** Why it was closed, for a LOST row. */
      lostReason: string | null;
      /** Our campaigns messaged this number. */
      fromCampaign: boolean;
      /** The phone or SAP code already belongs to a live outlet. */
      alreadyClient: { dealerId: string; code: string } | null;
      waitingOn: 'mdg' | 'nobody';
      /** The last call logged for this registration. */
      lastCall: SetupCall | null;
      /** The language the welcome starts in: what they last wrote to us in, else the form's, else Hinglish. */
      messageLang: SetupMessageLang;
      /** The website's form or the app's, and the device. */
      origin: SignupOrigin;
    }
  | { kind: 'outlet'; outlet: OutletSetupAdmin };

export type OnboardingBoardView = 'open' | 'live' | 'lost';

/**
 * "Forgot password" from the sign-in screen. There is no code to prove the
 * phone (owner's decision D4), so the team calls the registered number and sets
 * a temporary password from the outlet's Members tab. Listed on the Onboarding
 * page until a person marks it done.
 */
export interface PasswordHelpRow {
  id: string;
  /** What they typed: a mobile number or an email. */
  identifier: string;
  /** The account it matched, when exactly one did. */
  match: { userId: string; name: string; dealerId: string | null; code: string | null } | null;
  requestedAt: string;
}

export interface OnboardingBoard {
  rows: OnboardingBoardRow[];
  /** Open "forgot password" requests, oldest first. */
  passwordHelp: PasswordHelpRow[];
  /** Counts over the last 90 days, for the funnel at the top of the page. */
  funnel: { registered: number; approved: number; signedIn: number; paid: number; live: number };
  /** The same 90 days' registrations by form and by device. Absent from a backend older than 30 Oct 2026. */
  signups?: SignupMix;
}

/** The owner a registration may be added to as another outlet (one person, several pumps). */
export interface LinkOwner {
  /** The login to link to (the person's most recently used live one): what Approve is sent. */
  userId: string;
  name: string;
  /** That login's outlet. */
  dealerId: string;
  code: string;
  /** Every live outlet of the person, in code order. */
  codes: string[];
}

/** `GET /admin/registrations/:id/link-option`. */
export interface RegistrationLinkOption {
  owner: LinkOwner | null;
  /** In plain words, when `owner` is null. */
  reason: string | null;
}

/** What Approve returns: the new outlet, and whether the WhatsApp welcome went. */
export interface ApproveRegistrationResult {
  dealerId: string;
  code: string;
  /** The language the welcome is in: what the approver chose, else the default for this person. */
  messageLang: SetupMessageLang;
  /**
   * Only when the registration carried no password (a form from before
   * onboarding v2): a temporary one, shown to the approver ONCE to pass on.
   * The owner must change it at first sign-in. Null when they chose their own.
   */
  tempPassword: string | null;
  welcome: SetupWelcomeOutcome;
}

/** What "Send welcome on WhatsApp" returns: the fresh setup beside what the try came to. */
export interface SendSetupWelcomeResult {
  setup: OutletSetupAdmin;
  /** The language the message was written in. */
  messageLang: SetupMessageLang;
  welcome: SetupWelcomeOutcome;
}
