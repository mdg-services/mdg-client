import type { LangMessage } from '../i18n';

import type { AreaHl } from './_types';

/**
 * The `reportViews2` area's words (spec section 8): the new sentences of the first half of the report
 * kind views (daily sales, stock variation, Credit & DOD, ledger watch, calibration claim, papers,
 * announcement, declaration filed, DU OTP, mock drill, electrical audit). Keys start with `rv2.`.
 * Plural keys are written as `<key>.one` and `<key>.many` (see `_plural.ts`).
 *
 * What each kind already said before the redesign (its lead sentences, its tile, alert and headline,
 * the share text) stays in the kind's own `Words` objects, as ADR 0056 set out; only the words the
 * redesign added live here.
 */
export const reportViews2Messages = {
  // ── daily sales (dsr_sales, and the sales sheet inside dsr_variation) ──────────────────────
  'rv2.sales.barsSummary': {
    en: 'Last {n} days of {fuel}: highest {high} on {highDay}, lowest {low} on {lowDay}, average {avg}',
    hi: '{fuel} के पिछले {n} दिन: सबसे ज़्यादा {high} ({highDay} को), सबसे कम {low} ({lowDay} को), औसत {avg}',
  },
  'rv2.sales.avgCaption': {
    en: 'Dashed line: your {n}-day average, {avg}',
    hi: 'धारीदार रेखा: आपके {n} दिन का औसत, {avg}',
  },
  'rv2.sales.month': { en: 'This month so far', hi: 'इस महीने अब तक' },
  'rv2.sales.monthCaption': { en: 'Up to {day}', hi: '{day} तक' },
  'rv2.sales.sheetTitle': { en: 'Sales sheet, {fuel}', hi: 'बिक्री शीट, {fuel}' },

  // ── stock variation ────────────────────────────────────────────────────────────────────────
  'rv2.var.room': { en: 'Room left before the limit', hi: 'सीमा तक अभी गुंजाइश' },
  'rv2.var.roomOf': { en: 'of {allowed} allowed on this side', hi: 'इस तरफ़ की मान्य {allowed} में से' },

  // ── Credit & DOD ───────────────────────────────────────────────────────────────────────────
  'rv2.credit.limitTitle': { en: 'Credit limit', hi: 'क्रेडिट लिमिट' },

  // ── ledger watch ───────────────────────────────────────────────────────────────────────────
  'rv2.ledger.look.one': { en: '1 entry needs a look', hi: '1 एंट्री पर ध्यान दें' },
  'rv2.ledger.look.many': { en: '{n} entries need a look', hi: '{n} एंट्री पर ध्यान दें' },
  'rv2.ledger.lookMeta': { en: 'They are marked in the list below', hi: 'नीचे की सूची में उन पर निशान है' },

  // ── papers running out ─────────────────────────────────────────────────────────────────────
  'rv2.papers.soonest': { en: 'Runs out first', hi: 'सबसे पहले खत्म होने वाला' },
  'rv2.papers.listTitle': { en: 'Your papers', hi: 'आपके कागज़' },

  // ── declaration filed ──────────────────────────────────────────────────────────────────────
  'rv2.decl.streak': { en: 'Safety declaration, filed', hi: 'सेफ्टी डिक्लेरेशन, जमा हुई' },
  'rv2.decl.streakUnit': { en: 'days in a row', hi: 'दिन लगातार' },
  'rv2.decl.nextDue': { en: 'Next one due {day}', hi: 'अगली {day} को जमा होगी' },

  // ── DU OTP ─────────────────────────────────────────────────────────────────────────────────
  'rv2.du.dispensers': { en: 'Dispensers', hi: 'डिस्पेंसर' },

  // ── mock drill ─────────────────────────────────────────────────────────────────────────────
  'rv2.drill.day': { en: 'Drill day', hi: 'ड्रिल का दिन' },
  'rv2.drill.people': { en: 'People present', hi: 'मौजूद लोग' },
  'rv2.drill.short': { en: 'Head count short {n}', hi: 'गिनती में कम: {n}' },
  'rv2.drill.onTime': { en: 'Steps started on time', hi: 'समय पर शुरू हुए कदम' },
  'rv2.drill.onTimeValue': { en: '{a} of {b}', hi: '{b} में से {a}' },

  // ── electrical audit ───────────────────────────────────────────────────────────────────────
  'rv2.elec.audits': { en: 'Audits', hi: 'ऑडिट' },
  'rv2.elec.points': { en: 'Points', hi: 'पॉइंट' },
} satisfies Record<string, LangMessage>;

export const reportViews2Hl: AreaHl<typeof reportViews2Messages> = {
  'rv2.sales.barsSummary':
    '{fuel} ke pichhle {n} din: sabse zyada {high} ({highDay} ko), sabse kam {low} ({lowDay} ko), ausat {avg}',
  'rv2.sales.avgCaption': 'Dhaaridaar rekha: aapke {n} din ka ausat, {avg}',
  'rv2.sales.month': 'Is mahine ab tak',
  'rv2.sales.monthCaption': '{day} tak',
  'rv2.sales.sheetTitle': 'Bikri sheet, {fuel}',

  'rv2.var.room': 'Seema tak abhi gunjaish',
  'rv2.var.roomOf': 'is taraf ki maanya {allowed} mein se',

  'rv2.credit.limitTitle': 'Credit limit',

  'rv2.ledger.look.one': '1 entry par dhyaan dein',
  'rv2.ledger.look.many': '{n} entry par dhyaan dein',
  'rv2.ledger.lookMeta': 'Neeche ki list mein un par nishaan hai',

  'rv2.papers.soonest': 'Sabse pehle khatam hone wala',
  'rv2.papers.listTitle': 'Aapke kagaz',

  'rv2.decl.streak': 'Safety declaration, jama hui',
  'rv2.decl.streakUnit': 'din lagaatar',
  'rv2.decl.nextDue': 'Agli {day} ko jama hogi',

  'rv2.du.dispensers': 'Dispenser',

  'rv2.drill.day': 'Drill ka din',
  'rv2.drill.people': 'Maujood log',
  'rv2.drill.short': 'Ginti mein kam: {n}',
  'rv2.drill.onTime': 'Samay par shuru hue kadam',
  'rv2.drill.onTimeValue': '{b} mein se {a}',

  'rv2.elec.audits': 'Audit',
  'rv2.elec.points': 'Point',
};
