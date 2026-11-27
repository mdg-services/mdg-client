import type { LangMessage } from '../i18n';

import type { AreaHl } from './_types';

/**
 * The `staff` area's words (spec section 8): the Warriors and points page and a warrior's own page.
 * Keys start with `warr.`. Plural keys come in pairs, `<key>.one` and `<key>.many` (see `_plural.ts`).
 *
 * The sentences of the older `staff.*` catalog (the give-points sheet, the final-submit sheet, the
 * edit dialog) stay where they are and are read from there; only new sentences are written here.
 * Hindi is what a pump owner says, with his own word "पॉइंट" and "योद्धा"; Hinglish is the same in
 * English letters. Every Hindi sentence is a draft for a native reader (spec 11.4).
 */
export const staffMessages = {
  // the switch
  'warr.window.label': { en: 'Show points for', hi: 'किस समय के पॉइंट देखें' },
  'warr.window.last': { en: 'Last month', hi: 'पिछला महीना' },

  // the team strip
  'warr.team.label': { en: 'This month, whole team', hi: 'इस महीने, पूरी टीम' },
  'warr.team.against': { en: 'the same days last month', hi: 'पिछले महीने के इन्हीं दिनों' },
  'warr.team.earned': {
    en: '{n} of {m} warriors earned points',
    hi: '{m} योद्धाओं में से {n} ने पॉइंट कमाए',
  },
  'warr.team.aria': {
    en: 'This month the team has {points} points. {earned}',
    hi: 'इस महीने टीम के {points} पॉइंट हैं। {earned}',
  },

  // waiting to send
  'warr.waiting.title': { en: 'Waiting to send', hi: 'भेजना बाकी है' },
  'warr.waiting.one': {
    en: '1 warrior, {points} points not sent yet',
    hi: '1 योद्धा के {points} पॉइंट अभी भेजे नहीं गए',
  },
  'warr.waiting.many': {
    en: '{n} warriors, {points} points not sent yet',
    hi: '{n} योद्धाओं के {points} पॉइंट अभी भेजे नहीं गए',
  },
  'warr.waiting.changed': { en: 'Last change {when}', hi: 'आखिरी बदलाव {when}' },
  'warr.waiting.see': { en: 'See the list', hi: 'सूची देखें' },
  'warr.waiting.hide': { en: 'Hide the list', hi: 'सूची छिपाएँ' },
  'warr.send.cta': { en: "Send today's sheet", hi: 'आज की शीट भेजें' },

  // lines of the waiting list: spoken names for the small buttons
  'warr.line.more': { en: 'One more of {work} for {name}', hi: '{name} के लिए {work}, एक और' },
  'warr.line.less': { en: 'One less of {work} for {name}', hi: '{name} के लिए {work}, एक कम' },
  'warr.line.remove': { en: 'Remove {work} for {name}', hi: '{name} का {work} हटाएँ' },
  'warr.give.more': { en: 'One more: {work}', hi: '{work}, एक और' },
  'warr.give.less': { en: 'One less: {work}', hi: '{work}, एक कम' },
  'warr.photo.remove': { en: 'Remove this photo', hi: 'यह फोटो हटाएँ' },

  // an empty Today
  'warr.empty.today': { en: 'No points sent today.', hi: 'आज अभी कोई पॉइंट नहीं भेजे गए।' },
  'warr.empty.todayWaiting': {
    en: 'No points sent today. Waiting to send: {points}',
    hi: 'आज अभी कोई पॉइंट नहीं भेजे गए। भेजना बाकी: {points}',
  },

  // a warrior's row
  'warr.row.share': { en: '{pct}% of the team', hi: 'टीम का {pct}%' },
  'warr.row.shareAria': {
    en: '{name} has {pct}% of the team points',
    hi: '{name} के पास टीम के {pct}% पॉइंट हैं',
  },
  'warr.row.behind': {
    en: 'Behind: {pct}% of the team average per working day',
    hi: 'पीछे: हर कामकाजी दिन टीम के औसत का सिर्फ़ {pct}%',
  },
  'warr.row.tied': { en: 'Tied at number {rank}', hi: 'बराबर, स्थान {rank}' },
  'warr.row.call': { en: 'Call', hi: 'फ़ोन करें' },
  'warr.row.callName': { en: 'Call {name}', hi: '{name} को फ़ोन करें' },
  'warr.row.copy': { en: 'Copy number', hi: 'नंबर कॉपी करें' },
  'warr.row.copyName': { en: 'Copy the number of {name}', hi: '{name} का नंबर कॉपी करें' },
  'warr.row.leaveName': { en: 'Mark {name} on leave today', hi: '{name} को आज छुट्टी पर करें' },
  'warr.row.clearLeaveName': {
    en: "Remove today's leave for {name}",
    hi: '{name} की आज की छुट्टी हटाएँ',
  },

  // a warrior's role, said in the reader's language (the owner types it in one)
  'warr.role.attendant': { en: 'Attendant', hi: 'अटेंडेंट' },
  'warr.role.manager': { en: 'Manager', hi: 'मैनेजर' },
  'warr.role.supervisor': { en: 'Supervisor', hi: 'सुपरवाइज़र' },
  'warr.role.cashier': { en: 'Cashier', hi: 'कैशियर' },
  'warr.role.operator': { en: 'Operator', hi: 'ऑपरेटर' },
  'warr.role.helper': { en: 'Helper', hi: 'हेल्पर' },
  'warr.role.cleaner': { en: 'Cleaner', hi: 'सफ़ाई कर्मचारी' },
  'warr.role.driver': { en: 'Driver', hi: 'ड्राइवर' },
  'warr.role.accountant': { en: 'Accountant', hi: 'अकाउंटेंट' },

  // sheets sent
  'warr.sheets.title': { en: 'Sheets sent', hi: 'भेजी गई शीट' },
  'warr.sheets.subject': { en: 'sheet', hi: 'शीट' },
  'warr.sheets.none': { en: 'No sheet sent', hi: 'कोई शीट नहीं भेजी' },
  'warr.sheets.empty': { en: 'No sheet has been sent yet.', hi: 'अभी तक कोई शीट नहीं भेजी गई।' },
  'warr.sheets.summary.one': { en: '1 warrior, {points} points', hi: '1 योद्धा, {points} पॉइंट' },
  'warr.sheets.summary.many': {
    en: '{n} warriors, {points} points',
    hi: '{n} योद्धा, {points} पॉइंट',
  },
  'warr.sheets.entries.one': { en: '1 entry', hi: '1 एंट्री' },
  'warr.sheets.entries.many': { en: '{n} entries', hi: '{n} एंट्री' },
  'warr.sheets.by': { en: 'Sent by {name}', hi: '{name} ने भेजा' },
  'warr.sheets.photo': { en: 'See the paper photo', hi: 'कागज़ की फोटो देखें' },
  'warr.sheets.photoName': {
    en: 'See the paper photo of {day}',
    hi: '{day} के कागज़ की फोटो देखें',
  },
  'warr.sheets.older': { en: 'Show older sheets', hi: 'पुरानी शीट देखें' },
  'warr.sheets.fewer': { en: 'Show fewer', hi: 'कम दिखाएँ' },
  'warr.gaps.some': { en: 'No sheet was sent on {days}.', hi: '{days} को कोई शीट नहीं भेजी गई।' },
  'warr.gaps.lots': {
    en: 'No sheet was sent on {n} of the last {m} days.',
    hi: 'पिछले {m} दिनों में से {n} दिन कोई शीट नहीं भेजी गई।',
  },

  // the footer
  'warr.how.link': { en: 'How points are worked out', hi: 'पॉइंट कैसे तय होते हैं' },
  'warr.how.body': {
    en: "Every job on your list has points, worked out from its time, skill, effort and responsibility. Points count only after you send the day's sheet with the photo of the paper.",
    hi: 'आपकी सूची के हर काम के पॉइंट उसके समय, हुनर, मेहनत और ज़िम्मेदारी से तय होते हैं। पॉइंट तभी गिने जाते हैं जब आप कागज़ की फोटो के साथ उस दिन की शीट भेज देते हैं।',
  },

  // a warrior's own page
  'warr.person.notFound': { en: 'We could not find this warrior.', hi: 'यह योद्धा नहीं मिला।' },
  'warr.person.all': { en: 'See all warriors', hi: 'सब योद्धा देखें' },
  'warr.person.edit': { en: 'Edit', hi: 'बदलें' },
  'warr.person.editName': { en: 'Edit {name}', hi: '{name} की जानकारी बदलें' },
  'warr.person.phone': { en: 'Phone', hi: 'फ़ोन' },
  'warr.person.leaveHelp': {
    en: 'Off today? Mark leave. This day is then not counted as a working day.',
    hi: 'आज छुट्टी है? छुट्टी लगाएँ। यह दिन कामकाजी दिनों में नहीं गिना जाएगा।',
  },
  'warr.person.leaveOnHelp': {
    en: 'On leave today. This day is not counted as a working day.',
    hi: 'आज छुट्टी पर हैं। यह दिन कामकाजी दिनों में नहीं गिना जा रहा।',
  },
  'warr.person.topShare': {
    en: '{pct}% of the month',
    hi: 'महीने के पॉइंट का {pct}%',
  },
  'warr.person.month': { en: 'Points this month', hi: 'इस महीने के पॉइंट' },
  'warr.person.avg': { en: 'Per working day', hi: 'हर कामकाजी दिन' },
  'warr.person.leave': { en: 'Leave this month', hi: 'इस महीने की छुट्टी' },
  'warr.person.days': { en: 'days', hi: 'दिन' },
  'warr.person.bars': { en: 'Points each day, last 14 days', hi: 'पिछले 14 दिन, हर दिन के पॉइंट' },
  'warr.person.barsSummary': {
    en: 'Last 14 days, {total} points. Best day {best} points on {day}.',
    hi: 'पिछले 14 दिन, {total} पॉइंट। सबसे अच्छा दिन {day}, {best} पॉइंट।',
  },
  'warr.person.barsNone': { en: 'Last 14 days, no points.', hi: 'पिछले 14 दिन, कोई पॉइंट नहीं।' },
  'warr.person.top': { en: 'Top jobs this month', hi: 'इस महीने के मुख्य काम' },
  'warr.person.times.one': { en: '1 time', hi: '1 बार' },
  'warr.person.times.many': { en: '{n} times', hi: '{n} बार' },
  'warr.person.recent': { en: 'Latest entries', hi: 'हाल की एंट्री' },
  'warr.person.noEntries': { en: 'No points this month yet.', hi: 'इस महीने अभी कोई पॉइंट नहीं।' },
  'warr.person.capped': {
    en: 'Only the newest 1,000 entries are shown, so these figures may be short.',
    hi: 'सिर्फ़ सबसे नई 1,000 एंट्री दिख रही हैं, इसलिए ये आँकड़े कम हो सकते हैं।',
  },
  'warr.person.removedNote': {
    en: 'This warrior was removed. Old points stay on record.',
    hi: 'इस योद्धा को हटा दिया गया है। पुराने पॉइंट रिकॉर्ड में रहते हैं।',
  },
  'warr.person.qty': { en: 'Quantity {n}', hi: 'मात्रा {n}' },
  'warr.person.amount': { en: 'Amount Rs {n}', hi: '{n} रुपये की रकम' },
  'warr.person.split': { en: 'shared by {n}', hi: '{n} ने मिलकर किया' },
  'warr.person.entryPoints': { en: '{points} points', hi: '{points} पॉइंट' },
} satisfies Record<string, LangMessage>;

export const staffHl: AreaHl<typeof staffMessages> = {
  'warr.window.label': 'Kis samay ke points dekhein',
  'warr.window.last': 'Pichhla mahina',

  'warr.team.label': 'Is mahine, poori team',
  'warr.team.against': 'pichhle mahine ke inhin dinon',
  'warr.team.earned': '{m} warriors mein se {n} ne points kamaye',
  'warr.team.aria': 'Is mahine team ke {points} points hain. {earned}',

  'warr.waiting.title': 'Bhejna baaki hai',
  'warr.waiting.one': '1 warrior ke {points} points abhi bheje nahi gaye',
  'warr.waiting.many': '{n} warriors ke {points} points abhi bheje nahi gaye',
  'warr.waiting.changed': 'Aakhri badlav {when}',
  'warr.waiting.see': 'List dekhein',
  'warr.waiting.hide': 'List chhipayein',
  'warr.send.cta': 'Aaj ki sheet bhejein',

  'warr.line.more': '{name} ke liye {work}, ek aur',
  'warr.line.less': '{name} ke liye {work}, ek kam',
  'warr.line.remove': '{name} ka {work} hatayein',
  'warr.give.more': '{work}, ek aur',
  'warr.give.less': '{work}, ek kam',
  'warr.photo.remove': 'Yeh photo hatayein',

  'warr.empty.today': 'Aaj abhi koi points nahi bheje gaye.',
  'warr.empty.todayWaiting': 'Aaj abhi koi points nahi bheje gaye. Bhejna baaki: {points}',

  'warr.row.share': 'Team ka {pct}%',
  'warr.row.shareAria': '{name} ke paas team ke {pct}% points hain',
  'warr.row.behind': 'Peeche: har kaam ke din team ke average ka sirf {pct}%',
  'warr.row.tied': 'Barabar, sthaan {rank}',
  'warr.row.call': 'Phone karein',
  'warr.row.callName': '{name} ko phone karein',
  'warr.row.copy': 'Number copy karein',
  'warr.row.copyName': '{name} ka number copy karein',
  'warr.row.leaveName': '{name} ko aaj chhutti par karein',
  'warr.row.clearLeaveName': '{name} ki aaj ki chhutti hatayein',

  'warr.role.attendant': 'Attendant',
  'warr.role.manager': 'Manager',
  'warr.role.supervisor': 'Supervisor',
  'warr.role.cashier': 'Cashier',
  'warr.role.operator': 'Operator',
  'warr.role.helper': 'Helper',
  'warr.role.cleaner': 'Safai karmchari',
  'warr.role.driver': 'Driver',
  'warr.role.accountant': 'Accountant',

  'warr.sheets.title': 'Bheji gayi sheets',
  'warr.sheets.subject': 'sheet',
  'warr.sheets.none': 'Koi sheet nahi bheji',
  'warr.sheets.empty': 'Abhi tak koi sheet nahi bheji gayi.',
  'warr.sheets.summary.one': '1 warrior, {points} points',
  'warr.sheets.summary.many': '{n} warriors, {points} points',
  'warr.sheets.entries.one': '1 entry',
  'warr.sheets.entries.many': '{n} entries',
  'warr.sheets.by': '{name} ne bheji',
  'warr.sheets.photo': 'Kaagaz ki photo dekhein',
  'warr.sheets.photoName': '{day} ke kaagaz ki photo dekhein',
  'warr.sheets.older': 'Purani sheets dekhein',
  'warr.sheets.fewer': 'Kam dikhayein',
  'warr.gaps.some': '{days} ko koi sheet nahi bheji gayi.',
  'warr.gaps.lots': 'Pichhle {m} dinon mein se {n} din koi sheet nahi bheji gayi.',

  'warr.how.link': 'Points kaise tay hote hain',
  'warr.how.body':
    'Aapki list ke har kaam ke points uske samay, hunar, mehnat aur zimmedaari se tay hote hain. Points tabhi gine jaate hain jab aap kaagaz ki photo ke saath us din ki sheet bhej dete hain.',

  'warr.person.notFound': 'Yeh warrior nahi mila.',
  'warr.person.all': 'Sab warriors dekhein',
  'warr.person.edit': 'Badlein',
  'warr.person.editName': '{name} ki jaankari badlein',
  'warr.person.phone': 'Phone',
  'warr.person.leaveHelp':
    'Aaj chhutti hai? Chhutti lagayein. Yeh din kaam ke dinon mein nahi gina jayega.',
  'warr.person.leaveOnHelp': 'Aaj chhutti par hain. Yeh din kaam ke dinon mein nahi gina ja raha.',
  'warr.person.topShare': 'Mahine ke points ka {pct}%',
  'warr.person.month': 'Is mahine ke points',
  'warr.person.avg': 'Har kaam ka din',
  'warr.person.leave': 'Is mahine ki chhutti',
  'warr.person.days': 'din',
  'warr.person.bars': 'Pichhle 14 din, har din ke points',
  'warr.person.barsSummary':
    'Pichhle 14 din, {total} points. Sabse achha din {day}, {best} points.',
  'warr.person.barsNone': 'Pichhle 14 din, koi points nahi.',
  'warr.person.top': 'Is mahine ke mukhya kaam',
  'warr.person.times.one': '1 baar',
  'warr.person.times.many': '{n} baar',
  'warr.person.recent': 'Haal ki entries',
  'warr.person.noEntries': 'Is mahine abhi koi points nahi.',
  'warr.person.capped':
    'Sirf sabse nayi 1,000 entries dikh rahi hain, isliye yeh aankde kam ho sakte hain.',
  'warr.person.removedNote':
    'Is warrior ko hata diya gaya hai. Purane points record mein rehte hain.',
  'warr.person.qty': 'Matra {n}',
  'warr.person.amount': '{n} rupaye ki rakam',
  'warr.person.split': '{n} ne milkar kiya',
  'warr.person.entryPoints': '{points} points',
};
