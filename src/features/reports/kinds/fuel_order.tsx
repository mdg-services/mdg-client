import { Ban, Check, CircleX, Octagon, Truck } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { cn } from '@/lib/cn';
import type { Lang } from '@/store/lang';
import type { FuelOrderData, FuelOrderSnapStage } from '@dk/shared/types';

import { StatusBadge } from '../StatusBadge';
import type { KindAlert, KindTile, KindView, OverlayProps, ReportStatusKey, Words } from '../types';

import {
  dayWords,
  fill,
  fuelName,
  instantWords,
  kl,
  leadingFor,
  rupees,
  say,
  shareLines,
  clockWords,
} from './_fmtTankerMoney';
import { FuelSwatch, IndianOilSays, Lead, NumberPlate } from './_partsTankerMoney';

/**
 * Fuel order (ADR 0056): a 4-stop horizontal rail (Placed, Tanker assigned, Loaded,
 * Delivered) with the truck sitting on the current stop, and the TT number on a small
 * yellow plate. It is the only journey line in the app that runs sideways.
 *
 * The snapshot is the order as it stood when the team wrote to the dealer; the overlay
 * shell shows the live stop in its own banner. Words from IndianOil (status, refusal
 * sentences) are printed as IndianOil wrote them, in a labelled quote. Money that only an
 * owner may read (`credit`, `shortByRs`) is simply absent for a manager and is drawn only
 * when it is there.
 */

const T = {
  title: { hi: 'फ्यूल ऑर्डर', hl: 'Fuel order', en: 'Fuel order' },
  // The rail's four stops.
  stopPlaced: { hi: 'ऑर्डर लगा', hl: 'Order laga', en: 'Order placed' },
  stopTanker: { hi: 'टैंकर मिला', hl: 'Tanker mila', en: 'Tanker assigned' },
  stopLoaded: { hi: 'माल लदा', hl: 'Maal lada', en: 'Loaded' },
  stopDelivered: { hi: 'पहुँच गया', hl: 'Pahunch gaya', en: 'Delivered' },
  stopClosed: { hi: 'बंद', hl: 'Band', en: 'Closed' },
  railLabel: { hi: 'ऑर्डर का सफ़र', hl: 'Order ka safar', en: 'Order journey' },
  stepOf: { hi: 'चरण {i} / 4', hl: 'Step {i} / 4', en: 'Step {i} of 4' },
  stepCurrent: { hi: 'अभी यहाँ', hl: 'abhi yahan', en: 'current' },
  stepDone: { hi: 'हो चुका', hl: 'ho chuka', en: 'done' },
  stepTodo: { hi: 'बाकी', hl: 'baaki', en: 'not yet' },
  railStopped: {
    hi: 'यह ऑर्डर आगे नहीं बढ़ा',
    hl: 'Yeh order aage nahi badha',
    en: 'This order did not go further',
  },
  // The tile's stage words.
  wordPlacing: { hi: 'ऑर्डर लग रहा है', hl: 'Order lag raha hai', en: 'Placing the order' },
  wordPlaced: { hi: 'ऑर्डर लग गया', hl: 'Order lag gaya', en: 'Order placed' },
  wordAssigned: { hi: 'टैंकर मिल गया', hl: 'Tanker mil gaya', en: 'Tanker assigned' },
  wordOnTheWay: { hi: 'टैंकर रास्ते में', hl: 'Tanker raaste mein', en: 'Tanker on the way' },
  wordDelivered: { hi: 'माल पहुँच गया', hl: 'Maal pahunch gaya', en: 'Delivered' },
  wordClosed: { hi: 'ऑर्डर बंद', hl: 'Order band', en: 'Order closed' },
  wordRefused: { hi: 'ऑर्डर नहीं लिया गया', hl: 'Order nahi liya gaya', en: 'Order not taken' },
  wordCancelled: { hi: 'ऑर्डर रद्द', hl: 'Order radd', en: 'Order cancelled' },
  wordNotPlaced: { hi: 'ऑर्डर नहीं लगा', hl: 'Order nahi laga', en: 'Order not placed' },
  nOrders: { hi: '{n} ऑर्डर', hl: '{n} order', en: '{n} orders' },
  nOrdersOne: { hi: '1 ऑर्डर', hl: '1 order', en: '1 order' },
  // Facts.
  tankerLabel: { hi: 'टैंकर नंबर', hl: 'Tanker number', en: 'Tanker number' },
  tankerNone: { hi: 'टैंकर अभी नहीं मिला', hl: 'Tanker abhi nahi mila', en: 'Tanker not assigned yet' },
  earlierTanker: { hi: 'पहले का टैंकर', hl: 'Pehle ka tanker', en: 'Earlier tanker' },
  deliveryDay: { hi: 'डिलीवरी का दिन', hl: 'Delivery ka din', en: 'Delivery day' },
  shipment: { hi: 'शिपमेंट', hl: 'Shipment', en: 'Shipment' },
  loadedAt: { hi: 'माल लदा', hl: 'Maal lada', en: 'Loaded' },
  orderNo: { hi: 'ऑर्डर नंबर', hl: 'Order number', en: 'Order number' },
  sourceChat: { hi: 'MDG ने आपके लिए लगाया', hl: 'MDG ne aapke liye lagaya', en: 'MDG placed this for you' },
  sourcePortal: { hi: 'आपने खुद लगाया', hl: 'Aapne khud lagaya', en: 'Placed by you' },
  source: { hi: 'किसने लगाया', hl: 'Kisne lagaya', en: 'Order source' },
  seenLate: {
    hi: 'यह अभी पोर्टल पर दिखा है।',
    hl: 'Yeh abhi portal par dikha hai.',
    en: 'Seen on the portal just now.',
  },
  total: { hi: 'कुल {kl}', hl: 'Kul {kl}', en: 'Total {kl}' },
  klUnknown: { hi: 'KL पता नहीं', hl: 'KL pata nahi', en: 'KL not shown' },
  asOf: { hi: 'यह {when} की स्थिति है', hl: 'Yeh {when} ki sthiti hai', en: 'As of {when}' },
  statusLine: { hi: 'स्टेटस', hl: 'Status', en: 'Status' },
  // Event: the short word on the badge, and the plain sentence the overlay opens with.
  evPlaced: { hi: 'ऑर्डर लगा', hl: 'Order laga', en: 'Order placed' },
  evRefused: { hi: 'नहीं लिया', hl: 'Nahi liya', en: 'Not taken' },
  evUnclear: { hi: 'पक्का नहीं', hl: 'Pakka nahi', en: 'Not sure' },
  evNotPlaced: { hi: 'नहीं लगा', hl: 'Nahi laga', en: 'Not placed' },
  evAssigned: { hi: 'टैंकर मिला', hl: 'Tanker mila', en: 'Tanker assigned' },
  evCancelled: { hi: 'रद्द', hl: 'Radd', en: 'Cancelled' },
  evCancelling: { hi: 'रद्द हो रहा है', hl: 'Radd ho raha hai', en: 'Cancelling' },
  evNotRun: { hi: 'नहीं चला', hl: 'Nahi chala', en: 'Not run' },
  evNoTanker: { hi: 'टैंकर नहीं मिला', hl: 'Tanker nahi mila', en: 'No tanker yet' },
  evLapsed: { hi: 'समय निकल गया', hl: 'Samay nikal gaya', en: 'Lapsed' },
  evClosed: { hi: 'बंद', hl: 'Band', en: 'Closed' },
  evChanged: { hi: 'टैंकर बदला', hl: 'Tanker badla', en: 'Tanker changed' },
  evDetails: { hi: 'टैंकर की जानकारी', hl: 'Tanker ki jaankari', en: 'Tanker details' },
  evDuplicate: { hi: 'शायद दोबारा', hl: 'Shayad dobara', en: 'Maybe a repeat' },
  evDelayed: { hi: 'देर लग रही है', hl: 'Der lag rahi hai', en: 'Taking longer' },
  evCheck: { hi: 'खुले ऑर्डर', hl: 'Khule order', en: 'Open orders' },
  evStopped: { hi: 'नज़र नहीं रख रहे', hl: 'Nazar nahi rakh rahe', en: 'Not following' },
  leadPlaced: {
    hi: 'आपका फ्यूल ऑर्डर IndianOil के पोर्टल पर लग गया है। टैंकर मिलते ही हम यहाँ बताएँगे।',
    hl: 'Aapka fuel order IndianOil ke portal par lag gaya hai. Tanker milte hi hum yahan bataenge.',
    en: "Your fuel order is placed on IndianOil's portal. We will tell you here as soon as a tanker is assigned.",
  },
  leadRefused: {
    hi: 'IndianOil ने आपका फ्यूल ऑर्डर नहीं लिया।',
    hl: 'IndianOil ne aapka fuel order nahi liya.',
    en: 'IndianOil did not take your fuel order.',
  },
  leadUnclear: {
    hi: 'हम पक्का नहीं कर पाए कि ऑर्डर लगा या नहीं। पोर्टल देख लें।',
    hl: 'Hum pakka nahi kar paaye ki order laga ya nahi. Portal dekh lein.',
    en: 'We could not confirm that the order went through. Please check the portal.',
  },
  leadNotPlaced: {
    hi: 'आपका फ्यूल ऑर्डर नहीं लग पाया।',
    hl: 'Aapka fuel order nahi lag paaya.',
    en: 'Your fuel order was not placed.',
  },
  leadAssigned: {
    hi: 'आपका टैंकर मिल गया: {tt}। डिलीवरी {day}।',
    hl: 'Aapka tanker mil gaya: {tt}. Delivery {day}.',
    en: 'Your tanker is assigned: {tt}. Delivery {day}.',
  },
  leadAssignedNoDay: {
    hi: 'आपका टैंकर मिल गया: {tt}।',
    hl: 'Aapka tanker mil gaya: {tt}.',
    en: 'Your tanker is assigned: {tt}.',
  },
  leadAssignedLate: {
    hi: 'आपका टैंकर {tt} पहले ही मिल चुका था।',
    hl: 'Aapka tanker {tt} pehle hi mil chuka tha.',
    en: 'Your tanker {tt} was assigned earlier.',
  },
  leadAssignedBare: {
    hi: 'आपका टैंकर मिल गया।',
    hl: 'Aapka tanker mil gaya.',
    en: 'Your tanker is assigned.',
  },
  leadCancelled: {
    hi: 'आपका फ्यूल ऑर्डर रद्द हो गया।',
    hl: 'Aapka fuel order radd ho gaya.',
    en: 'Your fuel order is cancelled.',
  },
  leadCancelling: {
    hi: 'आपका फ्यूल ऑर्डर रद्द किया जा रहा है।',
    hl: 'Aapka fuel order radd kiya ja raha hai.',
    en: 'Your fuel order is being cancelled.',
  },
  leadCancelRefused: {
    hi: 'पोर्टल ने रद्द करने नहीं दिया। ऑर्डर अभी चालू है।',
    hl: 'Portal ne radd karne nahi diya. Order abhi chalu hai.',
    en: 'The portal did not let us cancel. The order is still on.',
  },
  leadCancelUnclear: {
    hi: 'हम पक्का नहीं कर पाए कि ऑर्डर रद्द हुआ या नहीं। पोर्टल देख लें।',
    hl: 'Hum pakka nahi kar paaye ki order radd hua ya nahi. Portal dekh lein.',
    en: 'We could not confirm that the order was cancelled. Please check the portal.',
  },
  leadCancelNotPressed: {
    hi: 'ऑर्डर रद्द नहीं हुआ।',
    hl: 'Order radd nahi hua.',
    en: 'The order was not cancelled.',
  },
  leadCancelExpired: {
    hi: 'ऑर्डर का समय पहले ही निकल चुका था।',
    hl: 'Order ka samay pehle hi nikal chuka tha.',
    en: 'The order had already run out of time.',
  },
  leadNotRun: {
    hi: 'IndianOil ने यह ऑर्डर चलाया नहीं।',
    hl: 'IndianOil ne yeh order chalaya nahi.',
    en: 'IndianOil has not run this order.',
  },
  leadNoTanker: {
    hi: 'दोपहर तक इस ऑर्डर का टैंकर नहीं मिला है।',
    hl: 'Dopahar tak is order ka tanker nahi mila hai.',
    en: 'No tanker has been assigned to this order by the afternoon.',
  },
  leadLapsed: {
    hi: 'ऑर्डर का समय निकल गया और IndianOil ने इसे चलाया नहीं।',
    hl: 'Order ka samay nikal gaya aur IndianOil ne ise chalaya nahi.',
    en: 'The order ran out of time without IndianOil running it.',
  },
  leadClosed: {
    hi: 'यह ऑर्डर पोर्टल पर बंद हो गया है।',
    hl: 'Yeh order portal par band ho gaya hai.',
    en: 'This order is closed on the portal.',
  },
  leadChanged: {
    hi: 'आपका टैंकर बदल गया है। नया टैंकर: {tt}।',
    hl: 'Aapka tanker badal gaya hai. Naya tanker: {tt}.',
    en: 'Your tanker has changed. The new tanker is {tt}.',
  },
  leadChangedBare: {
    hi: 'आपका टैंकर बदल गया है।',
    hl: 'Aapka tanker badal gaya hai.',
    en: 'Your tanker has changed.',
  },
  leadDetails: {
    hi: 'टैंकर की जानकारी जुड़ गई है: {tt}।',
    hl: 'Tanker ki jaankari judi hai: {tt}.',
    en: 'Tanker details added: {tt}.',
  },
  leadDetailsBare: {
    hi: 'टैंकर की जानकारी जुड़ गई है।',
    hl: 'Tanker ki jaankari judi hai.',
    en: 'Tanker details added.',
  },
  leadDuplicate: {
    hi: 'यह ऑर्डर {other} जैसा ही लगता है।',
    hl: 'Yeh order {other} jaisa hi lagta hai.',
    en: 'This looks like the same order as {other}.',
  },
  leadDuplicateBare: {
    hi: 'यह ऑर्डर किसी दूसरे ऑर्डर जैसा ही लगता है।',
    hl: 'Yeh order kisi doosre order jaisa hi lagta hai.',
    en: 'This looks like the same order as another one.',
  },
  leadDelayed: {
    hi: 'आपका ऑर्डर लगाने में आज देर लग रही है।',
    hl: 'Aapka order lagane mein aaj der lag rahi hai.',
    en: 'Placing your order is taking longer than usual.',
  },
  leadStopped: {
    hi: 'हम इस ऑर्डर पर नज़र नहीं रख पा रहे।',
    hl: 'Hum is order par nazar nahi rakh paa rahe.',
    en: 'We are not able to follow this order.',
  },
  leadCheck: {
    hi: 'आपके खुले फ्यूल ऑर्डर ({when} तक)।',
    hl: 'Aapke khule fuel order ({when} tak).',
    en: 'Your open fuel orders as of {when}.',
  },
  leadCheckNone: {
    hi: 'अभी आपका कोई फ्यूल ऑर्डर खुला नहीं है।',
    hl: 'Abhi aapka koi fuel order khula nahi hai.',
    en: 'You have no open fuel orders right now.',
  },
  nextCheck: { hi: 'अगली जाँच {when}', hl: 'Agli jaanch {when}', en: 'Next check {when}' },
  // Why.
  shortBy: { hi: '{n} कम पड़ा', hl: '{n} kam pada', en: 'Short by {n}' },
  fundsLine: {
    hi: 'आपकी क्रेडिट लिमिट इस ऑर्डर के लिए काफ़ी नहीं थी।',
    hl: 'Aapki credit limit is order ke liye kaafi nahi thi.',
    en: 'Your credit limit was not enough for this order.',
  },
  creditHead: { hi: 'आपका हिसाब ({when})', hl: 'Aapka hisaab ({when})', en: 'Your credit position ({when})' },
  creditLimit: { hi: 'बची हुई लिमिट {n}', hl: 'Bachi hui limit {n}', en: 'Limit left {n}' },
  creditDue: { hi: 'जमा करना है {n}', hl: 'Jama karna hai {n}', en: 'To deposit {n}' },
  creditDueBy: { hi: 'जमा करना है {n}, {day} तक', hl: 'Jama karna hai {n}, {day} tak', en: 'To deposit {n} by {day}' },
  creditOverdue: { hi: 'देर हो चुकी {n}', hl: 'Der ho chuki {n}', en: 'Overdue {n}' },
  creditAdvance: { hi: 'IndianOil के पास आपका एडवांस {n}', hl: 'IndianOil ke paas aapka advance {n}', en: 'IndianOil holds your advance {n}' },
  usualSize: {
    hi: 'आपके टैंकर का आम साइज़ {kl} है।',
    hl: 'Aapke tanker ka aam size {kl} hai.',
    en: 'Your usual tanker size is {kl}.',
  },
  loginRefused: {
    hi: 'IndianOil का लॉगिन नहीं चल रहा, इसलिए ऑर्डर नहीं लग पाया।',
    hl: 'IndianOil ka login nahi chal raha, isliye order nahi lag paaya.',
    en: 'We could not sign in to IndianOil, so the order was not placed.',
  },
  expiredLine: {
    hi: 'ऑर्डर का समय निकल गया था।',
    hl: 'Order ka samay nikal gaya tha.',
    en: 'The order ran out of time.',
  },
  delayCaptcha: {
    hi: 'IndianOil की साइट ने एक जाँच माँगी है। हम फिर कोशिश करेंगे।',
    hl: 'IndianOil ki site ne ek jaanch maangi hai. Hum phir koshish karenge.',
    en: "IndianOil's site asked for a check. We will try again.",
  },
  delayCooldown: {
    hi: 'हम थोड़ा रुककर फिर कोशिश करेंगे।',
    hl: 'Hum thoda rukkar phir koshish karenge.',
    en: 'We are waiting a little before trying again.',
  },
  delayBusy: {
    hi: 'IndianOil की साइट अभी व्यस्त है। हम फिर कोशिश करेंगे।',
    hl: 'IndianOil ki site abhi busy hai. Hum phir koshish karenge.',
    en: "IndianOil's site is busy. We will try again.",
  },
  delayUnreachable: {
    hi: 'IndianOil की साइट अभी खुल नहीं रही। हम फिर कोशिश करेंगे।',
    hl: 'IndianOil ki site abhi khul nahi rahi. Hum phir koshish karenge.',
    en: "We cannot reach IndianOil's site right now. We will try again.",
  },
  retryUntil: { hi: '{when} तक कोशिश करते रहेंगे।', hl: '{when} tak koshish karte rahenge.', en: 'We will keep trying until {when}.' },
  breakPaused: {
    hi: 'फ्यूल ऑर्डर सेवा रुकी हुई है, इसलिए हम इस ऑर्डर को नहीं देख रहे।',
    hl: 'Fuel order service ruki hui hai, isliye hum is order ko nahi dekh rahe.',
    en: 'The fuel order service is paused, so we are not following this order.',
  },
  breakLogin: {
    hi: 'IndianOil का लॉगिन नहीं चल रहा, इसलिए हम इस ऑर्डर को नहीं देख पा रहे।',
    hl: 'IndianOil ka login nahi chal raha, isliye hum is order ko nahi dekh paa rahe.',
    en: 'IndianOil login is not working, so we cannot follow this order.',
  },
  // Alerts.
  alertRefusedFunds: {
    hi: 'फ्यूल ऑर्डर नहीं लगा: पैसे कम पड़े',
    hl: 'Fuel order nahi laga: paise kam pade',
    en: 'Fuel order not placed: short of funds',
  },
  alertRefused: {
    hi: 'IndianOil ने आपका फ्यूल ऑर्डर नहीं लिया',
    hl: 'IndianOil ne aapka fuel order nahi liya',
    en: 'IndianOil did not take your fuel order',
  },
  alertSeeDetails: {
    hi: 'वजह रिपोर्ट में देखें।',
    hl: 'Wajah report mein dekhein.',
    en: 'See the reason in the report.',
  },
  alertNotPlaced: { hi: 'फ्यूल ऑर्डर नहीं लग पाया', hl: 'Fuel order nahi lag paaya', en: 'Fuel order was not placed' },
  alertUnclear: {
    hi: 'पक्का नहीं कि ऑर्डर लगा',
    hl: 'Pakka nahi ki order laga',
    en: 'Not sure the order went through',
  },
  alertUnclearLine: { hi: 'पोर्टल देख लें।', hl: 'Portal dekh lein.', en: 'Please check the portal.' },
  alertChanged: { hi: 'टैंकर बदल गया', hl: 'Tanker badal gaya', en: 'Tanker changed' },
  alertChangedLine: { hi: 'नया टैंकर {tt}।', hl: 'Naya tanker {tt}.', en: 'New tanker {tt}.' },
  alertNoTanker: { hi: 'अभी तक टैंकर नहीं मिला', hl: 'Abhi tak tanker nahi mila', en: 'No tanker yet' },
  alertNoTankerLine: {
    hi: 'हम पोर्टल देख रहे हैं।',
    hl: 'Hum portal dekh rahe hain.',
    en: 'We are watching the portal.',
  },
  alertNotRun: { hi: 'IndianOil ने ऑर्डर चलाया नहीं', hl: 'IndianOil ne order chalaya nahi', en: 'IndianOil has not run the order' },
  alertLapsed: { hi: 'ऑर्डर का समय निकल गया', hl: 'Order ka samay nikal gaya', en: 'The order ran out of time' },
  alertDuplicate: { hi: 'ऑर्डर शायद दोबारा लगा है', hl: 'Order shayad dobara laga hai', en: 'This order may be a repeat' },
  alertStopped: { hi: 'ऑर्डर पर नज़र नहीं रख पा रहे', hl: 'Order par nazar nahi rakh paa rahe', en: 'We cannot follow this order' },
  // Share.
  shareOrder: { hi: 'ऑर्डर {no}', hl: 'Order {no}', en: 'Order {no}' },
} satisfies Record<string, Words>;

/** The four stops, left to right. */
const STOPS = [T.stopPlaced, T.stopTanker, T.stopLoaded, T.stopDelivered] as const;

export type RailStopKind = 'refused' | 'cancelled' | 'not_placed' | 'closed';

export interface RailState {
  /** The stop the truck is on: -1 before the first, 0..3. -1 also when the order stopped. */
  current: number;
  /** The order never reached the end: it shows a stopped mark on the first stop, the rest dashed. */
  stopped: RailStopKind | null;
}

/** Where an order stands on the rail, from the stage and whether a tanker was ever named. */
export function railOf(stage: FuelOrderSnapStage, ttNo: string | null | undefined): RailState {
  switch (stage) {
    case 'being_placed':
      return { current: -1, stopped: null };
    case 'waiting':
      return { current: 0, stopped: null };
    case 'tanker_assigned':
      return { current: 1, stopped: null };
    case 'invoiced':
      return { current: 2, stopped: null };
    case 'closed':
      return ttNo ? { current: 3, stopped: null } : { current: -1, stopped: 'closed' };
    case 'refused':
      return { current: -1, stopped: 'refused' };
    case 'cancelled':
      return { current: -1, stopped: 'cancelled' };
    case 'never_sent':
      return { current: -1, stopped: 'not_placed' };
  }
}

/** The big plain word for a stage ("Tanker on the way"). */
export function stageWords(stage: FuelOrderSnapStage, ttNo: string | null | undefined): Words {
  switch (stage) {
    case 'being_placed':
      return T.wordPlacing;
    case 'waiting':
      return T.wordPlaced;
    case 'tanker_assigned':
      return T.wordAssigned;
    case 'invoiced':
      return T.wordOnTheWay;
    case 'closed':
      return ttNo ? T.wordDelivered : T.wordClosed;
    case 'refused':
      return T.wordRefused;
    case 'cancelled':
      return T.wordCancelled;
    case 'never_sent':
      return T.wordNotPlaced;
  }
}

interface EventLook {
  status: ReportStatusKey;
  word: Words;
}

/** The badge: how the event stands and its short word. Cancel outcomes depend on `cancelState`. */
export function eventLook(data: FuelOrderData): EventLook {
  switch (data.event) {
    case 'placed':
      return { status: 'waiting', word: T.evPlaced };
    case 'refused':
      return { status: 'problem', word: T.evRefused };
    case 'unclear':
      return { status: 'attention', word: T.evUnclear };
    case 'not_placed':
      return { status: 'attention', word: T.evNotPlaced };
    case 'tanker_assigned':
      return { status: 'ok', word: T.evAssigned };
    case 'cancelled':
      switch (data.cancelState) {
        case 'cancelling':
          return { status: 'waiting', word: T.evCancelling };
        case 'refused':
        case 'unclear':
        case 'not_pressed':
          return { status: 'attention', word: T.evUnclear };
        default:
          return { status: 'info', word: T.evCancelled };
      }
    case 'not_executed_reason':
      return { status: 'attention', word: T.evNotRun };
    case 'no_tanker_by_afternoon':
      return { status: 'attention', word: T.evNoTanker };
    case 'lapsed_not_executed':
      return { status: 'attention', word: T.evLapsed };
    case 'closed_on_portal':
      return { status: 'info', word: T.evClosed };
    case 'tanker_changed':
      return { status: 'attention', word: T.evChanged };
    case 'tanker_details_added':
      return { status: 'ok', word: T.evDetails };
    case 'possible_duplicate':
      return { status: 'attention', word: T.evDuplicate };
    case 'delayed':
      return { status: 'waiting', word: T.evDelayed };
    case 'check_result':
      return { status: 'info', word: T.evCheck };
    case 'tracking_stopped':
      return { status: 'attention', word: T.evStopped };
  }
}

function tt(data: FuelOrderData): string {
  return (data.ttNo ?? '').trim();
}

/** The one plain sentence the overlay opens with. */
export function leadOf(data: FuelOrderData, lang: Lang): string {
  const ttNo = tt(data);
  const day = dayWords(data.deliveryDay, lang, { weekday: true });
  switch (data.event) {
    case 'placed':
      return say(T.leadPlaced, lang);
    case 'refused':
      return say(T.leadRefused, lang);
    case 'unclear':
      return say(T.leadUnclear, lang);
    case 'not_placed':
      return say(T.leadNotPlaced, lang);
    case 'tanker_assigned':
      if (!ttNo) return say(T.leadAssignedBare, lang);
      if (data.seenLate) return fill(T.leadAssignedLate, lang, { tt: ttNo });
      return day ? fill(T.leadAssigned, lang, { tt: ttNo, day }) : fill(T.leadAssignedNoDay, lang, { tt: ttNo });
    case 'cancelled':
      switch (data.cancelState) {
        case 'cancelling':
          return say(T.leadCancelling, lang);
        case 'refused':
          return say(T.leadCancelRefused, lang);
        case 'unclear':
          return say(T.leadCancelUnclear, lang);
        case 'not_pressed':
          return say(T.leadCancelNotPressed, lang);
        case 'expired':
          return say(T.leadCancelExpired, lang);
        default:
          return say(T.leadCancelled, lang);
      }
    case 'not_executed_reason':
      return say(T.leadNotRun, lang);
    case 'no_tanker_by_afternoon':
      return say(T.leadNoTanker, lang);
    case 'lapsed_not_executed':
      return say(T.leadLapsed, lang);
    case 'closed_on_portal':
      return say(T.leadClosed, lang);
    case 'tanker_changed':
      return ttNo ? fill(T.leadChanged, lang, { tt: ttNo }) : say(T.leadChangedBare, lang);
    case 'tanker_details_added':
      return ttNo ? fill(T.leadDetails, lang, { tt: ttNo }) : say(T.leadDetailsBare, lang);
    case 'possible_duplicate':
      return data.duplicateOf ? fill(T.leadDuplicate, lang, { other: data.duplicateOf }) : say(T.leadDuplicateBare, lang);
    case 'delayed':
      return say(T.leadDelayed, lang);
    case 'check_result':
      return data.orders && data.orders.length > 0
        ? fill(T.leadCheck, lang, { when: instantWords(data.asOf, lang) })
        : say(T.leadCheckNone, lang);
    case 'tracking_stopped':
      return say(T.leadStopped, lang);
  }
}

function fuelLine(line: FuelOrderData['lines'][number], lang: Lang): string {
  const name = line.product ? fuelName(line.product, lang) : line.material;
  return line.kl === null ? name : `${name} ${kl(line.kl)}`;
}

function fuelsText(data: FuelOrderData, lang: Lang): string {
  return data.lines.map((l) => fuelLine(l, lang)).join(', ');
}

// ── pieces ──────────────────────────────────────────────────────────────────

const STATUS_BAR: Record<ReportStatusKey, string> = {
  problem: 'border-status-problem bg-status-problem-soft text-status-problem-ink',
  attention: 'border-status-attention bg-status-attention-soft text-status-attention-ink',
  waiting: 'border-status-waiting bg-status-waiting-soft text-status-waiting-ink',
  ok: 'border-status-ok bg-status-ok-soft text-status-ok-ink',
  info: 'border-status-info bg-status-info-soft text-status-info-ink',
};

function StopMarker({
  kind,
  current,
  stopped,
}: {
  kind: 'done' | 'current' | 'todo';
  current?: boolean;
  stopped?: RailStopKind | null;
}): ReactElement {
  if (stopped) {
    const refused = stopped === 'refused';
    return (
      <span
        data-marker="stopped"
        className={cn(
          'flex h-11 w-11 items-center justify-center rounded-full border-[3px] bg-surface',
          refused ? 'border-status-problem text-status-problem-ink' : 'border-status-info text-status-info-ink',
        )}
      >
        {refused ? <Octagon aria-hidden="true" className="h-6 w-6" strokeWidth={2.6} /> : stopped === 'closed' ? <Ban aria-hidden="true" className="h-6 w-6" /> : <CircleX aria-hidden="true" className="h-6 w-6" />}
      </span>
    );
  }
  if (kind === 'done') {
    return (
      <span data-marker="done" className="flex h-9 w-9 items-center justify-center rounded-full bg-kind-tanker text-white">
        <Check aria-hidden="true" className="h-5 w-5" strokeWidth={3.2} />
      </span>
    );
  }
  if (kind === 'current' || current) {
    return (
      <span
        data-marker="current"
        className="flex h-12 w-12 items-center justify-center rounded-full bg-kind-tanker text-white ring-4 ring-kind-tanker-soft"
      >
        <Truck aria-hidden="true" className="h-6 w-6" strokeWidth={2.4} />
      </span>
    );
  }
  return <span data-marker="todo" className="h-9 w-9 rounded-full border-[3px] border-dashed border-border-strong bg-surface" />;
}

/** The four-stop rail: an ordered list, each stop a tick, a truck or an empty ring, with its words below. */
export function Rail({ state, dates, lang }: { state: RailState; dates?: Array<string | null>; lang: Lang }): ReactElement {
  const label = state.stopped ? say(T.railStopped, lang) : say(T.railLabel, lang);
  return (
    <ol data-testid="fuel-rail" aria-label={label} className="grid grid-cols-4">
      {STOPS.map((words, i) => {
        const stopHere = state.stopped !== null && i === 0;
        const kind: 'done' | 'current' | 'todo' = state.stopped ? 'todo' : i < state.current ? 'done' : i === state.current ? 'current' : 'todo';
        const leftDone = !state.stopped && i <= state.current;
        const rightDone = !state.stopped && i + 1 <= state.current;
        const stopWord = stopHere && state.stopped === 'closed' ? T.stopClosed : words;
        const stepState = state.stopped ? T.stepTodo : kind === 'done' ? T.stepDone : kind === 'current' ? T.stepCurrent : T.stepTodo;
        const date = kind === 'current' ? dates?.[i] : null;
        return (
          <li key={i} data-stop={i} data-state={stopHere ? 'stopped' : kind} aria-current={kind === 'current' ? 'step' : undefined} className="relative flex min-w-0 flex-col items-center px-0.5">
            <span className="relative flex h-12 w-full items-center justify-center">
              {i > 0 ? (
                <span aria-hidden="true" className={cn('absolute left-0 right-1/2 top-1/2 -translate-y-1/2', leftDone ? 'h-1 bg-kind-tanker' : 'h-0 border-t-4 border-dashed border-border-strong')} />
              ) : null}
              {i < 3 ? (
                <span aria-hidden="true" className={cn('absolute left-1/2 right-0 top-1/2 -translate-y-1/2', rightDone ? 'h-1 bg-kind-tanker' : 'h-0 border-t-4 border-dashed border-border-strong')} />
              ) : null}
              <span className="relative z-10">
                <StopMarker kind={kind} stopped={stopHere ? state.stopped : null} />
              </span>
            </span>
            <span className={cn('mt-1 text-center text-subheading text-text [overflow-wrap:anywhere]', leadingFor(lang), kind === 'todo' && !stopHere && 'text-text-muted')}>
              {say(stopWord, lang)}
            </span>
            {date ? <span className="text-center text-body text-text-muted">{date}</span> : null}
            <span className="sr-only">
              {fill(T.stepOf, lang, { i: String(i + 1) })}, {say(stopHere ? T.stepTodo : stepState, lang)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** A small inline rail (four dots, the truck on the current one) for the list of open orders. */
function MiniRail({ state }: { state: RailState }): ReactElement {
  return (
    <span aria-hidden="true" className="inline-flex items-center gap-1">
      {[0, 1, 2, 3].map((i) => {
        const done = !state.stopped && i < state.current;
        const here = !state.stopped && i === state.current;
        return here ? (
          <span key={i} className="flex h-6 w-6 items-center justify-center rounded-full bg-kind-tanker text-white">
            <Truck className="h-3.5 w-3.5" strokeWidth={2.6} />
          </span>
        ) : (
          <span
            key={i}
            className={cn('h-3 w-3 rounded-full', done ? 'bg-kind-tanker' : 'border-2 border-dashed border-border-strong bg-surface')}
          />
        );
      })}
    </span>
  );
}

/** Fuel lines as compartment blocks, each as wide as its litres. */
function Compartments({ data, lang }: { data: FuelOrderData; lang: Lang }): ReactElement | null {
  if (data.lines.length === 0) return null;
  return (
    <div data-testid="compartments">
      <ul className="flex flex-wrap gap-2">
        {data.lines.map((line, i) => (
          <li
            key={`${line.material}-${i}`}
            data-product={line.product ?? ''}
            className="min-w-[120px] rounded-lg border border-border bg-surface px-3 py-2"
            style={{ flexGrow: Math.max(1, Math.round(line.kl ?? 1)), flexBasis: 0 }}
          >
            <p className="text-subheading text-kind-tanker-ink">
              {line.product ? <FuelSwatch productKey={line.product} className="mr-2" /> : null}
              {line.product ? fuelName(line.product, lang) : line.material}
            </p>
            <p className="text-title leading-tight text-text">{line.kl === null ? say(T.klUnknown, lang) : kl(line.kl)}</p>
          </li>
        ))}
      </ul>
      {data.lines.length > 1 && data.totalKl !== null ? (
        <p className={cn('mt-1 text-subheading text-text-muted', leadingFor(lang))}>{fill(T.total, lang, { kl: kl(data.totalKl) })}</p>
      ) : null}
    </div>
  );
}

function FactRow({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-t border-border py-2 first:border-t-0">
      <dt className="text-body text-text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-right text-subheading text-text">{children}</dd>
    </div>
  );
}

function delayWords(why: NonNullable<FuelOrderData['delayWhy']>): Words {
  switch (why) {
    case 'captcha':
      return T.delayCaptcha;
    case 'cooldown':
      return T.delayCooldown;
    case 'busy':
      return T.delayBusy;
    case 'unreachable':
      return T.delayUnreachable;
  }
}

/** What went wrong and what it means, in our words, beyond IndianOil's own sentence. */
function ReasonBlock({ data, lang }: { data: FuelOrderData; lang: Lang }): ReactElement | null {
  const rows: ReactElement[] = [];
  const credit = data.credit;
  if (data.reasonCode === 'shortage_of_funds') {
    if (data.shortByRs !== null && data.shortByRs !== undefined) {
      rows.push(
        <p key="short" data-testid="short-by" className="text-title text-text">
          {fill(T.shortBy, lang, { n: rupees(data.shortByRs) })}
        </p>,
      );
    }
    rows.push(
      <p key="funds" className={cn('text-body text-text', leadingFor(lang))}>
        {say(T.fundsLine, lang)}
      </p>,
    );
    if (credit) {
      const lines: string[] = [];
      if (credit.availableLimit !== null) lines.push(fill(T.creditLimit, lang, { n: rupees(credit.availableLimit) }));
      if (credit.side === 'advance' && credit.advanceAmount) lines.push(fill(T.creditAdvance, lang, { n: rupees(credit.advanceAmount) }));
      else if (credit.dueAmount) {
        const by = dayWords(credit.dueDate, lang);
        lines.push(by ? fill(T.creditDueBy, lang, { n: rupees(credit.dueAmount), day: by }) : fill(T.creditDue, lang, { n: rupees(credit.dueAmount) }));
      }
      if (credit.overdueAmount) lines.push(fill(T.creditOverdue, lang, { n: rupees(credit.overdueAmount) }));
      if (lines.length > 0) {
        rows.push(
          <div key="credit" data-testid="credit-position" className="rounded-lg bg-surface-2 px-3 py-2">
            <p className="text-subheading text-text-muted">{fill(T.creditHead, lang, { when: dayWords(credit.capturedAt, lang) })}</p>
            {lines.map((l) => (
              <p key={l} className={cn('text-body text-text', leadingFor(lang))}>
                {l}
              </p>
            ))}
          </div>,
        );
      }
    }
  } else if (data.reasonCode === 'min_tt_capacity' && data.suggestKl) {
    rows.push(
      <p key="size" data-testid="usual-size" className={cn('text-subheading text-text', leadingFor(lang))}>
        {fill(T.usualSize, lang, { kl: kl(data.suggestKl) })}
      </p>,
    );
  } else if (data.reasonCode === 'login_refused') {
    rows.push(
      <p key="login" className={cn('text-body text-text', leadingFor(lang))}>
        {say(T.loginRefused, lang)}
      </p>,
    );
  } else if (data.reasonCode === 'expired') {
    rows.push(
      <p key="expired" className={cn('text-body text-text', leadingFor(lang))}>
        {say(T.expiredLine, lang)}
      </p>,
    );
  }
  if (data.event === 'delayed' && data.delayWhy) {
    rows.push(
      <p key="delay" className={cn('text-body text-text', leadingFor(lang))}>
        {say(delayWords(data.delayWhy), lang)}
        {data.retryUntil ? ` ${fill(T.retryUntil, lang, { when: clockWords(data.retryUntil, lang) })}` : ''}
      </p>,
    );
  }
  if (data.event === 'tracking_stopped' && data.trackingBreak) {
    rows.push(
      <p key="break" className={cn('text-body text-text', leadingFor(lang))}>
        {say(data.trackingBreak === 'login' ? T.breakLogin : T.breakPaused, lang)}
      </p>,
    );
  }
  if (rows.length === 0) return null;
  return (
    <div data-testid="reason-block" className="space-y-2 rounded-xl border border-border bg-surface px-4 py-3">
      {rows}
    </div>
  );
}

function OrdersList({ data, lang }: { data: FuelOrderData; lang: Lang }): ReactElement | null {
  const orders = data.orders ?? [];
  if (orders.length === 0) return null;
  return (
    <ul data-testid="orders-list" className="space-y-2">
      {orders.map((o, i) => {
        const state = railOf(o.stage, o.ttNo);
        const day = dayWords(o.deliveryDay, lang, { weekday: true });
        return (
          <li key={`${o.orderNo ?? 'x'}-${i}`} className="rounded-xl border border-border bg-surface px-4 py-3">
            <p className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="select-all break-all font-mono text-subheading text-text">{o.orderNo ?? '—'}</span>
              {day ? <span className="text-body text-text-muted">{day}</span> : null}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <MiniRail state={state} />
              <span className="text-subheading text-text">{say(stageWords(o.stage, o.ttNo), lang)}</span>
            </p>
            {o.ttNo ? <p className="select-all break-all font-mono text-body text-text">{o.ttNo}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}

/** The date printed under the lit stop: where the order is on the calendar. */
function railDates(data: FuelOrderData, lang: Lang): Array<string | null> {
  const day = (raw: string | null | undefined): string | null => dayWords(raw, lang) || null;
  return [day(data.asOf), day(data.shipmentAt), day(data.loadAt ?? data.shipmentAt), day(data.deliveryDay)];
}

export function Overlay({ data, lang }: OverlayProps<'fuel_order'>): ReactElement {
  const look = eventLook(data);
  const isCheck = data.event === 'check_result';
  const state = railOf(data.stage, data.ttNo);
  const ttNo = tt(data);
  const showPlate = !isCheck && !state.stopped && data.stage !== 'being_placed';
  const asOf = instantWords(data.asOf, lang);
  const day = dayWords(data.deliveryDay, lang, { weekday: true });
  const ship = instantWords(data.shipmentAt, lang);
  const load = instantWords(data.loadAt, lang);
  const hasFacts = !isCheck && (day || ship || load || data.orderNo || data.source);
  return (
    <div data-kind-view="fuel_order" data-event={data.event} data-stage={data.stage} className="space-y-4 p-4">
      <div role="status" data-testid="event-banner" className={cn('rounded-xl px-4 py-3', STATUS_BAR[look.status])}>
        <StatusBadge status={look.status} lang={lang} word={say(look.word, lang)} />
        <Lead lang={lang} className="mt-2 !text-inherit">
          {leadOf(data, lang)}
        </Lead>
      </div>

      {isCheck ? (
        <>
          <OrdersList data={data} lang={lang} />
          {data.nextCheckAt ? (
            <p className={cn('text-body text-text-muted', leadingFor(lang))}>{fill(T.nextCheck, lang, { when: instantWords(data.nextCheckAt, lang) })}</p>
          ) : null}
        </>
      ) : (
        <div className="rounded-xl bg-kind-tanker-soft px-2 py-4">
          <Rail state={state} dates={railDates(data, lang)} lang={lang} />
        </div>
      )}

      {showPlate ? (
        <div className="space-y-1.5">
          <NumberPlate text={ttNo} lang={lang} size="md" emptyWords={T.tankerNone} label={T.tankerLabel} />
          {data.event === 'tanker_changed' && data.prevTtNo ? (
            <p className={cn('text-body text-text-muted', leadingFor(lang))}>
              {say(T.earlierTanker, lang)}: <s className="select-all font-mono font-semibold">{data.prevTtNo}</s>
            </p>
          ) : null}
        </div>
      ) : null}

      {!isCheck ? <Compartments data={data} lang={lang} /> : null}

      <ReasonBlock data={data} lang={lang} />

      {data.portalStatus || data.portalReason ? (
        <IndianOilSays lang={lang}>
          {data.portalStatus ? (
            <span className="block">
              <span className="text-text-muted">{say(T.statusLine, lang)}: </span>
              {data.portalStatus}
            </span>
          ) : null}
          {data.portalReason ? <span className="block">{data.portalReason}</span> : null}
        </IndianOilSays>
      ) : null}

      {hasFacts ? (
        <dl data-testid="order-facts" className="rounded-xl border border-border bg-surface px-4 py-1">
          {day ? <FactRow label={say(T.deliveryDay, lang)}>{day}</FactRow> : null}
          {ship ? <FactRow label={say(T.shipment, lang)}>{ship}</FactRow> : null}
          {load ? <FactRow label={say(T.loadedAt, lang)}>{load}</FactRow> : null}
          {data.orderNo ? (
            <FactRow label={say(T.orderNo, lang)}>
              <span className="select-all break-all font-mono">{data.orderNo}</span>
            </FactRow>
          ) : null}
          <FactRow label={say(T.source, lang)}>{say(data.source === 'chat' ? T.sourceChat : T.sourcePortal, lang)}</FactRow>
        </dl>
      ) : null}

      {data.seenLate ? <p className={cn('text-body text-text-muted', leadingFor(lang))}>{say(T.seenLate, lang)}</p> : null}

      {asOf && !isCheck ? <p className={cn('text-body text-text-muted', leadingFor(lang))}>{fill(T.asOf, lang, { when: asOf })}</p> : null}
    </div>
  );
}

/** 40 x 28 mini: the rail with four dots, the second one carrying the truck. */
export function Glyph({ size = 28 }: { size?: number }): ReactElement {
  const width = Math.round((size * 40) / 28);
  return (
    <svg width={width} height={size} viewBox="0 0 40 28" aria-hidden="true" focusable="false">
      <path d="M5 14 H15" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M15 14 H35" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="1 4.5" />
      <circle cx="5" cy="14" r="3.2" fill="currentColor" />
      <circle cx="25" cy="14" r="2.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="35" cy="14" r="2.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="15" cy="14" r="7.5" fill="currentColor" />
      <path d="M10.8 12.2 H15.6 V16.8 H10.8 Z M15.6 13.6 H18 L19.2 15 V16.8 H15.6" fill="none" stroke="#ffffff" strokeWidth="1.3" strokeLinejoin="round" />
      <circle cx="12.4" cy="17.4" r="1" fill="#ffffff" />
      <circle cx="17.2" cy="17.4" r="1" fill="#ffffff" />
    </svg>
  );
}

const NO_TILE_EVENTS: ReadonlySet<FuelOrderData['event']> = new Set([
  'refused',
  'unclear',
  'not_placed',
  'cancelled',
  'not_executed_reason',
  'lapsed_not_executed',
  'possible_duplicate',
  'tracking_stopped',
]);

function tile(data: FuelOrderData, lang: Lang): KindTile | null {
  if (NO_TILE_EVENTS.has(data.event)) return null;
  if (data.stage === 'refused' || data.stage === 'cancelled' || data.stage === 'never_sent') return null;
  if (data.event === 'check_result') {
    const orders = data.orders ?? [];
    if (orders.length === 0) return null;
    if (orders.length > 1) return { value: fill(T.nOrders, lang, { n: String(orders.length) }), status: 'info' };
    const only = orders[0]!;
    const sub = [only.ttNo, dayWords(only.deliveryDay, lang, { weekday: true })].filter(Boolean).join(', ');
    return { value: say(stageWords(only.stage, only.ttNo), lang), sub: sub || undefined, status: only.stage === 'closed' ? 'ok' : 'waiting' };
  }
  const subParts = [tt(data), fuelsText(data, lang), dayWords(data.deliveryDay, lang, { weekday: true })].filter(Boolean);
  const stageStatus: ReportStatusKey = data.stage === 'waiting' || data.stage === 'being_placed' ? 'waiting' : data.stage === 'closed' ? 'ok' : 'ok';
  const status = data.event === 'tanker_changed' || data.event === 'no_tanker_by_afternoon' ? 'attention' : data.event === 'delayed' ? 'waiting' : stageStatus;
  return { value: say(stageWords(data.stage, data.ttNo), lang), sub: subParts.join(', ') || undefined, status };
}

function alert(data: FuelOrderData, lang: Lang): KindAlert | null {
  switch (data.event) {
    case 'refused': {
      if (data.reasonCode === 'shortage_of_funds') {
        return {
          headline: say(T.alertRefusedFunds, lang),
          line:
            data.shortByRs !== null && data.shortByRs !== undefined
              ? fill(T.shortBy, lang, { n: rupees(data.shortByRs) }) + '.'
              : say(T.fundsLine, lang),
          severity: 'problem',
        };
      }
      return {
        headline: say(T.alertRefused, lang),
        line: data.reasonCode === 'min_tt_capacity' && data.suggestKl ? fill(T.usualSize, lang, { kl: kl(data.suggestKl) }) : say(T.alertSeeDetails, lang),
        severity: 'problem',
      };
    }
    case 'not_placed':
      return { headline: say(T.alertNotPlaced, lang), line: say(T.alertSeeDetails, lang), severity: 'attention' };
    case 'unclear':
      return { headline: say(T.alertUnclear, lang), line: say(T.alertUnclearLine, lang), severity: 'attention' };
    case 'tanker_changed':
      return {
        headline: say(T.alertChanged, lang),
        line: tt(data) ? fill(T.alertChangedLine, lang, { tt: tt(data) }) : say(T.alertSeeDetails, lang),
        severity: 'attention',
      };
    case 'no_tanker_by_afternoon':
      return { headline: say(T.alertNoTanker, lang), line: say(T.alertNoTankerLine, lang), severity: 'attention' };
    case 'not_executed_reason':
      return { headline: say(T.alertNotRun, lang), line: say(T.alertSeeDetails, lang), severity: 'attention' };
    case 'lapsed_not_executed':
      return { headline: say(T.alertLapsed, lang), line: say(T.alertSeeDetails, lang), severity: 'attention' };
    case 'possible_duplicate':
      return { headline: say(T.alertDuplicate, lang), line: say(T.alertSeeDetails, lang), severity: 'attention' };
    case 'tracking_stopped':
      return {
        headline: say(T.alertStopped, lang),
        line: say(data.trackingBreak === 'login' ? T.breakLogin : T.breakPaused, lang),
        severity: 'attention',
      };
    default:
      return null;
  }
}

function headline(data: FuelOrderData, lang: Lang): string {
  const word = say(eventLook(data).word, lang);
  if (data.event === 'check_result') {
    const n = data.orders?.length ?? 0;
    return n > 0 ? `${word}: ${n === 1 ? say(T.nOrdersOne, lang) : fill(T.nOrders, lang, { n: String(n) })}` : say(T.leadCheckNone, lang);
  }
  const bits = [tt(data), fuelsText(data, lang), dayWords(data.deliveryDay, lang, { weekday: true })].filter(Boolean);
  return bits.length > 0 ? `${word}: ${bits.join(', ')}` : word;
}

function share(data: FuelOrderData, lang: Lang): string {
  const ship = instantWords(data.shipmentAt, lang);
  const day = dayWords(data.deliveryDay, lang, { weekday: true });
  return shareLines([
    data.orderNo ? `${say(T.title, lang)}: ${fill(T.shareOrder, lang, { no: data.orderNo })}` : say(T.title, lang),
    leadOf(data, lang),
    tt(data) && `${say(T.tankerLabel, lang)}: ${tt(data)}`,
    ...data.lines.map((l) => fuelLine(l, lang)),
    day && `${say(T.deliveryDay, lang)}: ${day}`,
    ship && `${say(T.shipment, lang)}: ${ship}`,
    data.portalStatus && `IndianOil ${say(T.statusLine, lang)}: ${data.portalStatus}`,
    data.portalReason,
    data.reasonCode === 'shortage_of_funds' && data.shortByRs !== null && data.shortByRs !== undefined
      ? fill(T.shortBy, lang, { n: rupees(data.shortByRs) })
      : null,
    instantWords(data.asOf, lang) && fill(T.asOf, lang, { when: instantWords(data.asOf, lang) }),
  ]);
}

export const view: KindView<'fuel_order'> = {
  kind: 'fuel_order',
  Overlay,
  Glyph,
  tile,
  alert,
  headline,
  share,
};
