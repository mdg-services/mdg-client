import { AskMdgButton } from '@/components/kit/AskMdgButton';
import { DeltaChip } from '@/components/kit/DeltaChip';
import { MiniBars } from '@/components/kit/MiniBars';
import { Num } from '@/components/kit/Num';
import { ProgressBar } from '@/components/kit/ProgressBar';
import { StatusPill } from '@/components/kit/StatusPill';
import { docName } from '@/features/reports/kinds/paper_expiry';
import { viewOfData } from '@/features/reports/registry';
import { cn } from '@/lib/cn';
import { fmtDay, fmtDays, fmtInt, fmtLitres, fmtMoney, fmtTime } from '@/lib/fmt';

import {
  creditModel,
  densityLines,
  dsrModel,
  ordersInFlight,
  papersSorted,
  paperStatus,
  planModel,
  waterModel,
} from './panelModels';
import {
  CoverBar,
  Fact,
  LitresBig,
  PanelHeading,
  PanelList,
  PanelRow,
  PanelStack,
  Small,
  WRAP,
  type PanelCtx,
  type PanelOut,
} from './parts';
import { VariationBar } from './VariationBar';

/** The panels of the services that report every day. Each returns null when the page holds nothing to say yet. */

// ── Daily sales report ──────────────────────────────────────────────────────

export function renderDsr(ctx: PanelCtx): PanelOut | null {
  const { t, lang, now } = ctx;
  const m = dsrModel(ctx.reports, ctx.isOwner, lang);
  if (!m) return null;
  const sales = m.sales;
  const values = sales?.bars.map((b) => b.litres).filter((v): v is number => v !== null) ?? [];
  const top = sales?.bars.reduce<{ day: string; litres: number } | null>(
    (best, b) =>
      b.litres !== null && (!best || b.litres > best.litres)
        ? { day: b.day, litres: b.litres }
        : best,
    null,
  );
  const asOf = [sales?.sentAt, m.variation?.sentAt]
    .filter((x): x is string => !!x)
    .sort()
    .pop();
  const average = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : undefined;
  const firstBar = sales?.bars[0];
  const lastBar = sales?.bars[sales.bars.length - 1];
  return {
    asOf,
    // The card says what it is about, once: the day of the sales. (It used to say "Right now" over a
    // hero labelled "yesterday's sales" over a line saying "till tonight 12:21": three time words.)
    ...(sales ? { title: t('svc.dsr.soldOn', { day: fmtDay(sales.day, lang, now) }) } : {}),
    content: (
      <PanelStack>
        {sales ? (
          <section aria-label={t('svc.dsr.sales')} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <LitresBig n={sales.totalL} lang={lang} />
              {sales.deltaPct !== null ? (
                <span>
                  <DeltaChip
                    dir={sales.deltaPct > 0 ? 'up' : sales.deltaPct < 0 ? 'down' : 'same'}
                    n={Math.abs(sales.deltaPct)}
                    unit="%"
                    against={t('svc.dsr.againstLast', { weekday: sales.weekday })}
                  />
                </span>
              ) : null}
            </div>
            <PanelList label={t('svc.dsr.perFuel')}>
              {sales.fuels.map((f) => (
                // One grid for every fuel: the name, then the litres at the right edge, then the change
                // under the name. Two rows with different widths no longer wrap differently.
                <li
                  key={f.key}
                  className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1 py-2"
                >
                  <span className={cn(WRAP, 'text-body text-text')}>{f.fuel}</span>
                  <span className="text-right text-body font-semibold text-text">
                    <Num>{fmtLitres(f.soldL, lang)}</Num>
                  </span>
                  {f.deltaPct !== null ? (
                    <span className="col-span-2">
                      <DeltaChip
                        dir={f.deltaPct > 0 ? 'up' : f.deltaPct < 0 ? 'down' : 'same'}
                        n={Math.abs(f.deltaPct)}
                        unit="%"
                        against={t('svc.dsr.againstLast', { weekday: sales.weekday })}
                      />
                    </span>
                  ) : null}
                </li>
              ))}
            </PanelList>
            {sales.bars.length > 0 && top ? (
              <div className="flex flex-col gap-1">
                <MiniBars
                  data={sales.bars.map((b) => ({
                    label: fmtDay(b.day, lang, now),
                    value: b.litres,
                  }))}
                  {...(average !== undefined ? { average } : {})}
                  summary={t('svc.dsr.bars.summary', {
                    n: sales.bars.length,
                    litres: fmtLitres(top.litres, lang),
                    day: fmtDay(top.day, lang, now),
                  })}
                />
                {firstBar && lastBar ? (
                  <p className="flex flex-wrap justify-between gap-x-3 text-meta text-text-muted">
                    <span>{fmtDay(firstBar.day, lang, now)}</span>
                    <span>
                      {lastBar.litres !== null
                        ? t('svc.dsr.bars.last', {
                            day: fmtDay(lastBar.day, lang, now),
                            litres: fmtLitres(lastBar.litres, lang),
                          })
                        : fmtDay(lastBar.day, lang, now)}
                    </span>
                  </p>
                ) : null}
                {average !== undefined ? (
                  <p className="flex items-start gap-2 text-meta text-text">
                    <span
                      aria-hidden
                      className="mt-2.5 w-5 shrink-0 border-t-2 border-dashed border-text-muted"
                    />
                    <span className={WRAP}>
                      {t('svc.dsr.avg', { n: sales.bars.length, litres: fmtLitres(average, lang) })}
                    </span>
                  </p>
                ) : null}
              </div>
            ) : null}
            {sales.monthL !== null ? (
              <Fact>{t('glance.sales.month', { litres: fmtLitres(sales.monthL, lang) })}</Fact>
            ) : null}
            {sales.corrected.map((c) => (
              <p
                key={c.fuel}
                className="break-words rounded-md bg-surface-2 p-3 text-body text-text"
              >
                {t('svc.dsr.corrected', {
                  fuel: c.fuel,
                  from: fmtLitres(c.fromL, lang),
                  to: fmtLitres(c.toL, lang),
                })}
              </p>
            ))}
          </section>
        ) : m.salesPending ? (
          <Fact>{t('svc.dsr.pending')}</Fact>
        ) : null}

        {m.variation ? (
          <section aria-label={t('svc.dsr.variation')} className="flex flex-col gap-3">
            <PanelHeading>{t('svc.dsr.variation')}</PanelHeading>
            {m.variation.beforeInspection ? <Small>{t('svc.dsr.beforeInspection')}</Small> : null}
            {m.variation.fuels.map((f) => (
              <div key={f.key} className="flex flex-col gap-1">
                <VariationBar
                  fuel={f.fuel}
                  value={f.value}
                  low={f.low}
                  high={f.high}
                  status={f.inside ? 'ok' : 'attention'}
                  word={
                    f.inside
                      ? t('svc.dsr.inside')
                      : t('svc.dsr.beyond', { litres: fmtLitres(f.beyondL, lang) })
                  }
                />
                {f.inside ? (
                  <Small>
                    {t('glance.variation.room', {
                      room: fmtLitres(f.roomL, lang),
                      allowed: fmtLitres(f.permissibleL, lang),
                    })}
                  </Small>
                ) : null}
              </div>
            ))}
            {m.insideDays ? (
              <Fact>{t('glance.variation.days', { n: m.insideDays.n, m: m.insideDays.m })}</Fact>
            ) : null}
          </section>
        ) : null}
      </PanelStack>
    ),
  };
}

// ── Credit and DOD (owner) ──────────────────────────────────────────────────

export function renderCredit(ctx: PanelCtx): PanelOut | null {
  const { t, tn, lang, now } = ctx;
  if (!ctx.isOwner) return null;
  const m = creditModel(ctx.reports, now);
  if (!m) return null;
  const money = (rupees: number) => fmtMoney(Math.round(rupees * 100), lang);
  const owes = m.verdict !== 'settled' && m.verdict !== 'advance' && m.amount > 0 && !!m.date;
  const left = m.daysLeft;
  return {
    asOf: m.sentAt,
    content: (
      <PanelStack>
        {owes ? (
          <div className="flex flex-col gap-2">
            <p className="break-words text-title text-text">
              {t('glance.deposit.line', {
                amount: money(m.amount),
                day: fmtDay(m.date!, lang, now),
              })}
            </p>
            {left !== null ? (
              <span>
                <StatusPill
                  status={left < 0 ? 'problem' : left === 0 ? 'attention' : 'info'}
                  word={
                    left === 0
                      ? t('glance.deposit.last')
                      : left > 0
                        ? tn('glance.deposit.left', left)
                        : tn('glance.deposit.late', -left)
                  }
                />
              </span>
            ) : null}
          </div>
        ) : m.verdict === 'advance' ? (
          <Fact>{t('svc.credit.advance', { amount: money(m.amount) })}</Fact>
        ) : (
          <Fact>{t('svc.credit.settled')}</Fact>
        )}
        {m.usedPct !== null ? (
          <ProgressBar
            value={m.usedPct}
            max={100}
            text={t('glance.deposit.limit', { pct: fmtInt(m.usedPct) })}
          />
        ) : null}
        {m.available > 0 ? (
          <Fact>{t('svc.credit.room', { amount: money(m.available) })}</Fact>
        ) : null}
        {m.review ? (
          <Fact>
            {m.review.lapsed
              ? t('svc.credit.reviewLapsed')
              : t('svc.credit.review', { day: fmtDay(m.review.on, lang, now) })}
          </Fact>
        ) : null}
      </PanelStack>
    ),
  };
}

// ── Water checks ────────────────────────────────────────────────────────────

export function renderWater(ctx: PanelCtx): PanelOut | null {
  const { t } = ctx;
  const m = waterModel(ctx.reports, ctx.isOwner);
  if (!m) return null;
  const d = m.data;
  return {
    asOf: m.sentAt,
    content: (
      <PanelStack>
        <ProgressBar
          value={d.recordedSlots}
          max={d.totalSlots}
          text={t('glance.water.line', {
            done: fmtInt(d.recordedSlots),
            total: fmtInt(d.totalSlots),
          })}
        />
        {d.missedSlots > 0 ? (
          <span>
            <StatusPill
              status="attention"
              word={t('glance.water.missed', { n: fmtInt(d.missedSlots) })}
            />
          </span>
        ) : null}
        {d.dayState === 'running' ? <Small>{t('svc.water.running')}</Small> : null}
        {d.lastCheckFailed ? <Small>{t('svc.water.failed')}</Small> : null}
        <PanelList label={t('svc.water.slots')}>
          {d.slots.map((s) => (
            <PanelRow
              key={`${s.startMin}-${s.endMin}`}
              status={s.state === 'recorded' ? 'ok' : s.state === 'missed' ? 'attention' : 'info'}
              word={t(
                s.state === 'recorded'
                  ? 'svc.water.slot.recorded'
                  : s.state === 'missed'
                    ? 'svc.water.slot.missed'
                    : 'svc.water.slot.open',
              )}
              text={s.label}
            />
          ))}
        </PanelList>
      </PanelStack>
    ),
  };
}

// ── Load planner ────────────────────────────────────────────────────────────

/** "HH:mm" on an India day as an instant, so the time is said on the dealer's clock and in his language. */
function clockOn(day: string, hhmm: string | null): string | null {
  if (!hhmm || !/^\d{2}:\d{2}/.test(hhmm)) return null;
  const at = new Date(`${day}T${hhmm.slice(0, 5)}:00+05:30`);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

export function renderPlan(ctx: PanelCtx): PanelOut | null {
  const { t, tn, lang, now } = ctx;
  const m = planModel(ctx.reports, ctx.isOwner, lang);
  if (!m) return null;
  const v = m.data.verdict;
  const verdict: { word: string; status: 'problem' | 'attention' | 'ok' } =
    v.code === 'ORDER_NOW_RUNNING_OUT'
      ? { word: t('svc.plan.v.now'), status: 'problem' }
      : v.code === 'ORDER_NOW_DEPOT_CLOSED'
        ? { word: t('svc.plan.v.depot'), status: 'problem' }
        : v.code === 'ORDER_TODAY'
          ? { word: t('glance.tanker.order'), status: 'attention' }
          : v.code === 'NEXT_ORDER' && v.nextOrderOn
            ? {
                word: t('svc.plan.v.next', { day: fmtDay(v.nextOrderOn, lang, now) }),
                status: 'ok',
              }
            : { word: t('svc.plan.v.none', { n: v.horizonDays }), status: 'ok' };
  const order = m.data.order;
  const arriveDay = order ? (order.arriveDate ?? order.arriveOn) : null;
  const arriveAt = order && arriveDay ? clockOn(arriveDay, order.arriveTime) : null;
  return {
    asOf: m.sentAt,
    content: (
      <PanelStack>
        <div className="flex flex-col items-start gap-2">
          <StatusPill status={verdict.status} word={verdict.word} />
          {order && arriveDay ? (
            <p className="break-words text-subheading text-text">
              {arriveAt || order.arriveTime
                ? t('glance.tanker.arrives', {
                    day: fmtDay(arriveDay, lang, now),
                    // A clock time the app cannot read is shown as it came, never dropped.
                    time: arriveAt ? fmtTime(arriveAt, lang) : order.arriveTime!,
                  })
                : t('svc.plan.arrivesDay', { day: fmtDay(arriveDay, lang, now) })}
            </p>
          ) : null}
        </div>
        {m.pools.map((p) => {
          // Two diesel pools are told apart by their tanks; the low line is said once, not on every bar.
          const heading =
            p.tankNos.length > 0
              ? tn('svc.plan.pool', p.tankNos.length, { fuel: p.fuel, tanks: p.tankNos.join(', ') })
              : p.fuel;
          return (
            <section key={p.key} aria-label={heading} className="flex flex-col gap-3">
              <PanelHeading>{heading}</PanelHeading>
              {p.days.length === 0 ? (
                <Fact>{t('svc.plan.noCount')}</Fact>
              ) : (
                <>
                  {p.lowLineL > 0 ? (
                    <Small>
                      {t('svc.plan.lowLineOnce', { litres: fmtLitres(p.lowLineL, lang) })}
                    </Small>
                  ) : null}
                  {p.days.map((d) => (
                    <CoverBar
                      key={d.date}
                      value={d.stockL}
                      max={p.capacityL > 0 ? p.capacityL : Math.max(d.stockL, p.lowLineL, 1)}
                      lowAt={p.lowLineL}
                      below={p.lowLineL > 0 && d.stockL < p.lowLineL}
                      belowWord={t('svc.plan.below')}
                      text={
                        d.daysLeft !== null
                          ? t('svc.plan.bar', {
                              day: fmtDay(d.date, lang, now),
                              litres: fmtLitres(d.stockL, lang),
                              days: fmtDays(d.daysLeft),
                            })
                          : t('svc.plan.barNoDays', {
                              day: fmtDay(d.date, lang, now),
                              litres: fmtLitres(d.stockL, lang),
                            })
                      }
                    />
                  ))}
                </>
              )}
            </section>
          );
        })}
        {m.orderNow ? (
          <AskMdgButton
            variant="primary"
            label={t('today.card.planOrder')}
            draft={t('svc.plan.draft')}
            className="self-stretch"
          />
        ) : null}
      </PanelStack>
    ),
  };
}

// ── Fuel orders ─────────────────────────────────────────────────────────────

export function renderFuelOrders(ctx: PanelCtx): PanelOut | null {
  const { t, lang, now } = ctx;
  const orders = ordersInFlight(ctx.reports, ctx.isOwner);
  const any = ctx.reports.some((r) => r.kind === 'fuel_order');
  if (!any) return null;
  if (orders.length === 0) return { content: <Fact>{t('svc.fuel.none')}</Fact> };
  return {
    asOf: orders[0]!.report.sentAt,
    content: (
      <PanelList label={t('svc.fuel.title')}>
        {orders.map(({ report, data }) => {
          const headline = viewOfData(data).headline(data as never, lang);
          const meta = [
            data.deliveryDay
              ? t('svc.fuel.delivery', { day: fmtDay(data.deliveryDay, lang, now) })
              : null,
            data.ttNo ? t('svc.fuel.tt', { no: data.ttNo }) : null,
            data.totalKl !== null ? t('svc.fuel.kl', { n: fmtInt(data.totalKl) }) : null,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <PanelRow
              key={report.messageId}
              text={headline || report.headline}
              {...(meta ? { meta } : {})}
            />
          );
        })}
      </PanelList>
    ),
  };
}

// ── TT density ──────────────────────────────────────────────────────────────

export function renderDensity(ctx: PanelCtx): PanelOut | null {
  const { t, lang, now } = ctx;
  if (!ctx.reports.some((r) => r.kind === 'tanker_density')) return null;
  const lines = densityLines(ctx.reports, ctx.isOwner, lang);
  if (lines.length === 0) return null;
  const newest = ctx.reports
    .filter((r) => r.kind === 'tanker_density')
    .map((r) => r.sentAt)
    .sort()
    .pop();
  return {
    ...(newest ? { asOf: newest } : {}),
    content: (
      <PanelList label={t('svc.dens.title')}>
        {lines.map((l) => (
          <PanelRow
            key={l.key}
            text={
              <>
                {t('svc.dens.label', { fuel: l.fuel })} <Num>{l.density}</Num>
              </>
            }
            meta={t('svc.dens.from', { day: fmtDay(l.day, lang, now) })}
          />
        ))}
      </PanelList>
    ),
  };
}

// ── Tanker papers ───────────────────────────────────────────────────────────

const PAPERS_SHOWN = 8;

export function renderPapers(ctx: PanelCtx): PanelOut | null {
  const { t, tn, lang } = ctx;
  const m = papersSorted(ctx.reports, ctx.isOwner, ctx.now);
  if (!m || m.items.length === 0) return null;
  const shown = m.items.slice(0, PAPERS_SHOWN);
  const hidden = m.items.length - shown.length + m.moreCount;
  return {
    asOf: m.sentAt,
    content: (
      <PanelStack>
        <PanelList label={t('svc.papers.title')}>
          {shown.map(({ item, days }, i) => {
            const paper = docName(item, lang);
            return (
              <PanelRow
                key={`${item.vehicleReg ?? 'pump'}-${item.docType}-${i}`}
                status={paperStatus(days)}
                {...(days < 0 ? { word: t('svc.papers.expired') } : {})}
                text={
                  days < 0
                    ? t('glance.paper.expired', { paper })
                    : tn('glance.paper.days', days, { paper })
                }
                {...(item.vehicleReg
                  ? { meta: t('svc.papers.vehicle', { reg: item.vehicleReg }) }
                  : {})}
              />
            );
          })}
        </PanelList>
        {hidden > 0 ? <Small>{tn('kit.more', hidden)}</Small> : null}
      </PanelStack>
    ),
  };
}
