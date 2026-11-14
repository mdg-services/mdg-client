import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ANDROID_MIC_UPDATE_ON_PLAY,
  DEALER_APP_PLAY_URL,
  isMicStartFailure,
  isOldAndroidAppForMic,
  micAskYesWords,
} from './micPolicy';

type ShellWindow = {
  ReactNativeWebView?: unknown;
  __DK_NATIVE_PLATFORM__?: string;
  __DK_NATIVE_FEATURES__?: string[];
};
const shell = () => window as unknown as ShellWindow;

/**
 * Which phone apps get the "update the app" card. Every Android build up to
 * 0.1.x lacks the permission the mic needs; 0.2.0 says so with `mic-ready`.
 */
describe('micPolicy', () => {
  afterEach(() => {
    delete shell().ReactNativeWebView;
    delete shell().__DK_NATIVE_PLATFORM__;
    delete shell().__DK_NATIVE_FEATURES__;
  });

  it('an Android phone app without mic-ready is an old one', () => {
    shell().ReactNativeWebView = { postMessage: () => {} };
    shell().__DK_NATIVE_PLATFORM__ = 'android';
    shell().__DK_NATIVE_FEATURES__ = ['portal'];
    expect(isOldAndroidAppForMic()).toBe(true);
  });

  it('an Android phone app with mic-ready, an iPhone, or a browser is not', () => {
    shell().ReactNativeWebView = { postMessage: () => {} };
    shell().__DK_NATIVE_PLATFORM__ = 'android';
    shell().__DK_NATIVE_FEATURES__ = ['mic-ready'];
    expect(isOldAndroidAppForMic()).toBe(false);
    shell().__DK_NATIVE_PLATFORM__ = 'ios';
    shell().__DK_NATIVE_FEATURES__ = [];
    expect(isOldAndroidAppForMic()).toBe(false);
    delete shell().ReactNativeWebView;
    expect(isOldAndroidAppForMic()).toBe(false);
  });

  it('only a failed start counts, never a refusal', () => {
    expect(isMicStartFailure('NotReadableError')).toBe(true);
    expect(isMicStartFailure('AbortError')).toBe(true);
    expect(isMicStartFailure('NotAllowedError')).toBe(false);
  });

  it('stays off until the new Android app is live on Play, and points at the dealer app', () => {
    expect(ANDROID_MIC_UPDATE_ON_PLAY).toBe(false);
    expect(DEALER_APP_PLAY_URL).toBe(
      'https://play.google.com/store/apps/details?id=in.mdgservices.dealerkavach',
    );
  });
});

/**
 * Android 11 and later has no "Allow" button for the microphone, only "While
 * using the app". The chat must name the button the phone actually shows.
 */
describe('micAskYesWords', () => {
  const ua = (value: string) => vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(value);
  afterEach(() => {
    delete shell().__DK_NATIVE_PLATFORM__;
  });

  it('Android 11 and later say "While using the app"', () => {
    ua('Mozilla/5.0 (Linux; Android 11; RMX2185) AppleWebKit/537.36 Chrome/120 Mobile');
    expect(micAskYesWords()).toBe('while-using');
    ua('Mozilla/5.0 (Linux; Android 14; SM-A145F; wv) AppleWebKit/537.36 Chrome/131 Mobile');
    expect(micAskYesWords()).toBe('while-using');
  });

  it('Android 10 and older keep "Allow"', () => {
    ua('Mozilla/5.0 (Linux; Android 10; Redmi 8) AppleWebKit/537.36 Chrome/96 Mobile');
    expect(micAskYesWords()).toBe('allow');
    ua('Mozilla/5.0 (Linux; Android 8.1.0; vivo 1820) AppleWebKit/537.36 Chrome/90 Mobile');
    expect(micAskYesWords()).toBe('allow');
  });

  it('an Android phone whose version cannot be read is taken as a new one', () => {
    ua('Mozilla/5.0 (Linux; Android; K) AppleWebKit/537.36 Chrome/120 Mobile');
    expect(micAskYesWords()).toBe('while-using');
    ua('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36');
    shell().__DK_NATIVE_PLATFORM__ = 'android';
    expect(micAskYesWords()).toBe('while-using');
  });

  it('an iPhone or a computer keeps "Allow"', () => {
    ua('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15');
    expect(micAskYesWords()).toBe('allow');
    ua('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131');
    expect(micAskYesWords()).toBe('allow');
  });
});
