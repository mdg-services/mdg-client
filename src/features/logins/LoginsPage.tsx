import { KeyRound } from 'lucide-react';
import { Navigate } from 'react-router-dom';

import { ErrorCard } from '@/components/kit/ErrorCard';
import { InsightRow } from '@/components/kit/InsightRow';
import { SkeletonBlock } from '@/components/kit/SkeletonBlock';
import { SubPage } from '@/components/SubPage';
import { Card, EmptyState } from '@/components/ui';
import { joinNames, loginsHealth } from '@/features/pump/pumpModel';
import { useLogins } from '@/hooks/api/useLogins';
import { useT } from '@/lib/i18n';
import { useTn } from '@/lib/messages/_plural';
import { useAuthStore } from '@/store/auth';

import { LoginCard } from './LoginCard';
import type { LoginRow } from './types';

/**
 * The health line at the top: how many logins work, or which one the portal turned away, as a shape
 * AND a word. The same facts as My pump's logins row, without "tap".
 */
function HealthLine({ rows }: { rows: readonly LoginRow[] }) {
  const t = useT();
  const tn = useTn();
  const h = loginsHealth(rows);
  const text =
    h.kind === 'empty'
      ? t('pump.health.logins.empty')
      : h.kind === 'refused'
        ? tn('pump.logins.refused', h.names.length, { names: joinNames(h.names, t) })
        : h.kind === 'missing'
          ? tn('pump.logins.missing', h.names.length, { names: joinNames(h.names, t) })
          : t('pump.health.logins.ok', { working: h.working, total: h.total });
  return (
    <Card className="px-4 py-2">
      <InsightRow status={h.status} text={text} />
    </Card>
  );
}

/**
 * IDs & passwords (still at `/settings/logins`): every portal login the outlet has, with its password
 * a tap away, a way to fill or change each one, and what each was before. Owner only: My pump's row and
 * the server both say so, and a manager who types the address is sent back to My pump WITHOUT the page
 * asking the server for anything (the page below is only mounted for an owner).
 */
export function LoginsPage() {
  const role = useAuthStore((s) => s.user?.role);
  if (role !== 'dealer-owner') return <Navigate to="/pump" replace />;
  return <LoginsBody />;
}

function LoginsBody() {
  const t = useT();
  const q = useLogins();

  return (
    <SubPage title={t('logins.title')} className="gap-3 bg-bg">
      {q.isPending ? (
        <SkeletonBlock lines={4} />
      ) : q.isError || !q.data ? (
        <ErrorCard text={t('common.loadFailed')} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <HealthLine rows={q.data.rows} />
          <p className="break-words text-body text-text-muted">{t('logins.intro')}</p>
          {q.data.rows.length === 0 ? (
            <EmptyState
              icon={<KeyRound width={28} strokeWidth={1.5} />}
              title={t('logins.empty')}
              description={t('logins.emptyDesc')}
            />
          ) : (
            q.data.rows.map((row) => <LoginCard key={row.portal} row={row} />)
          )}
          <p className="break-words pb-4 text-meta text-text-muted">{t('logins.safe')}</p>
        </>
      )}
    </SubPage>
  );
}
