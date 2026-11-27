import { Clock, TriangleAlert } from 'lucide-react';
import * as React from 'react';

import type { Lang } from '@/store/lang';
import type { ReportDataOf, RoSupplyCond, TodayTaskKind } from '@dk/shared/types';

import { StatusBadge } from '../StatusBadge';
import { sayWords, type KindAlert, type KindTile, type KindView, type OverlayProps, type ReportStatusKey, type Words } from '../types';

import { BlockTitle, ChatButton, GlyphBox, Lead, Note, leading, stampWords } from './_supplyKit';

/**
 * Supply status (ADR 0056): the BOOM-BARRIER GATE. The dealer's question is "can my pump
 * lift fuel", so the picture is a gate: barrier up with a tick lamp is GO, half down with a
 * triangle is "pending", flat and hatched with an octagon is STOP, a diamond with a question
 * mark is "we could not read it". Under it, one lamp per condition, failing first, each with
 * who fixes it. The four states differ in arm angle, lamp shape and words, never colour alone.
 *
 * A stopped pump with a clean table still draws STOP: `blocked` decides the verdict, the rows
 * only explain it. A condition we have never seen keeps the portal's own words and is never
 * dropped.
 */

type Data = ReportDataOf<'ro_supply'>;
type Row = Data['rows'][number];

export type SupplyVerdict = 'stopped' | 'pending' | 'clear' | 'unclear';

/** The one verdict, from the portal's own sentence first and the rows second. */
export function verdictOf(data: Data): SupplyVerdict {
  if (data.blocked === true) return 'stopped';
  if (data.failingCount > 0) return 'pending';
  if (data.blocked === false) return 'clear';
  return 'unclear';
}

const VERDICT_STATUS: Record<SupplyVerdict, ReportStatusKey> = {
  stopped: 'problem',
  pending: 'attention',
  clear: 'ok',
  unclear: 'attention',
};

// ── words ─────────────────────────────────────────────────────────────────────

type Fixer = 'you' | 'vendor' | 'officer' | 'mdg';

const FIXER: Record<Fixer, Words> = {
  you: { hi: 'आप', hl: 'Aap', en: 'You' },
  vendor: { hi: 'आपका वेंडर', hl: 'Aapka vendor', en: 'Your vendor' },
  officer: { hi: 'आपका सेल्स ऑफ़िसर', hl: 'Aapka sales officer', en: 'Your sales officer' },
  mdg: { hi: 'MDG', hl: 'MDG', en: 'MDG' },
};

interface CondCopy {
  portal: string;
  problem: Words;
  ok: Words;
  action: Words;
  fixer: Fixer;
  /** The button that opens the chat for the work, when MDG has a box for it. */
  button?: Words;
}

const CONDS: Record<Exclude<RoSupplyCond, 'other'>, CondCopy> = {
  automation_data: {
    portal: 'Automation data not received',
    problem: {
      hi: 'ऑटोमेशन का डेटा पोर्टल तक नहीं पहुँचा',
      hl: 'Automation ka data portal tak nahi pahuncha',
      en: 'Automation data has not reached the portal',
    },
    ok: {
      hi: 'ऑटोमेशन का डेटा पहुँच रहा है',
      hl: 'Automation ka data pahunch raha hai',
      en: 'Automation data is reaching the portal',
    },
    action: {
      hi: 'पंप पर ऑटोमेशन दोबारा चालू कराएँ। यह आपका ऑटोमेशन वेंडर ठीक करता है।',
      hl: 'Pump par automation dobara chalu karaiye. Yeh aapka automation vendor theek karta hai.',
      en: 'Get the automation link at the pump working again. Your vendor fixes this.',
    },
    fixer: 'vendor',
  },
  pending_otp: {
    portal: 'Pending OTP',
    problem: { hi: 'कोई OTP मंज़ूरी बाक़ी है', hl: 'Koi OTP manzoori baaki hai', en: 'An OTP approval is waiting' },
    ok: { hi: 'कोई OTP बाक़ी नहीं', hl: 'Koi OTP baaki nahi', en: 'No OTP pending' },
    action: {
      hi: 'डिस्पेंसर का DU OTP पूरा करें। हम आपके लिए कर सकते हैं।',
      hl: 'Dispenser ka DU OTP poora kijiye. Hum aapke liye kar sakte hain.',
      en: 'Do the DU OTP for the dispenser. We can do it for you.',
    },
    fixer: 'you',
    button: { hi: 'DU OTP का काम खोलें', hl: 'DU OTP ka kaam kholein', en: 'Open the DU OTP work' },
  },
  sdms_dar_block: {
    portal: 'Blocked in SDMS-DAR',
    problem: { hi: 'SDMS-DAR में रोक लगी है', hl: 'SDMS-DAR mein rok lagi hai', en: 'A block is set in SDMS-DAR' },
    ok: { hi: 'SDMS-DAR में कोई रोक नहीं', hl: 'SDMS-DAR mein koi rok nahi', en: 'No block in SDMS-DAR' },
    action: {
      hi: 'अपने सेल्स ऑफ़िसर से बात करें। यह रोक उनकी तरफ़ से लगी है।',
      hl: 'Apne sales officer se baat kijiye. Yeh rok unki taraf se lagi hai.',
      en: 'Talk to your sales officer. The block is set on their side.',
    },
    fixer: 'officer',
  },
  du_tank_comm: {
    portal: 'DU/Tank Not Comunicated in 24 hrs',
    problem: {
      hi: '24 घंटे से मशीन या टंकी का डेटा नहीं गया',
      hl: '24 ghante se machine ya tank ka data nahi gaya',
      en: 'No machine or tank data for 24 hours',
    },
    ok: {
      hi: 'मशीन और टंकी का डेटा जा रहा है',
      hl: 'Machine aur tank ka data ja raha hai',
      en: 'Machine and tank data is reaching the portal',
    },
    action: {
      hi: 'देखें कि हर मशीन और टंकी दोबारा डेटा भेज रही है। वेंडर से कहें।',
      hl: 'Dekhiye ki har machine aur tank dobara data bhej raha hai. Vendor se kahiye.',
      en: 'Check that every dispenser and tank is reporting again. Ask your vendor.',
    },
    fixer: 'vendor',
  },
  mock_drill: {
    portal: 'Quaterly Mock Drill Not Conducted',
    problem: {
      hi: 'तिमाही मॉक ड्रिल नहीं हुई',
      hl: 'Teen mahine wali mock drill nahi hui',
      en: 'The quarterly mock drill has not been done',
    },
    ok: {
      hi: 'तिमाही मॉक ड्रिल हो चुकी है',
      hl: 'Teen mahine wali mock drill ho chuki hai',
      en: 'The quarterly mock drill is done',
    },
    action: {
      hi: 'मॉक ड्रिल कराएँ और पोर्टल पर घोषणा दर्ज करें।',
      hl: 'Mock drill karaiye aur portal par declaration bhariye.',
      en: 'Do the mock drill and file the declaration on the portal.',
    },
    fixer: 'you',
    button: { hi: 'मॉक ड्रिल का काम खोलें', hl: 'Mock drill ka kaam kholein', en: 'Open the mock drill work' },
  },
  electrical_audit: {
    portal: 'Electrical Audit Non-Compliance',
    problem: {
      hi: 'बिजली ऑडिट की कमियाँ पूरी नहीं हुईं',
      hl: 'Bijli audit ki kamiyan poori nahi hui',
      en: 'Electrical audit points are still open',
    },
    ok: {
      hi: 'बिजली ऑडिट की कमियाँ पूरी हैं',
      hl: 'Bijli audit ki kamiyan poori hain',
      en: 'Electrical audit points are closed',
    },
    action: {
      hi: 'बिजली ऑडिट की कमियाँ ठीक करके प्रमाण भेजें। हम फ़ाइल कर देंगे।',
      hl: 'Bijli audit ki kamiyan theek karke proof bhejiye. Hum file kar denge.',
      en: 'Close the audit points and send the proof. We will file it.',
    },
    fixer: 'mdg',
    button: { hi: 'MDG से फ़ाइल करवाएँ', hl: 'MDG se file karwayein', en: 'Ask MDG to file it' },
  },
  ro_not_auto: {
    portal: 'RO not in Auto',
    problem: { hi: 'पंप ऑटोमेशन पर नहीं है', hl: 'Pump automation par nahi hai', en: 'The pump is not on automation' },
    ok: { hi: 'पंप ऑटोमेशन पर है', hl: 'Pump automation par hai', en: 'The pump is on automation' },
    action: {
      hi: 'पंप को दोबारा ऑटोमेशन पर लाएँ। वेंडर से कहें।',
      hl: 'Pump ko dobara automation par laiye. Vendor se kahiye.',
      en: 'Put the pump back on automation. Ask your vendor.',
    },
    fixer: 'vendor',
  },
};

const W = {
  stoppedLead: {
    hi: 'आपका तेल लेना बंद है।',
    hl: 'Aapka tel lena band hai.',
    en: 'Your fuel lifting is stopped.',
  } satisfies Words,
  stoppedSub: {
    hi: 'नीचे दिए काम पूरे होने तक यह रोक चलती रहेगी।',
    hl: 'Neeche diye kaam poore hone tak yeh rok chalti rahegi.',
    en: 'The stop stays until the work below is done.',
  } satisfies Words,
  stoppedCleanSub: {
    hi: 'नीचे कोई काम नहीं दिख रहा, फिर भी इंडियन ऑयल रोक दिखा रहा है। अपने सेल्स ऑफ़िसर से बात करें।',
    hl: 'Neeche koi kaam nahi dikh raha, phir bhi IndianOil rok dikha raha hai. Apne sales officer se baat kijiye.',
    en: 'Nothing is listed below, but IndianOil still shows a stop. Talk to your sales officer.',
  } satisfies Words,
  pendingLead: (n: number): Words => ({
    hi: `${n} काम बाक़ी ${n === 1 ? 'है' : 'हैं'}। इनमें से कोई एक भी आपका तेल रोक सकता है।`,
    hl: `${n} kaam baaki ${n === 1 ? 'hai' : 'hain'}. Inmein se koi ek bhi aapka tel rok sakta hai.`,
    en: `${n} ${n === 1 ? 'item is' : 'items are'} pending. Any one can stop your fuel.`,
  }),
  clearLead: {
    hi: 'सब ठीक है। आपका पंप तेल ले सकता है।',
    hl: 'Sab theek hai. Aapka pump tel le sakta hai.',
    en: 'All clear. Your pump can lift fuel.',
  } satisfies Words,
  unclearLead: {
    hi: 'हम सप्लाई स्टेटस पढ़ नहीं पाए। पोर्टल पर ख़ुद देख लें।',
    hl: 'Hum supply status padh nahi paaye. Portal par khud dekh lijiye.',
    en: 'We could not read the supply status. Please check the portal.',
  } satisfies Words,
  badgeStopped: { hi: 'सप्लाई बंद है', hl: 'Supply band hai', en: 'Supply is stopped' } satisfies Words,
  badgePending: { hi: 'बाक़ी काम', hl: 'Kaam baaki', en: 'Work pending' } satisfies Words,
  badgeClear: { hi: 'सब ठीक', hl: 'Sab theek', en: 'All clear' } satisfies Words,
  badgeUnclear: { hi: 'पढ़ नहीं पाए', hl: 'Padh nahi paaye', en: 'Could not read' } satisfies Words,
  rule: {
    hi: 'इनमें से कोई एक भी काम बाक़ी रहे तो इंडियन ऑयल आपका तेल रोक सकता है।',
    hl: 'Inmein se koi ek bhi kaam baaki rahe to IndianOil aapka tel rok sakta hai.',
    en: 'Any one of these left undone is enough for IndianOil to stop your fuel.',
  } satisfies Words,
  conditions: { hi: 'सभी शर्तें', hl: 'Saari shartein', en: 'Every condition' } satisfies Words,
  whoFixes: (who: string): Words => ({
    hi: `कौन ठीक करेगा: ${who}`,
    hl: `Kaun theek karega: ${who}`,
    en: `Who fixes it: ${who}`,
  }),
  whatToDo: { hi: 'क्या करें', hl: 'Kya karein', en: 'What to do' } satisfies Words,
  portalTerm: (term: string): Words => ({
    hi: `पोर्टल पर: ${term}`,
    hl: `Portal par: ${term}`,
    en: `On the portal: ${term}`,
  }),
  portalOwn: {
    hi: 'पोर्टल के अपने शब्द',
    hl: 'Portal ke apne shabd',
    en: "The portal's own words",
  } satisfies Words,
  unknownRow: {
    hi: 'हम इसे पढ़ नहीं पाए। पोर्टल पर देख लें।',
    hl: 'Hum ise padh nahi paaye. Portal par dekh lijiye.',
    en: 'We could not read this one. Please check the portal.',
  } satisfies Words,
  rowProblem: { hi: 'समस्या', hl: 'Problem', en: 'Problem' } satisfies Words,
  rowFine: { hi: 'ठीक', hl: 'Theek', en: 'Fine' } satisfies Words,
  rowUnknown: { hi: 'पता नहीं', hl: 'Pata nahi', en: 'Not sure' } satisfies Words,
  partial: {
    hi: 'सूची का कुछ हिस्सा पढ़ा नहीं जा सका।',
    hl: 'List ka kuch hissa padha nahi ja saka.',
    en: 'Part of the list could not be read.',
  } satisfies Words,
  unknownCount: (n: number): Words => ({
    hi: `${n} शर्त हम पढ़ नहीं पाए। पोर्टल पर देख लें।`,
    hl: `${n} shart hum padh nahi paaye. Portal par dekh lijiye.`,
    en: `We could not read ${n} ${n === 1 ? 'condition' : 'conditions'}. Please check the portal.`,
  }),
  lastGoodOld: (when: string): Words => ({
    hi: `पिछली जाँच पूरी नहीं हो पाई। यह सूची आख़िरी सही जाँच की है${when ? ` (${when})` : ''}।`,
    hl: `Pichhli jaanch poori nahi ho paayi. Yeh list aakhri sahi jaanch ki hai${when ? ` (${when})` : ''}.`,
    en: `The last check could not finish. This list is from the last good check${when ? ` (${when})` : ''}.`,
  }),
  checkedAt: (when: string): Words => ({
    hi: `जाँच का समय: ${when}`,
    hl: `Jaanch ka time: ${when}`,
    en: `Checked ${when}`,
  }),
  tileStopped: { hi: 'तेल लेना बंद', hl: 'Tel lena band', en: 'Fuel lifting stopped' } satisfies Words,
  tilePending: (n: number): Words => ({
    hi: `${n} काम बाक़ी`,
    hl: `${n} kaam baaki`,
    en: n === 1 ? '1 item pending' : `${n} items pending`,
  }),
  tileClear: { hi: 'सब ठीक', hl: 'Sab theek', en: 'All clear' } satisfies Words,
  tileUnclear: { hi: 'साफ़ नहीं', hl: 'Saaf nahi', en: 'Unclear' } satisfies Words,
  alertStoppedHead: { hi: 'सप्लाई बंद हो गई है', hl: 'Supply band ho gayi hai', en: 'Supply has stopped' } satisfies Words,
  alertStoppedLine: {
    hi: 'इंडियन ऑयल ने तेल उठाना रोका है। काम यह है।',
    hl: 'IndianOil ne tel uthana roka hai. Kaam yeh hai.',
    en: 'IndianOil has stopped fuel lifting. Here is what to do.',
  } satisfies Words,
  alertPendingHead: (n: number): Words => ({
    hi: `${n} काम बाक़ी ${n === 1 ? 'है' : 'हैं'}`,
    hl: `${n} kaam baaki ${n === 1 ? 'hai' : 'hain'}`,
    en: n === 1 ? '1 supply item is pending' : `${n} supply items are pending`,
  }),
  alertPendingLine: {
    hi: 'कोई एक भी तेल रोक सकता है। देख लें।',
    hl: 'Koi ek bhi tel rok sakta hai. Dekh lijiye.',
    en: 'Any one can stop your fuel. Take a look.',
  } satisfies Words,
  alertUnclearHead: {
    hi: 'सप्लाई स्टेटस साफ़ नहीं है',
    hl: 'Supply status saaf nahi hai',
    en: 'Supply status is unclear',
  } satisfies Words,
  alertUnclearLine: {
    hi: 'इंडियन ऑयल का पोर्टल ख़ुद देख लें।',
    hl: 'IndianOil ka portal khud dekh lijiye.',
    en: 'Please check the IndianOil portal yourself.',
  } satisfies Words,
  title: { hi: 'सप्लाई स्टेटस', hl: 'Supply status', en: 'Supply status' } satisfies Words,
  goSign: 'GO',
  stopSign: 'STOP',
};

// ── helpers ──────────────────────────────────────────────────────────────────────

function known(cond: RoSupplyCond): CondCopy | null {
  return cond === 'other' ? null : (CONDS[cond] ?? null);
}

/** What one row says, in the reader's language. */
/**
 * The box in the chat that answers a row, when MDG has one: the DU OTP steps for a pending OTP, the
 * mock drill job for a mock drill that was not done. Every other row's button ("Ask MDG to file it")
 * has no box of its own and opens the chat at the report.
 */
export function boxOfCond(cond: Row['cond']): { box?: TodayTaskKind } {
  if (cond === 'pending_otp') return { box: 'du_otp' };
  if (cond === 'mock_drill') return { box: 'mock_drill' };
  return {};
}

function rowText(row: Row, lang: Lang): string {
  const copy = known(row.cond);
  if (!copy) return row.portalText;
  if (row.mark === 'YES') return sayWords(copy.ok, lang);
  if (row.mark === 'NO') return sayWords(copy.problem, lang);
  return sayWords(copy.problem, lang);
}

function leadWords(data: Data, verdict: SupplyVerdict): Words {
  switch (verdict) {
    case 'stopped':
      return W.stoppedLead;
    case 'pending':
      return W.pendingLead(data.failingCount);
    case 'clear':
      return W.clearLead;
    case 'unclear':
      return W.unclearLead;
  }
}

function leadText(data: Data, lang: Lang): string {
  return sayWords(leadWords(data, verdictOf(data)), lang);
}

// ── the gate ───────────────────────────────────────────────────────────────────

const ARM_ANGLE: Record<SupplyVerdict, number> = { clear: -68, pending: -34, unclear: -18, stopped: 0 };

/** The lamp on the post, in the verdict's own shape: tick circle, triangle, octagon, diamond. */
function Lamp({ verdict, cx, cy }: { verdict: SupplyVerdict; cx: number; cy: number }): React.ReactElement {
  switch (verdict) {
    case 'clear':
      return (
        <g>
          <circle cx={cx} cy={cy} r="19" className="fill-status-ok" />
          <path d={`M${cx - 8} ${cy + 1}l5.5 5.5 11-11.5`} fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    case 'pending':
      return (
        <g>
          <path d={`M${cx} ${cy - 21}L${cx + 22} ${cy + 16}H${cx - 22}Z`} className="fill-status-attention" strokeLinejoin="round" />
          <path d={`M${cx} ${cy - 9}v12`} stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
          <circle cx={cx} cy={cy + 9.5} r="2" fill="#fff" />
        </g>
      );
    case 'stopped':
      return (
        <g>
          <polygon
            points={`${cx - 8},${cy - 20} ${cx + 8},${cy - 20} ${cx + 20},${cy - 8} ${cx + 20},${cy + 8} ${cx + 8},${cy + 20} ${cx - 8},${cy + 20} ${cx - 20},${cy + 8} ${cx - 20},${cy - 8}`}
            className="fill-status-problem"
          />
          <path d={`M${cx - 8} ${cy - 8}l16 16M${cx + 8} ${cy - 8}l-16 16`} stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
        </g>
      );
    case 'unclear':
      return (
        <g>
          <path d={`M${cx} ${cy - 22}L${cx + 22} ${cy}L${cx} ${cy + 22}L${cx - 22} ${cy}Z`} className="fill-status-info" strokeLinejoin="round" />
          <text x={cx} y={cy + 8} textAnchor="middle" fontSize="24" fontWeight="800" fill="#fff">
            ?
          </text>
        </g>
      );
  }
}

/** The gate: post, lamp, and an arm whose angle is the verdict. 328 x 150. */
function Gate({ verdict }: { verdict: SupplyVerdict }): React.ReactElement {
  const angle = ARM_ANGLE[verdict];
  const label = verdict === 'clear' ? W.goSign : verdict === 'stopped' ? W.stopSign : verdict === 'pending' ? 'WAIT' : '?';
  const stripes = [0, 1, 2, 3, 4, 5];
  return (
    <svg
      viewBox="0 0 328 150"
      role="presentation"
      aria-hidden="true"
      focusable="false"
      data-testid="supply-gate"
      data-verdict={verdict}
      data-angle={angle}
      className="mx-auto block h-auto w-full max-w-[420px] rounded-xl bg-kind-supply-soft"
    >
      {/* ground */}
      <rect x="0" y="136" width="328" height="14" className="fill-kind-supply-ink" opacity="0.18" />
      {/* the post, and its foot */}
      <rect x="44" y="64" width="28" height="74" rx="3" className="fill-kind-supply-ink" />
      <rect x="34" y="130" width="48" height="8" rx="3" className="fill-kind-supply-ink" />
      <Lamp verdict={verdict} cx={58} cy={38} />
      {/* the arm, turned about its hinge */}
      <g transform={`rotate(${angle} 58 118)`} data-testid="supply-arm">
        <rect x="58" y="111" width="124" height="14" rx="4" className={verdict === 'stopped' ? 'fill-surface stroke-kind-supply-ink' : 'fill-kind-supply-ink'} strokeWidth="2" />
        {verdict === 'stopped'
          ? stripes.map((i) => (
              <polygon
                key={i}
                points={`${74 + i * 18},111 ${84 + i * 18},111 ${78 + i * 18},125 ${68 + i * 18},125`}
                className="fill-status-problem"
              />
            ))
          : null}
        {/* the counterweight behind the hinge */}
        <circle cx="58" cy="118" r="9" className="fill-kind-supply-ink" />
        <circle cx="58" cy="118" r="3.5" className="fill-kind-supply-soft" />
      </g>
      <text
        x="262"
        y="92"
        textAnchor="middle"
        fontSize="34"
        fontWeight="800"
        className="fill-kind-supply-ink"
      >
        {label}
      </text>
    </svg>
  );
}

/** One condition's lamp: octagon with a cross, diamond with a question mark, circle with a tick. 28 px. */
function RowLamp({ mark }: { mark: Row['mark'] }): React.ReactElement {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true" focusable="false" data-lamp={mark} className="shrink-0">
      {mark === 'NO' ? (
        <>
          <polygon points="10,2 18,2 26,10 26,18 18,26 10,26 2,18 2,10" className="fill-status-problem" />
          <path d="M9.5 9.5l9 9M18.5 9.5l-9 9" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
        </>
      ) : mark === 'UNKNOWN' ? (
        <>
          <path d="M14 1.5L26.5 14L14 26.5L1.5 14Z" className="fill-status-info" strokeLinejoin="round" />
          <text x="14" y="20" textAnchor="middle" fontSize="16" fontWeight="800" fill="#fff">
            ?
          </text>
        </>
      ) : (
        <>
          <circle cx="14" cy="14" r="12" className="fill-status-ok" />
          <path d="M8 14.4l4 4 8-8.4" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}

function ConditionRow({
  row,
  lang,
  report,
}: {
  row: Row;
  lang: Lang;
  report: OverlayProps<'ro_supply'>['report'];
}): React.ReactElement {
  const copy = known(row.cond);
  const problem = row.mark === 'NO';
  const unknown = row.mark === 'UNKNOWN';
  const stateWord = sayWords(problem ? W.rowProblem : unknown ? W.rowUnknown : W.rowFine, lang);
  const who = problem && copy ? sayWords(FIXER[copy.fixer], lang) : '';
  const aria = [row.portalText || copy?.portal || '', stateWord, who ? sayWords(W.whoFixes(who), lang) : '']
    .filter(Boolean)
    .join(', ');
  return (
    <li
      aria-label={aria}
      data-cond={row.cond}
      data-mark={row.mark}
      data-testid="supply-row"
      className="flex gap-3 rounded-xl border border-border bg-surface p-3"
    >
      <RowLamp mark={row.mark} />
      <div className={`min-w-0 flex-1 text-body text-text ${leading(lang)}`}>
        <p className="break-words font-semibold">{rowText(row, lang)}</p>
        {copy ? (
          <p className="break-words text-body text-text-muted">{sayWords(W.portalTerm(row.portalText || copy.portal), lang)}</p>
        ) : (
          <p className="text-body text-text-muted">{sayWords(W.portalOwn, lang)}</p>
        )}
        {unknown ? <p className="mt-1">{sayWords(W.unknownRow, lang)}</p> : null}
        {problem && copy ? (
          <div className="mt-2 flex flex-col gap-2">
            <span
              data-testid="supply-fixer"
              className="inline-flex w-fit min-h-[28px] items-center rounded-full border border-border-strong px-2.5 py-0.5 text-cta"
            >
              {sayWords(W.whoFixes(who), lang)}
            </span>
            <p>
              <span className="font-semibold">{sayWords(W.whatToDo, lang)}: </span>
              {sayWords(copy.action, lang)}
            </p>
            {copy.button ? (
              <div>
                <ChatButton report={report} {...boxOfCond(row.cond)} testId={`supply-go-${row.cond}`}>
                  {sayWords(copy.button, lang)}
                </ChatButton>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

function badgeWord(verdict: SupplyVerdict, lang: Lang): string {
  const w =
    verdict === 'stopped'
      ? W.badgeStopped
      : verdict === 'pending'
        ? W.badgePending
        : verdict === 'clear'
          ? W.badgeClear
          : W.badgeUnclear;
  return sayWords(w, lang);
}

function Overlay({ data, report, lang }: OverlayProps<'ro_supply'>): React.ReactElement {
  const verdict = verdictOf(data);
  const checked = stampWords(data.capturedAt, lang);
  const rows = data.rows ?? [];
  const sub =
    verdict === 'stopped'
      ? sayWords(data.failingCount === 0 ? W.stoppedCleanSub : W.stoppedSub, lang)
      : null;
  return (
    <div data-kind="ro_supply" data-verdict={verdict} className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={VERDICT_STATUS[verdict]} lang={lang} word={badgeWord(verdict, lang)} />
        {checked ? <span className="text-body text-text-muted">{sayWords(W.checkedAt(checked), lang)}</span> : null}
      </div>
      <Lead lang={lang}>{leadText(data, lang)}</Lead>
      {sub ? <p className={`text-body text-text ${leading(lang)}`}>{sub}</p> : null}

      <Gate verdict={verdict} />

      {data.lastGoodIsOld ? (
        <Note
          lang={lang}
          tone="attention"
          icon={<TriangleAlert aria-hidden="true" className="h-5 w-5 text-status-attention-ink" />}
          testId="supply-old-good"
        >
          {sayWords(W.lastGoodOld(checked), lang)}
        </Note>
      ) : null}
      {data.read === 'partial' ? (
        <Note lang={lang} tone="waiting" icon={<Clock aria-hidden="true" className="h-5 w-5 text-status-waiting-ink" />} testId="supply-partial">
          {sayWords(W.partial, lang)}
        </Note>
      ) : null}
      {data.unknownCount > 0 ? (
        <Note lang={lang} tone="attention" icon={<TriangleAlert aria-hidden="true" className="h-5 w-5 text-status-attention-ink" />} testId="supply-unknown">
          {sayWords(W.unknownCount(data.unknownCount), lang)}
        </Note>
      ) : null}

      {rows.length > 0 ? (
        <section className="flex flex-col gap-2" aria-label={sayWords(W.conditions, lang)}>
          <BlockTitle>{sayWords(W.conditions, lang)}</BlockTitle>
          <ul className="flex list-none flex-col gap-2 p-0">
            {rows.map((row, i) => (
              <ConditionRow key={`${row.cond}-${i}`} row={row} lang={lang} report={report} />
            ))}
          </ul>
        </section>
      ) : null}

      <Note lang={lang} testId="supply-rule">
        {sayWords(W.rule, lang)}
      </Note>
    </div>
  );
}

/** The 40 x 28 mini: the gate with its arm half down. */
function Glyph({ size = 28 }: { size?: number }): React.ReactElement {
  return (
    <GlyphBox size={size}>
      <path d="M7 11v15" strokeWidth="4" />
      <circle cx="7" cy="6" r="3.2" fill="currentColor" stroke="none" />
      <path d="M7 21L34 9" strokeWidth="4" />
      <path d="M17 17l3-4M24 14l3-4" strokeWidth="2" opacity="0.6" />
      <path d="M2 26h10" />
    </GlyphBox>
  );
}

function tile(data: Data, lang: Lang): KindTile | null {
  const verdict = verdictOf(data);
  const value =
    verdict === 'stopped'
      ? W.tileStopped
      : verdict === 'pending'
        ? W.tilePending(data.failingCount)
        : verdict === 'clear'
          ? W.tileClear
          : W.tileUnclear;
  const checked = stampWords(data.capturedAt, lang);
  return {
    value: sayWords(value, lang),
    sub: checked ? sayWords(W.checkedAt(checked), lang) : undefined,
    status: VERDICT_STATUS[verdict],
  };
}

function alert(data: Data, lang: Lang): KindAlert | null {
  const verdict = verdictOf(data);
  if (verdict === 'clear') return null;
  if (verdict === 'stopped') {
    return { headline: sayWords(W.alertStoppedHead, lang), line: sayWords(W.alertStoppedLine, lang), severity: 'problem' };
  }
  if (verdict === 'pending') {
    return {
      headline: sayWords(W.alertPendingHead(data.failingCount), lang),
      line: sayWords(W.alertPendingLine, lang),
      severity: 'attention',
    };
  }
  return { headline: sayWords(W.alertUnclearHead, lang), line: sayWords(W.alertUnclearLine, lang), severity: 'attention' };
}

function headline(data: Data, lang: Lang): string {
  const verdict = verdictOf(data);
  const words =
    verdict === 'stopped'
      ? W.tileStopped
      : verdict === 'pending'
        ? W.tilePending(data.failingCount)
        : verdict === 'clear'
          ? W.tileClear
          : W.tileUnclear;
  return `${sayWords(W.title, lang)}: ${sayWords(words, lang)}`;
}

function share(data: Data, lang: Lang): string {
  const checked = stampWords(data.capturedAt, lang);
  const lines = [sayWords(W.title, lang), leadText(data, lang)];
  for (const row of data.rows ?? []) {
    if (row.mark === 'YES') continue;
    lines.push(`- ${rowText(row, lang)}`);
  }
  if (checked) lines.push(sayWords(W.checkedAt(checked), lang));
  return lines.join('\n');
}

export const view: KindView<'ro_supply'> = {
  kind: 'ro_supply',
  Overlay,
  Glyph,
  tile,
  alert,
  headline,
  share,
};
