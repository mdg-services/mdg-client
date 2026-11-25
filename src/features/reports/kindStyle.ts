import {
  Banknote,
  BookOpen,
  CalendarClock,
  CircleDollarSign,
  ClipboardCheck,
  Construction,
  Cylinder,
  Droplets,
  IdCard,
  LockKeyholeOpen,
  Mail,
  PackageCheck,
  ReceiptText,
  Scale,
  ShieldCheck,
  Stamp,
  Table2,
  Timer,
  Truck,
  type LucideIcon,
} from 'lucide-react';

import type { ReportKind } from '@dk/shared/types';

import type { Words } from './types';

/**
 * One look per kind (ADR 0056 §2): the family colour, its soft tint, the lucide icon, the
 * name and the chat button's words, and the family group the history chips use.
 *
 * The colours are the ADR's table (white text on `color` is >= 7:1). The same values are
 * Tailwind tokens (`bg-kind-dsr`, `bg-kind-dsr-soft`, `text-kind-dsr-ink`, with a dark pair
 * in `index.css`); use the tokens in class names and these hex values where a style must be
 * computed in code (an SVG fill, a chart). A family colour is never red, amber or green,
 * so a family can never be mistaken for a status.
 */

/** The twelve colour families; each is a Tailwind token `kind-<family>`. */
export type KindFamily =
  | 'dsr'
  | 'stock'
  | 'tanker'
  | 'credit'
  | 'ledger'
  | 'claim'
  | 'water'
  | 'supply'
  | 'paper'
  | 'paperwork'
  | 'kavach'
  | 'news';

/** The groups of the Reports tab's filter chips. */
export type KindGroup = 'sales_stock' | 'tanker' | 'money' | 'water_supply' | 'papers' | 'mdg';

export interface FamilyColors {
  /** The header band and icon circle; white text on it. */
  color: string;
  /** The tint behind a drawing; text in `color` on it. */
  soft: string;
}

export const KIND_FAMILIES: Record<KindFamily, FamilyColors> = {
  dsr: { color: '#1e3a8a', soft: '#e0e7ff' },
  stock: { color: '#075985', soft: '#e0f2fe' },
  tanker: { color: '#155e75', soft: '#cffafe' },
  credit: { color: '#3730a3', soft: '#e0e7ff' },
  ledger: { color: '#5b21b6', soft: '#ede9fe' },
  claim: { color: '#6d28d9', soft: '#ede9fe' },
  water: { color: '#115e59', soft: '#ccfbf1' },
  supply: { color: '#334155', soft: '#e2e8f0' },
  paper: { color: '#3f3f46', soft: '#e4e4e7' },
  paperwork: { color: '#86198f', soft: '#fae8ff' },
  kavach: { color: '#18181b', soft: '#f4f4f5' },
  news: { color: '#44403c', soft: '#e7e5e4' },
};

export interface KindStyle {
  family: KindFamily;
  /** `KIND_FAMILIES[family].color`, repeated so a kind reads in one place. */
  color: string;
  /** `KIND_FAMILIES[family].soft`. */
  soft: string;
  Icon: LucideIcon;
  /** The report's name, as it is printed in the overlay header and the history row. */
  names: Words;
  /**
   * The button under the team's chat sentence. It is the report's own name (`names`, without a
   * bracketed tag such as "(DSR)") with a verb, so a dealer who taps blindly knows which report it
   * is: the header, the tile and the history row all say the same words. The chevron is part of the
   * label.
   */
  button: Words;
  group: KindGroup;
}

function style(
  family: KindFamily,
  Icon: LucideIcon,
  group: KindGroup,
  names: Words,
  button: Words,
): KindStyle {
  return { family, ...KIND_FAMILIES[family], Icon, group, names, button };
}

export const KIND_STYLE: Record<ReportKind, KindStyle> = {
  dsr_sales: style(
    'dsr',
    Table2,
    'sales_stock',
    { hi: 'बिक्री रिपोर्ट (DSR)', hl: 'Bikri report (DSR)', en: 'Daily sales (DSR)' },
    { hi: 'बिक्री रिपोर्ट देखें', hl: 'Bikri report dekhein', en: 'See sales report' },
  ),
  dsr_variation: style(
    'dsr',
    Scale,
    'sales_stock',
    { hi: 'स्टॉक फ़र्क', hl: 'Stock farak (variation)', en: 'Stock variation' },
    { hi: 'स्टॉक फ़र्क देखें', hl: 'Stock farak dekhein', en: 'See stock variation' },
  ),
  stock_check: style(
    'stock',
    Cylinder,
    'sales_stock',
    { hi: 'टंकी का स्टॉक', hl: 'Tanki ka stock', en: 'Tank stock' },
    { hi: 'टंकी का स्टॉक देखें', hl: 'Tanki ka stock dekhein', en: 'See tank stock' },
  ),
  load_plan: style(
    'tanker',
    Truck,
    'tanker',
    { hi: 'अगला टैंकर', hl: 'Agla tanker', en: 'Next tanker plan' },
    { hi: 'अगला टैंकर देखें', hl: 'Agla tanker dekhein', en: 'See next tanker plan' },
  ),
  tanker_density: style(
    'tanker',
    IdCard,
    'tanker',
    { hi: 'टैंकर डेंसिटी', hl: 'Tanker density', en: 'Tanker density' },
    { hi: 'टैंकर डेंसिटी देखें', hl: 'Tanker density dekhein', en: 'See tanker density' },
  ),
  tt_ack: style(
    'tanker',
    ReceiptText,
    'tanker',
    { hi: 'टैंकर रसीद', hl: 'Tanker receipt', en: 'Tanker receipt' },
    { hi: 'टैंकर रसीद देखें', hl: 'Tanker receipt dekhein', en: 'See tanker receipt' },
  ),
  fuel_order: style(
    'tanker',
    PackageCheck,
    'tanker',
    { hi: 'फ्यूल ऑर्डर', hl: 'Fuel order', en: 'Fuel order' },
    { hi: 'फ्यूल ऑर्डर देखें', hl: 'Fuel order dekhein', en: 'See fuel order' },
  ),
  credit_dod: style(
    'credit',
    CircleDollarSign,
    'money',
    { hi: 'उधार और DOD', hl: 'Credit aur DOD', en: 'Credit & DOD' },
    { hi: 'उधार और DOD देखें', hl: 'Credit aur DOD dekhein', en: 'See Credit & DOD' },
  ),
  ledger_watch: style(
    'ledger',
    BookOpen,
    'money',
    { hi: 'खाते की दूसरी एंट्री', hl: 'Khate ki dusri entry', en: 'Other ledger entries' },
    { hi: 'खाते की दूसरी एंट्री देखें', hl: 'Khate ki dusri entry dekhein', en: 'See other ledger entries' },
  ),
  calibration_claim: style(
    'claim',
    Banknote,
    'money',
    { hi: 'कैलिब्रेशन सब्सिडी', hl: 'Calibration subsidy', en: 'Calibration subsidy' },
    { hi: 'कैलिब्रेशन सब्सिडी देखें', hl: 'Calibration subsidy dekhein', en: 'See calibration subsidy' },
  ),
  water_ingress: style(
    'water',
    Droplets,
    'water_supply',
    { hi: 'टंकी में पानी जाँच', hl: 'Tanki mein paani jaanch', en: 'Water checks' },
    { hi: 'टंकी में पानी जाँच देखें', hl: 'Tanki mein paani jaanch dekhein', en: 'See water checks' },
  ),
  ro_supply: style(
    'supply',
    Construction,
    'water_supply',
    { hi: 'सप्लाई स्टेटस', hl: 'Supply status', en: 'Supply status' },
    { hi: 'सप्लाई स्टेटस देखें', hl: 'Supply status dekhein', en: 'See supply status' },
  ),
  du_otp: style(
    'supply',
    LockKeyholeOpen,
    'water_supply',
    { hi: 'DU OTP', hl: 'DU OTP', en: 'DU OTP' },
    { hi: 'DU OTP देखें', hl: 'DU OTP dekhein', en: 'See DU OTP' },
  ),
  declaration_filed: style(
    'paperwork',
    Stamp,
    'papers',
    { hi: 'घोषणा जमा', hl: 'Declaration jama', en: 'Declaration filed' },
    { hi: 'घोषणा जमा देखें', hl: 'Declaration jama dekhein', en: 'See declaration filed' },
  ),
  mock_drill: style(
    'paperwork',
    Timer,
    'papers',
    { hi: 'मॉक ड्रिल', hl: 'Mock drill', en: 'Mock drill' },
    { hi: 'मॉक ड्रिल देखें', hl: 'Mock drill dekhein', en: 'See mock drill' },
  ),
  electrical_audit: style(
    'paperwork',
    ClipboardCheck,
    'papers',
    { hi: 'इलेक्ट्रिकल ऑडिट', hl: 'Electrical audit', en: 'Electrical audit' },
    { hi: 'इलेक्ट्रिकल ऑडिट देखें', hl: 'Electrical audit dekhein', en: 'See electrical audit' },
  ),
  paper_expiry: style(
    'paper',
    CalendarClock,
    'papers',
    { hi: 'कागज़ खत्म होने वाले', hl: 'Kagaz khatam hone wale', en: 'Papers running out' },
    { hi: 'कागज़ खत्म होने वाले देखें', hl: 'Kagaz khatam hone wale dekhein', en: 'See papers running out' },
  ),
  kavach: style(
    'kavach',
    ShieldCheck,
    'mdg',
    { hi: 'कवच स्कोर', hl: 'Kavach score', en: 'Kavach score' },
    { hi: 'कवच स्कोर देखें', hl: 'Kavach score dekhein', en: 'See Kavach score' },
  ),
  announcement: style(
    'news',
    Mail,
    'mdg',
    { hi: 'MDG की सूचना', hl: 'MDG ki soochna', en: 'News from MDG' },
    { hi: 'MDG की सूचना खोलें', hl: 'MDG ki soochna kholein', en: 'Open news from MDG' },
  ),
};

/** The style of a kind. */
export function kindStyle(kind: ReportKind): KindStyle {
  return KIND_STYLE[kind];
}

/** The filter chips of the Reports tab, in order: each with its name and its kinds. */
export const KIND_GROUPS: ReadonlyArray<{ group: KindGroup; names: Words; kinds: readonly ReportKind[] }> = [
  {
    group: 'sales_stock',
    names: { hi: 'बिक्री और स्टॉक', hl: 'Bikri aur stock', en: 'Sales & stock' },
    kinds: ['dsr_sales', 'dsr_variation', 'stock_check'],
  },
  {
    group: 'tanker',
    names: { hi: 'टैंकर', hl: 'Tanker', en: 'Tanker' },
    kinds: ['load_plan', 'fuel_order', 'tanker_density', 'tt_ack'],
  },
  {
    group: 'money',
    names: { hi: 'पैसा', hl: 'Paisa', en: 'Money' },
    kinds: ['credit_dod', 'ledger_watch', 'calibration_claim'],
  },
  {
    group: 'water_supply',
    names: { hi: 'पानी और सप्लाई', hl: 'Paani aur supply', en: 'Water & supply' },
    kinds: ['water_ingress', 'ro_supply', 'du_otp'],
  },
  {
    group: 'papers',
    names: { hi: 'कागज़ और फाइलिंग', hl: 'Kagaz aur filing', en: 'Papers & filings' },
    kinds: ['declaration_filed', 'mock_drill', 'electrical_audit', 'paper_expiry'],
  },
  {
    group: 'mdg',
    names: { hi: 'MDG', hl: 'MDG', en: 'MDG' },
    kinds: ['kavach', 'announcement'],
  },
];

/** The "All" chip's name. */
export const ALL_GROUP_NAME: Words = { hi: 'सभी', hl: 'Sab', en: 'All' };

/** The kinds of one group, for `GET /me/reports?kinds=`. */
export function kindsOfGroup(group: KindGroup): readonly ReportKind[] {
  return KIND_GROUPS.find((g) => g.group === group)?.kinds ?? [];
}
