import type { LangMessage } from '../i18n';

import type { AreaHl } from './_types';

/**
 * The `today` area's NEW words (spec sections 7 and 8): the redrawn first screen. Keys start with
 * `today.`. The old keys the screen still reads (`today.greeting`, `today.act.*`, `today.photo.*`,
 * `today.late`, `today.empty.*`) stay in the old catalog and are reused as they are; nothing here
 * repeats one of them. The shared sentences (the verdict, the counts' numbers, the tiles' lines, the
 * Pump now rows) are `glance.*`; the generic words (try again, N more, as of) are `kit.*`.
 *
 * Plural pairs end in `.one` and `.many` (see `_plural.ts`). The Hindi sentences are drafts for a
 * native reader to review before release (spec 11.4). Hindi uses no English words except the brand
 * names; Hinglish is Hindi in English letters.
 */
export const todayMessages = {
  // ── the bar ──────────────────────────────────────────────────────────────
  'today.page.subline': { en: '{date}, checked {time}', hi: '{date}, {time} पर जाँचा' },
  'today.page.checkedOffline': {
    en: 'Checked {time}, offline',
    hi: '{time} पर जाँचा, इंटरनेट बंद',
  },

  // ── the three counts under the verdict (the number is drawn in front of the words) ──
  'today.count.needYou': { en: 'need you', hi: 'आपके लिए' },
  'today.count.look': { en: 'need a look', hi: 'देखने के लिए' },
  'today.count.done': { en: 'done for you today', hi: 'आपके लिए आज हुए' },

  // ── Needs you ────────────────────────────────────────────────────────────
  'today.row.status.needsYou': { en: 'Waiting for you', hi: 'आपका इंतज़ार' },
  'today.row.kavach.open': { en: 'Open Kavach', hi: 'कवच खोलें' },
  'today.row.clear': { en: 'Nothing needs you right now', hi: 'अभी आपको कुछ नहीं करना है' },

  // ── the four numbers ─────────────────────────────────────────────────────
  'today.tile.sales': { en: 'Sales', hi: 'बिक्री' },
  'today.tile.variation': { en: 'Variation', hi: 'वेरिएशन' },
  'today.tile.water': { en: 'Water checks', hi: 'पानी की जाँच' },
  'today.tile.papers': { en: 'Papers', hi: 'कागज़ात' },
  'today.tile.waterOf': { en: 'of {total} done', hi: 'जाँच हुईं, कुल {total}' },
  'today.tile.salesDay': { en: 'Sold {day}', hi: '{day} की बिक्री' },
  'today.tile.lastWeekday': { en: 'last {weekday}', hi: 'पिछले {weekday}' },
  'today.tile.varInside': { en: 'Inside the limit', hi: 'सीमा के अंदर' },
  'today.tile.varBeyond': { en: '{litres} beyond the limit', hi: '{litres} सीमा से बाहर' },
  'today.tile.depositBy': { en: 'by {day}', hi: '{day} तक' },
  'today.tile.papersDays': { en: 'days left', hi: 'दिन बाकी' },
  'today.tile.papersExpired': { en: 'Expired', hi: 'मियाद खत्म' },
  'today.tile.asOfToday': { en: 'today {time}', hi: 'आज {time}' },
  // A whole phrase, never "कल की" alone: the day word comes from `fmtDay` ("कल", "गुरु 26 नव").
  'today.tile.asOfDay': { en: 'from {day}', hi: '{day} की जानकारी' },
  // The inspection score tile's line: what is to do TODAY (never the whole open total), then what was sent back and what is late.
  'today.tile.scoreTodo': { en: '{n} to do today', hi: 'आज के {n} काम बाकी' },
  // Only when the Kavach list is missing and the server's total is all there is: said as a total, never as "today".
  'today.tile.scoreOpen': { en: '{n} points open', hi: '{n} पॉइंट बाकी' },
  'today.tile.scoreBack': { en: '{n} sent back', hi: '{n} वापस आए' },
  'today.tile.scoreLate': { en: '{n} late', hi: '{n} देर से' },
  'today.tile.scoreNone': { en: 'Nothing to do today', hi: 'आज कोई काम बाकी नहीं' },
  'today.tile.barsSummary': {
    en: 'Last {n} days, highest {litres} on {day}',
    hi: 'पिछले {n} दिन, सबसे ज़्यादा {day} को {litres}',
  },
  'today.tile.limitBar': { en: '{pct}% of the limit used', hi: 'सीमा का {pct}% इस्तेमाल हुआ' },

  // ── the verdict card's sentence and the stock-variation line ─────────────
  'today.verdict.and': { en: 'and', hi: 'और' },
  'today.var.beyondShort': {
    en: '{fuel} is {off} beyond the limit ({n} short)',
    hi: '{fuel} सीमा से {off} बाहर है ({n} कम)',
  },
  'today.var.beyondOver': {
    en: '{fuel} is {off} beyond the limit ({n} over)',
    hi: '{fuel} सीमा से {off} बाहर है ({n} ज़्यादा)',
  },

  // ── how long a task has waited, in its own pill ──────────────────────────
  'today.lateDays.one': { en: 'Waiting 1 day', hi: '1 दिन से बाकी' },
  'today.lateDays.many': { en: 'Waiting {n} days', hi: '{n} दिन से बाकी' },

  // ── the notices row: MDG's bill, days only ───────────────────────────────
  // Days only (no amount, no way to pay: ADR 0022). Read from the bills list, so a bill of a live pump shows too.
  'today.notice.billIn': { en: 'Bill due in {n} days', hi: 'बिल की आख़िरी तारीख़ {n} दिन में' },
  'today.notice.billTomorrow': { en: 'Bill due tomorrow', hi: 'बिल की आख़िरी तारीख़ कल' },
  'today.notice.billToday': { en: 'Bill due today', hi: 'बिल की आख़िरी तारीख़ आज' },
  'today.notice.billLate': { en: 'Bill: due date {date} has passed', hi: 'बिल की तारीख़ {date} निकल गई' },

  // ── the cards ────────────────────────────────────────────────────────────
  'today.card.planOrder': { en: 'Plan the order', hi: 'ऑर्डर तैयार करें' },
  'today.card.askStock': { en: 'Ask for a stock check', hi: 'स्टॉक की जाँच माँगें' },
  'today.card.askStockDraft': {
    en: 'Please check my stock and tell me how many days it will last',
    hi: 'कृपया मेरा स्टॉक देखकर बताइए कि कितने दिन चलेगा',
  },
  'today.card.newReports': { en: 'New reports', hi: 'नई रिपोर्ट' },
  'today.card.reportRow': { en: '{name}, {day}', hi: '{name}, {day}' },
  'today.card.seeServices': { en: 'See all services', hi: 'सभी सेवाएँ देखें' },
} satisfies Record<string, LangMessage>;

export const todayHl: AreaHl<typeof todayMessages> = {
  'today.page.subline': '{date}, {time} par jaancha',
  'today.page.checkedOffline': '{time} par jaancha, internet band',

  'today.count.needYou': 'aapke liye',
  'today.count.look': 'dekhne ke liye',
  'today.count.done': 'aapke liye aaj hue',

  'today.row.status.needsYou': 'Aapka intezaar',
  'today.row.kavach.open': 'Kavach kholein',
  'today.row.clear': 'Abhi aapko kuch nahi karna hai',

  'today.tile.sales': 'Bikri',
  'today.tile.variation': 'Variation',
  'today.tile.water': 'Paani ki jaanch',
  'today.tile.papers': 'Kaagzaat',
  'today.tile.waterOf': 'jaanch hui, kul {total}',
  'today.tile.salesDay': '{day} ki bikri',
  'today.tile.lastWeekday': 'pichhle {weekday}',
  'today.tile.varInside': 'Seema ke andar',
  'today.tile.varBeyond': '{litres} seema se bahar',
  'today.tile.depositBy': '{day} tak',
  'today.tile.papersDays': 'din baaki',
  'today.tile.papersExpired': 'Miyaad khatam',
  'today.tile.asOfToday': 'Aaj {time}',
  'today.tile.asOfDay': '{day} ki jaankari',
  'today.tile.scoreTodo': 'Aaj ke {n} kaam baaki',
  'today.tile.scoreOpen': '{n} point baaki',
  'today.tile.scoreBack': '{n} wapas aaye',
  'today.tile.scoreLate': '{n} der se',
  'today.tile.scoreNone': 'Aaj koi kaam baaki nahi',
  'today.tile.barsSummary': 'Pichhle {n} din, sabse zyada {day} ko {litres}',
  'today.tile.limitBar': 'Seema ka {pct}% istemaal hua',

  'today.verdict.and': 'aur',
  'today.var.beyondShort': '{fuel} seema se {off} bahar hai ({n} kam)',
  'today.var.beyondOver': '{fuel} seema se {off} bahar hai ({n} zyada)',

  'today.lateDays.one': '1 din se baaki',
  'today.lateDays.many': '{n} din se baaki',

  'today.notice.billIn': 'Bill ki aakhri tareekh {n} din mein',
  'today.notice.billTomorrow': 'Bill ki aakhri tareekh kal',
  'today.notice.billToday': 'Bill ki aakhri tareekh aaj',
  'today.notice.billLate': 'Bill ki tareekh {date} nikal gayi',

  'today.card.planOrder': 'Order taiyaar karein',
  'today.card.askStock': 'Stock ki jaanch maangein',
  'today.card.askStockDraft': 'Kripya mera stock dekhkar bataiye ki kitne din chalega',
  'today.card.newReports': 'Nayi report',
  'today.card.reportRow': '{name}, {day}',
  'today.card.seeServices': 'Sabhi services dekhein',
};
