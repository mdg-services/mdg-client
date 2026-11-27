import type { LangMessage } from '../i18n';

import type { AreaHl } from './_types';

/**
 * The `bill` area's words (spec sections 4.8, 7 and 8): the Bill and plan page, a bill, the autopay
 * screen. Keys start with `bill.`. Plural keys are written as `<key>.one` and `<key>.many` (see
 * `_plural.ts`).
 *
 * Rules these words keep (shellNoPayPath.test.tsx pins them on the page the Android app draws):
 *  - nothing points at a place or a way to pay: no website, browser, link, "pay here / on / at";
 *  - never "first month free", never "you can claim" (GST is tax advice: it says "GST on your invoices");
 *  - money is never an alarm: a due bill is a plain sentence, not a red warning;
 *  - Hindi is what a pump owner says; Hinglish has no Devanagari.
 *
 * `{amount}` is a rupee amount from `money()`, `{date}` a day from the dealer's clock, both already
 * written so they never split across two lines.
 */
export const billMessages = {
  'bill.title': { en: 'Bill and plan', hi: 'बिल और प्लान' },
  'bill.detail.title': { en: 'Bill', hi: 'बिल' },
  // A bill's name, built from its month so it reads in the reader's language ("Dealer Kavach, नवंबर 2026").
  'bill.name.month': { en: 'Dealer Kavach, {month} {year}', hi: 'Dealer Kavach, {month} {year}' },
  'bill.pay.now': { en: 'Pay now', hi: 'बिल भरें' },
  'bill.pay.name': { en: 'Pay now, {amount}', hi: 'बिल भरें, {amount}' },

  // ── What needs me: one word and one sentence, always with a shape ───────────
  'bill.need.none.word': { en: 'Nothing due', hi: 'कुछ बाकी नहीं' },
  'bill.need.none.text': { en: 'Nothing is due.', hi: 'अभी कोई बिल बाकी नहीं है।' },
  'bill.need.due.word': { en: 'Bill due', hi: 'बिल बाकी है' },
  'bill.need.due.one': {
    en: 'Bill of {amount} due on {date}, 1 day left.',
    hi: '{amount} का बिल {date} तक देना है, 1 दिन बाकी।',
  },
  'bill.need.due.many': {
    en: 'Bill of {amount} due on {date}, {n} days left.',
    hi: '{amount} का बिल {date} तक देना है, {n} दिन बाकी।',
  },
  'bill.need.due.today': {
    en: 'Bill of {amount} is due today. It is the last day.',
    hi: '{amount} के बिल की आखिरी तारीख आज है।',
  },
  'bill.need.due.noDate': {
    en: 'Bill of {amount} is due.',
    hi: '{amount} का बिल बाकी है।',
  },
  'bill.need.overdue.word': { en: 'Past the due date', hi: 'तारीख निकल गई' },
  'bill.need.overdue.text': {
    en: 'The due date of the {amount} bill was {date}.',
    hi: '{amount} के बिल की आखिरी तारीख {date} थी।',
  },
  'bill.need.autopay.word': { en: 'Autopay will take it', hi: 'ऑटोपे काटेगा' },
  'bill.need.autopay.text': {
    en: 'Autopay will take {amount} on {date}.',
    hi: 'ऑटोपे {date} को {amount} काटेगा।',
  },
  'bill.need.autopay.today': {
    en: 'Autopay will take {amount} today.',
    hi: 'ऑटोपे आज {amount} काटेगा।',
  },
  'bill.need.autopay.every': {
    en: 'Autopay takes {amount} every month.',
    hi: 'ऑटोपे हर महीने {amount} काटता है।',
  },
  'bill.need.autopayOn.word': { en: 'Autopay is on', hi: 'ऑटोपे चालू है' },
  'bill.need.retry.word': { en: 'Autopay could not take it', hi: 'ऑटोपे नहीं काट पाया' },
  'bill.need.retry.text': {
    en: 'Autopay could not take {amount}. Last try: {date}. It is trying again.',
    hi: 'ऑटोपे {amount} नहीं काट पाया। आखिरी कोशिश: {date}। वह फिर कोशिश कर रहा है।',
  },
  'bill.need.retry.noDate': {
    en: 'Autopay could not take {amount}. It is trying again.',
    hi: 'ऑटोपे {amount} नहीं काट पाया। वह फिर कोशिश कर रहा है।',
  },
  'bill.need.approval.word': { en: 'Waiting for you', hi: 'आपका इंतज़ार' },
  'bill.need.processing.word': { en: 'Being confirmed', hi: 'पक्का हो रहा है' },

  // ── The plan ────────────────────────────────────────────────────────────────
  'bill.plan.title': { en: 'Your plan', hi: 'आपका प्लान' },
  // The price is two lines on purpose: the amount, then the sum behind it. At 200% text "GST" never
  // sits alone on a line, because `{tax}` ("18% GST") is written with no-break spaces.
  'bill.plan.perMonth': { en: '{total} a month', hi: '{total} हर महीने' },
  'bill.plan.sum': { en: '= {base} + {tax}', hi: '= {base} + {tax}' },
  'bill.plan.fromBill': {
    en: 'Taken from your latest bill.',
    hi: 'आपके पिछले बिल से लिया गया।',
  },
  'bill.plan.covers.one': { en: 'Covers {n} service, see all', hi: '{n} सेवा शामिल है, सब देखें' },
  'bill.plan.covers.many': {
    en: 'Covers {n} services, see all',
    hi: '{n} सेवाएँ शामिल हैं, सब देखें',
  },

  // ── The autopay row ─────────────────────────────────────────────────────────
  'bill.autopay.lastTry': { en: 'Last try: {date}', hi: 'आखिरी कोशिश: {date}' },
  'bill.autopay.none': {
    en: 'Not on at this pump.',
    hi: 'इस पंप पर ऑटोपे चालू नहीं है।',
  },
  // The Autopay screen when there is none. In the phone app it only says who to ask: how autopay is
  // started is a way of paying, and the app never points at one (ADR 0022 section 1).
  'bill.autopay.noneAsk': {
    en: 'If you have a question about your plan, ask MDG in the chat.',
    hi: 'अपने प्लान के बारे में कुछ पूछना हो तो चैट में MDG से पूछें।',
  },
  'bill.autopay.noneHow': {
    en: 'Autopay is switched on when your bill is sent. To have it from your next bill, ask MDG in the chat.',
    hi: 'ऑटोपे बिल भेजते समय चालू होता है। अगले बिल से चाहिए तो चैट में MDG से कहें।',
  },

  // ── This year ───────────────────────────────────────────────────────────────
  'bill.year.title': { en: 'This year', hi: 'इस साल' },
  'bill.year.range': { en: 'April {from} to March {to}', hi: 'अप्रैल {from} से मार्च {to}' },
  'bill.year.paidBills.one': { en: 'Paid {n} bill this year', hi: 'इस साल {n} बिल चुकाया' },
  'bill.year.paidBills.many': { en: 'Paid {n} bills this year', hi: 'इस साल {n} बिल चुकाए' },
  'bill.year.allOnTime.one': { en: 'It was paid on time.', hi: 'वह समय पर चुकाया गया।' },
  'bill.year.allOnTime.many': {
    en: 'All {n} were paid on time.',
    hi: 'सभी {n} समय पर चुकाए गए।',
  },
  'bill.year.noneOnTime.one': { en: 'It was paid late.', hi: 'वह देर से चुकाया गया।' },
  'bill.year.noneOnTime.many': {
    en: 'None of the {n} was paid on time.',
    hi: '{n} में से कोई भी समय पर नहीं चुकाया गया।',
  },
  'bill.year.none': { en: 'Nothing paid yet this year.', hi: 'इस साल अभी कुछ नहीं चुकाया।' },
  'bill.year.onTime.one': {
    en: '{ok} of {n} bill paid on time',
    hi: '{n} में से {ok} बिल समय पर चुकाया',
  },
  'bill.year.onTime.many': {
    en: '{ok} of {n} bills paid on time',
    hi: '{n} में से {ok} बिल समय पर चुकाए',
  },
  'bill.year.gst': { en: 'GST on your invoices', hi: 'आपके इनवॉइस पर GST' },
  'bill.year.gstNote': {
    en: 'Invoices, less credit notes.',
    hi: 'इनवॉइस में से क्रेडिट नोट घटाकर।',
  },

  // ── The bills ───────────────────────────────────────────────────────────────
  'bill.bills.title': { en: 'Your bills', hi: 'आपके बिल' },
  'bill.bills.empty': {
    en: 'Your first bill appears after your services start.',
    hi: 'आपकी सेवाएँ शुरू होने के बाद आपका पहला बिल यहाँ दिखेगा।',
  },
  'bill.bills.capped': {
    en: 'This list shows your newest {n} bills. Older ones are not shown here. Ask MDG in the chat for them.',
    hi: 'इस सूची में आपके सबसे नए {n} बिल हैं। पुराने यहाँ नहीं दिखते। उनके लिए चैट में MDG से पूछें।',
  },
  'bill.status.paidOnTime': { en: 'Paid on time', hi: 'समय पर चुकाया' },
  'bill.status.paidLate': { en: 'Paid late', hi: 'देर से चुकाया' },

  // ── Papers ──────────────────────────────────────────────────────────────────
  'bill.papers.title': {
    en: 'GST invoices and credit notes',
    hi: 'GST इनवॉइस और क्रेडिट नोट',
  },
  'bill.papers.empty': {
    en: 'Your GST invoices and credit notes appear here once a bill is paid.',
    hi: 'बिल चुकाने के बाद आपके GST इनवॉइस और क्रेडिट नोट यहाँ दिखेंगे।',
  },
  'bill.papers.invoice': { en: 'GST invoice {number}', hi: 'GST इनवॉइस {number}' },
  'bill.papers.creditNote': { en: 'Credit note {number}', hi: 'क्रेडिट नोट {number}' },
  'bill.papers.meta': { en: '{date} · {total}', hi: '{date} · {total}' },
  'bill.papers.creditNoteHelp': {
    en: 'A credit note is the paper for money MDG gave back to you.',
    hi: 'क्रेडिट नोट उस पैसे का कागज़ है जो MDG ने आपको वापस किया।',
  },
  'bill.papers.openBill': {
    en: 'To download a paper, open its bill in the list above.',
    hi: 'कागज़ डाउनलोड करने के लिए ऊपर सूची में उसका बिल खोलें।',
  },

  // ── Bills are made out to ───────────────────────────────────────────────────
  'bill.to.title': { en: 'Bills are made out to', hi: 'बिल इस नाम पर बनते हैं' },
  'bill.to.gstin': { en: 'GST number {gstin}', hi: 'GST नंबर {gstin}' },
  'bill.to.noGstin': { en: 'No GST number', hi: 'GST नंबर नहीं है' },
  'bill.to.empty': {
    en: 'No billing details are saved yet.',
    hi: 'अभी बिल का नाम और पता सेव नहीं हुआ है।',
  },

  // ── One bill's page ─────────────────────────────────────────────────────────
  'bill.detail.thisBill': { en: 'This bill', hi: 'यह बिल' },
  'bill.detail.covers': { en: 'Month it covers', hi: 'किस महीने का बिल' },
  'bill.detail.before': { en: 'Amount before GST', hi: 'GST से पहले की रकम' },
  'bill.detail.gst': { en: 'GST {rate}%', hi: 'GST {rate}%' },
  'bill.detail.afterPaid': {
    en: 'The receipt and the GST invoice appear here once the bill is paid.',
    hi: 'बिल चुकाने के बाद रसीद और GST इनवॉइस यहाँ दिखेंगे।',
  },
} satisfies Record<string, LangMessage>;

export const billHl: AreaHl<typeof billMessages> = {
  'bill.title': 'Bill aur plan',
  'bill.detail.title': 'Bill',
  'bill.name.month': 'Dealer Kavach, {month} {year}',
  'bill.pay.now': 'Bill bharein',
  'bill.pay.name': 'Bill bharein, {amount}',

  'bill.need.none.word': 'Kuch baaki nahi',
  'bill.need.none.text': 'Abhi koi bill baaki nahi hai.',
  'bill.need.due.word': 'Bill baaki hai',
  'bill.need.due.one': '{amount} ka bill {date} tak dena hai, 1 din baaki.',
  'bill.need.due.many': '{amount} ka bill {date} tak dena hai, {n} din baaki.',
  'bill.need.due.today': '{amount} ke bill ki aakhri taareekh aaj hai.',
  'bill.need.due.noDate': '{amount} ka bill baaki hai.',
  'bill.need.overdue.word': 'Taareekh nikal gayi',
  'bill.need.overdue.text': '{amount} ke bill ki aakhri taareekh {date} thi.',
  'bill.need.autopay.word': 'Autopay katega',
  'bill.need.autopay.text': 'Autopay {date} ko {amount} katega.',
  'bill.need.autopay.today': 'Autopay aaj {amount} katega.',
  'bill.need.autopay.every': 'Autopay har mahine {amount} katta hai.',
  'bill.need.autopayOn.word': 'Autopay chalu hai',
  'bill.need.retry.word': 'Autopay nahi kaat paya',
  'bill.need.retry.text':
    'Autopay {amount} nahi kaat paya. Aakhri koshish: {date}. Woh phir koshish kar raha hai.',
  'bill.need.retry.noDate': 'Autopay {amount} nahi kaat paya. Woh phir koshish kar raha hai.',
  'bill.need.approval.word': 'Aapka intezaar',
  'bill.need.processing.word': 'Pakka ho raha hai',

  'bill.plan.title': 'Aapka plan',
  'bill.plan.perMonth': '{total} har mahine',
  'bill.plan.sum': '= {base} + {tax}',
  'bill.plan.fromBill': 'Aapke pichhle bill se liya gaya.',
  'bill.plan.covers.one': 'Isme {n} service shaamil hai, sab dekhein',
  'bill.plan.covers.many': 'Isme {n} services shaamil hain, sab dekhein',

  'bill.autopay.lastTry': 'Aakhri koshish: {date}',
  'bill.autopay.none': 'Is pump par autopay chalu nahi hai.',
  'bill.autopay.noneAsk': 'Apne plan ke baare mein kuch poochna ho to chat mein MDG se poochhein.',
  'bill.autopay.noneHow':
    'Autopay bill bhejte samay chalu hota hai. Agle bill se chahiye to chat mein MDG se kahein.',

  'bill.year.title': 'Is saal',
  'bill.year.range': 'April {from} se March {to}',
  'bill.year.paidBills.one': 'Is saal {n} bill chukaya',
  'bill.year.paidBills.many': 'Is saal {n} bill chukaye',
  'bill.year.allOnTime.one': 'Woh samay par chukaya gaya.',
  'bill.year.allOnTime.many': 'Sabhi {n} samay par chukaye gaye.',
  'bill.year.noneOnTime.one': 'Woh der se chukaya gaya.',
  'bill.year.noneOnTime.many': '{n} mein se koi bhi samay par nahi chukaya gaya.',
  'bill.year.none': 'Is saal abhi kuch nahi chukaya.',
  'bill.year.onTime.one': '{n} mein se {ok} bill samay par chukaya',
  'bill.year.onTime.many': '{n} mein se {ok} bill samay par chukaye',
  'bill.year.gst': 'Aapke invoice par GST',
  'bill.year.gstNote': 'Invoice mein se credit note ghatakar.',

  'bill.bills.title': 'Aapke bill',
  'bill.bills.empty': 'Aapki services shuru hone ke baad aapka pehla bill yahan dikhega.',
  'bill.bills.capped':
    'Is list mein aapke sabse naye {n} bill hain. Purane yahan nahi dikhte. Unke liye chat mein MDG se poochhein.',
  'bill.status.paidOnTime': 'Samay par chukaya',
  'bill.status.paidLate': 'Der se chukaya',

  'bill.papers.title': 'GST invoice aur credit note',
  'bill.papers.empty': 'Bill chukane ke baad aapke GST invoice aur credit note yahan dikhenge.',
  'bill.papers.invoice': 'GST invoice {number}',
  'bill.papers.creditNote': 'Credit note {number}',
  'bill.papers.meta': '{date} · {total}',
  'bill.papers.creditNoteHelp': 'Credit note us paise ka kaagaz hai jo MDG ne aapko wapas kiya.',
  'bill.papers.openBill': 'Kaagaz download karne ke liye upar list mein uska bill kholein.',

  'bill.to.title': 'Bill is naam par bante hain',
  'bill.to.gstin': 'GST number {gstin}',
  'bill.to.noGstin': 'GST number nahi hai',
  'bill.to.empty': 'Abhi bill ka naam aur pata save nahi hua hai.',

  'bill.detail.thisBill': 'Yeh bill',
  'bill.detail.covers': 'Kis mahine ka bill',
  'bill.detail.before': 'GST se pehle ki rakam',
  'bill.detail.gst': 'GST {rate}%',
  'bill.detail.afterPaid': 'Bill chukane ke baad receipt aur GST invoice yahan dikhenge.',
};
