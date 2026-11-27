import * as React from 'react';
import { useLocation } from 'react-router-dom';

import { SubPage } from '@/components/SubPage';
import { useT } from '@/lib/i18n';

import { ChangePasswordCard } from './ChangePasswordCard';
import { DeleteAccountCard } from './DeleteAccountCard';

/**
 * Settings, Account: changing the password, and, set apart below it, deleting the account. Same
 * address as always. Arriving from the "Delete my account" block of Settings (`state.section`), the
 * page brings that block into view.
 */
export function SettingsAccountPage() {
  const t = useT();
  const location = useLocation();
  const deleteRef = React.useRef<HTMLDivElement>(null);
  const toDelete = (location.state as { section?: unknown } | null)?.section === 'delete';
  React.useEffect(() => {
    if (toDelete) deleteRef.current?.scrollIntoView?.({ block: 'center' });
  }, [toDelete]);
  return (
    <SubPage title={t('settings.account')} className="gap-3 bg-bg">
      <ChangePasswordCard />
      <div ref={deleteRef} className="mt-4">
        <DeleteAccountCard />
      </div>
    </SubPage>
  );
}
