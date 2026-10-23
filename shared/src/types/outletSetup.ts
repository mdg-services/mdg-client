/**
 * Onboarding v2 — one outlet's way from an approved registration to live
 * service (docs/specs/onboarding-v2.md, the plan and its to-do list).
 *
 * THE STAGE IS WORKED OUT, NEVER TICKED
 * -------------------------------------
 * The old seven onboarding steps (`types/onboarding.ts`) were ticks an admin
 * pressed; three of them recorded that something was "sent" when nothing could
 * be. Here every stage is read from a fact that is true or not: the owner has
 * signed in, services are chosen, a bill was sent, a payment was recorded, the
 * logins the chosen services need are saved. `services/outletSetup/stage.ts` in
 * the backend is the one function that reads them; nothing stores "the current
 * stage" as a field that could disagree with the facts.
 *
 * WHO DOES WHAT
 * -------------
 * The dealer: sign in, tick services, confirm billing details, pay (outside the
 * app — see below), type portal logins. MDG: approve the registration, send the
 * bill, record the payment, start the services. Each stage says who it waits on.
 *
 * GOOGLE PLAY AND MONEY
 * ---------------------
 * The Play app may not ask for payment, link to a way of paying or say "pay
 * here" (ADR 0022 §1). So the dealer app shows the bill read-only — amount and
 * due date — and the bill itself, with how to pay, travels on WhatsApp/SMS.
 * Nothing in these types carries payment instructions to the app.
 */

import type { PortalId } from './portalLogin';

// ── Stages ─────────────────────────────────────────────────────────────────

/**
 * Where an outlet's setup stands — the step that is OPEN now.
 *
 * - `sign_in`   approved, the owner has never signed in
 * - `services`  waiting for the owner to tick services
 * - `billing`   waiting for the bill name / address / state (GSTIN optional)
 * - `payment`   bill not sent (MDG), sent and unpaid (dealer), or paid
 * - `logins`    the portals the chosen services need are not all saved
 * - `setup`     MDG sets the services up and presses Start services
 * - `watch`     services started; the first days are watched (§5 of the plan)
 * - `live`      done
 * - `lost`      the lead said no, or the team closed it
 */
export const SETUP_STAGES = [
  'sign_in',
  'services',
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

/** The four steps on the strip at the top of the owner's chat, plus the last one. */
export const SETUP_STRIP_STEPS = ['services', 'billing', 'payment', 'logins', 'start'] as const;
export type SetupStripStep = (typeof SETUP_STRIP_STEPS)[number];
export type SetupStripState = 'done' | 'current' | 'todo' | 'skipped';

// ── The services card ──────────────────────────────────────────────────────

/**
 * The services a dealer can tick. Everything else MDG runs is either brought
 * along by one of these (shift readings and inspection reports come with the
 * daily sales report) or is not a product (`custom-request`).
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

export interface SetupServiceOption {
  id: SetupServiceId;
  /**
   * Other choices that must be ticked with this one; the card ticks them too
   * and says why. The same rule the attach route enforces (`dependsOn`).
   */
  requires: SetupServiceId[];
  /** Plugins attached with it during setup, never offered on their own. */
  bringsAlong: string[];
  /** Portal logins this choice's work needs (its own and what it brings along). */
  portals: PortalId[];
}

/**
 * The card's rows, in the order shown. Names come from `SERVICE_LABELS` and the
 * one-line description from `SERVICE_ABOUT` (`lib/serviceLabel.ts`), so a
 * service is called and described one way everywhere.
 */
export const SETUP_SERVICE_OPTIONS: readonly SetupServiceOption[] = [
  {
    id: 'dsr-report',
    requires: [],
    bringsAlong: ['iras-shift-data', 'inspection-reports'],
    portals: ['iras', 'sdms'],
  },
  { id: 'credit-dod-monitoring', requires: [], bringsAlong: [], portals: ['sdms'] },
  { id: 'water-ingress-testing', requires: [], bringsAlong: [], portals: ['sdms'] },
  { id: 'tt-density', requires: [], bringsAlong: [], portals: ['sdms'] },
  { id: 'load-planner', requires: ['dsr-report'], bringsAlong: [], portals: [] },
  {
    id: 'ro-supply-status',
    requires: ['water-ingress-testing'],
    bringsAlong: [],
    portals: ['sdms'],
  },
];

/** The chosen ids plus everything they require, in card order. */
export function withRequiredServices(ids: readonly string[]): SetupServiceId[] {
  const want = new Set<SetupServiceId>();
  const add = (id: SetupServiceId): void => {
    if (want.has(id)) return;
    want.add(id);
    for (const r of SETUP_SERVICE_OPTIONS.find((o) => o.id === id)?.requires ?? []) add(r);
  };
  for (const id of ids) {
    if ((SETUP_SERVICE_IDS as readonly string[]).includes(id)) add(id as SetupServiceId);
  }
  return SETUP_SERVICE_OPTIONS.map((o) => o.id).filter((id) => want.has(id));
}

/** The portal logins a set of choices needs, SDMS first. Empty when none does. */
export function portalsForServices(ids: readonly string[]): PortalId[] {
  const need = new Set<PortalId>();
  for (const id of withRequiredServices(ids)) {
    for (const p of SETUP_SERVICE_OPTIONS.find((o) => o.id === id)?.portals ?? []) need.add(p);
  }
  return (['sdms', 'iras'] as const).filter((p) => need.has(p));
}

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

export interface SetupPaymentDealerView {
  state: SetupPaymentState;
  /** What the bill is for, GST included. Null until a bill is sent. */
  amountPaise: number | null;
  /** `YYYY-MM-DD`. */
  dueOn: string | null;
  /** `YYYY-MM-DD`. */
  paidOn: string | null;
}

// ── What the dealer app reads: GET /me/setup ───────────────────────────────

export interface OutletSetupView {
  /** False for an outlet that predates onboarding v2 or is already live: the app shows nothing. */
  active: boolean;
  stage: SetupStage;
  waitingOn: SetupWaitingOn;
  strip: Array<{ step: SetupStripStep; state: SetupStripState }>;
  services: {
    options: readonly SetupServiceOption[];
    chosen: SetupServiceId[];
    /** True once the bill is sent: a change after that goes through the chat. */
    locked: boolean;
  };
  billing: SetupBilling | null;
  /** What the billing card starts from: the registration's name, the outlet's GSTIN. */
  billingPrefill: { name: string | null; stateCode: string | null; gstin: string | null };
  payment: SetupPaymentDealerView;
  /** The portals the chosen services need. Their state is `GET /me/portal-logins`. */
  loginsNeeded: PortalId[];
  /** Only an owner may tick, save or type; a manager sees the same cards read-only. */
  canEdit: boolean;
}

/** A chat message that carries one of the setup cards. The card draws from GET /me/setup, never from the message. */
export const SETUP_CARDS = ['welcome', 'services', 'billing', 'payment', 'logins', 'started'] as const;
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
  servicesChosenAt: string | null;
  billingSavedAt: string | null;
  billSentAt: string | null;
  paidAt: string | null;
  loginsDoneAt: string | null;
  servicesStartedAt: string | null;
  watchUntil: string | null;
  liveAt: string | null;
}

export interface SetupPaymentAdminView extends SetupPaymentDealerView {
  mode: SetupPaymentMode | null;
  reference: string | null;
  recordedByName: string | null;
}

export interface OutletSetupAdmin {
  dealerId: string;
  code: string;
  /** The registration it came from. Null only for an outlet older than onboarding v2. */
  enrolmentId: string | null;
  source: SetupSource;
  ownerName: string | null;
  mobile: string | null;
  stage: SetupStage;
  waitingOn: SetupWaitingOn;
  /** When the current stage opened. */
  stageSince: string;
  milestones: SetupMilestones;
  servicesChosen: SetupServiceId[];
  billing: SetupBilling | null;
  payment: SetupPaymentAdminView;
  loginsNeeded: PortalId[];
  approvedByName: string | null;
  lost: { at: string; byName: string; reason: string } | null;
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
}

/** What Approve returns: the new outlet, and whether the WhatsApp welcome went. */
export interface ApproveRegistrationResult {
  dealerId: string;
  code: string;
  /**
   * Only when the registration carried no password (a form from before
   * onboarding v2): a temporary one, shown to the approver ONCE to pass on.
   * The owner must change it at first sign-in. Null when they chose their own.
   */
  tempPassword: string | null;
  welcome:
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
}
