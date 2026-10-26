import { create } from 'zustand';

/**
 * Where this phone stands on notifications, as far as the app can tell.
 *
 *  - `unknown`     — not asked yet, or the shell has not answered. Also an older
 *                    shell that never will; it still hands over a token by itself.
 *  - `ask`         — the phone has never been asked. The app explains first (a
 *                    card on the chat list, a row in Settings) and only then lets
 *                    the phone show its prompt, because the phone shows it once.
 *  - `on`          — permission is granted; a token is registered or on its way.
 *  - `off`         — refused. Only the phone's own Settings can turn it back on.
 *  - `unavailable` — Expo Go, or a binary with no notifications at all. There is
 *                    nothing to offer, so nothing is shown.
 *
 * NOT PERSISTED. The phone is the source of truth and can change it behind the
 * app's back (Settings, Focus), so a remembered answer would only be a stale one.
 * It is asked again on every start and whenever the app comes back to the front.
 */
export type PushState = 'unknown' | 'ask' | 'on' | 'off' | 'unavailable';

interface PushStoreState {
  pushState: PushState;
  setPushState: (pushState: PushState) => void;
}

export const usePushStore = create<PushStoreState>()((set) => ({
  pushState: 'unknown',
  setPushState: (pushState) => set({ pushState }),
}));

/** The two reminders the chat list can show, each snoozed on its own clock. */
export type PushNoticeKind = 'ask' | 'off';

/**
 * How long "Not now" and the dismiss stay quiet. A dealer who has said no to the
 * explanation is asked again within the week; one whose phone says no is told
 * less often, because there is nothing they can do from inside the app.
 */
export const PUSH_SNOOZE_DAYS: Record<PushNoticeKind, number> = { ask: 3, off: 7 };

const DAY_MS = 24 * 60 * 60 * 1000;
const snoozeKey = (kind: PushNoticeKind) => `mdg.client.pushNotice.${kind}.until`;

/**
 * Whether this reminder is still snoozed. Wrapped in try/catch because a WebView
 * with storage switched off throws on ACCESS, not just on write; with no
 * storage the reminder simply shows every time, which is the safe side.
 */
export function isPushNoticeSnoozed(kind: PushNoticeKind, now = Date.now()): boolean {
  try {
    const until = Number(localStorage.getItem(snoozeKey(kind)));
    return Number.isFinite(until) && until > now;
  } catch {
    return false;
  }
}

/** Hide this reminder for its snooze period. */
export function snoozePushNotice(kind: PushNoticeKind, now = Date.now()): void {
  try {
    localStorage.setItem(snoozeKey(kind), String(now + PUSH_SNOOZE_DAYS[kind] * DAY_MS));
  } catch {
    /* storage unavailable: the reminder may come back sooner, which is harmless */
  }
}
