import type { LangMessage } from '../i18n';

import type { AreaHl } from './_types';

/**
 * The `firstrun` area's words (spec sections 4.9, 7 and 8): the register steps, the sign-in page, the
 * "which pump" screen, the waiting-for-approval card and the setup hero on Today. Keys start with
 * `first.` (see `AREA_PREFIXES` in `_types.ts`). Plural keys are `<key>.one` and `<key>.many`.
 *
 * The first-open language screen is NOT here on purpose: it shows each language in its OWN script and
 * is never translated, so a reader who cannot read the app's current language still finds theirs.
 *
 * Hindi has no English words except brand names (MDG, Kavach, WhatsApp, SAP). These are drafts: a native
 * Hindi reader reviews them before release (spec 11.4).
 */
export const firstrunMessages = {
  // ── Sign-in ──────────────────────────────────────────────────────────────
  'first.login.title': { en: 'Sign in to Dealer Kavach', hi: 'डीलर कवच में साइन इन करें' },
  'first.login.subtitle': {
    en: "See your pump's reports and what needs you today.",
    hi: 'अपने पंप की रिपोर्ट और आज का काम देखिए।',
  },
  // A short placeholder: the label above already says it all, and a long one is cut off at large text.
  'first.login.identifierPlaceholder': { en: 'Mobile or email', hi: 'मोबाइल या ईमेल' },
  'first.login.useEmail': { en: 'Use my email instead', hi: 'ईमेल से साइन इन करें' },
  'first.login.useMobile': { en: 'Use my mobile number instead', hi: 'मोबाइल नंबर से साइन इन करें' },

  // ── Which pump (an owner with more than one) ─────────────────────────────
  'first.pump.title': { en: 'Which pump?', hi: 'कौन सा पंप?' },
  'first.pump.intro': {
    en: 'You run more than one pump. Pick the one to open now. You can switch later.',
    hi: 'आपके एक से ज़्यादा पंप हैं। अभी जो खोलना है उसे चुनिए। बाद में बदल सकते हैं।',
  },
  'first.pump.open': { en: 'Open {code}', hi: '{code} खोलें' },
  'first.pump.loading': { en: 'Finding your pumps…', hi: 'आपके पंप ढूँढ रहे हैं…' },
  'first.pump.failed': {
    en: 'Could not list your pumps just now. You can carry on with the one you are in.',
    hi: 'अभी आपके पंप की सूची नहीं आई। जिसमें आप हैं, उसी में आगे बढ़ सकते हैं।',
  },
  'first.pump.carryOn': { en: 'Carry on', hi: 'आगे बढ़ें' },
  'first.pump.current': { en: 'The pump you signed in to', hi: 'जिसमें आपने साइन इन किया' },

  // ── Register: three steps ────────────────────────────────────────────────
  'first.reg.step1': { en: '1 of 3: you', hi: '3 में से 1: आप' },
  'first.reg.step2': { en: '2 of 3: your pump', hi: '3 में से 2: आपका पंप' },
  'first.reg.step3': { en: '3 of 3: password and terms', hi: '3 में से 3: पासवर्ड और शर्तें' },
  // One line under each step title: only what that step asks (the password is step 3's).
  'first.reg.intro1': {
    en: 'Tell us your name and mobile number.',
    hi: 'अपना नाम और मोबाइल नंबर बताइए।',
  },
  'first.reg.intro2': {
    en: 'Tell us about your pump.',
    hi: 'अपने पंप के बारे में बताइए।',
  },
  'first.reg.intro3': {
    en: 'Choose a password. You will sign in with your mobile number and this password.',
    hi: 'अपना पासवर्ड चुनिए। आप अपने मोबाइल नंबर और इसी पासवर्ड से साइन इन करेंगे।',
  },
  'first.reg.progress': { en: 'Step {n} of 3', hi: '3 में से चरण {n}' },
  'first.reg.next': { en: 'Next', hi: 'आगे बढ़ें' },
  'first.reg.prev': { en: 'Back', hi: 'पीछे जाएँ' },
  'first.reg.prevStep': { en: 'Previous step', hi: 'पिछला चरण' },
  'first.reg.sapHint': {
    en: "The user ID you sign in with on your oil company's dealer portal.",
    hi: 'तेल कंपनी के डीलर पोर्टल पर साइन इन करने की आपकी यूज़र आईडी।',
  },

  // ── Register: waiting for approval ───────────────────────────────────────
  'first.wait.received': { en: 'Received at {time}', hi: '{time} पर मिला' },
  'first.wait.nextTitle': { en: 'What happens next', hi: 'आगे क्या होगा' },
  'first.wait.next1': {
    en: 'A person at MDG checks your details.',
    hi: 'MDG का एक व्यक्ति आपकी जानकारी जाँचेगा।',
  },
  'first.wait.next2': {
    en: 'We send you a WhatsApp message when your account is ready.',
    hi: 'आपका खाता तैयार होते ही हम आपको WhatsApp पर संदेश भेजेंगे।',
  },
  'first.wait.next3': {
    en: 'Then sign in with your mobile number and the password you just chose.',
    hi: 'फिर अपने मोबाइल नंबर और अभी चुने पासवर्ड से साइन इन करें।',
  },
  'first.wait.callTitle': { en: 'Want to ask something? Call MDG, it is free.', hi: 'कुछ पूछना है? MDG को फ़ोन कीजिए, कॉल मुफ़्त है।' },
  'first.wait.call': { en: 'Call MDG', hi: 'MDG को फ़ोन करें' },

  // ── The setup hero on Today ──────────────────────────────────────────────
  'first.setup.title': { en: 'Setting up your pump', hi: 'आपका पंप तैयार हो रहा है' },
  'first.setup.turn.dealer': { en: 'Your turn', hi: 'आपकी बारी' },
  'first.setup.turn.mdg': { en: "MDG's turn", hi: 'MDG की बारी' },
  'first.setup.turn.owner': { en: "Owner's turn", hi: 'मालिक की बारी' },
  'first.setup.turn.done': { en: 'All done', hi: 'सब हो गया' },
  'first.setup.managerNote': {
    en: 'Your owner fills in these steps. You can see how far it has got.',
    hi: 'ये कदम मालिक भरते हैं। आप देख सकते हैं कि कहाँ तक हुआ है।',
  },

  'first.setup.state.done': { en: 'Done', hi: 'हो गया' },
  'first.setup.state.now': { en: 'Now', hi: 'अभी' },
  'first.setup.state.mdgNow': { en: 'MDG is on it', hi: 'MDG कर रहा है' },
  'first.setup.state.later': { en: 'Later', hi: 'बाद में' },
  'first.setup.state.skipped': { en: 'Not needed', hi: 'ज़रूरत नहीं' },

  'first.setup.step.company': { en: 'Oil company', hi: 'तेल कंपनी' },
  'first.setup.step.billing': { en: 'Bill name and address', hi: 'बिल का नाम और पता' },
  'first.setup.step.payment': { en: 'Your first bill', hi: 'आपका पहला बिल' },
  'first.setup.step.logins': { en: 'Portal logins', hi: 'पोर्टल के लॉगिन' },
  'first.setup.step.start': { en: 'MDG starts your services', hi: 'MDG आपकी सेवाएँ शुरू करता है' },

  'first.setup.why.company': {
    en: 'It decides which portals MDG reads for you.',
    hi: 'इसी से तय होता है कि MDG आपके लिए कौन से पोर्टल देखेगा।',
  },
  'first.setup.why.billing': {
    en: 'Who the bill is made out to.',
    hi: 'बिल किसके नाम बनेगा।',
  },
  'first.setup.why.payment': {
    en: 'MDG prepares it and sends it to you.',
    hi: 'MDG इसे तैयार करके आपको भेजता है।',
  },
  'first.setup.why.logins': {
    en: 'So MDG can read your portal reports for you.',
    hi: 'ताकि MDG आपके पोर्टल की रिपोर्ट आपके लिए पढ़ सके।',
  },
  'first.setup.why.start': {
    en: 'The last step is MDG switching your services on.',
    hi: 'आखिरी कदम में MDG आपकी सेवाएँ चालू करता है।',
  },

  'first.setup.billAnswer': {
    en: '{name}, bill due {date}',
    hi: '{name}, बिल की आखिरी तारीख़ {date}',
  },
  'first.setup.billDue': { en: 'Your first bill is due on {date}.', hi: 'आपके पहले बिल की आखिरी तारीख़ {date} है।' },
  'first.setup.loginSaved': { en: '{portal} saved on {date}', hi: '{portal} {date} को सेव हुआ' },
  'first.setup.loginSavedNoDate': { en: '{portal} saved', hi: '{portal} सेव हो गया' },
  'first.setup.loginSavedMdg': {
    en: "{portal} saved by MDG's team on {date}",
    hi: '{portal} MDG की टीम ने {date} को सेव किया',
  },
  'first.setup.loginSavedMdgNoDate': {
    en: "{portal} saved by MDG's team",
    hi: '{portal} MDG की टीम ने सेव किया',
  },

  'first.setup.needsYou': { en: 'Needs you', hi: 'आपको करना है' },
  'first.setup.refused': {
    en: '{portal} login was refused on {date}. Please update it.',
    hi: '{portal} का लॉगिन {date} को नहीं चला। कृपया उसे नया भरिए।',
  },
  'first.setup.refusedNoDate': {
    en: '{portal} login was refused. Please update it.',
    hi: '{portal} का लॉगिन नहीं चला। कृपया उसे नया भरिए।',
  },
  'first.setup.refusedAction': { en: 'Update login', hi: 'लॉगिन बदलें' },
  'first.setup.refusedClose': { en: 'Close', hi: 'बंद करें' },

  'first.setup.otherCompany': { en: 'Pump with another company?', hi: 'पंप किसी और कंपनी का है?' },
  'first.setup.otherCompanyDraft': {
    en: 'My pump is with another oil company: ',
    hi: 'मेरा पंप दूसरी तेल कंपनी का है: ',
  },

  'first.setup.ghostTitle': {
    en: 'Your numbers will appear here after setup',
    hi: 'सेटअप के बाद आपके आँकड़े यहाँ दिखेंगे',
  },
  'first.setup.ghostWait': { en: 'after setup', hi: 'सेटअप के बाद' },
  'first.setup.slot.sales': { en: 'Sales', hi: 'बिक्री' },
  'first.setup.slot.variation': { en: 'Variation', hi: 'घट-बढ़' },
  'first.setup.slot.deposit': { en: 'Deposit to the oil company', hi: 'तेल कंपनी में जमा' },
  'first.setup.slot.score': { en: 'Inspection score', hi: 'इंस्पेक्शन स्कोर' },
} satisfies Record<string, LangMessage>;

export const firstrunHl: AreaHl<typeof firstrunMessages> = {
  'first.login.title': 'Dealer Kavach mein sign in karein',
  'first.login.subtitle': 'Apne pump ki report aur aaj ka kaam dekhiye.',
  'first.login.identifierPlaceholder': 'Mobile ya email',
  'first.login.useEmail': 'Email se sign in karein',
  'first.login.useMobile': 'Mobile number se sign in karein',

  'first.pump.title': 'Kaun sa pump?',
  'first.pump.intro':
    'Aapke ek se zyada pump hain. Abhi jo kholna hai use chuniye. Baad mein badal sakte hain.',
  'first.pump.open': '{code} kholein',
  'first.pump.loading': 'Aapke pump dhoondh rahe hain…',
  'first.pump.failed':
    'Abhi aapke pump ki list nahi aayi. Jisme aap hain, usi mein aage badh sakte hain.',
  'first.pump.carryOn': 'Aage badhein',
  'first.pump.current': 'Jisme aapne sign in kiya',

  'first.reg.step1': '3 mein se 1: aap',
  'first.reg.step2': '3 mein se 2: aapka pump',
  'first.reg.step3': '3 mein se 3: password aur shartein',
  'first.reg.intro1': 'Apna naam aur mobile number bataiye.',
  'first.reg.intro2': 'Apne pump ke baare mein bataiye.',
  'first.reg.intro3':
    'Apna password chuniye. Aap apne mobile number aur isi password se sign in karenge.',
  'first.reg.progress': '3 mein se step {n}',
  'first.reg.next': 'Aage badhein',
  'first.reg.prev': 'Peeche jaayein',
  'first.reg.prevStep': 'Pichhla step',
  'first.reg.sapHint': 'Tel company ke dealer portal par sign in karne ki aapki user ID.',

  'first.wait.received': '{time} par mila',
  'first.wait.nextTitle': 'Aage kya hoga',
  'first.wait.next1': 'MDG ka ek vyakti aapki jaankari jaanchega.',
  'first.wait.next2': 'Aapka khata taiyaar hote hi hum aapko WhatsApp par sandesh bhejenge.',
  'first.wait.next3':
    'Phir apne mobile number aur abhi chune password se sign in karein.',
  'first.wait.callTitle': 'Kuch poochhna hai? MDG ko phone kijiye, call muft hai.',
  'first.wait.call': 'MDG ko phone karein',

  'first.setup.title': 'Aapka pump taiyaar ho raha hai',
  'first.setup.turn.dealer': 'Aapki baari',
  'first.setup.turn.mdg': 'MDG ki baari',
  'first.setup.turn.owner': 'Malik ki baari',
  'first.setup.turn.done': 'Sab ho gaya',
  'first.setup.managerNote':
    'Ye kadam malik bharte hain. Aap dekh sakte hain ki kahan tak hua hai.',

  'first.setup.state.done': 'Ho gaya',
  'first.setup.state.now': 'Abhi',
  'first.setup.state.mdgNow': 'MDG kar raha hai',
  'first.setup.state.later': 'Baad mein',
  'first.setup.state.skipped': 'Zaroorat nahi',

  'first.setup.step.company': 'Tel company',
  'first.setup.step.billing': 'Bill ka naam aur pata',
  'first.setup.step.payment': 'Aapka pehla bill',
  'first.setup.step.logins': 'Portal ke login',
  'first.setup.step.start': 'MDG aapki services shuru karta hai',

  'first.setup.why.company': 'Isi se tay hota hai ki MDG aapke liye kaun se portal dekhega.',
  'first.setup.why.billing': 'Bill kiske naam banega.',
  'first.setup.why.payment': 'MDG ise taiyaar karke aapko bhejta hai.',
  'first.setup.why.logins': 'Taaki MDG aapke portal ki report aapke liye padh sake.',
  'first.setup.why.start': 'Aakhri kadam mein MDG aapki services chalu karta hai.',

  'first.setup.billAnswer': '{name}, bill ki aakhri taareekh {date}',
  'first.setup.billDue': 'Aapke pehle bill ki aakhri taareekh {date} hai.',
  'first.setup.loginSaved': '{portal} {date} ko save hua',
  'first.setup.loginSavedNoDate': '{portal} save ho gaya',
  'first.setup.loginSavedMdg': '{portal} MDG ki team ne {date} ko save kiya',
  'first.setup.loginSavedMdgNoDate': '{portal} MDG ki team ne save kiya',

  'first.setup.needsYou': 'Aapko karna hai',
  'first.setup.refused': '{portal} ka login {date} ko nahi chala. Kripya use naya bhariye.',
  'first.setup.refusedNoDate': '{portal} ka login nahi chala. Kripya use naya bhariye.',
  'first.setup.refusedAction': 'Login badlein',
  'first.setup.refusedClose': 'Band karein',

  'first.setup.otherCompany': 'Pump kisi aur company ka hai?',
  'first.setup.otherCompanyDraft': 'Mera pump dusri tel company ka hai: ',

  'first.setup.ghostTitle': 'Setup ke baad aapke aankde yahan dikhenge',
  'first.setup.ghostWait': 'setup ke baad',
  'first.setup.slot.sales': 'Bikri',
  'first.setup.slot.variation': 'Ghat-badh',
  'first.setup.slot.deposit': 'Tel company mein jama',
  'first.setup.slot.score': 'Inspection score',
};
