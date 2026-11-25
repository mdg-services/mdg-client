/**
 * The supply conditions in all three dealer languages (Hindi, Hinglish, English), shared
 * by the card an admin shares and the app's own report view (ADR 0056), so the two can
 * never word a condition differently.
 *
 * Hindi lives in `data/roSupplyConditions.ts` (with the English action) and is not
 * copied here. This file holds what that one lacked: the Hinglish, and the plain English
 * of the problem and of "clear". Every table is keyed by the PORTAL's own wording, typos
 * included, and matched through `roSupplyConditionCopy`, so the languages cannot disagree
 * about which condition a row is.
 *
 * A condition IndianOil adds later has Hindi/English action in the shared list at best and
 * no Hinglish yet: `roSupplyConditionWords` then says what it honestly can (the portal's
 * words, the English action) and never invents a meaning.
 */
import { roSupplyConditionCopy } from '../data/roSupplyConditions';
import type { RoSupplyCond } from '../types/reportData';

/** The three languages a dealer reads. */
export type RoSupplyWordLang = 'hi' | 'hl' | 'en';

/** One condition said in one language. */
export interface RoSupplyConditionWords {
  /** What is wrong, said as the problem. Empty when the condition's meaning is not known in this language. */
  problem: string;
  /** What it means when it is clear. A separate sentence: the portal's labels are negative, ticking one must not invert it. */
  ok: string;
  /** The one thing that clears it, or null when we cannot say honestly. */
  action: string | null;
}

/** The portal's own wording of each known condition, by the code the snapshot carries. */
export const RO_SUPPLY_COND_PORTALS: Readonly<Record<Exclude<RoSupplyCond, 'other'>, string>> = {
  automation_data: 'Automation data not received',
  pending_otp: 'Pending OTP',
  sdms_dar_block: 'Blocked in SDMS-DAR',
  du_tank_comm: 'DU/Tank Not Comunicated in 24 hrs',
  mock_drill: 'Quaterly Mock Drill Not Conducted',
  electrical_audit: 'Electrical Audit Non-Compliance',
  ro_not_auto: 'RO not in Auto',
};

const CONDITION_WORDS_HL_EN: Record<string, Record<'hl' | 'en', { problem: string; ok: string; action: string }>> = {
  'Automation data not received': {
    hl: {
      problem: 'Automation ka data portal tak nahi pahuncha',
      ok: 'Automation ka data pahunch raha hai',
      action: 'Pump par automation dobara chalu karaiye — yeh aapka automation vendor theek karta hai.',
    },
    en: {
      problem: 'Automation data has not reached the portal',
      ok: 'Automation data is reaching the portal',
      action: 'Get the automation link at the pump working again — your vendor fixes this.',
    },
  },
  'Pending OTP': {
    hl: {
      problem: 'Koi OTP manzoori baaki hai',
      ok: 'Koi OTP baaki nahi',
      action: 'Portal par ruka hua OTP manzoor kijiye.',
    },
    en: {
      problem: 'An OTP approval is pending',
      ok: 'No OTP pending',
      action: 'Approve the pending OTP on the portal.',
    },
  },
  'Blocked in SDMS-DAR': {
    hl: {
      problem: 'SDMS-DAR mein rok lagi hai',
      ok: 'SDMS-DAR mein koi rok nahi',
      action: 'Apne Sales Officer se baat kijiye — yeh rok unki taraf se lagi hai.',
    },
    en: {
      problem: 'A block is set in SDMS-DAR',
      ok: 'No block in SDMS-DAR',
      action: 'Take this up with your Sales Officer — the block is set on their side.',
    },
  },
  'DU/Tank Not Comunicated in 24 hrs': {
    hl: {
      problem: '24 ghante se machine/tank ka data nahi gaya',
      ok: 'Machine aur tank ka data ja raha hai',
      action: 'Dekhiye ki har machine aur tank dobara data bhej raha hai.',
    },
    en: {
      problem: 'No machine/tank data for 24 hours',
      ok: 'Machine and tank data is reaching the portal',
      action: 'Check that every dispensing unit and tank is reporting again.',
    },
  },
  'Quaterly Mock Drill Not Conducted': {
    hl: {
      problem: 'Teen mahine wali mock drill nahi hui',
      ok: 'Teen mahine wali mock drill ho chuki hai',
      action: 'Teen mahine wali mock drill karaiye aur portal par declaration bhariye.',
    },
    en: {
      problem: 'The quarterly mock drill has not been done',
      ok: 'The quarterly mock drill is done',
      action: 'Conduct the quarterly mock drill and file the declaration on the portal.',
    },
  },
  'Electrical Audit Non-Compliance': {
    hl: {
      problem: 'Bijli audit ki kamiyan poori nahi hui',
      ok: 'Bijli audit ki kamiyan poori hain',
      action: 'Bijli audit mein batayi kamiyan theek karakar proof upload kijiye.',
    },
    en: {
      problem: 'Electrical audit points are still open',
      ok: 'Electrical audit points are closed',
      action: 'Close the electrical audit points and upload the proof.',
    },
  },
  'RO not in Auto': {
    hl: {
      problem: 'Pump automation par nahi hai',
      ok: 'Pump automation par hai',
      action: 'Pump ko dobara automation par laiye.',
    },
    en: {
      problem: 'The outlet is not on automation',
      ok: 'The outlet is on automation',
      action: 'Put the outlet back on automation.',
    },
  },
};
/**
 * One condition in the reader's language, or null for a condition we have never seen
 * (the caller then shows the portal's own words).
 */
export function roSupplyConditionWords(portal: string, lang: RoSupplyWordLang): RoSupplyConditionWords | null {
  const copy = roSupplyConditionCopy(portal);
  if (!copy) return null;
  if (lang === 'hi') return { problem: copy.hi, ok: copy.okHi, action: copy.actionHi ?? null };
  const w = CONDITION_WORDS_HL_EN[copy.portal]?.[lang];
  if (w) return w;
  // A condition added to the shared list before its words were written here: the English
  // action is honest in English letters; the meaning is not known.
  return { problem: '', ok: portal, action: copy.actionEn ?? null };
}

/** The same, from the code a report snapshot carries; `other` has no words of ours. */
export function roSupplyConditionWordsOf(cond: RoSupplyCond, lang: RoSupplyWordLang): RoSupplyConditionWords | null {
  return cond === 'other' ? null : roSupplyConditionWords(RO_SUPPLY_COND_PORTALS[cond], lang);
}
