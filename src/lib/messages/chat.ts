import type { LangMessage } from '../i18n';

import type { AreaHl } from './_types';

/**
 * The `chat` area's words (spec sections 4.6 and 8): the chat list, "Your MDG team" (what used to
 * be "Chat info") and the page of photos, papers and links (what used to be "Media, links and
 * docs"). Keys start with `chatl.`. Plural keys are `<key>.one` and `<key>.many` (see `_plural.ts`).
 *
 * Words that did not change are read from the old keys (`chatlist.search`, `chat.noDocs`, ...) and
 * are not written twice. The thread's own words (`chat.menuMedia`, the bar, the composer) stay where
 * they are: the thread is not part of this redesign.
 */
export const chatMessages = {
  // ---- the chat list ----
  'chatl.title': { en: 'Chats', hi: 'चैट' },
  'chatl.empty': {
    en: 'No chats yet. Messages from MDG will show here.',
    hi: 'अभी कोई चैट नहीं है। MDG के संदेश यहाँ दिखेंगे।',
  },
  'chatl.error': {
    en: 'We could not load your chats. They are safe. Check your internet and try again.',
    hi: 'आपकी चैट अभी नहीं खुल पाईं। वे सुरक्षित हैं। इंटरनेट जाँचकर फिर कोशिश करें।',
  },
  'chatl.waits.one': { en: '1 thing waits for you', hi: 'आपके लिए 1 काम है' },
  'chatl.waits.many': { en: '{n} things wait for you', hi: 'आपके लिए {n} काम हैं' },
  'chatl.list.label': { en: 'Your chats', hi: 'आपकी चैट' },

  // ---- Your MDG team (chat info) ----
  'chatl.info.title': { en: 'Your MDG team', hi: 'आपकी MDG टीम' },
  'chatl.place.chat': { en: 'chat', hi: 'चैट' },
  'chatl.info.who': { en: 'Who answers you', hi: 'आपको जवाब कौन देता है' },
  'chatl.info.members': { en: 'People in this chat', hi: 'इस चैट में कौन-कौन है' },
  'chatl.info.ticket': { en: 'Your question to MDG', hi: 'MDG से आपका सवाल' },
  'chatl.info.noTicket': {
    en: 'Nothing is waiting with MDG. Write in the chat any time.',
    hi: 'MDG के पास अभी आपका कोई सवाल बाकी नहीं है। जब चाहें चैट में लिखें।',
  },
  'chatl.info.openChat': { en: 'Open this chat', hi: 'यह चैट खोलें' },
  'chatl.info.media': { en: 'Photos, papers and links', hi: 'फोटो, कागज़ और लिंक' },
  'chatl.info.mediaSub': {
    en: 'Everything sent in this chat',
    hi: 'इस चैट में भेजी हर चीज़',
  },
  'chatl.info.mediaNone': {
    en: 'Nothing has been sent in this chat yet',
    hi: 'इस चैट में अभी कुछ नहीं भेजा गया',
  },
  'chatl.info.mediaCount.one': {
    en: '1 photo, paper or link sent here',
    hi: 'यहाँ 1 फोटो, कागज़ या लिंक भेजा गया',
  },
  'chatl.info.mediaCount.many': {
    en: '{n} photos, papers and links sent here',
    hi: 'यहाँ {n} फोटो, कागज़ और लिंक भेजे गए',
  },
  'chatl.info.mediaMore': { en: 'More than {n} sent here', hi: 'यहाँ {n} से ज़्यादा भेजे गए' },
  'chatl.info.shortcuts': { en: 'Open quickly', hi: 'जल्दी खोलें' },
  'chatl.info.reports': { en: 'Your reports', hi: 'आपकी रिपोर्ट' },
  'chatl.info.reportsSub': { en: 'The last 30 days', hi: 'पिछले 30 दिन' },
  'chatl.info.papers': { en: 'Papers and licences', hi: 'कागज़ात और लाइसेंस' },
  'chatl.info.papersSub': {
    en: 'Licences and when they run out',
    hi: 'लाइसेंस और उनकी आखिरी तारीख',
  },
  'chatl.info.services': { en: 'What MDG runs for you', hi: 'MDG आपके लिए क्या चलाता है' },
  'chatl.info.servicesSub': {
    en: 'Your services, one by one',
    hi: 'आपकी सेवाएँ, एक-एक करके',
  },

  // ---- Photos, papers and links (chat media) ----
  'chatl.media.title': { en: 'Photos, papers and links', hi: 'फोटो, कागज़ और लिंक' },
  'chatl.media.show': { en: 'Show', hi: 'दिखाएँ' },
  'chatl.media.photos': { en: 'Photos', hi: 'फोटो' },
  'chatl.media.papers': { en: 'Papers', hi: 'कागज़' },
  'chatl.media.links': { en: 'Links', hi: 'लिंक' },
  'chatl.media.reports': { en: 'Latest reports', hi: 'ताज़ा रिपोर्ट' },
  'chatl.media.reportsNone': {
    en: 'Looking for a report? Reports keeps the last 30 days.',
    hi: 'कोई रिपोर्ट ढूँढ रहे हैं? रिपोर्ट में पिछले 30 दिन की रिपोर्ट रहती हैं।',
  },
  'chatl.media.reportsOpen': { en: 'Open Reports', hi: 'रिपोर्ट खोलें' },
  'chatl.media.failed': {
    en: 'We could not load this. Check your internet and try again.',
    hi: 'यह अभी नहीं खुल पाया। इंटरनेट जाँचकर फिर कोशिश करें।',
  },
} satisfies Record<string, LangMessage>;

export const chatHl: AreaHl<typeof chatMessages> = {
  'chatl.title': 'Chat',
  'chatl.empty': 'Abhi koi chat nahi hai. MDG ke sandesh yahan dikhenge.',
  'chatl.error':
    'Aapki chat abhi nahi khul payi. Woh surakshit hain. Internet jaanchkar phir koshish karein.',
  'chatl.waits.one': 'Aapke liye 1 kaam hai',
  'chatl.waits.many': 'Aapke liye {n} kaam hain',
  'chatl.list.label': 'Aapki chat',

  'chatl.info.title': 'Aapki MDG team',
  'chatl.place.chat': 'chat',
  'chatl.info.who': 'Aapko jawab kaun deta hai',
  'chatl.info.members': 'Is chat mein kaun-kaun hai',
  'chatl.info.ticket': 'MDG se aapka sawal',
  'chatl.info.noTicket':
    'MDG ke paas abhi aapka koi sawal baaki nahi hai. Jab chahein chat mein likhein.',
  'chatl.info.openChat': 'Yeh chat kholein',
  'chatl.info.media': 'Photo, kaagaz aur link',
  'chatl.info.mediaSub': 'Is chat mein bheji har cheez',
  'chatl.info.mediaNone': 'Is chat mein abhi kuch nahi bheja gaya',
  'chatl.info.mediaCount.one': 'Yahan 1 photo, kaagaz ya link bheja gaya',
  'chatl.info.mediaCount.many': 'Yahan {n} photo, kaagaz aur link bheje gaye',
  'chatl.info.mediaMore': 'Yahan {n} se zyada bheje gaye',
  'chatl.info.shortcuts': 'Jaldi kholein',
  'chatl.info.reports': 'Aapki report',
  'chatl.info.reportsSub': 'Pichhle 30 din',
  'chatl.info.papers': 'Kaagzaat aur license',
  'chatl.info.papersSub': 'License aur unki aakhri tareekh',
  'chatl.info.services': 'MDG aapke liye kya chalata hai',
  'chatl.info.servicesSub': 'Aapki services, ek-ek karke',

  'chatl.media.title': 'Photo, kaagaz aur link',
  'chatl.media.show': 'Dikhayein',
  'chatl.media.photos': 'Photo',
  'chatl.media.papers': 'Kaagaz',
  'chatl.media.links': 'Link',
  'chatl.media.reports': 'Taaza report',
  'chatl.media.reportsNone':
    'Koi report dhoondh rahe hain? Report mein pichhle 30 din ki report rehti hain.',
  'chatl.media.reportsOpen': 'Report kholein',
  'chatl.media.failed': 'Yeh abhi nahi khul paya. Internet jaanchkar phir koshish karein.',
};
