import { create } from 'zustand';

/**
 * Where this phone stands on notifications, as far as the app can tell.
 *
 *  - `unknown`     — not asked yet, or the shell has not answered. Also an older
 *                    shell that never will; it still hands over a token by itself.
 *  - `ask`         — the phone has never been asked. The app asks at once, on
 *                    the first start, so this lasts only until the dealer answers
 *                    (and is what Settings shows if that prompt went unanswered).
 *  - `on`          — permission is granted; a token is registered or on its way.
 *  - `off`         — refused. The chat list keeps a banner up; it asks again when
 *                    the phone still allows that (`canAskAgain`), else it opens
 *                    the phone's own Settings.
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
  /**
   * With `off`: will the phone still show its prompt? False (the default, and
   * what an older shell that never says is taken to mean) sends the dealer to
   * the phone's Settings instead of a button that would do nothing.
   */
  canAskAgain: boolean;
  /** `canAskAgain` is left as it was when not given. */
  setPushState: (pushState: PushState, canAskAgain?: boolean) => void;
}

export const usePushStore = create<PushStoreState>()((set) => ({
  pushState: 'unknown',
  canAskAgain: false,
  setPushState: (pushState, canAskAgain) =>
    set(canAskAgain === undefined ? { pushState } : { pushState, canAskAgain }),
}));
