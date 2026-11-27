import type { ReactElement } from 'react';

import type { Lang } from '@/store/lang';
import type { CalibrationClaimData } from '@dk/shared/types';

import { sayWords, type KindView, type OverlayProps, type Words } from '../types';

import { FiledByLine, GlyphBox, Lead, Line, fmtDay, fmtNozzles, fmtNum, fmtRs, istOf, lineHeight, words } from './_paperwork';

/**
 * Calibration subsidy claim (ADR 0056), for owners only: a CHEQUE STUB. A perforated left
 * edge with notches, the amount large in a frame, and one small nozzle icon per nozzle,
 * grouped by dispenser. A stub with a perforation and a rupee amount is the only
 * "money coming" picture in the app.
 */

type Data = CalibrationClaimData;
type Unit = Data['units'][number];

const t = {
  notInClaim: words('इस दावे में नहीं', 'Is claim mein nahi', 'Not in this claim'),
  dispensers: words('डिस्पेंसर', 'Dispenser', 'Dispensers'),
  reference: (ref: string): Words => words(`IndianOil रेफरेंस: ${ref}`, `IndianOil reference: ${ref}`, `IndianOil reference ${ref}`),
  noReference: words('पोर्टल ने कोई रेफरेंस नहीं दिखाया।', 'Portal ne koi reference nahi dikhaya.', 'No reference shown by the portal.'),
  stubYear: words('साल', 'Saal', 'Year'),
};

function lead(data: Data, lang: Lang): string {
  const fy = data.financialYear;
  return sayWords(
    words(
      `हमने आपका कैलिब्रेशन सब्सिडी का दावा ${fy} के लिए जमा कर दिया है।`,
      `Humne aapka calibration subsidy ka claim ${fy} ke liye jama kar diya hai.`,
      `We filed your calibration subsidy claim for ${fy}.`,
    ),
    lang,
  );
}

/** "for 12 nozzles (₹1,050 each)" or, when some were left out, "for 10 of 12 nozzles". */
export function nozzleLine(data: Data, lang: Lang): string {
  const each = fmtRs(data.amountPerNozzle, lang);
  const partial = data.nozzlesIncluded < data.nozzleCount;
  if (partial) {
    return sayWords(
      words(
        `${data.nozzleCount} में से ${data.nozzlesIncluded} नोज़ल के लिए (हर नोज़ल ${each})`,
        `${data.nozzleCount} mein se ${data.nozzlesIncluded} nozzle ke liye (har nozzle ${each})`,
        `for ${data.nozzlesIncluded} of ${data.nozzleCount} nozzles (${each} each)`,
      ),
      lang,
    );
  }
  return sayWords(
    words(`${fmtNozzles(data.nozzlesIncluded, 'hi')} के लिए (हर नोज़ल ${each})`, `${fmtNozzles(data.nozzlesIncluded, 'hl')} ke liye (har nozzle ${each})`, `for ${fmtNozzles(data.nozzlesIncluded, 'en')} (${each} each)`),
    lang,
  );
}

/** The amount as a screen reader should say it. */
function spokenAmount(n: number, lang: Lang): string {
  return sayWords(words(`${fmtNum(n)} रुपये`, `${fmtNum(n)} rupaye`, `${fmtNum(n)} rupees`), lang);
}

// ── the stub ────────────────────────────────────────────────────────────────

/** The torn-off left edge: semicircle notches top and bottom and a dotted perforation between. */
function Perforation(): ReactElement {
  return (
    <svg width="22" height="100%" viewBox="0 0 22 120" preserveAspectRatio="none" aria-hidden="true" focusable="false" className="shrink-0 text-kind-claim-ink" style={{ minHeight: 120 }}>
      <line x1="11" y1="14" x2="11" y2="106" stroke="currentColor" strokeWidth="3" strokeDasharray="1 8" strokeLinecap="round" />
    </svg>
  );
}

function Stub({ data, lang }: { data: Data; lang: Lang }): ReactElement {
  return (
    <div data-cheque-stub className="relative flex overflow-hidden rounded-xl border border-kind-claim bg-kind-claim-soft">
      <div className="flex w-16 shrink-0 flex-col items-center justify-center gap-1 bg-kind-claim px-1 py-2 text-center text-white">
        <span aria-hidden="true" className="text-subheading leading-tight">{sayWords(t.stubYear, lang)}</span>
        <span aria-hidden="true" className="text-subheading leading-tight">{data.financialYear}</span>
      </div>
      <Perforation />
      <div className="min-w-0 flex-1 py-3 pr-3">
        <p className="m-0 text-[40px] font-semibold leading-none text-kind-claim-ink" aria-hidden="true">
          {fmtRs(data.totalAmount, lang)}
        </p>
        <p className="sr-only">{spokenAmount(data.totalAmount, lang)}</p>
        <p className={`mt-2 text-body text-text ${lineHeight(lang)}`}>{nozzleLine(data, lang)}</p>
      </div>
      {/* notches cut into the left edge of the paper, like a torn stub */}
      <span aria-hidden="true" className="absolute -top-2 left-[67px] h-4 w-4 rounded-full bg-surface" />
      <span aria-hidden="true" className="absolute -bottom-2 left-[67px] h-4 w-4 rounded-full bg-surface" />
    </div>
  );
}

// ── the nozzles ─────────────────────────────────────────────────────────────

/** One small fuel nozzle: a handle, a spout and a hose. Decorative; the count is in words. */
function Nozzle({ included }: { included: boolean }): ReactElement {
  return (
    <svg width="22" height="26" viewBox="0 0 22 26" aria-hidden="true" focusable="false" className={included ? 'text-kind-claim-ink' : 'text-text-muted'}>
      <path
        d="M4 24V9a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v3h2.5a2 2 0 0 1 2 2v6.5a1.8 1.8 0 0 1-3.6 0V15.5H16V24"
        fill={included ? 'currentColor' : 'none'}
        fillOpacity={included ? 0.18 : undefined}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={included ? undefined : '2.5 2.5'}
      />
      <rect x="6.5" y="8.5" width="7" height="4" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function UnitCard({ unit, lang }: { unit: Unit; lang: Lang }): ReactElement {
  const label = [unit.serial, unit.make].filter(Boolean).join(' · ');
  const count = Math.min(Math.max(unit.nozzles, 0), 16);
  return (
    <li
      data-included={unit.included ? 'yes' : 'no'}
      className={`rounded-xl p-3 ${unit.included ? 'border border-border bg-surface' : 'border border-dashed border-border-strong bg-surface-2'}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <p className={`text-subheading text-text ${lineHeight(lang)}`}>{label}</p>
        <p className={`text-body text-text ${lineHeight(lang)}`}>{fmtNozzles(unit.nozzles, lang)}</p>
      </div>
      <div className="mt-1 flex flex-wrap gap-1" aria-hidden="true">
        {Array.from({ length: count }, (_, i) => (
          <Nozzle key={i} included={unit.included} />
        ))}
      </div>
      {unit.included ? (
        <p className={`mt-1 flex items-center gap-1 text-subheading text-kind-claim-ink ${lineHeight(lang)}`}>
          <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
            <circle cx="10" cy="10" r="9" className="fill-kind-claim" />
            <path d="M5.5 10.4l3 3 6-6.4" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {sayWords(words('दावे में शामिल', 'Claim mein shaamil', 'In this claim'), lang)}
        </p>
      ) : (
        <p className={`mt-1 text-subheading text-text ${lineHeight(lang)}`}>{sayWords(t.notInClaim, lang)}</p>
      )}
    </li>
  );
}

function Overlay({ data, lang }: OverlayProps<'calibration_claim'>): ReactElement {
  const units = data.units.slice(0, 12);
  return (
    <div data-kind="calibration_claim" className="space-y-4 p-4">
      <Lead lang={lang}>{lead(data, lang)}</Lead>
      <Stub data={data} lang={lang} />
      {units.length > 0 ? (
        <section aria-label={sayWords(t.dispensers, lang)} className="space-y-2">
          <h3 className={`text-subheading text-kind-claim-ink ${lineHeight(lang)}`}>{sayWords(t.dispensers, lang)}</h3>
          <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
            {units.map((u) => (
              <UnitCard key={u.serial} unit={u} lang={lang} />
            ))}
          </ul>
        </section>
      ) : null}
      {data.reference ? (
        <Line lang={lang}>
          {sayWords(words('IndianOil रेफरेंस: ', 'IndianOil reference: ', 'IndianOil reference '), lang)}
          <span className="select-all font-semibold">{data.reference}</span>
        </Line>
      ) : (
        <Line lang={lang} className="text-text-muted">{sayWords(t.noReference, lang)}</Line>
      )}
      <FiledByLine lang={lang} />
    </div>
  );
}

/** The 40 x 28 mini signature: a cheque stub with a perforation. */
function Glyph({ size = 28 }: { size?: number }): ReactElement {
  return (
    <GlyphBox size={size}>
      <rect x="3" y="5" width="34" height="18" rx="3" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path d="M12 7.5v13" stroke="currentColor" strokeWidth="1.8" strokeDasharray="1.6 2.6" strokeLinecap="round" />
      <path d="M17 14h15" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M17 19h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </GlyphBox>
  );
}

function headline(data: Data, lang: Lang): string {
  return sayWords(
    words(
      `सब्सिडी दावा जमा ${fmtRs(data.totalAmount, 'hi')}, ${fmtNozzles(data.nozzlesIncluded, 'hi')}`,
      `Subsidy claim jama ${fmtRs(data.totalAmount, 'hl')}, ${fmtNozzles(data.nozzlesIncluded, 'hl')}`,
      `Subsidy claim filed ${fmtRs(data.totalAmount, 'en')}, ${fmtNozzles(data.nozzlesIncluded, 'en')}`,
    ),
    lang,
  );
}

function share(data: Data, lang: Lang): string {
  const filed = istOf(data.filedAt)?.day;
  const lines = [
    sayWords(
      words(
        `कैलिब्रेशन सब्सिडी दावा ${data.financialYear}: ${fmtRs(data.totalAmount, 'hi')}`,
        `Calibration subsidy claim ${data.financialYear}: ${fmtRs(data.totalAmount, 'hl')}`,
        `Calibration subsidy claim ${data.financialYear}: ${fmtRs(data.totalAmount, 'en')}`,
      ),
      lang,
    ),
    nozzleLine(data, lang),
  ];
  if (filed) lines.push(sayWords(words(`जमा: ${fmtDay(filed, 'hi')}`, `Jama: ${fmtDay(filed, 'hl')}`, `Filed ${fmtDay(filed, 'en')}`), lang));
  if (data.reference) lines.push(t.reference(data.reference)[lang]);
  return lines.join('\n');
}

export const view: KindView<'calibration_claim'> = {
  kind: 'calibration_claim',
  Overlay,
  Glyph,
  tile: () => null,
  alert: () => null,
  headline,
  share,
};
