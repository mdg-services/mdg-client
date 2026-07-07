import type { DealerStatus } from './enums';
import type { User } from './user';

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

/**
 * One dealer's user roster for the super-admin "All users" console. `dealer` is
 * null for platform admins (role `admin`), who belong to no dealer. Returned by
 * `GET /v1/super-admin/users`, already grouped and ordered by the backend.
 */
export interface DealerUserGroup {
  dealer: { id: string; name: string; code: string | null; status: DealerStatus } | null;
  users: User[];
}
