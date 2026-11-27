/**
 * Whether this build offers New Pump Guide's sign-up (ADR 0058 §11).
 *
 * The server's `PLANNER_ENABLED` switch decides whether it will open a planner
 * account; this is the app's side of the same switch, set at build time with
 * `VITE_PLANNER_ENABLED=false`. Off, the first screen is the outlet sign-up as it
 * was, and the choice screen and the planner form send people there. On by
 * default, like the server's. Accounts already open keep working either way.
 */
export function plannerSignUpEnabled(): boolean {
  return import.meta.env.VITE_PLANNER_ENABLED !== 'false';
}
