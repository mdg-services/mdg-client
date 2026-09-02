import { FileText, MessageCircle } from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';

import { EmptyState, Spinner } from '@/components/ui';
import { AskCard } from '@/features/asks/AskCard';
import { EMPTY_ASK_LIST, askMatchKey, groupAsks } from '@/features/asks/askRules';
import { useAskCapture } from '@/features/asks/useAskCapture';
import { useMyAsks } from '@/hooks/api/useAsks';
import { useT } from '@/lib/i18n';
import { queuedFor, useAskQueueStore } from '@/store/askQueue';
import { useAuthStore } from '@/store/auth';
import type { DealerDocumentAskRow } from '@dk/shared/types';

/**
 * Everything MDG is asking this dealer for, and everything they have sent.
 *
 * GROUPED BY WHOSE TURN IT IS, NOT BY WHAT THE PAPER IS
 * ----------------------------------------------------
 * "बाकी है" then "भेज दिया" then "हो गया", because the only question a dealer
 * opens this screen with is "what do I still have to do?" — and the answer has
 * to be at the top, above the things that are somebody else's problem now. The
 * grouping comes from `documentAskWaitingOn` in `shared`, the same function the
 * admin's estate view uses, so the two screens can never disagree about who is
 * holding a paper up.
 *
 * The third group is deliberate. The server keeps an ACCEPTED row on this list
 * for a few days precisely so the dealer gets to SEE that it landed; dropping
 * those here would undo that, and a request that vanishes the instant it is
 * answered reads as a request that was lost.
 *
 * ONE LIST, THREE SOURCES, AND THE DEALER IS TOLD ABOUT NONE OF THAT. A row may
 * be a real ask, a Kavach evidence request, or a period a rule says is owed that
 * nobody has made a row for. Splitting those across three screens would make a
 * 55-year-old pump owner learn our data model in order to answer a question
 * about a piece of paper.
 */
export function AsksPage() {
  const t = useT();
  const navigate = useNavigate();
  const dealerId = useAuthStore((s) => s.user?.dealerId);
  const meQuery = useMyAsks();
  const items = useAskQueueStore((s) => s.items);

  const list = meQuery.data ?? EMPTY_ASK_LIST;
  const capture = useAskCapture(list);

  const groups = React.useMemo(() => groupAsks(list.rows), [list.rows]);
  // Keyed by `(kindCode, periodKey)` rather than by row id, so a photograph
  // queued against a derived `owed` line still finds its card after the server
  // has minted a real ask with a brand new id for it.
  const queuedByKey = React.useMemo(() => {
    const map = new Map<string, (typeof items)[number]>();
    for (const item of queuedFor(items, dealerId)) map.set(item.matchKey, item);
    return map;
  }, [items, dealerId]);

  const goToKavach = React.useCallback(() => navigate('/kavach'), [navigate]);

  const card = (row: DealerDocumentAskRow) => (
    <AskCard
      key={row.id}
      row={row}
      today={list.today}
      {...(queuedByKey.get(askMatchKey(row))
        ? { queued: queuedByKey.get(askMatchKey(row)) }
        : {})}
      onCamera={capture.openCamera}
      onFiles={capture.openFiles}
      onKavach={goToKavach}
    />
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
        <h1 className="text-lg font-semibold tracking-tight text-text">
          {t('asks.pageTitle')}
        </h1>
        <EmptyState
          icon={<FileText width={28} strokeWidth={1.5} />}
          title={t('density.errorTitle')}
          description={t('common.helpDesc')}
        />
        <HelpFooter />
      </div>
    );
  }

  const nothing =
    groups.todo.length === 0 && groups.sent.length === 0 && groups.done.length === 0;

  return (
    <div className="flex flex-1 flex-col gap-5 p-4">
      <h1 className="text-lg font-semibold tracking-tight text-text">
        {t('asks.pageTitle')}
      </h1>

      {nothing ? (
        // A calm, true sentence rather than an empty list that reads like
        // something is broken.
        <EmptyState
          icon={<FileText width={28} strokeWidth={1.5} />}
          title={t('asks.emptyTitle')}
          description={t('asks.emptyDesc')}
        />
      ) : null}

      {groups.todo.length > 0 ? (
        <Section title={t('asks.groupTodo')}>{groups.todo.map(card)}</Section>
      ) : null}
      {groups.sent.length > 0 ? (
        <Section title={t('asks.groupSent')}>{groups.sent.map(card)}</Section>
      ) : null}
      {groups.done.length > 0 ? (
        <Section title={t('asks.groupDone')}>{groups.done.map(card)}</Section>
      ) : null}

      <HelpFooter />

      {capture.elements}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="px-1 text-sm font-semibold text-text-muted">{title}</h2>
      {children}
    </section>
  );
}

/**
 * A person, at the bottom of the screen.
 *
 * The same footer `/density` carries, and for the same reason: a dealer who
 * cannot find the paper, or who thinks MDG is asking for the wrong thing, has
 * nowhere else to go — and "message us" is a better ending to this screen than
 * a list they cannot argue with.
 */
function HelpFooter() {
  const navigate = useNavigate();
  const t = useT();
  return (
    <button
      type="button"
      onClick={() => navigate('/chat')}
      className="mt-2 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 text-sm font-medium text-brand shadow-sm active:bg-surface-2"
    >
      <MessageCircle width={16} strokeWidth={1.75} />
      {t('density.helpLine')}
    </button>
  );
}
