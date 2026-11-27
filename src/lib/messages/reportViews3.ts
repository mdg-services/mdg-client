import type { LangMessage } from '../i18n';

import type { AreaHl } from './_types';

/**
 * The `reportViews3` area's words (spec sections 7 and 8): the new summary lines the second half of
 * the report kind views draw on the kit (water checks, supply status, next tanker, tank stock, tanker
 * receipt, fuel order, density). The older sentences of these views are still written in each kind's own
 * file as three-language `Words`; every sentence added by the redesign is here.
 * Keys start with `rv3.`. Plural keys are written as `<key>.one` and `<key>.many` (see `_plural.ts`).
 */
export const reportViews3Messages = {
  // ── water checks ────────────────────────────────────────────────────────────
  'rv3.water.title': { en: 'Water checks', hi: 'पानी की जाँच' },
  'rv3.water.progress': { en: '{done} of {total} checks done', hi: '{total} में से {done} जाँच हुईं' },
  'rv3.water.progressSoFar': {
    en: '{done} of {total} checks done so far',
    hi: 'अब तक {total} में से {done} जाँच हुईं',
  },
  'rv3.water.missed.one': { en: '1 missed', hi: '1 छूट गई' },
  'rv3.water.missed.many': { en: '{n} missed', hi: '{n} छूट गईं' },
  'rv3.water.open.one': { en: '1 still to come', hi: '1 अभी बाकी' },
  'rv3.water.open.many': { en: '{n} still to come', hi: '{n} अभी बाकी' },
  'rv3.water.day': { en: 'For {day}', hi: '{day} की' },

  // ── supply status ───────────────────────────────────────────────────────────
  'rv3.supply.label': { en: 'Fuel supply', hi: 'तेल की सप्लाई' },
  'rv3.supply.open': { en: 'Open', hi: 'चालू' },
  'rv3.supply.stopped': { en: 'Stopped', hi: 'रुकी है' },
  'rv3.supply.unclear': { en: 'Not clear', hi: 'साफ़ नहीं' },
  'rv3.supply.pending.one': { en: '1 condition pending', hi: '1 शर्त बाकी' },
  'rv3.supply.pending.many': { en: '{n} conditions pending', hi: '{n} शर्तें बाकी' },
  'rv3.supply.pendingRisk.one': {
    en: '1 condition pending. It can stop your supply.',
    hi: '1 शर्त बाकी है। इससे सप्लाई रुक सकती है।',
  },
  'rv3.supply.pendingRisk.many': {
    en: '{n} conditions pending. Any one can stop your supply.',
    hi: '{n} शर्तें बाकी हैं। इनमें से कोई एक भी सप्लाई रोक सकती है।',
  },
  'rv3.supply.allClear': { en: 'No condition is pending', hi: 'कोई शर्त बाकी नहीं' },

  // ── next tanker ─────────────────────────────────────────────────────────────
  'rv3.plan.title': { en: 'Next tanker', hi: 'अगला टैंकर' },
  'rv3.plan.arrives': { en: 'Arrives {day}, {time}', hi: '{day} को {time} पर आएगा' },
  'rv3.plan.arrivesNoTime': { en: 'Arrives {day}', hi: '{day} को आएगा' },
  'rv3.plan.coverLine': {
    en: '{stock}, lasts {days} days',
    hi: '{stock}, {days} दिन चलेगा',
  },
  'rv3.plan.coverLineNone': {
    en: '{stock}, not enough days of sales yet',
    hi: '{stock}, कितने दिन चलेगा यह कहने के लिए बिक्री के दिन कम हैं',
  },
  'rv3.plan.runsOut': { en: 'Runs out {day}', hi: '{day} को खत्म' },
  'rv3.plan.lowLine': { en: 'Low line {litres}', hi: 'न्यूनतम {litres}' },

  // ── tank stock ──────────────────────────────────────────────────────────────
  'rv3.stock.title': { en: 'Tank stock', hi: 'टंकी का स्टॉक' },
  'rv3.stock.oldWord': { en: 'Old reading', hi: 'पुरानी रीडिंग' },
  'rv3.stock.coverTitle': { en: 'How long it lasts', hi: 'कितने दिन चलेगा' },
  'rv3.stock.lowLegend': { en: 'Dashed line: the low line of the tank', hi: 'टूटी लकीर: टंकी की न्यूनतम सीमा' },

  // ── tanker receipt ──────────────────────────────────────────────────────────
  'rv3.ack.short': { en: 'Litres short', hi: 'कम आया' },
  'rv3.ack.claimed': { en: 'Claim figure', hi: 'क्लेम की कमी' },
  'rv3.ack.receiptTitle': { en: 'This receipt', hi: 'यह रसीद' },
  'rv3.ack.outcomeOk': { en: 'No shortage', hi: 'कमी नहीं' },
  'rv3.ack.outcomeShort': { en: 'Came short', hi: 'माल कम आया' },
  'rv3.ack.outcomeUnknown': { en: 'See the portal', hi: 'पोर्टल देखें' },
  'rv3.ack.shortInvoices.one': { en: '1 invoice came short', hi: '1 बिल में माल कम आया' },
  'rv3.ack.shortInvoices.many': { en: '{n} invoices came short', hi: '{n} बिलों में माल कम आया' },

  // ── fuel order ──────────────────────────────────────────────────────────────
  'rv3.order.title': { en: 'Your order', hi: 'आपका ऑर्डर' },
  'rv3.order.details': { en: 'Order details', hi: 'ऑर्डर की जानकारी' },
  'rv3.order.listTitle': { en: 'Your orders on the portal', hi: 'पोर्टल पर आपके ऑर्डर' },

  // ── tanker density ──────────────────────────────────────────────────────────
  'rv3.density.fuelCount': { en: '{n} fuels on this invoice', hi: 'इस बिल पर {n} ईंधन' },
  'rv3.density.copyOne': { en: 'Copy {fuel} density {digits}', hi: '{fuel} की डेंसिटी {digits} कॉपी करें' },
} satisfies Record<string, LangMessage>;

export const reportViews3Hl: AreaHl<typeof reportViews3Messages> = {
  'rv3.water.title': 'Paani ki jaanch',
  'rv3.water.progress': '{total} mein se {done} jaanch hui',
  'rv3.water.progressSoFar': 'Ab tak {total} mein se {done} jaanch hui',
  'rv3.water.missed.one': '1 chhoot gayi',
  'rv3.water.missed.many': '{n} chhoot gayi',
  'rv3.water.open.one': '1 abhi baaki',
  'rv3.water.open.many': '{n} abhi baaki',
  'rv3.water.day': '{day} ki',

  'rv3.supply.label': 'Tel ki supply',
  'rv3.supply.open': 'Chalu',
  'rv3.supply.stopped': 'Ruki hai',
  'rv3.supply.unclear': 'Saaf nahi',
  'rv3.supply.pending.one': '1 shart baaki',
  'rv3.supply.pending.many': '{n} shartein baaki',
  'rv3.supply.pendingRisk.one': '1 shart baaki hai. Isse supply ruk sakti hai.',
  'rv3.supply.pendingRisk.many': '{n} shartein baaki hain. Inmein se koi ek bhi supply rok sakti hai.',
  'rv3.supply.allClear': 'Koi shart baaki nahi',

  'rv3.plan.title': 'Agla tanker',
  'rv3.plan.arrives': '{day} ko {time} par aayega',
  'rv3.plan.arrivesNoTime': '{day} ko aayega',
  'rv3.plan.coverLine': '{stock}, {days} din chalega',
  'rv3.plan.coverLineNone': '{stock}, kitne din chalega yeh kehne ke liye bikri ke din kam hain',
  'rv3.plan.runsOut': '{day} ko khatam',
  'rv3.plan.lowLine': 'Minimum {litres}',

  'rv3.stock.title': 'Tanki ka stock',
  'rv3.stock.oldWord': 'Purani reading',
  'rv3.stock.coverTitle': 'Kitne din chalega',
  'rv3.stock.lowLegend': 'Toot lakeer: tanki ki minimum seema',

  'rv3.ack.short': 'Kam aaya',
  'rv3.ack.claimed': 'Claim ki kami',
  'rv3.ack.receiptTitle': 'Yeh raseed',
  'rv3.ack.outcomeOk': 'Kami nahi',
  'rv3.ack.outcomeShort': 'Maal kam aaya',
  'rv3.ack.outcomeUnknown': 'Portal dekhein',
  'rv3.ack.shortInvoices.one': '1 bill mein maal kam aaya',
  'rv3.ack.shortInvoices.many': '{n} billon mein maal kam aaya',

  'rv3.order.title': 'Aapka order',
  'rv3.order.details': 'Order ki jaankari',
  'rv3.order.listTitle': 'Portal par aapke order',

  'rv3.density.fuelCount': 'Is bill par {n} eendhan',
  'rv3.density.copyOne': '{fuel} ki density {digits} copy karein',
};
