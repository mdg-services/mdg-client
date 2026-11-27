import type { LangMessage } from '../i18n';

import type { AreaHl } from './_types';

/**
 * The `reports` area's words (spec sections 4.2, 7 and 8): the Reports pill of the Services door, its
 * "Last 30 days" card, the filter chips, the list by business day and its rows. Keys start with `rep.`.
 * Plural keys are written as `<key>.one` and `<key>.many` (see `_plural.ts`).
 *
 * Words for a status (Needs a look, All fine, ...) are the `STATUS_STYLE` words, the generic words
 * ("Try again", "See all", "Back to ...") are the kit's, and the names of the report kinds and of the
 * filter groups are the `kindStyle.ts` data. A gap in the record is always worded as a fact ("No sales
 * report for Tue 18 Nov"), never "you missed": the gap can be MDG's or the portal's.
 */
export const reportsMessages = {
  // The pill group under the Services header.

  // "Last 30 days" card.
  'rep.month.title': { en: 'Last 30 days', hi: 'पिछले 30 दिन' },
  'rep.month.came.one': { en: '1 report came', hi: '1 रिपोर्ट आई' },
  'rep.month.came.many': { en: '{n} reports came', hi: '{n} रिपोर्ट आईं' },
  'rep.month.look.none': { en: 'None of them needed a look', hi: 'किसी में ध्यान देने की बात नहीं थी' },
  'rep.month.look.one': { en: '1 needed a look', hi: 'ध्यान देने की 1 बात थी' },
  'rep.month.look.many': { en: '{n} needed a look', hi: 'ध्यान देने की {n} बातें थीं' },
  'rep.month.showLook.one': { en: 'See the 1 that needs a look', hi: 'ध्यान वाली 1 रिपोर्ट देखें' },
  'rep.month.showLook.many': { en: 'See the {n} that need a look', hi: 'ध्यान वाली {n} रिपोर्ट देखें' },
  'rep.month.salesStrip': {
    en: 'Daily sales report, {from} to {to}',
    hi: 'रोज़ की बिक्री रिपोर्ट, {from} से {to} तक',
  },
  'rep.month.salesSubject': { en: 'sales report', hi: 'बिक्री रिपोर्ट' },
  'rep.month.salesEvery': { en: 'A sales report came every day', hi: 'हर दिन बिक्री रिपोर्ट आई' },
  'rep.month.noSales': { en: 'No sales report for {day}', hi: '{day} की बिक्री रिपोर्ट नहीं आई' },
  'rep.month.noSalesMore.one': {
    en: '1 more day with no sales report',
    hi: '1 और दिन की बिक्री रिपोर्ट नहीं आई',
  },
  'rep.month.noSalesMore.many': {
    en: '{n} more days with no sales report',
    hi: '{n} और दिनों की बिक्री रिपोर्ट नहीं आई',
  },
  'rep.month.water.one': { en: 'Water checks recorded on 1 day', hi: 'पानी की जाँच 1 दिन दर्ज हुई' },
  'rep.month.water.many': { en: 'Water checks recorded on {n} days', hi: 'पानी की जाँच {n} दिन दर्ज हुई' },
  'rep.month.filings.one': { en: '1 paper filed for you', hi: 'आपके लिए 1 कागज़ जमा हुआ' },
  'rep.month.filings.many': { en: '{n} papers filed for you', hi: 'आपके लिए {n} कागज़ जमा हुए' },

  // Filter chips.
  'rep.filter.label': { en: 'Show reports', hi: 'रिपोर्ट चुनें' },
  'rep.filter.needs': { en: 'Needs a look', hi: 'ध्यान दें' },
  'rep.filter.all': { en: 'All', hi: 'सभी' },
  'rep.filter.service': { en: 'Only {service}', hi: 'सिर्फ़ {service}' },
  'rep.filter.serviceClear': { en: 'Show all reports', hi: 'सभी रिपोर्ट दिखाइए' },

  // The list.
  'rep.day.today': { en: 'Today', hi: 'आज' },
  'rep.day.yesterday': { en: 'Yesterday', hi: 'कल' },
  'rep.row.sent': { en: 'Sent {time}', hi: '{time} पर आई' },
  'rep.row.new': { en: 'New', hi: 'नई' },
  'rep.row.corrected': { en: 'Corrected', hi: 'सुधारी गई' },
  'rep.row.picture': { en: 'Picture', hi: 'फोटो' },
  'rep.row.replaced': { en: 'Replaced', hi: 'बदली गई' },
  'rep.replaced.show.one': { en: '1 replaced report', hi: '1 बदली गई रिपोर्ट' },
  'rep.replaced.show.many': { en: '{n} replaced reports', hi: '{n} बदली गई रिपोर्ट' },
  'rep.replaced.hide': { en: 'Hide replaced reports', hi: 'बदली गई रिपोर्ट छिपाइए' },

  // A line under a row that says what changed since the last one.
  'rep.change.lastWeekday': { en: 'last {weekday}', hi: 'पिछले {weekday}' },
  'rep.change.fuelLine': { en: '{fuel}: {change}', hi: '{fuel}: {change}' },
  'rep.change.short': { en: '{litres} short', hi: '{litres} कम' },
  'rep.change.extra': { en: '{litres} extra', hi: '{litres} ज़्यादा' },
  // Stock variation, credit and water checks are said in words (and a shape), never an arrow:
  // "up" reads as good, and a shortage that grew is not.
  'rep.change.variationWorse': {
    en: '{fuel}: {now}, was {before} before. Worse.',
    hi: '{fuel}: {now}, पहले {before} था, और बिगड़ा',
  },
  'rep.change.variationBetter': {
    en: '{fuel}: {now}, was {before} before. Better.',
    hi: '{fuel}: {now}, पहले {before} था, सुधरा',
  },
  'rep.change.creditUp': {
    en: 'Credit limit used {now}%, up from {before}%',
    hi: 'क्रेडिट सीमा का {now}% इस्तेमाल, पहले {before}% था, बढ़ा',
  },
  'rep.change.creditDown': {
    en: 'Credit limit used {now}%, down from {before}%',
    hi: 'क्रेडिट सीमा का {now}% इस्तेमाल, पहले {before}% था, घटा',
  },
  'rep.change.waterFewer': {
    en: '{done} of {total} checks done, {beforeDone} of {beforeTotal} before. Fewer checks.',
    hi: '{total} में से {done} जाँच हुईं, पहले {beforeTotal} में से {beforeDone}, कम जाँच हुईं',
  },
  'rep.change.waterMore': {
    en: '{done} of {total} checks done, {beforeDone} of {beforeTotal} before. More checks.',
    hi: '{total} में से {done} जाँच हुईं, पहले {beforeTotal} में से {beforeDone}, ज़्यादा जाँच हुईं',
  },

  // States.
  'rep.empty.all': { en: 'No reports in the last 30 days', hi: 'पिछले 30 दिन में कोई रिपोर्ट नहीं आई' },
  'rep.empty.group': { en: 'No {group} reports in the last 30 days', hi: '{group} की कोई रिपोर्ट पिछले 30 दिन में नहीं आई' },
  'rep.empty.needs': { en: 'Nothing needs a look right now', hi: 'अभी ध्यान देने की कोई बात नहीं है' },
  'rep.error': { en: 'We could not load your reports.', hi: 'आपकी रिपोर्ट अभी नहीं खुल पाईं।' },
  'rep.error.stale': {
    en: 'We could not refresh. These are the reports from before.',
    hi: 'रिपोर्ट नई नहीं हो पाईं। ये पहले की रिपोर्ट हैं।',
  },
  'rep.offline': {
    en: 'No internet. These are the reports from before.',
    hi: 'इंटरनेट नहीं है। ये पहले की रिपोर्ट हैं।',
  },
  'rep.showEarlier': { en: 'Show earlier reports', hi: 'पुरानी रिपोर्ट दिखाइए' },
  'rep.end': { en: 'Reports older than 30 days are in your chat.', hi: '30 दिन से पुरानी रिपोर्ट आपकी चैट में हैं।' },
  'rep.openChat': { en: 'Open chat', hi: 'चैट खोलें' },
} satisfies Record<string, LangMessage>;

export const reportsHl: AreaHl<typeof reportsMessages> = {

  'rep.month.title': 'Pichhle 30 din',
  'rep.month.came.one': '1 report aayi',
  'rep.month.came.many': '{n} report aayin',
  'rep.month.look.none': 'Kisi mein dhyaan dene ki baat nahi thi',
  'rep.month.look.one': 'Dhyaan dene ki 1 baat thi',
  'rep.month.look.many': 'Dhyaan dene ki {n} baatein thin',
  'rep.month.showLook.one': 'Dhyan wali 1 report dekhein',
  'rep.month.showLook.many': 'Dhyan wali {n} report dekhein',
  'rep.month.salesStrip': 'Roz ki bikri report, {from} se {to} tak',
  'rep.month.salesSubject': 'bikri report',
  'rep.month.salesEvery': 'Har din bikri report aayi',
  'rep.month.noSales': '{day} ki bikri report nahi aayi',
  'rep.month.noSalesMore.one': '1 aur din ki bikri report nahi aayi',
  'rep.month.noSalesMore.many': '{n} aur dinon ki bikri report nahi aayi',
  'rep.month.water.one': 'Paani ki jaanch 1 din darj hui',
  'rep.month.water.many': 'Paani ki jaanch {n} din darj hui',
  'rep.month.filings.one': 'Aapke liye 1 kagaz jama hua',
  'rep.month.filings.many': 'Aapke liye {n} kagaz jama hue',

  'rep.filter.label': 'Report chuniye',
  'rep.filter.needs': 'Dhyan dein',
  'rep.filter.all': 'Sab',
  'rep.filter.service': 'Sirf {service}',
  'rep.filter.serviceClear': 'Sab report dikhaiye',

  'rep.day.today': 'Aaj',
  'rep.day.yesterday': 'Kal',
  'rep.row.sent': '{time} par aayi',
  'rep.row.new': 'Nayi',
  'rep.row.corrected': 'Sudhari gayi',
  'rep.row.picture': 'Photo',
  'rep.row.replaced': 'Badli gayi',
  'rep.replaced.show.one': '1 badli gayi report',
  'rep.replaced.show.many': '{n} badli gayi report',
  'rep.replaced.hide': 'Badli gayi report chhipaiye',

  'rep.change.lastWeekday': 'pichhle {weekday}',
  'rep.change.fuelLine': '{fuel}: {change}',
  'rep.change.short': '{litres} kam',
  'rep.change.extra': '{litres} zyada',
  'rep.change.variationWorse': '{fuel}: {now}, pehle {before} tha, aur bigda',
  'rep.change.variationBetter': '{fuel}: {now}, pehle {before} tha, sudhra',
  'rep.change.creditUp': 'Credit seema ka {now}% istemaal, pehle {before}% tha, badha',
  'rep.change.creditDown': 'Credit seema ka {now}% istemaal, pehle {before}% tha, ghata',
  'rep.change.waterFewer': '{total} mein se {done} jaanch hui, pehle {beforeTotal} mein se {beforeDone}, kam jaanch hui',
  'rep.change.waterMore': '{total} mein se {done} jaanch hui, pehle {beforeTotal} mein se {beforeDone}, zyada jaanch hui',

  'rep.empty.all': 'Pichhle 30 din mein koi report nahi aayi',
  'rep.empty.group': '{group} ki koi report pichhle 30 din mein nahi aayi',
  'rep.empty.needs': 'Abhi dhyaan dene ki koi baat nahi hai',
  'rep.error': 'Aapki report abhi nahi khul payin.',
  'rep.error.stale': 'Report nayi nahi ho payin. Ye pehle ki report hain.',
  'rep.offline': 'Internet nahi hai. Ye pehle ki report hain.',
  'rep.showEarlier': 'Purani report dikhaiye',
  'rep.end': '30 din se purani report aapki chat mein hain.',
  'rep.openChat': 'Chat kholein',
};
