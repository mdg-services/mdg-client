/**
 * What each service is CALLED, in both languages the platform speaks.
 *
 * A plugin id (`tt-density`, `iras-shift-data`) is the name of a folder under
 * `mdg-backend/src/services/`. It is an internal identifier and it reads like
 * one. The admin already knew that and kept an English map; the dealer app had
 * none at all, so its Services page printed `credit-dod-monitoring` at a
 * Hindi-first pump owner and expected them to work out what it was.
 *
 * WHY THE HINDI IS NOT A TRANSLATION
 * ----------------------------------
 * The English column is the product name MDG staff use with each other, and it
 * carries our vocabulary — "TT", "DOD", "IRAS", "ingress". Translating those
 * words would produce Hindi nobody at a pump has ever said. So the Hindi column
 * is written from the other end: the dealer's own word for the thing they hold
 * or the thing they owe. `docs/specs/tt-density-ux.md` §2 settled that rule for
 * TT Density — the dealer's word is "डेंसिटी रजिस्टर", the book on their desk,
 * and "TT", "acknowledgement" and "invoice" never reach their screen — and every
 * other row here follows it. The two columns are therefore deliberately NOT
 * parallel, and a future edit that "fixes" the Hindi to match the English word
 * for word would be undoing the point.
 *
 * Both columns are data, not UI copy, which is why they live here rather than in
 * `mdg-client/src/lib/i18n.ts`: the same seven names are needed by the dealer
 * app, by the admin, and by anything that later has to name a service in a
 * message or a report, and three copies of a name is how a service ends up
 * called two different things in one conversation.
 */

/** A service's name in both languages. Mirrors the `{ en, hi }` shape the dealer app's catalog uses. */
export interface ServiceLabel {
  en: string;
  hi: string;
}

/**
 * Every registered plugin id, keyed exactly as the folder is named.
 *
 * The English side is verbatim what `mdg-admin/src/lib/serviceLabel.ts` showed
 * before this map existed, including its lower-case "request" in "Custom
 * request" — the admin's words are what operators read in run histories every
 * day and this file is not the place to restyle them.
 *
 * `water-ingress-testing` had no entry in the admin's map and fell through to its
 * humanising fallback, which produced "Water ingress testing". That exact string
 * is what appears below, so adding the row here leaves the admin's screens
 * looking precisely as they did.
 */
export const SERVICE_LABELS: Record<string, ServiceLabel> = {
  /**
   * What the dealer actually wants from this one is two facts: how much has to
   * reach IndianOil's account, and by when. Those are the words the shared card
   * already speaks to them in ("जमा करने की आख़िरी तारीख़", "कोई बकाया नहीं"), so
   * the service takes its name from them rather than from "Credit & DOD".
   */
  'credit-dod-monitoring': { en: 'Credit & DOD Monitoring', hi: 'बकाया और जमा की तारीख़' },
  /** A one-off job the dealer asked MDG for. "Custom" has no everyday Hindi; "what you asked for" does. */
  'custom-request': { en: 'Custom request', hi: 'आपका मांगा हुआ काम' },
  /** The dealer app already names this document in the Reports list; the same words, so it is recognisably the same thing. */
  'dsr-report': { en: 'Daily Sales Report', hi: 'रोज़ की बिक्री रिपोर्ट' },
  /** The officer's visit to the pump. Dealers say "इंस्पेक्शन", not "निरीक्षण". */
  'inspection-reports': { en: 'Inspection Reports', hi: 'इंस्पेक्शन रिपोर्ट' },
  /** IRAS is the portal WE log into. What the dealer recognises is the shift's readings coming off their own pumps. */
  'iras-shift-data': { en: 'IRAS shift data', hi: 'शिफ्ट की रीडिंग' },
  /** The book on the desk, per docs/specs/tt-density-ux.md §2. */
  'tt-density': { en: 'TT Density', hi: 'डेंसिटी रजिस्टर' },
  /** "Ingress" is an inspection form's word. The dealer's word is water in the tank. */
  'water-ingress-testing': { en: 'Water ingress testing', hi: 'टैंक में पानी की जाँच' },
  /**
   * Missing until now, so the dealer's Services page printed `load-planner`.
   * What the dealer gets from it is when to order which tanker. The English is
   * what the admin's humanising fallback already printed, as for water ingress,
   * so no admin screen or alert title changes.
   */
  'load-planner': { en: 'Load planner', hi: 'टैंकर मंगाने की योजना' },
  /** Missing until now too. The dealer's question is simply whether supply is open. */
  'ro-supply-status': { en: 'RO supply status', hi: 'सप्लाई की स्थिति' },
};

/**
 * The name of a service in both languages.
 *
 * An id we do not know degrades to the id itself in both columns rather than
 * throwing: a plugin can be registered on the backend and deployed before this
 * table catches up, and a dealer seeing a slug for a day is a great deal better
 * than a Services page that crashes on the one service they just bought.
 */
export function serviceLabel(serviceId: string): ServiceLabel {
  return SERVICE_LABELS[serviceId] ?? { en: serviceId, hi: serviceId };
}

/**
 * What each service gives the pump, in plain words, both languages. Keyed by
 * service id. Read by the services card in the dealer app (onboarding v2) and
 * by the chat assistant's catalogue (`brief/about.ts`), so a service is
 * described one way everywhere.
 *
 * The rules these lines keep, because the assistant repeats them and its fence
 * checks every word: NO DIGITS, NO PRICES, NO TERMS, NO TIMES, and no method
 * beyond "MDG's team does it" — never software, automation or schedules.
 */
export const SERVICE_ABOUT: Readonly<Record<string, { en: string; hi: string }>> = {
  // Not "stock variation sheet": the fence refuses the word "variation" unless the
  // turn holds that sheet's figures, and a description it cannot see past would
  // only manufacture refusals. The DSR card shows the second sheet itself.
  'dsr-report': {
    en: "the day's sales and the stock in the tanks, as two sheets every day",
    hi: 'दिन की बिक्री और टंकी का स्टॉक, रोज़ दो शीट में',
  },
  'credit-dod-monitoring': {
    en: "how much has to reach IndianOil's account, and by when",
    hi: 'इंडियन ऑयल के खाते में कितना जमा करना है, और कब तक',
  },
  'water-ingress-testing': {
    en: 'the tank water checks, kept up to date on time',
    hi: 'टैंक में पानी की जाँच, समय पर अपडेट',
  },
  'tt-density': {
    en: "the density register: the day's page, and the density of each tanker",
    hi: 'डेंसिटी रजिस्टर: रोज़ का पन्ना, और हर टैंकर की डेंसिटी',
  },
  'ro-supply-status': {
    en: 'whether supply to the pump is open, and what to do if it stops',
    hi: 'पंप की सप्लाई खुली है या नहीं, और रुके तो क्या करना है',
  },
  'inspection-reports': {
    en: "the pump's inspection reports, kept in one place",
    hi: 'पंप की इंस्पेक्शन रिपोर्ट, एक जगह',
  },
  'load-planner': {
    en: 'when to order the next tanker, planned a few days ahead',
    hi: 'अगला टैंकर कब मंगाना है, कुछ दिन पहले से योजना',
  },
  'iras-shift-data': {
    en: 'the readings of every shift, which the daily sales report is built from',
    hi: 'हर शिफ्ट की रीडिंग, जिससे रोज़ की बिक्री रिपोर्ट बनती है',
  },
  'custom-request': {
    en: 'any other piece of work the owner asks MDG for',
    hi: 'कोई भी और काम जो मालिक MDG से करवाना चाहें',
  },
};
