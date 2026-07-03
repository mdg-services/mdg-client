import {
  Check,
  ChevronLeft,
  Minus,
  Plus,
  Search,
  X,
} from 'lucide-react';
import * as React from 'react';

import type { EmployeeWithPoints, StaffWorkItem } from '@dk/shared/types';
import { STAFF_WORK_DOMAINS } from '@dk/shared/types';

import { Avatar, Button, Input, Spinner } from '@/components/ui';
import { useAwardStaffPoints } from '@/hooks/api/useStaffPoints';
import { useStaffWorkItems } from '@/hooks/api/useStaffWorkItems';
import { cn } from '@/lib/cn';
import { pick, useLang, useT } from '@/lib/i18n';
import {
  DOMAIN_LABEL_KEY,
  fmtPoints,
  istDate,
  perEmployeePoints,
  totalAwardPoints,
} from '@/lib/staff';

type Step = 'worker' | 'work' | 'configure';

/**
 * The core "Give points" flow — a bottom-sheet, one worker/one task/one tap by
 * default. The sheet's split/each/per-unit rules stay hidden until the chosen
 * task needs them; the raw enum words never appear, only plain bilingual copy.
 */
export function GivePointsFlow({
  dealerId,
  employees,
  onClose,
}: {
  dealerId: string | undefined;
  employees: EmployeeWithPoints[];
  onClose: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const workItemsQuery = useStaffWorkItems();
  const award = useAwardStaffPoints(dealerId);

  const [step, setStep] = React.useState<Step>('worker');
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [workItem, setWorkItem] = React.useState<StaffWorkItem | null>(null);
  const [quantity, setQuantity] = React.useState(1);
  const [workDate, setWorkDate] = React.useState(() => istDate());
  const [search, setSearch] = React.useState('');

  const today = istDate();
  const count = selectedIds.length;
  const multi =
    !!workItem &&
    (workItem.distribution === 'SPLIT' || workItem.distribution === 'EACH');

  const pickWorker = (id: string) => {
    setSelectedIds([id]);
    setStep('work');
  };

  const toggleWorker = (id: string) => {
    setSelectedIds((curr) => {
      if (curr.includes(id)) {
        // Never remove the last worker — an award needs someone.
        return curr.length === 1 ? curr : curr.filter((x) => x !== id);
      }
      return [...curr, id];
    });
  };

  const chooseWork = (item: StaffWorkItem) => {
    setWorkItem(item);
    setQuantity(1);
    setStep('configure');
  };

  const goBack = () => {
    if (step === 'configure') setStep('work');
    else if (step === 'work') setStep('worker');
  };

  const confirm = () => {
    if (!workItem || count === 0) return;
    award.mutate(
      {
        employeeIds: selectedIds,
        workItemCode: workItem.code,
        ...(workItem.distribution === 'PER_UNIT' ? { quantity } : {}),
        workDate,
      },
      { onSuccess: onClose },
    );
  };

  const title =
    step === 'worker'
      ? t('staff.give.step1')
      : step === 'work'
        ? t('staff.give.step2')
        : t('staff.give.step3');

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <button
        type="button"
        aria-label={t('common.cancel')}
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />

      {/* Sheet */}
      <div className="relative mx-auto flex max-h-[88vh] w-full max-w-md flex-col rounded-t-2xl border border-border bg-surface shadow-lg">
        <header className="flex items-center gap-2 border-b border-border px-3 py-3">
          {step !== 'worker' ? (
            <button
              type="button"
              aria-label={t('staff.give.step1')}
              onClick={goBack}
              className="flex h-11 w-11 items-center justify-center rounded-full text-text-muted active:bg-surface-2"
            >
              <ChevronLeft width={20} strokeWidth={1.75} />
            </button>
          ) : (
            <span className="h-11 w-11" />
          )}
          <h2 className="flex-1 text-center text-sm font-semibold text-text">
            {title}
          </h2>
          <button
            type="button"
            aria-label={t('common.cancel')}
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-full text-text-muted active:bg-surface-2"
          >
            <X width={20} strokeWidth={1.75} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {step === 'worker' ? (
            <WorkerPicker employees={employees} onPick={pickWorker} t={t} />
          ) : step === 'work' ? (
            <WorkPicker
              items={workItemsQuery.data ?? []}
              loading={workItemsQuery.isLoading}
              search={search}
              onSearch={setSearch}
              onChoose={chooseWork}
              lang={lang}
              t={t}
            />
          ) : workItem ? (
            <Configure
              workItem={workItem}
              employees={employees}
              selectedIds={selectedIds}
              multi={multi}
              onToggle={toggleWorker}
              quantity={quantity}
              onQuantity={setQuantity}
              workDate={workDate}
              onWorkDate={setWorkDate}
              maxDate={today}
              lang={lang}
              t={t}
            />
          ) : null}
        </div>

        {step === 'configure' && workItem ? (
          <footer className="border-t border-border p-3">
            <Button
              fullWidth
              size="lg"
              loading={award.isPending}
              onClick={confirm}
            >
              {t('staff.give.confirm')} ·{' '}
              {fmtPoints(totalAwardPoints(workItem, count, quantity))}
            </Button>
          </footer>
        ) : null}
      </div>
    </div>
  );
}

/* ───────────────────────────── step 1: worker ─────────────────────────────── */

function WorkerPicker({
  employees,
  onPick,
  t,
}: {
  employees: EmployeeWithPoints[];
  onPick: (id: string) => void;
  t: ReturnType<typeof useT>;
}) {
  if (employees.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-text-muted">
        {t('staff.give.noWorkers')}
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {employees.map((e) => (
        <li key={e.id}>
          <button
            type="button"
            onClick={() => onPick(e.id)}
            className="flex min-h-[56px] w-full items-center gap-3 rounded-2xl border border-border bg-surface px-3 text-left active:bg-surface-2"
          >
            <Avatar name={e.name} size={40} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-text">
                {e.name}
              </span>
              {e.designation ? (
                <span className="block truncate text-xs text-text-muted">
                  {e.designation}
                </span>
              ) : null}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ───────────────────────────── step 2: work ───────────────────────────────── */

function WorkPicker({
  items,
  loading,
  search,
  onSearch,
  onChoose,
  lang,
  t,
}: {
  items: StaffWorkItem[];
  loading: boolean;
  search: string;
  onSearch: (v: string) => void;
  onChoose: (item: StaffWorkItem) => void;
  lang: ReturnType<typeof useLang>;
  t: ReturnType<typeof useT>;
}) {
  const q = search.trim().toLowerCase();
  const groups = React.useMemo(() => {
    const active = items.filter((w) => w.active);
    const filtered = q
      ? active.filter(
          (w) =>
            w.labelEn.toLowerCase().includes(q) ||
            w.labelHi.includes(search.trim()),
        )
      : active;
    return STAFF_WORK_DOMAINS.map((domain) => ({
      domain,
      items: filtered
        .filter((w) => w.domain === domain)
        .sort((a, b) => a.srNo - b.srNo),
    })).filter((g) => g.items.length > 0);
  }, [items, q, search]);

  return (
    <div className="flex flex-col gap-3">
      <div className="sticky top-0 z-10 -mt-1 bg-surface pb-1 pt-1">
        <div className="relative">
          <Search
            width={16}
            strokeWidth={1.75}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle"
          />
          <Input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={t('staff.give.searchWork')}
            className="pl-9"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner size={18} />
        </div>
      ) : groups.length === 0 ? (
        <p className="py-8 text-center text-sm text-text-muted">
          {t('staff.give.noWork')}
        </p>
      ) : (
        groups.map((g) => (
          <section key={g.domain} className="flex flex-col gap-1.5">
            <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-text-subtle">
              {t(DOMAIN_LABEL_KEY[g.domain])}
            </h3>
            {g.items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onChoose(item)}
                className="flex min-h-[52px] w-full items-center gap-3 rounded-2xl border border-border bg-surface px-3 py-2 text-left active:bg-surface-2"
              >
                <span className="min-w-0 flex-1 text-sm font-medium text-text">
                  {pick(lang, item.labelEn, item.labelHi)}
                </span>
                <span className="shrink-0 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand">
                  {fmtPoints(item.points)}
                </span>
              </button>
            ))}
          </section>
        ))
      )}
    </div>
  );
}

/* ─────────────────────────── step 3: configure ────────────────────────────── */

function Configure({
  workItem,
  employees,
  selectedIds,
  multi,
  onToggle,
  quantity,
  onQuantity,
  workDate,
  onWorkDate,
  maxDate,
  lang,
  t,
}: {
  workItem: StaffWorkItem;
  employees: EmployeeWithPoints[];
  selectedIds: string[];
  multi: boolean;
  onToggle: (id: string) => void;
  quantity: number;
  onQuantity: (n: number) => void;
  workDate: string;
  onWorkDate: (d: string) => void;
  maxDate: string;
  lang: ReturnType<typeof useLang>;
  t: ReturnType<typeof useT>;
}) {
  const count = selectedIds.length;
  const per = perEmployeePoints(workItem, count, quantity);
  const isPerUnit = workItem.distribution === 'PER_UNIT';
  const isSplit = workItem.distribution === 'SPLIT';
  const isEach = workItem.distribution === 'EACH';

  const unitLabel =
    workItem.unitLabelEn || workItem.unitLabelHi
      ? pick(
          lang,
          workItem.unitLabelEn ?? workItem.unitLabelHi ?? '',
          workItem.unitLabelHi ?? workItem.unitLabelEn ?? '',
        )
      : t('staff.give.howMany');

  const selected = employees.filter((e) => selectedIds.includes(e.id));

  return (
    <div className="flex flex-col gap-4">
      {/* Chosen work + headline points */}
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface-2 p-3">
        <span className="min-w-0 text-sm font-medium text-text">
          {pick(lang, workItem.labelEn, workItem.labelHi)}
        </span>
        <span className="shrink-0 rounded-full bg-brand-soft px-3 py-1 text-sm font-semibold text-brand">
          {fmtPoints(isPerUnit ? per : workItem.points)}
        </span>
      </div>

      {/* Who: single chip, or a "who did it together?" multi-select */}
      {multi ? (
        <div className="flex flex-col gap-1.5">
          <p className="px-1 text-xs font-semibold text-text-muted">
            {t('staff.give.whoTogether')}
          </p>
          <ul className="flex flex-col gap-1.5">
            {employees.map((e) => {
              const on = selectedIds.includes(e.id);
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => onToggle(e.id)}
                    aria-pressed={on}
                    className={cn(
                      'flex min-h-[52px] w-full items-center gap-3 rounded-2xl border px-3 text-left transition-colors',
                      on
                        ? 'border-brand bg-brand-soft'
                        : 'border-border bg-surface active:bg-surface-2',
                    )}
                  >
                    <Avatar name={e.name} size={36} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">
                      {e.name}
                    </span>
                    <span
                      className={cn(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border',
                        on
                          ? 'border-brand bg-brand text-text-inverse'
                          : 'border-border-strong text-transparent',
                      )}
                    >
                      <Check width={14} strokeWidth={2.5} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {selected.map((e) => (
            <span
              key={e.id}
              className="inline-flex items-center gap-2 rounded-full bg-surface-2 py-1 pl-1 pr-3"
            >
              <Avatar name={e.name} size={28} />
              <span className="text-sm font-medium text-text">{e.name}</span>
            </span>
          ))}
        </div>
      )}

      {/* Per-unit quantity stepper */}
      {isPerUnit ? (
        <div className="flex items-center justify-between rounded-2xl border border-border p-3">
          <span className="text-sm font-medium text-text">{unitLabel}</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="-"
              onClick={() => onQuantity(Math.max(1, quantity - 1))}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-border-strong text-text active:bg-surface-2"
            >
              <Minus width={18} strokeWidth={2} />
            </button>
            <span className="w-8 text-center text-lg font-semibold text-text">
              {quantity}
            </span>
            <button
              type="button"
              aria-label="+"
              onClick={() => onQuantity(quantity + 1)}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-border-strong text-text active:bg-surface-2"
            >
              <Plus width={18} strokeWidth={2} />
            </button>
          </div>
        </div>
      ) : null}

      {/* Split / each explainer (plain copy — never the enum word) */}
      {isSplit || isEach ? (
        <div className="flex items-center justify-between rounded-2xl bg-surface-2 px-3 py-2.5">
          <span className="text-xs text-text-muted">
            {isSplit ? t('staff.give.splitInfo') : t('staff.give.eachInfo')}
          </span>
          <span className="text-sm font-semibold text-text">
            {t('staff.give.perEach', { points: fmtPoints(per) })}
          </span>
        </div>
      ) : null}

      {/* Day (defaults to today; tap to change to a recent day) */}
      <div className="flex flex-col gap-1.5">
        <label className="px-1 text-xs font-semibold text-text-muted">
          {t('staff.give.date')}
        </label>
        <Input
          type="date"
          value={workDate}
          max={maxDate}
          onChange={(e) => onWorkDate(e.target.value || maxDate)}
        />
      </div>
    </div>
  );
}
