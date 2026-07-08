import { Check, ChevronLeft, Minus, Plus, Search, X } from 'lucide-react';
import * as React from 'react';

import { STAFF_WORK_DOMAINS } from '@dk/shared/types';
import type {
  EffectiveWorkItem,
  EmployeeWithPoints,
  StaffPointDraftEntry,
} from '@dk/shared/types';

import { Avatar, Button, Input, Spinner, useToast } from '@/components/ui';
import { useDealerWorkItems } from '@/hooks/api/useDealerWorkItems';
import { cn } from '@/lib/cn';
import { pick, useLang, useT } from '@/lib/i18n';
import {
  DOMAIN_LABEL_KEY,
  effectiveQuantity,
  fmtPoints,
  isRupeeWork,
  istDate,
  perEmployeePoints,
  totalAwardPointsForWorks,
} from '@/lib/staff';
import { useStaffDraftStore } from '@/store/staffDraft';

type Step = 'worker' | 'work' | 'configure';

/** A chosen work plus how it was quantified (unit count OR raw rupee amount). */
interface ChosenWork {
  item: EffectiveWorkItem;
  quantity?: number;
  amountRupees?: number;
}

/** A rupee work needs a positive amount before it can join the submission. */
function rupeeInvalid(w: ChosenWork): boolean {
  return isRupeeWork(w.item) && (w.amountRupees == null || w.amountRupees <= 0);
}

/**
 * The core "Give points" flow — a bottom-sheet. Pick a worker (one tap), then
 * tick off EVERYTHING they did (multi-select), then confirm. Instead of awarding
 * immediately, the chosen work is APPENDED to the dealer's pending submission
 * (the draft); the leaderboard only moves on final submit. HSD/MS "per ₹1000"
 * works take a real rupee amount; other per-unit works keep the ± counter.
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
  const toast = useToast();
  const workItemsQuery = useDealerWorkItems(dealerId);
  const addEntries = useStaffDraftStore((s) => s.addEntries);

  const [step, setStep] = React.useState<Step>('worker');
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [selectedCodes, setSelectedCodes] = React.useState<string[]>([]);
  const [quantities, setQuantities] = React.useState<Record<string, number>>({});
  const [amounts, setAmounts] = React.useState<Record<string, string>>({});
  const [workDate, setWorkDate] = React.useState(() => istDate());
  const [search, setSearch] = React.useState('');
  const [attempted, setAttempted] = React.useState(false);

  const today = istDate();
  const catalog = workItemsQuery.data ?? [];
  const count = selectedIds.length;

  // The chosen works, resolved from the effective list and ordered like the picker.
  const works: ChosenWork[] = React.useMemo(
    () =>
      selectedCodes
        .map((code) => catalog.find((w) => w.code === code))
        .filter((w): w is EffectiveWorkItem => Boolean(w))
        .sort((a, b) => a.srNo - b.srNo)
        .map((item) => {
          if (isRupeeWork(item)) {
            const raw = (amounts[item.code] ?? '').trim();
            const amt = raw === '' ? NaN : Number(raw);
            return {
              item,
              amountRupees: Number.isFinite(amt) && amt > 0 ? amt : undefined,
            };
          }
          if (item.distribution === 'PER_UNIT') {
            return { item, quantity: quantities[item.code] ?? 1 };
          }
          return { item };
        }),
    [selectedCodes, catalog, quantities, amounts],
  );

  const grandTotal = totalAwardPointsForWorks(works, count);
  // Step 2 has no worker context yet (co-workers are chosen on step 3), so its
  // summary shows one worker's worth — a stable "face value" that matches the
  // per-work badges, instead of a total that silently multiplies by worker count.
  const previewTotal = totalAwardPointsForWorks(works, 1);
  const hasInvalidAmount = works.some(rupeeInvalid);

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

  const forgetInputs = (code: string) => {
    setQuantities((q) => {
      if (!(code in q)) return q;
      const next = { ...q };
      delete next[code];
      return next;
    });
    setAmounts((a) => {
      if (!(code in a)) return a;
      const next = { ...a };
      delete next[code];
      return next;
    });
  };

  const toggleWork = (code: string) => {
    if (selectedCodes.includes(code)) {
      setSelectedCodes((curr) => curr.filter((c) => c !== code));
      forgetInputs(code);
    } else {
      setSelectedCodes((curr) => [...curr, code]);
    }
  };

  const removeWork = (code: string) => {
    // Keep at least one work; the × just hides when a single work remains.
    if (selectedCodes.length <= 1) return;
    setSelectedCodes((curr) => curr.filter((c) => c !== code));
    forgetInputs(code);
  };

  const setQty = (code: string, n: number) => {
    setQuantities((q) => ({ ...q, [code]: Math.max(1, n) }));
  };

  const setAmount = (code: string, value: string) => {
    // Keep digits + one decimal point only — a plain rupee amount.
    const cleaned = value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
    setAmounts((a) => ({ ...a, [code]: cleaned }));
  };

  const goBack = () => {
    if (step === 'configure') setStep('work');
    else if (step === 'work') setStep('worker');
  };

  const confirm = () => {
    if (!dealerId || works.length === 0 || count === 0) return;
    if (hasInvalidAmount) {
      setAttempted(true);
      return;
    }
    const entries: StaffPointDraftEntry[] = [];
    for (const id of selectedIds) {
      for (const w of works) {
        const entry: StaffPointDraftEntry = {
          employeeId: id,
          workItemCode: w.item.code,
        };
        if (isRupeeWork(w.item)) entry.amountRupees = w.amountRupees;
        else if (w.item.distribution === 'PER_UNIT') entry.quantity = w.quantity;
        entries.push(entry);
      }
    }
    addEntries(dealerId, entries, workDate);
    toast.success(t('staff.addedToSubmission'));
    onClose();
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
              items={catalog}
              loading={workItemsQuery.isLoading}
              selectedCodes={selectedCodes}
              search={search}
              onSearch={setSearch}
              onToggle={toggleWork}
              lang={lang}
              t={t}
            />
          ) : (
            <Configure
              works={works}
              employees={employees}
              selectedIds={selectedIds}
              count={count}
              amounts={amounts}
              attempted={attempted}
              onToggleWorker={toggleWorker}
              onQty={setQty}
              onAmount={setAmount}
              onRemoveWork={removeWork}
              onAddMore={() => setStep('work')}
              canRemove={works.length > 1}
              workDate={workDate}
              onWorkDate={setWorkDate}
              maxDate={today}
              lang={lang}
              t={t}
            />
          )}
        </div>

        {step === 'work' ? (
          <footer className="flex flex-col gap-2 border-t border-border p-3">
            {selectedCodes.length > 0 ? (
              <p className="px-1 text-center text-xs text-text-muted">
                {t('staff.give.selectedSummary', {
                  count: selectedCodes.length,
                  points: fmtPoints(previewTotal),
                })}
              </p>
            ) : null}
            <Button
              fullWidth
              size="lg"
              disabled={selectedCodes.length === 0}
              onClick={() => selectedCodes.length > 0 && setStep('configure')}
            >
              {t('staff.give.continue')}
            </Button>
          </footer>
        ) : step === 'configure' ? (
          <footer className="border-t border-border p-3">
            <Button
              fullWidth
              size="lg"
              disabled={hasInvalidAmount}
              onClick={confirm}
            >
              {t('staff.addToSubmission')} · {fmtPoints(grandTotal)}
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

/* ───────────────────────────── step 2: work (multi-select) ─────────────────── */

function WorkPicker({
  items,
  loading,
  selectedCodes,
  search,
  onSearch,
  onToggle,
  lang,
  t,
}: {
  items: EffectiveWorkItem[];
  loading: boolean;
  selectedCodes: string[];
  search: string;
  onSearch: (v: string) => void;
  onToggle: (code: string) => void;
  lang: ReturnType<typeof useLang>;
  t: ReturnType<typeof useT>;
}) {
  const selected = new Set(selectedCodes);
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
        {!q ? (
          <p className="px-1 pt-2 text-xs text-text-subtle">
            {t('staff.give.pickWorkHint')}
          </p>
        ) : null}
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
            {g.items.map((item) => {
              const on = selected.has(item.code);
              return (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => onToggle(item.code)}
                  aria-pressed={on}
                  className={cn(
                    'flex min-h-[52px] w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left transition-colors',
                    on
                      ? 'border-brand bg-brand-soft'
                      : 'border-border bg-surface active:bg-surface-2',
                  )}
                >
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
                  <span className="min-w-0 flex-1 text-sm font-medium text-text">
                    {pick(lang, item.labelEn, item.labelHi)}
                  </span>
                  <span className="shrink-0 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand">
                    {fmtPoints(item.points)}
                  </span>
                </button>
              );
            })}
          </section>
        ))
      )}
    </div>
  );
}

/* ─────────────────────────── step 3: configure ────────────────────────────── */

function Configure({
  works,
  employees,
  selectedIds,
  count,
  amounts,
  attempted,
  onToggleWorker,
  onQty,
  onAmount,
  onRemoveWork,
  onAddMore,
  canRemove,
  workDate,
  onWorkDate,
  maxDate,
  lang,
  t,
}: {
  works: ChosenWork[];
  employees: EmployeeWithPoints[];
  selectedIds: string[];
  count: number;
  amounts: Record<string, string>;
  attempted: boolean;
  onToggleWorker: (id: string) => void;
  onQty: (code: string, n: number) => void;
  onAmount: (code: string, value: string) => void;
  onRemoveWork: (code: string) => void;
  onAddMore: () => void;
  canRemove: boolean;
  workDate: string;
  onWorkDate: (d: string) => void;
  maxDate: string;
  lang: ReturnType<typeof useLang>;
  t: ReturnType<typeof useT>;
}) {
  const selectedSet = new Set(selectedIds);
  const chosen = employees.filter((e) => selectedSet.has(e.id));
  // Only offer the "who else did it?" checklist when there's more than one worker
  // to choose from — otherwise a single chip says it all.
  const canPickWorkers = employees.length > 1;

  return (
    <div className="flex flex-col gap-4">
      {/* Who did it — a single chip, or a checklist to add co-workers */}
      {canPickWorkers ? (
        <div className="flex flex-col gap-1.5">
          <p className="px-1 text-xs font-semibold text-text-muted">
            {t('staff.give.whoTogether')}
          </p>
          <ul className="flex flex-col gap-1.5">
            {employees.map((e) => {
              const on = selectedSet.has(e.id);
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => onToggleWorker(e.id)}
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
          {chosen.map((e) => (
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

      {/* The work(s) they did */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between px-1">
          <p className="text-xs font-semibold text-text-muted">
            {t('staff.give.worksHeader')}
          </p>
          <button
            type="button"
            onClick={onAddMore}
            className="text-xs font-semibold text-brand active:opacity-70"
          >
            {t('staff.give.addMoreWork')}
          </button>
        </div>
        <ul className="flex flex-col gap-1.5">
          {works.map((w) => (
            <WorkRow
              key={w.item.code}
              work={w}
              count={count}
              canRemove={canRemove}
              amount={amounts[w.item.code] ?? ''}
              showError={attempted && rupeeInvalid(w)}
              onQty={onQty}
              onAmount={onAmount}
              onRemove={onRemoveWork}
              lang={lang}
              t={t}
            />
          ))}
        </ul>
      </div>

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

function WorkRow({
  work,
  count,
  canRemove,
  amount,
  showError,
  onQty,
  onAmount,
  onRemove,
  lang,
  t,
}: {
  work: ChosenWork;
  count: number;
  canRemove: boolean;
  amount: string;
  showError: boolean;
  onQty: (code: string, n: number) => void;
  onAmount: (code: string, value: string) => void;
  onRemove: (code: string) => void;
  lang: ReturnType<typeof useLang>;
  t: ReturnType<typeof useT>;
}) {
  const { item } = work;
  const isRupee = isRupeeWork(item);
  const isPerUnit = item.distribution === 'PER_UNIT' && !isRupee;
  const isSplit = item.distribution === 'SPLIT';
  const isEach = item.distribution === 'EACH';
  const per = perEmployeePoints(item, count, effectiveQuantity(work));
  const qty = work.quantity ?? 1;

  const unitLabel =
    item.unitLabelEn || item.unitLabelHi
      ? pick(
          lang,
          item.unitLabelEn ?? item.unitLabelHi ?? '',
          item.unitLabelHi ?? item.unitLabelEn ?? '',
        )
      : t('staff.give.howMany');

  // A plain, one-line explanation of what each worker earns — never the enum word.
  const hint = isSplit
    ? t('staff.give.splitInfo')
    : isEach && count > 1
      ? t('staff.give.eachInfo')
      : null;

  return (
    <li className="rounded-2xl border border-border bg-surface p-3">
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1 text-sm font-medium text-text">
          {pick(lang, item.labelEn, item.labelHi)}
        </span>
        <span className="shrink-0 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand">
          {t('staff.give.perEach', { points: fmtPoints(per) })}
        </span>
        {canRemove ? (
          <button
            type="button"
            aria-label={t('staff.give.removeWork')}
            onClick={() => onRemove(item.code)}
            className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-subtle active:bg-surface-2"
          >
            <X width={16} strokeWidth={2} />
          </button>
        ) : null}
      </div>

      {hint ? <p className="mt-1 text-xs text-text-muted">{hint}</p> : null}

      {isRupee ? (
        <div className="mt-2">
          <div
            className={cn(
              'flex items-center gap-2 rounded-xl border bg-surface-2 px-3',
              showError ? 'border-danger' : 'border-border-strong',
            )}
          >
            <span className="text-base font-semibold text-text-muted">₹</span>
            <input
              value={amount}
              onChange={(e) => onAmount(item.code, e.target.value)}
              inputMode="decimal"
              placeholder={t('staff.enterAmount')}
              aria-label={t('staff.amountRupees')}
              className="h-11 w-full bg-transparent text-[15px] text-text outline-none placeholder:text-text-subtle"
            />
          </div>
          {showError ? (
            <p className="mt-1 px-1 text-xs text-danger">
              {t('staff.amountRequired')}
            </p>
          ) : null}
        </div>
      ) : isPerUnit ? (
        <div className="mt-2 flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2">
          <span className="text-sm font-medium text-text">{unitLabel}</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="-"
              onClick={() => onQty(item.code, qty - 1)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border-strong text-text active:bg-surface"
            >
              <Minus width={18} strokeWidth={2} />
            </button>
            <span className="w-8 text-center text-lg font-semibold text-text">
              {qty}
            </span>
            <button
              type="button"
              aria-label="+"
              onClick={() => onQty(item.code, qty + 1)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border-strong text-text active:bg-surface"
            >
              <Plus width={18} strokeWidth={2} />
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
