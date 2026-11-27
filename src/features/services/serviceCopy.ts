import { messages, pick, translate, type MessageKey } from '@/lib/i18n';
import type { Lang } from '@/store/lang';
import { serviceLabel } from '@dk/shared';

import { KAVACH_ROW } from './serviceMap';

/**
 * The words a service wears, in one place. A service's name is shared data in two languages
 * (`serviceLabel`), read through `pick` so Hinglish reads the English name; its one sentence of what
 * it does is `serviceAbout.<id>` in `lib/messages/services.ts` (the shared `SERVICE_ABOUT` has no
 * Hinglish). Neither ever returns a raw service id: an id this build has no name for gives "".
 */

/**
 * Names the dealer reads wrongly in the shared list, said the way a pump owner says them. The shared
 * Hindi for fuel orders is "लोड ऑर्डर", a phrase of the depot's; the owner says "तेल का ऑर्डर", and every
 * other screen of the app (chat, Today) already does. English and Hinglish keep the shared name.
 */
const HI_NAME: Readonly<Record<string, string>> = { 'fuel-indent': 'तेल का ऑर्डर' };

/** The service's name in the reader's language; Kavach's row has its own word. "" for an id with no label. */
export function serviceNameOf(serviceId: string, lang: Lang): string {
  if (serviceId === KAVACH_ROW) return translate(lang, 'svc.kavach.name');
  if (lang === 'hi' && HI_NAME[serviceId]) return HI_NAME[serviceId]!;
  const label = serviceLabel(serviceId);
  // `serviceLabel` degrades an unknown id to the id itself: that is never shown to a dealer.
  if (label.en === serviceId && label.hi === serviceId) return '';
  return pick(lang, label.en, label.hi);
}

/** What the service does, as one plain sentence; "" when there is none. */
export function serviceAboutOf(serviceId: string, lang: Lang): string {
  const key = `serviceAbout.${serviceId}`;
  return key in messages ? translate(lang, key as MessageKey) : '';
}

/**
 * The ONE plain line under "What MDG needs from you" (spec 4.3.7): what is asked of the dealer, in this
 * service's own words when it has them (`svc.need.<id>`), else the one true line of its template. The
 * generic line that said "MDG makes this for you every day" on every page is gone: it said nothing a
 * dealer could act on. Only asks the app already knows (a photo, a login, a yes in the chat) are
 * written; no line promises more than MDG does.
 */
export function needFromYouKeys(serviceId: string, template: 'A' | 'B' | 'C'): MessageKey[] {
  const own = `svc.need.${serviceId}`;
  return [(own in messages ? own : `svc.need.${template}.2`) as MessageKey];
}
