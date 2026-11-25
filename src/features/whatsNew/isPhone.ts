import { isEmbedded } from '@/lib/embedMode';
import { detectPlatform } from '@/lib/nativeBridge';

/**
 * Is this the phone app: the Android or iPhone shell, or a phone-sized touch browser (a coarse
 * pointer on a narrow screen). A desktop browser and the Chrome extension's side panel are
 * never it.
 */
export function isPhoneApp(): boolean {
  if (isEmbedded()) return false;
  const platform = detectPlatform();
  if (platform === 'android' || platform === 'ios') return true;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(pointer: coarse)').matches && window.matchMedia('(max-width: 767px)').matches;
}
