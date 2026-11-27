import type { ReactElement } from 'react';

import type { Lang } from '@/store/lang';
import type { ElectricalAuditData } from '@dk/shared/types';

import { sayWords, type KindAlert, type KindView, type OverlayProps, type Words } from '../types';

import { FiledByLine, GlyphBox, Lead, Line, TickPath, fmtPoints, lineHeight, words } from './_paperwork';

/**
 * Electrical audit (ADR 0056): a CLIPBOARD CHECKLIST. A metal clip on top, then one line per
 * audit number: a tick when it is done, a half-tick with a clock when it is saved but the
 * submit is not confirmed, a cross when it failed. The state is also said in words.
 */

type Data = ElectricalAuditData;

/** How one audit line ended. */
export type AuditLineState = 'done' | 'partly' | 'failed';

/** The state of each audit line, from the whole outcome and the audit's own `confirmed`. */
export function auditState(data: Data, audit: Data['audits'][number]): AuditLineState {
  if (data.outcome === 'failed' || data.outcome === 'login_rejected') return 'failed';
  return audit.confirmed ? 'done' : 'partly';
}

/** Points that were not confirmed on the portal (nothing is claimed for a failed run). */
export function pointsStillOpen(data: Data): number {
  if (data.outcome !== 'submitted' && data.outcome !== 'partly') return 0;
  return data.audits.filter((a) => !a.confirmed).reduce((sum, a) => sum + a.points, 0);
}

const STATE_WORD: Record<AuditLineState, Words> = {
  done: words('हो गया', 'Ho gaya', 'Done'),
  partly: words('सेव है, जमा की पुष्टि नहीं', 'Save hai, jama ki pushti nahi', 'Saved, not confirmed'),
  failed: words('नहीं हुआ', 'Nahi hua', 'Not done'),
};

const t = {
  audit: (no: string): Words => words(`ऑडिट ${no}`, `Audit ${no}`, `Audit ${no}`),
  nothingOpen: words('अभी कोई ऑडिट खुला नहीं है।', 'Abhi koi audit khula nahi hai.', 'No audit is open right now.'),
  sheetLabel: words('ऑडिट की सूची', 'Audit ki list', 'Audit checklist'),
};

function lead(data: Data, lang: Lang): string {
  const n = data.pointsTotal;
  switch (data.outcome) {
    case 'submitted':
      return sayWords(
        words(
          `हमने IndianOil के पोर्टल पर ${fmtPoints(n, 'hi')} पूरे लिखे और जमा कर दिए।`,
          `Humne IndianOil ke portal par ${fmtPoints(n, 'hl')} poore likhe aur jama kar diye.`,
          `We marked ${fmtPoints(n, 'en')} as done on IndianOil's portal and submitted them.`,
        ),
        lang,
      );
    case 'nothing_open':
      return sayWords(words('करने के लिए कुछ खुला नहीं था।', 'Karne ke liye kuch khula nahi tha.', 'Nothing was open to do.'), lang);
    case 'partly':
      return sayWords(
        words(
          'हम बीच में रुक गए। पॉइंट सेव हैं, पर जमा होने की पुष्टि नहीं है। हम देख रहे हैं।',
          'Hum beech mein ruk gaye. Point save hain, par jama hone ki pushti nahi hai. Hum dekh rahe hain.',
          'We stopped part-way. Points are saved but the submit is not confirmed. We are looking into it.',
        ),
        lang,
      );
    case 'login_rejected':
      return sayWords(
        words(
          'IndianOil के पोर्टल ने हमारा लॉगिन नहीं माना, इसलिए कुछ जमा नहीं हुआ। हम देख रहे हैं।',
          'IndianOil ke portal ne hamara login nahi mana, isliye kuch jama nahi hua. Hum dekh rahe hain.',
          "IndianOil's portal did not accept the login, so nothing was filed. We are looking into it.",
        ),
        lang,
      );
    case 'failed':
      return sayWords(
        words('ऑडिट जमा नहीं हो पाया। हम देख रहे हैं।', 'Audit jama nahi ho paya. Hum dekh rahe hain.', 'The audit did not go through. We are looking into it.'),
        lang,
      );
  }
}

// ── the clipboard ───────────────────────────────────────────────────────────

function StateIcon({ state }: { state: AuditLineState }): ReactElement {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true" focusable="false" className="shrink-0 text-kind-paperwork-ink">
      {state === 'done' ? (
        <>
          <rect x="3" y="3" width="26" height="26" rx="7" className="fill-kind-paperwork" />
          <TickPath x={6} y={6} scale={1} stroke="#fff" width={2.6} />
        </>
      ) : state === 'partly' ? (
        <>
          <circle cx="16" cy="16" r="13" {...common} />
          <path d="M16 3a13 13 0 0 1 0 26z" fill="currentColor" fillOpacity="0.25" stroke="none" />
          <path d="M16 8.5V16l5 3" {...common} />
        </>
      ) : (
        <>
          <rect x="3" y="3" width="26" height="26" rx="7" {...common} />
          <path d="M10.5 10.5l11 11M21.5 10.5l-11 11" {...common} />
        </>
      )}
    </svg>
  );
}

function Clipboard({ data, lang }: { data: Data; lang: Lang }): ReactElement {
  return (
    <div className="relative mx-auto w-full max-w-[320px] pt-5" data-clipboard>
      {/* the board, then the paper on it, then the clip across the top edge */}
      <div className="rounded-xl border border-kind-paperwork bg-kind-paperwork-soft p-2 pt-6">
        <div className="max-h-[300px] overflow-y-auto rounded-lg bg-surface">
          {data.audits.length === 0 ? (
            <p className={`p-4 text-body text-text ${lineHeight(lang)}`}>{sayWords(t.nothingOpen, lang)}</p>
          ) : (
            <ol aria-label={sayWords(t.sheetLabel, lang)} className="m-0 list-none divide-y divide-border p-0">
              {data.audits.map((a) => {
                const state = auditState(data, a);
                return (
                  <li key={a.auditNo} data-state={state} className="flex min-h-14 items-center gap-3 px-3 py-2">
                    <StateIcon state={state} />
                    <div className="min-w-0 flex-1">
                      <p className={`text-subheading text-text ${lineHeight(lang)}`}>
                        <span className="sr-only">{`${sayWords(STATE_WORD[state], lang)}: `}</span>
                        {sayWords(t.audit(a.auditNo), lang)}
                      </p>
                      <p className={`text-body text-text-muted ${lineHeight(lang)}`}>
                        {a.auditDate ? `${a.auditDate} · ` : ''}
                        {fmtPoints(a.points, lang)}
                      </p>
                      <p className={`text-subheading text-kind-paperwork-ink ${lineHeight(lang)}`} aria-hidden="true">
                        {sayWords(STATE_WORD[state], lang)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
      <svg width="96" height="40" viewBox="0 0 96 40" aria-hidden="true" focusable="false" className="absolute left-1/2 top-0 -translate-x-1/2 text-kind-paperwork-ink">
        <rect x="8" y="10" width="80" height="26" rx="6" className="fill-kind-paperwork" />
        <rect x="26" y="2" width="44" height="18" rx="7" fill="#d4d4d8" stroke="currentColor" strokeWidth="2.5" />
        <rect x="36" y="9" width="24" height="5" rx="2.5" fill="currentColor" fillOpacity="0.35" />
      </svg>
    </div>
  );
}

function Overlay({ data, lang }: OverlayProps<'electrical_audit'>): ReactElement {
  const open = pointsStillOpen(data);
  return (
    <div data-kind="electrical_audit" className="space-y-4 p-4">
      <Lead lang={lang}>{lead(data, lang)}</Lead>
      <Clipboard data={data} lang={lang} />
      {open > 0 ? (
        <Line lang={lang}>
          {sayWords(
            words(`पोर्टल पर अभी बाकी: ${fmtPoints(open, 'hi')}`, `Portal par abhi baaki: ${fmtPoints(open, 'hl')}`, `Still open on the portal: ${fmtPoints(open, 'en')}`),
            lang,
          )}
        </Line>
      ) : null}
      {data.outcome === 'nothing_open' || data.outcome === 'login_rejected' || data.outcome === 'failed' ? null : <FiledByLine lang={lang} />}
    </div>
  );
}

/** The 40 x 28 mini signature: a clipboard with ticked lines. */
function Glyph({ size = 28 }: { size?: number }): ReactElement {
  return (
    <GlyphBox size={size}>
      <rect x="9" y="4" width="22" height="22" rx="3" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <rect x="14" y="1.5" width="12" height="5" rx="2" fill="currentColor" />
      <path d="M13 12.5l1.6 1.6 3-3.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 12.5h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M13 19.5l1.6 1.6 3-3.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 19.5h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </GlyphBox>
  );
}

function auditNumbers(data: Data): string {
  return data.audits.map((a) => a.auditNo).join(', ');
}

function headline(data: Data, lang: Lang): string {
  const n = data.pointsTotal;
  const nos = auditNumbers(data);
  switch (data.outcome) {
    case 'submitted':
      return sayWords(
        words(`इलेक्ट्रिकल ऑडिट जमा: ${fmtPoints(n, 'hi')}`, `Electrical audit jama: ${fmtPoints(n, 'hl')}`, `Electrical audit filed: ${fmtPoints(n, 'en')}`),
        lang,
      );
    case 'nothing_open':
      return sayWords(words('इलेक्ट्रिकल ऑडिट: कुछ खुला नहीं था', 'Electrical audit: kuch khula nahi tha', 'Electrical audit: nothing was open'), lang);
    case 'partly':
      return sayWords(
        words(`इलेक्ट्रिकल ऑडिट अधूरा${nos ? ` (${nos})` : ''}`, `Electrical audit adhoora${nos ? ` (${nos})` : ''}`, `Electrical audit stopped part-way${nos ? ` (${nos})` : ''}`),
        lang,
      );
    case 'login_rejected':
    case 'failed':
      return sayWords(words('इलेक्ट्रिकल ऑडिट जमा नहीं हुआ', 'Electrical audit jama nahi hua', 'Electrical audit did not go through'), lang);
  }
}

/** Partly or failed asks for a look; a clean run, or nothing open, has nothing to flag. */
function alert(data: Data, lang: Lang): KindAlert | null {
  if (data.outcome === 'submitted' || data.outcome === 'nothing_open') return null;
  return {
    headline:
      data.outcome === 'partly'
        ? sayWords(words('ऑडिट बीच में रुक गया', 'Audit beech mein ruk gaya', 'The audit stopped part-way'), lang)
        : sayWords(words('ऑडिट जमा नहीं हुआ', 'Audit jama nahi hua', 'The audit did not go through'), lang),
    line: sayWords(words('हम देख रहे हैं। आपको अभी कुछ नहीं करना।', 'Hum dekh rahe hain. Aapko abhi kuch nahi karna.', 'We are looking into it. You do not need to do anything yet.'), lang),
    severity: 'attention',
  };
}

function share(data: Data, lang: Lang): string {
  const lines = [headline(data, lang)];
  for (const a of data.audits) {
    lines.push(`${sayWords(t.audit(a.auditNo), lang)}${a.auditDate ? ` (${a.auditDate})` : ''}: ${fmtPoints(a.points, lang)}, ${sayWords(STATE_WORD[auditState(data, a)], lang)}`);
  }
  return lines.join('\n');
}

export const view: KindView<'electrical_audit'> = {
  kind: 'electrical_audit',
  Overlay,
  Glyph,
  tile: () => null,
  alert,
  headline,
  share,
};
