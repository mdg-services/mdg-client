import { Check, FileText, Minus, MessageSquareText, Pencil, Wrench } from 'lucide-react';
import * as React from 'react';

import type { Lang } from '@/store/lang';
import type { DuOtpEvent, DuOtpSnapReason, ReportDataOf } from '@dk/shared/types';

import { StatusBadge } from '../StatusBadge';
import {
  sayWords,
  type KindAlert,
  type KindTile,
  type KindView,
  type OverlayProps,
  type ReportAction,
  type ReportActionContext,
  type ReportStatusKey,
  type Words,
} from '../types';

import { BlockTitle, GlyphBox, Lead, More, Note, dayWords, leading, stampWords, timeWords } from './_supplyKit';

/**
 * DU OTP (ADR 0056): the PADLOCK. A dispenser was opened or re-checked and IndianOil wants
 * a paper from the dealer. The picture explains a dispenser seal without the word OTP: an
 * open padlock (red body when supply is stopped, amber when it may stop, blue-grey while we
 * are still reading the supply) and a closed padlock with a tick once it is submitted.
 * Open and closed differ in the shackle, the keyhole against the tick, and the words.
 *
 * Pending is a task (it lives under "Your work"), so it has no tile and no alert; the
 * submitted receipt is a "Done for you" row. The overlay lists one card per dispenser.
 * The portal's own words (its status, the dispenser's make and serial) are shown as written.
 */

type Data = ReportDataOf<'du_otp'>;

/** How many dispenser cards open on the first screen. */
const SHOWN_DUS = 6;

type Phase = 'stopped' | 'risk' | 'checking' | 'done';

/** Which padlock: closed when submitted; otherwise by what the supply is doing. */
export function phaseOf(data: Data): Phase {
  if (data.phase === 'submitted') return 'done';
  if (data.supplyBlocked === true) return 'stopped';
  if (data.supplyBlocked === false) return 'risk';
  return 'checking';
}

const PHASE_STATUS: Record<Phase, ReportStatusKey> = {
  stopped: 'problem',
  risk: 'attention',
  checking: 'waiting',
  done: 'ok',
};

// ── words ─────────────────────────────────────────────────────────────────────

const REASON: Record<DuOtpSnapReason, Words> = {
  e_calibration: { hi: 'ई-कैलिब्रेशन', hl: 'E-calibration', en: 'E-calibration' },
  'Pulsar Repair': { hi: 'पल्सर की मरम्मत', hl: 'Pulsar ki marammat', en: 'Pulsar repair' },
  Replacement: { hi: 'पुर्ज़ा बदला गया', hl: 'Purza badla gaya', en: 'Part replaced' },
  Others: { hi: 'दूसरा कारण', hl: 'Doosra kaaran', en: 'Other reason' },
};

const W = {
  badge: {
    stopped: { hi: 'सप्लाई बंद है', hl: 'Supply band hai', en: 'Supply is stopped' },
    risk: {
      hi: 'रुकी रही तो सप्लाई बंद हो सकती है',
      hl: 'Rukne par supply band ho sakti hai',
      en: 'Supply may stop if this waits',
    },
    checking: { hi: 'हम सप्लाई देख रहे हैं', hl: 'Hum supply check kar rahe hain', en: 'We are checking the supply' },
    done: { hi: 'जमा हो गया', hl: 'Jama ho gaya', en: 'Submitted' },
  } satisfies Record<Phase, Words>,
  pendingLead: {
    hi: 'एक डिस्पेंसर खोला या दोबारा जाँचा गया था। इंडियन ऑयल को आपसे कागज़ चाहिए।',
    hl: 'Ek dispenser khola ya dobara jaancha gaya tha. IndianOil ko aapse kagaz chahiye.',
    en: 'A dispenser was opened or re-checked. IndianOil wants a paper from you.',
  } satisfies Words,
  doneLead: (when: string): Words => ({
    hi: `हमने इसे इंडियन ऑयल को${when ? ` ${when}` : ''} जमा कर दिया। आपको कुछ नहीं करना है।`,
    hl: `Humne ise IndianOil ko${when ? ` ${when} par` : ''} jama kar diya. Aapko kuch nahi karna.`,
    en: `We submitted this to IndianOil${when ? ` at ${when}` : ''}. Nothing to do.`,
  }),
  sealTags: (n: number): Words => ({
    hi: `${n} डिस्पेंसर`,
    hl: `${n} dispenser`,
    en: n === 1 ? '1 dispenser' : `${n} dispensers`,
  }),
  duTitle: (name: string): Words => ({ hi: `DU ${name}`, hl: `DU ${name}`, en: `DU ${name}` }),
  serial: (s: string): Words => ({ hi: `सीरियल ${s}`, hl: `Serial ${s}`, en: `Serial ${s}` }),
  nozzlesAria: { hi: 'नोज़ल', hl: 'Nozzle', en: 'Nozzles' } satisfies Words,
  nozzle: (n: string): Words => ({ hi: `नोज़ल ${n}`, hl: `Nozzle ${n}`, en: `Nozzle ${n}` }),
  otpDate: (d: string): Words => ({ hi: `तारीख़: ${d}`, hl: `Tareekh: ${d}`, en: `Date: ${d}` }),
  onPortal: { hi: 'पोर्टल पर', hl: 'Portal par', en: 'On the portal' } satisfies Words,
  moreDus: (n: number): Words => ({
    hi: `और ${n} डिस्पेंसर`,
    hl: `Aur ${n} dispenser`,
    en: n === 1 ? 'and 1 more dispenser' : `and ${n} more dispensers`,
  }),
  moreEvents: (n: number): Words => ({
    hi: `और ${n} एंट्री चैट में हैं`,
    hl: `Aur ${n} entry chat mein hain`,
    en: n === 1 ? '1 more entry is in the chat' : `${n} more entries are in the chat`,
  }),
  needTitle: { hi: 'आपसे क्या चाहिए', hl: 'Aapse kya chahiye', en: 'What we need from you' } satisfies Words,
  needWhy: { hi: 'डिस्पेंसर क्यों खोला गया', hl: 'Dispenser kyun khola gaya', en: 'Why it was opened' } satisfies Words,
  needCertificate: { hi: 'कैलिब्रेशन सर्टिफ़िकेट', hl: 'Calibration certificate', en: 'Calibration certificate' } satisfies Words,
  needReport: { hi: 'सर्विस रिपोर्ट', hl: 'Service report', en: 'Service report' } satisfies Words,
  needRemark: { hi: 'एक छोटा रिमार्क', hl: 'Ek chhota remark', en: 'A short remark' } satisfies Words,
  needNote: {
    hi: 'PDF या फ़ोटो चलेगी।',
    hl: 'PDF ya photo chalegi.',
    en: 'A PDF or a photo is fine.',
  } satisfies Words,
  sentTitle: { hi: 'भेजे गए कागज़', hl: 'Bheje gaye kagaz', en: 'Papers sent' } satisfies Words,
  sent: { hi: 'भेजा', hl: 'Bheja', en: 'Sent' } satisfies Words,
  notSent: { hi: 'नहीं भेजा', hl: 'Nahi bheja', en: 'Not sent' } satisfies Words,
  otherPaper: { hi: 'कोई और कागज़', hl: 'Koi aur kagaz', en: 'Another paper' } satisfies Words,
  reasonTitle: { hi: 'कारण', hl: 'Kaaran', en: 'Reason' } satisfies Words,
  vc: (n: string): Words => ({ hi: `VC नंबर: ${n}`, hl: `VC number: ${n}`, en: `VC number: ${n}` }),
  calibrated: (d: string): Words => ({
    hi: `कैलिब्रेशन की तारीख़: ${d}`,
    hl: `Calibration ki tareekh: ${d}`,
    en: `Calibration date: ${d}`,
  }),
  moreTitle: { hi: 'इंडियन ऑयल के शब्द', hl: 'IndianOil ke shabd', en: "IndianOil's own words" } satisfies Words,
  readAt: (when: string): Words => ({
    hi: `पोर्टल से पढ़ा: ${when}`,
    hl: `Portal se padha: ${when}`,
    en: `Read from the portal ${when}`,
  }),
  submittedAt: (when: string): Words => ({
    hi: `जमा किया: ${when}`,
    hl: `Jama kiya: ${when}`,
    en: `Submitted ${when}`,
  }),
  noEvents: {
    hi: 'इस संदेश में डिस्पेंसर की सूची नहीं है।',
    hl: 'Is message mein dispenser ki list nahi hai.',
    en: 'This message has no list of dispensers.',
  } satisfies Words,
  title: { hi: 'DU OTP', hl: 'DU OTP', en: 'DU OTP' } satisfies Words,
  headStopped: (n: number): Words => ({
    hi: `सप्लाई बंद है: ${n} डिस्पेंसर को कागज़ चाहिए`,
    hl: `Supply band hai: ${n} dispenser ko kagaz chahiye`,
    en: `Supply is stopped: ${n} ${n === 1 ? 'dispenser needs' : 'dispensers need'} a paper`,
  }),
  headPending: (n: number): Words => ({
    hi: `${n} डिस्पेंसर को आपसे कागज़ चाहिए`,
    hl: `${n} dispenser ko aapse kagaz chahiye`,
    en: `${n} ${n === 1 ? 'dispenser needs' : 'dispensers need'} a paper from you`,
  }),
  headDone: (n: number): Words => ({
    hi: `DU OTP की पावती भरी: ${n} डिस्पेंसर`,
    hl: `DU OTP ki paavti bhari: ${n} dispenser`,
    en: `DU OTP filed: ${n} ${n === 1 ? 'dispenser' : 'dispensers'}`,
  }),
  headGeneric: {
    pending: { hi: 'डिस्पेंसर का कागज़ चाहिए', hl: 'Dispenser ka kagaz chahiye', en: 'A dispenser paper is needed' },
    done: { hi: 'DU OTP की पावती भरी', hl: 'DU OTP ki paavti bhari', en: 'DU OTP filed' },
  } satisfies Record<'pending' | 'done', Words>,
};

// ── grouping ──────────────────────────────────────────────────────────────────

export interface DuGroup {
  key: string;
  make: string;
  model: string;
  serial: string;
  events: DuOtpEvent[];
}

/** One group per dispenser (by its group key), in the order the events came. */
export function groupEvents(events: readonly DuOtpEvent[]): DuGroup[] {
  const groups: DuGroup[] = [];
  const byKey = new Map<string, DuGroup>();
  for (const e of events) {
    const key = e.groupKey || `${e.duMake}|${e.duModel}|${e.duSerial}`;
    let g = byKey.get(key);
    if (!g) {
      g = { key, make: e.duMake, model: e.duModel, serial: e.duSerial, events: [] };
      byKey.set(key, g);
      groups.push(g);
    }
    g.events.push(e);
  }
  return groups;
}

function duName(g: Pick<DuGroup, 'make' | 'model'>): string {
  return [g.make, g.model]
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .join(' ');
}

function nozzlesOf(g: DuGroup): string[] {
  const seen: string[] = [];
  for (const e of g.events) {
    const n = (e.nozzleNo ?? '').trim();
    if (n && !seen.includes(n)) seen.push(n);
  }
  return seen;
}

function eventDate(e: DuOtpEvent, lang: Lang): string {
  return dayWords(e.transactionDate, lang, true) || (e.transactionDateText ?? '').trim();
}

// ── the padlock ───────────────────────────────────────────────────────────────

const BODY_FILL: Record<Phase, string> = {
  stopped: 'fill-status-problem',
  risk: 'fill-status-attention',
  checking: 'fill-status-info',
  done: 'fill-status-ok',
};

/** The padlock, 120 px: open (shackle lifted, one leg free) or closed (with a tick). */
function Padlock({ phase, count }: { phase: Phase; count: number }): React.ReactElement {
  const closed = phase === 'done';
  return (
    <svg
      viewBox="0 0 160 130"
      width="160"
      height="130"
      role="presentation"
      aria-hidden="true"
      focusable="false"
      data-testid="du-padlock"
      data-phase={phase}
      data-open={closed ? 'false' : 'true'}
      className="mx-auto block h-auto w-40 max-w-full"
    >
      {/* the shackle: closed sits in the body, open is lifted with its right leg free */}
      {closed ? (
        <path d="M52 56V40a28 28 0 0 1 56 0v16" fill="none" className="stroke-kind-supply-ink" strokeWidth="11" strokeLinecap="round" />
      ) : (
        <path d="M52 40V26a28 28 0 0 1 56 0v10" fill="none" className="stroke-kind-supply-ink" strokeWidth="11" strokeLinecap="round" />
      )}
      {/* the body */}
      <rect x="34" y="56" width="92" height="64" rx="12" className={BODY_FILL[phase]} />
      {closed ? (
        <path d="M60 89l14 14 28-30" fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <>
          <circle cx="80" cy="85" r="8" fill="#fff" />
          <rect x="76" y="88" width="8" height="18" rx="3" fill="#fff" />
        </>
      )}
      {/* the seal tag on a string, with how many dispensers */}
      <path d="M118 60C140 62 142 74 142 84" fill="none" className="stroke-kind-supply-ink" strokeWidth="2" />
      <rect x="124" y="82" width="32" height="30" rx="6" className="fill-surface stroke-kind-supply-ink" strokeWidth="3" />
      <text x="140" y="104" textAnchor="middle" fontSize="20" fontWeight="800" className="fill-kind-supply-ink">
        {count}
      </text>
    </svg>
  );
}

// ── the cards ──────────────────────────────────────────────────────────────────

function Chip({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }): React.ReactElement {
  return (
    <span className="inline-flex min-h-[32px] items-center gap-1.5 rounded-full border border-border-strong bg-surface-2 px-3 py-1 text-body text-text">
      {icon}
      <span className="break-words">{children}</span>
    </span>
  );
}

function PaperTick({ ok, label, lang }: { ok: boolean; label: string; lang: Lang }): React.ReactElement {
  return (
    <li className="flex items-center gap-2" data-sent={ok ? 'true' : 'false'}>
      {ok ? (
        <Check aria-hidden="true" className="h-5 w-5 shrink-0 text-status-ok-ink" />
      ) : (
        <Minus aria-hidden="true" className="h-5 w-5 shrink-0 text-text-muted" />
      )}
      <span>
        {label}: <span className="font-semibold">{sayWords(ok ? W.sent : W.notSent, lang)}</span>
      </span>
    </li>
  );
}

function DuCard({ group, lang, submitted }: { group: DuGroup; lang: Lang; submitted: boolean }): React.ReactElement {
  const name = duName(group);
  const serial = (group.serial ?? '').trim();
  const nozzles = nozzlesOf(group);
  const title = name ? sayWords(W.duTitle(name), lang) : serial ? sayWords(W.duTitle(serial), lang) : '';
  const dates: string[] = [];
  for (const e of group.events) {
    const d = eventDate(e, lang);
    if (d && !dates.includes(d)) dates.push(d);
  }
  const calDates: string[] = [];
  for (const e of group.events) {
    const d = dayWords(e.calibrationDate, lang, true);
    if (d && !calDates.includes(d)) calDates.push(d);
  }
  const reasons: DuOtpSnapReason[] = [];
  for (const e of group.events) for (const r of e.reasons ?? []) if (!reasons.includes(r)) reasons.push(r);
  const vcs: string[] = [];
  for (const e of group.events) {
    const v = (e.vcNumber ?? '').trim();
    if (v && !vcs.includes(v)) vcs.push(v);
  }
  const papers = {
    certificate: group.events.some((e) => e.papers?.certificate),
    serviceReport: group.events.some((e) => e.papers?.serviceReport),
    other: group.events.some((e) => e.papers?.other),
  };
  const portalStatus = group.events.map((e) => (e.portalStatus ?? '').trim()).find(Boolean);
  return (
    <li
      role="group"
      aria-label={title || sayWords(W.title, lang)}
      data-testid="du-card"
      data-du={group.key}
      className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3"
    >
      <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${leading(lang)}`}>
        <Wrench aria-hidden="true" className="h-5 w-5 shrink-0 text-kind-supply-ink" />
        <p className="min-w-0 break-words text-subheading text-text">{title}</p>
        {serial && name ? <p className="text-body text-text-muted">{sayWords(W.serial(serial), lang)}</p> : null}
      </div>
      {nozzles.length > 0 ? (
        <ul className="flex list-none flex-wrap gap-2 p-0" aria-label={sayWords(W.nozzlesAria, lang)}>
          {nozzles.map((n) => (
            <li key={n}>
              <Chip>{sayWords(W.nozzle(n), lang)}</Chip>
            </li>
          ))}
        </ul>
      ) : null}
      {dates.length > 0 ? (
        <p className={`text-body text-text ${leading(lang)}`}>{sayWords(W.otpDate(dates.join(', ')), lang)}</p>
      ) : null}
      {!submitted && portalStatus ? (
        <p className={`text-body text-text ${leading(lang)}`}>
          <span className="text-text-muted">{sayWords(W.onPortal, lang)}: </span>
          <q dir="auto" className="font-semibold">
            {portalStatus}
          </q>
        </p>
      ) : null}
      {submitted ? (
        <div className={`flex flex-col gap-2 text-body text-text ${leading(lang)}`}>
          {reasons.length > 0 ? (
            <p>
              <span className="text-text-muted">{sayWords(W.reasonTitle, lang)}: </span>
              {reasons.map((r) => sayWords(REASON[r] ?? { hi: r, hl: r, en: r }, lang)).join(', ')}
            </p>
          ) : null}
          <ul className="flex list-none flex-col gap-1 p-0" aria-label={sayWords(W.sentTitle, lang)}>
            <PaperTick ok={papers.certificate} label={sayWords(W.needCertificate, lang)} lang={lang} />
            <PaperTick ok={papers.serviceReport} label={sayWords(W.needReport, lang)} lang={lang} />
            {papers.other ? <PaperTick ok label={sayWords(W.otherPaper, lang)} lang={lang} /> : null}
          </ul>
          {calDates.length > 0 ? <p>{sayWords(W.calibrated(calDates.join(', ')), lang)}</p> : null}
          {vcs.length > 0 ? <p>{sayWords(W.vc(vcs.join(', ')), lang)}</p> : null}
        </div>
      ) : null}
    </li>
  );
}

function Overlay({ data, lang }: OverlayProps<'du_otp'>): React.ReactElement {
  const phase = phaseOf(data);
  const submitted = phase === 'done';
  const events = data.events ?? [];
  const groups = groupEvents(events);
  const shown = groups.slice(0, SHOWN_DUS);
  const hiddenDus = groups.length - shown.length;
  const when = submitted ? timeWords(data.submittedAt, lang) : '';
  const stamp = submitted ? stampWords(data.submittedAt, lang) : stampWords(data.readAt, lang);
  return (
    <div data-kind="du_otp" data-phase={phase} className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={PHASE_STATUS[phase]} lang={lang} word={sayWords(W.badge[phase], lang)} />
        {stamp ? (
          <span className="text-body text-text-muted">
            {sayWords(submitted ? W.submittedAt(stamp) : W.readAt(stamp), lang)}
          </span>
        ) : null}
      </div>
      <Lead lang={lang}>{sayWords(submitted ? W.doneLead(when) : W.pendingLead, lang)}</Lead>

      <Padlock phase={phase} count={groups.length} />
      <p className="text-center text-subheading text-text">{sayWords(W.sealTags(groups.length), lang)}</p>

      {groups.length === 0 ? (
        <Note lang={lang} testId="du-no-events">
          {sayWords(W.noEvents, lang)}
        </Note>
      ) : (
        <ul className="flex list-none flex-col gap-2 p-0" data-testid="du-cards">
          {shown.map((g) => (
            <DuCard key={g.key} group={g} lang={lang} submitted={submitted} />
          ))}
        </ul>
      )}
      {hiddenDus > 0 ? (
        <p className="text-subheading text-text" data-testid="du-more">
          {sayWords(W.moreDus(hiddenDus), lang)}
        </p>
      ) : null}
      {data.moreCount > 0 ? (
        <p className="text-body text-text-muted" data-testid="du-more-events">
          {sayWords(W.moreEvents(data.moreCount), lang)}
        </p>
      ) : null}

      {!submitted ? (
        <section className="flex flex-col gap-2" aria-label={sayWords(W.needTitle, lang)} data-testid="du-need">
          <BlockTitle>{sayWords(W.needTitle, lang)}</BlockTitle>
          <ul className="flex list-none flex-wrap gap-2 p-0">
            <li>
              <Chip icon={<MessageSquareText aria-hidden="true" className="h-4 w-4" />}>{sayWords(W.needWhy, lang)}</Chip>
            </li>
            <li>
              <Chip icon={<FileText aria-hidden="true" className="h-4 w-4" />}>{sayWords(W.needCertificate, lang)}</Chip>
            </li>
            <li>
              <Chip icon={<FileText aria-hidden="true" className="h-4 w-4" />}>{sayWords(W.needReport, lang)}</Chip>
            </li>
            <li>
              <Chip icon={<Pencil aria-hidden="true" className="h-4 w-4" />}>{sayWords(W.needRemark, lang)}</Chip>
            </li>
          </ul>
          <p className={`text-body text-text-muted ${leading(lang)}`}>{sayWords(W.needNote, lang)}</p>
        </section>
      ) : null}

      {groups.some((g) => g.events.some((e) => e.portalStatus)) && submitted ? (
        <More label={sayWords(W.moreTitle, lang)}>
          <ul className="list-none space-y-1 p-0">
            {events.map((e, i) =>
              e.portalStatus ? (
                <li key={i} dir="auto">
                  {e.portalStatus}
                </li>
              ) : null,
            )}
          </ul>
        </More>
      ) : null}
    </div>
  );
}

/** The 40 x 28 mini: an open padlock. */
function Glyph({ size = 28 }: { size?: number }): React.ReactElement {
  return (
    <GlyphBox size={size}>
      <path d="M14 12V8a6 6 0 0 1 12 0v1" strokeWidth="3" />
      <rect x="9" y="12" width="22" height="14" rx="3.5" fill="currentColor" stroke="none" />
      <circle cx="20" cy="18" r="2.2" fill="#fff" stroke="none" />
    </GlyphBox>
  );
}

function tile(): KindTile | null {
  return null;
}

function alert(): KindAlert | null {
  return null;
}

function headline(data: Data, lang: Lang): string {
  const n = groupEvents(data.events ?? []).length;
  if (data.phase === 'submitted') {
    return n > 0 ? sayWords(W.headDone(n), lang) : sayWords(W.headGeneric.done, lang);
  }
  if (n === 0) return sayWords(W.headGeneric.pending, lang);
  return sayWords(data.supplyBlocked === true ? W.headStopped(n) : W.headPending(n), lang);
}

function share(data: Data, lang: Lang): string {
  const submitted = data.phase === 'submitted';
  const lines = [
    sayWords(W.title, lang),
    submitted ? sayWords(W.doneLead(timeWords(data.submittedAt, lang)), lang) : sayWords(W.pendingLead, lang),
  ];
  if (!submitted && data.supplyBlocked === true) lines.splice(1, 0, sayWords(W.badge.stopped, lang));
  for (const g of groupEvents(data.events ?? [])) {
    const nozzles = nozzlesOf(g);
    const name = duName(g) || (g.serial ?? '').trim();
    const serial = (g.serial ?? '').trim();
    lines.push(
      `- DU ${[name, serial && name ? sayWords(W.serial(serial), lang) : '', nozzles.map((n) => sayWords(W.nozzle(n), lang)).join(', ')]
        .filter(Boolean)
        .join(' · ')}`,
    );
  }
  return lines.join('\n');
}

/**
 * While the paper is still owed, the button opens the chat at the DU OTP steps (the box that takes
 * the dealer's answer), not at this report. Once it is submitted nothing is asked.
 */
function actions(data: Data, _report: unknown, ctx: ReportActionContext): ReportAction[] {
  if (phaseOf(data) === 'done') return [];
  return [
    {
      id: 'open-du-otp',
      icon: Pencil,
      label: { hi: 'DU OTP का काम खोलें', hl: 'DU OTP ka kaam kholein', en: 'Open the DU OTP work' },
      run: () => ctx.openChatAtTask('du_otp'),
    },
  ];
}

export const view: KindView<'du_otp'> = {
  kind: 'du_otp',
  Overlay,
  Glyph,
  tile,
  alert,
  headline,
  share,
  actions,
};
