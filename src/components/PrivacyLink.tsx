import { useT } from '@/lib/i18n';
import { PRIVACY_URL, openWebPage } from '@/lib/legalLinks';

/**
 * "Privacy policy", as a link. Apple will not take an app whose privacy policy
 * cannot be reached from inside it, and a dealer deciding whether to register
 * is exactly who wants to read it — so it is on the screens that come BEFORE
 * sign-in as well as in Settings.
 *
 * A real anchor (so it reads as a link, and works in any browser) that opens
 * through `openWebPage`, which is the road the app already uses to hand a page
 * to the phone's browser.
 */
export function PrivacyLink({ className }: { className?: string }) {
  const t = useT();
  return (
    <a
      href={PRIVACY_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        e.preventDefault();
        openWebPage(PRIVACY_URL);
      }}
      className={className}
    >
      {t('legal.privacyPolicy')}
    </a>
  );
}
