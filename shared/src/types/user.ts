export type UserRole = 'admin' | 'dealer-owner' | 'dealer-staff';
export type UserStatus = 'ACTIVE' | 'SUSPENDED';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  /** Required for dealer-* roles; null/undefined for admin. */
  dealerId?: string | null;
  /** Optional display label for a dealer member, e.g. "Owner" or "Manager". */
  title?: string;
  phone?: string;
  avatarKey?: string | null;
  /** Preferred UI language for the dealer apps. Defaults to Hindi when unset (ADR 0008). */
  lang?: 'en' | 'hi';
  status: UserStatus;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type UserPublic = User;

export interface AuthLoginResponse {
  token: string;
  user: UserPublic;
}
