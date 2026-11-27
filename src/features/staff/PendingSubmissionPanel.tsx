import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  CloudOff,
  Loader2,
  Minus,
  Plus,
  Trash2,
} from 'lucide-react';
import * as React from 'react';

import { Button, Card } from '@/components/ui';
import { StatusShape } from '@/features/reports/StatusBadge';
import { useClearStaffDraft } from '@/hooks/api/useStaffDraft';
import { type StaffDraftSync } from '@/hooks/api/useStaffDraftSync';
import { cn } from '@/lib/cn';
import { fmtDay, fmtTime } from '@/lib/fmt';
import { pick, useLang, useT } from '@/lib/i18n';
import { useTn } from '@/lib/messages/_plural';
import {
  buildDraftLines,
  draftLinesTotal,
  fmtPoints,
  fmtPointsGrouped,
  round2,
  type DraftLine,
  type NamedEmployee,
} from '@/lib/staff';
import { useStaffDraftStore, type DraftSyncState } from '@/store/staffDraft';
import type { EffectiveWorkItem } from '@dk/shared/types';

import { FinalizeSubmitSheet } from './FinalizeSubmitSheet';
import { WarriorAvatar } from './WarriorAvatar';

interface WorkerGroup {
  employeeId: string;
  name: string;
  lines: DraftLine[];
  total: number;
}

/**
 * The "Waiting to send" card (spec 4.7). Points count only after the day's sheet is sent with its
 * photo, so what has been given today is invisible in the list until then; this card says the real
 * number ("3 warriors, 62 points not sent yet") and holds the send button, so it is the one place to
 * act. The draft itself, grouped by warrior with each job, its points and the small buttons to change
 * a count or remove a line, is one tap under "See the list". The autosave state sits in the corner.
 * Renders nothing when the draft is empty.
 *
 * The rules of sending are untouched: the photo is mandatory, the draft is flushed before it is
 * committed, a concurrent change is refetched (all in `FinalizeSubmitSheet`).
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
  const tn = useTn();
  const lang = useLang();
  const slice = useStaffDraftStore((s) => (dealerId ? s.byDealer[dealerId] : undefined));
  const removeLine = useStaffDraftStore((s) => s.removeLine);
  const updateLine = useStaffDraftStore((s) => s.updateLine);
  const clearDraft = useStaffDraftStore((s) => s.clearDraft);
  const clearServer = useClearStaffDraft(dealerId);

  const [finalizeOpen, setFinalizeOpen] = React.useState(false);
  const [confirmClear, setConfirmClear] = React.useState(false);
  const [listOpen, setListOpen] = React.useState(false);
  const titleId = React.useId();

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
    const lines = buildDraftLines(entries, workItems, employees, slice?.serverLines);
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

  const changedAt = slice?.updatedAt ?? null;
  const changed = changedAt
    ? t('warr.waiting.changed', { when: `${fmtDay(changedAt, lang)} ${fmtTime(changedAt, lang)}` })
    : null;

  return (
    <>
      <Card
        role="region"
        aria-labelledby={titleId}
        className="flex flex-col gap-3 border-status-waiting p-4"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span aria-hidden className="flex shrink-0 [&>svg]:h-6 [&>svg]:w-6">
              <StatusShape status="waiting" />
            </span>
            <h2 id={titleId} className="min-w-0 break-words text-heading text-text">
              {t('warr.waiting.title')}
            </h2>
          </div>
          <SyncChip state={sync.syncState} t={t} />
        </div>

        <div className="flex flex-col gap-0.5">
          <p className="break-words text-body text-text">
            {tn('warr.waiting', groups.length, { points: fmtPointsGrouped(total) })}
          </p>
          {changed ? <p className="break-words text-meta text-text-muted">{changed}</p> : null}
        </div>

        <Button fullWidth size="lg" onClick={() => setFinalizeOpen(true)}>
          {t('warr.send.cta')}
        </Button>

        <Button
          variant="ghost"
          fullWidth
          aria-expanded={listOpen}
          rightIcon={
            listOpen ? (
              <ChevronUp aria-hidden className="h-5 w-5" />
            ) : (
              <ChevronDown aria-hidden className="h-5 w-5" />
            )
          }
          onClick={() => setListOpen((v) => !v)}
        >
          {listOpen ? t('warr.waiting.hide') : t('warr.waiting.see')}
        </Button>

        {listOpen ? (
          <>
            <p className="break-words text-body text-text-muted">{t('staff.pendingHint')}</p>

            <ul className="flex flex-col gap-3">
              {groups.map((g) => (
                <li
                  key={g.employeeId}
                  className="rounded-xl border border-border bg-surface-2/60 p-3"
                >
                  <div className="mb-2 flex items-center gap-3">
                    <WarriorAvatar name={g.name} />
                    <span className="min-w-0 flex-1 break-words text-subheading text-text">
                      {g.name}
                    </span>
                    <span className="shrink-0 text-subheading tabular-nums text-text">
                      {fmtPoints(g.total)}
                    </span>
                  </div>
                  <ul className="flex flex-col gap-2">
                    {g.lines.map((line) => (
                      <PendingLineRow
                        // The description is part of the line's identity: two "Other cleaning work" rows
                        // for the same man differ only by what was written on them, and a key without it
                        // made React treat them as one row.
                        key={`${line.employeeId}:${line.workItemCode}:${line.note ?? ''}`}
                        line={line}
                        lang={lang}
                        t={t}
                        disabled={finalizeOpen}
                        onRemove={() =>
                          removeLine(dealerId, line.employeeId, line.workItemCode, line.note)
                        }
                        onQuantity={(qty) =>
                          updateLine(
                            dealerId,
                            line.employeeId,
                            line.workItemCode,
                            { quantity: qty },
                            line.note,
                          )
                        }
                        onAmount={(amountRupees) =>
                          updateLine(
                            dealerId,
                            line.employeeId,
                            line.workItemCode,
                            { amountRupees },
                            line.note,
                          )
                        }
                      />
                    ))}
                  </ul>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-center justify-between gap-x-3">
              <span className="text-body text-text-muted">
                {t('staff.pendingTotal', { points: fmtPoints(total) })}
              </span>
              {confirmClear ? (
                <span className="flex items-center gap-1">
                  <Button variant="ghost" className="text-danger" onClick={onClearAll}>
                    {t('staff.clearDraftConfirm')}
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmClear(false)}>
                    {t('common.cancel')}
                  </Button>
                </span>
              ) : (
                <Button
                  variant="ghost"
                  disabled={finalizeOpen}
                  onClick={() => setConfirmClear(true)}
                >
                  {t('staff.clearDraft')}
                </Button>
              )}
            </div>
          </>
        ) : null}
      </Card>

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

function SyncChip({ state, t }: { state: DraftSyncState; t: ReturnType<typeof useT> }) {
  if (state === 'idle') return null;
  const config = {
    saving: {
      icon: <Loader2 aria-hidden className="h-4 w-4 animate-spin" strokeWidth={2} />,
      label: t('staff.savingDraft'),
      className: 'bg-warning-soft text-warning',
    },
    saved: {
      icon: <Check aria-hidden className="h-4 w-4" strokeWidth={2.5} />,
      label: t('staff.draftSaved'),
      className: 'bg-success-soft text-success',
    },
    offline: {
      icon: <CloudOff aria-hidden className="h-4 w-4" strokeWidth={2} />,
      label: t('staff.draftOffline'),
      className: 'bg-warning-soft text-warning',
    },
    // NOT the amber "will sync" chip. The server refused this list and will go
    // on refusing it, so waiting is not the answer and must not be implied.
    rejected: {
      icon: <AlertCircle aria-hidden className="h-4 w-4" strokeWidth={2} />,
      label: t('staff.draftRejected'),
      className: 'bg-danger-soft text-danger',
    },
  }[state];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-meta font-medium',
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
  const work = pick(lang, line.labelEn, line.labelHi);
  const spoken = { work, name: line.employeeName };

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
    <li className="flex flex-col gap-2 rounded-lg bg-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="break-words text-body text-text">{work}</p>
          {/*
            For a catch-all work the description IS the work — "Other cleaning work"
            on its own tells the dealer nothing about what they're about to submit,
            so show what was written rather than making them reopen the flow.
          */}
          {line.note ? (
            <p className="break-words text-body italic text-text-muted">{line.note}</p>
          ) : null}
          {line.splitAmong && line.splitAmong > 1 ? (
            <p className="break-words text-body text-text-muted">{t('staff.give.splitInfo')}</p>
          ) : null}
        </div>
        <span className="shrink-0 text-subheading tabular-nums text-text">
          {fmtPoints(line.points)}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {isRupee ? (
          <div className="flex min-h-11 items-center gap-1 rounded-md border border-border-strong bg-surface-2 px-3">
            <span aria-hidden className="text-body font-semibold text-text-muted">
              ₹
            </span>
            <input
              value={amountText}
              onChange={(e) => commitAmount(e.target.value)}
              disabled={disabled}
              inputMode="decimal"
              aria-label={t('staff.amountRupees')}
              className="min-h-11 w-28 bg-transparent text-right text-body text-text outline-none disabled:opacity-60"
            />
          </div>
        ) : isPerUnit ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label={t('warr.line.less', spoken)}
              disabled={disabled}
              onClick={() => onQuantity(Math.max(1, qty - 1))}
              className="flex h-11 w-11 items-center justify-center rounded-md border border-border-strong text-text active:bg-surface-2 disabled:opacity-50"
            >
              <Minus aria-hidden className="h-5 w-5" strokeWidth={2} />
            </button>
            <span className="min-w-8 text-center text-subheading tabular-nums text-text">
              {qty}
            </span>
            <button
              type="button"
              aria-label={t('warr.line.more', spoken)}
              disabled={disabled}
              onClick={() => onQuantity(qty + 1)}
              className="flex h-11 w-11 items-center justify-center rounded-md border border-border-strong text-text active:bg-surface-2 disabled:opacity-50"
            >
              <Plus aria-hidden className="h-5 w-5" strokeWidth={2} />
            </button>
          </div>
        ) : (
          <span />
        )}

        <button
          type="button"
          aria-label={t('warr.line.remove', spoken)}
          disabled={disabled}
          onClick={onRemove}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-text-muted active:bg-surface-2 disabled:opacity-50"
        >
          <Trash2 aria-hidden className="h-5 w-5" strokeWidth={1.75} />
        </button>
      </div>
    </li>
  );
}
