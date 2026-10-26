export type UserRole = 'admin' | 'dealer-owner' | 'dealer-staff';
export type UserStatus = 'ACTIVE' | 'SUSPENDED';

/**
 * Days between "Delete my account" and the wipe of the person's name, email,
 * phone and photo. Until then a super-admin's restore undoes it.
 */
export const ACCOUNT_WIPE_AFTER_DAYS = 30;

export interface User {
  id: string;
  /** Empty string for a dealer user who registered without one: they sign in with their mobile. */
  email: string;
  name: string;
  role: UserRole;
  /** Required for dealer-* roles; null/undefined for admin. */
  dealerId?: string | null;
  /**
   * Elevated admin tier. Only super-admins may view the Activity (audit) log and
   * manage the admin team. Absent/false for regular admins and all dealer users.
   */
  isSuperAdmin?: boolean;
  /** Optional display label for a dealer member, e.g. "Owner" or "Manager". */
  title?: string;
  phone?: string;
  avatarKey?: string | null;
  /** Preferred UI language for the dealer apps. Defaults to Hindi when unset (ADR 0008). */
  lang?: 'en' | 'hi';
  status: UserStatus;
  /**
   * Set (ISO timestamp) when a super-admin archives (soft-deletes) the user: login
   * is blocked and they're hidden from the default roster, but the record + history
   * are retained and it's reversible via restore. Null/absent for live users.
   */
  archivedAt?: string | null;
  /**
   * Set (ISO timestamp) when the person deleted their own account from the app.
   * The login is off from that moment; the name, email, phone and photo are wiped
   * `ACCOUNT_WIPE_AFTER_DAYS` later unless a super-admin restores the account first.
   */
  deletionRequestedAt?: string | null;
  /** Set (ISO timestamp) once those personal details have been wiped. */
  personalDataWipedAt?: string | null;
  lastLoginAt?: string;
  /**
   * Signed in with a temporary password (one the team set): the app asks for a
   * new one before anything else. Cleared by `POST /auth/change-password`.
   */
  mustChangePassword?: boolean;
  /** Shared by the login records of one person who runs several outlets. Absent for most. */
  personId?: string;
  createdAt: string;
  updatedAt: string;
}

export type UserPublic = User;

/**
 * One of the outlets a person can switch to (phase 9: one owner, several pumps).
 * Each outlet keeps its own login record; the records of one person share a
 * `personId` and a password, so one sign-in opens all of them.
 */
export interface OutletChoice {
  userId: string;
  dealerId: string;
  code: string;
  role: UserRole;
}

export interface AuthLoginResponse {
  token: string;
  user: UserPublic;
  /** The person's other outlets, when they have more than one. Absent or empty otherwise. */
  outlets?: OutletChoice[];
}

/** `GET /auth/outlets`: the outlet this login is in, and the person's others. */
export interface OutletsView {
  /** Null only for a login with no outlet. */
  current: OutletChoice | null;
  /** The person's OTHER outlets, in code order. */
  outlets: OutletChoice[];
}

/** A dealer member as an admin's Members tab gets it: the person's other outlets ride along. */
export type DealerMemberRow = User & { alsoRuns?: string[] };
