/**
 * What each IndianOil SAP material code IS, as printed on a tanker invoice.
 *
 * The invoice names a product twice and neither name is ours: a five-digit SAP
 * material code (`16730`) and a short description (`EBMS`, `HSD-BSVI`). Neither
 * is the vocabulary the rest of this platform speaks, which is the DSR's product
 * key — `MS`, `HSD`, `XP`, `XG` — reached from the IRAS product codes in
 * `../dsr/products`. This table is the bridge, and it deliberately produces the
 * SAME key, so a figure read off an invoice and a figure read off IRAS can be
 * put beside each other later without either table changing shape.
 *
 * WHY IT DEGRADES INSTEAD OF FAILING
 * ----------------------------------
 * We have evidence for exactly two material codes, both from one real invoice:
 * 16730 = EBMS = Ethanol Blended Motor Spirit = ordinary petrol, and
 * 50700 = HSD-BSVI = diesel. XtraPremium, XtraGreen, and whatever IndianOil
 * numbers next are unknown to us today. An outlet whose premium nozzle stopped
 * their density figures from being read at all would be a worse failure than one
 * whose figure is labelled by the words the invoice itself used — so an
 * unrecognised code falls back to a description ladder, and an unrecognised
 * description still yields a complete profile keyed by the description, marked
 * {@link TtProductProfile.provisional} so a screen can ask a human for the name.
 * This is the same philosophy, and deliberately the same wording, as
 * `dsrProductProfile` in `../dsr/products`.
 *
 * Add a row only with evidence — a real invoice naming the grade. A guessed
 * label prints beside a number a dealer copies into their register.
 */
import type { DsrProductFamily } from '../dsr/products';

/** What a material code is, once resolved. */
export interface TtProductProfile {
  /** The SAP material code exactly as the invoice printed it, e.g. `16730`. */
  materialCode: string;
  /** The invoice's own short description, verbatim, e.g. `HSD-BSVI`. */
  description: string;
  /**
   * The platform-wide product key. Deliberately the same vocabulary as
   * `DsrProductProfile.key` so the two catalogs join.
   */
  key: string;
  labelEn: string;
  labelHi: string;
  family: DsrProductFamily;
  /**
   * True when neither the code nor the description was recognised and everything
   * here is a placeholder a human should confirm.
   */
  provisional: boolean;
}

/** Material codes seen on a real invoice. Both from `7010045406.pdf`, 22-Aug-26. */
const MATERIAL_CATALOG: Record<
  string,
  Omit<TtProductProfile, 'materialCode' | 'description' | 'provisional'>
> = {
  /** Ethanol Blended Motor Spirit — ordinary petrol. Verified: 727.300 kg/m³. */
  '16730': { key: 'MS', labelEn: 'MOTOR SPIRIT', labelHi: 'मोटर स्पिरीट', family: 'PETROL' },
  /** High Speed Diesel, BS-VI. Verified: 820.500 kg/m³. */
  '50700': {
    key: 'HSD',
    labelEn: 'HIGH SPEED DIESEL',
    labelHi: 'हाई स्पीड डीजल',
    family: 'DIESEL',
  },
};

/**
 * The description ladder, tried when the material code is unknown.
 *
 * ORDER IS LOAD-BEARING and runs most-specific first. A branded grade's
 * description contains the plain grade's words — "XTRA PREMIUM MS" contains
 * "MS", "XTRAGREEN DIESEL" contains "DIESEL" — so testing MS or HSD first would
 * label every premium grade as the ordinary one, silently, on a figure a dealer
 * reads. The premium patterns therefore lead.
 */
const DESCRIPTION_LADDER: readonly {
  re: RegExp;
  profile: Omit<TtProductProfile, 'materialCode' | 'description' | 'provisional'>;
}[] = [
  {
    re: /xtra\s*-?\s*premium|^xp\b/i,
    profile: { key: 'XP', labelEn: 'XTRAPREMIUM', labelHi: 'एक्स्ट्रा प्रीमियम', family: 'PETROL' },
  },
  {
    re: /xtra\s*-?\s*green|^xg\b/i,
    profile: { key: 'XG', labelEn: 'XTRAGREEN', labelHi: 'एक्स्ट्रा ग्रीन', family: 'DIESEL' },
  },
  {
    re: /^hsd\b|high\s*speed\s*diesel/i,
    profile: {
      key: 'HSD',
      labelEn: 'HIGH SPEED DIESEL',
      labelHi: 'हाई स्पीड डीजल',
      family: 'DIESEL',
    },
  },
  {
    re: /^ebms\b|^ms\b|motor\s*spirit|petrol/i,
    profile: { key: 'MS', labelEn: 'MOTOR SPIRIT', labelHi: 'मोटर स्पिरीट', family: 'PETROL' },
  },
];

/** Every material code this table knows, for display and validation. */
export const TT_KNOWN_MATERIAL_CODES = Object.keys(MATERIAL_CATALOG);

/**
 * The profile for one invoice line, inventing a provisional one when neither the
 * material code nor the description is recognised, so a reading is never lost.
 */
export function ttProductProfile(materialCode: string, description: string): TtProductProfile {
  const code = String(materialCode ?? '').trim();
  const desc = String(description ?? '').trim();

  const byCode = MATERIAL_CATALOG[code];
  if (byCode) return { materialCode: code, description: desc, provisional: false, ...byCode };

  for (const entry of DESCRIPTION_LADDER) {
    if (entry.re.test(desc)) {
      // Recognised by words rather than by number: the grade is known, the code
      // is not. `provisional` stays false — the label is right — but the code is
      // worth adding to the catalog next time somebody has the invoice in hand.
      return { materialCode: code, description: desc, provisional: false, ...entry.profile };
    }
  }

  // The description itself is the least surprising placeholder: it is what
  // IndianOil calls the grade and what the dealer's own staff will recognise.
  const fallback = desc || code || 'UNKNOWN';
  return {
    materialCode: code,
    description: desc,
    key: fallback,
    labelEn: fallback,
    labelHi: fallback,
    family: 'UNKNOWN',
    provisional: true,
  };
}
