import { SubPage } from '@/components/SubPage';
import { useT } from '@/lib/i18n';

import { ChangePasswordCard } from './ChangePasswordCard';

/** Settings → Account: changing the password, and nothing else a dealer can change. */
export function SettingsAccountPage() {
  const t = useT();
  return (
    <SubPage title={t('settings.account')} className="gap-3">
      <ChangePasswordCard />
    </SubPage>
  );
}
