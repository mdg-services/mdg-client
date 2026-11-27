/**
 * The words of New Pump Guide (ADR 0058): the first-open choice screen, the
 * sign-up form for someone planning a pump, the planner's home, plan card and chat
 * strip, and the switch to Dealer Kavach.
 *
 * Kept in their own file so the feature's words sit together, and spread into the
 * app's one catalog (`i18n.ts` → `messages`, `i18n.hl.ts` → `hl`), so a missing key
 * is still a compile error there. The Hinglish below is typed against these keys
 * for the same reason.
 *
 * Wording rules: plain, short and warm; never "Sir"; nothing that promises or hints
 * that the reader will get a dealership; no pay button or payment link in the app
 * (the link goes on WhatsApp and SMS). The keys ending in `App` are the words the
 * phone apps show where no button is allowed: the state only, with no amount and no
 * word about where or how to pay (ADR 0022 §1, ADR 0058 §13.4).
 */
import type { LangMessage } from './i18n';

export const plannerMessages = {
  /* ── /welcome: the first screen on a new phone ──────────────────────── */
  'welcome.title': { en: 'Welcome to Dealer Kavach', hi: 'डीलर कवच में आपका स्वागत है' },
  'welcome.lead': { en: 'Tell us where you are.', hi: 'बताइए, आप कहाँ हैं।' },
  'welcome.runPump': { en: 'I run a petrol pump', hi: 'मेरा पेट्रोल पंप चल रहा है' },
  // Gender-neutral on purpose: the person opening the app may be a woman.
  'welcome.openPump': { en: 'I want to open a petrol pump', hi: 'मुझे पेट्रोल पंप खोलना है' },
  'welcome.haveAccount': { en: 'Already have an account?', hi: 'पहले से अकाउंट है?' },

  /* ── /register/new-pump: the planner's sign-up form ─────────────────── */
  'newPump.title': { en: 'Kavach Shuruaat', hi: 'कवच शुरुआत' },
  'newPump.intro': {
    en: 'Ask anything about opening a petrol pump: land, distances, licences, how dealers are chosen, building and opening. Answers come from the official rule books. ₹199 + GST a month.',
    hi: 'पेट्रोल पंप खोलने के बारे में कुछ भी पूछिए: ज़मीन, दूरी, लाइसेंस, डीलर कैसे चुने जाते हैं, बनाना और चालू करना। जवाब सरकारी और कंपनी की नियम-किताबों से आते हैं। ₹199 + GST महीना।',
  },
  // Inside the phone apps the outlet sign-up shows no price, so this one does not
  // either (ADR 0022 §1); the terms sheet still states it in full.
  'newPump.introApp': {
    en: 'Ask anything about opening a petrol pump: land, distances, licences, how dealers are chosen, building and opening. Answers come from the official rule books.',
    hi: 'पेट्रोल पंप खोलने के बारे में कुछ भी पूछिए: ज़मीन, दूरी, लाइसेंस, डीलर कैसे चुने जाते हैं, बनाना और चालू करना। जवाब सरकारी और कंपनी की नियम-किताबों से आते हैं।',
  },
  // The line on top when the form was opened from a website page (ADR 0059 §5): from a
  // petrol-pump guide page, or from any other page. "आने के लिए धन्यवाद" says the
  // same to a woman or a man.
  'newPump.fromGuide': {
    en: 'You came from our petrol-pump guide. Sign up, and ask your question in the chat.',
    hi: 'हमारी पेट्रोल पंप गाइड से यहाँ आने के लिए धन्यवाद। साइन अप कीजिए, फिर अपना सवाल चैट में पूछिए।',
  },
  'newPump.fromSite': {
    en: 'You came from our website. Sign up, and ask your question in the chat.',
    hi: 'हमारी वेबसाइट से यहाँ आने के लिए धन्यवाद। साइन अप कीजिए, फिर अपना सवाल चैट में पूछिए।',
  },
  // One tap back to the choice for an outlet owner the link brought here by mistake.
  'newPump.runningPump': { en: 'Already run a petrol pump? Tap here', hi: 'मेरा पंप चल रहा है? यहाँ दबाइए' },
  'newPump.state': { en: 'Your state', hi: 'आपका राज्य' },
  'newPump.statePick': { en: 'Choose your state', hi: 'अपना राज्य चुनिए' },
  'newPump.stateHint': {
    en: 'Rules differ by state, so answers fit yours better.',
    hi: 'हर राज्य के नियम अलग होते हैं, इससे जवाब आपके राज्य के हिसाब से मिलेंगे।',
  },
  'newPump.stateRequired': { en: 'Choose your state', hi: 'अपना राज्य चुनिए' },
  'newPump.district': { en: 'District or town', hi: 'ज़िला या शहर' },
  'newPump.districtPlaceholder': { en: 'e.g. Karnal', hi: 'जैसे करनाल' },
  'newPump.company': { en: 'Oil company you have in mind', hi: 'आप किस तेल कंपनी का पंप सोच रहे हैं' },
  'newPump.companyRequired': { en: 'Choose one', hi: 'एक चुनिए' },
  'newPump.company.iocl': { en: 'IndianOil', hi: 'इंडियनऑयल' },
  'newPump.company.bpcl': { en: 'BPCL', hi: 'BPCL' },
  'newPump.company.hpcl': { en: 'HPCL', hi: 'HPCL' },
  'newPump.company.other': { en: 'Other', hi: 'कोई और' },
  'newPump.company.undecided': { en: 'Not decided yet', hi: 'अभी तय नहीं' },
  'newPump.stage': { en: 'Where are you now?', hi: 'आप अभी किस कदम पर हैं?' },
  'newPump.stageRequired': { en: 'Choose one', hi: 'एक चुनिए' },
  'newPump.stage.exploring': { en: 'Just exploring', hi: 'अभी जानकारी ले रहे हैं' },
  'newPump.stage.applied': { en: 'Applied', hi: 'आवेदन कर दिया है' },
  'newPump.stage.selected': { en: 'Selected', hi: 'चयन हो गया है' },
  'newPump.stage.building': { en: 'Building the pump', hi: 'पंप बन रहा है' },
  'newPump.agreeLead': { en: 'I have read and agree to the', hi: 'मैंने' },
  'newPump.termsLink': { en: 'Kavach Shuruaat terms', hi: 'कवच शुरुआत की शर्तें' },
  'newPump.agreeTail': {
    en: ', and to messages about my plan on WhatsApp.',
    hi: ' पढ़ ली हैं और मैं उनसे सहमत हूँ, और प्लान के बारे में WhatsApp पर मैसेज पाने के लिए भी।',
  },
  'newPump.submit': { en: 'Create my account', hi: 'मेरा अकाउंट बनाइए' },
  'newPump.afterSubmit': {
    en: 'After this, the payment link for ₹199 + GST comes on your WhatsApp and SMS. Answers start once it is paid.',
    hi: 'इसके बाद ₹199 + GST का पेमेंट लिंक आपके WhatsApp और SMS पर आएगा। पेमेंट होते ही जवाब मिलने लगेंगे।',
  },
  // The app's version: no amount and no word about where the payment link goes.
  'newPump.afterSubmitApp': {
    en: 'Answers start once your plan is active.',
    hi: 'प्लान चालू होते ही जवाब मिलने लगेंगे।',
  },
  'newPump.termsTitle': { en: 'Kavach Shuruaat terms', hi: 'कवच शुरुआत की शर्तें' },

  /* ── the planner's app: home, plan card, chat strip ─────────────────── */
  'planner.title': { en: 'Kavach Shuruaat', hi: 'कवच शुरुआत' },
  'planner.planTitle': { en: 'Your plan', hi: 'आपका प्लान' },
  'planner.price': { en: '₹199 + GST a month (₹234.82)', hi: '₹199 + GST महीना (₹234.82)' },
  'planner.loading': { en: 'Checking your plan…', hi: 'आपका प्लान देख रहे हैं…' },
  'planner.loadFailed': {
    en: "Couldn't check your plan. Check your network and try again.",
    hi: 'प्लान नहीं देख पाए। नेटवर्क जांचें और फिर कोशिश करें।',
  },
  'planner.state.active': { en: 'Active', hi: 'चालू' },
  'planner.state.waiting': { en: 'Waiting for payment', hi: 'पेमेंट का इंतज़ार' },
  'planner.state.paused': { en: 'Paused', hi: 'रुका हुआ है' },
  'planner.state.stopped': { en: 'Stopped', hi: 'बंद है' },
  'planner.activeUntil': { en: 'Paid till {date}.', hi: '{date} तक का पेमेंट हो गया है।' },
  'planner.activeAutopay': {
    en: 'It renews by itself each month by autopay.',
    hi: 'ऑटोपे से हर महीने अपने-आप आगे बढ़ता है।',
  },
  'planner.activeEnds': {
    en: 'Autopay is off, so the plan ends after {date}.',
    hi: 'ऑटोपे बंद है, इसलिए प्लान {date} के बाद बंद हो जाएगा।',
  },
  // "Payment details", never "payment link": these lines show inside the phone apps too,
  // where words about a link to pay are the messaging the store rules forbid (ADR 0058
  // §13.4), and the chat quotes the same button words in every reader's screen.
  'planner.waitingBody': {
    en: 'Your plan starts once the first payment is done. The payment details are on your WhatsApp and SMS.',
    hi: 'पहला पेमेंट होते ही आपका प्लान शुरू हो जाएगा। पेमेंट की जानकारी आपके WhatsApp और SMS पर है।',
  },
  'planner.stoppedBody': {
    en: 'Your plan is not running. Tap Start again and fresh payment details come on your WhatsApp and SMS.',
    hi: 'आपका प्लान अभी बंद है। "फिर से शुरू करें" दबाइए, पेमेंट की नई जानकारी आपके WhatsApp और SMS पर आ जाएगी।',
  },
  // Lines with no button under them: the phone apps while the server's resend switch is
  // off. They say the state only, never where or how to pay (ADR 0022 §1).
  'planner.waitingBodyApp': {
    en: 'Your plan starts once the first payment is done.',
    hi: 'पहला पेमेंट होते ही आपका प्लान शुरू हो जाएगा।',
  },
  'planner.stoppedBodyApp': { en: 'Your plan is not running right now.', hi: 'आपका प्लान अभी बंद है।' },
  // A bill left unpaid for 7 days is closed by the server (ADR 0058 §13.3): "paused",
  // never "cancelled" or "overdue", so coming back feels easy.
  'planner.pausedBody': {
    en: 'Your plan is paused. Tap below and we will send the payment details again on WhatsApp and SMS.',
    hi: 'आपका प्लान अभी रुका हुआ है। नीचे दबाइए, हम पेमेंट की जानकारी फिर से WhatsApp और SMS पर भेज देंगे।',
  },
  'planner.pausedBodyApp': {
    en: 'Your plan is paused. Answers start again once the plan is renewed.',
    hi: 'आपका प्लान अभी रुका हुआ है। प्लान फिर से चालू होते ही जवाब मिलने लगेंगे।',
  },
  // A paid month that ran out: autopay stopped, or a renewal that did not go through.
  'planner.endedBody': {
    en: 'Your plan ended on {date}. Tap Start again and fresh payment details come on your WhatsApp and SMS.',
    hi: 'आपका प्लान {date} को पूरा हुआ। "फिर से शुरू करें" दबाइए, पेमेंट की नई जानकारी आपके WhatsApp और SMS पर आ जाएगी।',
  },
  'planner.endedBodyApp': { en: 'Your plan ended on {date}.', hi: 'आपका प्लान {date} को पूरा हुआ।' },
  'planner.resend': { en: 'Send the payment details again', hi: 'पेमेंट की जानकारी फिर से भेजें' },
  'planner.restart': { en: 'Start again', hi: 'फिर से शुरू करें' },
  'planner.getDetailsAgain': { en: 'Get the payment details again', hi: 'पेमेंट की जानकारी फिर से भेजें' },
  'planner.sending': { en: 'Sending…', hi: 'भेज रहे हैं…' },
  'planner.sentTo': { en: 'Sent on {where}.', hi: '{where} पर भेज दिया।' },
  'planner.sentPlain': {
    en: 'Sent. Look in your WhatsApp and SMS.',
    hi: 'भेज दिया। अपना WhatsApp और SMS देखिए।',
  },
  'planner.sentJustNow': {
    en: 'Sent just now. You can send it again in a few minutes.',
    hi: 'अभी भेजा है। कुछ मिनट बाद फिर भेज सकते हैं।',
  },
  'planner.sendFailed': { en: "Couldn't send. Please try again.", hi: 'नहीं भेज पाए। कृपया फिर कोशिश करें।' },
  'planner.and': { en: 'and', hi: 'और' },
  'planner.email': { en: 'email', hi: 'ईमेल' },
  'planner.askTitle': { en: 'Ask a question', hi: 'सवाल पूछिए' },
  'planner.askLead': {
    en: 'Ask anything about opening and running a petrol pump. The answer comes in your chat, read from the official rule books.',
    hi: 'पेट्रोल पंप खोलने और चलाने के बारे में कुछ भी पूछिए। जवाब आपकी चैट में आएगा, सरकारी और कंपनी की नियम-किताबों से।',
  },
  'planner.askButton': { en: 'Ask a question', hi: 'सवाल पूछिए' },
  'planner.examplesTitle': { en: 'For example', hi: 'जैसे' },
  'planner.example.distance': {
    en: 'How far from a highway junction must a pump be?',
    hi: 'हाईवे के चौराहे से पंप कितनी दूरी पर होना चाहिए?',
  },
  'planner.example.land': {
    en: 'How much land do I need for a pump?',
    hi: 'पंप के लिए कितनी ज़मीन चाहिए?',
  },
  'planner.example.licences': {
    en: 'Which licences and approvals do I need?',
    hi: 'कौन-कौन से लाइसेंस और मंज़ूरी चाहिए?',
  },
  'planner.example.selection': {
    en: 'How does the oil company choose a dealer?',
    hi: 'तेल कंपनी डीलर कैसे चुनती है?',
  },
  'planner.notAdvice': {
    en: 'Answers are general guidance from official documents, not legal advice or an approval. The oil company, PESO and the highway authority decide.',
    hi: 'जवाब सरकारी दस्तावेज़ों से दी गई आम जानकारी हैं, कानूनी सलाह या मंज़ूरी नहीं। फ़ैसला तेल कंपनी, PESO और हाईवे अथॉरिटी करते हैं।',
  },
  'planner.openTitle': { en: 'Is your pump open now?', hi: 'क्या आपका पंप चालू हो गया?' },
  'planner.openBody': {
    en: 'Switch this account to Dealer Kavach. You keep the same login and the same chat.',
    hi: 'इसी अकाउंट को डीलर कवच पर ले जाइए। लॉगिन और चैट वही रहेंगे।',
  },
  'planner.openButton': { en: 'Switch to Dealer Kavach', hi: 'डीलर कवच पर जाएँ' },
  'planner.bannerWaiting': {
    en: 'Your plan starts once the payment is done. The payment details are on WhatsApp and SMS.',
    hi: 'पेमेंट होते ही प्लान शुरू होगा। पेमेंट की जानकारी WhatsApp और SMS पर है।',
  },
  'planner.bannerStopped': {
    en: 'Your plan is stopped. Start it again to get answers.',
    hi: 'आपका प्लान बंद है। जवाब के लिए फिर से शुरू करें।',
  },
  'planner.bannerPaused': {
    en: 'Your plan is paused. We can send the payment details again on WhatsApp and SMS.',
    hi: 'आपका प्लान रुका हुआ है। पेमेंट की जानकारी फिर से WhatsApp और SMS पर भेज सकते हैं।',
  },
  // The strip inside the phone apps with no button: the state only (ADR 0022 §1).
  'planner.bannerWaitingApp': { en: 'Your plan starts once the payment is done.', hi: 'पेमेंट होते ही प्लान शुरू होगा।' },
  'planner.bannerPausedApp': { en: 'Your plan is paused.', hi: 'आपका प्लान रुका हुआ है।' },
  'planner.bannerStoppedApp': { en: 'Your plan is not running right now.', hi: 'आपका प्लान अभी बंद है।' },
  'planner.settingsRow': { en: 'Kavach Shuruaat', hi: 'कवच शुरुआत' },

  /* ── /switch-to-dealer-kavach ───────────────────────────────────────── */
  'switch.title': { en: 'Switch to Dealer Kavach', hi: 'डीलर कवच पर जाएँ' },
  'switch.lead': { en: 'Your pump is open. Here is what changes.', hi: 'आपका पंप चालू है। देखिए क्या बदलेगा।' },
  'switch.sameLogin': {
    en: 'You keep the same login and the same chat.',
    hi: 'लॉगिन और चैट वही रहेंगे।',
  },
  'switch.guideStops': {
    en: 'Kavach Shuruaat stops. Its ₹199 autopay is switched off.',
    hi: 'कवच शुरुआत बंद हो जाएगी। उसका ₹199 वाला ऑटोपे बंद हो जाएगा।',
  },
  'switch.dkPrice': {
    en: "Dealer Kavach is ₹3,000 + GST a month. If you are not happy with the first month, tell us by the end of that month and you get that month's payment back in full (once per dealer).",
    hi: 'डीलर कवच ₹3,000 + GST महीना है। पहला महीना पसंद न आए तो उसी महीने के आख़िर तक बताइए, उस महीने का पूरा पैसा वापस मिलेगा (हर डीलर को एक बार)।',
  },
  // Inside the phone apps: no amount just above a button that leads to a bill (ADR 0022
  // §1), as the Kavach Shuruaat sign-up does (`newPump.introApp`).
  'switch.dkPriceApp': {
    en: "Dealer Kavach is a monthly plan. If you are not happy with the first month, tell us by the end of that month and you get that month's payment back in full (once per dealer).",
    hi: 'डीलर कवच हर महीने का प्लान है। पहला महीना पसंद न आए तो उसी महीने के आख़िर तक बताइए, उस महीने का पूरा पैसा वापस मिलेगा (हर डीलर को एक बार)।',
  },
  'switch.billedInSetup': {
    en: 'The bill comes during setup, in your chat, step by step.',
    hi: 'बिल सेटअप के दौरान आपकी चैट में, एक-एक कदम करके आएगा।',
  },
  'switch.formTitle': { en: 'Your pump', hi: 'आपका पंप' },
  'switch.sapCode': { en: 'SAP code', hi: 'SAP कोड' },
  'switch.sapCodePlaceholder': { en: 'From the oil company', hi: 'तेल कंपनी से मिला कोड' },
  'switch.sapCodeRequired': { en: 'Enter the SAP code', hi: 'SAP कोड लिखिए' },
  'switch.pumpName': { en: 'Pump name', hi: 'पंप का नाम' },
  'switch.pumpNamePlaceholder': { en: 'e.g. Sai Petroleums', hi: 'जैसे साई पेट्रोलियम' },
  'switch.pumpNameRequired': { en: 'Enter the pump name', hi: 'पंप का नाम लिखिए' },
  'switch.siteType': { en: 'Site type', hi: 'साइट टाइप' },
  'switch.siteTypeRequired': { en: 'Choose A or B', hi: 'A या B चुनिए' },
  'switch.siteA': { en: 'Type A', hi: 'टाइप A' },
  'switch.siteB': { en: 'Type B', hi: 'टाइप B' },
  'switch.company': { en: 'Oil company', hi: 'तेल कंपनी' },
  'switch.companyRequired': { en: 'Choose the oil company', hi: 'तेल कंपनी चुनिए' },
  'switch.confirm': { en: 'Switch now', hi: 'अभी बदलें' },
  'switch.sapTaken': {
    en: 'This SAP code is already with Dealer Kavach. Check the code, or ask us in the chat.',
    hi: 'यह SAP कोड पहले से डीलर कवच में है। कोड जांचिए, या चैट में हमसे पूछिए।',
  },
  'switch.failed': {
    en: "Couldn't switch. Nothing has changed. Please try again.",
    hi: 'बदल नहीं पाए। कुछ नहीं बदला। कृपया फिर कोशिश करें।',
  },
  'newPump.closed': {
    en: 'Kavach Shuruaat is not open for sign-ups right now. Please try again later.',
    hi: 'कवच शुरुआत में अभी नए खाते नहीं खुल रहे। कृपया बाद में फिर कोशिश करें।',
  },
  'switch.notFinished': {
    en: 'The switch did not finish. Your Kavach Shuruaat autopay is already stopped. Press "Switch now" again in a minute.',
    hi: 'बदलाव पूरा नहीं हुआ। कवच शुरुआत का ऑटोपे बंद हो चुका है। एक मिनट बाद "अभी बदलें" फिर दबाइए।',
  },
  'switch.alreadySwitched': {
    en: 'This account has already moved to Dealer Kavach. Close the app and open it again.',
    hi: 'यह खाता पहले ही डीलर कवच पर जा चुका है। ऐप बंद करके फिर खोलिए।',
  },
} satisfies Record<string, LangMessage>;

export type PlannerMessageKey = keyof typeof plannerMessages;

/** Hinglish: Hindi in English letters, same `{placeholders}` as the English. */
export const plannerHl: Readonly<Record<PlannerMessageKey, string>> = {
  'welcome.title': 'Dealer Kavach mein aapka swagat hai',
  'welcome.lead': 'Bataiye, aap kahan hain.',
  'welcome.runPump': 'Mera petrol pump chal raha hai',
  'welcome.openPump': 'Mujhe petrol pump kholna hai',
  'welcome.haveAccount': 'Pehle se account hai?',

  'newPump.title': 'Kavach Shuruaat',
  'newPump.intro':
    'Petrol pump kholne ke baare mein kuch bhi poochhiye: zameen, doori, licence, dealer kaise chune jaate hain, banana aur chalu karna. Jawab sarkari aur company ki niyam-kitabon se aate hain. ₹199 + GST mahina.',
  'newPump.introApp':
    'Petrol pump kholne ke baare mein kuch bhi poochhiye: zameen, doori, licence, dealer kaise chune jaate hain, banana aur chalu karna. Jawab sarkari aur company ki niyam-kitabon se aate hain.',
  'newPump.fromGuide':
    'Hamari petrol pump guide se yahan aane ke liye dhanyavaad. Sign up kijiye, phir apna sawaal chat mein poochhiye.',
  'newPump.fromSite':
    'Hamari website se yahan aane ke liye dhanyavaad. Sign up kijiye, phir apna sawaal chat mein poochhiye.',
  'newPump.runningPump': 'Mera pump chal raha hai? Yahan dabaiye',
  'newPump.state': 'Aapka rajya',
  'newPump.statePick': 'Apna rajya chuniye',
  'newPump.stateHint': 'Har rajya ke niyam alag hote hain, isse jawab aapke rajya ke hisaab se milenge.',
  'newPump.stateRequired': 'Apna rajya chuniye',
  'newPump.district': 'Zila ya shehar',
  'newPump.districtPlaceholder': 'Jaise Karnal',
  'newPump.company': 'Aap kis oil company ka pump soch rahe hain',
  'newPump.companyRequired': 'Ek chuniye',
  'newPump.company.iocl': 'IndianOil',
  'newPump.company.bpcl': 'BPCL',
  'newPump.company.hpcl': 'HPCL',
  'newPump.company.other': 'Koi aur',
  'newPump.company.undecided': 'Abhi tay nahi',
  'newPump.stage': 'Aap abhi kis kadam par hain?',
  'newPump.stageRequired': 'Ek chuniye',
  'newPump.stage.exploring': 'Abhi jaankari le rahe hain',
  'newPump.stage.applied': 'Aavedan kar diya hai',
  'newPump.stage.selected': 'Chayan ho gaya hai',
  'newPump.stage.building': 'Pump ban raha hai',
  'newPump.agreeLead': 'Maine',
  'newPump.termsLink': 'Kavach Shuruaat ki shartein',
  'newPump.agreeTail':
    ' padh li hain aur main unse sahmat hoon, aur plan ke baare mein WhatsApp par message paane ke liye bhi.',
  'newPump.submit': 'Mera account banaiye',
  'newPump.afterSubmit':
    'Iske baad ₹199 + GST ka payment link aapke WhatsApp aur SMS par aayega. Payment hote hi jawab milne lagenge.',
  'newPump.afterSubmitApp': 'Plan chalu hote hi jawab milne lagenge.',
  'newPump.termsTitle': 'Kavach Shuruaat ki shartein',

  'planner.title': 'Kavach Shuruaat',
  'planner.planTitle': 'Aapka plan',
  'planner.price': '₹199 + GST mahina (₹234.82)',
  'planner.loading': 'Aapka plan dekh rahe hain…',
  'planner.loadFailed': 'Plan nahi dekh paaye. Network check karein aur phir koshish karein.',
  'planner.state.active': 'Chalu',
  'planner.state.waiting': 'Payment ka intezaar',
  'planner.state.paused': 'Ruka hua hai',
  'planner.state.stopped': 'Band hai',
  'planner.activeUntil': '{date} tak ka payment ho gaya hai.',
  'planner.activeAutopay': 'Autopay se har mahine apne-aap aage badhta hai.',
  'planner.activeEnds': 'Autopay band hai, isliye plan {date} ke baad band ho jayega.',
  'planner.waitingBody':
    'Pehla payment hote hi aapka plan shuru ho jayega. Payment ki jaankari aapke WhatsApp aur SMS par hai.',
  'planner.stoppedBody':
    'Aapka plan abhi band hai. "Phir se shuru karein" dabaiye, payment ki nayi jaankari aapke WhatsApp aur SMS par aa jayegi.',
  'planner.waitingBodyApp': 'Pehla payment hote hi aapka plan shuru ho jayega.',
  'planner.stoppedBodyApp': 'Aapka plan abhi band hai.',
  'planner.pausedBody':
    'Aapka plan abhi ruka hua hai. Neeche dabaiye, hum payment ki jaankari phir se WhatsApp aur SMS par bhej denge.',
  'planner.pausedBodyApp': 'Aapka plan abhi ruka hua hai. Plan phir se chalu hote hi jawab milne lagenge.',
  'planner.endedBody':
    'Aapka plan {date} ko poora hua. "Phir se shuru karein" dabaiye, payment ki nayi jaankari aapke WhatsApp aur SMS par aa jayegi.',
  'planner.endedBodyApp': 'Aapka plan {date} ko poora hua.',
  'planner.resend': 'Payment ki jaankari phir se bhejein',
  'planner.restart': 'Phir se shuru karein',
  'planner.getDetailsAgain': 'Payment ki jaankari phir se bhejein',
  'planner.sending': 'Bhej rahe hain…',
  'planner.sentTo': '{where} par bhej diya.',
  'planner.sentPlain': 'Bhej diya. Apna WhatsApp aur SMS dekhiye.',
  'planner.sentJustNow': 'Abhi bheja hai. Kuch minute baad phir bhej sakte hain.',
  'planner.sendFailed': 'Nahi bhej paaye. Kripya phir koshish karein.',
  'planner.and': 'aur',
  'planner.email': 'email',
  'planner.askTitle': 'Sawaal poochhiye',
  'planner.askLead':
    'Petrol pump kholne aur chalane ke baare mein kuch bhi poochhiye. Jawab aapki chat mein aayega, sarkari aur company ki niyam-kitabon se.',
  'planner.askButton': 'Sawaal poochhiye',
  'planner.examplesTitle': 'Jaise',
  'planner.example.distance': 'Highway ke chauraahe se pump kitni doori par hona chahiye?',
  'planner.example.land': 'Pump ke liye kitni zameen chahiye?',
  'planner.example.licences': 'Kaun-kaun se licence aur manzoori chahiye?',
  'planner.example.selection': 'Oil company dealer kaise chunti hai?',
  'planner.notAdvice':
    'Jawab sarkari dastavezon se di gayi aam jaankari hain, kanooni salah ya manzoori nahi. Faisla oil company, PESO aur highway authority karte hain.',
  'planner.openTitle': 'Kya aapka pump chalu ho gaya?',
  'planner.openBody': 'Isi account ko Dealer Kavach par le jaiye. Login aur chat wahi rahenge.',
  'planner.openButton': 'Dealer Kavach par jaayein',
  'planner.bannerWaiting': 'Payment hote hi plan shuru hoga. Payment ki jaankari WhatsApp aur SMS par hai.',
  'planner.bannerStopped': 'Aapka plan band hai. Jawab ke liye phir se shuru karein.',
  'planner.bannerPaused': 'Aapka plan ruka hua hai. Payment ki jaankari phir se WhatsApp aur SMS par bhej sakte hain.',
  'planner.bannerWaitingApp': 'Payment hote hi plan shuru hoga.',
  'planner.bannerPausedApp': 'Aapka plan ruka hua hai.',
  'planner.bannerStoppedApp': 'Aapka plan abhi band hai.',
  'planner.settingsRow': 'Kavach Shuruaat',

  'switch.title': 'Dealer Kavach par jaayein',
  'switch.lead': 'Aapka pump chalu hai. Dekhiye kya badlega.',
  'switch.sameLogin': 'Login aur chat wahi rahenge.',
  'switch.guideStops': 'Kavach Shuruaat band ho jayegi. Uska ₹199 wala autopay band ho jayega.',
  'switch.dkPrice':
    'Dealer Kavach ₹3,000 + GST mahina hai. Pehla mahina pasand na aaye to usi mahine ke aakhir tak bataiye, us mahine ka poora paisa wapas milega (har dealer ko ek baar).',
  'switch.dkPriceApp':
    'Dealer Kavach har mahine ka plan hai. Pehla mahina pasand na aaye to usi mahine ke aakhir tak bataiye, us mahine ka poora paisa wapas milega (har dealer ko ek baar).',
  'switch.billedInSetup': 'Bill setup ke dauran aapki chat mein, ek-ek kadam karke aayega.',
  'switch.formTitle': 'Aapka pump',
  'switch.sapCode': 'SAP code',
  'switch.sapCodePlaceholder': 'Oil company se mila code',
  'switch.sapCodeRequired': 'SAP code likhiye',
  'switch.pumpName': 'Pump ka naam',
  'switch.pumpNamePlaceholder': 'Jaise Sai Petroleums',
  'switch.pumpNameRequired': 'Pump ka naam likhiye',
  'switch.siteType': 'Site type',
  'switch.siteTypeRequired': 'A ya B chuniye',
  'switch.siteA': 'Type A',
  'switch.siteB': 'Type B',
  'switch.company': 'Oil company',
  'switch.companyRequired': 'Oil company chuniye',
  'switch.confirm': 'Abhi badlein',
  'switch.sapTaken': 'Yeh SAP code pehle se Dealer Kavach mein hai. Code check kijiye, ya chat mein humse poochhiye.',
  'switch.failed': 'Badal nahi paaye. Kuch nahi badla. Kripya phir koshish karein.',
  'newPump.closed': 'Kavach Shuruaat mein abhi naye account nahi khul rahe. Kripya baad mein phir koshish karein.',
  'switch.notFinished': 'Badlaav poora nahi hua. Kavach Shuruaat ka autopay band ho chuka hai. Ek minute baad "Abhi badlein" phir dabaiye.',
  'switch.alreadySwitched': 'Yeh account pehle hi Dealer Kavach par ja chuka hai. App band karke phir kholiye.',
};
