import type { Cadence } from './enums';
import type { ServiceRunTrigger } from './serviceRun';

/**
 * The runtime context handed to a plugin's `run` function.
 * Plugins receive a scoped logger and the validated config; they should
 * never reach into framework globals.
 */
export type RunStepStatus = 'start' | 'ok' | 'error';

export interface RunStepRecord {
  name: string;
  status: RunStepStatus;
  startedAt?: Date;
  finishedAt?: Date;
  durationMs?: number;
  message?: string;
  meta?: Record<string, unknown>;
  error?: { message: string; stack?: string };
}

/**
 * What an artifact IS, which decides who may see it.
 *
 * `output`     — a deliverable of the run (a rendered card, an exported report).
 *                Plain admins see and download these.
 * `diagnostic` — evidence about HOW the run went: failure screenshots, page-source
 *                dumps, raw upstream API responses. These frequently contain the
 *                scraped portal verbatim, so they are super-admin only.
 *
 * A plugin that omits it is classified by filename (`fail_*`, `raw_*`, `*.html`),
 * which keeps pre-existing runs redacted correctly. Declare it explicitly in new
 * code — the filename heuristic is a fallback, not the contract.
 */
export type RunArtifactKind = 'output' | 'diagnostic';

export interface RunArtifactRecord {
  reportCode?: string;
  filename: string;
  storageKey: string;
  size?: number;
  contentType?: string;
  createdAt?: Date;
  /**
   * Who may see this artifact; see {@link RunArtifactKind}.
   *
   * There is NO safe default. Omitting it leaves the stored row `undefined`, and
   * the API then classifies it by filename (`fail_*`, `raw_*`, `*.html` are
   * treated as diagnostic). Plugins that produce raw captures should pass
   * `'diagnostic'` explicitly — the SDMS runner defaults its own helper to that,
   * precisely so a new capture cannot leak by omission.
   */
  kind?: RunArtifactKind;
}

export interface ServiceRunContext {
  dealerId: string;
  dealerServiceId: string;
  runId: string;
  config: Record<string, unknown>;
  now: Date;
  /**
   * Why this run is happening. A plugin that behaves differently depending on
   * who asked reads this rather than inferring it from config.
   *
   * The case it exists for is `attach`: a plugin whose schedule comes from
   * upstream needs one run to go and look, and that run must not have the side
   * effects a real one does — `water-ingress-testing` reads the outlet's slot
   * grid and deliberately ticks nothing, because adding a service to a dealer
   * is not a statement that an observation was made.
   */
  trigger: ServiceRunTrigger;
  logger: {
    info: (...a: unknown[]) => void;
    warn: (...a: unknown[]) => void;
    error: (...a: unknown[]) => void;
  };
  /**
   * Persist a per-step record on the ServiceRun. Called from inside long-running
   * plugins so admins can see live progress in the run-detail UI.
   * Implementations should be cheap (single Mongo $push) and tolerant of errors.
   */
  recordStep: (step: RunStepRecord) => Promise<void>;
  /**
   * Persist an artifact reference on the ServiceRun. The actual upload to the
   * storage backend is the plugin's responsibility; this just records the key.
   */
  recordArtifact: (artifact: RunArtifactRecord) => Promise<void>;
}

export interface ServiceRunResult {
  /** Arbitrary JSON output persisted with the ServiceRun record. */
  output: unknown;
  /** Wall-clock duration in ms; the runner will compute one if omitted. */
  durationMs: number;
  /**
   * When this service wants to run next, overriding the cadence for this cycle
   * only. Honoured on SCHEDULED runs; a manual "Run now" never moves the slot
   * (see the reasoning in `executeRun`).
   *
   * For a cadence a cron cannot express — one that depends on what the upstream
   * page said rather than on the calendar — the plugin is the only thing that
   * knows when to come back. `water-ingress-testing` is the case in point: the
   * portal publishes the dealer's own slot grid (a 24h RO gets twelve 2-hour
   * slots, a 06:00–22:00 RO gets fewer), each slot may only be marked while the
   * clock is inside it, and the grid can change without anyone telling us. So
   * the plugin reads the grid it was just shown and aims the next run at the
   * middle of the next slot.
   *
   * This is a REFINEMENT, never the only line of defence: a plugin that fails
   * (or crashes before returning) sets nothing, and the attachment falls back to
   * its cron / cadence. Which is exactly why {@link ServicePlugin.defaultCustomCron}
   * exists — the floor stays correct even when the refinement never arrives.
   */
  nextRunAt?: Date;
}

/**
 * Contract every plugin must satisfy. Discovered by globbing
 * `backend/src/services/*\/index.ts` at boot; no central registry edits.
 */
export interface ServicePlugin {
  /** Stable slug, kebab-case. Used as the folder name and serviceId. */
  id: string;
  /** Human-readable name shown in the catalog. */
  name: string;
  description: string;
  /** Default cadence; admins may override per-attachment. */
  cadence: Cadence;
  /**
   * A cron expression (IST) applied at attach time when the admin does not
   * supply one of their own — the schedule this service NEEDS rather than the
   * one the five-value {@link Cadence} enum can name.
   *
   * `Cadence` covers daily/weekly/monthly/yearly, which is every schedule the
   * services had until one needed to run twelve times a day. Adding an HOURLY
   * member for it would have been a lie in the other direction (this service is
   * two-hourly, the next one might be half-hourly) and would have rippled
   * through the enum, the model, the admin picker and every serializer. A
   * default cron says the same thing without teaching the rest of the system a
   * new word.
   *
   * It is a DEFAULT, not a lock: the admin's `customCron` still wins, and the
   * plugin's own {@link ServiceRunResult.nextRunAt} still refines each cycle.
   * What it guarantees is the floor — a plugin that fails before it can express
   * an opinion still comes back on the right rhythm instead of dropping to a
   * once-a-day cadence it was never meant to have.
   */
  defaultCustomCron?: string;
  /**
   * Fire one run the moment this service is attached to a dealer, purely so the
   * plugin can discover its real schedule and return a `nextRunAt`.
   *
   * `defaultCustomCron` is a guess made without looking. It is a good guess —
   * good enough to be the permanent floor — but it is still a constant in this
   * repository describing a timetable that lives on somebody else's server. A
   * dealer whose outlet does not trade round the clock, or whose windows are not
   * the standard two hours, would spend up to one whole cron interval on the
   * wrong rhythm before the first real run could correct it.
   *
   * So the attach goes and looks. The run is dispatched in the background (the
   * attach request returns immediately; a captcha-gated login takes minutes) and
   * arrives as a normal ServiceRun with `trigger: 'attach'`, so it is visible,
   * auditable and diagnosable like any other. If it fails, nothing is lost — the
   * cron floor is already in place and the first scheduled run corrects the
   * schedule itself.
   *
   * A plugin that sets this MUST make `trigger === 'attach'` side-effect-free.
   */
  discoverScheduleOnAttach?: boolean;
  /** JSON Schema (draft-07) used to validate config and drive RJSF. */
  defaultConfigSchema: Record<string, unknown>;
  /**
   * Other service ids that must ALREADY be attached to a dealer before this one
   * can be. Enforced at the attach route (not the registry or scheduler): a
   * dealer missing a prerequisite is refused a NEW attach with a plain message,
   * while existing attachments are never disturbed.
   */
  dependsOn?: string[];
  run(ctx: ServiceRunContext): Promise<ServiceRunResult>;
}

/** Read-only projection sent to the frontend in the catalog endpoint. */
export interface ServicePluginCatalogEntry {
  id: string;
  name: string;
  description: string;
  cadence: Cadence;
  /** Cron applied when the admin attaches without one; see {@link ServicePlugin.defaultCustomCron}. */
  defaultCustomCron?: string;
  /** Whether attaching fires a discovery run; see {@link ServicePlugin.discoverScheduleOnAttach}. */
  discoverScheduleOnAttach?: boolean;
  defaultConfigSchema: Record<string, unknown>;
  /** Prerequisite service ids that must be attached first; see {@link ServicePlugin.dependsOn}. */
  dependsOn?: string[];
}
