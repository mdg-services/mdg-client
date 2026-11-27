import { GraduationCap, KeyRound, Users, UsersRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { PageHeader } from '@/components/kit/PageHeader';
import { SectionCard } from '@/components/kit/SectionCard';
import { StandRows } from '@/features/pump/HealthRows';
import { PumpIdentityCard } from '@/features/pump/PumpIdentityCard';
import { NavRow } from '@/features/pump/PumpRows';
import { ReplayWhatsNewRow } from '@/features/pump/ReplayWhatsNewRow';
import { isEmbedded } from '@/lib/embedMode';
import { useT } from '@/lib/i18n';
import { useAuthStore } from '@/store/auth';

/**
 * My pump (`/pump`, spec 4.5, 6.6): the page Settings should always have been. Who this pump is, how
 * things stand in five short lines, the people, the help, and one door to the phone's own settings.
 *
 * It makes requests, and each row makes its own: the identity card, each of the five health rows and
 * the replay row draw their own skeleton and fail alone. The health rows are shown worst first. Who sees what mirrors the server (a manager
 * never sees Team, Logins or the bill, and the phone never asks for them): Warriors, Papers, Help for
 * the owner and the manager.
 *
 * A sub-page: no bar at the bottom, a back arrow. Opened cold it goes to Today (the extension's
 * side panel, which has no Today, goes to its chat).
 */
export function PumpPage() {
  const t = useT();
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  const isOwner = role === 'dealer-owner';
  const canManageStaff = isOwner || role === 'dealer-staff';
  const icon = 'h-5 w-5 text-text-muted';

  return (
    <>
      <PageHeader variant="sub" title={t('shell.door.pump')} back={{ to: isEmbedded() ? '/chat' : '/' }} />
      <div className="flex flex-1 flex-col gap-3 bg-bg p-4">
        <PumpIdentityCard />

        <SectionCard title={t('pump.section.stand')} variant="list">
          <StandRows isOwner={isOwner} />
        </SectionCard>

        {canManageStaff ? (
          <SectionCard title={t('pump.section.people')} variant="list">
            {isOwner ? (
              <NavRow
                leading={<UsersRound aria-hidden className={icon} strokeWidth={1.75} />}
                title={t('settings.team')}
                subtitle={t('settings.teamDesc')}
                onPress={() => navigate('/settings/team')}
              />
            ) : null}
            <NavRow
              leading={<Users aria-hidden className={icon} strokeWidth={1.75} />}
              title={t('profile.staffPoints')}
              subtitle={t('profile.staffPointsDesc')}
              onPress={() => navigate('/staff')}
            />
          </SectionCard>
        ) : null}

        <SectionCard title={t('pump.section.help')} variant="list">
          <NavRow
            leading={<GraduationCap aria-hidden className={icon} strokeWidth={1.75} />}
            title={t('settings.help')}
            subtitle={t('settings.helpDesc')}
            onPress={() => navigate('/settings/help')}
          />
          <ReplayWhatsNewRow />
        </SectionCard>

        <SectionCard title={t('pump.section.me')} variant="list">
          <NavRow
            leading={<KeyRound aria-hidden className={icon} strokeWidth={1.75} />}
            title={t('pump.help.me')}
            subtitle={t('pump.help.meDesc')}
            onPress={() => navigate('/settings')}
          />
        </SectionCard>
      </div>
    </>
  );
}
