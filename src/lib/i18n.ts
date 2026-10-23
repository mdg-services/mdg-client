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
  'auth.emailPlaceholder': {
    en: 'you@dealership.com',
    hi: 'you@dealership.com',
  },
  'auth.password': { en: 'Password', hi: 'पासवर्ड' },
  'auth.emailInvalid': { en: 'Enter a valid email', hi: 'सही ईमेल भरें' },
  'auth.passwordRequired': {
    en: 'Enter your password',
    hi: 'अपना पासवर्ड भरें',
  },
  'auth.signIn': { en: 'Sign in', hi: 'साइन इन करें' },
  // Nobody makes their own login: MDG creates every ID and password. So the
  // footer says where a login comes from and offers the way to get one.
  'auth.noLogin': {
    en: 'No login yet? Register your pump and the MDG team will send you your ID and password.',
    hi: 'अभी लॉगिन नहीं है? अपना पंप रजिस्टर कीजिए, MDG टीम आपको ID और पासवर्ड भेज देगी।',
  },
  'auth.register': { en: 'Register your pump', hi: 'अपना पंप रजिस्टर करें' },
  'auth.loginFailed': {
    en: "That email or password didn't work. Try again or contact support.",
    hi: 'यह ईमेल या पासवर्ड सही नहीं है। फिर से कोशिश करें या सपोर्ट से संपर्क करें।',
  },

  /* ── register (the website's enrolment form, inside the app) ─────────── */
  // The Hindi wording follows the website's enrolment page word for word where
  // the two say the same thing, so a dealer who has seen one recognises the other.
  'register.title': { en: 'Register your pump', hi: 'अपना पंप रजिस्टर करें' },
  'register.intro': {
    en: 'Fill in your details. Our team will call you to confirm your services and pricing, then send you your login ID and password.',
    hi: 'अपनी जानकारी भरिए। हमारी टीम कॉल करके आपकी सेवाएँ और क़ीमत पक्की करेगी, फिर आपको लॉगिन ID और पासवर्ड भेजेगी।',
  },
  'register.back': { en: 'Back to sign in', hi: 'साइन इन पर वापस' },
  'register.optional': { en: '(optional)', hi: '(ज़रूरी नहीं)' },
  'register.name': { en: 'Your name', hi: 'आपका नाम' },
  'register.namePlaceholder': { en: 'Ramesh Kumar', hi: 'रमेश कुमार' },
  'register.mobile': { en: 'Your mobile', hi: 'आपका मोबाइल' },
  'register.mobilePlaceholder': { en: 'Your mobile number', hi: 'अपना मोबाइल नंबर' },
  'register.email': { en: 'Your email', hi: 'आपका ईमेल' },
  'register.emailPlaceholder': { en: 'Enter your email', hi: 'अपना ईमेल लिखिए' },
  'register.siteType': { en: 'Site type', hi: 'साइट का प्रकार' },
  'register.pumpName': { en: 'Pump name', hi: 'पंप का नाम' },
  'register.pumpNamePlaceholder': { en: "Your pump's name", hi: 'अपने पंप का नाम' },
  'register.sapCode': { en: 'SAP code', hi: 'SAP कोड' },
  'register.sapCodePlaceholder': { en: 'Your SAP code', hi: 'अपना SAP कोड' },
  // The link sits inside the sentence, and in Hindi the verb lands after it,
  // so the tail carries the verb as well as the full stop.
  'register.agreeLead': { en: 'I have read and agree to the', hi: 'मैंने' },
  'register.termsLink': { en: 'Terms & Conditions', hi: 'नियम व शर्तें' },
  'register.agreeTail': { en: '.', hi: ' पढ़ ली हैं और मुझे मंज़ूर हैं।' },
  // The link inside the sentence drops out of the box's spoken name, so the
  // box carries the whole sentence itself.
  'register.agreeAria': {
    en: 'I agree to the Terms and Conditions',
    hi: 'मैं नियम व शर्तें मानता हूँ',
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
  'register.failed': {
    en: "Couldn't send your details. Check your network and try again.",
    hi: 'आपकी जानकारी नहीं भेजी जा सकी। नेटवर्क जांचें और फिर कोशिश करें।',
  },
  'register.successBadge': { en: 'Registration received', hi: 'नामांकन मिल गया' },
  'register.successTitle': {
    en: 'Thank you. Your details are with us.',
    hi: 'धन्यवाद। आपकी जानकारी हम तक पहुँच गई है।',
  },
  'register.successBody': {
    en: 'Our team will call you to confirm your services and pricing, usually within the hour (9am to 9pm, every day). After that we send you your login ID and password, and you sign in here.',
    hi: 'हमारी टीम कॉल करके आपकी सेवाएँ और क़ीमत पक्की कर लेगी, आमतौर पर एक घंटे के भीतर (सुबह 9 से रात 9, हर दिन)। इसके बाद हम आपको लॉगिन ID और पासवर्ड भेजेंगे, और आप यहीं साइन इन करेंगे।',
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

  // Settings and what hangs off it.
  'settings.title': { en: 'Settings', hi: 'सेटिंग' },
  'settings.profileTitle': { en: 'Profile', hi: 'प्रोफ़ाइल' },
  'settings.account': { en: 'Account', hi: 'खाता' },
  'settings.accountDesc': { en: 'Change your password', hi: 'अपना पासवर्ड बदलें' },
  'settings.team': { en: 'Your team', hi: 'आपकी टीम' },
  'settings.teamDesc': { en: 'Add or pause your manager', hi: 'मैनेजर जोड़ें या रोकें' },
  'settings.help': { en: 'Help', hi: 'मदद' },
  'settings.helpDesc': {
    en: 'Learn the app with short videos',
    hi: 'छोटे वीडियो से ऐप चलाना सीखिए',
  },
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
  'chat.voiceFailed': {
    en: "Couldn't play. Tap to try again",
    hi: 'चल नहीं सका। दोबारा दबाइए',
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

  // The login box MDG posts when it needs the outlet's SDMS / IRAS login. The
  // words above it are the message's own; these are the box. "{portal}" is the
  // portal's name, the same in both languages. What is typed goes to the
  // outlet's record and never into the chat, and the box says so.
  'chat.portalTitle': { en: '{portal} login', hi: '{portal} लॉगिन' },
  'chat.portalNeeded': { en: 'Needed', hi: 'बाकी' },
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
  'composer.maxFiles': {
    en: 'You can send up to {n} files at once',
    hi: 'एक बार में {n} फाइल तक भेज सकते हैं',
  },
  'composer.captionPlaceholder': { en: 'Add a caption…', hi: 'कैप्शन लिखें…' },
  'composer.addMore': { en: 'Add more photos', hi: 'और फोटो जोड़ें' },
  'composer.dropPhoto': { en: 'Remove this photo', hi: 'यह फोटो हटाएं' },
  'composer.photoN': { en: 'Photo {n} of {total}', hi: 'फोटो {n} / {total}' },
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
