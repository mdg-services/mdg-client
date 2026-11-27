import type { LangMessage } from '../i18n';

import type { AreaHl } from './_types';

/**
 * The shell's words (spec sections 2 and 8): the bar at the bottom, its badges, and the "My pump"
 * door that every screen carries. Tab words are from spec section 7.
 */
export const shellMessages = {
  'shell.tab.label': { en: 'App sections', hi: 'ऐप के हिस्से' },
  'shell.tab.today': { en: 'Today', hi: 'आज' },
  'shell.tab.services': { en: 'Services', hi: 'सेवाएँ' },
  'shell.tab.reports': { en: 'Reports', hi: 'रिपोर्ट' },
  'shell.tab.kavach': { en: 'Kavach', hi: 'कवच' },
  'shell.tab.chat': { en: 'Chat', hi: 'चैट' },

  // What each badge counts, spoken: "2 for you, 1 to look at".
  'shell.badge.need': { en: '{n} for you', hi: 'आपके लिए {n}' },
  'shell.badge.look': { en: '{n} to look at', hi: 'देखने के लिए {n}' },
  'shell.badge.unread': { en: '{n} unread', hi: '{n} बिना पढ़े' },
  'shell.badge.todo': { en: '{n} to do', hi: '{n} काम बाकी' },

  'shell.door.pump': { en: 'My pump', hi: 'मेरा पंप' },
  'shell.door.pumpWith': { en: 'My pump, {code}', hi: 'मेरा पंप, {code}' },
} satisfies Record<string, LangMessage>;

export const shellHl: AreaHl<typeof shellMessages> = {
  'shell.tab.label': 'App ke hisse',
  'shell.tab.today': 'Aaj',
  'shell.tab.services': 'Services',
  'shell.tab.reports': 'Report',
  'shell.tab.kavach': 'Kavach',
  'shell.tab.chat': 'Chat',

  'shell.badge.need': 'Aapke liye {n}',
  'shell.badge.look': 'Dekhne ke liye {n}',
  'shell.badge.unread': '{n} bina padhe',
  'shell.badge.todo': '{n} kaam baaki',

  'shell.door.pump': 'Mera pump',
  'shell.door.pumpWith': 'Mera pump, {code}',
};
