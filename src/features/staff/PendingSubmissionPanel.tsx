import { Check, CloudOff, Loader2, Minus, Plus, Trash2 } from 'lucide-react';
import * as React from 'react';

import type { EffectiveWorkItem } from '@dk/shared/types';

import { FinalizeSubmitSheet } from './FinalizeSubmitSheet';

import { Avatar, Button } from '@/components/ui';
import { useClearStaffDraft } from '@/hooks/api/useStaffDraft';
import { type StaffDraftSync } from '@/hooks/api/useStaffDraftSync';
import { cn } from '@/lib/cn';
import { pick, useLang, useT } from '@/lib/i18n';
import {
  buildDraftLines,
  draftLinesTotal,
  fmtPoints,
  round2,
  type DraftLine,
  type NamedEmployee,
} from '@/lib/staff';
import { useStaffDraftStore, type DraftSyncState } from '@/store/staffDraft';

interface WorkerGroup {
  employeeId: string;
  name: string;
  lines: DraftLine[];
  total: number;
}

/**
 * The persistent "Pending submission" panel. Shows the draft grouped by worker
 * with each work + computed points, a running total, per-line remove/edit, an
 * autosave status, and the prominent Final-submit action. Renders nothing when
 * the draft is empty.
 */
export function PendingSubmissionPanel({
  dealerId,
  workItems,
  employees,
  sync,
}: {
  dealerId: string | undefined;
  workItems: EffectiveWorkItem[];
  employees: NamedEmployee[];
  sync: StaffDraftSync;
}) {
  const t = useT();
  const lang = useLang();
  const slice = useStaffDraftStore((s) =>
    dealerId ? s.byDealer[dealerId] : undefined,
  );
  const removeLine = useStaffDraftStore((s) => s.removeLine);
  const updateLine = useStaffDraftStore((s) => s.updateLine);
  const clearDraft = useStaffDraftStore((s) => s.clearDraft);
  const clearServer = useClearStaffDraft(dealerId);

  const [finalizeOpen, setFinalizeOpen] = React.useState(false);
  const [confirmClear, setConfirmClear] = React.useState(false);

  const onClearAll = () => {
    if (!dealerId) return;
    // Wipe the local slice AND the server draft, so it doesn't resurface on the
    // next load. A failed DELETE (offline) still clears locally; the empty state
    // reconciles on the next successful sync.
    clearDraft(dealerId);
    clearServer.mutate();
    setConfirmClear(false);
  };

  const entries = slice?.entries ?? [];

  const { groups, total } = React.useMemo(() => {
    const lines = buildDraftLines(
      entries,
      workItems,
      employees,
      slice?.serverLines,
    );
    const byId = new Map<string, WorkerGroup>();
    const ordered: WorkerGroup[] = [];
    for (const line of lines) {
      let g = byId.get(line.employeeId);
      if (!g) {
        g = { employeeId: line.employeeId, name: line.employeeName, lines: [], total: 0 };
        byId.set(line.employeeId, g);
        ordered.push(g);
      }
      g.lines.push(line);
      g.total = round2(g.total + line.points);
    }
    return { groups: ordered, total: draftLinesTotal(lines) };
  }, [entries, workItems, employees, slice?.serverLines]);

  if (!dealerId || entries.length === 0) return null;

  return (
    <>
      <section className="flex flex-col gap-3 rounded-2xl border border-brand/40 bg-surface p-3 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-text">
              {t('staff.pendingSubmission')}
            </h2>
            <p className="mt-0.5 text-xs text-text-muted">
              {t('staff.pendingHint')}
            </p>
          </div>
          <SyncChip state={sync.syncState} t={t} />
        </div>

        <ul className="flex flex-col gap-2.5">
          {groups.map((g) => (
            <li
              key={g.employeeId}
              className="rounded-xl border border-border bg-surface-2/60 p-2.5"
            >
              <div className="mb-1.5 flex items-center gap-2">
                <Avatar name={g.name} size={28} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text">
                  {g.name}
                </span>
                <span className="shrink-0 text-sm font-bold tabular-nums text-text">
                  {fmtPoints(g.total)}
                </span>
              </div>
              <ul className="flex flex-col gap-1.5">
                {g.lines.map((line) => (
                  <PendingLineRow
                    key={`${line.employeeId}:${line.workItemCode}`}
                    line={line}
                    lang={lang}
                    t={t}
                    disabled={finalizeOpen}
                    onRemove={() =>
                      removeLine(dealerId, line.employeeId, line.workItemCode)
                    }
                    onQuantity={(qty) =>
                      updateLine(dealerId, line.employeeId, line.workItemCode, {
                        quantity: qty,
                      })
                    }
                    onAmount={(amountRupees) =>
                      updateLine(dealerId, line.employeeId, line.workItemCode, {
                        amountRupees,
                      })
                    }
                  />
                ))}
              </ul>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between px-1">
          <span className="text-xs text-text-muted">
            {t('staff.pendingTotal', { points: fmtPoints(total) })}
          </span>
          {confirmClear ? (
            <span className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClearAll}
                className="text-xs font-semibold text-danger active:opacity-70"
              >
                {t('staff.clearDraftConfirm')}
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="text-xs font-semibold text-text-muted active:opacity-70"
              >
                {t('common.cancel')}
              </button>
            </span>
          ) : (
            <button
              type="button"
              disabled={finalizeOpen}
              onClick={() => setConfirmClear(true)}
              className="text-xs font-semibold text-text-muted active:opacity-70 disabled:opacity-50"
            >
              {t('staff.clearDraft')}
            </button>
          )}
        </div>

        <Button fullWidth size="lg" onClick={() => setFinalizeOpen(true)}>
          {t('staff.finalSubmit')} · {fmtPoints(total)}
        </Button>
      </section>

      {finalizeOpen ? (
        <FinalizeSubmitSheet
          dealerId={dealerId}
          totalPoints={total}
          defaultWorkDate={slice?.workDate ?? ''}
          defaultNote={slice?.note}
          dirty={sync.dirty}
          syncState={sync.syncState}
          flush={sync.flush}
          suppressAutosave={sync.suppressAutosave}
          onClose={() => setFinalizeOpen(false)}
        />
      ) : null}
    </>
  );
}

function SyncChip({
  state,
  t,
}: {
  state: DraftSyncState;
  t: ReturnType<typeof useT>;
}) {
  if (state === 'idle') return null;
  const config = {
    saving: {
      icon: <Loader2 width={12} strokeWidth={2} className="animate-spin" />,
      label: t('staff.savingDraft'),
      className: 'bg-warning-soft text-warning',
    },
    saved: {
      icon: <Check width={12} strokeWidth={2.5} />,
      label: t('staff.draftSaved'),
      className: 'bg-success-soft text-success',
    },
    offline: {
      icon: <CloudOff width={12} strokeWidth={2} />,
      label: t('staff.draftOffline'),
      className: 'bg-warning-soft text-warning',
    },
  }[state];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
        config.className,
      )}
    >
      {config.icon}
      {config.label}
    </span>
  );
}

function PendingLineRow({
  line,
  lang,
  t,
  disabled,
  onRemove,
  onQuantity,
  onAmount,
}: {
  line: DraftLine;
  lang: ReturnType<typeof useLang>;
  t: ReturnType<typeof useT>;
  disabled: boolean;
  onRemove: () => void;
  onQuantity: (qty: number) => void;
  onAmount: (amountRupees: number) => void;
}) {
  const isRupee = line.unit === 'rupee-1000';
  const isPerUnit = line.distribution === 'PER_UNIT' && !isRupee;
  const qty = line.quantity ?? 1;

  const [amountText, setAmountText] = React.useState(
    line.amountRupees != null ? String(line.amountRupees) : '',
  );

  const commitAmount = (value: string) => {
    const cleaned = value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
    setAmountText(cleaned);
    const amt = Number(cleaned);
    if (Number.isFinite(amt) && amt > 0) onAmount(amt);
  };

  return (
    <li className="flex items-center gap-2 rounded-lg bg-surface px-2 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-text">
          {pick(lang, line.labelEn, line.labelHi)}
        </p>
        {line.splitAmong && line.splitAmong > 1 ? (
          <p className="text-[11px] text-text-subtle">
            {t('staff.give.splitInfo')}
          </p>
        ) : null}
      </div>

      {isRupee ? (
        <div className="flex shrink-0 items-center gap-1 rounded-lg border border-border-strong bg-surface-2 px-2">
          <span className="text-xs font-semibold text-text-muted">₹</span>
          <input
            value={amountText}
            onChange={(e) => commitAmount(e.target.value)}
            disabled={disabled}
            inputMode="decimal"
            aria-label={t('staff.amountRupees')}
            className="h-8 w-16 bg-transparent text-right text-sm text-text outline-none disabled:opacity-60"
          />
        </div>
      ) : isPerUnit ? (
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            aria-label="-"
            disabled={disabled}
            onClick={() => onQuantity(Math.max(1, qty - 1))}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border-strong text-text active:bg-surface-2 disabled:opacity-50"
          >
            <Minus width={14} strokeWidth={2} />
          </button>
          <span className="w-5 text-center text-sm font-semibold tabular-nums text-text">
            {qty}
          </span>
          <button
            type="button"
            aria-label="+"
            disabled={disabled}
            onClick={() => onQuantity(qty + 1)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border-strong text-text active:bg-surface-2 disabled:opacity-50"
          >
            <Plus width={14} strokeWidth={2} />
          </button>
        </div>
      ) : null}

      <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums text-text">
        {fmtPoints(line.points)}
      </span>
      <button
        type="button"
        aria-label={t('staff.removeLine')}
        disabled={disabled}
        onClick={onRemove}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-subtle active:bg-surface-2 disabled:opacity-50"
      >
        <Trash2 width={15} strokeWidth={1.75} />
      </button>
    </li>
  );
}
