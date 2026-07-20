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

  /* ── app / nav ──────────────────────────────────────────────────────── */
  'app.brand': { en: 'Dealer Kavach', hi: 'डीलर कवच' },
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
  'chat.loadEarlier': {
    en: 'Load earlier messages',
    hi: 'पुराने संदेश देखें',
  },
  'chat.today': { en: 'Today', hi: 'आज' },
  'chat.yesterday': { en: 'Yesterday', hi: 'कल' },
  'chat.isTyping': { en: '{name} is typing', hi: '{name} लिख रहे हैं' },
  'chat.imagePreview': { en: 'Image preview', hi: 'फोटो पूर्वावलोकन' },
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
  'kavach.title': { en: 'Pump health', hi: 'पंप हेल्थ' },
  'kavach.needHelp': {
    en: 'Need help? Message us',
    hi: 'मदद चाहिए? हमें लिखें',
  },
  'kavach.errorTitle': {
    en: "We couldn't load this just now",
    hi: 'अभी यह लोड नहीं हो पाया',
  },
  'kavach.welcomeTitle': {
    en: 'Welcome to Kavach',
    hi: 'कवच में स्वागत है',
  },
  'kavach.welcomeDesc': {
    en: "This is where you'll see what keeps your pump safe and compliant. We'll guide you, one small task at a time.",
    hi: 'यहां आप देखेंगे कि आपके पंप को सुरक्षित रखने के लिए क्या ज़रूरी है। हम एक-एक करके बताएंगे।',
  },
  'kavach.settling': {
    en: 'Getting started — nothing to worry about yet.',
    hi: 'अभी शुरू कर रहे हैं — अभी चिंता की कोई बात नहीं।',
  },
  'kavach.todoOne': {
    en: '1 thing to do today',
    hi: 'आज 1 काम बाकी है',
  },
  'kavach.todoMany': {
    en: '{n} things to do today',
    hi: 'आज {n} काम बाकी हैं',
  },
  'kavach.allDone': { en: 'All done for today', hi: 'आज सब हो गया' },
  'kavach.doToday': { en: 'Do today', hi: 'आज करें' },
  'kavach.allDoneTitle': {
    en: 'All done for today!',
    hi: 'आज सब हो गया!',
  },
  'kavach.allDoneDesc': {
    en: "Your pump is in great shape. We'll let you know when something needs you.",
    hi: 'आपका पंप बढ़िया स्थिति में है। ज़रूरत होने पर हम आपको बताएंगे।',
  },
  'kavach.sosSummary': {
    en: 'When it happens ({n})',
    hi: 'जब ज़रूरत हो ({n})',
  },
  'kavach.sosDesc': {
    en: 'These happen only when needed — we handle them with you.',
    hi: 'ये ज़रूरत पड़ने पर होते हैं — हम आपके साथ इन्हें संभालते हैं।',
  },
  'kavach.doneToast': { en: 'Done!', hi: 'हो गया!' },
  'kavach.doneToastDesc': {
    en: 'Your pump health went up.',
    hi: 'आपकी पंप हेल्थ बढ़ गई।',
  },
  'kavach.statusReady': { en: 'Ready', hi: 'तैयार' },
  'kavach.statusDueSoon': { en: 'Due soon', hi: 'जल्द' },
  'kavach.statusOverdue': { en: 'Overdue', hi: 'बाकी है' },
  'kavach.bandGood': { en: 'Looking good', hi: 'बढ़िया चल रहा है' },
  'kavach.bandFew': { en: 'A few things to do', hi: 'कुछ काम बाकी हैं' },
  'kavach.bandCatchup': { en: "Let's catch up", hi: 'इन्हें पूरा करें' },
  'kavach.bandSettling': { en: 'Getting started', hi: 'अभी शुरू कर रहे हैं' },
  'kavach.markDone': { en: 'Mark done', hi: 'हो गया' },
  'kavach.addPhotoMarkDone': {
    en: 'Add photo & mark done',
    hi: 'फोटो डालकर हो गया',
  },
  'kavach.preparing': { en: 'Preparing…', hi: 'तैयार हो रहा है' },
  'kavach.tapRetry': {
    en: "Didn't save — tap to try again",
    hi: 'सेव नहीं हुआ — फिर से दबाएं',
  },
  'kavach.addingPhoto': {
    en: 'Adding your photo…',
    hi: 'फोटो जोड़ रहे हैं…',
  },
  'kavach.photoAddFailed': {
    en: "We couldn't add your photo just now",
    hi: 'अभी फोटो नहीं जुड़ी',
  },
  'kavach.photoAddFailedDesc': {
    en: 'Please message us and we will help.',
    hi: 'कृपया हमें लिखें, हम मदद करेंगे।',
  },
  'kavach.messageUs': { en: 'Message us', hi: 'हमें लिखें' },
  'kavach.photoUploadFailed': {
    en: "Photo didn't upload — please try again",
    hi: 'फोटो अपलोड नहीं हुई — फिर से कोशिश करें',
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
