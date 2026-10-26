import { useMutation } from '@tanstack/react-query';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, Card, CardContent, useToast } from '@/components/ui';
import { hasOtherOutlets, useOutlets } from '@/features/outlets/useOutlets';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useDialog } from '@/lib/useDialog';
import { ACCOUNT_DELETED_KEY, useAuthStore } from '@/store/auth';
import { ACCOUNT_WIPE_AFTER_DAYS } from '@dk/shared';

/**
 * Settings → Account → "Delete my account".
 *
 * Apple refuses an app people can sign up from unless they can also delete
 * their account inside it, and the sign-in screen has "Register your pump".
 * The server switches the login off at once and wipes the name, email and
 * phone thirty days later; until then MDG can bring the account back, which is
 * why the confirm says so. A person with several pumps loses every login, so
 * the confirm says that too when it applies.
 */
export function DeleteAccountCard() {
  const t = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const outlets = useOutlets();
  const [confirming, setConfirming] = React.useState(false);
  const close = React.useCallback(() => setConfirming(false), []);

  const mutation = useMutation({
    mutationFn: () => api.post<{ wipeOn: string }>('/v1/me/delete-account', { confirm: true }),
    onSuccess: () => {
      // The sign-in screen says so, in a note that stays; a toast here was gone
      // before that screen had finished drawing.
      try {
        sessionStorage.setItem(ACCOUNT_DELETED_KEY, '1');
      } catch {
        // Storage off: the sign-out still has to happen.
      }
      logout();
      navigate('/login', { replace: true });
    },
    onError: () => {
      toast.error(t('account.deleteFailed'));
    },
  });

  if (!user || user.role === 'admin') return null;

  return (
    <>
      <Card>
        <CardContent>
          <p className="mb-1 text-sm font-semibold text-text">{t('account.delete')}</p>
          <p className="mb-3 text-sm text-text-muted">
            {t('account.deleteDesc', { days: ACCOUNT_WIPE_AFTER_DAYS })}
          </p>
          <Button variant="danger" onClick={() => setConfirming(true)}>
            {t('account.delete')}
          </Button>
        </CardContent>
      </Card>
      {confirming ? (
        <DeleteConfirm
          allOutlets={hasOtherOutlets(outlets.data)}
          busy={mutation.isPending}
          onCancel={close}
          onConfirm={() => mutation.mutate()}
        />
      ) : null}
    </>
  );
}

function DeleteConfirm({
  allOutlets,
  busy,
  onCancel,
  onConfirm,
}: {
  allOutlets: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useT();
  const panelRef = useDialog(onCancel);
  const days = ACCOUNT_WIPE_AFTER_DAYS;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
      <button
        type="button"
        aria-label={t('common.cancel')}
        tabIndex={-1}
        onClick={onCancel}
        className="absolute inset-0 bg-black/40"
      />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
        tabIndex={-1}
        className="relative w-full max-w-sm rounded-2xl bg-wa-bar p-6 shadow-lg outline-none animate-in"
      >
        <p id="delete-account-title" className="text-[18px] font-medium text-wa-bar-text">
          {t('account.deleteTitle')}
        </p>
        <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-[15px] text-wa-meta">
          <li>{t('account.deleteNow')}</li>
          {allOutlets ? <li>{t('account.deleteAllOutlets')}</li> : null}
          <li>{t('account.deleteWipe', { days })}</li>
          <li>{t('account.deleteRecordsStay')}</li>
          <li>{t('account.deleteUndo', { days })}</li>
        </ul>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={busy}>
            {t('account.deleteConfirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}
