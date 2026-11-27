import { KAVACH_ROW, isHiddenService } from '@/features/services/serviceMap';
import { translate } from '@/lib/i18n';
import type { Lang } from '@/store/lang';
import { serviceLabel } from '@dk/shared';

/**
 * Names the shared labels leave half in English ("DOD", "DU OTP" in Latin letters in a Hindi line), in the
 * words the Services door uses. Hinglish gets its own (the shared labels have no third column).
 */
const NAME_OVERRIDES: Record<string, { hi: string; hl: string }> = {
  'credit-dod-monitoring': { hi: 'उधार और जमा की तारीख', hl: 'Udhaar aur jama ki tareekh' },
  'du-otp-acknowledgement': { hi: 'डीयू ओटीपी की पावती', hl: 'DU OTP ki paavti' },
};

/**
 * A service's name for a row's small print ("Daily sales report"), in the reader's language. Null for a
 * row that belongs to no service, and for an id this build does not know or hides: a dealer never reads
 * a raw service id. Hinglish reads the English name (the shared labels have no third column).
 */
export function serviceNameOf(serviceId: string | null | undefined, lang: Lang): string | null {
  if (!serviceId) return null;
  if (serviceId === KAVACH_ROW) return translate(lang, 'shell.tab.kavach');
  if (isHiddenService(serviceId)) return null;
  const own = NAME_OVERRIDES[serviceId];
  if (own && lang !== 'en') return own[lang];
  const label = serviceLabel(serviceId);
  return lang === 'hi' ? label.hi : label.en;
}
