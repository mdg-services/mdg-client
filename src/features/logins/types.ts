import type { PortalId } from '@dk/shared/types';

/**
 * What `GET /v1/me/logins` answers: every portal login the outlet has or needs, with its
 * ID and what it was before. NEVER a password: that comes only from the owner's "show"
 * (`POST /v1/me/logins/:portal/reveal`). Kept here beside the page, not in `@dk/shared`,
 * because only this page and its one route use it.
 */

/** The eight portal logins, and the eMaaptaul one (calibration claims). */
export type LoginPortal = PortalId | 'wemmis';

/** What moved against the line before: `first` = nothing before it (or it had been taken off). */
export type LoginChange = 'first' | 'id' | 'password' | 'both';

/** `you`: this person. `owner`: another owner. `mdg`: MDG's team or the password-reset robot. `unknown`: not known. */
export type LoginBy = 'you' | 'owner' | 'mdg' | 'unknown';

export interface LoginVersion {
  /** For the "show" of this entry's password. */
  id: string;
  at: string;
  kind: 'saved' | 'removed';
  change?: LoginChange;
  /** The ID before this entry, when the ID moved. */
  previousUsername?: string;
  username?: string;
  by: LoginBy;
  byName?: string;
  /** "Forgot password?" set it, not a person typing. */
  viaReset?: boolean;
}

export interface LoginRow {
  portal: LoginPortal;
  name: string;
  /** The services need it, so it matters that it is in. */
  needed: boolean;
  status: 'saved' | 'missing' | 'refused';
  username?: string;
  savedAt?: string;
  savedBy?: LoginBy;
  refusedAt?: string;
  /** Newest first. */
  history: LoginVersion[];
}

export interface LoginsView {
  rows: LoginRow[];
}
