import { MessageCircle, PartyPopper, ShieldCheck } from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';

import type { KavachItem } from '@dk/shared/types';

import { EmptyState, Spinner, useToast } from '@/components/ui';
import { ComplianceTaskCard } from '@/features/kavach/ComplianceTaskCard';
import { PumpHealthRing } from '@/features/kavach/PumpHealthRing';
import { byUrgency, isDueToday, isSos } from '@/features/kavach/status';
import { useKavachMe } from '@/hooks/api/useKavach';
import { useMyPrimaryConversation } from '@/hooks/api/useMyConversations';
import { pick, useLang, useT } from '@/lib/i18n';

function GroupHeader({ label }: { label: string }) {
  return (
    <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-text-subtle">
      {label}
    </h2>
  );
}

function HelpFooter() {
  const navigate = useNavigate();
  const t = useT();
  return (
    <button
      type="button"
      onClick={() => navigate('/chat')}
      className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 text-sm font-medium text-brand shadow-sm active:bg-surface-2"
    >
      <MessageCircle width={16} strokeWidth={1.75} />
      {t('kavach.needHelp')}
    </button>
  );
}

export function KavachPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const t = useT();
  const lang = useLang();
  const meQuery = useKavachMe();
  const conversationQuery = useMyPrimaryConversation();

  const programme = meQuery.data?.programme;
  const items = meQuery.data?.items ?? [];

  const settling = React.useMemo(() => {
    if (!programme?.settlingUntil) return false;
    return Date.now() < new Date(programme.settlingUntil).getTime();
  }, [programme?.settlingUntil]);

  const today = React.useMemo(
    () => items.filter(isDueToday).sort(byUrgency),
    [items],
  );
  const sos = React.useMemo(() => items.filter(isSos), [items]);

  const onDone = React.useCallback(
    (_item: KavachItem) => {
      toast.success(t('kavach.doneToast'), {
        description: t('kavach.doneToastDesc'),
      });
    },
    [toast, t],
  );

  if (meQuery.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-12">
        <Spinner size={20} />
      </div>
    );
  }

  if (meQuery.isError) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4">
        <EmptyState
          icon={<ShieldCheck width={28} strokeWidth={1.5} />}
          title={t('kavach.errorTitle')}
          description={t('common.helpDesc')}
        />
        <HelpFooter />
      </div>
    );
  }

  // No programme initiated yet — calm welcome, never a broken/empty table.
  if (!programme) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4">
        <h1 className="text-lg font-semibold tracking-tight text-text">
          {t('kavach.title')}
        </h1>
        <EmptyState
          icon={<ShieldCheck width={28} strokeWidth={1.5} />}
          title={t('kavach.welcomeTitle')}
          description={t('kavach.welcomeDesc')}
        />
        <HelpFooter />
      </div>
    );
  }

  const conversationId = conversationQuery.data?.id;
  const conversationLoading = conversationQuery.isLoading;
  const goToChat = React.useCallback(() => navigate('/chat'), [navigate]);
  const todoCount = today.length;

  return (
    <div className="flex flex-1 flex-col gap-5 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight text-text">
          {t('kavach.title')}
        </h1>
      </div>

      {/* Headline: the ring, with the ACTION COUNT leading (number secondary). */}
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <PumpHealthRing pct={programme.score.overallPct} settling={settling} />
        {settling ? (
          <p className="text-center text-sm text-text-muted">
            {t('kavach.settling')}
          </p>
        ) : todoCount > 0 ? (
          <p className="text-center text-sm font-medium text-text">
            {todoCount === 1
              ? t('kavach.todoOne')
              : t('kavach.todoMany', { n: todoCount })}
          </p>
        ) : (
          <p className="text-center text-sm font-medium text-success">
            {t('kavach.allDone')}
          </p>
        )}
      </div>

      {/* Today list */}
      {todoCount > 0 ? (
        <section className="flex flex-col gap-2">
          <GroupHeader label={t('kavach.doToday')} />
          <div className="flex flex-col gap-2.5">
            {today.map((item) => (
              <ComplianceTaskCard
                key={item.id}
                item={item}
                conversationId={conversationId}
                conversationLoading={conversationLoading}
                onNeedChat={goToChat}
                onDone={onDone}
              />
            ))}
          </div>
        </section>
      ) : (
        <EmptyState
          icon={<PartyPopper width={28} strokeWidth={1.5} />}
          title={t('kavach.allDoneTitle')}
          description={t('kavach.allDoneDesc')}
        />
      )}

      {/* SOS — never a daily chore; one muted collapsed explainer. */}
      {sos.length > 0 ? (
        <details className="rounded-2xl border border-border bg-surface-2/50 px-4 py-3 text-sm">
          <summary className="cursor-pointer list-none font-medium text-text-muted">
            {t('kavach.sosSummary', { n: sos.length })}
          </summary>
          <p className="mt-2 text-xs text-text-muted">{t('kavach.sosDesc')}</p>
          <ul className="mt-2 flex flex-col gap-1">
            {sos.map((item) => (
              <li key={item.id} className="text-xs text-text-subtle">
                {pick(lang, item.labelEn, item.labelHi)}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <HelpFooter />
    </div>
  );
}
