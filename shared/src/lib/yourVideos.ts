/**
 * The videos in the "your videos" list, and the sentences each one teaches.
 *
 * One row per video: which guide video it is, which service it is about, and a few
 * real sentences a dealer can type or say to that service. They are Hinglish first
 * (what dealers actually write), with Hindi and English for readers who chose them.
 *
 * EVERY SENTENCE HERE IS ONE THE SYSTEM REALLY UNDERSTANDS TODAY. A sentence that
 * the assistant would not act on is worse than no sentence: the dealer tries it, it
 * fails, and they stop trusting the list. `yourVideos.examples.test.ts` (in the
 * backend) runs the fuel-order and credit sentences through the very readers that
 * route a dealer's message, and `knowledge.drift.test.ts` checks that every video id
 * and every service named here exists. Add a sentence only after trying it.
 *
 * NO FIGURES THAT ARE NOT THE DEALER'S: a sentence names a quantity only where the
 * dealer would ("12 KL"), never a price, a date or a rule.
 *
 * Add a service by adding a row. The order here is the order of the list.
 */
import type { SomeDealerWords } from '../types/dealerLanguage';

export interface YourVideosEntry {
  /** The guide video's id (`GUIDE_LIBRARY`). */
  video: string;
  /** The service it is about (`SERVICE_LABELS`). */
  service: string;
  /** What the dealer can type or say, one sentence each. */
  examples: readonly SomeDealerWords[];
}

export const YOUR_VIDEOS: readonly YourVideosEntry[] = [
  {
    video: 'svc_dsr',
    service: 'dsr-report',
    examples: [
      {
        hl: 'Kal ki DSR dobara bhejiye',
        hi: 'कल की DSR दोबारा भेजिए',
        en: "Send yesterday's DSR again",
      },
      {
        hl: 'Aaj diesel ki sale kitni hui?',
        hi: 'आज डीज़ल की बिक्री कितनी हुई?',
        en: 'How much diesel did we sell today?',
      },
    ],
  },
  {
    video: 'variation_sheet',
    service: 'dsr-report',
    examples: [
      {
        hl: 'Diesel mein variation kitna hai?',
        hi: 'डीज़ल में वेरिएशन कितना है?',
        en: 'How much variation is there in diesel?',
      },
    ],
  },
  {
    video: 'svc_credit_dod',
    service: 'credit-dod-monitoring',
    examples: [
      {
        hl: 'Kitna due dena hai aaj?',
        hi: 'आज कितना due देना है?',
        en: 'How much due do I have to pay today?',
      },
      {
        hl: 'Mera DOD kitna baaki hai?',
        hi: 'मेरा DOD कितना बाकी है?',
        en: 'How much DOD is left?',
      },
      {
        hl: 'Credit limit kitni bachi hai?',
        hi: 'क्रेडिट लिमिट कितनी बची है?',
        en: 'How much of my credit limit is left?',
      },
    ],
  },
  {
    video: 'svc_fuel_orders',
    service: 'fuel-indent',
    examples: [
      {
        hl: 'Load laga dijiye 12KL HSD',
        hi: 'लोड लगा दीजिए 12KL HSD',
        en: 'Place a load of 12 KL HSD',
      },
      {
        hl: 'Kal ke liye 8 KL diesel aur 4 KL petrol laga do',
        hi: 'कल के लिए 8 KL डीज़ल और 4 KL पेट्रोल लगा दो',
        en: 'Order 8 KL diesel and 4 KL petrol for tomorrow',
      },
      {
        hl: 'Ye order cancel kar do',
        hi: 'ये ऑर्डर कैंसल कर दो',
        en: 'Cancel this order',
      },
    ],
  },
  {
    video: 'svc_stock_check',
    service: 'stock-check',
    examples: [
      {
        hl: 'Stock kitna hai?',
        hi: 'स्टॉक कितना है?',
        en: 'How much stock do I have?',
      },
      {
        hl: 'Tank mein diesel kitna bacha hai?',
        hi: 'टैंक में डीज़ल कितना बचा है?',
        en: 'How much diesel is left in the tank?',
      },
    ],
  },
  {
    video: 'svc_load_planner',
    service: 'load-planner',
    examples: [
      {
        hl: 'Load plan kya kehta hai?',
        hi: 'लोड प्लान क्या कहता है?',
        en: 'What does the load plan say?',
      },
      {
        hl: 'Agle kuch din ka tanker plan batao',
        hi: 'अगले कुछ दिन का टैंकर प्लान बताओ',
        en: 'Show me the tanker plan for the next few days',
      },
    ],
  },
  {
    video: 'svc_supply_status',
    service: 'ro-supply-status',
    examples: [
      {
        hl: 'Supply khuli hai ya band?',
        hi: 'सप्लाई खुली है या बंद?',
        en: 'Is my supply open or stopped?',
      },
    ],
  },
  {
    video: 'svc_water_ingress',
    service: 'water-ingress-testing',
    examples: [
      {
        hl: 'Aaj ki kitni jaanch darj ho chuki hain?',
        hi: 'आज की कितनी जाँच दर्ज हो चुकी हैं?',
        en: 'How many of today’s tank water checks are recorded?',
      },
    ],
  },
];

/** The entry for a video id, or undefined when it is not in the list. */
export function yourVideosEntry(videoId: string): YourVideosEntry | undefined {
  return YOUR_VIDEOS.find((e) => e.video === videoId);
}
