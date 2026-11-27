import { Navigate } from 'react-router-dom';

import { SubPage } from '@/components/SubPage';
import { useT } from '@/lib/i18n';
import { useAuthStore } from '@/store/auth';

import { TeamSection } from './TeamSection';

/**
 * Your team (still at `/settings/team`): the people who can sign in to this pump, and the owner's
 * way to add or pause the manager. Owner only: the row that leads here is the owner's, and so is the
 * server's refusal for anyone else, so a link typed in by hand goes back to My pump rather than to a
 * page that can only say "no".
 */
export function SettingsTeamPage() {
  const t = useT();
  const role = useAuthStore((s) => s.user?.role);
  if (role !== 'dealer-owner') return <Navigate to="/pump" replace />;
  return (
    <SubPage title={t('settings.team')} className="gap-3 bg-bg">
      <TeamSection />
    </SubPage>
  );
}
