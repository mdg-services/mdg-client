/**
 * "Can we reach them?" — whether a dealer member's phone will actually show MDG's
 * messages, in one plain line for the team (ADR 0040 §4), and which phone makers'
 * battery savers need the dealer's help (§7).
 *
 * WHY. When a dealer said they never got a message, nobody could tell whether the
 * phone had notifications on, whether the app was even installed, or when it was
 * last opened: the facts sat in three collections and a log line with no name on
 * it. The server gathers them into a `MemberReach`; `reachLine` turns that into the
 * sentence the admin shows beside each person.
 */

/** Phone makers whose battery savers are known to stop notifications of apps not opened often. */
export const PHONE_MAKERS = [
  'xiaomi',
  'oppo',
  'vivo',
  'realme',
  'oneplus',
  'samsung',
  'motorola',
  'other',
] as const;
export type PhoneMaker = (typeof PHONE_MAKERS)[number];

/** The ones whose battery saver is aggressive enough that the app shows a setup guide. */
export const STRICT_BATTERY_MAKERS: readonly PhoneMaker[] = [
  'xiaomi',
  'oppo',
  'vivo',
  'realme',
  'oneplus',
  'samsung',
];

export const PHONE_MAKER_LABEL: Record<PhoneMaker, string> = {
  xiaomi: 'Xiaomi / Redmi / POCO',
  oppo: 'Oppo',
  vivo: 'Vivo / iQOO',
  realme: 'Realme',
  oneplus: 'OnePlus',
  samsung: 'Samsung',
  motorola: 'Motorola',
  other: 'Other',
};

/**
 * The maker from what the phone app reports ("Xiaomi", "OPPO", "samsung") or, failing
 * that, from the model in an Android browser signature ("Redmi Note 12", "CPH2401",
 * "RMX3381", "V2134", "SM-A146B"). Null when neither says.
 */
export function phoneMakerOf(text: string | null | undefined): PhoneMaker | null {
  const s = (text ?? '').trim();
  if (!s) return null;
  if (/\b(xiaomi|redmi|poco|mi\s?\d|M\d{4}[A-Z]\d+[A-Z]*|2\d{6,9}[A-Z]{1,3})\b/i.test(s)) return 'xiaomi';
  if (/\b(realme|RMX\d{3,4})\b/i.test(s)) return 'realme';
  if (/\b(oneplus|ONEPLUS\s?A?\d+|NE\d{4}|LE\d{4})\b/i.test(s)) return 'oneplus';
  if (/\b(oppo|CPH\d{4}|PH[A-Z]\d{3})\b/i.test(s)) return 'oppo';
  if (/\b(vivo|iqoo|V2\d{3}[A-Z]?|I2\d{3})\b/i.test(s)) return 'vivo';
  if (/\b(samsung|SM-[A-Z]\d{3,4}[A-Z]{0,3})\b/i.test(s)) return 'samsung';
  if (/\b(motorola|moto\s?[a-z0-9]+)\b/i.test(s)) return 'motorola';
  // A bare manufacturer name we do not track ("Google", "Nokia") is still a maker.
  if (/^[a-z][a-z0-9 ._-]{1,30}$/i.test(s) && !/\b(Linux|Android|Mozilla)\b/i.test(s)) return 'other';
  return null;
}

/** One phone registered for this person's notifications. */
export interface ReachPhone {
  platform: 'android' | 'ios' | 'web';
  registeredAt: string;
  /** When the app last handed this phone's token over (each start with notifications on). */
  lastSeenAt: string;
  /** Has the pop-up channel (ADR 0040 §3). Android only; iPhones always pop up. */
  popUp: boolean;
  /** The latest push to it: the push service took it (sent), Google/Apple took it (ok), or refused. */
  lastPush: { at: string; status: 'sent' | 'ok' | 'error'; error?: string } | null;
}

export interface MemberReach {
  /** When the dealer app was last open and online. Null = not since 12 Nov 2026. */
  lastOpenAt: string | null;
  /** Where the app last reported from: the Android or iPhone app, or a browser. */
  platform: 'android' | 'ios' | 'web' | null;
  /** Notification permission as the app last reported it. */
  push: 'on' | 'off' | 'ask' | 'unavailable' | null;
  pushCanAskAgain: boolean | null;
  maker: PhoneMaker | null;
  phones: ReachPhone[];
  /** The last WhatsApp backup sent to this person (ADR 0040 §5), if any. */
  lastWhatsAppAt: string | null;
}

export type ReachTone = 'good' | 'warn' | 'bad' | 'unknown';

export interface ReachLine {
  tone: ReachTone;
  /** The one sentence for the team. */
  text: string;
  /** What to ask the dealer to do, when there is something. */
  fix?: string;
}

function ago(iso: string, now: Date): string {
  const mins = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

const PUSH_ERROR_WORDS: Record<string, string> = {
  DeviceNotRegistered: 'the app was removed from that phone',
  InvalidCredentials: 'our notification key was refused — MDG must fix this, not the dealer',
  MessageTooBig: 'the notification was too long',
  MessageRateExceeded: 'too many notifications at once',
  MismatchSenderId: 'the app build does not match our notification setup',
};

/**
 * The team's line for one person. Ordered by what stops a message first: no app,
 * notifications off, a failing phone, then the soft warnings.
 */
export function reachLine(r: MemberReach, now: Date = new Date()): ReachLine {
  const opened = r.lastOpenAt ? `App opened ${ago(r.lastOpenAt, now)}` : null;
  const phone = r.phones.find((p) => p.platform !== 'web') ?? null;
  const failing = r.phones.find((p) => p.lastPush?.status === 'error');

  if (r.platform === 'web' && !phone) {
    return {
      tone: 'bad',
      text: `Uses the website, not the app — gets no notifications.${opened ? ` ${opened}.` : ''}`,
      fix: 'Ask them to install Dealer Kavach from the Play Store and sign in there.',
    };
  }
  if (r.push === 'off') {
    return {
      tone: 'bad',
      text: `Notifications are OFF on their phone.${opened ? ` ${opened}.` : ''}`,
      fix: r.pushCanAskAgain
        ? 'Ask them to open the app and tap "Turn on" on the bar at the top of the chat list.'
        : 'Ask them to open the app and tap "Open settings" on the bar at the top, then switch notifications on.',
    };
  }
  if (!phone) {
    if (!r.lastOpenAt && !r.push) {
      return {
        tone: 'unknown',
        text: 'Has not opened the app since 12 Nov — no phone registered for notifications.',
        fix: 'Ask them to open the Dealer Kavach app once; it will ask to allow notifications.',
      };
    }
    return {
      tone: 'bad',
      text: `No phone registered for notifications.${opened ? ` ${opened}.` : ''}`,
      fix: 'Ask them to open the app and allow notifications when the phone asks.',
    };
  }
  if (failing?.lastPush) {
    const why = PUSH_ERROR_WORDS[failing.lastPush.error ?? ''] ?? 'the phone refused it';
    return {
      tone: 'bad',
      text: `Last notification failed ${ago(failing.lastPush.at, now)}: ${why}.${opened ? ` ${opened}.` : ''}`,
      fix:
        failing.lastPush.error === 'InvalidCredentials'
          ? undefined
          : 'Ask them to update or reinstall the app from the Play Store and sign in.',
    };
  }

  const parts: string[] = [`Notifications on (${phone.platform === 'ios' ? 'iPhone' : 'Android'})`];
  if (opened) parts.push(opened);
  if (phone.lastPush) {
    parts.push(
      phone.lastPush.status === 'ok'
        ? `last notification reached the phone's service ${ago(phone.lastPush.at, now)}`
        : `last notification sent ${ago(phone.lastPush.at, now)}`,
    );
  }
  const strict = r.maker && STRICT_BATTERY_MAKERS.includes(r.maker);
  const noPopUp = phone.platform === 'android' && !phone.popUp;
  if (noPopUp || strict) {
    const warn: string[] = [];
    if (noPopUp) warn.push('their app is older: notifications chime but do not pop up until it updates');
    if (strict) {
      warn.push(
        `${PHONE_MAKER_LABEL[r.maker!]} phones can block notifications to save battery — the app shows them how to allow it`,
      );
    }
    return { tone: 'warn', text: `${parts.join(' · ')}. Note: ${warn.join('; ')}.` };
  }
  return { tone: 'good', text: `${parts.join(' · ')}.` };
}
