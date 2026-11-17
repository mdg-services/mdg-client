import { KeyRound } from 'lucide-react';

import { SubPage } from '@/components/SubPage';
import { Button, EmptyState } from '@/components/ui';
import { useLogins } from '@/hooks/api/useLogins';
import { useT } from '@/lib/i18n';

import { LoginCard } from './LoginCard';

/** Grey blocks the shape of the cards, while the answer comes down the wire. */
function Skeleton() {
  const t = useT();
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">{t('common.loading')}</span>
      <div className="h-44 animate-pulse rounded-2xl bg-surface-2" aria-hidden />
      <div className="h-44 animate-pulse rounded-2xl bg-surface-2" aria-hidden />
    </div>
  );
}

/**
 * Settings → IDs & passwords: every portal login the outlet has, with its password a tap
 * away, a way to fill or change each one, and what each was before. Owner only — the
 * Settings row and the server both say so.
 */
export function LoginsPage() {
  const t = useT();
  const q = useLogins();

  return (
    <SubPage title={t('logins.title')} className="gap-3">
      {q.isPending ? (
        <Skeleton />
      ) : q.isError || !q.data ? (
        <EmptyState
          title={t('common.loadFailed')}
          cta={
            <Button variant="secondary" onClick={() => void q.refetch()}>
              {t('common.retry')}
            </Button>
          }
        />
      ) : (
        <>
          <p className="text-base text-text-muted">{t('logins.intro')}</p>
          {q.data.rows.length === 0 ? (
            <EmptyState
              icon={<KeyRound width={28} strokeWidth={1.5} />}
              title={t('logins.empty')}
              description={t('logins.emptyDesc')}
            />
          ) : (
            q.data.rows.map((row) => <LoginCard key={row.portal} row={row} />)
          )}
          <p className="pb-4 text-sm text-text-subtle">{t('logins.safe')}</p>
        </>
      )}
    </SubPage>
  );
}
