import { isNativeShell } from '@/lib/nativeBridge';

/**
 * Whether a dealer may PAY from inside the Android app (ADR 0022 §1, §9).
 *
 * OFF, and it stays off unless the company enrols in Google's alternative
 * billing programme for India. Google Play's Payments policy puts "cloud
 * software and services" under Play Billing, has no exemption for business
 * software, and forbids an app to lead a user to any other way of paying
 * through "in-app webviews, buttons, links, messaging"
 * (support.google.com/googleplay/android-developer/answer/9858738 and
 * answer/10281818). Dealer Kavach on Play is a WebView of this web app, so the
 * rule lands here: inside the app a Pay button, a link to a payment page, or a
 * sentence like "pay on the website" is each a breach. The app may show what is
 * due and what was paid — read-only.
 *
 * One constant on purpose: enrolling turns this on and nothing else changes.
 */
export const PAY_IN_APP = false;

/**
 * True where paying is allowed: any ordinary browser, or the app too once
 * `PAY_IN_APP` is on. Every Pay button, every link to a payment page and every
 * line that mentions paying asks this, and nothing else asks `isNativeShell()`
 * about payments — so there is exactly one place to change.
 */
export function canPayHere(): boolean {
  return !isNativeShell() || PAY_IN_APP;
}
