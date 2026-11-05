import { ApiError } from '@/lib/api';
import type { MessageKey, TFunction } from '@/lib/i18n';
import { PaperRejected } from '@/lib/uploadDuOtpPaper';
import type {
  DuOtpEntryView,
  DuOtpFileSource,
  DuOtpGroupView,
  DuOtpReason,
  DuOtpStep,
} from '@dk/shared/types';

/**
 * The small decisions behind the DU OTP box, kept apart from the drawing so they
 * can be tested without a screen.
 */

/** The questions the box asks, counted: reasons, certificate, report, other, remark. */
export const DU_OTP_STEP_COUNT = 5;

const STEP_ORDER: readonly DuOtpStep[] = ['reasons', 'certificate', 'serviceReport', 'other', 'remarks'];

/** "Step N of 5" — `null` on the review, which is the end of the questions, not one of them. */
export function stepNumber(step: DuOtpStep): number | null {
  const i = STEP_ORDER.indexOf(step);
  return i < 0 ? null : i + 1;
}

export const REASON_KEY: Record<DuOtpReason, MessageKey> = {
  e_calibration: 'chat.duOtpReasonCalibration',
  'Pulsar Repair': 'chat.duOtpReasonPulsar',
  Replacement: 'chat.duOtpReasonReplacement',
  Others: 'chat.duOtpReasonOthers',
};

export const STEP_TITLE_KEY: Record<DuOtpStep, MessageKey> = {
  reasons: 'chat.duOtpStepReasons',
  certificate: 'chat.duOtpStepCertificate',
  serviceReport: 'chat.duOtpStepReport',
  other: 'chat.duOtpStepOther',
  remarks: 'chat.duOtpStepRemarks',
  review: 'chat.duOtpStepReview',
};

export const SOURCE_KEY: Partial<Record<DuOtpFileSource, MessageKey>> = {
  emaaptaul: 'chat.duOtpSrcEmaaptaul',
  on_file: 'chat.duOtpSrcOnFile',
  admin: 'chat.duOtpSrcAdmin',
};

const IST_DATE = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/**
 * A date as the portal and the owner write it: 05-11-2026.
 *
 * A plain day (`2026-11-05`, what the contract calls YYYY-MM-DD) is re-ordered as
 * text — it is a calendar day, not a moment, and must not move with the phone's
 * time zone. A timestamp is the day it was in India.
 */
export function formatDmy(value: string | null | undefined): string | null {
  if (!value) return null;
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (day) return `${day[3]}-${day[2]}-${day[1]}`;
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return null;
  return IST_DATE.format(at).replace(/\//g, '-');
}

/** "Gilbarco Encore 300" — the make and model, whichever of them there is. */
export function duName(duMake: string, duModel: string): string {
  return [duMake, duModel]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ');
}

/** "DU Gilbarco Encore 300 · serial 1234" — the line that says which dispensing unit. */
export function duLine(
  t: TFunction,
  du: { duMake: string; duModel: string; duSerial: string },
): string {
  const name = duName(du.duMake, du.duModel);
  const serial = du.duSerial.trim();
  return [name ? t('chat.duOtpDu', { name }) : '', serial ? t('chat.duOtpSerial', { serial }) : '']
    .filter(Boolean)
    .join(' · ');
}

/** Each nozzle once, in the order the events came. */
export function nozzlesOf(entries: readonly Pick<DuOtpEntryView, 'nozzleNo'>[]): string[] {
  const seen: string[] = [];
  for (const e of entries) {
    const n = e.nozzleNo.trim();
    if (n && !seen.includes(n)) seen.push(n);
  }
  return seen;
}

/** "Nozzle 3" or "Nozzles 1, 2". */
export function nozzleText(t: TFunction, nozzles: readonly string[]): string {
  if (nozzles.length === 0) return '';
  return nozzles.length === 1
    ? t('chat.duOtpNozzle', { n: nozzles[0]! })
    : t('chat.duOtpNozzles', { n: nozzles.join(', ') });
}

/** The OTP date of an event, dd-mm-yyyy. The printed text is the fallback when it did not read. */
export function otpDateOf(entry: Pick<DuOtpEntryView, 'transactionDate' | 'transactionDateText'>): string {
  return formatDmy(entry.transactionDate) ?? entry.transactionDateText.trim();
}

/**
 * The calibration dates the portal will be given for a group, each once. They are
 * the events' OTP dates, so they are all the same day unless the engineer came
 * back on another.
 */
export function calibrationDatesOf(group: Pick<DuOtpGroupView, 'entries'>): string[] {
  const seen: string[] = [];
  for (const e of group.entries) {
    const d = formatDmy(e.calibrationDate);
    if (d && !seen.includes(d)) seen.push(d);
  }
  return seen;
}

/** Why the filing failed, in plain words: the first failed event that says. */
export function groupFailure(group: Pick<DuOtpGroupView, 'entries'>): string | null {
  for (const e of group.entries) {
    if (e.state !== 'failed') continue;
    const words = e.failure?.trim();
    if (words) return words;
  }
  return null;
}

/** An event shown on the "done" lines: filed by MDG, or closed on the portal by itself. */
export interface RecentLine {
  key: string;
  duMake: string;
  duModel: string;
  duSerial: string;
  nozzles: string[];
  state: 'submitted' | 'gone';
  /** dd-mm-yyyy: when it was filed (or, for one that closed by itself, last seen). */
  date: string | null;
}

/**
 * The closed events of the last two weeks, one line per dispensing unit and day:
 * three nozzles filed together read as one line, not three.
 */
export function summariseRecent(recent: readonly DuOtpEntryView[]): RecentLine[] {
  const lines: RecentLine[] = [];
  for (const e of recent) {
    if (e.state !== 'submitted' && e.state !== 'gone') continue;
    const date = formatDmy(e.state === 'submitted' ? (e.submittedAt ?? e.lastSeenAt) : e.lastSeenAt);
    const key = [e.duMake, e.duModel, e.duSerial, e.state, date ?? ''].join('|');
    const found = lines.find((l) => l.key === key);
    const nozzle = e.nozzleNo.trim();
    if (found) {
      if (nozzle && !found.nozzles.includes(nozzle)) found.nozzles.push(nozzle);
      continue;
    }
    lines.push({
      key,
      duMake: e.duMake,
      duModel: e.duModel,
      duSerial: e.duSerial,
      nozzles: nozzle ? [nozzle] : [],
      state: e.state,
      date,
    });
  }
  return lines;
}

/**
 * The words under an answer or an upload that did not go through.
 *
 * The server's own words are shown for a refusal (4xx): the route answers in
 * plain words ("Tick at least one reason", "Only the owner can do this"). A rate
 * limit, a dropped connection or a server fault says it its own way, because
 * what the server says there is for engineers.
 */
export function duOtpErrorText(err: unknown, t: TFunction, what: 'answer' | 'paper'): string {
  if (err instanceof PaperRejected) {
    return err.reason === 'size' ? t('chat.duOtpTooBig') : t('chat.duOtpBadType');
  }
  if (err instanceof ApiError) {
    if (err.status === 429) return t('chat.portalRateLimited');
    const words = err.message.trim();
    if (err.status >= 400 && err.status < 500 && words) return words;
  }
  return what === 'paper' ? t('chat.duOtpFileFailed') : t('chat.portalSaveFailed');
}
