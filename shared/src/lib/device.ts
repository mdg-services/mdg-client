/**
 * What kind of device a person used, read from the browser signature (the
 * User-Agent) of one request: for the admin's Onboarding page, "signed up in the
 * app on Android", "uses the iPhone app" (owner's request, 30 Oct 2026).
 *
 * Only the result is kept anywhere; the signature itself is personal data and is
 * never stored for this.
 *
 * HOW IT READS, from the signatures real dealers' sign-ins carry:
 *  - Android: "Linux; Android 13; …". Inside an app's own browser — the Dealer
 *    Kavach app, which shows the web app in one — Android adds "; wv)". Chrome on
 *    the phone does not.
 *  - iPhone / iPad: "iPhone" / "iPad" / "iPod". The iPhone app's browser leaves out
 *    the "Safari/…" that Safari, and every browser opened from Safari, carries.
 *  - A computer: Windows, a Mac, Linux on a PC, a Chromebook. An iPad set to
 *    "request desktop website" says Macintosh and is counted as a computer: its
 *    signature cannot tell them apart.
 *  - Facebook's and Instagram's own browsers also look "in an app"; they are not
 *    ours, so they never count as the app.
 */

export const DEVICE_KINDS = ['android', 'iphone', 'computer', 'other'] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];

export interface DeviceSeen {
  kind: DeviceKind;
  /** Inside an app's own browser rather than Chrome or Safari: for us, the Dealer Kavach app. */
  inApp: boolean;
}

/** Other apps' built-in browsers, which look "in an app" but are not ours. */
const OTHER_APPS = /\b(FBAN|FBAV|FB_IAB|Instagram|Line\/|Snapchat|Twitter|LinkedInApp)\b/i;

export function deviceFromUserAgent(ua: string | null | undefined): DeviceSeen | null {
  const s = (ua ?? '').trim();
  if (!s) return null;
  const otherApp = OTHER_APPS.test(s);
  if (/\bAndroid\b/i.test(s)) {
    return { kind: 'android', inApp: !otherApp && /;\s*wv\)/.test(s) };
  }
  if (/\b(iPhone|iPad|iPod)\b/.test(s)) {
    return { kind: 'iphone', inApp: !otherApp && !/\bSafari\//.test(s) };
  }
  if (/\b(Windows NT|Macintosh|CrOS|X11)\b/.test(s)) return { kind: 'computer', inApp: false };
  return { kind: 'other', inApp: false };
}
