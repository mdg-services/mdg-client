import type { LangMessage } from '../i18n';

import type { AreaHl } from './_types';

/**
 * The `glance` area's words (spec sections 7 and 8): the verdict, the counts, the insight sentences
 * of Today's numbers and "Pump now" card, and the seven words a service can wear.
 *
 * The sentences are the Hindi-first drafts of spec section 7 (a native Hindi reader reviews them
 * before release, spec 11.4). Keys start with `glance.` (the area's prefix); the spec's own key
 * names are kept after it, so `verdict.fine` is `glance.verdict.fine`.
 *
 * Differences from the table in section 7, each on purpose:
 *  - the service state words live here as `glance.svcState.*` and not as `svc.state.*`: `svc.` is the
 *    Services area's prefix and that file belongs to another group, while `serviceState.ts` (this
 *    group) has to name its words today;
 *  - the as-of sentences (`asOf.*`), the tab names and the "My pump" door already exist in `kit.ts`
 *    and `shell.ts` and are not written a second time;
 *  - a counted sentence that read wrongly for 1 (`paper.days`, `deposit.left`, `supply.stopped`) has a
 *    `.one` and a `.many` key, as plural keys do everywhere else;
 *  - a few sentences the spec describes but section 7 does not list are added: "Your first reports
 *    come after the next run" (4.1), "waiting 2 days" (4.1), the Kavach rows of Needs you, a deposit
 *    that is late, and the line under an unknown verdict.
 *
 * Hindi uses no English words except the brand names (MDG, Kavach, IOCL, DOD, OTP); Hinglish is
 * Hindi in English letters. Numbers are placed by the caller through `fmtInt` / `fmtLitres`.
 */
export const glanceMessages = {
  // ── the verdict ──────────────────────────────────────────────────────────
  'glance.verdict.fine': { en: 'All fine', hi: 'सब ठीक है' },
  'glance.verdict.needs.one': { en: '1 thing waits for you', hi: 'आपके लिए 1 काम है' },
  'glance.verdict.needs.many': { en: '{n} things wait for you', hi: 'आपके लिए {n} काम हैं' },
  'glance.verdict.look.one': { en: '1 thing needs a look', hi: 'ध्यान देने की 1 बात है' },
  'glance.verdict.look.many': { en: '{n} things need a look', hi: 'ध्यान देने की {n} बातें हैं' },
  'glance.verdict.problem.one': { en: '1 problem', hi: '1 समस्या है' },
  'glance.verdict.problem.many': { en: '{n} problems', hi: '{n} समस्याएँ हैं' },
  'glance.verdict.unknown': { en: 'Cannot check right now', hi: 'अभी जाँच नहीं हो पा रही' },
  'glance.verdict.setup': { en: 'Setting up your pump', hi: 'आपका पंप तैयार हो रहा है' },
  'glance.verdict.noReports': {
    en: 'Your first reports come after the next run',
    hi: 'आपकी पहली रिपोर्ट अगली बार चलने के बाद आएगी',
  },
  'glance.sentence.unknown': {
    en: 'We could not reach MDG. Check your internet and try again.',
    hi: 'MDG से जानकारी नहीं मिल पाई। इंटरनेट देखिए और फिर कोशिश कीजिए।',
  },

  // ── the three counts under the verdict ───────────────────────────────────
  'glance.count.needYou': { en: '{n} need you', hi: '{n} आपके लिए' },
  'glance.count.look': { en: '{n} need a look', hi: '{n} देखने के लिए' },
  'glance.count.done': { en: '{n} done for you today', hi: 'आज {n} आपके लिए हुए' },

  // ── Needs you rows ───────────────────────────────────────────────────────
  'glance.waiting.today': { en: 'came today', hi: 'आज आया' },
  'glance.waiting.one': { en: 'waiting 1 day', hi: '1 दिन से इंतज़ार में' },
  'glance.waiting.many': { en: 'waiting {n} days', hi: '{n} दिन से इंतज़ार में' },
  'glance.needs.kavachBack': { en: 'Kavach point sent back: {title}', hi: 'कवच का काम वापस आया: {title}' },
  'glance.needs.kavachLate': { en: 'Kavach point is late: {title}', hi: 'कवच का काम देर से है: {title}' },

  // ── Today's four numbers ─────────────────────────────────────────────────
  'glance.sales.line': { en: '{litres} sold {day}', hi: '{day} {litres} बिका' },
  'glance.delta.up': { en: '{n}% more than last {weekday}', hi: 'पिछले {weekday} से {n}% ज़्यादा' },
  'glance.delta.down': { en: '{n}% less than last {weekday}', hi: 'पिछले {weekday} से {n}% कम' },
  'glance.delta.same': { en: 'Same as last {weekday}', hi: 'पिछले {weekday} जितना ही' },
  'glance.sales.month': { en: 'This month so far {litres}', hi: 'इस महीने अब तक {litres}' },
  'glance.variation.inside': { en: '{fuel} is inside the limit', hi: '{fuel} सीमा के अंदर है' },
  'glance.variation.beyond': {
    en: '{fuel} is {litres} beyond the limit',
    hi: '{fuel} सीमा से {litres} बाहर है',
  },
  'glance.variation.room': {
    en: 'Room left {room} of {allowed} allowed',
    hi: 'बची गुंजाइश {room} (कुल {allowed})',
  },
  'glance.variation.days': {
    en: 'Inside the limit on {n} of the last {m} days',
    hi: 'पिछले {m} दिनों में {n} दिन सीमा के अंदर',
  },
  'glance.deposit.line': {
    en: 'Deposit {amount} to the oil company by {day}',
    hi: 'तेल कंपनी में {day} तक {amount} जमा करें',
  },
  'glance.deposit.left.one': { en: '1 day left', hi: '1 दिन बाकी' },
  'glance.deposit.left.many': { en: '{n} days left', hi: '{n} दिन बाकी' },
  'glance.deposit.last': { en: 'Last day is today', hi: 'आज आखिरी दिन है' },
  'glance.deposit.late.one': { en: '1 day late', hi: '1 दिन की देर' },
  'glance.deposit.late.many': { en: '{n} days late', hi: '{n} दिन की देर' },
  'glance.deposit.limit': {
    en: '{pct}% of credit limit used',
    hi: 'क्रेडिट सीमा का {pct}% इस्तेमाल हुआ',
  },
  'glance.kavach.score': { en: 'Inspection score {pct}%', hi: 'इंस्पेक्शन स्कोर {pct}%' },
  'glance.kavach.todo': {
    en: '{todo} to do today, {back} sent back',
    hi: 'आज {todo} काम बाकी, {back} वापस आए',
  },
  'glance.tile.deposit': { en: 'Deposit to the oil company', hi: 'तेल कंपनी में जमा' },
  'glance.tile.score': { en: 'Inspection score', hi: 'इंस्पेक्शन स्कोर' },

  // ── Pump now ─────────────────────────────────────────────────────────────
  'glance.stock.cover.one': {
    en: '{fuel} lasts {days} day, runs out {day}',
    hi: '{fuel} {days} दिन चलेगा, {day} को खत्म',
  },
  'glance.stock.cover.many': {
    en: '{fuel} lasts {days} days, runs out {day}',
    hi: '{fuel} {days} दिन चलेगा, {day} को खत्म',
  },
  'glance.stock.none': { en: 'No stock reading yet', hi: 'अभी स्टॉक की रीडिंग नहीं आई' },
  'glance.stock.old': { en: 'Reading from {time}, old', hi: '{time} की रीडिंग, पुरानी' },
  'glance.water.line': { en: '{done} of {total} checks done', hi: '{total} में से {done} जाँच हुईं' },
  'glance.water.missed': { en: '{n} missed', hi: '{n} छूट गईं' },
  'glance.supply.open': { en: 'Supply is open', hi: 'सप्लाई चालू है' },
  'glance.supply.stopped.one': {
    en: 'Supply is stopped, 1 condition pending',
    hi: 'सप्लाई रुकी है, 1 शर्त बाकी',
  },
  'glance.supply.stopped.many': {
    en: 'Supply is stopped, {n} conditions pending',
    hi: 'सप्लाई रुकी है, {n} शर्तें बाकी',
  },
  'glance.paper.days.one': { en: '{paper}: 1 day left', hi: '{paper}: 1 दिन बाकी' },
  'glance.paper.days.many': { en: '{paper}: {n} days left', hi: '{paper}: {n} दिन बाकी' },
  'glance.paper.expired': { en: '{paper} has expired', hi: '{paper} की मियाद खत्म हो गई' },
  'glance.tanker.order': { en: 'Order the tanker today', hi: 'आज टैंकर का ऑर्डर दें' },
  'glance.tanker.arrives': { en: 'Arrives {day}, {time}', hi: '{day} को {time} पर आएगा' },
  'glance.declaration.line.one': {
    en: 'Safety declaration: 1 day in a row',
    hi: 'सेफ्टी डिक्लेरेशन: लगातार 1 दिन',
  },
  'glance.declaration.line.many': {
    en: 'Safety declaration: {n} days in a row',
    hi: 'सेफ्टी डिक्लेरेशन: लगातार {n} दिन',
  },
  'glance.tanker.cover': { en: "Tomorrow's cover: {fuels}", hi: 'कल का स्टॉक: {fuels}' },
  'glance.tanker.coverFuel.one': { en: '{fuel} {days} day', hi: '{fuel} {days} दिन' },
  'glance.tanker.coverFuel.many': { en: '{fuel} {days} days', hi: '{fuel} {days} दिन' },
  'glance.report.missing': {
    en: "Yesterday's sales report has not come yet",
    hi: 'कल की बिक्री रिपोर्ट अभी नहीं आई',
  },

  // ── Coming up ────────────────────────────────────────────────────────────
  'glance.comingUp.deposit': { en: 'Deposit due {day}', hi: 'जमा की आखिरी तारीख {day}' },
  'glance.comingUp.paper': { en: '{paper} ends {day}', hi: '{paper} की मियाद {day} को खत्म' },
  'glance.comingUp.tanker': { en: 'Tanker arrives {day}', hi: 'टैंकर {day} को आएगा' },
  'glance.comingUp.declaration': { en: 'Declaration due {day}', hi: 'डिक्लेरेशन की तारीख {day}' },
  'glance.comingUp.kavach': { en: 'Kavach point opens {day}', hi: 'कवच का काम {day} को खुलेगा' },

  // ── Done for you ─────────────────────────────────────────────────────────
  'glance.done.one': { en: 'MDG did 1 thing today', hi: 'आज MDG ने आपका 1 काम किया' },
  'glance.done.many': { en: 'MDG did {n} things today', hi: 'आज MDG ने आपके {n} काम किए' },
  'glance.done.week': {
    en: 'MDG did {n} things for you this week',
    hi: 'इस हफ़्ते MDG ने आपके {n} काम किए',
  },

  // ── section titles ───────────────────────────────────────────────────────
  'glance.section.needs': { en: 'Needs you', hi: 'आपको करना है' },
  'glance.section.now': { en: 'Pump now', hi: 'अभी पंप का हाल' },
  'glance.section.coming': { en: 'Coming up', hi: 'आगे आने वाला' },
  'glance.section.done': { en: 'Done for you', hi: 'आपके लिए हुआ' },

  // ── what a service says about itself ─────────────────────────────────────
  'glance.svcState.working': { en: 'Working', hi: 'चल रही है' },
  'glance.svcState.needsYou': { en: 'Needs you', hi: 'आपका इंतज़ार' },
  'glance.svcState.look': { en: 'Look at this', hi: 'देखिए' },
  'glance.svcState.stopped': { en: 'Stopped, MDG is fixing', hi: 'ठप है, MDG देख रहा है' },
  'glance.svcState.late': { en: 'Late', hi: 'देर हो रही है' },
  'glance.svcState.ready': { en: 'Getting ready', hi: 'तैयार हो रही है' },
  'glance.svcState.paused': { en: 'Paused, ask MDG why', hi: 'अभी बंद है, MDG से पूछें' },
  'glance.svcState.onRequest': { en: 'When you ask', hi: 'ज़रूरत पर' },
  'glance.svcState.lastRan': { en: 'Last ran {time}', hi: 'आखिरी बार {time} चली' },
  'glance.svcState.next': { en: 'Next {time}', hi: 'अगली बार {time}' },
} satisfies Record<string, LangMessage>;

export const glanceHl: AreaHl<typeof glanceMessages> = {
  'glance.verdict.fine': 'Sab theek hai',
  'glance.verdict.needs.one': 'Aapke liye 1 kaam hai',
  'glance.verdict.needs.many': 'Aapke liye {n} kaam hain',
  'glance.verdict.look.one': 'Dhyaan dene ki 1 baat hai',
  'glance.verdict.look.many': 'Dhyaan dene ki {n} baatein hain',
  'glance.verdict.problem.one': '1 samasya hai',
  'glance.verdict.problem.many': '{n} samasyayein hain',
  'glance.verdict.unknown': 'Abhi jaanch nahi ho pa rahi',
  'glance.verdict.setup': 'Aapka pump taiyaar ho raha hai',
  'glance.verdict.noReports': 'Aapki pehli report agli baar chalne ke baad aayegi',
  'glance.sentence.unknown': 'MDG se jaankari nahi mil paayi. Internet dekhiye aur phir koshish kijiye.',

  'glance.count.needYou': '{n} aapke liye',
  'glance.count.look': '{n} dekhne ke liye',
  'glance.count.done': 'Aaj {n} aapke liye hue',

  'glance.waiting.today': 'aaj aaya',
  'glance.waiting.one': '1 din se intezaar mein',
  'glance.waiting.many': '{n} din se intezaar mein',
  'glance.needs.kavachBack': 'Kavach ka kaam wapas aaya: {title}',
  'glance.needs.kavachLate': 'Kavach ka kaam der se hai: {title}',

  'glance.sales.line': '{day} {litres} bika',
  'glance.delta.up': 'Pichhle {weekday} se {n}% zyada',
  'glance.delta.down': 'Pichhle {weekday} se {n}% kam',
  'glance.delta.same': 'Pichhle {weekday} jitna hi',
  'glance.sales.month': 'Is mahine ab tak {litres}',
  'glance.variation.inside': '{fuel} seema ke andar hai',
  'glance.variation.beyond': '{fuel} seema se {litres} bahar hai',
  'glance.variation.room': 'Bachi gunjaish {room} (kul {allowed})',
  'glance.variation.days': 'Pichhle {m} dinon mein {n} din seema ke andar',
  'glance.deposit.line': 'Tel company mein {day} tak {amount} jama karein',
  'glance.deposit.left.one': '1 din baaki',
  'glance.deposit.left.many': '{n} din baaki',
  'glance.deposit.last': 'Aaj aakhri din hai',
  'glance.deposit.late.one': '1 din ki der',
  'glance.deposit.late.many': '{n} din ki der',
  'glance.deposit.limit': 'Credit seema ka {pct}% istemaal hua',
  'glance.kavach.score': 'Inspection score {pct}%',
  'glance.kavach.todo': 'Aaj {todo} kaam baaki, {back} wapas aaye',
  'glance.tile.deposit': 'Tel company mein jama',
  'glance.tile.score': 'Inspection score',

  'glance.stock.cover.one': '{fuel} {days} din chalega, {day} ko khatam',
  'glance.stock.cover.many': '{fuel} {days} din chalega, {day} ko khatam',
  'glance.stock.none': 'Abhi stock ki reading nahi aayi',
  'glance.stock.old': '{time} ki reading, purani',
  'glance.water.line': '{total} mein se {done} jaanch hui',
  'glance.water.missed': '{n} chhoot gayi',
  'glance.supply.open': 'Supply chalu hai',
  'glance.supply.stopped.one': 'Supply ruki hai, 1 shart baaki',
  'glance.supply.stopped.many': 'Supply ruki hai, {n} shartein baaki',
  'glance.paper.days.one': '{paper}: 1 din baaki',
  'glance.paper.days.many': '{paper}: {n} din baaki',
  'glance.paper.expired': '{paper} ki miyaad khatam ho gayi',
  'glance.tanker.order': 'Aaj tanker ka order dein',
  'glance.tanker.arrives': '{day} ko {time} par aayega',
  'glance.declaration.line.one': 'Safety declaration: lagaataar 1 din',
  'glance.declaration.line.many': 'Safety declaration: lagaataar {n} din',
  'glance.tanker.cover': 'Kal ka stock: {fuels}',
  'glance.tanker.coverFuel.one': '{fuel} {days} din',
  'glance.tanker.coverFuel.many': '{fuel} {days} din',
  'glance.report.missing': 'Kal ki bikri report abhi nahi aayi',

  'glance.comingUp.deposit': 'Jama ki aakhri taareekh {day}',
  'glance.comingUp.paper': '{paper} ki miyaad {day} ko khatam',
  'glance.comingUp.tanker': 'Tanker {day} ko aayega',
  'glance.comingUp.declaration': 'Declaration ki taareekh {day}',
  'glance.comingUp.kavach': 'Kavach ka kaam {day} ko khulega',

  'glance.done.one': 'Aaj MDG ne aapka 1 kaam kiya',
  'glance.done.many': 'Aaj MDG ne aapke {n} kaam kiye',
  'glance.done.week': 'Is hafte MDG ne aapke {n} kaam kiye',

  'glance.section.needs': 'Aapko karna hai',
  'glance.section.now': 'Abhi pump ka haal',
  'glance.section.coming': 'Aage aane wala',
  'glance.section.done': 'Aapke liye hua',

  'glance.svcState.working': 'Chal rahi hai',
  'glance.svcState.needsYou': 'Aapka intezaar',
  'glance.svcState.look': 'Dekhiye',
  'glance.svcState.stopped': 'Thap hai, MDG dekh raha hai',
  'glance.svcState.late': 'Der ho rahi hai',
  'glance.svcState.ready': 'Taiyaar ho rahi hai',
  'glance.svcState.paused': 'Abhi band hai, MDG se poochhein',
  'glance.svcState.onRequest': 'Zaroorat par',
  'glance.svcState.lastRan': 'Aakhri baar {time} chali',
  'glance.svcState.next': 'Agli baar {time}',
};
