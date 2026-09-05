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
  'common.loadFailed': {
    en: "Couldn't load this. Check your network and try again.",
    hi: 'यह लोड नहीं हो सका। नेटवर्क जांचें और फिर कोशिश करें।',
  },

  /* ── app / nav ──────────────────────────────────────────────────────── */
  'app.brand': { en: 'Dealer Kavach', hi: 'डीलर कवच' },
  'app.stillLoading': {
    en: 'Still loading — the connection is slow.',
    hi: 'अभी लोड हो रहा है — नेटवर्क धीमा है।',
  },
  'nav.chat': { en: 'Chat', hi: 'चैट' },
  'nav.reports': { en: 'Reports', hi: 'रिपोर्ट' },
  'nav.kavach': { en: 'Kavach', hi: 'कवच' },
  'nav.profile': { en: 'Profile', hi: 'प्रोफ़ाइल' },

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
  'auth.needAccess': {
    en: 'Need access? Contact your MDG account manager.',
    hi: 'एक्सेस चाहिए? अपने MDG अकाउंट मैनेजर से संपर्क करें।',
  },
  'auth.loginFailed': {
    en: "That email or password didn't work. Try again or contact support.",
    hi: 'यह ईमेल या पासवर्ड सही नहीं है। फिर से कोशिश करें या सपोर्ट से संपर्क करें।',
  },

  /* ── chat ───────────────────────────────────────────────────────────── */
  'chat.support': { en: 'Support', hi: 'सहायता' },
  'chat.supportSubtitle': {
    en: 'Real people, real fast replies',
    hi: 'असली लोग, तुरंत जवाब',
  },
  'chat.supportName': { en: 'Support', hi: 'सहायता' },
  'chat.online': { en: 'Online', hi: 'ऑनलाइन' },
  'chat.placeholder': {
    en: 'Type your message…',
    hi: 'अपना संदेश लिखें…',
  },
  'chat.send': { en: 'Send', hi: 'भेजें' },
  'chat.addPhoto': {
    en: 'Add a photo or document',
    hi: 'फोटो या दस्तावेज़ जोड़ें',
  },
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
  'chat.recordingHint': {
    en: 'Recording… tap send when done',
    hi: 'रिकॉर्ड हो रहा है… हो जाए तो भेजें दबाएं',
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
  'chat.emptyDesc': {
    en: 'Send a message and a real person from our support team will reply.',
    hi: 'संदेश भेजें, हमारी टीम का कोई व्यक्ति आपको जवाब देगा।',
  },
  // NOT USED YET, AND DELIBERATELY SO. `chat.emptyDesc` above promises that a
  // real person replies, and while every dealer's first-line mode is 'OFF' or
  // 'SHADOW' that is still exactly what happens — the machine posts nothing.
  // Swapping this in now would make the app lie in the other direction, telling
  // a dealer they will get an instant answer that no one has switched on for
  // them.
  //
  // SWITCH `chat.emptyDesc` TO THIS STRING IN THE DEPLOY THAT MOVES THE FIRST
  // DEALER FROM 'SHADOW' TO 'ON', not before and not in a later tidy-up. The
  // sentence names both halves on purpose: the answer is immediate, and a person
  // is still there — which is the whole bargain, and the half a dealer distrusts
  // is the second one.
  'chat.emptyDescInstant': {
    en: 'Send a message. You get an answer straight away, and a person from our team takes over whenever you need one.',
    hi: 'संदेश भेजें। जवाब तुरंत मिलेगा, और जब भी ज़रूरत हो, हमारी टीम का व्यक्ति खुद बात करेगा।',
  },
  'chat.quickReportIssue': {
    en: 'Report an issue',
    hi: 'कोई दिक्कत बताएं',
  },
  'chat.quickRequestService': {
    en: 'Request a service',
    hi: 'सेवा के लिए कहें',
  },
  'chat.quickTalkSupport': {
    en: 'Talk to support',
    hi: 'सहायता से बात करें',
  },

  /* ── the AI first line, from the dealer's side ──────────────────────────
     Three strings and a pair of chips. Nothing here says "AI", "bot" or
     "automatic": a dealer does not need to know which desk at MDG answered,
     only that the answer came at once and that a person is one tap away. */

  // The footnote under a reply the first line wrote. A footnote, not a badge —
  // it sits on the same line as the timestamp precisely so it cannot out-weigh
  // the answer it annotates.
  'chat.aiInstantReply': { en: 'Instant reply', hi: 'तुरंत जवाब' },
  // The button under that reply.
  'chat.aiTalkToHuman': { en: 'Talk to a person', hi: 'किसी व्यक्ति से बात करें' },
  // What the button SENDS, which is a different string from what it says. This
  // one lands in the thread as the dealer's own message, so it is written the
  // way a dealer writes ("I want…"), not the way a button label reads ("Talk
  // to…"). It also has to be plain enough that the backend reads it as a
  // request for a person and hands the thread over.
  //
  // BOTH SPELLINGS ARE MATCHED WORD-FOR-WORD BY THE BACKEND'S PRE-MODEL PHRASE
  // LIST (`assist/firstline/dissatisfied.ts`, HUMAN_PHRASES: 'talk to a person',
  // 'किसी से बात'), and that is the entire reason the Hindi reads "किसी से"
  // rather than "किसी व्यक्ति से". The English button already hit that list; the
  // Hindi one missed it by one word, so a Hindi dealer's tap for a person went
  // through the router while an English dealer's did not — and the whole point
  // of that list is that a request for a person never depends on a model call.
  // If either string is reworded, check it still matches, or add the new wording
  // to HUMAN_PHRASES in the same commit.
  'chat.aiTalkToHumanBody': {
    en: 'I want to talk to a person.',
    hi: 'मुझे किसी से बात करनी है।',
  },
  // The two chips above the composer, alongside `chat.quickTalkSupport`. Both
  // are questions a dealer asks most mornings and both are a nuisance to type
  // on a Devanagari phone keyboard, which is the entire point of a chip.
  'chat.quickTodayReport': { en: "Today's report?", hi: 'आज की रिपोर्ट?' },
  // REPLACED "Sent today's photo?" — see the note on `quickReplies` in
  // Composer.tsx. The wording is deliberately the glossary's own example for the
  // `todo` label ("ab kya karna hai" / "what do I need to do now"), so the chip
  // lands on the one intent that was written to answer it.
  'chat.quickWhatNow': { en: 'What do I need to do?', hi: 'अब क्या करना है?' },

  'chat.loadEarlier': {
    en: 'Load earlier messages',
    hi: 'पुराने संदेश देखें',
  },
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
  'chat.chatsTitle': { en: 'Chats', hi: 'बातचीत' },
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
  'chat.downloadFile': { en: 'Download {name}', hi: '{name} डाउनलोड करें' },
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
  'chat.mediaTitle': {
    en: 'Media, docs and links',
    hi: 'मीडिया, दस्तावेज़ और लिंक',
  },
  'chat.tabMedia': { en: 'Media', hi: 'मीडिया' },
  'chat.tabDocs': { en: 'Docs', hi: 'दस्तावेज़' },
  'chat.tabLinks': { en: 'Links', hi: 'लिंक' },
  'chat.noMedia': { en: 'No photos yet', hi: 'अभी कोई फोटो नहीं' },
  'chat.noDocs': { en: 'No documents yet', hi: 'अभी कोई दस्तावेज़ नहीं' },
  'chat.noLinks': { en: 'No links yet', hi: 'अभी कोई लिंक नहीं' },
  'chat.loadMore': { en: 'Load more', hi: 'और देखें' },

  /* ── records / reports ──────────────────────────────────────────────── */
  'records.title': { en: 'Reports', hi: 'रिपोर्ट' },
  'records.errorTitle': {
    en: "We couldn't show your reports just now",
    hi: 'अभी आपकी रिपोर्ट नहीं दिखा पाए',
  },
  'records.emptyTitle': { en: 'No reports yet', hi: 'अभी कोई रिपोर्ट नहीं' },
  'records.emptyDesc': {
    en: "Your reports will appear here. We'll message you when a new one is ready.",
    hi: 'आपकी रिपोर्ट यहां दिखेंगी। नई तैयार होने पर हम आपको बताएंगे।',
  },
  'records.tapToView': { en: 'Tap to view', hi: 'देखने के लिए दबाएं' },
  'records.preparing': { en: 'Preparing…', hi: 'तैयार हो रहा है…' },
  'record.type.dsr': {
    en: 'Daily Sales Report',
    hi: 'रोज़ की बिक्री रिपोर्ट',
  },
  'record.type.invoice': { en: 'Invoice', hi: 'बिल' },
  'record.type.compliance': { en: 'Compliance', hi: 'अनुपालन' },
  'record.type.statement': { en: 'Statement', hi: 'खाता विवरण' },
  'record.type.other': { en: 'Document', hi: 'दस्तावेज़' },

  /* ── kavach / pump health ───────────────────────────────────────────── */
  // The dealer certifies NOTHING on this screen (ADR 0011): an MDG admin or an
  // automation closes a task, and the dealer's photo is an input to that
  // decision. Every string below is written from that one fact, which is why
  // there is no "mark done" copy left in either language — a button whose words
  // promised completion would be a promise the API now refuses to keep.
  'kavach.title': { en: 'Pump health', hi: 'पंप हेल्थ' },
  'kavach.needHelp': {
    en: 'Need help? Message us',
    hi: 'मदद चाहिए? हमें लिखें',
  },
  'kavach.errorTitle': {
    en: "We couldn't load this just now",
    hi: 'अभी यह लोड नहीं हो पाया',
  },
  'kavach.retry': { en: 'Try again', hi: 'फिर कोशिश करें' },
  'kavach.welcomeTitle': {
    en: 'Welcome to Kavach',
    hi: 'कवच में स्वागत है',
  },
  'kavach.welcomeDesc': {
    en: "This is where you'll see what keeps your pump safe and compliant. The MDG team checks these for you, one at a time.",
    hi: 'यहां आप देखेंगे कि आपके पंप को सुरक्षित रखने के लिए क्या ज़रूरी है। MDG टीम इन्हें एक-एक करके जाँचती है।',
  },
  'kavach.settling': {
    en: 'Getting started — nothing to worry about yet.',
    hi: 'अभी शुरू कर रहे हैं — अभी चिंता की कोई बात नहीं।',
  },

  /* ── what the dealer can actually do: send what MDG asked for ───────── */
  'kavach.weNeedTitle': { en: 'We need from you', hi: 'आपसे चाहिए' },
  'kavach.weNeedDesc': {
    en: 'Send a photo for these and the MDG team will check them.',
    hi: 'इनकी फोटो भेजें, MDG टीम इन्हें जाँच लेगी।',
  },
  'kavach.sendPhoto': { en: 'Send a photo', hi: 'फोटो भेजें' },
  'kavach.choosePhoto': { en: 'Choose from phone', hi: 'फ़ोन से चुनें' },
  'kavach.sendAgain': { en: 'Send another photo', hi: 'दूसरी फोटो भेजें' },
  'kavach.rejectedTitle': {
    en: 'The MDG team needs another photo',
    hi: 'MDG टीम को दूसरी फोटो चाहिए',
  },
  'kavach.rejectedPreamble': { en: 'They wrote:', hi: 'उन्होंने लिखा:' },
  'kavach.photoSent': { en: 'Photo sent', hi: 'फोटो भेज दी' },
  'kavach.photoSentDesc': {
    en: 'The MDG team will check it and confirm.',
    hi: 'MDG टीम इसे जाँचकर पक्का करेगी।',
  },
  'kavach.notAPhoto': {
    en: 'That is not a photo. Please take a photo.',
    hi: 'यह फोटो नहीं है। कृपया फोटो लें।',
  },

  /* ── sent, and waiting on us. NEVER shown as done. ──────────────────── */
  'kavach.withMdgTitle': { en: 'With the MDG team', hi: 'MDG टीम के पास' },
  'kavach.sentWaiting': {
    en: 'Sent — the MDG team is looking',
    hi: 'भेज दिया — MDG टीम देख रही है',
  },
  'kavach.sentWaitingDesc': {
    en: 'This is not finished yet. It counts once the MDG team has checked it.',
    hi: 'यह अभी पूरा नहीं हुआ। MDG टीम के जाँचने के बाद ही यह गिना जाएगा।',
  },
  'kavach.sentOn': { en: 'Sent {date}', hi: '{date} को भेजा' },
  'kavach.seeWhatYouSent': {
    en: 'See what you sent',
    hi: 'आपने जो भेजा वह देखें',
  },

  /* ── the ring, and what it is honestly a measure of ─────────────────── */
  'kavach.stillPendingOne': {
    en: '1 thing is still pending',
    hi: '1 काम अभी बाकी है',
  },
  'kavach.stillPendingMany': {
    en: '{n} things are still pending',
    hi: '{n} काम अभी बाकी हैं',
  },
  'kavach.allDone': { en: 'Nothing pending right now', hi: 'अभी कुछ बाकी नहीं' },
  'kavach.scoreSource': {
    en: 'The MDG team sets this figure by checking your pump — out of {n} points in all.',
    hi: 'यह आंकड़ा MDG टीम आपके पंप की जाँच करके बनाती है — कुल {n} पॉइंट में से।',
  },
  'kavach.neverCheckedOne': {
    en: 'We have not checked 1 thing at your pump yet.',
    hi: '1 काम हमने आपके पंप पर अभी तक नहीं जाँचा है।',
  },
  'kavach.neverCheckedMany': {
    en: 'We have not checked {n} things at your pump yet.',
    hi: '{n} काम हमने आपके पंप पर अभी तक नहीं जाँचे हैं।',
  },
  'kavach.allDoneTitle': {
    en: 'Nothing pending right now',
    hi: 'अभी कुछ बाकी नहीं',
  },
  'kavach.allDoneDesc': {
    en: "The MDG team has checked everything that was due. We'll tell you when something needs you.",
    hi: 'जो जाँचना था, MDG टीम ने जाँच लिया है। कुछ ज़रूरत होगी तो हम आपको बताएंगे।',
  },

  /* ── still pending, and whose side it is sitting on ─────────────────── */
  'kavach.stillPending': { en: 'Still pending', hi: 'अभी बाकी' },
  'kavach.withMdg': {
    en: 'The MDG team will check this',
    hi: 'MDG टीम इसे जाँचेगी',
  },
  'kavach.withMdgAsk': {
    en: 'The MDG team will ask you for a photo',
    hi: 'MDG टीम आपसे इसकी फोटो माँगेगी',
  },
  'kavach.heldTitle': {
    en: 'We could not check this yet',
    hi: 'हम यह अभी जाँच नहीं पाए',
  },
  'kavach.heldDesc': {
    en: 'This one is on us, not on you. We are sorting it out.',
    hi: 'यह हमारी तरफ से है, आपकी तरफ से नहीं। हम इसे ठीक कर रहे हैं।',
  },
  'kavach.claimDone': { en: "I've done this", hi: 'मैंने कर दिया' },
  'kavach.claimHint': {
    en: 'This asks the MDG team to come and check. It does not finish the task.',
    hi: 'इससे MDG टीम जाँचने आएगी। इससे काम पूरा नहीं होता।',
  },
  'kavach.claimSent': { en: 'You told the MDG team', hi: 'MDG टीम को बता दिया' },
  'kavach.claimSentDesc': {
    en: 'They will check it and confirm.',
    hi: 'वे इसे जाँचकर पक्का करेंगे।',
  },
  'kavach.sendFailed': {
    en: "That didn't reach us. Please check your network and try again.",
    hi: 'यह हम तक नहीं पहुँचा। कृपया अपना नेटवर्क जांचें और फिर कोशिश करें।',
  },

  /* ── who moved the number, and when ─────────────────────────────────── */
  // Always the MDG TEAM, never the individual admin who clicked: the dealer's
  // relationship is with MDG, and naming a person invites them to argue with one.
  'kavach.recentlyChecked': { en: 'Recently checked', hi: 'हाल में जाँचा गया' },
  'kavach.checkedByMdg': {
    en: 'Checked by the MDG team — {date}',
    hi: 'MDG टीम ने जाँचा — {date}',
  },

  'kavach.sosSummary': {
    en: 'When it happens ({n})',
    hi: 'जब ज़रूरत हो ({n})',
  },
  'kavach.sosDesc': {
    en: 'These happen only when needed — we handle them with you.',
    hi: 'ये ज़रूरत पड़ने पर होते हैं — हम आपके साथ इन्हें संभालते हैं।',
  },

  'kavach.statusReady': { en: 'Ready', hi: 'तैयार' },
  'kavach.statusDueSoon': { en: 'Due soon', hi: 'जल्द' },
  'kavach.statusOverdue': { en: 'Overdue', hi: 'बाकी है' },
  'kavach.statusNotChecked': { en: 'Not checked yet', hi: 'अभी जाँचा नहीं' },
  'kavach.statusFlagged': { en: 'Needs attention', hi: 'ध्यान दें' },
  'kavach.statusSent': { en: 'Sent', hi: 'भेज दी' },
  'kavach.statusYourTurn': { en: 'Photo needed', hi: 'फोटो चाहिए' },
  'kavach.statusOnUs': { en: 'On us', hi: 'हमारी तरफ' },

  'kavach.bandGood': { en: 'Looking good', hi: 'बढ़िया चल रहा है' },
  'kavach.bandFew': { en: 'A few things to do', hi: 'कुछ काम बाकी हैं' },
  'kavach.bandCatchup': { en: "Let's catch up", hi: 'इन्हें पूरा करें' },
  'kavach.bandSettling': { en: 'Getting started', hi: 'अभी शुरू कर रहे हैं' },
  'kavach.preparing': { en: 'Preparing…', hi: 'तैयार हो रहा है' },
  'kavach.tapRetry': {
    en: "Didn't send — tap to try again",
    hi: 'नहीं भेजा गया — फिर से दबाएं',
  },
  'kavach.addingPhoto': {
    en: 'Sending your photo…',
    hi: 'फोटो भेजी जा रही है…',
  },
  'kavach.photoAddFailed': {
    en: "We couldn't send your photo just now",
    hi: 'अभी फोटो नहीं भेजी जा सकी',
  },
  'kavach.photoAddFailedDesc': {
    en: 'Please message us and we will help.',
    hi: 'कृपया हमें लिखें, हम मदद करेंगे।',
  },
  // Borrowed by the density register's error toasts as well — grep before moving.
  'kavach.messageUs': { en: 'Message us', hi: 'हमें लिखें' },
  'kavach.photoUploadFailed': {
    en: "Photo didn't send — please try again",
    hi: 'फोटो नहीं भेजी जा सकी — फिर से कोशिश करें',
  },

  /* ── profile & team ─────────────────────────────────────────────────── */
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
  'profile.signOut': { en: 'Sign out', hi: 'साइन आउट' },
  'profile.language': { en: 'Language', hi: 'भाषा' },
  'profile.languageDesc': {
    en: 'Choose how the app talks to you',
    hi: 'चुनें ऐप आपसे किस भाषा में बात करे',
  },

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

  /* ── density register (tt-density) ──────────────────────────────────── */
  // The dealer's word for the thing in their hand is "the density register".
  // "TT", "acknowledgement", "invoice", "Density@15", "kg/m³", "sync", "upload",
  // "server" and "retry" appear nowhere in this block, in either language, and
  // must not be added: the dealer sees the NUMBER, never our name for it.
  'density.title': { en: 'Density register', hi: 'डेंसिटी रजिस्टर' },
  'density.latestTitle': {
    en: "Last tanker's reading",
    hi: 'पिछले टैंकर की रीडिंग',
  },
  'density.registerLine': {
    en: 'Write this in your register',
    hi: 'यह अपने रजिस्टर में लिखें',
  },
  'density.noReadingYet': {
    en: 'No tanker reading yet. It will appear here the day after one arrives.',
    hi: 'अभी कोई टैंकर रीडिंग नहीं है। टैंकर आने के अगले दिन यह यहाँ दिखेगी।',
  },
  'density.figureAge': {
    en: 'This reading is {n} days old',
    hi: 'यह रीडिंग {n} दिन पुरानी है',
  },
  'profile.density': { en: 'Density register', hi: 'डेंसिटी रजिस्टर' },
  'profile.densityDesc': {
    en: "Send today's register page",
    hi: 'आज के रजिस्टर का पन्ना भेजें',
  },
  'density.todayTitle': {
    en: "Today's register photo",
    hi: 'आज के रजिस्टर की फोटो',
  },
  'density.todayHint': {
    en: "Open your register at today's page and take one clear photo.",
    hi: 'अपना रजिस्टर आज वाले पन्ने पर खोलें और एक साफ़ फोटो लें।',
  },
  'density.takePhoto': { en: 'Take photo', hi: 'फोटो लें' },
  'density.takePhotoFor': { en: 'Take photo for {day}', hi: '{day} की फोटो लें' },
  'density.chooseFromPhone': { en: 'Choose from phone', hi: 'फ़ोन से चुनें' },
  'density.readable': {
    en: 'Is the page readable?',
    hi: 'क्या पन्ना साफ़ पढ़ा जा रहा है?',
  },
  'density.sendThis': { en: 'Yes, send this', hi: 'हाँ, यही भेजें' },
  'density.takeAgain': { en: 'Take again', hi: 'दोबारा लें' },
  'density.sending': { en: 'Sending your photo…', hi: 'फोटो भेजी जा रही है…' },
  'density.doneTitle': { en: 'Today is done', hi: 'आज का काम हो गया' },
  'density.doneDesc': {
    en: "We have today's register photo. Nothing else to do.",
    hi: 'आज के रजिस्टर की फोटो हमें मिल गई। और कुछ नहीं करना है।',
  },
  'density.doneToast': { en: 'Photo saved', hi: 'फोटो सेव हो गई' },
  'density.doneToastDesc': {
    en: "Today's register page is saved.",
    hi: 'आज के रजिस्टर का पन्ना सेव हो गया।',
  },
  'density.seePhoto': { en: 'See the photo', hi: 'फोटो देखें' },
  'density.weekTitle': { en: 'This week', hi: 'इस हफ़्ते' },
  'density.legendSent': { en: 'Sent', hi: 'भेज दी' },
  'density.legendTodo': { en: 'Still to do', hi: 'अभी बाकी' },
  'density.missedOne': { en: '1 day still to do', hi: '1 दिन बाकी है' },
  'density.missedMany': { en: '{n} days still to do', hi: '{n} दिन बाकी हैं' },
  'density.missedDesc': {
    en: "Open the register at that day's page and take a photo of it.",
    hi: 'उस दिन वाले पन्ने पर रजिस्टर खोलें और उसकी फोटो लें।',
  },
  'density.earlierDays': {
    en: '{n} earlier days still to do',
    hi: '{n} पुराने दिन अभी बाकी हैं',
  },
  'density.today': { en: 'Today', hi: 'आज' },
  // "कल" means yesterday AND tomorrow, so it is never used bare: the word is
  // "बीता कल", and every day chip prints its date beside it as well.
  'density.yesterday': { en: 'Yesterday', hi: 'बीता कल' },
  'density.failedTitle': {
    en: 'The photo did not reach us',
    hi: 'फोटो हम तक नहीं पहुँची',
  },
  'density.failedDesc': {
    en: 'Your phone lost the network. Tap to send it again.',
    hi: 'आपके फ़ोन का नेटवर्क चला गया था। दोबारा भेजने के लिए दबाएँ।',
  },
  'density.sendAgain': { en: 'Send again', hi: 'दोबारा भेजें' },
  'density.notAPhoto': {
    en: 'That is not a photo. Please take a photo of the register page.',
    hi: 'यह फोटो नहीं है। कृपया रजिस्टर के पन्ने की फोटो लें।',
  },
  'density.offline': {
    en: 'Your phone is not on the internet right now. The photo will not go.',
    hi: 'आपका फ़ोन अभी इंटरनेट पर नहीं है। फोटो अभी नहीं जाएगी।',
  },
  'density.tooOld': {
    en: 'Only the last 7 days can be filled in.',
    hi: 'सिर्फ़ पिछले 7 दिन ही भरे जा सकते हैं।',
  },
  'density.adminAdded': {
    en: 'MDG team added this photo',
    hi: 'यह फोटो MDG टीम ने डाली है',
  },
  'density.notOnTitle': { en: 'Nothing to do yet', hi: 'अभी कुछ नहीं करना है' },
  'density.notOnDesc': {
    en: 'This service is not on for your pump yet. Message us if you want it.',
    hi: 'यह सेवा अभी आपके पंप के लिए चालू नहीं है। चाहिए तो हमें मैसेज करें।',
  },
  'density.errorTitle': { en: 'We could not open this', hi: 'यह खुल नहीं पाया' },
  'density.helpLine': {
    en: 'Something not right? Message us.',
    hi: 'कुछ ठीक नहीं लग रहा? हमें मैसेज करें।',
  },
  // A push notification's words are chosen by whoever sends it, and that is the
  // server: `services/ttDensity/notify.ts` builds the title and body when a
  // tanker's density lands. A copy here would be a second version of the same
  // sentence that nothing renders and nothing keeps in step.

  /* ── document asks ──────────────────────────────────────────────────── */
  // The dealer's word for all of this is "काग़ज़" — paper. Not "document ask",
  // not "request", not "obligation", and never a state name: `ASKED`, `SENT`,
  // `REJECTED` and `EXPIRED` are how the database talks, and none of the four
  // appears in either language below. Nor does "error" or "failed"; a sentence
  // to a dealer says what to do next, which is what "दोबारा भेजिए" is and what
  // "upload failed" is not.
  //
  // NO DATE IS EVER SPELLED OUT HERE. Every `{day}` and `{period}` is filled in
  // by `documentPeriodLabel` from `shared`, which is also what the server's push
  // notification uses — so the card and the notification that opened it can
  // never name the same period two different ways.
  'asks.pageTitle': { en: 'Papers MDG needs', hi: 'MDG को चाहिए काग़ज़' },
  'profile.asks': { en: 'Papers MDG needs', hi: 'MDG को चाहिए काग़ज़' },
  'profile.asksDesc': {
    en: 'What you have sent, and what is still to send',
    hi: 'क्या भेज दिया, क्या अभी बाकी है',
  },

  // The bar under the header. `{name}` is the paper's own title from the
  // catalog, so "Send today's register page" is this string plus the title MDG
  // shipped rather than a second copy of it.
  'asks.barOne': { en: 'Send {name}', hi: '{name} भेजें' },
  'asks.barMany': { en: '{n} things to send', hi: '{n} चीज़ें भेजनी हैं' },
  'asks.barLatePeriod': {
    en: "{period}'s paper is still due",
    hi: '{period} का काग़ज़ बाकी है',
  },
  // The same face for a paper that belongs to no period at all — a fire NOC has
  // no day to name, so it is named by what it is.
  'asks.barLateNamed': { en: '{name} is still due', hi: '{name} अभी बाकी है' },

  'asks.groupTodo': { en: 'Still to do', hi: 'बाकी है' },
  'asks.groupSent': { en: 'Sent', hi: 'भेज दिया' },
  'asks.groupDone': { en: 'Done', hi: 'हो गया' },
  'asks.emptyTitle': { en: 'Nothing to send', hi: 'भेजने को कुछ नहीं' },
  'asks.emptyDesc': {
    en: 'MDG has everything it asked you for.',
    hi: 'MDG ने जो माँगा था, वह सब मिल गया है।',
  },
  'asks.dueOn': { en: 'Wanted by {day}', hi: '{day} तक चाहिए' },
  'asks.lateBadge': { en: 'Late', hi: 'देर हो गई' },

  // "Sent" is NOT a success state and is not written like one. The dealer
  // sending a photo and MDG accepting it are different facts about different
  // people, and a tick on the first is a promise the second may not keep.
  'asks.sentWaiting': { en: 'With MDG now', hi: 'अब MDG के पास है' },
  'asks.sentWaitingDesc': {
    en: 'Nothing more to do. We will tell you if anything else is needed.',
    hi: 'अब कुछ नहीं करना है। और कुछ चाहिए होगा तो हम बता देंगे।',
  },
  // Two different promises, never collapsed into one. A person at MDG looked, or
  // a machine signal settled it and nobody looked — saying the first when the
  // second happened publishes a claim MDG never made.
  'asks.acceptedByAdmin': { en: 'MDG has checked it', hi: 'MDG ने देख लिया' },
  'asks.acceptedBySystem': { en: 'Received', hi: 'मिल गया' },
  'asks.rejectedTitle': { en: 'Please send it again', hi: 'दोबारा भेजना होगा' },
  // Labelled as MDG's words because it IS MDG's words — typed by an admin, in
  // English, on a Hindi screen. Passing it off as the app's own voice would be
  // the app appearing to change language mid-card.
  'asks.rejectedFrom': { en: 'MDG wrote:', hi: 'MDG ने यह लिखा है:' },

  'asks.takePhoto': { en: 'Take photo', hi: 'फोटो लें' },
  'asks.sendAgain': { en: 'Send again', hi: 'दोबारा भेजें' },
  'asks.choosePhoto': { en: 'Choose from phone', hi: 'फ़ोन से चुनें' },
  'asks.openInKavach': { en: 'Open in Kavach', hi: 'कवच में खोलें' },

  // THE REFUSABLE SENTENCE. A 24-hour forecourt's "today" and the app's IST date
  // disagree for the first six hours of every day, so the day is stated as
  // something to agree with rather than printed as a label nobody reads.
  'asks.confirmPeriod': {
    en: 'This photo will be sent as the paper for {day}. Is that right?',
    hi: 'इस फोटो को {day} के काग़ज़ के तौर पर भेजा जाएगा। सही है?',
  },
  // The day is on the button the thumb actually presses, not only in the
  // sentence above it — `density.takePhotoFor` already worked this way.
  'asks.sendForDay': { en: 'Send as {day}', hi: '{day} की फोटो भेजें' },
  'asks.sendThis': { en: 'Yes, send this', hi: 'हाँ, यही भेजें' },
  'asks.chooseAnotherDay': { en: 'Choose another day', hi: 'दूसरा दिन चुनें' },
  'asks.whichDay': {
    en: 'Which day is this page from?',
    hi: 'यह पन्ना किस दिन का है?',
  },
  'asks.takeAgain': { en: 'Take again', hi: 'दोबारा लें' },
  'asks.sending': { en: 'Sending your photo…', hi: 'फोटो भेजी जा रही है…' },

  // The offline pair. Neither says "error" or "failed": the first is a promise
  // the app can keep, the second is an instruction the dealer can follow.
  'asks.queued': {
    en: 'The photo is saved. It will go as soon as the internet is back.',
    hi: 'फोटो रखी है — इंटरनेट आते ही चली जाएगी।',
  },
  'asks.queuedShort': {
    en: 'Saved — waiting for the internet',
    hi: 'रखी है — इंटरनेट का इंतज़ार',
  },
  'asks.sendingShort': { en: 'Going now…', hi: 'अभी जा रही है…' },
  'asks.notSent': {
    en: 'That photo did not go through. Please send it again.',
    hi: 'यह फोटो पूरी नहीं गई। दोबारा भेजिए।',
  },
  'asks.sentToast': { en: 'Photo sent', hi: 'फोटो भेज दी' },
  'asks.sentToastDesc': { en: 'MDG will look at it.', hi: 'MDG इसे देख लेगा।' },
  'asks.notAFile': {
    en: 'MDG cannot open that. Please send a photo, or a PDF.',
    hi: 'यह MDG खोल नहीं पाएगा। कृपया फोटो भेजें, या PDF।',
  },
  'asks.tooBig': {
    en: 'That file is too big to send. Take a photo of the paper instead.',
    hi: 'यह फ़ाइल भेजने के लिए बहुत बड़ी है। इसकी जगह काग़ज़ की फोटो लें।',
  },
  'asks.photoAlt': {
    en: 'The photo you are about to send',
    hi: 'जो फोटो भेजनी है',
  },
  'asks.pdfPicked': { en: 'A PDF is ready to send', hi: 'एक PDF भेजने को तैयार है' },
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
