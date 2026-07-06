export interface Admin {
  id: string;
  email: string;
  name: string;
  /** Role strings. RBAC is not enforced in MVP; the seam exists for later. */
  roles: string[];
  /** Elevated tier: may view the Activity log and manage the admin team. */
  isSuperAdmin?: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** Shape returned to the client after login or on /auth/me. */
export type AdminPublic = Omit<Admin, never>;

export interface LoginResponse {
  token: string;
  admin: AdminPublic;
}
