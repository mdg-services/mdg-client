import { SubPage } from '@/components/SubPage';
import { useT } from '@/lib/i18n';

import { ChangePasswordCard } from './ChangePasswordCard';
import { DeleteAccountCard } from './DeleteAccountCard';

/** Settings → Account: changing the password, and deleting the account. */
export function SettingsAccountPage() {
  const t = useT();
  return (
    <SubPage title={t('settings.account')} className="gap-3">
      <ChangePasswordCard />
      <DeleteAccountCard />
    </SubPage>
  );
}
