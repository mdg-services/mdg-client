import { detectPlatform, isNativeShell, nativeHas } from './nativeBridge';

/**
 * WHY OLD ANDROID PHONE APPS CANNOT RECORD, AND WHAT THE CHAT SAYS ABOUT IT
 * -------------------------------------------------------------------------
 * Every Android build of the Dealer Kavach phone app up to 0.1.x was made without
 * the permission Android calls MODIFY_AUDIO_SETTINGS. The browser engine inside
 * the app refuses to open the microphone without it, so every press of the mic
 * fails ("Could not start audio source", reported to the page as NotReadableError)
 * no matter what the page does. Only a new app from the Play Store fixes it. Builds
 * from 0.2.0 declare the permission and say so with the shell feature `mic-ready`.
 *
 * So when an Android phone app WITHOUT `mic-ready` fails to start the mic (after
 * the recorder's own quiet retry), the chat shows an "app update needed" card
 * instead of the general "the mic didn't start" strip.
 *
 * Until the 0.2.0 build is actually live on the Play Store there is nothing to
 * update TO, so the card only says the fix comes with the next app update and
 * offers typing instead. Flip this to `true` in a one-line deploy once the new
 * Android build is live: the card then shows "Update from Play Store".
 */
export const ANDROID_MIC_UPDATE_ON_PLAY = false;

/** The dealer app's Play Store id. */
export const DEALER_APP_PACKAGE = 'in.mdgservices.dealerkavach';

/** The dealer app's Play Store page, for a phone app too old to open the store itself. */
export const DEALER_APP_PLAY_URL = `https://play.google.com/store/apps/details?id=${DEALER_APP_PACKAGE}`;

/**
 * Read through a function, not the constant, so a test can model both sides of
 * the switch without rebuilding the module.
 */
export function androidMicUpdateLive(): boolean {
  return ANDROID_MIC_UPDATE_ON_PLAY;
}

/**
 * True inside an Android phone app that was built without the microphone fix.
 *
 * Read from the ABSENCE of `mic-ready`, which every build from 0.2.0 declares.
 * Never used to block a press: the mic is always tried first, because the page
 * cannot be sure (a phone app built by hand, an unusual Android) and a working
 * mic must never be turned away on a guess.
 */
export function isOldAndroidAppForMic(): boolean {
  return isNativeShell() && detectPlatform() === 'android' && !nativeHas('mic-ready');
}

/**
 * The two failures the missing permission produces. Chromium reports the failed
 * start as NotReadableError; some WebView versions report the same failure as
 * AbortError.
 */
export function isMicStartFailure(name: string): boolean {
  return name === 'NotReadableError' || name === 'AbortError';
}

/**
 * Which words the phone's own permission box uses for "yes".
 *
 * From Android 11 the box has no "Allow" button for the microphone: it offers
 * "While using the app", "Only this time" and "Don't allow". Telling someone to
 * tap "Allow" there sends them looking for a button that does not exist, so on
 * those phones the chat names "While using the app" instead. iPhones and older
 * Android keep "Allow". An Android version the page cannot read is taken to be
 * a new one, because almost every phone in use is.
 */
export function micAskYesWords(): 'while-using' | 'allow' {
  if (detectPlatform() !== 'android') return 'allow';
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent || '';
  const match = /Android (\d+)/.exec(ua);
  const major = match ? Number(match[1]) : NaN;
  return Number.isFinite(major) && major < 11 ? 'allow' : 'while-using';
}
