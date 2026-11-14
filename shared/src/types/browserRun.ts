/**
 * Browser-worker runs (ADR 0044): portal fetch jobs that run in an admin's own Chrome via
 * the extension, because the sign-in needs the "I'm not a robot" tick a human must do.
 *
 * The admin turns the worker on; it works pending runs one at a time — sign in, wait (with
 * a sound) for the admin to tick, read the data, post it back — until the admin turns it off.
 */
import type { PortalId } from './portalLogin';

/** What a run fetches. Only tanker documents (TT Info) today. */
export const BROWSER_RUN_TASKS = ['tanker_documents'] as const;
export type BrowserRunTask = (typeof BROWSER_RUN_TASKS)[number];

/**
 * `pending`     waiting for the worker to pick it up.
 * `claimed`     a worker took it; the portal is opening.
 * `awaiting_tick` the worker reached the "I'm not a robot" tick — the sound plays, the admin clicks it.
 * `fetching`    signed in; reading the data off the portal.
 * `done` / `failed`.
 */
export const BROWSER_RUN_STATES = ['pending', 'claimed', 'awaiting_tick', 'fetching', 'done', 'failed'] as const;
export type BrowserRunState = (typeof BROWSER_RUN_STATES)[number];

/** A run as the admin's worker panel reads it. Never a user ID or a password. */
export interface BrowserRunView {
  id: string;
  dealerId: string;
  dealerCode: string;
  portal: PortalId;
  portalName: string;
  task: BrowserRunTask;
  state: BrowserRunState;
  /** Who is working it now (the worker admin), or null. */
  workedBy: { id: string; name: string | null } | null;
  /** A short progress line for the panel, e.g. "Reading BR10GA7611". */
  message: string | null;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  /** A finished run's summary: vehicles and documents read. */
  result: { vehicles: number; documents: number } | null;
  /** A failed run's plain reason. */
  error: string | null;
}

/** `GET /browser-worker/runs` — the queue for the admin worker panel. */
export interface BrowserRunsView {
  runs: BrowserRunView[];
  /** How many are `pending` (the badge / "N waiting"). */
  pending: number;
  /** How many are being worked right now. */
  active: number;
}

/** No run is waiting for the worker right now (POST /browser-worker/next). */
export const BROWSER_WORKER_IDLE = 'BROWSER_WORKER_IDLE';
