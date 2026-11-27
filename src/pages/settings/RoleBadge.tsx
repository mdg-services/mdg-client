import { StatusPill } from '@/components/kit/StatusPill';
import { teamState, type TeamState } from '@/features/pump/pumpModel';
import { useT, type TFunction } from '@/lib/i18n';
import type { User } from '@dk/shared/types';


/** "Owner" / "Manager" / "Admin", in the dealer's language. */
export function roleLabel(role: User['role'], t: TFunction): string {
  return role === 'dealer-owner'
    ? t('profile.roleOwner')
    : role === 'dealer-staff'
      ? t('profile.roleStaff')
      : t('profile.roleAdmin');
}

/** The role as a word on a quiet tag (not a status: it carries no shape). */
export function RoleBadge({ role }: { role: User['role'] }) {
  const t = useT();
  return (
    <span className="inline-flex items-center rounded-md bg-surface-2 px-2 py-0.5 text-meta font-medium text-text-muted">
      {roleLabel(role, t)}
    </span>
  );
}

/**
 * Where a person stands, as a shape AND a word (never an 8px dot): Active, Paused, or Not signed in yet.
 * It replaces the colour-only dot: a person invited and never signed in is a gap an owner wants to see.
 */
export function MemberStatus({ user, self }: { user: Pick<User, 'status' | 'lastLoginAt'>; self?: boolean }) {
  const t = useT();
  // Your own row: you are signed in by being here, whatever the last-login field says.
  const state: TeamState = teamState(self ? { ...user, lastLoginAt: user.lastLoginAt ?? 'now' } : user);
  if (state === 'paused') return <StatusPill status="attention" word={t('profile.statusPaused')} />;
  if (state === 'notYet') return <StatusPill status="info" word={t('pump.team.notYet')} />;
  return <StatusPill status="ok" word={t('profile.statusActive')} />;
}
