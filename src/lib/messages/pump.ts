import type { LangMessage } from '../i18n';

import type { AreaHl } from './_types';

/**
 * The `pump` area's words (spec section 8): My pump, Papers and licences, the quiet phone settings,
 * the team, the logins page, help. Keys start with `pump.` (see `AREA_PREFIXES` in `_types.ts`).
 * Plural keys are written as `<key>.one` and `<key>.many` (see `_plural.ts`). Hindi uses no English
 * word except a brand or a short code (MDG, Kavach, SAP, IOCL, OTP); there is no "Sir".
 *
 * These are drafts: a native Hindi reader must go through every line before release (spec 11.4).
 */
export const pumpMessages = {
  // ── My pump: the page and its identity card ──
  'pump.identity.unnamed': { en: 'Your pump', hi: 'आपका पंप' },
  'pump.identity.sap': { en: 'SAP code {code}', hi: 'SAP कोड {code}' },
  'pump.identity.code': { en: 'Pump {code}', hi: 'पंप {code}' },
  'pump.oil.iocl': { en: 'Indian Oil', hi: 'इंडियन ऑयल' },
  'pump.oil.bpcl': { en: 'Bharat Petroleum', hi: 'भारत पेट्रोलियम' },
  'pump.oil.hpcl': { en: 'Hindustan Petroleum', hi: 'हिंदुस्तान पेट्रोलियम' },
  'pump.oil.nayara': { en: 'Nayara', hi: 'नायरा' },
  'pump.oil.shell': { en: 'Shell', hi: 'शेल' },
  'pump.oil.reliance': { en: 'Reliance', hi: 'रिलायंस' },
  'pump.join.and': { en: 'and', hi: 'और' },
  'pump.identity.failed': {
    en: 'Your pump details did not load.',
    hi: 'आपके पंप की जानकारी नहीं आ सकी।',
  },

  // ── My pump: the sections ──
  'pump.section.stand': { en: 'How things stand', hi: 'अभी का हाल' },
  'pump.section.people': { en: 'People', hi: 'लोग' },
  'pump.section.help': { en: 'Help', hi: 'मदद' },
  'pump.section.me': { en: 'Me', hi: 'मैं' },

  // Where a health row leads, said under its sentence.
  'pump.where.services': { en: 'Services', hi: 'सेवाएँ' },
  'pump.where.bill': { en: 'Bill and plan', hi: 'बिल और प्लान' },
  'pump.where.logins': { en: 'IDs and passwords', hi: 'आईडी और पासवर्ड' },
  'pump.where.papers': { en: 'Papers and licences', hi: 'कागज़ात और लाइसेंस' },
  'pump.where.team': { en: 'Your team', hi: 'आपकी टीम' },

  // ── My pump: the health rows ──
  'pump.health.failed': {
    en: 'Could not check this right now',
    hi: 'अभी यह जाँच नहीं हो सकी',
  },

  'pump.health.services.running.one': { en: '1 service running', hi: '1 सेवा चल रही है' },
  'pump.health.services.running.many': { en: '{n} services running', hi: '{n} सेवाएँ चल रही हैं' },
  'pump.health.services.look.one': { en: '1 service needs a look', hi: '1 सेवा पर ध्यान देना है' },
  'pump.health.services.look.many': { en: '{n} services need a look', hi: '{n} सेवाओं पर ध्यान देना है' },
  'pump.health.services.lookNames': { en: 'Needs a look: {names}', hi: 'ध्यान दें: {names}' },
  'pump.health.services.ready': {
    en: 'Your services are getting ready',
    hi: 'आपकी सेवाएँ तैयार हो रही हैं',
  },
  'pump.health.services.none': {
    en: 'No service has started yet',
    hi: 'अभी कोई सेवा शुरू नहीं हुई',
  },

  'pump.health.money.due.one': {
    en: 'Bill due {date}, in 1 day',
    hi: 'बिल की आखिरी तारीख {date}, 1 दिन बाकी',
  },
  'pump.health.money.due.many': {
    en: 'Bill due {date}, in {n} days',
    hi: 'बिल की आखिरी तारीख {date}, {n} दिन बाकी',
  },
  'pump.health.money.today': { en: 'Bill is due today', hi: 'आज बिल की आखिरी तारीख है' },
  'pump.health.money.late.one': {
    en: 'Bill was due {date}: 1 day late',
    hi: 'बिल की आखिरी तारीख {date} थी, 1 दिन हो गया',
  },
  'pump.health.money.late.many': {
    en: 'Bill was due {date}: {n} days late',
    hi: 'बिल की आखिरी तारीख {date} थी, {n} दिन हो गए',
  },
  'pump.health.money.open': { en: 'A bill is open', hi: 'एक बिल बाकी है' },
  'pump.health.money.none': { en: 'No bill is open', hi: 'कोई बिल बाकी नहीं है' },

  'pump.health.logins.ok': { en: '{working} of {total} working', hi: '{total} में से {working} चालू हैं' },
  // `{names}` is the logins by name ("IRAS and SDMS"): the owner is told WHICH ones, never a count alone.
  'pump.health.logins.refused.one': {
    en: '{names} password was refused. Tap to fix',
    hi: '{names} का पासवर्ड नहीं चला। ठीक करने के लिए दबाएँ',
  },
  'pump.health.logins.refused.many': {
    en: '{names} passwords were refused. Tap to fix',
    hi: '{names} के पासवर्ड नहीं चले। ठीक करने के लिए दबाएँ',
  },
  'pump.health.logins.missing.one': {
    en: '{names} password is missing. Tap to add it',
    hi: '{names} का पासवर्ड अभी नहीं डाला है। डालने के लिए दबाएँ',
  },
  'pump.health.logins.missing.many': {
    en: '{names} passwords are missing. Tap to add them',
    hi: '{names} के पासवर्ड अभी नहीं डाले हैं। डालने के लिए दबाएँ',
  },
  'pump.health.logins.empty': { en: 'No logins are needed yet', hi: 'अभी किसी लॉगिन की ज़रूरत नहीं' },
  // On the logins page itself, the same facts without "tap".
  'pump.logins.refused.one': {
    en: '{names} password was refused',
    hi: '{names} का पासवर्ड नहीं चला',
  },
  'pump.logins.refused.many': { en: '{names} passwords were refused', hi: '{names} के पासवर्ड नहीं चले' },
  'pump.logins.missing.one': { en: '{names} password is missing', hi: '{names} का पासवर्ड अभी नहीं डाला है' },
  'pump.logins.missing.many': {
    en: '{names} passwords are missing',
    hi: '{names} के पासवर्ड अभी नहीं डाले हैं',
  },
  'pump.logins.lastChanged': { en: 'Last changed on {when}', hi: 'आखिरी बदलाव: {when}' },

  'pump.health.papers.valid': { en: 'All valid', hi: 'सब चालू हैं' },
  'pump.health.papers.none': {
    en: 'No papers with an end date are on file yet',
    hi: 'अभी अंतिम तारीख वाला कोई कागज़ दर्ज नहीं है',
  },

  'pump.health.team.managers.one': { en: '1 manager', hi: '1 मैनेजर' },
  'pump.health.team.managers.many': { en: '{n} managers', hi: '{n} मैनेजर' },
  'pump.health.team.partners.one': { en: '1 partner', hi: '1 पार्टनर' },
  'pump.health.team.partners.many': { en: '{n} partners', hi: '{n} पार्टनर' },
  'pump.health.team.notYet.one': { en: '1 not signed in yet', hi: '1 ने अभी साइन इन नहीं किया' },
  'pump.health.team.notYet.many': { en: '{n} not signed in yet', hi: '{n} ने अभी साइन इन नहीं किया' },
  'pump.health.team.alone': {
    en: 'Only you so far. Add your manager',
    hi: 'अभी सिर्फ़ आप हैं। अपने मैनेजर को जोड़ें',
  },

  // ── Papers and licences ──
  'pump.papers.summary': { en: 'Papers and licences', hi: 'कागज़ात और लाइसेंस' },
  'pump.papers.licences': { en: 'Licences', hi: 'लाइसेंस' },
  'pump.papers.onFile': { en: 'Other papers MDG has accepted', hi: 'MDG ने मान लिए दूसरे कागज़' },
  'pump.papers.accepted': { en: 'MDG accepted', hi: 'MDG ने मान लिया' },
  'pump.papers.ended': { en: 'Ended on {date}', hi: '{date} को खत्म हुई' },
  // The top card counts; it never repeats a paper's name (the rows below carry the names).
  'pump.papers.count.expired.one': { en: '1 paper has expired', hi: '1 कागज़ की मियाद खत्म' },
  'pump.papers.count.expired.many': { en: '{n} papers have expired', hi: '{n} कागज़ों की मियाद खत्म' },
  'pump.papers.count.expiring.one': { en: '1 ends soon', hi: '1 जल्द खत्म' },
  'pump.papers.count.expiring.many': { en: '{n} end soon', hi: '{n} जल्द खत्म' },
  'pump.papers.count.valid.one': { en: '1 valid', hi: '1 चालू' },
  'pump.papers.count.valid.many': { en: '{n} valid', hi: '{n} चालू' },
  'pump.papers.licences.empty': {
    en: 'No licence dates are on record yet.',
    hi: 'लाइसेंस की तारीखें अभी दर्ज नहीं हैं।',
  },
  'pump.papers.onFile.empty': {
    en: 'MDG has not accepted any paper yet.',
    hi: 'MDG ने अभी कोई कागज़ नहीं माना है।',
  },
  'pump.papers.loadFailed': { en: 'This list did not load.', hi: 'यह सूची नहीं आ सकी।' },
  'pump.papers.until': { en: 'Valid until {date}', hi: '{date} तक चालू' },
  'pump.papers.askDraft': {
    en: 'I want to send a paper or renew a licence.',
    hi: 'मुझे एक कागज़ भेजना है या लाइसेंस नया करवाना है।',
  },
  'pump.paper.days.one': { en: '{paper}: 1 day left', hi: '{paper}: 1 दिन बाकी' },
  'pump.paper.days.many': { en: '{paper}: {n} days left', hi: '{paper}: {n} दिन बाकी' },
  'pump.paper.today': { en: '{paper} ends today', hi: '{paper} की मियाद आज खत्म हो रही है' },
  'pump.paper.expired': { en: '{paper} has expired', hi: '{paper} की मियाद खत्म हो गई' },
  // The chip leads with the days, so the number is the first thing read (and never cut off).
  'pump.paper.chip.days.one': { en: '1 day left', hi: '1 दिन बाकी' },
  'pump.paper.chip.days.many': { en: '{n} days left', hi: '{n} दिन बाकी' },
  'pump.paper.chip.today': { en: 'Ends today', hi: 'आज खत्म' },
  'pump.paper.word.expired': { en: 'Expired', hi: 'मियाद खत्म' },
  'pump.paper.word.expiring': { en: 'Ends soon', hi: 'जल्द खत्म' },
  'pump.paper.word.valid': { en: 'Valid', hi: 'चालू' },
  'pump.paper.word.onFile': { en: 'On file', hi: 'दर्ज है' },
  'pump.licence.explosive': { en: 'Explosive licence', hi: 'विस्फोटक लाइसेंस' },
  'pump.licence.trade': { en: 'DTO trade licence', hi: 'डीटीओ ट्रेड लाइसेंस' },
  'pump.licence.wm': { en: 'Weights and Measures licence', hi: 'वज़न और माप लाइसेंस' },
  'pump.licence.fire': { en: 'Fire NOC', hi: 'फायर एनओसी' },

  // ── The quiet phone page (/settings) ──
  'pump.settings.pumpRow': { en: 'My pump', hi: 'मेरा पंप' },
  'pump.settings.pumpRowDesc': {
    en: 'Services, papers, team and help',
    hi: 'सेवाएँ, कागज़ात, टीम और मदद',
  },
  'pump.settings.messages.title': { en: 'Messages reaching me', hi: 'मुझ तक आने वाले मैसेज' },
  'pump.settings.messages.on': { en: 'Notifications are on', hi: 'नोटिफ़िकेशन चालू हैं' },
  'pump.settings.messages.off': {
    en: 'Notifications are off. Tap to turn them on in your phone',
    hi: 'नोटिफ़िकेशन बंद हैं। फ़ोन में चालू करने के लिए दबाएँ',
  },
  'pump.settings.messages.ask': {
    en: 'Notifications are not on yet. Tap to turn them on',
    hi: 'नोटिफ़िकेशन अभी चालू नहीं हैं। चालू करने के लिए दबाएँ',
  },
  'pump.settings.messages.battery': {
    en: 'Your phone may hide messages to save battery.',
    hi: 'आपका फ़ोन बैटरी बचाने के लिए मैसेज छिपा सकता है।',
  },
  'pump.settings.messages.batteryAction': { en: 'See the steps', hi: 'तरीका देखें' },
  'pump.settings.messages.web': {
    en: 'Messages come to your chat. Phone notifications work in the MDG app.',
    hi: 'मैसेज आपकी चैट में आते हैं। फ़ोन के नोटिफ़िकेशन MDG ऐप में चलते हैं।',
  },
  'pump.settings.danger': { en: 'Delete account', hi: 'खाता हटाना' },
  'pump.settings.passwordDesc': { en: 'Choose a new password', hi: 'नया पासवर्ड चुनें' },

  // ── Team ──
  'pump.team.notYet': { en: 'Not signed in yet', hi: 'अभी साइन इन नहीं किया' },
  'pump.team.lastOpened': { en: 'Last opened {day}', hi: 'आखिरी बार {day} खोला' },
  'pump.team.suspendName': { en: 'Suspend {name}', hi: '{name} को रोकें' },
  'pump.team.activateName': { en: 'Activate {name}', hi: '{name} को चालू करें' },

  // ── Help ──
  'pump.help.next': { en: 'Next: {title}', hi: 'अगला: {title}' },
  'pump.help.allWatched': { en: 'You have watched them all', hi: 'आप सब वीडियो देख चुके हैं' },
  'pump.help.group.mine': { en: 'For the services you have', hi: 'आपकी सेवाओं के वीडियो' },
  'pump.help.group.general': { en: 'How the app works', hi: 'ऐप कैसे चलता है' },
  'pump.help.group.more': { en: 'Other services', hi: 'दूसरी सेवाओं के वीडियो' },
  'pump.help.group.all': { en: 'All videos', hi: 'सभी वीडियो' },
  'pump.help.replayDesc': {
    en: 'A short video on what changed',
    hi: 'क्या बदला, एक छोटे वीडियो में',
  },
  'pump.help.replayRow': { en: 'Replay what is new', hi: 'नया क्या है, फिर देखें' },
  'pump.help.me': { en: 'Language, password, log out', hi: 'भाषा, पासवर्ड, लॉग आउट' },
  'pump.help.meDesc': {
    en: 'Your name, your phone and your account',
    hi: 'आपका नाम, फ़ोन और खाता',
  },
} satisfies Record<string, LangMessage>;

export const pumpHl: AreaHl<typeof pumpMessages> = {
  'pump.identity.unnamed': 'Aapka pump',
  'pump.identity.sap': 'SAP code {code}',
  'pump.identity.code': 'Pump {code}',
  'pump.oil.iocl': 'Indian Oil',
  'pump.oil.bpcl': 'Bharat Petroleum',
  'pump.oil.hpcl': 'Hindustan Petroleum',
  'pump.oil.nayara': 'Nayara',
  'pump.oil.shell': 'Shell',
  'pump.oil.reliance': 'Reliance',
  'pump.join.and': 'aur',
  'pump.identity.failed': 'Aapke pump ki jaankari nahi aa saki.',

  'pump.section.stand': 'Abhi ka haal',
  'pump.section.people': 'Log',
  'pump.section.help': 'Madad',
  'pump.section.me': 'Main',

  'pump.where.services': 'Services',
  'pump.where.bill': 'Bill aur plan',
  'pump.where.logins': 'ID aur password',
  'pump.where.papers': 'Kaagzaat aur licence',
  'pump.where.team': 'Aapki team',

  'pump.health.failed': 'Abhi yeh jaanch nahi ho saki',

  'pump.health.services.running.one': '1 service chal rahi hai',
  'pump.health.services.running.many': '{n} services chal rahi hain',
  'pump.health.services.look.one': '1 service par dhyaan dena hai',
  'pump.health.services.look.many': '{n} services par dhyaan dena hai',
  'pump.health.services.lookNames': 'Dhyaan dein: {names}',
  'pump.health.services.ready': 'Aapki services taiyaar ho rahi hain',
  'pump.health.services.none': 'Abhi koi service shuru nahi hui',

  'pump.health.money.due.one': 'Bill ki aakhri taareekh {date}, 1 din baaki',
  'pump.health.money.due.many': 'Bill ki aakhri taareekh {date}, {n} din baaki',
  'pump.health.money.today': 'Aaj bill ki aakhri taareekh hai',
  'pump.health.money.late.one': 'Bill ki aakhri taareekh {date} thi, 1 din ho gaya',
  'pump.health.money.late.many': 'Bill ki aakhri taareekh {date} thi, {n} din ho gaye',
  'pump.health.money.open': 'Ek bill baaki hai',
  'pump.health.money.none': 'Koi bill baaki nahi hai',

  'pump.health.logins.ok': '{total} mein se {working} chalu hain',
  'pump.health.logins.refused.one': '{names} ka password nahi chala. Theek karne ke liye dabayein',
  'pump.health.logins.refused.many': '{names} ke password nahi chale. Theek karne ke liye dabayein',
  'pump.health.logins.missing.one': '{names} ka password abhi nahi dala hai. Dalne ke liye dabayein',
  'pump.health.logins.missing.many': '{names} ke password abhi nahi dale hain. Dalne ke liye dabayein',
  'pump.health.logins.empty': 'Abhi kisi login ki zaroorat nahi',
  'pump.logins.refused.one': '{names} ka password nahi chala',
  'pump.logins.refused.many': '{names} ke password nahi chale',
  'pump.logins.missing.one': '{names} ka password abhi nahi dala hai',
  'pump.logins.missing.many': '{names} ke password abhi nahi dale hain',
  'pump.logins.lastChanged': 'Aakhri badlaav: {when}',

  'pump.health.papers.valid': 'Sab chalu hain',
  'pump.health.papers.none': 'Abhi antim taareekh wala koi kaagaz darj nahi hai',

  'pump.health.team.managers.one': '1 manager',
  'pump.health.team.managers.many': '{n} manager',
  'pump.health.team.partners.one': '1 partner',
  'pump.health.team.partners.many': '{n} partner',
  'pump.health.team.notYet.one': '1 ne abhi sign in nahi kiya',
  'pump.health.team.notYet.many': '{n} ne abhi sign in nahi kiya',
  'pump.health.team.alone': 'Abhi sirf aap hain. Apne manager ko jodein',

  'pump.papers.summary': 'Kaagzaat aur licence',
  'pump.papers.licences': 'Licence',
  'pump.papers.onFile': 'Doosre kaagaz jo MDG ne maan liye',
  'pump.papers.accepted': 'MDG ne maan liya',
  'pump.papers.ended': '{date} ko khatam hui',
  'pump.papers.count.expired.one': '1 kaagaz ki miyaad khatam',
  'pump.papers.count.expired.many': '{n} kaagzon ki miyaad khatam',
  'pump.papers.count.expiring.one': '1 jaldi khatam',
  'pump.papers.count.expiring.many': '{n} jaldi khatam',
  'pump.papers.count.valid.one': '1 chalu',
  'pump.papers.count.valid.many': '{n} chalu',
  'pump.papers.licences.empty': 'Licence ki taareekhein abhi darj nahi hain.',
  'pump.papers.onFile.empty': 'MDG ne abhi koi kaagaz nahi maana hai.',
  'pump.papers.loadFailed': 'Yeh soochi nahi aa saki.',
  'pump.papers.until': '{date} tak chalu',
  'pump.papers.askDraft': 'Mujhe ek kaagaz bhejna hai ya licence naya karwana hai.',
  'pump.paper.days.one': '{paper}: 1 din baaki',
  'pump.paper.days.many': '{paper}: {n} din baaki',
  'pump.paper.today': '{paper} ki miyaad aaj khatam ho rahi hai',
  'pump.paper.expired': '{paper} ki miyaad khatam ho gayi',
  'pump.paper.chip.days.one': '1 din baaki',
  'pump.paper.chip.days.many': '{n} din baaki',
  'pump.paper.chip.today': 'Aaj khatam',
  'pump.paper.word.expired': 'Miyaad khatam',
  'pump.paper.word.expiring': 'Jaldi khatam',
  'pump.paper.word.valid': 'Chalu',
  'pump.paper.word.onFile': 'Darj hai',
  'pump.licence.explosive': 'Visfotak licence',
  'pump.licence.trade': 'DTO trade licence',
  'pump.licence.wm': 'Wazan aur maap licence',
  'pump.licence.fire': 'Fire NOC',

  'pump.settings.pumpRow': 'Mera pump',
  'pump.settings.pumpRowDesc': 'Services, kaagzaat, team aur madad',
  'pump.settings.messages.title': 'Mujh tak aane wale message',
  'pump.settings.messages.on': 'Notification chalu hain',
  'pump.settings.messages.off': 'Notification band hain. Phone mein chalu karne ke liye dabayein',
  'pump.settings.messages.ask': 'Notification abhi chalu nahi hain. Chalu karne ke liye dabayein',
  'pump.settings.messages.battery': 'Aapka phone battery bachane ke liye message chhipa sakta hai.',
  'pump.settings.messages.batteryAction': 'Tareeka dekhein',
  'pump.settings.messages.web': 'Message aapki chat mein aate hain. Phone notification MDG app mein chalte hain.',
  'pump.settings.danger': 'Khata hatana',
  'pump.settings.passwordDesc': 'Naya password chunein',

  'pump.team.notYet': 'Abhi sign in nahi kiya',
  'pump.team.lastOpened': 'Aakhri baar {day} khola',
  'pump.team.suspendName': '{name} ko rokein',
  'pump.team.activateName': '{name} ko chalu karein',

  'pump.help.next': 'Agla: {title}',
  'pump.help.allWatched': 'Aap sab video dekh chuke hain',
  'pump.help.group.mine': 'Aapki services ke video',
  'pump.help.group.general': 'App kaise chalta hai',
  'pump.help.group.more': 'Doosri services ke video',
  'pump.help.group.all': 'Saare video',
  'pump.help.replayDesc': 'Kya badla, ek chhote video mein',
  'pump.help.replayRow': 'Naya kya hai, phir dekhein',
  'pump.help.me': 'Bhasha, password, log out',
  'pump.help.meDesc': 'Aapka naam, phone aur khata',
};
