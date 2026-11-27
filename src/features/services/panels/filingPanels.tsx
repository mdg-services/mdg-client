import { AskMdgButton } from '@/components/kit/AskMdgButton';
import { DayStrip } from '@/components/kit/DayStrip';
import { ProgressBar } from '@/components/kit/ProgressBar';
import { StatusPill } from '@/components/kit/StatusPill';
import { fuelName } from '@/features/reports/kinds/dsr_sales/fmt';
import { viewOfData } from '@/features/reports/registry';
import { fmtDay, fmtDays, fmtInt, fmtLitres, fmtMoney } from '@/lib/fmt';
import type { MessageKey } from '@/lib/i18n';
import type { RoSupplyData } from '@dk/shared/types';

import {
  ackModel,
  calibrationOf,
  declarationsModel,
  duLines,
  electricalOf,
  mockDrillOf,
  stockModel,
  supplyModel,
} from './panelModels';
import {
  Fact,
  L,
  PanelHeading,
  PanelList,
  PanelRow,
  PanelStack,
  Small,
  stamp,
  type PanelCtx,
  type PanelOut,
} from './parts';

/** The panels of the services that file for the owner (receipts), and of the two checks done on request. */

// ── TT acknowledgement ──────────────────────────────────────────────────────

export function renderAck(ctx: PanelCtx): PanelOut | null {
  const { t, tn, lang } = ctx;
  const m = ackModel(ctx.reports, ctx.isOwner);
  if (!m) return null;
  return {
    asOf: m.sentAt,
    content: (
      <PanelStack>
        <Fact>{tn('svc.ack.count', m.receipts)}</Fact>
        {m.shortReceipts === 0 ? (
          <span>
            <StatusPill status="ok" word={t('svc.ack.noneShort')} />
          </span>
        ) : (
          <span>
            <StatusPill status="attention" word={tn('svc.ack.short', m.shortReceipts)} />
          </span>
        )}
        {m.shortL > 0 || m.claimedL > 0 ? (
          <Fact>
            {t('svc.ack.litres', {
              short: fmtLitres(m.shortL, lang),
              claimed: fmtLitres(m.claimedL, lang),
            })}
          </Fact>
        ) : null}
      </PanelStack>
    ),
  };
}

// ── DU OTP ──────────────────────────────────────────────────────────────────

export function renderDuOtp(ctx: PanelCtx): PanelOut | null {
  const { t, tn } = ctx;
  const m = duLines(ctx.reports, ctx.isOwner);
  if (!m) return null;
  return {
    asOf: m.sentAt,
    content: (
      <PanelStack>
        {m.lines.length === 0 ? <Fact>{t('svc.du.none')}</Fact> : null}
        <PanelList label={t('svc.du.title')}>
          {m.lines.map((l) => (
            <PanelRow
              key={l.id}
              status={l.phase === 'pending' ? 'waiting' : 'ok'}
              word={t(l.phase === 'pending' ? 'svc.du.pending' : 'svc.du.filed')}
              text={t('svc.du.line', { make: l.make, model: l.model, nozzle: l.nozzle })}
            />
          ))}
        </PanelList>
        {m.more > 0 ? <Small>{tn('kit.more', m.more)}</Small> : null}
      </PanelStack>
    ),
  };
}

// ── Declarations ────────────────────────────────────────────────────────────

export function renderDeclarations(ctx: PanelCtx): PanelOut | null {
  const { t, tn, lang, now } = ctx;
  const m = declarationsModel(ctx.reports, ctx.isOwner);
  if (!m) return null;
  return {
    asOf: m.sentAt,
    content: (
      <PanelStack>
        {m.streak !== null ? (
          <p className="break-words text-title text-text">{tn('svc.decl.streak', m.streak)}</p>
        ) : null}
        {m.strip.length > 0 ? (
          <DayStrip days={m.strip} subject={t('svc.decl.subject')} now={now} />
        ) : null}
        {m.lastSafetyDay ? (
          <Fact>{t('svc.decl.lastSafety', { day: fmtDay(m.lastSafetyDay, lang, now) })}</Fact>
        ) : null}
        {m.nextWashroomDue ? (
          <Fact>{t('svc.decl.nextWashroom', { day: fmtDay(m.nextWashroomDue, lang, now) })}</Fact>
        ) : null}
      </PanelStack>
    ),
  };
}

// ── Mock drill ──────────────────────────────────────────────────────────────

export function renderMockDrill(ctx: PanelCtx): PanelOut | null {
  const { t, tn, lang, now } = ctx;
  const m = mockDrillOf(ctx.reports, ctx.isOwner);
  if (!m) return null;
  const d = m.data;
  // The next drill's date is not in any field: it is left out, never guessed.
  return {
    asOf: m.sentAt,
    content: (
      <PanelStack>
        {d.drillDay ? (
          <p className="break-words text-subheading text-text">
            {t('svc.drill.last', { day: fmtDay(d.drillDay, lang, now) })}
          </p>
        ) : null}
        {d.durationMinutes !== null ? (
          <Fact>{tn('svc.drill.minutes', d.durationMinutes)}</Fact>
        ) : null}
        {d.personsPresent !== undefined ? (
          <Fact>{tn('svc.drill.people', d.personsPresent)}</Fact>
        ) : null}
        {d.headCountShort ? <Fact>{tn('svc.drill.short', d.headCountShort)}</Fact> : null}
        {d.stage === 'received' ? <Small>{t('svc.drill.received')}</Small> : null}
      </PanelStack>
    ),
  };
}

// ── Electrical audit ────────────────────────────────────────────────────────

export function renderElectrical(ctx: PanelCtx): PanelOut | null {
  const { t, tn, lang, now } = ctx;
  const m = electricalOf(ctx.reports, ctx.isOwner);
  if (!m) return null;
  const view = viewOfData(m.data);
  const line = view.headline(m.data as never, lang);
  const filed = m.data.outcome === 'submitted' || m.data.outcome === 'partly';
  return {
    asOf: m.report.sentAt,
    content: (
      <PanelStack>
        {filed ? (
          <>
            <p className="break-words text-subheading text-text">
              {t('svc.elec.last', { day: fmtDay(m.data.filedAt, lang, now) })}
            </p>
            <Fact>{tn('svc.elec.points', m.data.pointsTotal)}</Fact>
          </>
        ) : line ? (
          <Fact>{line}</Fact>
        ) : null}
      </PanelStack>
    ),
  };
}

// ── Calibration claim (owner) ───────────────────────────────────────────────

export function renderCalibration(ctx: PanelCtx): PanelOut | null {
  const { t, lang, now } = ctx;
  if (!ctx.isOwner) return null;
  const m = calibrationOf(ctx.reports);
  if (!m) return null;
  const d = m.data;
  return {
    asOf: m.sentAt,
    content: (
      <PanelStack>
        <p className="break-words text-title text-text">
          {fmtMoney(Math.round(d.totalAmount * 100), lang)}
        </p>
        <Fact>
          {t('svc.calib.line', { n: fmtInt(d.nozzlesIncluded), total: fmtInt(d.nozzleCount) })}
        </Fact>
        <Small>{t('svc.calib.year', { year: d.financialYear })}</Small>
        <Small>{t('svc.calib.filed', { day: fmtDay(d.filedAt, lang, now) })}</Small>
      </PanelStack>
    ),
  };
}

// ── Supply status (on request) ──────────────────────────────────────────────

/** The sentence for one condition of the supply, when it is fine and when it needs fixing. */
const COND_KEYS: Partial<
  Record<RoSupplyData['rows'][number]['cond'], { ok: MessageKey; bad: MessageKey }>
> = {
  automation_data: { ok: 'svc.cond.automation_data.ok', bad: 'svc.cond.automation_data.bad' },
  pending_otp: { ok: 'svc.cond.pending_otp.ok', bad: 'svc.cond.pending_otp.bad' },
  sdms_dar_block: { ok: 'svc.cond.sdms_dar_block.ok', bad: 'svc.cond.sdms_dar_block.bad' },
  du_tank_comm: { ok: 'svc.cond.du_tank_comm.ok', bad: 'svc.cond.du_tank_comm.bad' },
  mock_drill: { ok: 'svc.cond.mock_drill.ok', bad: 'svc.cond.mock_drill.bad' },
  electrical_audit: { ok: 'svc.cond.electrical_audit.ok', bad: 'svc.cond.electrical_audit.bad' },
  ro_not_auto: { ok: 'svc.cond.ro_not_auto.ok', bad: 'svc.cond.ro_not_auto.bad' },
};

export function renderSupply(ctx: PanelCtx): PanelOut | null {
  const { t, tn, lang, now } = ctx;
  const m = supplyModel(ctx.reports, ctx.isOwner, now);
  if (!m) return null;
  const d = m.data;
  const word =
    m.word === 'open'
      ? t('glance.supply.open')
      : m.word === 'stopped'
        ? tn('glance.supply.stopped', d.failingCount)
        : t('svc.supply.unknown');
  return {
    asOf: m.sentAt,
    content: (
      <PanelStack>
        <div className="flex flex-col items-start gap-2">
          <StatusPill
            status={
              m.old
                ? 'info'
                : m.word === 'open'
                  ? 'ok'
                  : m.word === 'stopped'
                    ? 'problem'
                    : 'attention'
            }
          />
          <p className="break-words text-title text-text">{word}</p>
          {m.old ? (
            <Small>{t('svc.supply.old', { day: fmtDay(d.capturedAt, lang, now) })}</Small>
          ) : null}
        </div>
        <PanelList label={t('svc.supply.conditions')}>
          {d.rows.map((r, i) => {
            const keys = COND_KEYS[r.cond];
            const text = keys ? t(r.mark === 'YES' ? keys.ok : keys.bad) : r.portalText;
            return (
              <PanelRow
                key={`${r.cond}-${i}`}
                status={r.mark === 'YES' ? 'ok' : r.mark === 'NO' ? 'attention' : 'info'}
                word={t(
                  r.mark === 'YES'
                    ? 'svc.supply.mark.ok'
                    : r.mark === 'NO'
                      ? 'svc.supply.mark.bad'
                      : 'svc.supply.mark.unknown',
                )}
                text={r.mark === 'UNKNOWN' && keys ? t(keys.bad) : text}
              />
            );
          })}
        </PanelList>
      </PanelStack>
    ),
  };
}

// ── Stock check (on request) ────────────────────────────────────────────────

export function renderStock(ctx: PanelCtx): PanelOut | null {
  const { t, tn, lang, now } = ctx;
  const m = stockModel(ctx.reports, ctx.isOwner, now);
  if (!m) return null;
  const d = m.data;
  const reading = d.readingAt ? stamp(d.readingAt, lang, now) : null;
  return {
    asOf: m.sentAt,
    content: (
      <PanelStack>
        {reading ? (
          <Fact>
            {m.old
              ? t('glance.stock.old', { time: reading })
              : t('svc.stock.reading', { time: reading })}
          </Fact>
        ) : null}
        {d.fuels.map((f) => {
          const cover = d.cover?.fuels.find((c) => c.fuelKey === f.fuelKey);
          const name = fuelName(f.fuelKey, lang);
          return (
            <section key={f.fuelKey} aria-label={name} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <PanelHeading>{name}</PanelHeading>
                <span className="text-subheading text-text">
                  <L n={f.totalL} lang={lang} />
                </span>
              </div>
              {cover && cover.daysLeft !== null && cover.runOutOn ? (
                <Fact>
                  {tn('glance.stock.cover', cover.daysLeft === 1 ? 1 : 2, {
                    fuel: name,
                    days: fmtDays(cover.daysLeft),
                    day: fmtDay(cover.runOutOn, lang, now),
                  })}
                </Fact>
              ) : null}
              {f.tanks.map((tank) =>
                tank.litres !== null && tank.capacityL ? (
                  <ProgressBar
                    key={tank.tankNo}
                    value={tank.litres}
                    max={tank.capacityL}
                    text={t('svc.stock.tank', {
                      no: tank.tankNo,
                      litres: fmtLitres(tank.litres, lang),
                    })}
                    {...(tank.lowLineL
                      ? {
                          marker: {
                            at: tank.lowLineL,
                            label: t('svc.plan.lowLine', {
                              litres: fmtLitres(tank.lowLineL, lang),
                            }),
                          },
                        }
                      : {})}
                  />
                ) : (
                  <Small key={tank.tankNo}>
                    {tank.litres !== null
                      ? t('svc.stock.tank', {
                          no: tank.tankNo,
                          litres: fmtLitres(tank.litres, lang),
                        })
                      : t('svc.stock.tankNone', { no: tank.tankNo })}
                  </Small>
                ),
              )}
            </section>
          );
        })}
        <AskMdgButton
          label={t('svc.stock.ask')}
          draft={t('svc.stock.draft')}
          className="self-stretch"
        />
      </PanelStack>
    ),
  };
}
