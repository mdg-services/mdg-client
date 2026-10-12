import { cn } from '@/lib/cn';
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

export function RoleBadge({ role }: { role: User['role'] }) {
  const t = useT();
  return (
    <span className="inline-flex items-center rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-text-muted">
      {roleLabel(role, t)}
    </span>
  );
}

export function StatusDot({ status }: { status: User['status'] }) {
  const t = useT();
  const active = status === 'ACTIVE';
  return (
    <span
      className={cn(
        'inline-block h-2 w-2 rounded-full',
        active ? 'bg-emerald-500' : 'bg-amber-500',
      )}
      aria-label={active ? t('profile.statusActive') : t('profile.statusPaused')}
    />
  );
}
