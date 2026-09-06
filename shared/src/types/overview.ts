/**
 * The Overview page's contract — "Today", the screen an admin opens first.
 *
 * WHY THIS LIVES IN @dk/shared RATHER THAN IN THE ADMIN APP
 *
 * `api.get<T>()` casts; it does not validate. A field the server stops sending
 * reads `undefined`, falls through `?? 0`, and renders as a zero — and this
 * page's zeros all mean "nothing is wrong". That failure mode has already
 * shipped once here: both Ledger Watch screens printed "0 findings" above a
 * list of findings, because a declared count was never actually sent. On a
 * screen whose entire job is to say "you can stop looking now", a silent zero
 * is the worst bug the product can have, so both ends compile against one
 * definition.
 *
 * THE TWO DATES, WHICH ARE NEVER THE SAME AND MUST NEVER BE CONFLATED
 *
 * `reportingDate` is the shift day being graded, and it defaults to YESTERDAY.
 * A day's sales are only knowable once the next morning's opening meter
 * readings arrive, so today's row is `OPEN` for every outlet all day, every
 * day. Grading today would paint all ten dealers red until midnight and the
 * page would never once read "done".
 *
 * `asOf` is the wall clock: the queue, the money and the machinery are "right
 * now", not "as of the reporting day".
 */

/** The whole payload of `GET /api/v1/overview/day`. */
export interface OverviewDay {
  /** IST `YYYY-MM-DD`. The shift day being graded — yesterday unless asked otherwise. */
  reportingDate: string;
  /**
   * The SERVER's IST day. Sent so the page can say "yesterday" in words without
   * trusting the device clock — these run on dealer-grade Android tablets whose
   * clock is routinely days out.
   */
  today: string;
  /** ISO instant the snapshot was computed. */
  asOf: string;
  summary: OverviewSummary;
  /**
   * When the nightly Kavach sweep last scored the estate, or `null` if it never
   * has. Nothing computes Kavach status on read — a cron stamps it at 00:20 IST
   * — so a sweep that failed leaves every Kavach figure on this page silently
   * showing yesterday's answer, with no error raised anywhere.
   */
  kavachLastEvaluatedAt: string | null;
  /** ACTIVE programmes not scored since midnight IST. Non-zero ⇒ show the trust callout. */
  kavachStaleProgrammes: number;
  /**
   * Pre-ranked and pre-deduped server-side, so the page renders judgement it
   * did not make. NOT pre-capped: every row is sent and the page shows `actCap`
   * of them with the rest expandable in place, because no single screen exists
   * that holds late services, unsent cards, superseded reports and refused
   * passwords at once for an overflow row to point at.
   */
  items: TriageItem[];
  /** How many 'act' rows to show before offering to expand. */
  actCap: number;
  /** One row per live dealer, sorted worst-first. */
  dealers: DealerDayRow[];
  /** One entry per check that ran. `ok: false` means it could not run — never silently absent. */
  checks: CheckResult[];
}

export interface OverviewSummary {
  dealersTotal: number;
  /** Shift data present for the reporting day AND a report generated AND that report sent. */
  done: number;
  /** The complement: something in that chain is missing, failed or partial. */
  behind: number;
  /** Conversations past the 90-minute warn threshold. */
  peopleWaiting: number;
  /** Reports and credit cards generated but never delivered. */
  notSent: number;
}

/**
 * What a triage row can be. The union is closed so a new kind cannot ship
 * without both ends agreeing what it means.
 */
export type TriageKind =
  // ---- bucket 'act' -------------------------------------------------------
  /** The portal refused our password. Retrying burns attempts; a person must re-enter it. */
  | 'login_rejected'
  /** A dealer has waited past TICKET_FLAG_URGENT_MINUTES for a human reply. */
  | 'waiting_urgent'
  /** Past TICKET_FLAG_WARN_MINUTES. */
  | 'waiting_warn'
  /** The 20-minute sweep pulled an assigned ticket back into the pool. */
  | 'ticket_dropped'
  /** A credit card was generated and never delivered to the dealer. */
  | 'credit_card_unsent'
  /** The dealer is holding a card we have since superseded. A sent chat message cannot be recalled. */
  | 'credit_card_superseded'
  /** The dealer is holding a report we have since regenerated. */
  | 'dsr_superseded'
  /** Open ALERT-severity ledger movements nobody has read. */
  | 'ledger_alerts'
  /** ACTIVE attachment with no computable next run — it will never fire on a timer again. */
  | 'service_quiet'
  /** ACTIVE attachment whose next run is comfortably past, and which is not currently running. */
  | 'service_late'
  // ---- bucket 'context' ---------------------------------------------------
  /** Threads the AI answered that no human has since read. */
  | 'unread'
  /** AI turns nobody has passed judgement on. */
  | 'ai_unreviewed'
  /** Documents the dealer has sent that are waiting on us, or that are overdue. */
  | 'papers_waiting'
  /** Kavach items never verified. Always context: a new programme starts with ~40 of them. */
  | 'kavach_backlog';

/** A one-tap fix, described by the server so the page never hard-codes a route. */
export interface TriageAction {
  label: string;
  method: 'POST' | 'PATCH';
  /** Path under `/api/v1`, ready to hand to `api.post`. */
  path: string;
  /** When set, the page must route the tap through `ConfirmDialog` first. */
  confirm?: string;
}

export interface TriageItem {
  id: string;
  /**
   * `act` is work for this morning and gets a button. `context` is standing
   * backlog that would drown the list if it were ever allowed to be urgent —
   * it renders muted, below a hairline, with no button.
   */
  bucket: 'act' | 'context';
  kind: TriageKind;
  /** The sentence, already written. */
  title: string;
  /** One line on what it costs to leave alone. */
  why: string | null;
  dealerId: string | null;
  /** A dealer IS its code in this product; a Mongo id tail is not an identity. */
  dealerCode: string | null;
  /**
   * RAW ISO, never a rendered duration. The server caches for 20s, so a
   * server-rendered "3h 40m" would visibly freeze; the page ages it on a tick.
   */
  sinceIso: string | null;
  count: number | null;
  /** Admin route this row opens. */
  href: string;
  action: TriageAction | null;
}

/** One dealer's reporting day, column by column, as the board draws it. */
export interface DealerDayRow {
  dealerId: string;
  dealerCode: string | null;
  shift: {
    attached: boolean;
    /**
     * `PAUSED` is the hand-entry outlet: no automation reaches it and somebody
     * types the shift in. It is a normal way to run a pump here, not a fault,
     * so the board says "Type it" rather than colouring it red.
     */
    portalCollection: 'ACTIVE' | 'PAUSED' | 'NONE';
    status: 'COMPLETE' | 'PARTIAL' | 'FAILED' | null;
    source: 'PORTAL' | 'MANUAL' | null;
    failureReason: string | null;
  };
  dsr: {
    attached: boolean;
    reportId: string | null;
    generatedAt: string | null;
    warningCount: number;
    firstWarning: string | null;
    /** A receipt correction invalidates the edited day and every later one. */
    stale: boolean;
  };
  sent: {
    sharedAt: string | null;
    supersededSharedAt: string | null;
  };
  kavach: {
    hasProgramme: boolean;
    submitted: number;
    expired: number;
    sosFlagged: number;
    held: number;
  };
  chat: {
    waiting: number;
    unread: number;
    oldestAwaitingSince: string | null;
    conversationId: string | null;
  };
  /** Collected AND generated AND sent. The one definition both the grid and the verdict sentence read. */
  done: boolean;
}

/**
 * A check that ran and found nothing — the evidence behind a quiet page.
 *
 * A check that could NOT run is still listed, with `ok: false`. Absence is what
 * this page uses to claim all-clear, so an absent check has to announce itself
 * or the silence is a lie.
 */
export interface CheckResult {
  id: string;
  label: string;
  /** "10 outlets", "0 alerts open" — what was looked at and what came back. */
  scope: string;
  ok: boolean;
  at: string;
  href: string;
}

/**
 * `GET /api/v1/overview/health` — super-admin only, and a SEPARATE route from
 * the day payload precisely so these figures never enter the shared cache
 * object that plain admins are served from.
 */
export interface OverviewHealth {
  /** Newest run with `trigger: 'scheduled'`. Silence here means nothing is running at all. */
  lastScheduledRunAt: string | null;
  /**
   * Runs stuck PENDING/RUNNING well past any legitimate timeout. Non-zero also
   * means the reaper is not running, because `reapStaleRuns` only ever fires
   * from a scheduler tick — so this number counts two faults at once.
   */
  stuckRuns: number;
  /**
   * What the registry loaded from `dist/` at boot. Deploy never cleans `dist/`,
   * so prod has registered phantom plugins that source no longer defines — and
   * they were attachable.
   */
  pluginCount: number;
  /** What source actually defines. A mismatch is the whole point of the chip. */
  expectedPluginCount: number;
  /**
   * The pre-send correctness gate's mode.
   *
   * Surfaced as a WORD, and the word comes first, because the count below only
   * means anything once you know the mode. The CODE default is `SHADOW`, where
   * the gate decides everything and withholds nothing — so a bare "0 withheld"
   * there would read as reassurance when it actually means the gate is off.
   * Production runs `ASSURANCE_MODE=ENFORCE`, where the count is real.
   */
  assuranceMode: 'OFF' | 'SHADOW' | 'ENFORCE';
  /**
   * Reports the gate is currently refusing to release, counted off the STORED
   * verdict (`assurance.releasable: false`), which is an index hit.
   *
   * Deliberately not the `/assurance/holds` figure: that route re-runs the gate
   * over the 600 most recent reports and pulls each one's full `digest` to do
   * it, which is megabytes of read on a 908 MB box — fine for a screen somebody
   * opened on purpose, far too heavy for a dashboard that polls.
   *
   * `null` when the mode makes the number meaningless.
   */
  assuranceHolds: number | null;
  /** Whether the scheduler is enabled at all in this process. */
  schedulerEnabled: boolean;
}
