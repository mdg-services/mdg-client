import { useNavigate } from 'react-router-dom';

import { InsightRow } from '@/components/kit/InsightRow';
import { SkeletonBlock } from '@/components/kit/SkeletonBlock';
import type { Status } from '@/components/kit/types';
import { useLogins } from '@/hooks/api/useLogins';
import { fmtDay } from '@/lib/fmt';
import { useLang, useT } from '@/lib/i18n';
import { useTn } from '@/lib/messages/_plural';
import { useAuthStore } from '@/store/auth';

import {
  billHealth,
  filedPapers,
  joinNames,
  licencePapers,
  lookNames,
  loginsHealth,
  mergePapers,
  paperName,
  papersHealth,
  servicesHealth,
  teamHealth,
} from './pumpModel';
import { StandRow } from './PumpRows';
import {
  useDocumentsOnFile,
  useMyOutlet,
  usePumpBill,
  usePumpServices,
  useTeamUsers,
} from './usePumpData';

/**
 * The "How things stand" rows of My pump (spec 4.5, 6.6): up to five, each reading its own data and
 * failing alone (a slow bill never holds back the services row, a failed papers call never hides the
 * team). Each is a shape AND a word, one sentence, and a line of small print.
 *
 * THE WORST COMES FIRST. A row is worked out from its own data, and the rows are then sorted by how bad
 * they are (red, then amber, then "could not check", then plain information, then fine), so an expired
 * licence is the first thing read, not the fourth. Amber is kept for what the owner has to DO soon: a
 * paper ending beyond two weeks is plain information with its days, not a warning.
 *
 * Who sees what mirrors the server: Services and Papers for the owner and the manager; Money, Logins
 * and Team for the owner only. A manager's phone never asks for an owner-only read (`enabled`).
 */

/** The days within which a paper ending soon is worth an amber mark on My pump; beyond it, information. */
const PAPER_AMBER_DAYS = 14;

interface RowModel {
  id: string;
  /** `wait`: its answer is on the way. `failed`: it could not be read. `ready`: a sentence to show. */
  phase: 'wait' | 'failed' | 'ready';
  status: Status;
  text: string;
  meta?: string;
  to: string;
  retry?: () => void;
}

/** Still on the way: not an error, and not "paused because the phone is offline". */
function waiting(q: { isPending: boolean; fetchStatus: string }): boolean {
  return q.isPending && q.fetchStatus !== 'paused';
}

/** Smaller reads first. A row still on the way sits with plain information so it does not jump much. */
const RANK: Record<RowModel['phase'] | Status, number> = {
  problem: 0,
  attention: 1,
  failed: 1,
  info: 2,
  wait: 2,
  waiting: 2,
  ok: 3,
  ready: 3,
};

function rankOf(row: RowModel): number {
  return row.phase === 'ready' ? RANK[row.status] : RANK[row.phase];
}

function useServicesModel(): RowModel | null {
  const t = useT();
  const tn = useTn();
  const lang = useLang();
  const role = useAuthStore((s) => s.user?.role);
  const q = usePumpServices();
  const base = { id: 'services', to: '/services' };
  if (waiting(q)) return { ...base, phase: 'wait', status: 'info', text: '' };
  if (!q.data) return null;
  const h = servicesHealth(q.data, role);
  const parts: string[] = [];
  if (h.kind === 'none') parts.push(t('pump.health.services.none'));
  else if (h.kind === 'ready') parts.push(t('pump.health.services.ready'));
  else {
    if (h.running > 0) parts.push(tn('pump.health.services.running', h.running));
    if (h.look > 0) parts.push(tn('pump.health.services.look', h.look));
  }
  // The sentence already says "services", so the small print names WHICH ones need a look, not the page.
  const names = lookNames(h.lookIds, lang);
  return {
    ...base,
    phase: 'ready',
    status: h.status,
    text: parts.join(', '),
    ...(names.length > 0 ? { meta: t('pump.health.services.lookNames', { names: joinNames(names, t) }) } : {}),
  };
}

function useMoneyModel(enabled: boolean): RowModel | null {
  const t = useT();
  const tn = useTn();
  const lang = useLang();
  const q = usePumpBill(enabled);
  if (!enabled) return null;
  const base = { id: 'money', to: '/payments' };
  const where = t('pump.where.bill');
  if (waiting(q)) return { ...base, phase: 'wait', status: 'info', text: '' };
  if (!q.data) {
    return { ...base, phase: 'failed', status: 'attention', text: t('pump.health.failed'), meta: where, retry: () => void q.refetch() };
  }
  const h = billHealth(q.data.items);
  const text =
    h.kind === 'none'
      ? t('pump.health.money.none')
      : h.kind === 'open'
        ? t('pump.health.money.open')
        : h.kind === 'today'
          ? t('pump.health.money.today')
          : h.kind === 'late'
            ? tn('pump.health.money.late', h.days, { date: fmtDay(h.date, lang) })
            : tn('pump.health.money.due', h.days, { date: fmtDay(h.date, lang) });
  return { ...base, phase: 'ready', status: h.status, text, meta: where };
}

function useLoginsModel(enabled: boolean): RowModel | null {
  const t = useT();
  const tn = useTn();
  const q = useLogins({ enabled });
  if (!enabled) return null;
  const base = { id: 'logins', to: '/settings/logins' };
  const where = t('pump.where.logins');
  if (waiting(q)) return { ...base, phase: 'wait', status: 'info', text: '' };
  if (!q.data) {
    return { ...base, phase: 'failed', status: 'attention', text: t('pump.health.failed'), meta: where, retry: () => void q.refetch() };
  }
  const h = loginsHealth(q.data.rows);
  const text =
    h.kind === 'empty'
      ? t('pump.health.logins.empty')
      : h.kind === 'refused'
        ? tn('pump.health.logins.refused', h.names.length, { names: joinNames(h.names, t) })
        : h.kind === 'missing'
          ? tn('pump.health.logins.missing', h.names.length, { names: joinNames(h.names, t) })
          : t('pump.health.logins.ok', { working: h.working, total: h.total });
  return { ...base, phase: 'ready', status: h.status, text, meta: where };
}

/**
 * "All valid", or the worst paper ("Fire NOC: 9 days left"). It needs BOTH of its sources: with one
 * still on the way it waits, and with one failed it says so, because "All valid" built from half the
 * papers would be a claim nobody checked. The two are merged first, so a licence both lists carry is
 * one paper and its later end date counts.
 */
function usePapersModel(): RowModel | null {
  const t = useT();
  const tn = useTn();
  const lang = useLang();
  const outlet = useMyOutlet();
  const onFile = useDocumentsOnFile();
  const base = { id: 'papers', to: '/pump/papers' };
  const where = t('pump.where.papers');
  if (waiting(outlet) || waiting(onFile)) return { ...base, phase: 'wait', status: 'info', text: '' };
  if (!outlet.data || !onFile.data) {
    return {
      ...base,
      phase: 'failed',
      status: 'attention',
      text: t('pump.health.failed'),
      meta: where,
      retry: () => {
        if (!outlet.data) void outlet.refetch();
        if (!onFile.data) void onFile.refetch();
      },
    };
  }
  const merged = mergePapers(licencePapers(outlet.data), filedPapers(onFile.data.rows));
  const h = papersHealth(merged.all);
  const name = (item: Parameters<typeof paperName>[0]) => paperName(item, lang, t);
  const text =
    h.kind === 'valid'
      ? t('pump.health.papers.valid')
      : h.kind === 'none'
        ? t('pump.health.papers.none')
        : h.kind === 'expired'
          ? t('pump.paper.expired', { paper: name(h.item) })
          : h.kind === 'today'
            ? t('pump.paper.today', { paper: name(h.item) })
            : tn('pump.paper.days', h.days, { paper: name(h.item) });
  // Amber is for what needs doing soon: a paper ending in a month is information, with its days.
  const status: Status = h.kind === 'days' && h.days > PAPER_AMBER_DAYS ? 'info' : h.status;
  return { ...base, phase: 'ready', status, text, meta: where };
}

function useTeamModel(enabled: boolean): RowModel | null {
  const t = useT();
  const tn = useTn();
  const selfId = useAuthStore((s) => s.user?.id);
  const q = useTeamUsers(enabled);
  if (!enabled) return null;
  const base = { id: 'team', to: '/settings/team' };
  const where = t('pump.where.team');
  if (waiting(q)) return { ...base, phase: 'wait', status: 'info', text: '' };
  if (q.isError) {
    return { ...base, phase: 'failed', status: 'attention', text: t('pump.health.failed'), meta: where, retry: () => void q.refetch() };
  }
  if (!q.data) return null;
  const h = teamHealth(q.data, selfId);
  const parts: string[] = [];
  if (h.managers > 0) parts.push(tn('pump.health.team.managers', h.managers));
  if (h.partners > 0) parts.push(tn('pump.health.team.partners', h.partners));
  if (h.notYet > 0) parts.push(tn('pump.health.team.notYet', h.notYet));
  if (parts.length === 0) parts.push(t('pump.health.team.alone'));
  return { ...base, phase: 'ready', status: h.status, text: parts.join(', '), meta: where };
}

/** The row while its answer is on the way: a plain grey line, announced once as "Loading". */
function RowSkeleton() {
  return (
    <div className="flex min-h-14 flex-col justify-center py-2">
      <SkeletonBlock lines={1} />
    </div>
  );
}

/** "How things stand": the rows this person may see, the worst first. */
export function StandRows({ isOwner }: { isOwner: boolean }) {
  const t = useT();
  const navigate = useNavigate();
  const models = [
    useServicesModel(),
    useMoneyModel(isOwner),
    useLoginsModel(isOwner),
    usePapersModel(),
    useTeamModel(isOwner),
  ].filter((m): m is RowModel => m !== null);
  // Array.sort is stable, so rows of one kind keep the order of the page (Services, Bill, Logins, Papers, Team).
  const rows = [...models].sort((a, b) => rankOf(a) - rankOf(b));
  return (
    <>
      {rows.map((row) =>
        row.phase === 'wait' ? (
          <RowSkeleton key={row.id} />
        ) : row.phase === 'failed' ? (
          <InsightRow
            key={row.id}
            status="attention"
            text={row.text}
            {...(row.meta ? { meta: row.meta } : {})}
            action={{ label: t('kit.retry'), onPress: () => row.retry?.() }}
          />
        ) : (
          <StandRow
            key={row.id}
            status={row.status}
            text={row.text}
            {...(row.meta ? { meta: row.meta } : {})}
            onPress={() => navigate(row.to)}
          />
        ),
      )}
    </>
  );
}
