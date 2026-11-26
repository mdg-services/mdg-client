import { useAuthStore } from '@/store/auth';
import type { User } from '@dk/shared/types';

/**
 * Is this login a New Pump Guide planner (ADR 0058 §2)? A planner is a dealer owner
 * whose dealer record is marked PLANNING: someone who has no pump yet. The server
 * says so on the signed-in profile (`/me` and the sign-in answer). A profile that
 * does not say, from an older server or a session saved before this, is an outlet,
 * which is what the app always assumed.
 */
export function isPlannerUser(user: Pick<User, 'role' | 'dealerStatus'> | null | undefined): boolean {
  return !!user && user.role !== 'admin' && user.dealerStatus === 'PLANNING';
}

/** The same, read reactively from the signed-in profile. */
export function useIsPlanner(): boolean {
  return useAuthStore((s) => isPlannerUser(s.user));
}
