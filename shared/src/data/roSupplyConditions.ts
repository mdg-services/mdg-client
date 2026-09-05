/**
 * The RDB/SDMS supply conditions, in words a dealer can act on.
 *
 * The portal names each condition in its own clipped English — "Pending OTP",
 * "DU/Tank Not Comunicated in 24 hrs" — which tells a dealer WHAT is wrong and
 * nothing about what to do. This is the missing half: the Hindi for the term,
 * and the one thing that clears it.
 *
 * WHY IT LIVES IN SHARED
 * ----------------------
 * Two surfaces say it and they must not drift: the PNG an admin shares with the
 * dealer, and the admin's own panel while they are on the phone about it. Put
 * the copy in one of those two and the other quietly grows a second version.
 *
 * MATCHING IS TOLERANT ON PURPOSE
 * -------------------------------
 * The portal's own spelling carries typos — "Quaterly", "Comunicated" — and they
 * are part of the string it serves, so they are matched, not corrected. A
 * condition we do not recognise still renders: it keeps the portal's wording and
 * simply carries no Hindi and no action line. A new condition must degrade to
 * "here is what the portal said", never disappear.
 */

/** One condition the portal can hold against an outlet. */
export interface RoSupplyConditionCopy {
  /** The portal's own wording, verbatim, typos included. */
  portal: string;
  /**
   * What it means when it is NOT clear, in Hindi. The portal names every
   * condition as a problem, so this is that problem said in Hindi.
   */
  hi: string;
  /**
   * What it means when it IS clear — a separate string, not a negation of the
   * one above, because the portal's labels are already negative and ticking a
   * negative inverts it.
   *
   * The first rendered card made exactly that mistake: the cleared chips read
   * "✓ ऑटोमेशन का डेटा पोर्टल तक नहीं पहुँचा" — a green tick beside "the
   * automation data did not arrive" — which confirms the fault instead of
   * clearing it. On a card whose whole job is telling a dealer what is wrong,
   * that is the worst bug available, and it is invisible to anyone reviewing it
   * who does not read Hindi.
   */
  okHi: string;
  /** The one thing that clears it — English. Omitted when we cannot say honestly. */
  actionEn?: string;
  /** The same, in Hindi. */
  actionHi?: string;
}

/**
 * The seven conditions attested on a live screen (5 Sep 2026, outlets 258672 and
 * 245878). Order is the portal's own.
 */
export const RO_SUPPLY_CONDITIONS: readonly RoSupplyConditionCopy[] = [
  {
    portal: 'Automation data not received',
    hi: 'ऑटोमेशन का डेटा पोर्टल तक नहीं पहुँचा',
    okHi: 'ऑटोमेशन का डेटा पहुँच रहा है',
    actionEn: 'Get the automation link at the pump working again — your vendor fixes this.',
    actionHi: 'पंप पर ऑटोमेशन दोबारा चालू कराएँ — यह आपका ऑटोमेशन वेंडर ठीक करता है।',
  },
  {
    portal: 'Pending OTP',
    hi: 'कोई OTP मंज़ूरी बाक़ी है',
    okHi: 'कोई OTP बाक़ी नहीं',
    actionEn: 'Approve the pending OTP on the portal.',
    actionHi: 'पोर्टल पर रुका हुआ OTP मंज़ूर करें।',
  },
  {
    portal: 'Blocked in SDMS-DAR',
    hi: 'SDMS-DAR में रोक लगी है',
    okHi: 'SDMS-DAR में कोई रोक नहीं',
    actionEn: 'Take this up with your Sales Officer — the block is set on their side.',
    actionHi: 'अपने सेल्स ऑफ़िसर से बात करें — यह रोक उनकी तरफ़ से लगी है।',
  },
  {
    portal: 'DU/Tank Not Comunicated in 24 hrs',
    hi: '24 घंटे से मशीन/टंकी का डेटा नहीं गया',
    okHi: 'मशीन और टंकी का डेटा जा रहा है',
    actionEn: 'Check that every dispensing unit and tank is reporting again.',
    actionHi: 'देखें कि हर मशीन और टंकी दोबारा डेटा भेज रही है।',
  },
  {
    portal: 'Quaterly Mock Drill Not Conducted',
    hi: 'तिमाही मॉक ड्रिल नहीं हुई',
    okHi: 'तिमाही मॉक ड्रिल हो चुकी है',
    actionEn: 'Conduct the quarterly mock drill and file the declaration on the portal.',
    actionHi: 'तिमाही मॉक ड्रिल कराएँ और पोर्टल पर घोषणा दर्ज करें।',
  },
  {
    portal: 'Electrical Audit Non-Compliance',
    hi: 'बिजली ऑडिट की कमियाँ पूरी नहीं हुईं',
    okHi: 'बिजली ऑडिट की कमियाँ पूरी हैं',
    actionEn: 'Close the electrical audit points and upload the proof.',
    actionHi: 'बिजली ऑडिट में बताई कमियाँ ठीक कराकर प्रमाण अपलोड करें।',
  },
  {
    portal: 'RO not in Auto',
    hi: 'पंप ऑटोमेशन पर नहीं है',
    okHi: 'पंप ऑटोमेशन पर है',
    actionEn: 'Put the outlet back on automation.',
    actionHi: 'पंप को दोबारा ऑटोमेशन पर लाएँ।',
  },
];

/**
 * Strip everything that varies without changing meaning: case, punctuation and
 * runs of whitespace. Not spelling — see the header.
 */
function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const BY_KEY = new Map(RO_SUPPLY_CONDITIONS.map((c) => [normalise(c.portal), c]));

/**
 * The copy for a condition, or `null` when the portal has served one we have
 * never seen.
 *
 * Null is a real answer and the caller must render it: a condition added by
 * IndianOil next month is exactly the one a dealer most needs to be told about,
 * and dropping it because we have no Hindi for it would hide the newest problem.
 */
export function roSupplyConditionCopy(portalDescription: string): RoSupplyConditionCopy | null {
  return BY_KEY.get(normalise(portalDescription)) ?? null;
}
