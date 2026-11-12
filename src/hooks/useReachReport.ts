import * as React from 'react';

import { api } from '@/lib/api';
import { detectPlatform, isNativeShell, nativePhoneMaker } from '@/lib/nativeBridge';
import { usePushStore } from '@/store/push';

/**
 * Tell the server where notifications stand on this phone (ADR 0040 §4), so the
 * MDG team's "can we reach them?" line is true: notifications on or off, the
 * Android or iPhone app or a plain browser, and the phone's maker.
 *
 * Sent once the answer is known, and again whenever it changes — permission
 * switched in Settings, a refusal, a token arriving. A browser never learns a
 * push state (there is no shell to ask), so it says "web, unavailable" once.
 * Best effort: a failed report changes nothing for the dealer.
 */
export function useReachReport(): void {
  const pushState = usePushStore((s) => s.pushState);
  const canAskAgain = usePushStore((s) => s.canAskAgain);
  const lastSent = React.useRef<string | null>(null);

  React.useEffect(() => {
    const inApp = isNativeShell();
    // In the app, wait for the shell's answer; in a browser there will be none.
    if (inApp && pushState === 'unknown') return;
    const push = inApp ? (pushState === 'unknown' ? 'unavailable' : pushState) : 'unavailable';
    const maker = nativePhoneMaker();
    const body = {
      platform: inApp ? detectPlatform() : 'web',
      push,
      ...(push === 'off' ? { canAskAgain } : {}),
      ...(maker ? { maker } : {}),
    };
    const key = JSON.stringify(body);
    if (lastSent.current === key) return;
    lastSent.current = key;
    void api.post('/v1/devices/status', body).catch(() => {
      // Let the next change try again.
      lastSent.current = null;
    });
  }, [pushState, canAskAgain]);
}
