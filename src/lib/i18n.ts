import * as React from 'react';

import { useLangStore, type Lang } from '@/store/lang';

/**
 * Tiny, framework-free i18n for the dealer app (ADR 0008).
 *
 * Two mechanisms, one convention:
 *  - `t(key, vars?)` for UI strings we author — one typed message per concept.
 *  - `pick(lang, en, hi)` for bilingual DATA already shipped as `labelEn`/`labelHi`
 *    sibling fields on the shared contracts.
 *
 * Keys are dot-namespaced and every value is `{ en, hi }`. The catalog is a
 * single typed object so a MISSING KEY IS A COMPILE ERROR (`t('nav.nope')` fails
 * typechecking). Interpolation uses `{var}` placeholders.
 */
export interface LangMessage {
  en: string;
  hi: string;
}

export const messages = {
  /* ── common ─────────────────────────────────────────────────────────── */
  'common.loading': { en: 'Loading…', hi: 'लोड हो रहा है…' },
  'common.done': { en: 'Done', hi: 'हो गया' },
  'common.cancel': { en: 'Cancel', hi: 'रद्द करें' },
  'common.required': { en: 'Required', hi: 'ज़रूरी है' },
  'common.dismiss': { en: 'Dismiss', hi: 'बंद करें' },
  'common.networkError': {
    en: 'Something went wrong. Please check your network and try again.',
    hi: 'कुछ गड़बड़ हो गई। कृपया अपना नेटवर्क जांचें और फिर से कोशिश करें।',
  },
  'common.helpDesc': {
    en: "Please check your network and try again. If it keeps happening, send us a message in Chat and we'll help.",
    hi: 'कृपया अपना नेटवर्क जांचें और फिर कोशिश करें। अगर बार-बार हो, तो चैट में हमें लिखें, हम मदद करेंगे।',
  },
  'common.retry': { en: 'Try again', hi: 'फिर कोशिश करें' },
  'common.back': { en: 'Back', hi: 'वापस' },
  'common.moreOptions': { en: 'More options', hi: 'और विकल्प' },
  'common.loadFailed': {
    en: "Couldn't load this. Check your network and try again.",
    hi: 'यह लोड नहीं हो सका। नेटवर्क जांचें और फिर कोशिश करें।',
  },

  /* ── app ────────────────────────────────────────────────────────────── */
  'app.brand': { en: 'Dealer Kavach', hi: 'डीलर कवच' },
  'app.stillLoading': {
    en: 'Still loading — the connection is slow.',
    hi: 'अभी लोड हो रहा है — नेटवर्क धीमा है।',
  },

  /* ── auth / login ───────────────────────────────────────────────────── */
  'auth.welcome': { en: 'Welcome back', hi: 'फिर से स्वागत है' },
  'auth.subtitle': {
    en: 'Sign in to chat with the MDG team.',
    hi: 'MDG टीम से बात करने के लिए साइन इन करें।',
  },
  'auth.email': { en: 'Email', hi: 'ईमेल' },
  // One box for both: a dealer's mobile number is the name most of them sign in
  // with, an email still works.
  'auth.identifier': { en: 'Mobile number or email', hi: 'मोबाइल नंबर या ईमेल' },
  'auth.identifierPlaceholder': {
    en: 'Your mobile number or email',
    hi: 'अपना मोबाइल नंबर या ईमेल लिखिए',
  },
  'auth.identifierRequired': {
    en: 'Enter your mobile number or email',
    hi: 'अपना मोबाइल नंबर या ईमेल भरिए',
  },
  'auth.identifierInvalid': {
    en: 'Enter a 10-digit mobile number or a valid email',
    hi: '10 अंकों का मोबाइल नंबर या सही ईमेल लिखिए',
  },
  'auth.password': { en: 'Password', hi: 'पासवर्ड' },
  'auth.showPassword': { en: 'Show password', hi: 'पासवर्ड दिखाएं' },
  'auth.hidePassword': { en: 'Hide password', hi: 'पासवर्ड छुपाएं' },
  'auth.emailInvalid': { en: 'Enter a valid email', hi: 'सही ईमेल भरें' },
  'auth.passwordRequired': {
    en: 'Enter your password',
    hi: 'अपना पासवर्ड भरें',
  },
  'auth.signIn': { en: 'Sign in', hi: 'साइन इन करें' },
  // A dealer chooses their own password when they register, and signs in with
  // it: at once from the app when the account opens straight away.
  'auth.noLogin': {
    en: 'No account yet? Register your pump and choose your own password. Then sign in with your mobile number and that password.',
    hi: 'अभी खाता नहीं है? अपना पंप रजिस्टर कीजिए और अपना पासवर्ड चुनिए। फिर अपने मोबाइल नंबर और उसी पासवर्ड से साइन इन कीजिए।',
  },
  'auth.register': { en: 'Register your pump', hi: 'अपना पंप रजिस्टर करें' },
  'auth.loginFailed': {
    en: "That mobile number, email or password didn't work. Try again, or tap \"Forgot your password?\".",
    hi: 'यह मोबाइल नंबर, ईमेल या पासवर्ड सही नहीं है। फिर कोशिश कीजिए, या "पासवर्ड भूल गए?" दबाइए।',
  },
  // A mobile number two accounts share (one owner, two pumps): only an email can
  // tell them apart.
  'auth.multipleAccounts': {
    en: 'This number has more than one account. Sign in with your email.',
    hi: 'इस नंबर पर एक से ज़्यादा खाते हैं। अपने ईमेल से साइन इन कीजिए।',
  },
  'auth.tooManyTries': {
    en: 'Too many tries. Please wait a little and try again.',
    hi: 'बहुत बार कोशिश हो गई। थोड़ी देर बाद फिर कोशिश कीजिए।',
  },
  'auth.accountInactive': {
    en: 'This account is not active right now. Please contact the MDG team.',
    hi: 'यह खाता अभी चालू नहीं है। MDG की टीम से संपर्क कीजिए।',
  },
  /* ── forgot password ─────────────────────────────────────────────────── */
  // A code on WhatsApp or by email, then a new password. "Ask the team to call me"
  // is what is left of the old way: the whole sheet while no code can be sent, a
  // small link under every step otherwise.
  'auth.forgot': { en: 'Forgot your password?', hi: 'पासवर्ड भूल गए?' },
  'auth.forgotTitle': { en: 'Forgot your password?', hi: 'पासवर्ड भूल गए?' },
  'auth.forgotIntro': {
    en: 'Type your mobile number or email. The MDG team will call you on your registered number.',
    hi: 'अपना मोबाइल नंबर या ईमेल लिखिए। MDG की टीम आपके रजिस्टर्ड नंबर पर कॉल करेगी।',
  },
  'auth.forgotIntroCode': {
    en: 'Type your mobile number or email. We will send you a code to choose a new password.',
    hi: 'अपना मोबाइल नंबर या ईमेल लिखिए। नया पासवर्ड बनाने के लिए हम आपको एक कोड भेजेंगे।',
  },
  'auth.forgotSend': { en: 'Send', hi: 'भेजिए' },
  'auth.forgotContinue': { en: 'Continue', hi: 'आगे बढ़िए' },
  'auth.forgotDone': { en: 'The MDG team will call you.', hi: 'MDG की टीम आपको कॉल करेगी।' },
  'auth.forgotOk': { en: 'OK', hi: 'ठीक है' },
  'auth.resetWhere': { en: 'Where should we send the code?', hi: 'कोड कहाँ भेजें?' },
  'auth.resetByWhatsapp': { en: 'On WhatsApp', hi: 'WhatsApp पर' },
  'auth.resetByEmail': { en: 'By email', hi: 'ईमेल पर' },
  // The same words whether or not the number or email is on an account.
  'auth.resetSent': {
    en: 'If this account exists, a code has been sent.',
    hi: 'अगर यह खाता है तो कोड भेज दिया गया है।',
  },
  'auth.resetCode': { en: 'The 6-digit code', hi: '6 अंकों का कोड' },
  'auth.resetCodeShort': { en: 'Enter all 6 digits', hi: 'कोड के सभी 6 अंक भरिए' },
  'auth.resetCodeInvalid': {
    en: 'That code is wrong or has expired.',
    hi: 'कोड सही नहीं है या पुराना हो गया।',
  },
  'auth.resetSendAgain': { en: 'Send again', hi: 'फिर से भेजिए' },
  'auth.resetSendAgainIn': { en: 'Send again in {n} s', hi: '{n} सेकंड में फिर से भेज सकेंगे' },
  'auth.resetNoCode': {
    en: 'No code? Ask the team to call you',
    hi: 'कोड नहीं मिला? टीम से कॉल के लिए कहिए',
  },
  'auth.resetNewIntro': { en: 'Now choose your new password.', hi: 'अब अपना नया पासवर्ड चुनिए।' },
  'auth.resetSave': { en: 'Save new password', hi: 'नया पासवर्ड सेव करें' },
  'auth.resetDone': {
    en: 'Your new password is set. Sign in now.',
    hi: 'नया पासवर्ड बन गया। अब साइन इन कीजिए।',
  },
  'auth.resetExpired': {
    en: 'This reset has expired. Please start again.',
    hi: 'यह रीसेट पुराना हो गया है। कृपया फिर से शुरू कीजिए।',
  },
  /* ── the screen after signing in with a temporary password ───────────── */
  'auth.forcedTitle': { en: 'Create a new password', hi: 'नया पासवर्ड बनाइए' },
  'auth.forcedIntro': {
    en: 'You signed in with a password the MDG team gave you. Before you go on, choose a password of your own.',
    hi: 'आपने MDG की टीम का दिया हुआ पासवर्ड इस्तेमाल किया है। आगे बढ़ने से पहले अपना खुद का पासवर्ड बनाइए।',
  },
  'auth.forcedCurrent': { en: 'The password you were given', hi: 'जो पासवर्ड आपको मिला था' },
  'auth.forcedConfirm': { en: 'New password again', hi: 'नया पासवर्ड दोबारा' },
  'auth.forcedSave': { en: 'Save and continue', hi: 'सेव करके आगे बढ़िए' },
  'auth.forcedSignOut': { en: 'Sign out', hi: 'साइन आउट' },
  'auth.forcedCurrentWrong': {
    en: "That is not the password you were given. Check it and try again.",
    hi: 'यह वो पासवर्ड नहीं है जो आपको मिला था। जाँचकर फिर कोशिश कीजिए।',
  },
  'auth.forcedMustDiffer': {
    en: 'Choose a password different from the one you were given',
    hi: 'जो पासवर्ड मिला था, उससे अलग पासवर्ड चुनिए',
  },

  /* ── register (the website's enrolment form, inside the app) ─────────── */
  // The Hindi wording follows the website's enrolment page word for word where
  // the two say the same thing, so a dealer who has seen one recognises the other.
  'register.title': { en: 'Register your pump', hi: 'अपना पंप रजिस्टर करें' },
  'register.intro': {
    en: 'Fill in your details and choose a password. You sign in with your mobile number and that password.',
    hi: 'अपनी जानकारी भरिए और अपना पासवर्ड चुनिए। आप अपने मोबाइल नंबर और उसी पासवर्ड से साइन इन करेंगे।',
  },
  // On top of Register, which is the first screen on a phone nobody has signed in on.
  'register.alreadyRegistered': { en: 'Already registered?', hi: 'पहले से रजिस्टर्ड हैं?' },
  'register.back': { en: 'Back to sign in', hi: 'साइन इन पर वापस' },
  'register.optional': { en: '(optional)', hi: '(ज़रूरी नहीं)' },
  'register.name': { en: 'Your name', hi: 'आपका नाम' },
  'register.namePlaceholder': { en: 'Ramesh Kumar', hi: 'रमेश कुमार' },
  'register.mobile': { en: 'Your mobile', hi: 'आपका मोबाइल' },
  'register.mobilePlaceholder': { en: 'Your mobile number', hi: 'अपना मोबाइल नंबर' },
  // The password the dealer chooses here is what they sign in with, together with
  // the mobile number above it.
  'register.password': { en: 'Choose a password', hi: 'पासवर्ड चुनिए' },
  'register.passwordHint': {
    en: 'At least 8 characters. You will sign in with your mobile number and this password.',
    hi: 'कम से कम 8 अक्षर। इसी पासवर्ड और अपने मोबाइल नंबर से साइन इन करेंगे।',
  },
  'register.confirmPassword': { en: 'Password again', hi: 'पासवर्ड दोबारा' },
  'register.passwordTooLong': {
    en: 'Use at most 200 characters',
    hi: 'ज़्यादा से ज़्यादा 200 अक्षर',
  },
  'register.email': { en: 'Your email', hi: 'आपका ईमेल' },
  'register.emailPlaceholder': { en: 'Enter your email', hi: 'अपना ईमेल लिखिए' },
  'register.siteType': { en: 'Site type', hi: 'साइट का प्रकार' },
  'register.pumpName': { en: 'Pump name', hi: 'पंप का नाम' },
  'register.pumpNamePlaceholder': { en: "Your pump's name", hi: 'अपने पंप का नाम' },
  'register.sapCode': { en: 'SAP code', hi: 'SAP कोड' },
  'register.sapCodePlaceholder': { en: 'Your SAP code', hi: 'अपना SAP कोड' },
  // The link sits inside the sentence, and in Hindi the verb lands after it,
  // so the tail carries the verb as well as the full stop.
  // The one tick also covers WhatsApp messages about the account: the approval
  // message and the bill reach the dealer there.
  'register.agreeLead': { en: 'I have read and accept the', hi: 'मैंने' },
  'register.termsLink': { en: 'Terms & Conditions', hi: 'नियम व शर्तें' },
  'register.agreeTail': {
    en: ', and I agree to get messages about my account on WhatsApp.',
    hi: ' पढ़ ली हैं और मुझे मंज़ूर हैं, और मैं अपने खाते से जुड़े संदेश WhatsApp पर पाने के लिए सहमत हूँ।',
  },
  // The link inside the sentence drops out of the box's spoken name, so the
  // box carries the whole sentence itself.
  'register.agreeAria': {
    en: 'I accept the Terms and Conditions and agree to get messages about my account on WhatsApp',
    hi: 'मैं नियम व शर्तें मानता हूँ और अपने खाते से जुड़े संदेश WhatsApp पर पाने के लिए सहमत हूँ',
  },
  'register.nameRequired': { en: 'Enter your name', hi: 'अपना नाम भरिए' },
  'register.mobileInvalid': {
    en: 'Enter a 10-digit mobile number that starts with 6, 7, 8 or 9',
    hi: '10 अंकों का मोबाइल नंबर लिखिए, जो 6, 7, 8 या 9 से शुरू हो',
  },
  'register.siteTypeRequired': {
    en: 'Choose Type A or Type B',
    hi: 'Type A या Type B चुनिए',
  },
  'register.sapCodeRequired': { en: 'Enter your SAP code', hi: 'अपना SAP कोड भरिए' },
  'register.agreeRequired': {
    en: 'Read and accept the Terms & Conditions to continue',
    hi: 'आगे बढ़ने के लिए नियम व शर्तें पढ़कर मंज़ूर कीजिए',
  },
  'register.submit': { en: 'Submit', hi: 'भेजिए' },
  'register.privacy': {
    en: 'We will never share your details.',
    hi: 'आपकी जानकारी हम किसी के साथ साझा नहीं करेंगे।',
  },
  // The website answers an error when it could not hand the registration to MDG,
  // so a dealer who sees this has NOT registered and should try again.
  'register.failed': {
    en: "Your registration could not be completed. Check your network and try again.",
    hi: 'आपका रजिस्ट्रेशन पूरा नहीं हो सका। नेटवर्क जांचें और फिर कोशिश करें।',
  },
  'register.successBadge': { en: 'Registration received', hi: 'नामांकन मिल गया' },
  'register.successTitle': {
    en: 'You are registered.',
    hi: 'रजिस्ट्रेशन हो गया।',
  },
  // A person at MDG looks at this registration first (the account did not open at once).
  'register.successBody': {
    en: 'The MDG team will check it, and a WhatsApp message will tell you when your account is ready. Then sign in with your mobile number and this same password.',
    hi: 'MDG टीम इसे देखेगी, और खाता तैयार होते ही WhatsApp पर संदेश आएगा। फिर अपने मोबाइल नंबर और इसी पासवर्ड से साइन इन करें।',
  },
  // The account opened, but signing in straight after did not go through.
  'register.readyBadge': { en: 'Account ready', hi: 'खाता तैयार' },
  'register.readyTitle': { en: 'Your account is ready.', hi: 'आपका खाता तैयार है।' },
  'register.readyBody': {
    en: 'Sign in with your mobile number and the password you just chose.',
    hi: 'अपने मोबाइल नंबर और अभी चुने पासवर्ड से साइन इन करें।',
  },
  // This mobile already signs in to an account: registering twice, or a second pump.
  'register.existingBadge': { en: 'Already registered', hi: 'पहले से रजिस्टर्ड' },
  'register.existingTitle': {
    en: 'This mobile number already has an account.',
    hi: 'इस मोबाइल नंबर पर खाता पहले से है।',
  },
  'register.existingBody': {
    en: 'Sign in with it. Forgot the password? Tap "Forgot your password?" on the sign-in screen. If this is another pump of yours, the MDG team will contact you to add it.',
    hi: 'इसी नंबर से साइन इन करें। पासवर्ड भूल गए? साइन-इन स्क्रीन पर "पासवर्ड भूल गए?" दबाइए। अगर यह आपका दूसरा पंप है, तो MDG टीम इसे जोड़ने के लिए संपर्क करेगी।',
  },
  'register.successEmail': {
    en: 'A welcome email is on its way to {email}.',
    hi: '{email} पर एक स्वागत ईमेल भी भेजा गया है।',
  },
  'register.termsEyebrow': { en: 'The agreement', hi: 'यह समझौता' },
  'register.termsTitle': { en: 'Terms & Conditions', hi: 'नियम व शर्तें' },
  'register.close': { en: 'Close', hi: 'बंद कीजिए' },
  'register.agreeContinue': { en: 'I agree & continue', hi: 'मंज़ूर है, आगे बढ़िए' },
  // The website's footnote ends on "Call us"; the app has no phone link, so
  // only the sentence about Annexure-I is kept.
  'register.annexure': {
    en: 'Services and rates are set out in Annexure-I; anything outside it is negotiated between both parties.',
    hi: 'कौन सी सेवाएँ और उनके कितने पैसे, यह सब Annexure-I में लिखा है। उससे बाहर का कोई भी काम दोनों पक्ष आपस में बात करके तय करते हैं।',
  },
  // Shown on the Hindi screen only: a translation of a contract is not the
  // contract. The English line exists because every key needs both, and is
  // never drawn — on the English screen the clauses already are the original.
  'register.bindingNotice': {
    en: 'The English text is the binding one.',
    hi: 'यह हिंदी अनुवाद सिर्फ़ आपकी सुविधा के लिए है, ताकि आप समझ सकें कि आप किस बात पर हामी भर रहे हैं। क़ानूनी तौर पर अंग्रेज़ी वाली शर्तें ही मान्य होंगी।',
  },
  'register.showEnglish': { en: 'Read the English original', hi: 'अंग्रेज़ी मूल पढ़िए' },
  'register.showHindi': { en: 'Read in Hindi', hi: 'हिंदी में पढ़िए' },

  /* ── chat ───────────────────────────────────────────────────────────── */
  'chat.support': { en: 'Support', hi: 'सहायता' },
  'chat.supportName': { en: 'Support', hi: 'सहायता' },
  'chat.send': { en: 'Send', hi: 'भेजें' },
  'chat.takePhoto': {
    en: 'Take a photo',
    hi: 'फोटो खींचें',
  },
  'chat.closePreview': { en: 'Close preview', hi: 'बंद करें' },
  'chat.recordVoice': {
    en: 'Record voice message',
    hi: 'वॉइस मैसेज रिकॉर्ड करें',
  },
  'chat.sendVoice': { en: 'Send voice message', hi: 'वॉइस मैसेज भेजें' },
  'chat.cancelRecording': {
    en: 'Cancel recording',
    hi: 'रिकॉर्डिंग रद्द करें',
  },
  'chat.voiceMessage': { en: 'Voice message', hi: 'वॉइस मैसेज' },
  'chat.recorded': { en: 'Recorded', hi: 'रिकॉर्ड हो गया' },
  'chat.removeVoice': { en: 'Remove voice message', hi: 'वॉइस मैसेज हटाएं' },
  'chat.removeAttachment': { en: 'Remove attachment', hi: 'अटैचमेंट हटाएं' },
  'chat.playVoice': { en: 'Play voice message', hi: 'वॉइस मैसेज चलाएं' },
  'chat.pauseVoice': { en: 'Pause voice message', hi: 'वॉइस मैसेज रोकें' },
  'chat.slideToCancel': { en: 'Slide to cancel', hi: 'रद्द करने के लिए खिसकाएं' },
  'chat.micBlocked': {
    en: "Can't access the microphone",
    hi: 'माइक्रोफ़ोन एक्सेस नहीं हो पा रहा',
  },
  // "Allow it in Settings" is the right advice for a REFUSED mic and nothing else.
  // If the mic is busy, or absent, or the page is insecure, that instruction sends
  // the dealer to a screen where the permission is already on — they follow it,
  // nothing changes, and they report the mic as broken again. One message per cause.
  'chat.micBlockedHint': {
    en: 'Allow microphone access for Dealer Kavach in your phone Settings, then try again.',
    hi: 'फ़ोन की सेटिंग में Dealer Kavach को माइक्रोफ़ोन की अनुमति दें, फिर दोबारा कोशिश करें।',
  },
  'chat.micBusy': {
    en: 'The microphone is being used by another app',
    hi: 'माइक्रोफ़ोन किसी दूसरे ऐप में चल रहा है',
  },
  'chat.micBusyHint': {
    en: 'Close any call or recording app, then try again.',
    hi: 'कॉल या रिकॉर्डिंग वाला ऐप बंद कीजिए, फिर दोबारा कोशिश करें।',
  },
  'chat.micMissing': {
    en: 'No microphone found on this phone',
    hi: 'इस फ़ोन में माइक्रोफ़ोन नहीं मिला',
  },
  'chat.micMissingHint': {
    en: 'You can still type your message, or send a photo.',
    hi: 'आप संदेश टाइप कर सकते हैं, या फोटो भेज सकते हैं।',
  },
  // The request never came back at all — no refusal, no busy mic, no answer.
  // Sending someone to Settings for this is the wrong advice: there is nothing
  // there to change. Trying again genuinely does work, because the usual cause
  // is a permission dialog whose result never reached the page.
  'chat.micOpenSettings': { en: 'Open settings', hi: 'सेटिंग खोलें' },
  'chat.micTimeout': {
    en: "The microphone didn't open",
    hi: 'माइक्रोफ़ोन चालू नहीं हो पाया',
  },
  'chat.micTimeoutHint': {
    en: 'Press and hold the mic again. If it keeps happening, type your message.',
    hi: 'माइक को दोबारा दबाकर रखिए। फिर भी न हो तो संदेश टाइप कीजिए।',
  },
  'chat.micUnavailable': {
    en: "Voice notes don't work on this phone",
    hi: 'इस फ़ोन में वॉइस नोट नहीं चलते',
  },
  'chat.micUnavailableHint': {
    en: 'Please type your message instead. We are looking into it.',
    hi: 'कृपया संदेश टाइप कीजिए। हम इसे देख रहे हैं।',
  },
  'chat.releaseToCancel': {
    en: 'Release to cancel',
    hi: 'छोड़ें, रद्द हो जाएगा',
  },
  'chat.recordingLocked': {
    en: 'Recording — tap send when done',
    hi: 'रिकॉर्ड हो रहा है — हो जाए तो भेजें दबाएं',
  },
  'chat.stillConnecting': {
    en: 'Still connecting. Please wait a moment and try again.',
    hi: 'अभी जुड़ रहे हैं। कृपया थोड़ी देर रुककर फिर कोशिश करें।',
  },
  'chat.sendFailed': {
    en: "Your message didn't go through. Please check your network and try again.",
    hi: 'आपका संदेश नहीं पहुंचा। कृपया अपना नेटवर्क जांचें और फिर कोशिश करें।',
  },
  'chat.voiceSendFailed': {
    en: "We couldn't send your voice message. Please check your network and try again.",
    hi: 'आपका वॉइस मैसेज नहीं भेजा जा सका। कृपया अपना नेटवर्क जांचें और फिर कोशिश करें।',
  },
  'chat.fileSendFailed': {
    en: "We couldn't send {name}. Please check your network and try again.",
    hi: '{name} नहीं भेजा जा सका। कृपया अपना नेटवर्क जांचें और फिर कोशिश करें।',
  },
  'chat.emptyTitle': { en: 'How can we help?', hi: 'हम आपकी क्या मदद करें?' },
  // Says WHO answers and WHERE, and nothing about how fast or by what. It is
  // true whether a person or the first line writes the reply, so it never has to
  // change when a dealer's first-line mode does.
  'chat.emptyDesc': {
    en: 'Send a message and the MDG team will answer you here.',
    hi: 'संदेश भेजिए, MDG टीम आपको यहीं जवाब देगी।',
  },
  'chat.quickReportIssue': {
    en: 'Report an issue',
    hi: 'कोई दिक्कत बताएं',
  },
  'chat.quickRequestService': {
    en: 'Request a service',
    hi: 'सेवा के लिए कहें',
  },

  /* ── the AI first line, from the dealer's side ──────────────────────────
     One footnote and a pair of chips. Nothing here says "AI", "bot" or
     "automatic": a dealer does not need to know which desk at MDG answered,
     only that the answer came at once. */

  // The footnote under a reply the first line wrote. A footnote, not a badge —
  // it sits on the same line as the timestamp precisely so it cannot out-weigh
  // the answer it annotates.
  'chat.aiInstantReply': { en: 'Instant reply', hi: 'तुरंत जवाब' },

  // The two chips above the composer. Both are questions a dealer asks most
  // mornings and both are a nuisance to type on a Devanagari phone keyboard,
  // which is the entire point of a chip.
  'chat.quickTodayReport': { en: "Today's report?", hi: 'आज की रिपोर्ट?' },
  // REPLACED "Sent today's photo?" — see the note on `quickReplies` in
  // Composer.tsx. The wording is deliberately the glossary's own example for the
  // `todo` label ("ab kya karna hai" / "what do I need to do now"), so the chip
  // lands on the one intent that was written to answer it.
  'chat.quickWhatNow': { en: 'What do I need to do?', hi: 'अब क्या करना है?' },

  'chat.today': { en: 'Today', hi: 'आज' },
  'chat.yesterday': { en: 'Yesterday', hi: 'कल' },
  'chat.isTyping': { en: '{name} is typing', hi: '{name} लिख रहे हैं' },
  'chat.imagePreview': { en: 'Image preview', hi: 'फोटो पूर्वावलोकन' },
  'chat.resetZoom': { en: 'Fit to screen', hi: 'पूरी तस्वीर दिखाएँ' },
  'chat.imageFailed': {
    en: "This picture didn't open. Check your network and try again.",
    hi: 'यह तस्वीर नहीं खुली। नेटवर्क जांचें और फिर कोशिश करें।',
  },
  'chat.mediaLoadFailed': {
    en: "Couldn't load the photos",
    hi: 'फोटो लोड नहीं हो सके',
  },
  'chat.historyLoadFailed': {
    en: "Couldn't load this chat",
    hi: 'यह चैट लोड नहीं हो सकी',
  },
  'chat.voiceTooShort': {
    en: 'Nothing was recorded. Hold the mic a little longer.',
    hi: 'कुछ रिकॉर्ड नहीं हुआ। माइक थोड़ी देर और दबाए रखें।',
  },
  'chat.voiceMaxReached': {
    en: 'Ten minutes is the limit — sending what you recorded.',
    hi: 'दस मिनट की सीमा पूरी — जो रिकॉर्ड हुआ वह भेजा जा रहा है।',
  },
  'chat.sessionExpired': {
    en: 'You were signed out — this happens if you sign in on another phone. Please sign in again.',
    hi: 'आप साइन आउट हो गए — ऐसा तब होता है जब किसी दूसरे फ़ोन पर साइन इन किया जाए। कृपया दोबारा साइन इन करें।',
  },
  'chat.managerThread': { en: 'Manager chat', hi: 'मैनेजर चैट' },
  'chat.noConversations': { en: 'No chats yet', hi: 'अभी कोई चैट नहीं' },
  'chat.noConversationsDesc': {
    en: 'Your support chats will appear here.',
    hi: 'आपकी सहायता चैट यहाँ दिखेंगी।',
  },
  'chat.listErrorTitle': {
    en: "We couldn't load your chats",
    hi: 'अभी आपकी चैट लोड नहीं हो पाईं',
  },
  'chat.listErrorDesc': {
    en: 'Your chats are safe. Check your connection and try again.',
    hi: 'आपकी चैट सुरक्षित हैं। कनेक्शन जांचें और फिर कोशिश करें।',
  },
  'chat.retry': { en: 'Try again', hi: 'फिर कोशिश करें' },
  'chat.backToChats': { en: 'Back to chats', hi: 'चैट सूची पर वापस' },
  'chat.conversationNotFound': {
    en: "This chat isn't available.",
    hi: 'यह चैट उपलब्ध नहीं है।',
  },
  'chat.you': { en: 'You', hi: 'आप' },
  'chat.noMessagesYet': { en: 'No messages yet', hi: 'अभी कोई संदेश नहीं' },

  /* ── message actions / reactions / replies ──────────────────────────── */
  'chat.reply': { en: 'Reply', hi: 'जवाब दें' },
  'chat.copy': { en: 'Copy', hi: 'कॉपी करें' },
  'chat.copied': { en: 'Copied', hi: 'कॉपी हो गया' },
  'chat.copyFailed': {
    en: "Couldn't copy the message",
    hi: 'संदेश कॉपी नहीं हो पाया',
  },
  'chat.download': { en: 'Download', hi: 'डाउनलोड करें' },
  'chat.saving': { en: 'Saving…', hi: 'सेव हो रहा है…' },
  'chat.savedToGallery': {
    en: 'Saved to your gallery',
    hi: 'आपकी गैलरी में सेव हो गया',
  },
  // The same words on an iPhone, which has no "gallery" — it has Photos.
  'chat.savedToPhotos': { en: 'Saved to Photos', hi: 'फ़ोटो में सेव हो गया' },
  'chat.downloadingInBrowser': {
    en: 'Download started in your browser',
    hi: 'ब्राउज़र में डाउनलोड शुरू हो गया',
  },
  'chat.downloadFailed': {
    en: "Couldn't download. Please check your network and try again.",
    hi: 'डाउनलोड नहीं हो पाया। कृपया अपना नेटवर्क जांचें और फिर कोशिश करें।',
  },
  'chat.messageInfo': { en: 'Message info', hi: 'संदेश की जानकारी' },
  'chat.readBy': { en: 'Read by', hi: 'इन्होंने पढ़ा' },
  'chat.deliveredTo': { en: 'Delivered to', hi: 'इन तक पहुंचा' },
  'chat.sentLabel': { en: 'Sent', hi: 'भेजा गया' },
  'chat.reactions': { en: 'Reactions', hi: 'रिएक्शन' },
  'chat.tapToRemove': { en: 'Tap to remove', hi: 'हटाने के लिए दबाएं' },
  'chat.reactionFailed': {
    en: "Your reaction didn't save. Please try again.",
    hi: 'आपका रिएक्शन सेव नहीं हुआ। कृपया फिर कोशिश करें।',
  },
  'chat.replyingTo': { en: 'Replying to {name}', hi: '{name} को जवाब' },
  'chat.cancelReply': { en: 'Cancel reply', hi: 'जवाब रद्द करें' },
  'chat.replyPhoto': { en: 'Photo', hi: 'फोटो' },
  'chat.replyVoice': { en: 'Voice message', hi: 'वॉइस मैसेज' },
  'chat.replyFile': { en: 'File', hi: 'फ़ाइल' },
  'chat.replyVideo': { en: 'Video', hi: 'वीडियो' },
  'chat.originalNotFound': {
    en: 'That message is no longer available',
    hi: 'वह संदेश अब उपलब्ध नहीं है',
  },
  'chat.newMessages': { en: '{n} new messages', hi: '{n} नए संदेश' },
  'chat.scrollToBottom': {
    en: 'Go to the latest message',
    hi: 'सबसे नए संदेश पर जाएं',
  },
  'chat.supportFallbackName': { en: 'MDG Support', hi: 'MDG सहायता' },

  /* ── media / docs / links gallery ───────────────────────────────────── */
  'chat.tabMedia': { en: 'Media', hi: 'मीडिया' },
  'chat.tabDocs': { en: 'Docs', hi: 'दस्तावेज़' },
  'chat.tabLinks': { en: 'Links', hi: 'लिंक' },
  'chat.noMedia': { en: 'No photos yet', hi: 'अभी कोई फोटो नहीं' },
  'chat.noDocs': { en: 'No documents yet', hi: 'अभी कोई दस्तावेज़ नहीं' },
  'chat.noLinks': { en: 'No links yet', hi: 'अभी कोई लिंक नहीं' },
  'chat.loadMore': { en: 'Load more', hi: 'और देखें' },

  /* ── profile & team ─────────────────────────────────────────────────── */
  // The "Message us" button on the Profile screen's help line. The key kept its old
  // name (it began life on the Pump health screen, which is gone); renaming it is
  // a separate change with no reader to gain from it.
  'kavach.messageUs': { en: 'Message us', hi: 'हमें लिखें' },
  'profile.roleOwner': { en: 'Owner', hi: 'मालिक' },
  // The `dealer-staff` LOGIN role — a manager with an app account. Not a warrior
  // (a roster record with no login), so this must not be renamed to "warrior".
  // The admin portal already calls this role "Manager".
  'profile.roleStaff': { en: 'Manager', hi: 'मैनेजर' },
  'profile.roleAdmin': { en: 'Admin', hi: 'एडमिन' },
  'profile.statusActive': { en: 'Active', hi: 'चालू' },
  'profile.statusPaused': { en: 'Paused', hi: 'बंद' },
  'profile.changePassword': { en: 'Change password', hi: 'पासवर्ड बदलें' },
  'profile.currentPassword': {
    en: 'Current password',
    hi: 'मौजूदा पासवर्ड',
  },
  'profile.newPassword': { en: 'New password', hi: 'नया पासवर्ड' },
  'profile.confirmPassword': {
    en: 'Confirm new password',
    hi: 'नया पासवर्ड दोबारा भरें',
  },
  'profile.min8': { en: 'At least 8 characters', hi: 'कम से कम 8 अक्षर' },
  'profile.passwordsDontMatch': {
    en: 'Passwords do not match',
    hi: 'पासवर्ड मेल नहीं खा रहे',
  },
  'profile.passwordChanged': {
    en: 'Your password has been changed',
    hi: 'आपका पासवर्ड बदल गया है',
  },
  'profile.passwordChangeFailed': {
    en: "We couldn't change your password. Please try again, or message us in Chat.",
    hi: 'आपका पासवर्ड नहीं बदल पाए। कृपया फिर कोशिश करें, या चैट में हमें लिखें।',
  },
  'profile.currentPasswordWrong': {
    en: 'That current password is not right.',
    hi: 'मौजूदा पासवर्ड सही नहीं है।',
  },
  'profile.updatePassword': {
    en: 'Update password',
    hi: 'पासवर्ड अपडेट करें',
  },
  'profile.team': { en: 'Team', hi: 'टीम' },
  'profile.invite': { en: 'Invite', hi: 'जोड़ें' },
  'profile.fullName': { en: 'Full name', hi: 'पूरा नाम' },
  'profile.tempPassword': {
    en: 'Temporary password',
    hi: 'अस्थायी पासवर्ड',
  },
  'profile.sendInvite': { en: 'Send invite', hi: 'न्योता भेजें' },
  'profile.managerMobile': {
    en: "Manager's mobile number (they sign in with it)",
    hi: 'मैनेजर का मोबाइल नंबर (इसी से साइन इन करेंगे)',
  },
  'profile.emailOptional': { en: 'Email (optional)', hi: 'ईमेल (ज़रूरी नहीं)' },
  'profile.tempPasswordNote': {
    en: 'Tell your manager this password. They will choose their own when they first sign in.',
    hi: 'यह पासवर्ड अपने मैनेजर को बताइए। पहली बार साइन इन करते ही वे अपना नया पासवर्ड बनाएँगे।',
  },
  'profile.noTeammates': { en: 'No teammates yet.', hi: 'अभी कोई साथी नहीं।' },
  'profile.actionFailed': {
    en: "That didn't work. Please try again, or message us in Chat.",
    hi: 'यह नहीं हो पाया। कृपया फिर कोशिश करें, या चैट में हमें लिखें।',
  },
  'profile.teammateAdded': { en: 'Teammate added', hi: 'साथी जुड़ गया' },
  // One manager per pump: the server refuses a second with a 409.
  'profile.teamHasManager': {
    en: 'Your pump already has a manager. Pause them first, or ask the MDG team.',
    hi: 'आपके पंप पर पहले से मैनेजर है। पहले उन्हें रोकें, या MDG टीम से कहें।',
  },
  'profile.emailInUse': {
    en: 'That email is already used by another login.',
    hi: 'यह ईमेल किसी और लॉगिन में पहले से है।',
  },
  'profile.teammateAddFailed': {
    en: "We couldn't add your teammate. Please try again, or message us in Chat.",
    hi: 'आपका साथी नहीं जुड़ पाया। कृपया फिर कोशिश करें, या चैट में हमें लिखें।',
  },
  'profile.suspend': { en: 'Suspend', hi: 'रोकें' },
  'profile.activate': { en: 'Activate', hi: 'चालू करें' },
  'profile.notSignedIn': { en: 'Not signed in', hi: 'साइन इन नहीं हैं' },
  'profile.notSignedInDesc': {
    en: 'Please sign in to view your profile.',
    hi: 'प्रोफ़ाइल देखने के लिए साइन इन करें।',
  },
  'profile.yourServices': { en: 'Your services', hi: 'आपकी सेवाएं' },
  'profile.servicesRowDesc': {
    en: 'See what we run for your pump',
    hi: 'देखें हम आपके पंप के लिए क्या चलाते हैं',
  },
  'profile.language': { en: 'Language', hi: 'भाषा' },

  /* ── services ───────────────────────────────────────────────────────── */
  'services.title': { en: 'Your services', hi: 'आपकी सेवाएं' },
  'services.active': { en: 'Active', hi: 'चालू' },
  'services.paused': { en: 'Paused', hi: 'बंद' },
  'services.errorTitle': {
    en: "We couldn't show your services just now",
    hi: 'अभी आपकी सेवाएं नहीं दिखा पाए',
  },
  'services.emptyTitle': { en: 'No services yet', hi: 'अभी कोई सेवा नहीं' },
  'services.emptyDesc': {
    en: "Your account manager will set these up for you. We'll show them here once they're active.",
    hi: 'आपका अकाउंट मैनेजर इन्हें सेट करेगा। चालू होने पर ये यहां दिखेंगी।',
  },
  'services.last': { en: 'Last: {date}', hi: 'पिछली: {date}' },
  'services.next': { en: 'Next: {date}', hi: 'अगली: {date}' },
  'services.runsDaily': { en: 'Runs daily', hi: 'रोज़ चलती है' },
  'services.runsWeekly': { en: 'Runs weekly', hi: 'हर हफ्ते चलती है' },
  'services.runsMonthly': { en: 'Runs monthly', hi: 'हर महीने चलती है' },
  'services.runsYearly': { en: 'Runs yearly', hi: 'हर साल चलती है' },
  'services.runsOnDemand': {
    en: 'Runs when needed',
    hi: 'ज़रूरत पड़ने पर चलती है',
  },

  /* ── staff & points ─────────────────────────────────────────────────── */
  'profile.staffPoints': { en: 'Warriors & points', hi: 'योद्धा और पॉइंट' },
  'profile.staffPointsDesc': {
    en: 'Reward your warriors for their work',
    hi: 'अपने योद्धाओं को उनके काम के लिए इनाम दें',
  },

  'staff.title': { en: 'Warriors & points', hi: 'योद्धा और पॉइंट' },
  'staff.givePoints': { en: 'Give points', hi: 'पॉइंट दें' },
  'staff.addWorker': { en: 'Add warrior', hi: 'योद्धा जोड़ें' },
  'staff.windowToday': { en: 'Today', hi: 'आज' },
  'staff.windowMonth': { en: 'This month', hi: 'इस महीने' },
  'staff.points': { en: 'points', hi: 'पॉइंट' },
  'staff.targetLegend': {
    en: 'Each warrior aims for 100 points',
    hi: 'हर योद्धा को 100 पॉइंट चाहिए',
  },
  'staff.reached': { en: 'Reached 100', hi: '100 पूरे' },
  'staff.onLeave': { en: 'On leave', hi: 'छुट्टी पर' },
  'staff.onLeaveShort': { en: 'On leave', hi: 'छुट्टी' },
  'staff.leaveDays': { en: '{n} days leave', hi: '{n} दिन छुट्टी' },
  'staff.markLeave': { en: 'Leave today', hi: 'आज छुट्टी' },
  'staff.markLeaveYesterday': { en: 'Yesterday', hi: 'कल' },
  'staff.markLeaveHint': {
    en: 'On leave? No points are expected for that day.',
    hi: 'छुट्टी पर हैं? उस दिन पॉइंट की उम्मीद नहीं होगी।',
  },
  'staff.clearLeave': { en: 'Remove leave', hi: 'छुट्टी हटाएँ' },
  'staff.leaveTodayHint': { en: 'Off today', hi: 'आज छुट्टी पर' },
  'staff.leaveMarked': {
    en: '{name} marked on leave for today',
    hi: '{name} की आज की छुट्टी लगा दी',
  },
  'staff.leaveMarkedYesterday': {
    en: '{name} marked on leave for yesterday',
    hi: '{name} की कल की छुट्टी लगा दी',
  },
  'staff.leaveCleared': {
    en: "{name}'s leave removed",
    hi: '{name} की छुट्टी हटा दी',
  },
  'staff.emptyTitle': { en: 'Add your first warrior', hi: 'अपना पहला योद्धा जोड़ें' },
  'staff.emptyDesc': {
    en: 'Keep a list of your warriors and give them points for the work they do.',
    hi: 'अपने योद्धाओं की सूची रखें और उनके काम के लिए पॉइंट दें।',
  },
  'staff.errorTitle': {
    en: "We couldn't load this just now",
    hi: 'अभी यह लोड नहीं हो पाया',
  },
  'staff.messageUs': { en: 'Message us', hi: 'हमें लिखें' },

  'staff.form.namePlaceholder': { en: "Warrior's name", hi: 'योद्धा का नाम' },
  'staff.form.phonePlaceholder': {
    en: 'Phone (optional)',
    hi: 'फ़ोन (ज़रूरी नहीं)',
  },
  'staff.form.designationPlaceholder': {
    en: 'Work / role (optional)',
    hi: 'काम / पद (ज़रूरी नहीं)',
  },
  'staff.form.save': { en: 'Save warrior', hi: 'योद्धा सेव करें' },
  'staff.form.nameRequired': { en: 'Please enter a name', hi: 'कृपया नाम भरें' },
  'staff.form.added': { en: 'Warrior added', hi: 'योद्धा जुड़ गया' },
  'staff.form.addFailed': {
    en: "We couldn't add this warrior. Please try again, or message us in Chat.",
    hi: 'योद्धा नहीं जुड़ पाया। कृपया फिर कोशिश करें, या चैट में हमें लिखें।',
  },

  'staff.give.title': { en: 'Give points', hi: 'पॉइंट दें' },
  'staff.give.step1': { en: 'Who did the work?', hi: 'काम किसने किया?' },
  'staff.give.step2': { en: 'What did they do?', hi: 'उन्होंने क्या किया?' },
  'staff.give.step3': { en: 'Confirm', hi: 'पक्का करें' },
  'staff.give.searchWork': { en: 'Search work…', hi: 'काम खोजें…' },
  'staff.give.noWork': { en: 'No matching work', hi: 'कोई काम नहीं मिला' },
  'staff.give.noWorkers': { en: 'Add a warrior first', hi: 'पहले एक योद्धा जोड़ें' },
  'staff.give.date': { en: 'Day', hi: 'दिन' },
  'staff.give.howMany': { en: 'How many?', hi: 'कितने?' },
  'staff.give.splitInfo': {
    en: 'Shared among the warriors',
    hi: 'सबके बीच बँटेगा',
  },
  'staff.give.eachInfo': { en: 'Each warrior gets it', hi: 'हर योद्धा को मिलेगा' },
  'staff.give.perEach': { en: '{points} each', hi: 'हर एक को {points}' },
  'staff.give.whoTogether': {
    en: 'Who did it together?',
    hi: 'यह किसने-किसने किया?',
  },
  'staff.give.total': { en: 'Total {points}', hi: 'कुल {points}' },
  'staff.give.confirm': { en: 'Give points', hi: 'पॉइंट दें' },
  'staff.give.continue': { en: 'Continue', hi: 'आगे बढ़ें' },
  'staff.give.selectedSummary': {
    en: '{count} selected · {points} points',
    hi: '{count} चुने · {points} पॉइंट',
  },
  'staff.give.worksHeader': { en: 'Work done', hi: 'किया गया काम' },
  'staff.give.addMoreWork': { en: '+ Add another', hi: '+ और जोड़ें' },
  'staff.give.removeWork': { en: 'Remove', hi: 'हटाएं' },
  'staff.give.pickWorkHint': {
    en: 'Tap everything they did — pick as many as you like',
    hi: 'उन्होंने जो-जो किया सब चुनें — जितने चाहें उतने',
  },

  'staff.award.toastOne': {
    en: '{points} points given to {name}',
    hi: '{name} को {points} पॉइंट मिले',
  },
  'staff.award.toastMany': {
    en: 'Points given to {count} warriors',
    hi: '{count} योद्धाओं को पॉइंट मिले',
  },
  'staff.award.undo': { en: 'Undo', hi: 'वापस लें' },
  'staff.award.undone': { en: 'Removed', hi: 'वापस ले लिया' },
  'staff.award.failed': {
    en: "That didn't save. Please try again, or message us in Chat.",
    hi: 'यह सेव नहीं हुआ। कृपया फिर कोशिश करें, या चैट में हमें लिखें।',
  },

  'staff.domain.cleaning': { en: 'Cleaning', hi: 'सफ़ाई' },
  'staff.domain.du': { en: 'Dispensing units', hi: 'मशीन (DU)' },
  'staff.domain.equipment': { en: 'Equipment', hi: 'उपकरण' },
  'staff.domain.automation': { en: 'Automation', hi: 'ऑटोमेशन' },
  'staff.domain.tanker': { en: 'Tanker', hi: 'टैंकर' },
  'staff.domain.mobile-dispenser': { en: 'Mobile dispenser', hi: 'मोबाइल डिस्पेंसर' },
  'staff.domain.sales': { en: 'Sales', hi: 'बिक्री' },
  'staff.domain.office': { en: 'Office', hi: 'ऑफिस' },
  'staff.domain.customer': { en: 'Customer', hi: 'ग्राहक' },
  'staff.domain.kitchen': { en: 'Kitchen', hi: 'रसोई' },
  'staff.domain.misc': { en: 'Other', hi: 'अन्य' },

  /* ── rupee-amount work input ─────────────────────────────────────────── */
  'staff.amountRupees': { en: 'Amount (₹)', hi: 'रकम (₹)' },
  'staff.enterAmount': { en: 'Enter amount', hi: 'रकम भरें' },
  'staff.amountRequired': {
    en: 'Enter the sale amount to add this',
    hi: 'इसे जोड़ने के लिए बिक्री की रकम भरें',
  },

  /* ── "Other …" works: what exactly was done? ─────────────────────────── */
  'staff.workNote': { en: 'What did they do?', hi: 'उन्होंने क्या काम किया?' },
  'staff.workNotePlaceholder': {
    en: 'e.g. washed the canopy',
    hi: 'जैसे — छत की सफाई की',
  },
  'staff.workNoteRequired': {
    en: 'Write what work was done to add this',
    hi: 'इसे जोड़ने के लिए लिखिए कि क्या काम किया',
  },
  'staff.workNoteHint': {
    en: "This work doesn't say what was done — please write it.",
    hi: 'इस काम से पता नहीं चलता कि क्या किया — कृपया लिखिए।',
  },

  /* ── draft: build up a submission ───────────────────────────────────── */
  'staff.addToSubmission': { en: 'Add to submission', hi: 'सूची में जोड़ें' },
  'staff.addedToSubmission': {
    en: 'Added to submission',
    hi: 'सूची में जुड़ गया',
  },
  'staff.pendingSubmission': {
    en: 'Pending submission',
    hi: 'जमा करना बाकी',
  },
  'staff.pendingHint': {
    en: 'Review the work, then submit with a hardcopy photo.',
    hi: 'काम जाँच लें, फिर हार्डकॉपी फोटो के साथ जमा करें।',
  },
  'staff.pendingTotal': { en: 'Total {points} points', hi: 'कुल {points} पॉइंट' },
  'staff.removeLine': { en: 'Remove', hi: 'हटाएं' },
  'staff.clearDraft': { en: 'Clear all', hi: 'सब हटाएं' },
  'staff.clearDraftConfirm': {
    en: 'Clear the whole pending submission?',
    hi: 'पूरी बाकी सूची हटा दें?',
  },
  'staff.draftCleared': { en: 'Submission cleared', hi: 'सूची हटा दी गई' },

  'staff.savingDraft': { en: 'Saving…', hi: 'सेव हो रहा है…' },
  'staff.draftSaved': { en: 'Saved', hi: 'सेव हो गया' },
  'staff.draftOffline': {
    en: 'Offline — will sync',
    hi: 'ऑफलाइन — बाद में सिंक होगा',
  },
  'staff.draftRejected': {
    en: "Couldn't be saved",
    hi: 'सेव नहीं हो सका',
  },

  /* ── final submit + hardcopy photo ──────────────────────────────────── */
  'staff.finalSubmit': { en: 'Final submit', hi: 'फ़ाइनल जमा करें' },
  'staff.finalizeTitle': { en: 'Submit points', hi: 'पॉइंट जमा करें' },
  'staff.hardcopyPhoto': { en: 'Hardcopy photo', hi: 'हार्डकॉपी फोटो' },
  'staff.hardcopyHint': {
    en: 'Take a photo of the paper record at the pump so hard and soft copies match.',
    hi: 'पंप पर रखे कागज़ी रिकॉर्ड की फोटो लें ताकि हार्ड और सॉफ्ट कॉपी मेल खाएं।',
  },
  'staff.takePhoto': { en: 'Take photo', hi: 'फोटो खींचें' },
  'staff.choosePhoto': { en: 'Choose photo', hi: 'फोटो चुनें' },
  'staff.retakePhoto': { en: 'Change photo', hi: 'फोटो बदलें' },
  'staff.photoRequired': {
    en: 'A hardcopy photo is required to submit',
    hi: 'जमा करने के लिए हार्डकॉपी फोटो ज़रूरी है',
  },
  'staff.confirmSubmit': { en: 'Submit {points} points', hi: '{points} पॉइंट जमा करें' },
  'staff.submitting': { en: 'Submitting…', hi: 'जमा हो रहा है…' },
  'staff.finalizeSuccess': {
    en: '{points} points submitted',
    hi: '{points} पॉइंट जमा हो गए',
  },
  'staff.finalizeFailed': {
    en: "That didn't submit. Nothing was lost — please try again.",
    hi: 'जमा नहीं हुआ। कुछ खोया नहीं — कृपया फिर कोशिश करें।',
  },
  'staff.finalizeEmpty': {
    en: 'Add some work before submitting.',
    hi: 'जमा करने से पहले कुछ काम जोड़ें।',
  },
  'staff.draftChanged': {
    en: 'Your submission changed — please review and submit again.',
    hi: 'आपकी सूची बदल गई — कृपया दोबारा देखकर जमा करें।',
  },
  'staff.offlineSubmit': {
    en: "You're offline — reconnect to submit.",
    hi: 'आप ऑफलाइन हैं — जमा करने के लिए दोबारा कनेक्ट करें।',
  },
  'staff.rejectedSubmit': {
    en: 'MDG could not save this list. Check that every "Other work" line has a description, or message us in Chat.',
    hi: 'MDG यह सूची सेव नहीं कर सका। देखें कि हर "अन्य काम" वाली लाइन में विवरण लिखा है, या चैट में हमें लिखें।',
  },
  'staff.waitSaving': {
    en: 'Saving your changes…',
    hi: 'आपके बदलाव सेव हो रहे हैं…',
  },
  'staff.finalizeNote': { en: 'Note (optional)', hi: 'नोट (ज़रूरी नहीं)' },
  'staff.notePlaceholder': { en: 'Add a note…', hi: 'नोट लिखें…' },

  /* ── editable roster ─────────────────────────────────────────────────── */
  'staff.editWorker': { en: 'Edit warrior', hi: 'योद्धा बदलें' },
  'staff.renameWorker': { en: 'Edit warrior', hi: 'योद्धा बदलें' },
  'staff.workerName': { en: 'Name', hi: 'नाम' },
  'staff.workerDesignation': { en: 'Work / role', hi: 'काम / पद' },
  'staff.workerPhone': { en: 'Phone', hi: 'फ़ोन' },
  'staff.saveChanges': { en: 'Save changes', hi: 'बदलाव सेव करें' },
  'staff.workerUpdated': { en: 'Warrior updated', hi: 'योद्धा अपडेट हुआ' },
  'staff.removeWorker': { en: 'Remove warrior', hi: 'योद्धा हटाएं' },
  'staff.removeWorkerConfirm': {
    en: 'Remove {name}? Their points history stays.',
    hi: '{name} को हटाएं? उनके पॉइंट का रिकॉर्ड बना रहेगा।',
  },
  'staff.workerRemoved': { en: 'Warrior removed', hi: 'योद्धा हटा दिया' },
  'staff.showRemoved': { en: 'Show removed ({n})', hi: 'हटाए गए देखें ({n})' },
  'staff.hideRemoved': { en: 'Hide removed', hi: 'हटाए गए छिपाएं' },
  'staff.removedSection': { en: 'Removed warriors', hi: 'हटाए गए योद्धा' },
  'staff.reactivate': { en: 'Bring back', hi: 'वापस लाएं' },
  'staff.reactivated': { en: 'Warrior brought back', hi: 'योद्धा वापस आ गया' },

  /* ── past submissions ────────────────────────────────────────────────── */
  'staff.pastSubmissions': { en: 'Past submissions', hi: 'पिछली जमा' },
  'staff.pastEmpty': { en: 'No submissions yet', hi: 'अभी कोई जमा नहीं' },
  'staff.viewHardcopy': { en: 'View hardcopy', hi: 'हार्डकॉपी देखें' },
  'staff.batchSummary': {
    en: '{points} points · {workers} warriors',
    hi: '{points} पॉइंट · {workers} योद्धा',
  },

  /* ── wa:frame — chat list, app bars, settings ────────────────────────── */

  // Chat list. "Unread" is the dealer's own word for "not read yet" — the
  // clinical "अपठित" is what an app says, not what a pump owner says.
  'chatlist.search': { en: 'Search', hi: 'खोजें' },
  'chatlist.searchPlaceholder': { en: 'Search chats…', hi: 'चैट खोजें…' },
  'chatlist.clearSearch': { en: 'Clear', hi: 'मिटाएं' },
  'chatlist.filters': { en: 'Filter chats', hi: 'चैट छाँटें' },
  'chatlist.filterAll': { en: 'All', hi: 'सभी' },
  'chatlist.filterUnread': { en: 'Unread', hi: 'बिना पढ़े' },
  'chatlist.filterGroups': { en: 'Groups', hi: 'ग्रुप' },
  'chatlist.unreadCount': { en: '{n} unread', hi: '{n} बिना पढ़े' },
  'chatlist.noUnread': { en: 'No unread chats', hi: 'कोई चैट बिना पढ़ी नहीं है' },
  'chatlist.noMatch': { en: 'No chats found', hi: 'कोई चैट नहीं मिली' },
  'chatlist.settings': { en: 'Settings', hi: 'सेटिंग' },

  // The one quiet reminder about notifications, at the top of the chat list. The
  // card is shown before the phone asks, so the dealer knows what yes gets them.
  'push.askTitle': { en: 'Turn on notifications', hi: 'नोटिफ़िकेशन चालू कीजिए' },
  'push.askDesc': {
    en: "Get MDG's replies and your daily report on this phone.",
    hi: 'MDG के जवाब और रोज़ की रिपोर्ट इसी फ़ोन पर पाइए।',
  },
  'push.askTurnOn': { en: 'Turn on', hi: 'चालू करें' },
  'push.askNotNow': { en: 'Not now', hi: 'अभी नहीं' },
  'push.offTitle': { en: 'Notifications are off', hi: 'नोटिफ़िकेशन बंद हैं' },
  'push.offDesc': {
    en: "Turn them on in your phone's Settings to get MDG's replies.",
    hi: 'MDG के जवाब पाने के लिए फ़ोन की सेटिंग में इन्हें चालू कीजिए।',
  },
  'push.openSettings': { en: 'Open settings', hi: 'सेटिंग खोलें' },

  // Settings and what hangs off it.
  'settings.title': { en: 'Settings', hi: 'सेटिंग' },
  'settings.profileTitle': { en: 'Profile', hi: 'प्रोफ़ाइल' },
  'settings.account': { en: 'Account', hi: 'खाता' },
  'settings.accountDesc': {
    en: 'Change your password, or delete your account',
    hi: 'पासवर्ड बदलें या अपना खाता हटाएँ',
  },
  // ── Settings → Account → Delete my account (Apple's rule for apps people sign up from) ──
  'account.delete': { en: 'Delete my account', hi: 'मेरा खाता हटाएँ' },
  'account.deleteDesc': {
    en: 'Your login stops working straight away. After {days} days your name, email and phone are wiped.',
    hi: 'आपका लॉगिन तुरंत बंद हो जाएगा। {days} दिन बाद आपका नाम, ईमेल और फ़ोन मिटा दिया जाएगा।',
  },
  'account.deleteTitle': { en: 'Delete your account?', hi: 'अपना खाता हटाएँ?' },
  'account.deleteNow': {
    en: 'You are signed out, and your login stops working at once.',
    hi: 'आप साइन आउट हो जाएँगे और आपका लॉगिन तुरंत बंद हो जाएगा।',
  },
  'account.deleteAllOutlets': {
    en: 'This removes you from every pump you sign in to.',
    hi: 'आप उन सभी पंपों से हट जाएँगे जिनमें आप साइन इन करते हैं।',
  },
  'account.deleteWipe': {
    en: 'Your name, email and phone are wiped after {days} days.',
    hi: '{days} दिन बाद आपका नाम, ईमेल और फ़ोन मिटा दिया जाएगा।',
  },
  'account.deleteRecordsStay': {
    en: "Your outlet's reports and records stay with the outlet.",
    hi: 'आउटलेट की रिपोर्ट और रिकॉर्ड आउटलेट के पास ही रहेंगे।',
  },
  'account.deleteUndo': {
    en: 'Changed your mind? Call or WhatsApp the MDG team within {days} days.',
    hi: 'मन बदल गया? {days} दिन के अंदर MDG टीम को कॉल या WhatsApp कीजिए।',
  },
  'account.deleteConfirm': { en: 'Delete account', hi: 'खाता हटाएँ' },
  'account.deleted': { en: 'Your account is deleted.', hi: 'आपका खाता हटा दिया गया है।' },
  'account.deleteFailed': {
    en: 'Could not delete your account. Check your network and try again.',
    hi: 'खाता नहीं हट सका। नेटवर्क जाँचिए और फिर कोशिश कीजिए।',
  },
  'settings.team': { en: 'Your team', hi: 'आपकी टीम' },
  'settings.teamDesc': { en: 'Add or pause your manager', hi: 'मैनेजर जोड़ें या रोकें' },
  // Notifications: what the phone has been told, on one line. Only inside the app.
  'settings.notifications': { en: 'Notifications', hi: 'नोटिफ़िकेशन' },
  'settings.notificationsOn': { en: 'On', hi: 'चालू' },
  'settings.notificationsOff': {
    en: 'Off — tap to turn on in Settings',
    hi: 'बंद — सेटिंग में चालू करने के लिए दबाइए',
  },
  'settings.notificationsAsk': { en: 'Not turned on yet', hi: 'अभी चालू नहीं हैं' },
  // The two pages on the website. They open in the phone's browser; Apple wants
  // the privacy policy reachable from inside the app, before sign-in too.
  'legal.privacyPolicy': { en: 'Privacy policy', hi: 'प्राइवेसी पॉलिसी' },
  'legal.termsOfService': { en: 'Terms of service', hi: 'सेवा की शर्तें' },
  'settings.help': { en: 'Help videos', hi: 'मदद के वीडियो' },
  'settings.helpDesc': {
    en: 'Learn the app with short videos',
    hi: 'छोटे वीडियो से ऐप चलाना सीखिए',
  },
  // ── billing: the Payments & receipts row ──
  // What is due and what was paid, read-only. The words name the page (a list of
  // bills and receipts); none of them asks for anything or points to a way to pay.
  'settings.payments': { en: 'Payments & receipts', hi: 'भुगतान और रसीदें' },
  'settings.paymentsDesc': {
    en: 'Your bills, receipts and GST invoices',
    hi: 'आपके बिल, रसीदें और GST इनवॉइस',
  },
  // ── end billing ──
  // ── guide-site retirement: the Help videos screen (Settings → Help videos) ──
  'help.title': { en: 'Help videos', hi: 'मदद के वीडियो' },
  'help.intro': {
    en: 'Short videos in Hindi. Tap one to watch.',
    hi: 'हिंदी में छोटे वीडियो। देखने के लिए किसी पर दबाइए।',
  },
  'help.play': { en: 'Play {title}', hi: '{title} चलाइए' },
  'help.close': { en: 'Close video', hi: 'वीडियो बंद करें' },
  'help.playerFailed': {
    en: "This video didn't play. Tap to try again.",
    hi: 'यह वीडियो नहीं चला। फिर कोशिश करने के लिए दबाइए।',
  },
  'help.emptyTitle': { en: 'No videos yet', hi: 'अभी कोई वीडियो नहीं है' },
  'help.emptyDesc': {
    en: 'Ask us in the chat and the MDG team will help you.',
    hi: 'चैट में पूछिए, MDG की टीम आपकी मदद करेगी।',
  },
  'help.loadFailed': { en: 'The videos did not load', hi: 'वीडियो लोड नहीं हुए' },
  'help.loadFailedDesc': {
    en: 'Check your network and try again.',
    hi: 'नेटवर्क जाँचिए और फिर कोशिश कीजिए।',
  },
  'help.askInChat': { en: 'Ask in chat', hi: 'चैट में पूछिए' },
  'help.askInChatDesc': {
    en: 'Not here? Write to the MDG team.',
    hi: 'यहाँ नहीं मिला? MDG की टीम को लिखिए।',
  },
  // ── end guide-site retirement ──
  'settings.logout': { en: 'Log out', hi: 'लॉग आउट' },
  'settings.logoutTitle': { en: 'Log out?', hi: 'लॉग आउट करें?' },
  'settings.logoutDesc': {
    en: 'You will need your email and password to come back in.',
    hi: 'वापस आने के लिए ईमेल और पासवर्ड चाहिए होगा।',
  },
  'settings.fieldName': { en: 'Name', hi: 'नाम' },
  'settings.fieldRole': { en: 'Role', hi: 'पद' },
  'settings.fieldPhone': { en: 'Phone', hi: 'फ़ोन' },
  'settings.fieldStatus': { en: 'Status', hi: 'स्थिति' },
  'settings.notAdded': { en: 'Not added', hi: 'जुड़ा नहीं है' },
  'settings.profileHint': {
    en: 'To change your name, email or phone, message the MDG team.',
    hi: 'नाम, ईमेल या फ़ोन बदलना हो तो MDG टीम को चैट में लिखिए।',
  },

  /* ── wa:thread — the open chat: header, bubbles, selection, search ───── */

  // Who is who in a picture's header and in a group.
  'chat.senderMdg': { en: 'MDG', hi: 'MDG' },

  // The bar of the open chat.
  'chat.barSupportSubtitle': { en: 'MDG team', hi: 'MDG टीम' },
  'chat.typing': { en: 'typing…', hi: 'लिख रहे हैं…' },
  'chat.openInfo': { en: 'Chat info', hi: 'चैट की जानकारी' },
  'chat.menuMedia': {
    en: 'Media, links and docs',
    hi: 'मीडिया, लिंक और दस्तावेज़',
  },
  'chat.menuSearch': { en: 'Search', hi: 'खोजें' },

  // The unread band the thread opens at.
  'chat.unreadOne': { en: '1 unread message', hi: '1 नया संदेश' },
  'chat.unreadMany': { en: '{n} unread messages', hi: '{n} नए संदेश' },

  // Older history that loads by itself; this only shows when it could not.
  'chat.olderFailed': {
    en: "Couldn't load older messages. Tap to try again",
    hi: 'पुराने संदेश नहीं आ सके। दोबारा दबाइए',
  },

  // A picture or voice note that will not open.
  'chat.imageTapToRetry': {
    en: "Couldn't load. Tap to try again",
    hi: 'फोटो नहीं खुली। दोबारा दबाइए',
  },
  'chat.voiceSpeed': { en: 'Speed {rate}', hi: 'रफ़्तार {rate}' },
  // The words of a voice note, written down once MDG has listened to it.
  'chat.transcript': { en: 'Transcript', hi: 'लिखा हुआ' },
  'chat.transcriptMore': { en: 'Show more', hi: 'और दिखाइए' },
  'chat.transcriptLess': { en: 'Show less', hi: 'कम दिखाइए' },
  'chat.voiceFailed': {
    en: "Couldn't play. Tap to try again",
    hi: 'चल नहीं सका। दोबारा दबाइए',
  },
  // Not a bad link: this phone has no way to play that kind of recording. Trying
  // again cannot help, so the line does not offer it.
  'chat.voiceUnplayable': {
    en: "This phone can't play this voice note.",
    hi: 'यह फ़ोन यह वॉइस मैसेज नहीं चला सकता।',
  },

  // A request MDG posted in the chat (ADR 0019). The message itself says what is
  // wanted and for which day, in the dealer's language, so these are only the
  // button and the three things that can be under it. A dealer's word for the
  // whole thing is the same as before — "photo" for what they send, "MDG" for
  // who checks it — and never a state name (no "pending", "submitted").
  // The Hindi spelling is the one MDG's own message uses ("नीचे “फ़ोटो भेजें”
  // दबाइए"), so the words on the button are the words the message points to.
  'chat.askSendPhoto': { en: 'Send photo', hi: 'फ़ोटो भेजें' },
  'chat.askChooseFile': { en: 'Choose file', hi: 'फ़ाइल चुनें' },
  'chat.askChooseGallery': { en: 'Choose from gallery', hi: 'गैलरी से चुनें' },
  'chat.askChoosePhotos': { en: 'Choose from Photos', hi: 'फ़ोटो से चुनें' },
  'chat.askSent': { en: 'Sent — MDG is checking', hi: 'भेज दिया — MDG टीम देख रही है' },
  'chat.askReceived': { en: 'Received', hi: 'मिल गया' },
  'chat.askSentBack': { en: 'MDG sent it back', hi: 'MDG ने वापस भेजा है' },
  // The answer to "where does this stand" did not come. Not "nothing to do" — it
  // says so and offers the retry, because a request that cannot be checked is
  // not a request that is closed.
  'chat.askStateFailed': {
    en: "Couldn't check this just now",
    hi: 'अभी यह जाँच नहीं हो पाया',
  },

  // The login box MDG posts when it needs the outlet's portal logins (SDMS and
  // IRAS, or the one BPCL / HPCL portal). The words above it are the message's
  // own; these are the box. "{portal}" is the portal's name, the same in both
  // languages. What is typed goes to the outlet's record and never into the
  // chat, and the box says so.
  'chat.portalTitle': { en: '{portal} login', hi: '{portal} लॉगिन' },
  'chat.portalNeeded': { en: 'Needed', hi: 'बाकी' },
  // Shown instead of "Needed" when the team marked this login not needed for the outlet.
  'chat.portalNotNeeded': { en: 'Not needed', hi: 'ज़रूरत नहीं' },
  'chat.portalSaved': { en: 'Saved', hi: 'मिल गया' },
  'chat.portalRefused': { en: 'Old password not working', hi: 'पुराना पासवर्ड नहीं चल रहा' },
  'chat.portalSavedOn': { en: 'Saved · {date}', hi: 'मिल गया · {date}' },
  'chat.portalChange': { en: 'Change', hi: 'बदलें' },
  'chat.portalOwnerFills': { en: 'The owner fills this', hi: 'मालिक भरेंगे' },
  'chat.portalUserId': { en: 'User ID', hi: 'यूज़र आईडी' },
  'chat.portalPassword': { en: 'Password', hi: 'पासवर्ड' },
  'chat.portalShowPassword': { en: 'Show password', hi: 'पासवर्ड दिखाएं' },
  'chat.portalHidePassword': { en: 'Hide password', hi: 'पासवर्ड छुपाएं' },
  'chat.portalSave': { en: 'Save', hi: 'सेव करें' },
  'chat.portalKeptSafe': {
    en: 'Kept safe — never shown in the chat',
    hi: 'सुरक्षित रखा जाएगा, चैट में नहीं दिखेगा',
  },
  'chat.portalSameAsRefused': {
    en: 'This is the password that stopped working. Enter the new one.',
    hi: 'यही पासवर्ड नहीं चल रहा था। नया पासवर्ड भरिए।',
  },
  'chat.portalRateLimited': {
    en: 'Try again in a little while',
    hi: 'थोड़ी देर बाद फिर कोशिश करें',
  },
  'chat.portalSaveFailed': {
    en: "Couldn't save — try again",
    hi: 'सेव नहीं हुआ, फिर से कोशिश करें',
  },

  // Selecting messages (long-press).
  'chat.clearSelection': { en: 'Clear selection', hi: 'चुनाव हटाएं' },

  // Searching inside the chat.
  'chat.searchPlaceholder': { en: 'Search', hi: 'खोजें' },
  'chat.searchClear': { en: 'Clear', hi: 'मिटाएं' },
  'chat.searchOlder': { en: 'Older result', hi: 'पुराना नतीजा' },
  'chat.searchNewer': { en: 'Newer result', hi: 'नया नतीजा' },
  'chat.searchHint': { en: 'Type 2 letters', hi: '2 अक्षर लिखिए' },
  'chat.searching': { en: 'Searching…', hi: 'खोज रहे हैं…' },
  'chat.searchFailed': {
    en: "Couldn't search. Try again",
    hi: 'खोज नहीं हो सकी। फिर कोशिश करें',
  },
  'chat.searchNone': { en: 'No results', hi: 'कुछ नहीं मिला' },
  'chat.searchCount': { en: '{i} of {n}', hi: '{n} में से {i}' },

  // Chat info (tap the chat's name).
  'chat.infoTitle': { en: 'Chat info', hi: 'चैट की जानकारी' },
  'chat.infoGroupSubtitle': { en: 'Group · {n} members', hi: 'ग्रुप · {n} सदस्य' },
  'chat.infoMembers': { en: '{n} members', hi: '{n} सदस्य' },
  'chat.infoWhoAnswers': {
    en: 'The MDG team answers your messages here.',
    hi: 'यहाँ आपके संदेशों का जवाब MDG की टीम देती है।',
  },

  /* ── wa:media — viewer, gallery, composer, send preview ──────────────── */
  'media.viewer.showInChat': { en: 'Show in chat', hi: 'चैट में दिखाएं' },
  'media.viewer.loadingOlder': {
    en: 'Getting older pictures…',
    hi: 'पुरानी फोटो आ रही हैं…',
  },
  'media.title': { en: 'Media, links and docs', hi: 'मीडिया, लिंक और दस्तावेज़' },
  'media.thisMonth': { en: 'This month', hi: 'इस महीने' },
  'media.loadMoreFailed': {
    en: "Couldn't load more. Tap to try again.",
    hi: 'और लोड नहीं हो सके। फिर कोशिश करने के लिए दबाएं।',
  },
  'media.gallery': { en: 'Photos in this chat', hi: 'इस चैट की फोटो' },
  'composer.message': { en: 'Message', hi: 'मैसेज' },
  'composer.attach': { en: 'Attach', hi: 'जोड़ें' },
  'composer.attachDocument': { en: 'Document', hi: 'दस्तावेज़' },
  'composer.attachCamera': { en: 'Camera', hi: 'कैमरा' },
  'composer.attachGallery': { en: 'Gallery', hi: 'गैलरी' },
  'composer.attachPhotos': { en: 'Photos', hi: 'फ़ोटो' },
  'composer.maxFiles': {
    en: 'You can send up to {n} files at once',
    hi: 'एक बार में {n} फाइल तक भेज सकते हैं',
  },
  'composer.captionPlaceholder': { en: 'Add a caption…', hi: 'कैप्शन लिखें…' },
  'composer.addMore': { en: 'Add more photos', hi: 'और फोटो जोड़ें' },
  'composer.dropPhoto': { en: 'Remove this photo', hi: 'यह फोटो हटाएं' },
  'composer.photoN': { en: 'Photo {n} of {total}', hi: 'फोटो {n} / {total}' },

  /* ── setting up a new outlet (onboarding): the strip and its cards ───── */
  'setup.stripLabel': { en: 'Getting your services started', hi: 'आपकी सेवाएँ शुरू करने के कदम' },
  'setup.stepCompany': { en: 'Company', hi: 'कंपनी' },
  'setup.stepBilling': { en: 'Bill address', hi: 'बिल का पता' },
  'setup.stepPayment': { en: 'Payment', hi: 'भुगतान' },
  'setup.stepLogins': { en: 'Logins', hi: 'लॉगिन' },
  'setup.stepStart': { en: 'Start', hi: 'शुरू' },
  // Spoken by a screen reader beside each step, never drawn.
  'setup.stateDone': { en: 'done', hi: 'हो गया' },
  'setup.stateCurrent': { en: 'now', hi: 'अभी' },
  'setup.stateTodo': { en: 'later', hi: 'बाद में' },
  'setup.stateSkipped': { en: 'not needed', hi: 'ज़रूरत नहीं' },
  // Under the strip, once the setup walkthrough video is uploaded.
  'setup.howItWorks': { en: 'How setup works — a short video', hi: 'सेटअप कैसे होता है — छोटा वीडियो' },
  // The one line under the strip: what is happening now. Nothing here says how
  // to pay, or where: the Play Store does not allow it inside the app.
  'setup.nowCompany': {
    en: 'Tell us which company your pump is with',
    hi: 'बताइए आपका पंप किस कंपनी का है',
  },
  'setup.nowBilling': {
    en: 'Fill in the name and address for your bill',
    hi: 'बिल का नाम और पता भरिए',
  },
  'setup.nowBillPrep': {
    en: "MDG's team is getting your bill ready",
    hi: 'MDG की टीम आपका बिल तैयार कर रही है',
  },
  'setup.nowBillSent': { en: 'Your bill has been sent', hi: 'आपका बिल भेज दिया गया है' },
  'setup.nowLogins': { en: 'Add your portal logins', hi: 'अपने पोर्टल के लॉगिन भरिए' },
  'setup.nowSetup': {
    en: "MDG's team is getting your services ready",
    hi: 'MDG की टीम आपकी सेवाएँ तैयार कर रही है',
  },
  'setup.nowWatch': { en: 'Your services have started', hi: 'आपकी सेवाएँ शुरू हो गई हैं' },
  'setup.loadFailed': { en: "Couldn't load this just now", hi: 'अभी यह लोड नहीं हो सका' },
  'setup.ownerFills': { en: 'The owner fills this', hi: 'मालिक भरेंगे' },
  'setup.change': { en: 'Change', hi: 'बदलें' },
  'setup.saveFailed': { en: "Couldn't save — try again", hi: 'सेव नहीं हो सका — फिर कोशिश कीजिए' },
  /* company card */
  'setup.companyQuestion': {
    en: 'Which company is your petrol pump with?',
    hi: 'आपका पेट्रोल पंप किस कंपनी का है?',
  },
  'setup.companyFirst': {
    en: "First tell us which company your pump is with, in the company card in this chat.",
    hi: 'पहले इस चैट के कंपनी वाले कार्ड में बताइए कि आपका पंप किस कंपनी का है।',
  },
  'setup.companyLocked': {
    en: 'Your services have started, so the company cannot be changed here any more.',
    hi: 'आपकी सेवाएँ शुरू हो चुकी हैं, इसलिए कंपनी अब यहाँ बदली नहीं जा सकती।',
  },
  /* billing card */
  'setup.billName': { en: 'Name on the bill', hi: 'बिल पर नाम' },
  'setup.billAddress': { en: 'Address (one line)', hi: 'पता (एक लाइन में)' },
  'setup.billState': { en: 'State', hi: 'राज्य' },
  'setup.billStatePick': { en: 'Choose your state', hi: 'अपना राज्य चुनिए' },
  'setup.billGstin': { en: 'GST number (only if you have one)', hi: 'GST नंबर (हो तो)' },
  'setup.billNoGst': { en: 'No GST number', hi: 'GST नंबर नहीं देना' },
  'setup.noGstGiven': { en: 'No GST number given', hi: 'GST नंबर नहीं दिया' },
  'setup.gstinHelp': {
    en: 'Only if you want GST credit. 15 letters and digits.',
    hi: 'GST क्रेडिट चाहिए तभी भरिए। 15 अक्षर और अंक।',
  },
  'setup.gstinCount': { en: '{n} of 15', hi: '{n} / 15' },
  'setup.gstinOk': { en: 'GST number looks right', hi: 'GST नंबर सही है' },
  'setup.gstinBad': {
    en: 'This GST number does not look right. Please check it.',
    hi: 'यह GST नंबर सही नहीं लगता। कृपया जाँच लीजिए।',
  },
  'setup.gstinState': {
    en: 'State taken from the GST number',
    hi: 'राज्य GST नंबर से लिया गया है',
  },
  // Beside a step MDG's team did for the dealer: only where the view says so.
  'setup.filledByMdg': { en: "Filled in by MDG's team", hi: 'MDG की टीम ने भरा' },
  'setup.billSave': { en: 'Save', hi: 'सेव करें' },
  'setup.billSaved': { en: 'Bill details saved', hi: 'बिल की जानकारी सेव हो गई' },
  'setup.billLocked': {
    en: 'Payment has been received, so these details cannot be changed here any more.',
    hi: 'भुगतान मिल चुका है, इसलिए ये जानकारी अब यहाँ बदली नहीं जा सकती।',
  },
  'setup.billErrName': { en: 'Enter the name for the bill', hi: 'बिल का नाम भरिए' },
  'setup.billErrAddress': { en: 'Enter the address', hi: 'पता भरिए' },
  'setup.billErrState': { en: 'Choose your state', hi: 'अपना राज्य चुनिए' },
  /* the bill: what is due and what was paid, and nothing to press */
  'setup.payPreparing': {
    en: "MDG's team is getting your bill ready.",
    hi: 'MDG की टीम आपका बिल तैयार कर रही है।',
  },
  'setup.billLine': { en: 'Bill: {amount} · due {date}', hi: 'बिल: {amount} · आख़िरी तारीख़ {date}' },
  'setup.billLineNoDate': { en: 'Bill: {amount}', hi: 'बिल: {amount}' },
  'setup.payPaid': { en: 'Payment received', hi: 'भुगतान मिल गया' },
  'setup.payPaidOn': { en: 'Received on {date}', hi: '{date} को मिला' },
  // A bill past its day, and the receipt of one that was paid: facts about the bill,
  // never an instruction. The receipt link opens the read-only receipt page.
  'setup.billOverdue': { en: 'The due date has passed', hi: 'आख़िरी तारीख़ निकल चुकी है' },
  'setup.viewReceipt': { en: 'View receipt', hi: 'रसीद देखें' },
  'setup.started': { en: 'Your services have started', hi: 'आपकी सेवाएँ शुरू हो गई हैं' },
  /* ── payments (ADR 0022) ─────────────────────────────────────────────── */
  // What MDG has asked this pump to pay, and what it has paid. Written to be
  // true wherever the screen runs: the same words are shown inside the Android
  // app, where nothing here may tell the dealer to pay anywhere else (Google
  // Play's Payments policy), so no sentence points at a place or a way to pay.
  'payments.title': { en: 'Payments', hi: 'भुगतान' },
  'payments.detailTitle': { en: 'Payment', hi: 'भुगतान' },
  'payments.sectionDue': { en: 'Due', hi: 'बाकी भुगतान' },
  'payments.sectionHistory': { en: 'Paid and earlier', hi: 'हो चुके भुगतान' },
  'payments.nothingDue': {
    en: 'Nothing is due right now.',
    hi: 'अभी कुछ भी बाकी नहीं है।',
  },
  'payments.dueBy': { en: 'Due by {date}', hi: '{date} तक देना है' },
  'payments.paidOn': { en: 'Paid on {date}', hi: '{date} को चुकाया' },
  'payments.paidOnVia': {
    en: 'Paid on {date} · {method}',
    hi: '{date} को चुकाया · {method}',
  },
  'payments.refundedAmount': { en: '{amount} refunded', hi: '{amount} वापस हुए' },
  'payments.receiptNo': { en: 'Receipt {number}', hi: 'रसीद {number}' },
  'payments.pay': { en: 'Pay {amount}', hi: '{amount} चुकाएँ' },
  'payments.opening': { en: 'Opening payment…', hi: 'भुगतान खुल रहा है…' },
  'payments.checking': { en: 'Checking…', hi: 'जाँच रहे हैं…' },
  'payments.confirming': {
    en: 'Confirming your payment…',
    hi: 'आपका भुगतान पक्का कर रहे हैं…',
  },
  // After a minute with no answer. The money is not lost and the dealer is not
  // told it failed: the server finds it on its own, and a message follows.
  'payments.confirmingNote': {
    en: 'Your payment is being confirmed. You will get a message when it is done.',
    hi: 'आपका भुगतान पक्का हो रहा है। हो जाने पर आपको मैसेज आएगा।',
  },
  'payments.paidNow': {
    en: 'Payment received. Thank you.',
    hi: 'भुगतान मिल गया। धन्यवाद।',
  },
  'payments.lastFailure': {
    en: 'Your last try did not go through: {reason}',
    hi: 'आपकी पिछली कोशिश नहीं हो पाई: {reason}',
  },
  // The last try failed and we could not tell why: no reason is made up.
  'payments.lastFailureGeneric': {
    en: 'Your last try did not go through.',
    hi: 'आपकी पिछली कोशिश नहीं हो पाई।',
  },
  // Razorpay's reasons are English and meant for developers. Only these short
  // phrases of ours are ever shown, chosen by what the reason says.
  'payments.failReason.declined': {
    en: 'the bank did not accept it',
    hi: 'बैंक ने इसे स्वीकार नहीं किया',
  },
  'payments.failReason.insufficient': {
    en: 'there was not enough balance',
    hi: 'खाते में पूरे पैसे नहीं थे',
  },
  'payments.failReason.expired': {
    en: 'the payment request ran out of time',
    hi: 'भुगतान का समय निकल गया',
  },
  'payments.failReason.cancelled': {
    en: 'the payment was cancelled',
    hi: 'भुगतान रद्द हो गया',
  },
  'payments.failReason.auth': {
    en: 'the bank could not confirm it was you',
    hi: 'बैंक आपकी पहचान पक्की नहीं कर पाया',
  },
  'payments.emptyTitle': { en: 'No payments yet', hi: 'अभी कोई भुगतान नहीं' },
  'payments.emptyDesc': {
    en: 'When MDG raises a payment for your pump, it will show here.',
    hi: 'जब MDG आपके पंप के लिए कोई भुगतान बनाएगी, वह यहाँ दिखेगा।',
  },
  'payments.errorTitle': {
    en: "We couldn't show your payments just now",
    hi: 'अभी आपके भुगतान नहीं दिख पाए',
  },
  // The server has no Razorpay keys yet (ADR 0022 rule 7): every payments route
  // answers 503, the reading ones too. Not a network fault, so not the network line.
  'payments.notConfiguredTitle': {
    en: 'Payments are not switched on yet',
    hi: 'भुगतान की सुविधा अभी चालू नहीं है',
  },
  'payments.notConfiguredDesc': {
    en: 'Please check again later.',
    hi: 'कृपया बाद में फिर देखें।',
  },
  'payments.notFoundTitle': {
    en: "We couldn't find this payment",
    hi: 'यह भुगतान नहीं मिला',
  },
  'payments.notFoundDesc': {
    en: 'It may have been removed.',
    hi: 'हो सकता है इसे हटा दिया गया हो।',
  },

  // The six statuses, in the dealer's own words.
  'payments.status.due': { en: 'Due', hi: 'बाकी' },
  'payments.status.processing': { en: 'Being confirmed', hi: 'पक्का हो रहा है' },
  'payments.status.paid': { en: 'Paid', hi: 'चुका दिया' },
  'payments.status.cancelled': { en: 'Cancelled', hi: 'रद्द' },
  'payments.status.partiallyRefunded': { en: 'Part refunded', hi: 'कुछ पैसे वापस' },
  'payments.status.refunded': { en: 'Refunded', hi: 'पैसे वापस' },

  // How it was paid. Razorpay's own name is shown for anything not listed.
  'payments.method.upi': { en: 'UPI', hi: 'UPI' },
  'payments.method.card': { en: 'Card', hi: 'कार्ड' },
  'payments.method.netbanking': { en: 'Net banking', hi: 'नेट बैंकिंग' },
  'payments.method.wallet': { en: 'Wallet', hi: 'वॉलेट' },
  'payments.method.emi': { en: 'EMI', hi: 'EMI' },
  'payments.method.paylater': { en: 'Pay later', hi: 'बाद में भुगतान' },
  'payments.method.bankTransfer': { en: 'Bank transfer', hi: 'बैंक ट्रांसफर' },
  'payments.method.cash': { en: 'Cash', hi: 'नकद' },
  'payments.method.cheque': { en: 'Cheque', hi: 'चेक' },

  // The receipt.
  'payments.receipt.title': { en: 'Receipt', hi: 'रसीद' },
  'payments.receipt.number': { en: 'Receipt number', hi: 'रसीद नंबर' },
  'payments.receipt.amount': { en: 'Amount paid', hi: 'चुकाई गई रकम' },
  'payments.receipt.paidAt': { en: 'Paid on', hi: 'चुकाने का समय' },
  'payments.receipt.method': { en: 'Paid by', hi: 'कैसे चुकाया' },
  'payments.receipt.reference': { en: 'Reference', hi: 'रेफ़रेंस नंबर' },
  'payments.receipt.refunded': { en: 'Refunded', hi: 'वापस हुए' },

  // The GST invoice and credit notes under the receipt (ADR 0022 §11). Shown
  // inside the Android app too: it is a paper for something already paid.
  'payments.invoice.title': { en: 'GST invoice', hi: 'GST इनवॉइस' },
  'payments.invoice.number': { en: 'Invoice number', hi: 'इनवॉइस नंबर' },
  'payments.invoice.date': { en: 'Date', hi: 'तारीख' },
  'payments.invoice.taxable': { en: 'Value before tax', hi: 'टैक्स से पहले की रकम' },
  // The tax names are the names on the return, so they read the same in both languages.
  'payments.invoice.cgst': { en: 'CGST ({rate}%)', hi: 'CGST ({rate}%)' },
  'payments.invoice.sgst': { en: 'SGST ({rate}%)', hi: 'SGST ({rate}%)' },
  'payments.invoice.igst': { en: 'IGST ({rate}%)', hi: 'IGST ({rate}%)' },
  'payments.invoice.roundOff': { en: 'Round off', hi: 'राउंड ऑफ़' },
  'payments.invoice.total': { en: 'Total', hi: 'कुल' },
  'payments.invoice.creditNoteTitle': { en: 'Credit note', hi: 'क्रेडिट नोट' },
  'payments.invoice.creditNoteNumber': { en: 'Credit note number', hi: 'क्रेडिट नोट नंबर' },
  'payments.invoice.against': { en: 'Against invoice', hi: 'किस इनवॉइस पर' },
  'payments.invoice.totalCredited': { en: 'Total credited', hi: 'कुल क्रेडिट' },
  'payments.invoice.download': { en: 'Download', hi: 'डाउनलोड करें' },
  // What a screen reader says: two buttons that both read "Download" need telling apart.
  'payments.invoice.downloadInvoiceAs': {
    en: 'Download GST invoice {number}',
    hi: 'GST इनवॉइस {number} डाउनलोड करें',
  },
  'payments.invoice.downloadCreditNoteAs': {
    en: 'Download credit note {number}',
    hi: 'क्रेडिट नोट {number} डाउनलोड करें',
  },
  // Paid, but the invoice is not issued yet. One quiet line: the reason is ours to fix.
  'payments.invoice.preparing': {
    en: 'GST invoice is being prepared',
    hi: 'GST इनवॉइस तैयार हो रहा है',
  },
  'payments.invoice.downloading': {
    en: 'Your download is starting',
    hi: 'आपका डाउनलोड शुरू हो रहा है',
  },
  // The invoice printer is busy or could not finish: it passes, so say when to try.
  'payments.invoice.busy': {
    en: 'Your invoice is being prepared. Please try again in a minute.',
    hi: 'आपका इनवॉइस तैयार हो रहा है। कृपया एक मिनट बाद फिर कोशिश करें।',
  },
  'payments.invoice.downloadFailed': {
    en: "Couldn't download this. Please check your network and try again.",
    hi: 'यह डाउनलोड नहीं हो पाया। कृपया अपना नेटवर्क जांचें और फिर कोशिश करें।',
  },

  // What to say when a step of paying did not work. By the server's own codes.
  'payments.err.notConfigured': {
    en: 'Online payment is not switched on yet. Please try again later.',
    hi: 'ऑनलाइन भुगतान अभी चालू नहीं है। कृपया बाद में कोशिश करें।',
  },
  'payments.err.notPayable': {
    en: 'This payment cannot be paid any more. It may already be paid or cancelled.',
    hi: 'यह भुगतान अब नहीं हो सकता। हो सकता है यह पहले ही चुका दिया गया हो या रद्द हो गया हो।',
  },
  'payments.err.waitingForAutopay': {
    en: 'This bill is paid by the autopay approval we sent you by SMS. Approve it once with your UPI PIN.',
    hi: 'यह बिल उस ऑटोपे मंज़ूरी से चुकेगा जो हमने आपको SMS से भेजी है। उसे एक बार अपने UPI PIN से मंज़ूर करें।',
  },
  'payments.err.badSignature': {
    en: "We couldn't confirm this payment just now. If money was cut from your account, please don't pay again. We will check it.",
    hi: 'अभी यह भुगतान पक्का नहीं हो पाया। अगर आपके खाते से पैसे कट गए हों, तो दोबारा न चुकाएँ। हम जाँच लेंगे।',
  },
  'payments.err.rateLimited': {
    en: 'Too many tries. Please wait a few minutes and try again.',
    hi: 'बहुत बार कोशिश हो गई। कृपया कुछ मिनट रुककर फिर कोशिश करें।',
  },
  'payments.err.provider': {
    en: 'The payment service did not answer. Please try again in a minute.',
    hi: 'पेमेंट सर्विस से जवाब नहीं आया। कृपया एक मिनट बाद फिर कोशिश करें।',
  },
  'payments.err.script': {
    en: 'The payment window did not load. Check your network and try again.',
    hi: 'पेमेंट विंडो लोड नहीं हुई। नेटवर्क जांचें और फिर कोशिश करें।',
  },
  'payments.err.window': {
    en: 'The payment window could not open. Please try again.',
    hi: 'पेमेंट विंडो नहीं खुल पाई। कृपया फिर कोशिश करें।',
  },
  'payments.err.failed': {
    en: 'The payment did not go through. You can try again.',
    hi: 'भुगतान नहीं हो पाया। आप फिर कोशिश कर सकते हैं।',
  },
  'payments.err.failedWith': {
    en: 'The payment did not go through: {reason}',
    hi: 'भुगतान नहीं हो पाया: {reason}',
  },
  'payments.err.notCompleted': {
    en: 'The payment was not completed. You can try again.',
    hi: 'भुगतान पूरा नहीं हुआ। आप फिर कोशिश कर सकते हैं।',
  },
  // A due bill that autopay will take by itself, in place of "Due by …".
  'payments.autopayWillTake': {
    en: 'Autopay will take this on {date}',
    hi: 'ऑटोपे {date} को काटेगा',
  },
  // The day autopay was to take the bill has passed and the bill is still due:
  // the debit did not go through and autopay is trying again.
  'payments.autopayRetrying': {
    en: 'Autopay could not take this yet. It is trying again.',
    hi: 'ऑटोपे अभी इसे नहीं काट पाया। वह फिर कोशिश कर रहा है।',
  },

  // A first bill whose autopay approval is out and not yet approved. Said in the
  // app too: it names no link and no way to pay, only where the bill stands.
  'payments.waitingForApproval': {
    en: 'Waiting for your autopay approval. Nothing has been taken yet.',
    hi: 'आपकी ऑटोपे मंज़ूरी का इंतज़ार है। अभी तक कुछ नहीं कटा है।',
  },

  /* ── autopay (ADR 0022 §13) ──────────────────────────────────────────── */
  // The monthly bill taken by itself. Inside the app autopay is only SHOWN and
  // STOPPED: nothing here points at a way to turn it on (Google Play's Payments
  // policy), and stopping it is one screen and one confirm — no second "are you
  // sure", no required reason, no guilt (India's dark-patterns rules).
  'autopay.title': { en: 'Autopay', hi: 'ऑटोपे' },
  'autopay.pump': { en: 'Pump {code}', hi: 'पंप {code}' },

  // The state in a word, on the chip.
  'autopay.chip.settingUp': { en: 'Waiting', hi: 'इंतज़ार' },
  'autopay.chip.on': { en: 'On', hi: 'चालू' },
  'autopay.chip.failing': { en: 'Needs attention', hi: 'ध्यान दें' },
  'autopay.chip.off': { en: 'Off', hi: 'बंद' },

  // The line under "Autopay" on the Help row and the Payments card.
  'autopay.sub.settingUp': {
    en: 'Waiting for your approval',
    hi: 'आपकी मंज़ूरी का इंतज़ार',
  },
  'autopay.sub.on': {
    en: '{amount} a month · next {date}',
    hi: '{amount} हर महीने · अगली {date}',
  },
  'autopay.sub.onNoDate': { en: '{amount} a month', hi: '{amount} हर महीने' },
  'autopay.sub.failing': {
    en: 'Last payment did not go through',
    hi: 'पिछला भुगतान नहीं हुआ',
  },
  'autopay.sub.off': { en: 'Off · works till {date}', hi: 'बंद · {date} तक चलेगा' },
  'autopay.sub.offNoDate': { en: 'Off', hi: 'बंद' },

  // The body of the card on the Autopay screen.
  'autopay.body.settingUp': {
    en: 'Waiting for your approval. Nothing has been taken.',
    hi: 'आपकी मंज़ूरी का इंतज़ार है। अभी कुछ नहीं कटा।',
  },
  'autopay.body.on': {
    en: 'Taken from your UPI account every month. Next: {date}. Your UPI app warns you a day before. You can also stop it in your UPI app.',
    hi: 'हर महीने आपके UPI खाते से कटेंगे। अगली तारीख: {date}। UPI ऐप एक दिन पहले बता देगा। आप इसे UPI ऐप में भी बंद कर सकते हैं।',
  },
  'autopay.body.onNoDate': {
    en: 'Taken from your UPI account every month. Your UPI app warns you a day before. You can also stop it in your UPI app.',
    hi: 'हर महीने आपके UPI खाते से कटेंगे। UPI ऐप एक दिन पहले बता देगा। आप इसे UPI ऐप में भी बंद कर सकते हैं।',
  },
  'autopay.body.failing': {
    en: 'The last {amount} debit did not go through. Check the balance in your UPI account.',
    hi: 'पिछले {amount} नहीं कट पाए। अपने UPI खाते की रकम जाँचिए।',
  },

  // The one button, and the dialog it opens.
  'autopay.stop': { en: 'Stop autopay', hi: 'ऑटोपे बंद करें' },
  'autopay.cancelSetup': { en: 'Cancel setup', hi: 'सेटअप रद्द करें' },
  'autopay.dialog.title': { en: 'Stop autopay?', hi: 'ऑटोपे बंद करें?' },
  'autopay.dialog.cancelSetupTitle': {
    en: 'Cancel autopay setup?',
    hi: 'ऑटोपे सेटअप रद्द करें?',
  },
  'autopay.dialog.inProgress': {
    en: '{amount} is being taken right now. Stopping will not undo it.',
    hi: 'अभी {amount} कट रहे हैं। बंद करने से यह वापस नहीं होगा।',
  },
  'autopay.dialog.body': {
    en: 'No money will be taken automatically after this. Dealer Kavach keeps working till {date}. After that you get a bill each month.',
    hi: 'इसके बाद पैसे अपने-आप नहीं कटेंगे। डीलर कवच {date} तक चलता रहेगा। उसके बाद हर महीने का बिल आएगा।',
  },
  // No month is paid yet (the first bill is still open): do not say the service is running on a paid month.
  'autopay.dialog.bodyNoDate': {
    en: 'No money will be taken automatically after this. Nothing has been taken so far. Your first bill is still to be paid.',
    hi: 'इसके बाद पैसे अपने-आप नहीं कटेंगे। अभी तक कुछ नहीं कटा है। आपका पहला बिल अभी चुकाना बाकी है।',
  },
  // The same, while "Also give me my first month back" is ticked: no promise of a
  // bill each month to a dealer who is asking for the money back.
  'autopay.dialog.bodyRefund': {
    en: 'No money will be taken automatically after this. Dealer Kavach keeps working till {date}.',
    hi: 'इसके बाद पैसे अपने-आप नहीं कटेंगे। डीलर कवच {date} तक चलता रहेगा।',
  },
  'autopay.dialog.bodyRefundNoDate': {
    en: 'No money will be taken automatically after this.',
    hi: 'इसके बाद पैसे अपने-आप नहीं कटेंगे।',
  },
  'autopay.dialog.reasonLabel': { en: 'Why? (optional)', hi: 'क्यों? (ज़रूरी नहीं)' },
  'autopay.reason.pay_myself': {
    en: "I'll pay myself each month",
    hi: 'हर महीने खुद भरूँगा',
  },
  'autopay.reason.too_expensive': { en: 'Price is too much', hi: 'दाम ज़्यादा है' },
  'autopay.reason.not_useful': {
    en: 'Not useful / something is wrong',
    hi: 'काम का नहीं / कुछ गड़बड़ है',
  },
  'autopay.reason.closing': {
    en: 'Closing or selling the pump',
    hi: 'पंप बंद या बेच रहा हूँ',
  },
  'autopay.reason.other': { en: 'Something else', hi: 'कुछ और' },
  'autopay.dialog.help': {
    en: 'Something not right? Ask in chat.',
    hi: 'कुछ ठीक नहीं? चैट में पूछिए।',
  },
  'autopay.dialog.helpRefund': {
    en: 'Not happy with the first month? We refund it in full. Ask in chat.',
    hi: 'पहला महीना पसंद नहीं आया? पूरा पैसा वापस होगा। चैट में पूछिए।',
  },
  // Only inside the first month. Off at first; ticking it asks for the money back.
  'autopay.dialog.refundTick': {
    en: 'Also give me my first month back',
    hi: 'मेरा पहला महीना भी वापस कर दें',
  },
  'autopay.dialog.keep': { en: 'Keep autopay', hi: 'ऑटोपे चालू रखें' },
  'autopay.dialog.keepSetup': { en: 'Keep setup', hi: 'सेटअप रखें' },
  'autopay.dialog.saving': { en: 'Stopping…', hi: 'बंद हो रहा है…' },
  // Only said when the server itself answered "Razorpay did not answer, nothing changed".
  'autopay.dialog.failed': {
    en: 'Not stopped. The payment service did not answer. Nothing has changed. Please try again in a minute.',
    hi: 'बंद नहीं हुआ। पेमेंट सर्विस से जवाब नहीं आया। कुछ नहीं बदला। कृपया एक मिनट बाद फिर कोशिश करें।',
  },
  // The server said online payments are switched off: it touched nothing.
  'autopay.dialog.notConfigured': {
    en: 'Not stopped. Online payment is switched off right now. Nothing has changed. Please try again later.',
    hi: 'बंद नहीं हुआ। ऑनलाइन भुगतान अभी बंद है। कुछ नहीं बदला। कृपया बाद में फिर कोशिश करें।',
  },
  // The payment service answered, and refused: the server touched nothing.
  'autopay.dialog.refused': {
    en: 'Not stopped. The payment service refused it. Nothing has changed. Please try again in a minute.',
    hi: 'बंद नहीं हुआ। पेमेंट सर्विस ने मना कर दिया। कुछ नहीं बदला। कृपया एक मिनट बाद फिर कोशिश करें।',
  },
  // Any other refusal the server itself gave (too many tries, a bad request): it touched nothing.
  'autopay.dialog.notStopped': {
    en: 'Not stopped. Nothing has changed. Please try again in a minute.',
    hi: 'बंद नहीं हुआ। कुछ नहीं बदला। कृपया एक मिनट बाद फिर कोशिश करें।',
  },
  // The answer never came (a slow link, a timeout): it may or may not have stopped.
  'autopay.dialog.unconfirmed': {
    en: 'We could not confirm. Autopay may already be stopped. The screen will show how it stands now.',
    hi: 'जवाब नहीं मिल पाया। हो सकता है ऑटोपे बंद हो गया हो। स्क्रीन पर अभी की हालत दिखेगी।',
  },

  // After the server has answered, and only then.
  'autopay.toast.stopped': {
    en: 'Autopay stopped. No more money will be taken.',
    hi: 'ऑटोपे बंद हो गया। अब पैसे नहीं कटेंगे।',
  },
  'autopay.toast.alreadyOff': { en: 'Autopay is already off.', hi: 'ऑटोपे पहले से बंद है।' },
  // The refund tick was ticked, and there was no autopay left to stop: the ask did not
  // go anywhere, so say how to make it.
  'autopay.toast.alreadyOffRefund': {
    en: 'Autopay was already off. To get your first month back, ask us in chat.',
    hi: 'ऑटोपे पहले से बंद था। पहला महीना वापस पाने के लिए चैट में हमसे कहिए।',
  },

  // The screen once it is off.
  'autopay.off.title': { en: 'Autopay is off', hi: 'ऑटोपे बंद है' },
  'autopay.off.body': {
    en: 'Dealer Kavach works till {date}. Nothing will be taken automatically.',
    hi: 'डीलर कवच {date} तक चलेगा। पैसे अपने-आप नहीं कटेंगे।',
  },
  'autopay.off.bodyNoDate': {
    en: 'Nothing will be taken automatically.',
    hi: 'पैसे अपने-आप नहीं कटेंगे।',
  },
  // After a stop that also asked for the first month back, and under the tick while it is
  // ticked. The refund never depends on the call.
  'autopay.off.refundAsked': {
    en: 'We will refund your first month. Our team will call you about it.',
    hi: 'हम आपके पहले महीने का पैसा लौटा देंगे। हमारी टीम इस बारे में आपको कॉल करेगी।',
  },
  // On the card while autopay is running: the last day already paid for.
  'autopay.paidTill': {
    en: 'Services paid till {date}',
    hi: 'डीलर कवच {date} तक चलेगा',
  },
  'autopay.off.stopService': {
    en: 'Want to stop Dealer Kavach itself? Tell us in chat.',
    hi: 'डीलर कवच ही बंद करना है? चैट में बताइए।',
  },

  // The other screens.
  // The Help row and the Payments card when the status would not load: they still
  // lead to the Autopay screen, which has its own Try again.
  'autopay.sub.unknown': {
    en: 'Could not load just now. Tap to open.',
    hi: 'अभी लोड नहीं हुआ। खोलने के लिए छुएँ।',
  },
  'autopay.loadFailedTitle': {
    en: "We couldn't load your autopay",
    hi: 'आपका ऑटोपे लोड नहीं हुआ',
  },
  'autopay.noneTitle': {
    en: 'Autopay is not on for this pump',
    hi: 'इस पंप पर ऑटोपे चालू नहीं है',
  },
  'autopay.ownerOnlyTitle': {
    en: 'Only the owner can change autopay',
    hi: 'ऑटोपे सिर्फ़ मालिक बदल सकते हैं',
  },

  // ── one person, several outlets ──────────────────────────────────────────
  // The dealer's own word is "pump"; the chip shows the pump's code (15E).
  'outlets.chipLabel': {
    en: 'Pump {code}. Tap to switch pump',
    hi: 'पंप {code}। पंप बदलने के लिए दबाइए',
  },
  'outlets.title': { en: 'Your pumps', hi: 'आपके पंप' },
  'outlets.switchRow': { en: 'Switch pump', hi: 'पंप बदलें' },
  'outlets.switchRowDesc': { en: 'You are in {code} now', hi: 'अभी आप {code} में हैं' },
  'outlets.here': { en: 'You are here', hi: 'अभी आप यहीं हैं' },
  'outlets.opening': { en: 'Opening {code}…', hi: '{code} खुल रहा है…' },
  'outlets.loading': { en: 'Loading your pumps…', hi: 'आपके पंप आ रहे हैं…' },
  'outlets.failed': {
    en: "Couldn't switch pump. Check your network and try again.",
    hi: 'पंप बदला नहीं जा सका। नेटवर्क जांचकर फिर कोशिश कीजिए।',
  },
  'outlets.unavailable': {
    en: 'That pump is not active right now. Please write to the MDG team in chat.',
    hi: 'यह पंप अभी चालू नहीं है। कृपया चैट में MDG टीम को लिखिए।',
  },
} satisfies Record<string, LangMessage>;

/** Every catalog key. Passing anything else to `t()` is a compile error. */
export type MessageKey = keyof typeof messages;

/** Interpolation variables for `{placeholder}` substitution. */
export type TVars = Record<string, string | number>;

/** The translate function returned by `useT()`. */
export type TFunction = (key: MessageKey, vars?: TVars) => string;

function interpolate(template: string, vars?: TVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name];
    return value === undefined ? match : String(value);
  });
}

/** Translate a catalog key for an explicit language (use outside React). */
export function translate(lang: Lang, key: MessageKey, vars?: TVars): string {
  return interpolate(messages[key][lang], vars);
}

/** Choose between two already-authored strings — for bilingual DATA fields. */
export function pick(lang: Lang, en: string, hi: string): string {
  return lang === 'hi' ? hi : en;
}

/** Read the current language reactively (for `pick()` at call sites). */
export function useLang(): Lang {
  return useLangStore((s) => s.lang);
}

/**
 * The primary hook: returns a stable `t(key, vars?)` bound to the current
 * language. Re-renders when the language changes.
 */
export function useT(): TFunction {
  const lang = useLangStore((s) => s.lang);
  return React.useCallback(
    (key: MessageKey, vars?: TVars) => translate(lang, key, vars),
    [lang],
  );
}
