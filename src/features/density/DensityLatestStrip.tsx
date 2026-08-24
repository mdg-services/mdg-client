import { densityDayLabel } from '@/hooks/api/useDensity';
import { pick, useLang, useT } from '@/lib/i18n';
import {
  ttDensityFreshness,
  type TtLatestDensity,
} from '@dk/shared/types';

/**
 * The reading off the last tanker, for each product, in big type.
 *
 * This is the figure a dealer copies into their own book by hand, which decides
 * everything about how it is printed. Three decimals always — `820.500`, never
 * `820.5` — because the trailing zeros are part of what they are copying. Big,
 * because a fifty-year-old is reading it under a canopy light. And the product's
 * own word only: डीज़ल, not `HSD-BSVI`, not `50700`, not `HSD`.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * -----------------------------
 * No unit. The invoice states none — "kg/m³ at 15 °C" is our reading of the
 * magnitude, not IndianOil's statement — and it would be four characters of
 * jargon on a screen that has none. No invoice number, no document number and no
 * rupee figure: a tax invoice is a financial document and it stays on the admin
 * side. And no second number ANYWHERE — no "your reading", no field, no
 * comparison. This release does not ship a comparison, and a box that invites
 * one is a promise we did not make.
 *
 * The order is the server's. `getLatestDensities` sorts diesel first and both
 * surfaces render what they are given, so the dealer's phone and MDG's screen
 * can never put a different figure at the top of the same outlet.
 */
export function DensityLatestStrip({ latest }: { latest: TtLatestDensity[] }) {
  const t = useT();
  const lang = useLang();

  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-text-subtle">
        {t('density.latestTitle')}
      </h2>

      {latest.length === 0 ? (
        // One calm line. Never a spinner that never resolves, and never a zero.
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <p className="text-sm text-text-muted">{t('density.noReadingYet')}</p>
        </div>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
          {latest.map((item) => {
            const stale = ttDensityFreshness(item.ageDays) === 'STALE';
            const when = densityDayLabel(lang, item.invoiceDate, 'date');
            return (
              <div key={item.productKey} className="p-4">
                <p className="text-[15px] font-semibold leading-snug text-text">
                  {/* A grade nobody has an entry for is named by the words the
                      invoice itself used — the dealer's own staff recognise
                      those, and a guessed label sits beside a number that gets
                      copied into a book. */}
                  {item.provisional
                    ? item.description || item.productKey
                    : pick(lang, item.labelEn, item.labelHi)}
                </p>
                <p className="mt-1 text-[32px] font-semibold leading-none tabular-nums text-text">
                  {formatDensity(item.density15Raw, item.density15)}
                </p>
                <p className="mt-2 text-sm text-text-muted">
                  {t('density.registerLine')}
                </p>
                <p className="mt-1 text-xs text-text-subtle">
                  {item.vehicleNo ? `${when} · ${item.vehicleNo}` : when}
                </p>
                {stale ? (
                  // The figure stays. A three-week-old reading is still the last
                  // true one, and blanking it would be a worse lie than an old
                  // number that says how old it is.
                  <p className="mt-1 text-xs text-warning">
                    {t('density.figureAge', { n: item.ageDays })}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/**
 * The printed figure, always to three decimals.
 *
 * Built from the invoice's own digits, and only falling back to the parsed
 * number if those digits are not a number at all — so what a dealer copies is
 * what IndianOil printed, padded to the precision the register expects.
 */
function formatDensity(raw: string, parsed: number): string {
  const n = Number(raw);
  if (Number.isFinite(n)) return n.toFixed(3);
  return Number.isFinite(parsed) ? parsed.toFixed(3) : raw;
}
