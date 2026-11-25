/**
 * Which messages are reports, and of what kind (ADR 0055).
 *
 * A report is a card or notice MDG sends that the dealer reads rather than answers
 * (a DSR picture, a credit card, a tanker's density). The Today page lists the
 * newest of each kind; in the chat the same message shows its words and a button
 * to Today. The server's feed and the dealer app both ask `reportOf`, so the page
 * and the chat can never disagree about what counts as a report.
 *
 * TWO WAYS A MESSAGE IS A REPORT
 * ------------------------------
 *  1. It carries a tag (`message.report`), put there by the sender at post time.
 *  2. It is older than the tag: nothing marks it, so its caption and its
 *     attachment's file name are read. Captions come in three languages (Hindi,
 *     Hinglish, English), and every language of a message is read, so the match
 *     does not depend on who is looking. The patterns are the captions MDG really
 *     sent in the 30-day read behind the ADR — keep them while old messages exist.
 *
 * WHAT IS NEVER A REPORT
 * ----------------------
 * Interactive boxes (an ask, a login box, a setup card…) are tasks that live in the
 * chat, not reports. A dealer's own message is not one. Ordinary team text is not
 * one: an untagged message is only recognised when it carries a picture or file
 * (or is a tanker card or an announcement) and was posted by MDG's machinery.
 */
import { REPORT_KINDS } from '../types/conversation';
import type { MessageReport, ReportKind, ReportStatus } from '../types/conversation';
import type { ReportData } from '../types/reportData';

/** Kinds that read as "MDG did this for you today", when their status is `ok`. */
export const DONE_REPORT_KINDS: ReadonlySet<ReportKind> = new Set<ReportKind>([
  'declaration_filed',
  'tt_ack',
  'du_otp',
  'mock_drill',
  // ADR 0056: receipts too — an electrical audit filed, a subsidy claim filed.
  'electrical_audit',
  'calibration_claim',
]);

/**
 * Kinds an owner reads and a manager never does: money owed and the account's other
 * entries. The tanker plan is NOT here: an admin may send it to the manager group on
 * purpose (the planner's audience choice), and who reads what then follows chat
 * membership like every other report.
 */
export const OWNER_ONLY_REPORT_KINDS: ReadonlySet<ReportKind> = new Set<ReportKind>([
  'credit_dod',
  'ledger_watch',
  // ADR 0056: the subsidy claim is money in the owner's name.
  'calibration_claim',
]);

/**
 * Kinds whose "needs a look" is only true for the day (or the day after) the card was
 * made: a missed water window, a tank reading gone stale, "order a tanker today", a
 * supply problem, a tanker that was changed, a refused order. Nothing
 * sends an "all clear" card, so the server ages the report's status to `info` once its
 * day is before yesterday, and the app must read that aged status (it never trusts the
 * frozen snapshot alone for these kinds). One list, so the two sides cannot drift.
 */
export const AGING_REPORT_KINDS: ReadonlySet<ReportKind> = new Set<ReportKind>([
  'load_plan',
  'ro_supply',
  'stock_check',
  'water_ingress',
  'fuel_order',
]);

/** True for a receipt of work MDG finished (a filing, an acknowledgement): the "Done for you" list. */
export function isDoneReport(r: { kind: ReportKind; status: ReportStatus }): boolean {
  return DONE_REPORT_KINDS.has(r.kind) && r.status === 'ok';
}

// A pictograph, or one of the invisible joiners that glue an emoji together.
const LEADING_PICTOGRAPHS =
  /^(?:\s|\u200D|\uFE0F|\u20E3|\p{Extended_Pictographic}|\p{Regional_Indicator})+/u;
// "DSR · 23 Nov", "कवच · हमें आपसे…": a short heading and a middle dot.
const LABEL_PREFIX = /^([^\n·•]{1,40}?)\s*[·•]\s+(?=\S)/u;

/**
 * An OLD card's caption, the way a person on the team would have written it.
 *
 * Captions sent before 24 Nov 2026 lead with an emoji ("📊 DSR · 23 Nov …") or a
 * heading and a middle dot; a message from the team has neither. The same rule holds
 * in every language and for a heading of any length: the leading emoji goes, and the
 * heading's own words stay with the dot turned into a comma, because they are the
 * only thing that says what the message is ("DSR, 23 Nov — …", "Water ingress
 * testing, 23 Nov — …"). A heading never carries a figure ("5 KL · …" is a fact, not a
 * heading). The figures and the other words are left exactly as sent, and a caption
 * without these marks comes back as it was.
 *
 * Only for messages that carry no tag and are not an announcement or a tanker card:
 * a tagged message's text is already the team's own, and an announcement is
 * whatever an admin typed.
 */
export function cleanLegacyCaption(text: string): string {
  const lines = text.split('\n').map((line) => line.replace(LEADING_PICTOGRAPHS, ''));
  const first = lines.findIndex((l) => l.trim() !== '');
  if (first >= 0) {
    const line = lines[first]!;
    const m = LABEL_PREFIX.exec(line);
    if (m && !/\d/.test(m[1]!)) {
      lines[first] = `${m[1]!.trim()}, ${line.slice(m[0].length)}`;
    }
  }
  return lines.join('\n').trim();
}

interface AttachmentLike {
  filename?: string | null;
  contentType?: string | null;
  kind?: string | null;
}

/**
 * The parts of a message `reportOf` reads. The dealer app's `Message`, the admin's,
 * and a stored message read straight from the database all fit, which is why every
 * field is optional and loosely typed.
 */
export interface ReportSource {
  report?: MessageReport | null;
  senderRole?: string | null;
  system?: boolean | null;
  body?: string | null;
  bodyByLang?: Partial<Record<string, string | null | undefined>> | null;
  attachments?: ReadonlyArray<AttachmentLike> | null;
  attachmentsByLang?: Partial<Record<string, ReadonlyArray<AttachmentLike> | null | undefined>> | null;
  createdAt?: string | Date | null;
  fuelCard?: { kind?: string; hero?: string | null } | null;
  fuelIndent?: { sapOrderNo?: string | null } | null;
  announcement?: { title?: string | null; tone?: string | null } | null;
  // The interactive boxes: only their presence matters here.
  ask?: unknown;
  portalLogin?: unknown;
  wemmisLogin?: unknown;
  setupCard?: unknown;
  duOtpAck?: unknown;
  mockDrill?: unknown;
  declarations?: unknown;
  outletDetails?: unknown;
  videoList?: unknown;
  complaint?: unknown;
  workPermit?: unknown;
}

/**
 * True when the message is a box the dealer answers or fills (a photo ask, a login
 * form, the setup card, a DU OTP, mock drill, declarations, pump details, the
 * "your videos" list, a complaint or work permit, a sign-letter ask). Those are
 * tasks, not reports, and the chat draws them exactly as it always has.
 */
export function isInteractiveMessage(m: ReportSource): boolean {
  return Boolean(
    m.ask ||
      m.portalLogin ||
      m.wemmisLogin ||
      m.setupCard ||
      m.duOtpAck ||
      m.mockDrill ||
      m.declarations ||
      m.outletDetails ||
      m.videoList ||
      m.complaint ||
      m.workPermit,
  );
}

const KIND_SET: ReadonlySet<string> = new Set(REPORT_KINDS);

/** A file the dealer can look at as a card: a picture or a document, not a voice note or a video. */
function isCardFile(a: AttachmentLike): boolean {
  if (a.kind === 'audio') return false;
  const type = a.contentType ?? '';
  if (type.startsWith('audio/') || type.startsWith('video/')) return false;
  return Boolean(a.filename) || Boolean(type);
}

function allAttachments(m: ReportSource): AttachmentLike[] {
  const out: AttachmentLike[] = [...(m.attachments ?? [])];
  for (const list of Object.values(m.attachmentsByLang ?? {})) {
    if (list) out.push(...list);
  }
  return out;
}

/** The message's words in every language it was written in, joined: a pattern for any language matches. */
function allText(m: ReportSource): string {
  const parts: string[] = [];
  if (m.body) parts.push(m.body);
  for (const v of Object.values(m.bodyByLang ?? {})) {
    if (v && v !== m.body) parts.push(v);
  }
  return parts.join('\n');
}

// ─── Old messages: the file name says the kind, the caption says the verdict ───

/** A card's file name never changes with the reader's language, so it is the steadiest clue. */
const FILE_KIND_RULES: ReadonlyArray<readonly [RegExp, ReportKind]> = [
  [/^dsr-variation-/i, 'dsr_variation'],
  [/^dsr-sales-/i, 'dsr_sales'],
  [/^credit-dod-card/i, 'credit_dod'],
  [/^water-ingress-/i, 'water_ingress'],
  [/^ro-supply-status-/i, 'ro_supply'],
  [/^load-plan-/i, 'load_plan'],
  [/^other-movements-/i, 'ledger_watch'],
  [/^stock(\s.*)?\.(png|jpe?g|webp)$/i, 'stock_check'],
  [/^tanker density/i, 'tanker_density'],
  [/^pavati/i, 'tt_ack'],
  [/^(safety|washroom) declaration/i, 'declaration_filed'],
  [/^mock drill/i, 'mock_drill'],
  [/^du otp acknowledgement/i, 'du_otp'],
];

/**
 * The captions MDG sent before reports were tagged, in Hindi, Hinglish and English,
 * in the order they are tried. Each pattern is written to survive the changes seen in
 * the real captions (a leading emoji, a date in the middle, a different verdict).
 */
const CAPTION_KIND_RULES: ReadonlyArray<readonly [RegExp, ReportKind]> = [
  [
    /(सेफ्टी\s*डिक्लेरेशन|स्वच्छता\s*डिक्लेरेशन|वॉशरूम\s*का\s*डिक्लेरेशन|safety\s+declaration|washroom\s+declaration)/i,
    'declaration_filed',
  ],
  [
    /(टैंक\s*में\s*पानी\s*की\s*जाँच|water\s+ingress|tank\s+mein\s+paani\s+ki\s+jaanch|💧)/i,
    'water_ingress',
  ],
  [/(सप्लाई\s*की\s*स्थिति|supply\s+ki\s+sthiti|RO\s+supply\s+status)/i, 'ro_supply'],
  [
    /(कोई\s*बकाया\s*नहीं|no\s+dues|koi\s+baaki\s+nahi|बकाया|overdue|due\s+by|was\s+due|jama\s+kijiye|तक\s*जमा\s*करें|review\s+date|credit\s*&\s*dod|क्रेडिट\s*और\s*DOD|credit\s+locked)/i,
    'credit_dod',
  ],
  [
    /(पावती\s*MDG\s*ने|टैंकर.{0,40}की\s*पावती|acknowledgement\s+for\s+tanker|acknowledgement\s+MDG\s+ne|entered\s+the\s+acknowledgement)/i,
    'tt_ack',
  ],
  [
    /(की\s*डेंसिटी\s*आ\s*गई|density\s+for\s+tanker|new\s+tanker\s+density|ki\s+density\s+aa\s+gayi)/i,
    'tanker_density',
  ],
  [
    /(IRAS\s*(की\s*)?(reading|रीडिंग)|stock\s+in\s+your\s+tanks|टैंक\s*में\s*स्टॉक|tank\s+mein\s+stock)/i,
    'stock_check',
  ],
  [/(मॉक\s*ड्रिल|mock\s*drill)/i, 'mock_drill'],
  [
    /(📒|खाते\s*में.{0,60}एंट्री|entries\s+on\s+your\s+account|entry\s+on\s+your\s+account|khaate\s+mein.{0,60}entry)/i,
    'ledger_watch',
  ],
  [
    /(order\s+(a|an|\d+)\s+tankers?\s+today|tanker\s+order\s+kijiye|टैंकर\s*(का\s*)?ऑर्डर|is\s+running\s+out|tanker\s+plan|टैंकर\s*प्लान)/i,
    'load_plan',
  ],
  // The DSR is last of the captions: it is the broadest ("limit", "sales").
  [
    /(स्टॉक\s*वेरिएशन|stock\s+variation|सीमा\s*(से\s*बाहर|में)|within\s+limit|over\s+limit|seema\s+(se\s+bahar|mein))/i,
    'dsr_variation',
  ],
  [/(दैनिक\s*बिक्री|daily\s+sales|rozana\s+bikri)/i, 'dsr_sales'],
];

const rx = {
  dsrOver: /(सीमा\s*से\s*बाहर|over\s+limit|seema\s+se\s+bahar)/i,
  dsrWithin: /(सीमा\s*में|within\s+limit|seema\s+mein)/i,
  noDues: /(कोई\s*बकाया\s*नहीं|no\s+dues|koi\s+baaki\s+nahi)/i,
  // English says "recorded of total"; Hindi and Hinglish say "total mein se recorded".
  windowsEn: /(\d+)\s+of\s+(\d+)/i,
  windowsHi: /(\d+)\s*(?:में\s*से|mein\s*se)\s*(\d+)/i,
  ttShortage: /(shortage|कमी\s*दिख|kami\s*dikh)/i,
  supplyOk: /(nothing\s+is\s+holding|कुछ\s*भी\s*बाक़ी|कुछ\s*भी\s*बाकी|kuch\s+bhi\s+baaki)/i,
  supplyBad:
    /(not\s+clear|cannot\s+lift|can.?t\s+lift|stop\s+your\s+fuel|काम\s*बाक़ी|काम\s*बाकी|नहीं\s*ले\s*सकत|nahi\s+le\s+sakta|koi\s+bhi\s+ek)/i,
  loadOrder: /(order|running\s+out|ऑर्डर|kijiye)/i,
  stockStale: /(last\s+reading\s+IRAS|आखिरी\s*रीडिंग|आख़िरी\s*रीडिंग|aakhri\s+reading)/i,
  filed: /(भर\s*दिया|जमा\s*हो\s*गई|filed|bhar\s+diya|jama\s+ho\s+gayi)/i,
  vehicle: /([A-Z]{2}\s?\d{1,2}\s?[A-Z]{1,3}\s?\d{3,4})/,
};

/** The verdict a caption gives, for the kind it was recognised as. */
function statusFromCaption(kind: ReportKind, text: string): ReportStatus {
  switch (kind) {
    case 'dsr_variation':
      if (rx.dsrOver.test(text)) return 'attention';
      if (rx.dsrWithin.test(text)) return 'ok';
      return 'info';
    case 'dsr_sales':
      return 'ok';
    case 'credit_dod':
      return rx.noDues.test(text) ? 'ok' : 'attention';
    case 'water_ingress': {
      const en = rx.windowsEn.exec(text);
      const hi = rx.windowsHi.exec(text);
      const recorded = en ? Number(en[1]) : hi ? Number(hi[2]) : NaN;
      const total = en ? Number(en[2]) : hi ? Number(hi[1]) : NaN;
      if (Number.isNaN(recorded) || Number.isNaN(total)) return 'info';
      return recorded < total ? 'attention' : 'ok';
    }
    case 'ro_supply':
      if (rx.supplyOk.test(text)) return 'ok';
      return rx.supplyBad.test(text) ? 'attention' : 'info';
    case 'tt_ack':
      return rx.ttShortage.test(text) ? 'attention' : 'ok';
    case 'declaration_filed':
      return 'ok';
    case 'mock_drill':
      return rx.filed.test(text) ? 'ok' : 'info';
    case 'stock_check':
      return rx.stockStale.test(text) ? 'attention' : 'ok';
    case 'ledger_watch':
      return 'attention';
    case 'load_plan':
      return rx.loadOrder.test(text) ? 'attention' : 'info';
    case 'du_otp':
      return 'ok';
    case 'tanker_density':
    case 'fuel_order':
    case 'announcement':
    // The three kinds ADR 0056 added never had a captioned picture to read a verdict from.
    case 'electrical_audit':
    case 'calibration_claim':
    case 'paper_expiry':
      return 'info';
  }
}

// ─── The day a card is about ───

const EN_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const HI_MONTHS: ReadonlyArray<readonly [RegExp, number]> = [
  [/^जनवरी/, 1],
  [/^(फ़|फ)रवरी/, 2],
  [/^मार्च/, 3],
  [/^अप्रैल/, 4],
  [/^मई/, 5],
  [/^जून/, 6],
  [/^जुलाई/, 7],
  [/^अगस्त/, 8],
  [/^सित(ं|म्)बर/, 9],
  [/^अक्(टू|तू)बर/, 10],
  [/^नव(ं|म्)बर/, 11],
  [/^दिस(ं|म्)बर/, 12],
];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function isRealDate(y: number, mo: number, d: number): boolean {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

/** The date in a file name: `…-2026-11-22.png`, the last one when there are two, or `… 22-11-2026.png`. */
function dayFromFilename(name: string): string | undefined {
  const iso = [...name.matchAll(/(\d{4})-(\d{2})-(\d{2})/g)].pop();
  if (iso) {
    const [, y = '', mo = '', d = ''] = iso;
    if (isRealDate(+y, +mo, +d)) return `${y}-${mo}-${d}`;
  }
  const dmy = /(\d{2})-(\d{2})-(\d{4})(?=\.[a-z]+$)/i.exec(name);
  if (dmy) {
    const [, d = '', mo = '', y = ''] = dmy;
    if (isRealDate(+y, +mo, +d)) return `${y}-${mo}-${d}`;
  }
  return undefined;
}

/**
 * A caption's "22 Nov" / "22 नवंबर" / "22 November", with the year taken from when
 * the message was sent (a date more than two days after the send belongs to the
 * year before).
 */
function dayFromCaption(text: string, sent: Date | undefined): string | undefined {
  if (!sent || Number.isNaN(sent.getTime())) return undefined;
  for (const m of text.matchAll(/(\d{1,2})\s+([\u0900-\u097FA-Za-z]+)/g)) {
    const d = Number(m[1]);
    const word = m[2] ?? '';
    let mo = 0;
    const latin = EN_MONTHS.indexOf(word.slice(0, 3).toLowerCase());
    if (latin >= 0 && /^[A-Za-z]/.test(word)) mo = latin + 1;
    else mo = HI_MONTHS.find(([re]) => re.test(word))?.[1] ?? 0;
    if (!mo) continue;
    let y = sent.getUTCFullYear();
    if (!isRealDate(y, mo, d)) continue;
    if (Date.UTC(y, mo - 1, d) > sent.getTime() + 2 * 86_400_000) y -= 1;
    if (!isRealDate(y, mo, d)) continue;
    return `${y}-${pad(mo)}-${pad(d)}`;
  }
  return undefined;
}

/** Kinds whose caption date is the day the card is about (not a due date or a reading time). */
const CAPTION_DAY_KINDS: ReadonlySet<ReportKind> = new Set<ReportKind>([
  'dsr_variation',
  'dsr_sales',
  'water_ingress',
]);

function sentAt(m: ReportSource): Date | undefined {
  if (!m.createdAt) return undefined;
  const d = m.createdAt instanceof Date ? m.createdAt : new Date(m.createdAt);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function trimKey(s: string, max = 80): string {
  return s.trim().slice(0, max);
}

/**
 * The report a message is, or null.
 *
 * A tagged message returns its tag as it is. Otherwise the message must have been
 * posted by MDG's machinery (an admin sender, flagged `system`), must not be an
 * interactive box, and must carry a picture or file, a tanker card or an
 * announcement; its caption and file name then give the kind, the verdict and, when
 * cheap, the day.
 */
export function reportOf(m: ReportSource): MessageReport | null {
  if (m.report && KIND_SET.has(m.report.kind)) return m.report;
  if (isInteractiveMessage(m)) return null;
  if (m.senderRole !== 'admin' || !m.system) return null;

  if (m.fuelCard) {
    const key = m.fuelIndent?.sapOrderNo || m.fuelCard.hero || undefined;
    return {
      kind: 'fuel_order',
      status: m.fuelCard.kind === 'tanker_changed' ? 'attention' : 'ok',
      ...(key ? { key: trimKey(String(key)) } : {}),
    };
  }
  if (m.announcement) {
    const title = m.announcement.title?.trim();
    return {
      kind: 'announcement',
      status: m.announcement.tone === 'important' ? 'attention' : 'info',
      ...(title ? { key: trimKey(title) } : {}),
    };
  }

  const files = allAttachments(m).filter(isCardFile);
  if (files.length === 0) return null;

  const text = allText(m);
  const names = files.map((f) => f.filename ?? '');

  let kind: ReportKind | undefined;
  // A message with both DSR sheets is one report; the variation sheet leads it.
  const fileKinds = new Set<ReportKind>();
  for (const name of names) {
    const hit = FILE_KIND_RULES.find(([re]) => re.test(name));
    if (hit) fileKinds.add(hit[1]);
  }
  if (fileKinds.has('dsr_variation')) kind = 'dsr_variation';
  else kind = [...fileKinds][0];
  if (!kind) kind = CAPTION_KIND_RULES.find(([re]) => re.test(text))?.[1];
  if (!kind) return null;

  const status = statusFromCaption(kind, text);

  let day: string | undefined;
  for (const name of names) {
    day = dayFromFilename(name);
    if (day) break;
  }
  if (!day && CAPTION_DAY_KINDS.has(kind)) day = dayFromCaption(text, sentAt(m));

  let key: string | undefined;
  if (kind === 'tanker_density' || kind === 'tt_ack') {
    const v = rx.vehicle.exec(text);
    if (v?.[1]) key = v[1].replace(/\s+/g, '');
  }

  if (kind === 'declaration_filed') {
    // The safety declaration (daily) and the washroom one (weekly) are two receipts, not one.
    const probe = `${names.join(' ')} ${text}`;
    key = /(safety|सेफ्टी)/i.test(probe) ? 'safety' : 'washroom';
  }

  return { kind, status, ...(day ? { day } : {}), ...(key ? { key } : {}) };
}

// ─── The snapshot a report carries (ADR 0056) ───

/**
 * Compile-time proof that every report kind has a snapshot type and every snapshot type
 * has a kind: add a kind to one list and not the other and this stops compiling.
 */
export type ReportDataKindsMatch = [ReportKind] extends [ReportData['kind']]
  ? [ReportData['kind']] extends [ReportKind]
    ? true
    : never
  : never;

/**
 * A stored or received value as a snapshot, or undefined. Only the envelope is checked
 * (an object, a known kind, `v` 1, and — when the tag's kind is given — the same kind):
 * the sender built the rest from typed code, and a reader that meets a version it does
 * not know must fall back to the message's words, never draw half of it.
 */
export function reportDataOf(raw: unknown, tagKind?: ReportKind): ReportData | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as { kind?: unknown; v?: unknown };
  if (typeof r.kind !== 'string' || !KIND_SET.has(r.kind)) return undefined;
  if (r.v !== 1) return undefined;
  if (tagKind && r.kind !== tagKind) return undefined;
  return raw as ReportData;
}

/**
 * The snapshot as ONE viewer may read it, or undefined when the viewer may not read the
 * report at all. A manager gets nothing of an owner-only kind, and the owner-only money
 * blocks (the load plan's credit, a fuel order's refusal figures) are taken out of the
 * copy. Never changes its argument.
 */
export function reportDataForViewer(
  data: ReportData | undefined,
  role: 'owner' | 'manager',
): ReportData | undefined {
  if (!data) return undefined;
  if (role === 'owner') return data;
  if (OWNER_ONLY_REPORT_KINDS.has(data.kind)) return undefined;
  if (data.kind === 'load_plan') {
    const { credit: _credit, ...rest } = data;
    return rest;
  }
  if (data.kind === 'fuel_order') {
    const { credit: _credit, shortByRs: _short, ...rest } = data;
    return rest;
  }
  return data;
}
