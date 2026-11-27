import type { LangMessage } from '../i18n';

import type { AreaHl } from './_types';

/**
 * The shared kit's own words (spec sections 5 and 8): "Try again", "See all", "N more", the
 * as-of lines, the delta sentences, the spoken labels of the charts. Written once, here, and used
 * by every page: a page group that needs a new generic word asks for it in this file rather than
 * writing its own. Words for a status (Problem, Needs a look, ...) are not here: they are the
 * `STATUS_STYLE` words of `features/reports/StatusBadge.tsx`.
 *
 * Plural pairs end in `.one` and `.many` (see `_plural.ts`).
 */
export const kitMessages = {
  'kit.retry': { en: 'Try again', hi: 'फिर कोशिश करें' },
  'kit.seeAll': { en: 'See all', hi: 'सब देखें' },
  'kit.more.one': { en: '1 more', hi: '1 और' },
  'kit.more.many': { en: '{n} more', hi: '{n} और' },
  'kit.backTo': { en: 'Back to {place}', hi: '{place} पर वापस' },
  'kit.close': { en: 'Close', hi: 'बंद करें' },
  'kit.status.stopped': { en: 'Stopped', hi: 'ठप है' },
  'kit.unit.litres': { en: 'L', hi: 'लीटर' },

  'kit.asOf.at': { en: 'as of {time}', hi: '{time} तक की जानकारी' },
  'kit.asOf.checked': { en: 'Checked {time}', hi: '{time} पर जाँचा' },
  'kit.asOf.fromDay': { en: 'from {day}', hi: '{day} की' },
  'kit.day.today': { en: 'today', hi: 'आज' },
  'kit.day.yesterday': { en: 'yesterday', hi: 'कल' },

  'kit.delta.up': { en: '{amount} more than {against}', hi: '{against} से {amount} ज़्यादा' },
  'kit.delta.down': { en: '{amount} less than {against}', hi: '{against} से {amount} कम' },
  'kit.delta.same': { en: 'Same as {against}', hi: '{against} जितना ही' },
  'kit.delta.upNoNumber': { en: 'More than {against}', hi: '{against} से ज़्यादा' },
  'kit.delta.downNoNumber': { en: 'Less than {against}', hi: '{against} से कम' },

  'kit.bars.none': { en: 'none', hi: 'कोई नहीं' },
  'kit.bars.average': { en: 'average', hi: 'औसत' },
  'kit.bars.tableDay': { en: 'Day', hi: 'दिन' },
  'kit.bars.tableValue': { en: 'Amount', hi: 'मात्रा' },

  'kit.band.range': { en: 'Allowed {low} to {high}', hi: 'सीमा {low} से {high} तक' },
  'kit.pill.withCount': { en: '{label}, {n}', hi: '{label}, {n}' },

  'kit.dayStrip.label': { en: 'Last days', hi: 'पिछले दिन' },
  'kit.dayStrip.subject': { en: 'report', hi: 'रिपोर्ट' },
  'kit.dayStrip.came': { en: '{subject} for {date}', hi: '{date} की {subject}' },
  'kit.dayStrip.none': { en: 'No {subject} for {date}', hi: '{date} की {subject} नहीं आई' },
  'kit.dayStrip.look': {
    en: '{subject} for {date} needs a look',
    hi: '{date} की {subject} पर ध्यान दें',
  },

  'kit.notices.title': { en: 'Notices', hi: 'सूचनाएँ' },
  'kit.notices.one': { en: '1 notice', hi: '1 सूचना' },
  'kit.notices.many': { en: '{n} notices', hi: '{n} सूचनाएँ' },

  'kit.help.watch': { en: 'Watch a short video', hi: 'छोटा वीडियो देखें' },
  'kit.ask.mdg': { en: 'Ask MDG', hi: 'MDG से पूछें' },
} satisfies Record<string, LangMessage>;

export const kitHl: AreaHl<typeof kitMessages> = {
  'kit.retry': 'Phir koshish karein',
  'kit.seeAll': 'Sab dekhein',
  'kit.more.one': '1 aur',
  'kit.more.many': '{n} aur',
  'kit.backTo': '{place} par wapas',
  'kit.close': 'Band karein',
  'kit.status.stopped': 'Thap hai',
  'kit.unit.litres': 'L',

  'kit.asOf.at': '{time} tak ki jaankari',
  'kit.asOf.checked': '{time} par jaancha',
  'kit.asOf.fromDay': '{day} ki',
  'kit.day.today': 'Aaj',
  'kit.day.yesterday': 'Kal',

  'kit.delta.up': '{against} se {amount} zyada',
  'kit.delta.down': '{against} se {amount} kam',
  'kit.delta.same': '{against} jitna hi',
  'kit.delta.upNoNumber': '{against} se zyada',
  'kit.delta.downNoNumber': '{against} se kam',

  'kit.bars.none': 'koi nahi',
  'kit.bars.average': 'ausat',
  'kit.bars.tableDay': 'Din',
  'kit.bars.tableValue': 'Matra',

  'kit.band.range': 'Seema {low} se {high} tak',
  'kit.pill.withCount': '{label}, {n}',

  'kit.dayStrip.label': 'Pichhle din',
  'kit.dayStrip.subject': 'report',
  'kit.dayStrip.came': '{date} ki {subject}',
  'kit.dayStrip.none': '{date} ki {subject} nahi aayi',
  'kit.dayStrip.look': '{date} ki {subject} par dhyaan dein',

  'kit.notices.title': 'Soochnayein',
  'kit.notices.one': '1 soochna',
  'kit.notices.many': '{n} soochnayein',

  'kit.help.watch': 'Chhota video dekhein',
  'kit.ask.mdg': 'MDG se poochhein',
};
