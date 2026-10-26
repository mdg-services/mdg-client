/** The two pages on MDG's website that the app must be able to show. */
export const PRIVACY_URL = 'https://mdgservices.in/privacy';
export const TERMS_URL = 'https://mdgservices.in/terms';

/**
 * Open a website page in the phone's own browser. Inside the app, an https link
 * is handed to Safari or Chrome by the shell, so the dealer is never left in a
 * page with no address bar and no way back; `noopener` keeps it from reaching
 * back into this one.
 */
export function openWebPage(url: string): void {
  window.open(url, '_blank', 'noopener');
}
