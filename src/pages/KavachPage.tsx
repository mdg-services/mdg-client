import { CheckCircle2, MessageCircle, PartyPopper, ShieldCheck } from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, EmptyState } from '@/components/ui';
import { EvidenceRequestCard } from '@/features/kavach/EvidenceRequestCard';
import { PendingTaskCard } from '@/features/kavach/PendingTaskCard';
import { PumpHealthRing } from '@/features/kavach/PumpHealthRing';
import {
  byUrgency,
  checkedDateLabel,
  isAwaitingReview,
  isHeld,
  isPending,
  isSos,
  needsDealerEvidence,
  recentlyChecked,
  waitingOn,
} from '@/features/kavach/status';
import { useKavachMe } from '@/hooks/api/useKavach';
import { pick, useLang, useT } from '@/lib/i18n';
import { kavachScoreIsPublishable } from '@dk/shared';

/** How many past checks to print. Enough to see the number moving, not a ledger. */
const RECENT_LIMIT = 5;

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

/** Shape of the loaded page, so a 2G open never looks like a blank broken tab. */
function KavachSkeleton() {
  const t = useT();
  return (
    <div
      className="flex flex-1 flex-col gap-5 p-4"
      role="status"
      aria-label={t('common.loading')}
    >
      <div className="h-6 w-32 animate-pulse rounded-full bg-surface-2" aria-hidden />
      <div className="h-52 animate-pulse rounded-2xl bg-surface-2" aria-hidden />
      <div className="h-28 animate-pulse rounded-2xl bg-surface-2" aria-hidden />
      <div className="h-28 animate-pulse rounded-2xl bg-surface-2" aria-hidden />
    </div>
  );
}

/**
 * The dealer's Kavach tab.
 *
 * Since ADR 0011 the dealer certifies nothing here, and the whole risk of that
 * change is that the screen becomes a scoreboard the app keeps about them. So it
 * is built in this order and no other: what WE need from THEM first, above the
 * number; then the number, with what it does not know stated in words; then
 * what is outstanding and whose side each piece is on; then who checked what,
 * and when. A figure that moves with no account of who moved it is the failure
 * mode this order exists to prevent.
 */
export function KavachPage() {
  const navigate = useNavigate();
  const t = useT();
  const lang = useLang();
  const meQuery = useKavachMe();

  const programme = meQuery.data?.programme;
  const items = React.useMemo(() => meQuery.data?.items ?? [], [meQuery.data]);

  /**
   * Nothing about a programme reaches the dealer until an admin switches it on,
   * and on day one the honest figure is "nobody has checked anything yet". Until
   * then the ring wears the same calm face it wears during settling-in rather
   * than publishing a number MDG has not stood behind.
   *
   * The three conditions used to be written out here and NOWHERE ELSE, which
   * meant `GET /kavach/me` handed the percentage to anything that asked and this
   * component was the whole gate. They now live in `kavachScoreIsPublishable`
   * and the server applies them too, so by the time a settling-in programme
   * reaches this page `score.overallPct` is already absent. This memo is what
   * chooses the calm face; it is no longer what keeps the number secret.
   */
  const settling = React.useMemo(
    () => (programme ? !kavachScoreIsPublishable(programme) : false),
    [programme],
  );

  const asks = React.useMemo(
    () => items.filter(needsDealerEvidence).sort(byUrgency),
    [items],
  );
  const sent = React.useMemo(() => items.filter(isAwaitingReview), [items]);
  const pending = React.useMemo(
    () => [
      ...items.filter((it) => isPending(it) && waitingOn(it) === 'MDG').sort(byUrgency),
      // Ours, and last: see `isHeld` for why a compliant status is listed here.
      ...items.filter(isHeld),
    ],
    [items],
  );
  // Anything already listed above is excluded. A task shown as outstanding AND
  // ticked off further down is two answers to one question, which is exactly how
  // a dealer stops believing either of them.
  const checked = React.useMemo(() => {
    const shown = new Set([...asks, ...sent, ...pending].map((it) => it.id));
    return recentlyChecked(items)
      .filter((it) => !shown.has(it.id))
      .slice(0, RECENT_LIMIT);
  }, [asks, items, pending, sent]);
  const sos = React.useMemo(() => items.filter(isSos), [items]);

  // Must stay above the early returns below: a hook called only on some renders
  // (after the loading/error/no-programme guards) changes the hook count between
  // renders and crashes the whole tree with "rendered more hooks than…".
  const goToChat = React.useCallback(() => navigate('/chat'), [navigate]);
  const retry = React.useCallback(() => {
    void meQuery.refetch();
  }, [meQuery]);

  if (meQuery.isLoading) return <KavachSkeleton />;

  if (meQuery.isError) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4">
        <EmptyState
          icon={<ShieldCheck width={28} strokeWidth={1.5} />}
          title={t('kavach.errorTitle')}
          description={t('common.helpDesc')}
          cta={
            <Button variant="secondary" size="lg" onClick={retry}>
              {t('kavach.retry')}
            </Button>
          }
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

  /**
   * What "pending" counts, and what it does not.
   *
   * HELD tasks are still SHOWN — the dealer deserves to know we could not check
   * something — but they are not COUNTED, because HELD is our failed collection,
   * not their outstanding work. `KAVACH_PENDING_STATUSES` on the server draws
   * the line in the same place, and the shared card, the daily message and this
   * screen have to agree about how many things are outstanding or the dealer is
   * reading two different numbers for one fact.
   */
  const heldCount = pending.filter(isHeld).length;
  const pendingCount = pending.length - heldCount + asks.length + sent.length;
  const unchecked = programme.score.notYetVerifiedCount;

  return (
    <div className="flex flex-1 flex-col gap-5 p-4">
      <h1 className="text-lg font-semibold tracking-tight text-text">
        {t('kavach.title')}
      </h1>

      {/* 1. What we need from them — above the number, because it is the only
          thing on this screen they can act on. */}
      {asks.length > 0 ? (
        <section className="flex flex-col gap-2">
          <GroupHeader label={t('kavach.weNeedTitle')} />
          <p className="px-1 text-xs text-text-muted">{t('kavach.weNeedDesc')}</p>
          <div className="flex flex-col gap-2.5">
            {asks.map((item) => (
              <EvidenceRequestCard key={item.id} item={item} onNeedChat={goToChat} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Sent, and sitting with us. Kept beside the ask rather than dropped into
          the pending list, so the card the dealer just touched stays where they
          left it and visibly changes state instead of vanishing. */}
      {sent.length > 0 ? (
        <section className="flex flex-col gap-2">
          <GroupHeader label={t('kavach.withMdgTitle')} />
          <div className="flex flex-col gap-2.5">
            {sent.map((item) => (
              <EvidenceRequestCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      ) : null}

      {/* 2. The number, and what it does not know. */}
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-5 shadow-sm">
        {/* Passed through undefined and all: the server OMITS the percentage
            while it is not publishable, and the ring draws neither a number nor
            an arc when it has none. Substituting a 0 here would put "0%" in
            front of a dealer whose figure MDG has deliberately not stated. */}
        <PumpHealthRing pct={programme.score.overallPct} settling={settling} />
        {settling ? (
          <p className="text-center text-sm text-text-muted">
            {t('kavach.settling')}
          </p>
        ) : pendingCount > 0 ? (
          <p className="text-center text-sm font-medium text-text">
            {pendingCount === 1
              ? t('kavach.stillPendingOne')
              : t('kavach.stillPendingMany', { n: pendingCount })}
          </p>
        ) : (
          <p className="text-center text-sm font-medium text-success">
            {t('kavach.allDone')}
          </p>
        )}

        {/* Who owns this figure, said every time it is shown — and, now, only
            when it is. The line reads "The MDG team sets this figure … out of N
            points in all", so during settling it was naming a denominator for a
            figure that was not on the screen. The server no longer sends N in
            that state, which is what turned a slightly odd sentence into a
            missing word, and hiding the whole line is the honest resolution. */}
        {settling ? null : (
          <p className="text-center text-xs text-text-muted">
            {t('kavach.scoreSource', { n: programme.score.totalPoints ?? 0 })}
          </p>
        )}

        {/* A percentage that quietly omits how much of itself was never examined
            is a claim, not a measurement — and this one is MDG's claim about the
            dealer, so the gap is stated in words rather than rounded away. */}
        {unchecked > 0 ? (
          <p className="w-full rounded-xl bg-surface-2 px-3 py-2 text-center text-sm font-medium text-text">
            {unchecked === 1
              ? t('kavach.neverCheckedOne')
              : t('kavach.neverCheckedMany', { n: unchecked })}
          </p>
        ) : null}
      </div>

      {/* 3. Everything else outstanding, read-only. */}
      {pending.length > 0 ? (
        <section className="flex flex-col gap-2">
          <GroupHeader label={t('kavach.stillPending')} />
          <div className="flex flex-col gap-2.5">
            {pending.map((item) => (
              <PendingTaskCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      ) : pendingCount === 0 ? (
        <EmptyState
          icon={<PartyPopper width={28} strokeWidth={1.5} />}
          title={t('kavach.allDoneTitle')}
          description={t('kavach.allDoneDesc')}
          cta={
            <Button variant="secondary" size="lg" onClick={goToChat}>
              {t('kavach.messageUs')}
            </Button>
          }
        />
      ) : null}

      {/* 4. Who moved the number, and when. */}
      {checked.length > 0 ? (
        <section className="flex flex-col gap-2">
          <GroupHeader label={t('kavach.recentlyChecked')} />
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
            {checked.map((item) => (
              <div key={item.id} className="flex items-start gap-3 px-4 py-3">
                <CheckCircle2
                  width={18}
                  strokeWidth={1.75}
                  className="mt-0.5 shrink-0 text-success"
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-snug text-text">
                    {pick(lang, item.labelEn, item.labelHi)}
                  </p>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {t('kavach.checkedByMdg', {
                      date: checkedDateLabel(lang, item.lastVerifiedAt),
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

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
